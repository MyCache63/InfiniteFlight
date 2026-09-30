// F-14 aerodynamic model.
//
// Base: AFWAL-TR-80-3141 Part III tables (f14_afwal.js), clean, 22 deg sweep, low Mach, alpha 0..55.
// Everything marked EST is our own estimate layered on top of that base, because no public numeric
// table covers it. Each EST term says what it is tuned or reasoned against.
import * as A from './f14_afwal.js';
import { lerp1, lerp2 } from './interp.js';

const DEG = Math.PI / 180;
const clampA = (a) => Math.max(0, Math.min(55, a));
const clampB = (b) => Math.max(-20, Math.min(20, b));

// Wing geometry versus sweep. Span 64.13 ft at 20 deg (TM-81833), 38.2 ft at 68 deg (published specs).
export function wingSpanFt(sweep) {
  const t = (sweep - 20) / 48;
  return 64.13 + (38.2 - 64.13) * Math.max(0, Math.min(1, t));
}

// EST: Helmbold/DATCOM lift-curve slope for a swept wing, used only as a ratio against 22 deg, M 0.2.
function liftSlope(sweep, mach) {
  const b = wingSpanFt(sweep);
  const AR = (b * b) / A.GEOM.S_ft2;
  const tanL = Math.tan(sweep * DEG);
  const beta2 = Math.max(0.08, 1 - Math.min(mach, 0.95) ** 2);
  return (2 * Math.PI * AR) / (2 + Math.sqrt(4 + AR * AR * (beta2 + tanL * tanL)));
}
const SLOPE_REF = liftSlope(22, 0.2);

// EST: supersonic lift slope falls roughly as 4/sqrt(M^2-1); blended across Mach 0.95-1.2.
function liftRatio(sweep, mach) {
  let r = liftSlope(sweep, mach) / SLOPE_REF;
  if (mach > 1.0) {
    const sup = Math.min(1, 4 / Math.sqrt(Math.max(mach * mach - 1, 0.25)) / (2 * Math.PI)) * 1.35;
    const t = Math.min(1, (mach - 1.0) / 0.2);
    r = r * (1 - t) + sup * t * (liftSlope(sweep, 0.9) / SLOPE_REF);
  }
  return r;
}

// EST: wave drag increment. Drag-rise Mach moves later with sweep; peak falls with sweep.
// Tuned so max afterburner gives about Mach 1.2 at sea level and about Mach 2.3 at 40,000 ft
// (published F-14 figures: 792 kt at sea level, Mach 2.34 at 40,000 ft).
export function waveDrag(mach, sweep) {
  const mdd = 0.78 + 0.18 * Math.sin(Math.min(sweep, 68) * DEG);
  const peak = 0.034 - 0.012 * ((sweep - 20) / 48);
  if (mach < mdd - 0.1) return 0;
  if (mach < 1.15) {
    const t = (mach - (mdd - 0.1)) / (1.15 - (mdd - 0.1));
    return peak * t * t * (3 - 2 * t);
  }
  return peak * (0.62 + 0.38 * Math.exp(-(mach - 1.15) * 1.6));
}

// EST: aerodynamic-center shift with Mach (nose-down pitching moment per unit CL), including
// F-14A glove-vane behavior supersonic. Gives the usual supersonic stiffening in pitch.
function acShift(mach) {
  if (mach < 0.8) return 0;
  if (mach < 1.2) return 0.10 * (mach - 0.8) / 0.4;
  return 0.10 + 0.02 * Math.min(1, (mach - 1.2));
}

// EST: control effectiveness drops at high dynamic pressure through structural flex and supersonic
// loss of tail effectiveness. 1.0 subsonic, about 0.55 at Mach 2.
function tailEff(mach) {
  if (mach < 0.9) return 1;
  return Math.max(0.5, 1 - 0.45 * Math.min(1, (mach - 0.9) / 1.1));
}

function stabIncrement(t1, t2, a, ds) {
  const k1 = lerp1(A.ALPHA, t1, a), k2 = lerp1(A.ALPHA, t2, a);
  return ds >= -10 ? k1 * ds : -10 * k1 + (ds + 10) * k2;
}

