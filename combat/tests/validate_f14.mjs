// Checks the F-14 model against published numbers. Run: node combat/tests/validate_f14.mjs
import { coefficients } from '../src/fdm/f14_aero.js';
import { F14, sweepSchedule, qFromEuler } from '../src/fdm/fdm.js';
import { isa, KT, FT, LB, LBM, DEG } from '../src/fdm/atmosphere.js';
import { Engine } from '../src/fdm/engine.js';

const S = 565 * FT * FT, CBAR = 9.8 * FT, G = 9.80665;
const results = [];
const report = (name, value, target, ok) => { results.push({ name, value, target, ok }); };

// Static trim for straight and level flight: solve alpha, stab and thrust so lift, drag and pitch balance.
function trim({ V, h, massKg, cfg = {}, sweep }) {
  const air = isa(h), mach = V / air.a, qbar = 0.5 * air.rho * V * V;
  sweep = sweep ?? (cfg.flaps ? 20 : sweepSchedule(mach));
  let a = 5, ds = -3;
  const f = (a, ds) => {
    const c = coefficients({ alpha: a, beta: 0, p: 0, q: 0, r: 0, V, mach, sweep, ds, da: 0, dr: 0, sp: 0, dlc: 0,
      flaps: cfg.flaps || 0, slats: cfg.flaps ? 1 : 0, gear: cfg.gear || 0, speedbrake: cfg.speedbrake || 0, xcg: 14 });
    return c;
  };
  for (let it = 0; it < 60; it++) {
    // Thrust along body x: lift balance uses L + T sin(a) = W; ignore T sin(a) first pass then include.
    const c = f(a, ds);
    const ar = a * DEG;
    const T = (qbar * S * c.CD) / Math.cos(ar);
    const Fz = qbar * S * c.CL + T * Math.sin(ar) - massKg * G;
    const Mm = c.Cm;
    const e = 0.05;
    const cA = f(a + e, ds), cS = f(a, ds + e);
    const dFz_da = (qbar * S * (cA.CL - c.CL)) / e, dFz_ds = (qbar * S * (cS.CL - c.CL)) / e;
    const dM_da = (cA.Cm - c.Cm) / e, dM_ds = (cS.Cm - c.Cm) / e;
    const det = dFz_da * dM_ds - dFz_ds * dM_da;
    const da = (-Fz * dM_ds + Mm * dFz_ds) / det;
    const dds = (-Mm * dFz_da + Fz * dM_da) / det;
    a += Math.max(-3, Math.min(3, da)); ds += Math.max(-5, Math.min(5, dds));
    if (Math.abs(da) < 1e-4 && Math.abs(dds) < 1e-4) break;
  }
  const c = f(a, ds);
  const T = (qbar * S * c.CD) / Math.cos(a * DEG);
  return { alpha: a, ds, thrustLb: T / LB, mach, CL: c.CL, CD: c.CD, sweep };
}

// Available thrust, both engines, fully spooled.
function thrustAvail(h, mach, ab) {
  const e = new Engine(); e.T = 12350 * LB; e.ab = ab ? 1 : 0;
  const air = isa(h);
  return 2 * e.thrust(air.sigma, mach, air.p / 101325) / LB;
}

// 1. Approach speed at 15 units AOA, landing configuration, 48,531 lb (TM-81833 weight).
{
  const m = 48531 * LBM;
  const units = (a) => Math.max(0, Math.min(30, (a * 1.2 + 10) * 0.6));
  let best = null;
  for (let kt = 100; kt <= 170; kt += 0.5) {
    const t = trim({ V: kt * KT, h: 30, massKg: m, cfg: { flaps: 1, gear: 1 } });
    if (!best || Math.abs(units(t.alpha) - 15) < Math.abs(units(best.t.alpha) - 15)) best = { kt, t };
  }
  report('On-speed approach, 15 units, 48,531 lb, flaps/gear down', best.kt + ' kt (alpha ' + best.t.alpha.toFixed(1) + ', stab ' + best.t.ds.toFixed(1) + ', thrust ' + Math.round(best.t.thrustLb) + ' lb)',
    '120-135 kt (forum ~123 kt at 50,000 lb; unverified)', best.kt >= 118 && best.kt <= 137);
}
// 2. Clean 1 g stall: speed at which trim needs alpha about CLmax (30-33 deg), 22 deg sweep.
{
  const m = 48531 * LBM;
  let vs = null;
  for (let kt = 200; kt >= 80; kt -= 1) {
    const t = trim({ V: kt * KT, h: 1500, massKg: m, sweep: 20 });
    if (t.alpha > 30 || isNaN(t.alpha)) { vs = kt + 1; break; }
  }
  report('Clean 1 g stall speed, 48,531 lb, 20 deg sweep', vs + ' kt', 'about 118 kt power-off (published spec, weight not stated)', vs >= 100 && vs <= 135);
}
// 3. Max level speed with full afterburner, at sea level and at 40,000 ft (55,000 lb).
for (const [h, target, lo, hi] of [[0, 'Mach 1.2 (792 kt)', 1.1, 1.3], [40000 * FT, 'Mach 2.34', 2.15, 2.45]]) {
  const m = 55000 * LBM;
  let vmax = 0;
  for (let M = 0.5; M <= 2.6; M += 0.01) {
    const V = M * isa(h).a;
    const t = trim({ V, h, massKg: m });
    if (t.thrustLb <= thrustAvail(h, M, true)) vmax = M;
  }
  report('Max level speed at ' + Math.round(h / FT) + ' ft, full afterburner', 'Mach ' + vmax.toFixed(2), target, vmax >= lo && vmax <= hi);
}
// 4. Military power max level speed at sea level (dry). Published F-14A: about Mach 0.9 dry (EST target).
{
  const m = 55000 * LBM; let vmax = 0;
  for (let M = 0.4; M <= 1.3; M += 0.01) {
    const t = trim({ V: M * 340.3, h: 0, massKg: m });
    if (t.thrustLb <= thrustAvail(0, M, false)) vmax = M;
  }
  report('Max level speed at sea level, military power', 'Mach ' + vmax.toFixed(2), 'about Mach 0.85-0.95 (estimate, no primary source)', vmax >= 0.8 && vmax <= 1.0);
}

