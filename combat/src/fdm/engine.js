// Two Pratt & Whitney TF30-P-414A turbofans (F-14A).
//
// Sea-level static thrust per engine: 12,350 lbf military, 20,900 lbf max afterburner (published
// F-14A figures, secondary source). Spool dynamics: second-order thrust response from NASA TM-81833
// Appendix B (wn 3.464 rad/s, zeta 1.617 increasing; 3.000 rad/s, 1.817 decreasing).
// EST: thrust lapse with density and Mach, afterburner light-off delay and fuel flow (TSFC 0.69 dry,
// 2.8 in full afterburner, lb/lbf/hr) are our estimates, tuned against the top speeds in f14_aero.js.
import { LB } from './atmosphere.js';

const MIL = 12350 * LB, MAXAB = 20900 * LB, IDLE = 900 * LB;

// Throttle 0..1: 0 idle, 0.80 military, 0.82..1.0 afterburner zone 1 to 5.
export const MIL_DETENT = 0.8;

// EST lapse model: thrust follows the compressor-face total pressure ratio delta2 = delta (1+0.2M^2)^3.5,
// capped at the engine's pressure limit, less a ram-drag term. The same cap is what limits the F-14
// to about Mach 1.2 at sea level and about Mach 2.3 at altitude.
function lapse(sigma, mach, ab, delta) {
  const d2 = Math.min((delta ?? Math.pow(sigma, 1.235)) * Math.pow(1 + 0.2 * mach * mach, 3.5), 2.2);
  const ramDrag = ab ? 1 - 0.12 * mach : 1 - 0.28 * mach;
  const hi = mach > 2.25 ? Math.max(0.1, 1 - (mach - 2.25) * 2.5) : 1;
  return Math.pow(d2, ab ? 0.85 : 0.8) * Math.max(0.05, ramDrag) * hi;
}

export class Engine {
  constructor() {
    this.T = IDLE; this.Tdot = 0; // actual thrust N and its rate, dry core
    this.ab = 0;                  // afterburner fraction lit, 0..1
    this.abDelay = 0;
    this.running = true;
  }
  commandedDry(th) {
    const t = Math.min(th, MIL_DETENT) / MIL_DETENT;
    return IDLE + (MIL - IDLE) * t;
  }
  update(dt, throttle, sigma, mach) {
    const Tc = this.running ? this.commandedDry(throttle) : 0;
    const up = Tc > this.T;
    const wn = up ? 3.464 : 3.0, z = up ? 1.617 : 1.817;
    const acc = wn * wn * (Tc - this.T) - 2 * z * wn * this.Tdot;
    this.Tdot += acc * dt; this.T += this.Tdot * dt;
    // Afterburner needs the core near military power and a short light-off delay.
    const wantAB = throttle > MIL_DETENT + 0.02 && this.T > 0.95 * MIL && this.running;
    const abCmd = wantAB ? (throttle - (MIL_DETENT + 0.02)) / (1 - MIL_DETENT - 0.02) : 0;
    if (wantAB && this.ab === 0) { this.abDelay += dt; if (this.abDelay < 0.6) return; }
    if (!wantAB) this.abDelay = 0;
    const target = wantAB ? 0.2 + 0.8 * abCmd : 0;
    const rate = target > this.ab ? 0.9 : 2.5;
    this.ab += Math.max(-rate * dt, Math.min(rate * dt, target - this.ab));
    if (this.ab < 0.01 && !wantAB) this.ab = 0;
    this._sigma = sigma; this._mach = mach;
  }
  thrust(sigma, mach, delta) {
    const dry = this.T * lapse(sigma, mach, false, delta);
    if (this.ab <= 0) return dry;
    const wet = MAXAB * lapse(sigma, mach, true, delta);
    return dry + (wet - MIL * lapse(sigma, mach, false, delta)) * this.ab;
  }
  fuelFlowKgS(sigma, mach, delta) {
    const F = this.thrust(sigma, mach, delta) / LB; // lbf
    const tsfc = 0.69 + (2.8 - 0.69) * this.ab;
    return (F * tsfc / 3600) * 0.4535924;
  }
  get rpmPct() { return 62 + 38 * Math.min(1, Math.max(0, (this.T - IDLE) / (MIL - IDLE))); }
}