// Base coefficients from the AFWAL tables, extended to negative and very high alpha (EST).
function baseLongitudinal(alphaDeg, betaDeg, ds) {
  const b = clampB(betaDeg);
  let CL, CD, Cm;
  if (alphaDeg >= 0 && alphaDeg <= 55) {
    CL = lerp2(A.ALPHA, A.BETA, A.CL_BASIC, alphaDeg, b);
    CD = lerp2(A.ALPHA, A.BETA, A.CD_BASIC, alphaDeg, b);
    Cm = lerp2(A.ALPHA, A.BETA, A.Cm_BASIC, alphaDeg, b);
  } else if (alphaDeg < 0) {
    // EST: linear lift and moment below zero alpha using the 0-5 deg slope; drag mirrored about -1.5 deg.
    const a = Math.max(alphaDeg, -25);
    const cl0 = lerp2(A.ALPHA, A.BETA, A.CL_BASIC, 0, b), cl5 = lerp2(A.ALPHA, A.BETA, A.CL_BASIC, 5, b);
    const cm0 = lerp2(A.ALPHA, A.BETA, A.Cm_BASIC, 0, b), cm5 = lerp2(A.ALPHA, A.BETA, A.Cm_BASIC, 5, b);
    CL = cl0 + (cl5 - cl0) / 5 * a;
    if (a < -12) CL = (cl0 + (cl5 - cl0) / 5 * -12) * (1 - (-12 - a) / 30);
    Cm = cm0 + (cm5 - cm0) / 5 * a;
    CD = lerp2(A.ALPHA, A.BETA, A.CD_BASIC, Math.min(55, Math.abs(a + 1.5)), b) * 0.9;
  } else {
    // EST: above 55 deg keep the 55-deg normal force and let it turn toward pure drag at 90 deg.
    const a = Math.min(alphaDeg, 90) * DEG, a55 = 55 * DEG;
    const cl = lerp2(A.ALPHA, A.BETA, A.CL_BASIC, 55, b), cd = lerp2(A.ALPHA, A.BETA, A.CD_BASIC, 55, b);
    const CN = cl * Math.cos(a55) + cd * Math.sin(a55);
    CL = CN * Math.cos(a); CD = CN * Math.sin(a);
    Cm = Math.max(-0.95, lerp2(A.ALPHA, A.BETA, A.Cm_BASIC, 55, b) - 0.012 * (Math.min(alphaDeg, 90) - 55));
  }
  const ac = clampA(alphaDeg);
  CL += stabIncrement(A.CL_DS1, A.CL_DS2, ac, ds);
  CD += stabIncrement(A.CD_DS1, A.CD_DS2, ac, ds);
  Cm += A.DCm_B0 + stabIncrement(A.Cm_DS1, A.Cm_DS2, ac, ds);
  return { CL, CD, Cm };
}

// Configuration increments, all EST. Landing configuration is slats 17, flaps 35, 20 deg sweep.
// Magnitudes are typical for a fighter with full-span slats and double-slotted flaps, then tuned so
// on-speed approach (15 units) at 48,531 lb falls near 125-130 kt. See tests/validate_f14.mjs.
function configIncrements(s, alphaDeg) {
  const f = s.flaps, sl = s.slats, g = s.gear, sb = s.speedbrake;
  const aFade = Math.max(0, 1 - Math.max(0, alphaDeg - 14) / 16); // flap lift fades past stall
  return {
    CL: 0.50 * f * aFade + 0.22 * sl * Math.min(1, Math.max(0, (alphaDeg - 6) / 10)),
    CD: 0.070 * f + 0.012 * sl + 0.024 * g + 0.055 * sb,
    Cm: -0.075 * f + 0.02 * sl - 0.004 * g - 0.01 * sb,
  };
}

