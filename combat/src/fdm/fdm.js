// Six-degree-of-freedom F-14 flight dynamics. SI units, NED world frame, body frame x fwd, y right, z down.
// Rigid-body equations integrated with RK4. Aerodynamics in f14_aero.js, engines in engine.js.
//
// Mass properties: NASA TM-81833 Table I (48,531 lb: Ix 66,120, Iy 265,681, Iz 327,689, Ixz -2,537 slug ft^2),
// scaled with weight. Control limits and actuator rates also from TM-81833:
//   stabilator +10 / -33 deg at 36 deg/s, differential tail +/-7 deg mechanical + 5 deg SAS,
//   rudder +/-30 deg at 106 deg/s, spoilers 150 deg/s, surface actuators first-order 0.05 s.
import { coefficients, wingSpanFt } from './f14_aero.js';
import { Engine, MIL_DETENT } from './engine.js';
import { isa, FT, LB, LBM, SLUGFT2, DEG } from './atmosphere.js';

const G = 9.80665;
const S = 565 * FT * FT, CBAR = 9.8 * FT, B = 64.1 * FT;

// --- small quaternion / vector helpers (q = [w, x, y, z], body -> world) ---
export function qmul(a, b) {
  return [a[0]*b[0]-a[1]*b[1]-a[2]*b[2]-a[3]*b[3], a[0]*b[1]+a[1]*b[0]+a[2]*b[3]-a[3]*b[2],
          a[0]*b[2]-a[1]*b[3]+a[2]*b[0]+a[3]*b[1], a[0]*b[3]+a[1]*b[2]-a[2]*b[1]+a[3]*b[0]];
}
export function qrot(q, v) { // rotate body vector into world
  const [w, x, y, z] = q, [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy), ty = 2 * (z * vx - x * vz), tz = 2 * (x * vy - y * vx);
  return [vx + w * tx + (y * tz - z * ty), vy + w * ty + (z * tx - x * tz), vz + w * tz + (x * ty - y * tx)];
}
export function qinvrot(q, v) { return qrot([q[0], -q[1], -q[2], -q[3]], v); }
export function qnorm(q) { const n = Math.hypot(...q); return q.map((c) => c / n); }
export function qFromEuler(phi, theta, psi) {
  const cr = Math.cos(phi / 2), sr = Math.sin(phi / 2), cp = Math.cos(theta / 2), sp = Math.sin(theta / 2);
  const cy = Math.cos(psi / 2), sy = Math.sin(psi / 2);
  return [cr*cp*cy + sr*sp*sy, sr*cp*cy - cr*sp*sy, cr*sp*cy + sr*cp*sy, cr*cp*sy - sr*sp*cy];
}
export function qToEuler(q) {
  const [w, x, y, z] = q;
  const phi = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const theta = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
  const psi = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return { phi, theta, psi };
}
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
const mul = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
const dot = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// Landing gear and contact points, body frame metres from the CG (EST from F-14 drawings:
// wheelbase 7.0 m, track 5.0 m, CG about 2.0 m above the ground on the gear).
export const GEAR = [
  { name: 'nose', p: [6.25, 0, 2.05], k: 2.4e5, c: 3.2e4, stroke: 0.45, steer: true },
  { name: 'left', p: [-0.75, -2.5, 2.05], k: 5.2e5, c: 6.5e4, stroke: 0.55 },
  { name: 'right', p: [-0.75, 2.5, 2.05], k: 5.2e5, c: 6.5e4, stroke: 0.55 },
];
// Hard points that mean a crash if they touch: nose tip, tails, belly, wingtips at 20 deg sweep.
const HARD = [[9.5, 0, 0.6], [-9.0, 0, -0.2], [2.0, 0, 1.2], [-2.0, -9.6, 0.4], [-2.0, 9.6, 0.4], [-8.3, -2.6, -2.9], [-8.3, 2.6, -2.9]];
// Scrape points: touching these damages the jet (NATOPS warns of ventral fin and nozzle damage above 17 units)
// but is not a crash by itself.
const SCRAPE = [[-5.2, -1.35, 1.45], [-5.2, 1.35, 1.45], [-9.4, -1.35, 1.05], [-9.4, 1.35, 1.05]];
export const HOOK_POINT = [-7.9, 0, 1.55]; // tailhook tip when down (EST)
export const EYE_POINT = [4.98, 0, -1.12];  // pilot eye, at the front-seat helmet in the model (EST)

