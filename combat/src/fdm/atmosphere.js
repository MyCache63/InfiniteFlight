// International Standard Atmosphere, 0 to 32 km. SI units.
const G0 = 9.80665, R = 287.05287;

export function isa(h) {
  h = Math.max(-500, Math.min(h, 32000));
  let T, p;
  if (h <= 11000) {
    T = 288.15 - 0.0065 * h;
    p = 101325 * Math.pow(T / 288.15, G0 / (0.0065 * R));
  } else if (h <= 20000) {
    T = 216.65;
    p = 22632.06 * Math.exp(-G0 * (h - 11000) / (R * T));
  } else {
    T = 216.65 + 0.001 * (h - 20000);
    p = 5474.889 * Math.pow(T / 216.65, -G0 / (0.001 * R));
  }
  const rho = p / (R * T);
  const a = Math.sqrt(1.4 * R * T);
  return { T, p, rho, a, sigma: rho / 1.225 };
}

export const KT = 0.514444;   // m/s per knot
export const FT = 0.3048;     // m per foot
export const LB = 4.448222;   // N per pound-force
export const LBM = 0.4535924; // kg per pound-mass
export const SLUGFT2 = 1.355818; // kg m^2 per slug ft^2
export const DEG = Math.PI / 180;