// Dynamic tests with the full 6-DOF model.
function flyLevel(opts) {
  const ac = new F14();
  ac.reset({ pos: [0, 0, -opts.h], V: opts.V, heading: 0, fuelKg: opts.fuelKg ?? 5000 });
  const t = trim({ V: opts.V, h: opts.h, massKg: ac.mass, cfg: opts.cfg || {} });
  ac.q = qFromEuler(0, t.alpha * DEG, 0);
  ac.vel = [opts.V * Math.cos(t.alpha * DEG), 0, opts.V * Math.sin(t.alpha * DEG)];
  ac.sweep = t.sweep;
  ac.ctl.trim = t.ds; ac.surf.ds = t.ds;
  if (opts.cfg?.flaps) { ac.ctl.flaps = 1; ac.flaps = 1; ac.slats = 1; ac.ctl.gear = 1; ac.gear = 1; }
  // Throttle to match drag: find throttle giving trim thrust.
  const need = t.thrustLb / 2;
  const e = new Engine();
  let th = 0.5;
  for (let i = 0; i < 40; i++) { e.T = e.commandedDry(th); const T = e.thrust(isa(opts.h).sigma, t.mach, isa(opts.h).p / 101325) / LB; th += (need - T) / 30000; th = Math.max(0, Math.min(0.8, th)); }
  ac.ctl.throttle = th;
  for (const en of [ac.engL, ac.engR]) { en.T = en.commandedDry(th); en.Tdot = 0; }
  return { ac, trim: t };
}
// 5. Holds trimmed level flight hands-off for 20 s (checks the trim and the integrator).
{
  const { ac } = flyLevel({ V: 250 * KT, h: 3000 });
  const h0 = ac.altitude;
  for (let i = 0; i < 20 * 120; i++) ac.step(1 / 120, {});
  report('Hands-off after trim at 250 kt, 20 s', 'altitude change ' + Math.round((ac.altitude - h0) / FT) + ' ft, pitch ' + (ac.euler.theta / DEG).toFixed(1) + ' deg', 'within 300 ft', Math.abs(ac.altitude - h0) / FT < 300);
}
// 6. Peak roll rate, full lateral stick at 350 kt, 10,000 ft.
{
  const { ac } = flyLevel({ V: 350 * KT, h: 3000 });
  let pmax = 0;
  for (let i = 0; i < 3 * 120; i++) { ac.ctl.roll = 1; ac.step(1 / 120, {}); pmax = Math.max(pmax, ac.omega[0] / DEG); }
  report('Peak roll rate, full stick, 350 kt', pmax.toFixed(0) + ' deg/s', 'about 180 deg/s (secondary source)', pmax > 140 && pmax < 230);
}
// 7. Max g pull at 400 kt, 10,000 ft: must reach 6.5 g or more with full aft stick.
{
  const { ac } = flyLevel({ V: 420 * KT, h: 3000 });
  let gmax = 0;
  for (let i = 0; i < 3 * 120; i++) { ac.ctl.pitch = 1; ac.step(1 / 120, {}); gmax = Math.max(gmax, ac.nz); }
  report('Full aft stick at 420 kt', gmax.toFixed(1) + ' g', '7.5 g limit reachable (NATOPS limit 7.5 g)', gmax >= 6.5);
}
// 8. Short-period and phugoid-ish: stick pulse response at 300 kt settles, no divergence.
{
  const { ac } = flyLevel({ V: 300 * KT, h: 3000 });
  for (let i = 0; i < 120; i++) { ac.ctl.pitch = i < 30 ? 0.3 : 0; ac.step(1 / 120, {}); }
  let qmax = 0;
  for (let i = 0; i < 4 * 120; i++) { ac.ctl.pitch = 0; ac.step(1 / 120, {}); if (i > 2 * 120) qmax = Math.max(qmax, Math.abs(ac.omega[1] / DEG)); }
  report('Pitch pulse at 300 kt, residual pitch rate after 3 s', qmax.toFixed(2) + ' deg/s', 'below 1.5 deg/s (well damped short period)', qmax < 1.5);
}

let pass = 0;
for (const r of results) { console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + ': ' + r.value + '   [target ' + r.target + ']'); if (r.ok) pass++; }
console.log(`${pass}/${results.length} checks pass`);