const EMPTY_KG = 44531 * LBM; // TM-81833 operating empty weight
export const FUEL_MAX_KG = 16200 * LBM; // F-14A internal fuel (published)

export class F14 {
  constructor() {
    this.engL = new Engine(); this.engR = new Engine();
    this.reset({});
  }
  reset({ pos = [0, 0, -1500], V = 150, heading = 0, pitch = 0, fuelKg = 7000, onGround = false }) {
    this.pos = pos.slice();
    this.q = qFromEuler(0, pitch, heading);
    this.vel = [V, 0, 0]; // body
    this.omega = [0, 0, 0];
    this.fuel = fuelKg;
    this.sweep = 20;
    this.surf = { ds: -4, da: 0, dr: 0, sp: 0 };
    this.ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7, trim: 0, brake: 0, flaps: 0, gear: 0,
                 hook: 0, speedbrake: 0, dlc: 0, sweepMode: 'auto', sweepManual: 20 };
    this.flaps = 0; this.slats = 0; this.gear = 0; this.hookPos = 0; this.speedbrake = 0;
    this.qwash = 0; this.rwash = 0;
    this.extForce = [0, 0, 0]; this.extMoment = [0, 0, 0]; // world force at CG, body moment (hook, cat)
    this.contacts = GEAR.map(() => ({ on: false, comp: 0, compDot: 0, load: 0 }));
    this.crashed = false; this.crashReason = ''; this.gearBroken = false; this.onGround = onGround; this.scrapes = 0; this.scraping = false;
    this.maxG = 1; this.nz = 1; this.t = 0;
    this.lastTouchSink = 0;
    for (const e of [this.engL, this.engR]) { e.T = onGround ? 4000 : 40000; e.Tdot = 0; e.ab = 0; }
    this.air = isa(-this.pos[2]);
    this.updateDerived();
  }
  get mass() { return EMPTY_KG + this.fuel; }

  inertia() {
    const k = this.mass / (48531 * LBM);
    const span = wingSpanFt(this.sweep) / 64.13;
    const Ix = 66120 * SLUGFT2 * k * (0.55 + 0.45 * span * span);
    return { Ix, Iy: 265681 * SLUGFT2 * k, Iz: 327689 * SLUGFT2 * k * (0.9 + 0.1 * span * span), Ixz: -2537 * SLUGFT2 * k };
  }

  // Flight control system: stick, pedals and SAS to surface commands (EST gains).
  fcs(dt) {
    const c = this.ctl, V = Math.max(this.V, 30);
    const qd = this.omega[1] / DEG, pd = this.omega[0] / DEG, rd = this.omega[2] / DEG;
    // Pitch: full aft stick -33 deg (TEU), full forward +10 deg. Trim adds a bias.
    let ds = (c.pitch >= 0 ? -33 * c.pitch : -10 * c.pitch) + c.trim;
    // Pitch SAS: washed-out pitch-rate damping, +/-3 deg authority (TM-81833).
    this.qwash += (qd - this.qwash) * Math.min(1, dt / 1.5);
    if (!this.sasOff) ds += Math.max(-3, Math.min(3, 0.25 * (qd - this.qwash * 0.3)));
    ds = Math.max(-33, Math.min(10, ds));
    // Roll: differential tail +/-7 mech plus +/-5 SAS, and spoilers.
    let da = (this.sasOff ? 7 : 12) * c.roll - (this.sasOff ? 0 : Math.max(-5, Math.min(5, 0.06 * pd)));
    da = Math.max(-12, Math.min(12, da));
    const sp = this.noSpoilers ? 0 : c.roll;
    // Yaw: +/-30 deg rudder, yaw SAS damper with washout (EST gains).
    this.rwash += (rd - this.rwash) * Math.min(1, dt / 2.0);
    let dr = -30 * c.yaw + (this.sasOff ? 0 : Math.max(-9.5, Math.min(9.5, 0.9 * (rd - this.rwash))));
    dr = Math.max(-30, Math.min(30, dr));
    // Actuators: 0.05 s lag plus rate limits.
    const act = (cur, cmd, rate) => {
      const want = cur + (cmd - cur) * Math.min(1, dt / 0.05);
      return cur + Math.max(-rate * dt, Math.min(rate * dt, want - cur));
    };
    this.surf.ds = act(this.surf.ds, ds, 36);
    this.surf.da = act(this.surf.da, da, 36);
    this.surf.dr = act(this.surf.dr, dr, 106);
    this.surf.sp = act(this.surf.sp, sp, 150 / 55);
    // Secondary systems (EST rates): flaps 4 s full travel, gear 5 s, hook 1.5 s, speedbrake 2 s.
    const move = (cur, cmd, t) => cur + Math.max(-dt / t, Math.min(dt / t, cmd - cur));
    const flapCmd = this.mach > 0.6 ? 0 : c.flaps; // flap blowback above about 225 kt is ignored here
    this.flaps = move(this.flaps, flapCmd, 4);
    this.slats = Math.max(this.flaps > 0.05 ? 1 : 0, this.slats > 0 ? this.slats - dt : 0);
    this.gear = move(this.gear, c.gear, 5);
    this.hookPos = move(this.hookPos, c.hook, 1.5);
    this.speedbrake = move(this.speedbrake, c.speedbrake, 2);
    // Wing sweep: Mach schedule (NATOPS emergency schedule as reference points), 20 deg locked with flaps.
    let sw = sweepSchedule(this.mach);
    if (c.sweepMode === 'manual') sw = Math.max(sw, c.sweepManual);
    if (c.sweepMode === 'oversweep' && this.onGround) sw = 75;
    if (this.flaps > 0.02) sw = 20;
    this.sweep += Math.max(-7 * dt, Math.min(7 * dt, sw - this.sweep)); // EST 7 deg/s
  }

  updateDerived() {
    const air = isa(-this.pos[2]); this.air = air;
    const wind = this.wind || [0, 0, 0];
    const vAir = sub(this.vel, qinvrot(this.q, wind));
    this.vAir = vAir;
    const V = Math.hypot(...vAir); this.V = V;
    this.alpha = Math.atan2(vAir[2], Math.max(1e-3, vAir[0])) / DEG;
    if (vAir[0] < 0) this.alpha = Math.atan2(vAir[2], vAir[0]) / DEG; // tail slide
    this.beta = V > 1 ? Math.asin(Math.max(-1, Math.min(1, vAir[1] / V))) / DEG : 0;
    this.mach = V / air.a;
    this.qbar = 0.5 * air.rho * V * V;
  }

  // Forces and moments for a state; used by the integrator.
  derivatives(st, env) {
    const [pos, vel, q, om] = st;
    const air = isa(-pos[2]);
    const wind = env.wind || [0, 0, 0];
    const vAir = sub(vel, qinvrot(q, wind));
    const V = Math.max(0.1, Math.hypot(...vAir));
    let alpha = Math.atan2(vAir[2], vAir[0]);
    const beta = Math.asin(Math.max(-1, Math.min(1, vAir[1] / V)));
    const mach = V / air.a, qbar = 0.5 * air.rho * V * V;
    const s = this.surf;
    const co = coefficients({ alpha: alpha / DEG, beta: beta / DEG, p: om[0], q: om[1], r: om[2], V, mach,
      sweep: this.sweep, ds: s.ds, da: s.da, dr: s.dr, sp: s.sp, dlc: this.ctl.dlc,
      flaps: this.flaps, slats: this.slats, gear: this.gear, speedbrake: this.speedbrake, xcg: 14 });
    // Ground effect (EST): lift up to +15% and induced drag down within one span of the surface.
    const hAGL = env.agl ? env.agl(pos) : 1e4;
    if (hAGL < B * 0.7) { const ge = 1 - hAGL / (B * 0.7); co.CL *= 1 + 0.06 * ge * ge; }
    const ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sb = Math.sin(beta);
    // Stability-axis lift and drag into body axes.
    const D = qbar * S * co.CD, L = qbar * S * co.CL, Y = qbar * S * co.CY;
    const Fa = [-D * ca * cb + L * sa, Y - D * sb, -D * sa * cb - L * ca];
    const dl = air.p / 101325;
    const thrust = this.engL.thrust(air.sigma, mach, dl) + this.engR.thrust(air.sigma, mach, dl);
    let F = add(Fa, [thrust, 0, 0]);
    let M = [qbar * S * B * co.Cl, qbar * S * CBAR * co.Cm, qbar * S * B * co.Cn];
    // Gravity (world) into body.
    F = add(F, qinvrot(q, [0, 0, this.mass * G]));
    // External forces (hook, catapult), given in world frame at CG plus body moment.
    F = add(F, qinvrot(q, this.extForce)); M = add(M, this.extMoment);
    // Landing gear.
    const gearOut = this.gearForces(pos, vel, q, om, env);
    F = add(F, gearOut.F); M = add(M, gearOut.M);
    // Rigid-body equations.
    const m = this.mass, I = this.inertia();
    const vdot = sub(mul(F, 1 / m), cross(om, vel));
    const [p, qq, r] = om;
    const Lm = M[0], Mm = M[1], Nm = M[2];
    const G1 = I.Ix * I.Iz - I.Ixz * I.Ixz;
    const hx = I.Ix * p + I.Ixz * r, hy = I.Iy * qq, hz = I.Ixz * p + I.Iz * r;
    const gyro = cross(om, [hx, hy, hz]);
    const Lx = Lm - gyro[0], My = Mm - gyro[1], Nz = Nm - gyro[2];
    const pdot = (I.Iz * Lx - I.Ixz * Nz) / G1;
    const qdot = My / I.Iy;
    const rdot = (I.Ix * Nz - I.Ixz * Lx) / G1;
    const posdot = qrot(q, vel);
    const qdotq = mul4(qmul(q, [0, p, qq, r]), 0.5);
    return { d: [posdot, vdot, qdotq, [pdot, qdot, rdot]], F, gearOut, alpha, co };
  }

  gearForces(pos, vel, q, om, env) {
    let F = [0, 0, 0], M = [0, 0, 0];
    const out = [];
    if (!env.surface) return { F, M, out };
    const ext = this.gear;
    for (let i = 0; i < GEAR.length; i++) {
      const g = GEAR[i];
      const pb = g.p.slice(); pb[2] -= (1 - ext) * 1.2; // retract up into the fuselage
      const pw = add(pos, qrot(q, pb));
      const srf = env.surface(pw);
      const pen = pw[2] - (-srf.h); // positive when below the surface (NED z is down)
      if (pen <= 0 || ext < 0.95) { out.push(null); continue; }
      const vp = add(qrot(q, vel), qrot(q, cross(om, pb)));
      const vrel = sub(vp, srf.v || [0, 0, 0]);
      const comp = Math.min(pen, g.stroke * 1.4);
      let Nf = g.k * comp + g.c * vrel[2];
      if (pen > g.stroke) Nf += (pen - g.stroke) * g.k * 20; // bottomed out
      Nf = Math.max(0, Nf);
      // Tire forces in the surface plane: along the wheel heading and sideways.
      const fwd = qrot(q, [1, 0, 0]);
      let heading = Math.atan2(fwd[1], fwd[0]);
      if (g.steer && this.onGround) heading -= this.ctl.yaw * 0.6 * Math.max(0, 1 - this.V / 40);
      const hx = Math.cos(heading), hy = Math.sin(heading);
      const vLong = vrel[0] * hx + vrel[1] * hy, vLat = -vrel[0] * hy + vrel[1] * hx;
      const mu = srf.mu ?? 0.7;
      const brake = g.steer ? 0 : this.ctl.brake;
      const fLong = -Math.sign(vLong) * Math.min(Math.abs(vLong) * 4000, Nf * (0.02 + 0.55 * brake * mu));
      const fLat = -Math.max(-mu * Nf, Math.min(mu * Nf, vLat * 30000));
      const fw = [fLong * hx - fLat * hy, fLong * hy + fLat * hx, -Nf];
      const fb = qinvrot(q, fw);
      F = add(F, fb); M = add(M, cross(pb, fb));
      out.push({ i, pen, Nf, sink: vrel[2] });
    }
    return { F, M, out };
  }

  step(dt, env = {}) {
    this.wind = env.wind || [0, 0, 0];
    this.updateDerived();
    this.fcs(dt);
    for (const e of [this.engL, this.engR]) e.update(dt, this.ctl.throttle, this.air.sigma, this.mach);
    const dl = this.air.p / 101325;
    const burn = (this.engL.fuelFlowKgS(this.air.sigma, this.mach, dl) + this.engR.fuelFlowKgS(this.air.sigma, this.mach, dl)) * dt;
    this.fuel = Math.max(0, this.fuel - burn);
    if (this.fuel <= 0) this.engL.running = this.engR.running = false;
    if (this.crashed) return;
    const s0 = [this.pos, this.vel, this.q, this.omega];
    const k1 = this.derivatives(s0, env);
    const s1 = addState(s0, k1.d, dt / 2);
    const k2 = this.derivatives(s1, env);
    const s2 = addState(s0, k2.d, dt / 2);
    const k3 = this.derivatives(s2, env);
    const s3 = addState(s0, k3.d, dt);
    const k4 = this.derivatives(s3, env);
    const d = k1.d.map((v, i) => v.map((c, j) => (c + 2 * k2.d[i][j] + 2 * k3.d[i][j] + k4.d[i][j]) / 6));
    const n = addState(s0, d, dt);
    this.pos = n[0]; this.vel = n[1]; this.q = qnorm(n[2]); this.omega = n[3];
    this.t += dt;
    // Load factor along body -z, excluding gravity.
    const m = this.mass;
    const aero = sub(k1.F, qinvrot(this.q, [0, 0, m * G]));
    this.nz = -aero[2] / (m * G);
    this.nx = aero[0] / (m * G);
    this.maxG = Math.max(this.maxG, this.nz);
    this.gearState = k1.gearOut.out;
    this.onGround = k1.gearOut.out.some((o) => o);
    this.checkDamage(env, k1.gearOut.out);
    this.updateDerived();
  }

  checkDamage(env, gearOut) {
    for (const o of gearOut) {
      if (!o) continue;
      const main = GEAR[o.i].name !== 'nose';
      if (main && o.sink > this.lastTouchSink) this.lastTouchSink = o.sink;
      // F-14 main gear design limit is about 1,520 fpm (7.7 m/s) at touchdown (NATOPS). The nose gear takes
      // the slap-down after an arrestment, so it gets a higher margin (EST).
      if (o.sink > (main ? 8.5 : 12)) { this.gearBroken = true; this.crash((main ? 'main' : 'nose') + ' gear collapsed, sink rate ' + Math.round(o.sink * 196.85) + ' fpm'); }
    }
    if (env.surface) {
      const names = ['nose', 'tail cone', 'belly', 'left wingtip', 'right wingtip', 'left fin', 'right fin'];
      for (const sp of SCRAPE) {
        const pw = add(this.pos, qrot(this.q, sp));
        const srf = env.surface(pw);
        if (pw[2] > -srf.h) { if (!this.scraping) this.scrapes = (this.scrapes || 0) + 1; this.scraping = true; if (srf.water) this.crash('hit the water'); }
        else this.scraping = false;
      }
      for (let i = 0; i < HARD.length; i++) {
        const pw = add(this.pos, qrot(this.q, HARD[i]));
        const srf = env.surface(pw);
        if (pw[2] > -srf.h + 0.02) { this.crash((srf.water ? 'hit the water' : srf.deck ? 'hit the deck' : 'hit the ground') + ' (' + names[i] + ')'); break; }
      }
      if (this.gear < 0.95) {
        const belly = add(this.pos, qrot(this.q, [0, 0, 1.3]));
        const srf = env.surface(belly);
        if (belly[2] > -srf.h) this.crash('gear up landing');
      }
    }
    if (this.nz > 13 || this.nz < -6) this.crash('airframe overstress, ' + this.nz.toFixed(1) + ' g');
  }
  crash(reason) { if (!this.crashed) { this.crashed = true; this.crashReason = reason; } }

  get euler() { return qToEuler(this.q); }
  get altitude() { return -this.pos[2]; }
  get vWorld() { return qrot(this.q, this.vel); }
  get throttleMIL() { return MIL_DETENT; }
  // AOA indexer units. EST linear map: 0-30 units spans -10 to +40 deg probe (NATOPS), with the
  // probe reading about 1.2 x true alpha, so on-speed 15 units is about 12.5 deg true alpha.
  get aoaUnits() { return Math.max(0, Math.min(30, (this.alpha * 1.2 + 10) * 0.6)); }
}

function sweepSchedule(m) {
  const pts = [[0, 20], [0.45, 20], [0.65, 24], [0.8, 45], [0.9, 58], [1.0, 68]];
  if (m >= 1) return 68;
  for (let i = 0; i < pts.length - 1; i++) {
    const [m0, s0] = pts[i], [m1, s1] = pts[i + 1];
    if (m <= m1) return s0 + (s1 - s0) * (m - m0) / (m1 - m0);
  }
  return 68;
}
function mul4(a, k) { return a.map((c) => c * k); }
function addState(s, d, h) { return s.map((v, i) => v.map((c, j) => c + d[i][j] * h)); }
export { sweepSchedule };
