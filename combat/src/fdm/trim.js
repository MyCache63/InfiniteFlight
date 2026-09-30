// Static trim: alpha, stabilator and thrust for steady straight flight on a given flight-path angle.
import { coefficients } from './f14_aero.js';
import { sweepSchedule } from './fdm.js';
import { isa, FT, LB, DEG } from './atmosphere.js';
import { Engine } from './engine.js';

const S = 565 * FT * FT, G = 9.80665;

export function trim({ V, h, massKg, cfg = {}, sweep, gammaDeg = 0 }) {
  const air = isa(h), mach = V / air.a, qbar = 0.5 * air.rho * V * V;
  sweep = sweep ?? (cfg.flaps ? 20 : sweepSchedule(mach));
  const gam = gammaDeg * DEG;
  const f = (a, ds) => coefficients({ alpha: a, beta: 0, p: 0, q: 0, r: 0, V, mach, sweep, ds, da: 0, dr: 0, sp: 0, dlc: 0,
    flaps: cfg.flaps || 0, slats: cfg.flaps ? 1 : 0, gear: cfg.gear || 0, speedbrake: cfg.speedbrake || 0, xcg: 14 });
  let a = 6, ds = -4;
  for (let it = 0; it < 80; it++) {
    const c = f(a, ds), ar = a * DEG;
    const T = (qbar * S * c.CD + massKg * G * Math.sin(gam)) / Math.cos(ar);
    const Fz = qbar * S * c.CL + T * Math.sin(ar) - massKg * G * Math.cos(gam);
    const e = 0.05, cA = f(a + e, ds), cS = f(a, ds + e);
    const j11 = qbar * S * (cA.CL - c.CL) / e, j12 = qbar * S * (cS.CL - c.CL) / e;
    const j21 = (cA.Cm - c.Cm) / e, j22 = (cS.Cm - c.Cm) / e;
    const det = j11 * j22 - j12 * j21;
    const da = (-Fz * j22 + c.Cm * j12) / det, dds = (-c.Cm * j11 + Fz * j21) / det;
    a += Math.max(-3, Math.min(3, da)); ds += Math.max(-5, Math.min(5, dds));
    if (Math.abs(da) < 1e-4 && Math.abs(dds) < 1e-4) break;
  }
  const c = f(a, ds);
  const T = (qbar * S * c.CD + massKg * G * Math.sin(gam)) / Math.cos(a * DEG);
  // Throttle that gives this thrust from both engines, fully spooled.
  const e = new Engine(); let th = 0.5;
  for (let i = 0; i < 60; i++) { e.T = e.commandedDry(th); const Te = 2 * e.thrust(air.sigma, mach, air.p / 101325); th = Math.max(0, Math.min(0.8, th + (T - Te) / 2.2e5)); }
  return { alpha: a, ds, thrustN: T, thrustLb: T / LB, throttle: th, sweep, mach };
}
