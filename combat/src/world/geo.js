// Geographic helpers. The game world is a local tangent plane centered on ORIGIN.
// Three.js frame: x = east, y = up, z = south.  FDM frame (NED): x = north, y = east, z = down.
export const ORIGIN = { lat: 37.78, lon: -122.62 }; // just west of the Golden Gate
const R_EARTH = 6371008.8;
const M_PER_DEG_LAT = 111132.95;
const M_PER_DEG_LON = 111319.49 * Math.cos(ORIGIN.lat * Math.PI / 180);

export function llToEN(lat, lon) {
  return { e: (lon - ORIGIN.lon) * M_PER_DEG_LON, n: (lat - ORIGIN.lat) * M_PER_DEG_LAT };
}
export function enToLL(e, n) {
  return { lat: ORIGIN.lat + n / M_PER_DEG_LAT, lon: ORIGIN.lon + e / M_PER_DEG_LON };
}
// Web Mercator tile math.
export function tileBounds(z, x, y) {
  const n = 2 ** z;
  const lon0 = x / n * 360 - 180, lon1 = (x + 1) / n * 360 - 180;
  const lat = (yy) => Math.atan(Math.sinh(Math.PI * (1 - 2 * yy / n))) * 180 / Math.PI;
  return { latN: lat(y), latS: lat(y + 1), lonW: lon0, lonE: lon1 };
}
export function llToTile(lat, lon, z) {
  const n = 2 ** z;
  const x = Math.floor((lon + 180) / 360 * n);
  const s = Math.sin(lat * Math.PI / 180);
  const y = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
  return { x, y };
}
export const EARTH_R = R_EARTH;
export const nedToThree = (p) => [p[1], -p[2], -p[0]];
export const threeToNed = (v) => [-v[2], v[0], -v[1]];