// s = { alpha, beta (deg), p, q, r (rad/s), V (m/s), mach, sweep (deg),
//       ds, da, dr (deg: symmetric stab TED+, differential stab, rudder TEL+),
//       sp (0..1 roll spoiler command, signed), dlc (-1..1), flaps, slats, gear, speedbrake (0..1), xcg (% MAC) }
export function coefficients(s) {
  const alpha = s.alpha, beta = s.beta;
  const ac = clampA(alpha), bc = clampB(beta);
  const b = A.GEOM.b_ft * 0.3048, c = A.GEOM.cbar_ft * 0.3048;
  const V = Math.max(s.V, 5);
  const bw = wingSpanFt(s.sweep) * 0.3048; // actual span for roll damping scaling

  const base = baseLongitudinal(alpha, beta, s.ds * tailEff(s.mach));
  const kL = liftRatio(s.sweep, s.mach);
  // Sweep and Mach scale the lift build-up, not the stabilator part: apply to basic CL at low alpha,
  // fading to 1 by 35 deg where the flow is separated anyway.
  const fade = Math.min(1, ac / 35);
  const kLa = kL * (1 - fade) + fade * Math.min(1, kL);
  const clBasic = lerp2(A.ALPHA, A.BETA, A.CL_BASIC, ac, bc);
  let CL = base.CL + (kLa - 1) * (alpha < 0 ? base.CL : clBasic);

  // EST: induced drag change with aspect ratio (span efficiency 0.8), relative to 22 deg.
  const AR = (bw / 0.3048) ** 2 / A.GEOM.S_ft2, AR22 = wingSpanFt(22) ** 2 / A.GEOM.S_ft2;
  let CD = base.CD + (CL * CL / (Math.PI * 0.8)) * Math.max(0, 1 / AR - 1 / AR22) * (1 - fade)
         + waveDrag(s.mach, s.sweep);
  let Cm = base.Cm - acShift(s.mach) * CL;

  const cfg = configIncrements(s, alpha);
  CL += cfg.CL; CD += cfg.CD; Cm += cfg.Cm;

  // EST: direct lift control spoilers (landing only), about +/-0.10 CL for full thumbwheel.
  CL += -0.10 * (s.dlc || 0) * s.flaps; CD += 0.02 * Math.abs(s.dlc || 0) * s.flaps;

  // CG shift from the 16% MAC reference (AFWAL Table 10).
  const aR = alpha * DEG;
  Cm += ((s.xcg - A.GEOM.xref_pctMAC) / 100) * (CL * Math.cos(aR) + CD * Math.sin(aR));
  Cm += (c / (2 * V)) * lerp1(A.ALPHA, A.Cm_Q, ac) * s.q;

  // Lateral-directional, AFWAL Table 10.
  const hb = b / (2 * V), br = beta * DEG;
  const te = tailEff(s.mach);
  const da = s.da * te, dr = s.dr * te;
  let CY = lerp2(A.ALPHA, A.BETA, A.CY_BASIC, ac, bc)
         + lerp1(A.ALPHA, A.CY_DA, ac) * da + lerp2(A.ALPHA, A.BETA, A.CY_DR, ac, bc) * dr
         + hb * (lerp1(A.ALPHA, A.CY_R, ac) * s.r + lerp1(A.ALPHA, A.CY_P, ac) * s.p);
  let Cl = lerp2(A.ALPHA, A.BETA, A.Cl_BASIC, ac, bc)
         + lerp2(A.ALPHA, A.BETA, A.Cl_DA, ac, bc) * da + lerp2(A.ALPHA, A.BETA, A.Cl_DR, ac, bc) * dr
         + hb * (lerp1(A.ALPHA, A.Cl_R, ac) * s.r + lerp1(A.ALPHA, A.Cl_P, ac) * s.p * (bw / b) ** 2);
  let Cn = lerp2(A.ALPHA, A.BETA, A.Cn_BASIC, ac, bc)
         + lerp1(A.ALPHA, A.DCn_DS, ac) * s.ds * Math.sin(8.2 * br)
         + ((s.xcg - A.GEOM.xref_pctMAC) / 100) * (A.GEOM.cbar_ft / A.GEOM.b_ft) * CY
         + lerp1(A.ALPHA, A.Cn_DA, ac) * da + lerp2(A.ALPHA, A.BETA, A.Cn_DR, ac, bc) * dr
         + hb * (lerp1(A.ALPHA, A.Cn_R, ac) * s.r + lerp1(A.ALPHA, A.Cn_P, ac) * s.p);

  // EST: roll spoilers. The AFWAL package sets spoiler terms to zero because they vanish above
  // alpha 10 deg, but they are the F-14's main roll control at low alpha. Locked out above 57 deg sweep.
  // Magnitude tuned to give about 180 deg/s peak roll rate at 350 kt, 20 deg sweep, with full
  // differential tail (secondary sources quote 180 deg/s). Spoilers also cause proverse yaw.
  const spOn = s.sweep < 57 ? 1 : 0;
  const spA = Math.max(0, 1 - Math.max(0, alpha - 8) / 12);
  const spoil = (s.sp || 0) * spOn * spA * (1 - s.mach * 0.3);
  Cl += 0.075 * spoil;
  Cn += 0.006 * spoil;
  CD += 0.02 * Math.abs(spoil);

  // Beyond +/-20 deg sideslip the tables are clamped; add a restoring weathervane term (EST).
  if (Math.abs(beta) > 20) {
    const ex = (Math.abs(beta) - 20) * Math.sign(beta) * DEG;
    Cn += 0.3 * ex; CY -= 0.6 * ex;
  }
  return { CL, CD, CY, Cl, Cm, Cn };
}

export { DEG };
