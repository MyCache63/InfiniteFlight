// High-AOA behaviors that AFWAL-TR-80-3141 Part III (Section E) says the unslatted F-14A shows in flight test:
//  1. mildly divergent Dutch roll between 12 and 22 deg AOA (SAS off)
//  2. roll reversal starting near 18 deg AOA when rolling with differential tail only.
// Run: node combat/tests/validate_highaoa.mjs
import { F14, qFromEuler } from '../src/fdm/fdm.js';
import { trim } from '../src/fdm/trim.js';
import { KT, FT, DEG } from '../src/fdm/atmosphere.js';

function setup(alphaWanted, h = 4500) {
  const ac = new F14();
  ac.reset({ pos: [0, 0, -h], V: 200 * KT, fuelKg: 5000 });
  // Find the speed that trims at the wanted alpha (clean, 20 deg sweep).
  let lo = 90 * KT, hi = 400 * KT, t;
  for (let i = 0; i < 40; i++) { const V = (lo + hi) / 2; t = trim({ V, h, massKg: ac.mass, sweep: 20 }); if (t.alpha > alphaWanted) lo = V; else hi = V; }
  const V = (lo + hi) / 2;
  ac.q = qFromEuler(0, t.alpha * DEG, 0); ac.vel = [V * Math.cos(t.alpha * DEG), 0, V * Math.sin(t.alpha * DEG)];
  ac.sweep = 20; ac.ctl.sweepMode = 'manual'; ac.ctl.sweepManual = 20; ac.ctl.trim = t.ds; ac.surf.ds = t.ds;
  ac.ctl.throttle = t.throttle; for (const e of [ac.engL, ac.engR]) { e.T = e.commandedDry(t.throttle); e.Tdot = 0; }
  ac.sasOff = true;
  return { ac, V };
}
const dt = 1 / 120;
console.log('Dutch roll, SAS off, 2 deg/s yaw-rate kick: ratio of sideslip amplitude (10-20 s) to (0-10 s)');
for (const a of [5, 10, 14, 18, 22, 26]) {
  const { ac, V } = setup(a);
  ac.omega[2] = 2 * DEG;
  let m1 = 0, m2 = 0;
  for (let i = 0; i < 20 / dt; i++) { ac.step(dt, {}); const b = Math.abs(ac.beta); if (i * dt < 10) m1 = Math.max(m1, b); else m2 = Math.max(m2, b); }
  console.log(`  alpha ${a} deg (${Math.round(V / KT)} kt): growth ${(m2 / Math.max(m1, 1e-6)).toFixed(2)}  ${m2 > m1 * 1.05 ? 'DIVERGENT' : m2 < m1 * 0.7 ? 'damped' : 'neutral'}`);
}
console.log('Roll response, SAS off, spoilers off, full right differential tail for 5 s: final roll angle');
for (const a of [5, 10, 14, 18, 22, 26]) {
  const { ac } = setup(a);
  ac.noSpoilers = true;
  let pmin = 0; for (let i = 0; i < 5 / dt; i++) { ac.ctl.roll = 1; ac.step(dt, {}); pmin = Math.min(pmin, ac.euler.phi); }
  const phi = ac.euler.phi / DEG;
  console.log(`  alpha ${a} deg: bank ${phi.toFixed(1)} deg, beta ${ac.beta.toFixed(1)}  ${phi < 0 ? "REVERSED" : "normal"}`);
}
