// Procedural F-14 Tomcat model built in body axes (x forward, y right, z down), metres, origin at the CG.
// Proportions are measured from the AFWAL-TR-80-3141 Part III three-view (Fig. 35) and published data:
// length 19.1 m, span 19.54 m at 20 deg sweep and 11.65 m at 68 deg, fin tip 4.88 m above the ground,
// stabilator span 9.97 m, track 5.0 m, wheelbase 7.0 m. Tyre contact points match fdm.js GEAR (z = 1.95 m).
// Moving parts: outer wings (sweep), slats, flaps, spoilers, stabilators, rudders, speed brakes, gear, hook,
// afterburner flames, beacon.
import * as THREE from 'three';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------------------------------------------
// Curves and lofting
// ---------------------------------------------------------------------------------------------------

// Monotone cubic (Fritsch-Carlson) interpolation through (xs, ys); xs may be in any order.
function pchip(xs, ys) {
  const P = xs.map((x, i) => [x, ys[i]]).sort((a, b) => a[0] - b[0]);
  const X = P.map((p) => p[0]), Y = P.map((p) => p[1]), n = X.length;
  const h = [], d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) { h[i] = X[i + 1] - X[i]; d[i] = (Y[i + 1] - Y[i]) / h[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= X[0]) return Y[0];
    if (x >= X[n - 1]) return Y[n - 1];
    let i = 0; while (x > X[i + 1]) i++;
    const t = (x - X[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * Y[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * Y[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}
// A station table {x: [...], a: [...], b: [...]} becomes {a: f(x), b: f(x)}.
function prof(tab) {
  const o = {};
  for (const k of Object.keys(tab)) if (k !== 'x') o[k] = pchip(tab.x, tab[k]);
  return o;
}
// Superellipse ring at station x. theta = 0 is the top, pi/2 the +y side, pi the bottom.
function sring(x, yc, zc, w, top, bot, n, N, a0 = 0, a1 = TAU, closed = true) {
  const pts = [], e = 2 / n;
  for (let k = 0; k < N; k++) {
    const t = a0 + (a1 - a0) * k / (closed ? N : N - 1);
    const s = Math.sin(t), c = Math.cos(t);
    const y = yc + w * Math.sign(s) * Math.pow(Math.abs(s), e);
    const z = zc - (c >= 0 ? top : bot) * Math.sign(c) * Math.pow(Math.abs(c), e);
    pts.push(V3(x, y, z));
  }
  return pts;
}
const centroid = (pts) => pts.reduce((a, p) => a.add(p), V3(0, 0, 0)).multiplyScalar(1 / pts.length);

// Loft through rings of equal point count. Normals are made to point away from each ring centre
// (or along outDir(p, centre)) so callers never need to worry about winding.
function loft(rings, o = {}) {
  const closed = o.closed ?? true;
  const R = rings.length, N = rings[0].length;
  const pos = [], idx = [];
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z);
  const K = closed ? N : N - 1;
  for (let r = 0; r < R - 1; r++) for (let k = 0; k < K; k++) {
    const a = r * N + k, b = r * N + (k + 1) % N, c = (r + 1) * N + k, d = (r + 1) * N + (k + 1) % N;
    idx.push(a, c, b, b, c, d);
  }
  const cap = (r, end) => {
    const ring = rings[r], cen = centroid(ring), base = pos.length / 3;
    pos.push(cen.x, cen.y, cen.z);
    for (const p of ring) pos.push(p.x, p.y, p.z);
    for (let k = 0; k < N; k++) {
      const a = base + 1 + k, b = base + 1 + (k + 1) % N;
      if (end) idx.push(base, b, a); else idx.push(base, a, b);
    }
  };
  if (o.capStart) cap(0, false);
  if (o.capEnd) cap(R - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  if (o.matrix) g.applyMatrix4(o.matrix);
  g.computeVertexNormals();
  const P = g.attributes.position, Nm = g.attributes.normal;
  let s = 0; const v = V3(0, 0, 0), nn = V3(0, 0, 0);
  for (let r = 0; r < R; r++) {
    const c = V3(0, 0, 0);
    for (let k = 0; k < N; k++) c.add(v.fromBufferAttribute(P, r * N + k));
    c.multiplyScalar(1 / N);
    for (let k = 0; k < N; k++) {
      v.fromBufferAttribute(P, r * N + k); nn.fromBufferAttribute(Nm, r * N + k);
      const dir = o.outDir ? o.outDir(v, c) : v.clone().sub(c);
      s += nn.dot(dir);
    }
  }
  if ((s < 0) !== !!o.inward) {
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true; g.computeVertexNormals();
  }
  return g;
}

// Airfoil sections. f(u) is the half-thickness shape (max 1) over the chord fraction u.
const NACA = (u) => Math.max(0, (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4) / 0.1002);
const SLAB = (u) => Math.sqrt(Math.min(1, u / 0.07)) * smooth((1 - u) / 0.45);
function afPt(st, u, top) {
  const x = lerp(st.xle, st.xte, u), y = lerp(st.yle, st.yte, u), zc = lerp(st.z, st.zte, u);
  const th = st.t * st.f(u);
  if (st.surf) return st.surf(x, y, zc, th, top, u);
  return V3(x, y, top ? zc - th : zc + th);
}
function station(s) {
  return { f: NACA, z: 0, ...s, yle: s.yle ?? s.y, yte: s.yte ?? s.y, zte: s.zte ?? s.z ?? 0 };
}
// Ring around the chord between u0 and u1: bottom from u1 to u0, then top back to u1.
function afRing(st, nC, u0, u1) {
  const us = []; for (let i = 0; i <= nC; i++) us.push(u0 + (u1 - u0) * (0.5 - 0.5 * Math.cos(Math.PI * i / nC)));
  const pts = [];
  if (u1 >= 1) pts.push(afPt(st, 1, true)); else pts.push(afPt(st, u1, false));
  for (let i = nC - 1; i >= 1; i--) pts.push(afPt(st, us[i], false));
  if (u0 <= 0) pts.push(afPt(st, 0, true)); else { pts.push(afPt(st, u0, false)); pts.push(afPt(st, u0, true)); }
  for (let i = 1; i <= nC - 1; i++) pts.push(afPt(st, us[i], true));
  if (u1 < 1) pts.push(afPt(st, u1, true));
  return pts;
}
// Lifting surface through spanwise stations. mirror flips y for the left side.
function surface(stations, { nC = 14, u0 = 0, u1 = 1, capStart = false, capEnd = false, mirror = false, matrix = null } = {}) {
  const rings = stations.map((s) => {
    const r = afRing(station(s), nC, u0, u1);
    if (mirror) for (const p of r) p.y = -p.y;
    return r;
  });
  return loft(rings, { capStart, capEnd, matrix });
}
// Hinge frame: an alignment group whose local y runs along the hinge line p0 -> p1 (with zHint as the
// approximate local z) and an inner group the animation rotates about that line. Returns the inverse
// matrix that takes parent coordinates into the inner group's frame.
function hingeFrame(parent, p0, p1, zHint = V3(0, 0, 1)) {
  const ey = p1.clone().sub(p0).normalize();
  const ez = zHint.clone().sub(ey.clone().multiplyScalar(zHint.dot(ey))).normalize();
  const ex = ey.clone().cross(ez);
  const align = new THREE.Group();
  align.position.copy(p0); align.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, ey, ez));
  parent.add(align);
  const hinge = new THREE.Group(); align.add(hinge);
  align.updateMatrix();
  return { align, hinge, inv: align.matrix.clone().invert() };
}
// Cylinder between two points.
function rod(p0, p1, r0, r1 = r0, seg = 12) {
  const d = p1.clone().sub(p0), L = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, L, seg);
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(0, L / 2, 0));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.normalize())));
  g.applyMatrix4(new THREE.Matrix4().makeTranslation(p0.x, p0.y, p0.z));
  return g;
}
// Tube along a list of points.
function tube(pts, r, seg = 48) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6, false);
}

// ---------------------------------------------------------------------------------------------------
// Textures
// ---------------------------------------------------------------------------------------------------

// Near-white detail map multiplied over the vertex paint: panel lines, rivet rows, slightly toned panels.
function detailTexture(size = 1024, seed = 7) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, size, size);
  for (let i = 0; i < 26; i++) {
    const w = size * (0.08 + r() * 0.3), h = size * (0.06 + r() * 0.25);
    const v = 238 + Math.floor(r() * 16);
    x.fillStyle = `rgb(${v},${v},${v + 2})`; x.fillRect(r() * size, r() * size, w, h);
  }
  for (let i = 0; i < 160; i++) {
    const cx = r() * size, cy = r() * size, rad = 8 + r() * 70;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
    const d = r() > 0.5 ? 255 : 90;
    g.addColorStop(0, `rgba(${d},${d},${d},${0.025 + r() * 0.03})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  x.strokeStyle = 'rgba(40,44,50,0.34)'; x.lineWidth = 1.3;
  const grid = [0.0, 0.17, 0.31, 0.5, 0.64, 0.83];
  for (const g of grid) { x.beginPath(); x.moveTo(g * size, 0); x.lineTo(g * size, size); x.stroke(); }
  for (let i = 0; i < 10; i++) {
    const p = r() * size, a = r() * size, b = a + size * (0.2 + r() * 0.5);
    x.beginPath(); x.moveTo(a, p); x.lineTo(b, p); x.stroke();
  }
  x.fillStyle = 'rgba(30,32,36,0.20)';
  for (const g of grid) for (let k = 0; k < size; k += 8) x.fillRect(g * size + 4, k, 1.3, 1.3);
  for (let i = 0; i < 8; i++) { const p = r() * size; for (let k = 0; k < size; k += 8) x.fillRect(k, p + 4, 1.3, 1.3); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Box-projected detail texture in object space, so the lofts need no UVs and panel scale is uniform.
function triplanar(mat, tex, scale) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.tDetail = { value: tex }; sh.uniforms.detScale = { value: scale };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTpPos = position;\nvTpNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDetail;\nuniform float detScale;\nvarying vec3 vTpPos;\nvarying vec3 vTpNrm;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 bw = pow(abs(normalize(vTpNrm)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
          vec3 p = vTpPos * detScale;
          vec3 dc = texture2D(tDetail, p.yz).rgb * bw.x + texture2D(tDetail, p.xz).rgb * bw.y + texture2D(tDetail, p.xy).rgb * bw.z;
          diffuseColor.rgb *= dc;
        }`);
  };
  mat.customProgramCacheKey = () => 'f14tri' + scale;
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

const PAINT_TOP = new THREE.Color(0x525a63);   // FS 36320 dark ghost gray, upper surfaces
const PAINT_LOW = new THREE.Color(0x737b83);   // FS 36375 light ghost gray, sides and underside
const MARK = '#4a525a';                        // low-visibility markings

// ---------------------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------------------

export class F14Model {
  constructor() {
    this.root = new THREE.Group();          // oriented by the sim each frame
    this.body = new THREE.Group();          // body axes x fwd, y right, z down
    this.root.add(this.body);
    const tex = detailTexture();
    this.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.66, metalness: 0.08, envMapIntensity: 0.55 });
    triplanar(this.skin, tex, 1 / 3.2);
    this.radome = new THREE.MeshStandardMaterial({ color: 0x6f777e, roughness: 0.55, metalness: 0.05, envMapIntensity: 0.55 });
    triplanar(this.radome, tex, 1 / 6);
    this.dark = new THREE.MeshStandardMaterial({ color: 0x25282c, roughness: 0.7, metalness: 0.2 });
    this.intakeMat = new THREE.MeshStandardMaterial({ color: 0x8a9095, roughness: 0.75, metalness: 0.05, envMapIntensity: 0.35 });
    this.frame = new THREE.MeshStandardMaterial({ color: 0x23262a, roughness: 0.85, metalness: 0.1 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x5b5752, roughness: 0.42, metalness: 0.85 });
    this.hot = new THREE.MeshStandardMaterial({ color: 0x2d2a28, roughness: 0.6, metalness: 0.6 });
    this.white = new THREE.MeshStandardMaterial({ color: 0xdcdad4, roughness: 0.5, metalness: 0.1 });
    this.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, roughness: 0.15, metalness: 1.0 });
    this.tire = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.92 });
    this.pitDark = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.9, side: THREE.BackSide });
    this.glass = new THREE.MeshPhysicalMaterial({ color: 0x5f7686, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.4,
      envMapIntensity: 2.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    this.arches = [];                       // parts hidden in the cockpit view
    this.build();
    this.buildCockpit();
    this.finish();
  }

  add(g, mat, parent = this.body) { const m = new THREE.Mesh(g, mat); parent.add(m); return m; }

  build() {
    const B = this.body;

    // ---------------- Forward fuselage and radome (x = +9.55 nose tip back to x = 0.3) ----------------
    const FF = this.FF = prof({
      x:  [9.55, 9.35, 9.0, 8.5, 8.0, 7.5, 7.0, 6.5, 6.0, 5.0, 4.0, 3.0, 2.0, 1.0, 0.3],
      w:  [0.012, 0.17, 0.32, 0.46, 0.57, 0.66, 0.73, 0.78, 0.82, 0.86, 0.87, 0.87, 0.9, 0.95, 0.95],
      zt: [0.408, 0.25, 0.1, -0.06, -0.19, -0.29, -0.37, -0.44, -0.46, -0.46, -0.46, -0.46, -0.46, -0.46, -0.45],
      zb: [0.432, 0.58, 0.69, 0.76, 0.8, 0.81, 0.8, 0.78, 0.75, 0.72, 0.7, 0.67, 0.6, 0.52, 0.47],
      zc: [0.42, 0.42, 0.4, 0.37, 0.34, 0.31, 0.28, 0.25, 0.22, 0.2, 0.18, 0.15, 0.1, 0.06, 0.03],
      n:  [2, 2, 2, 2.1, 2.2, 2.3, 2.4, 2.6, 2.8, 3.0, 3.0, 3.0, 3.2, 3.4, 3.4],
    });
    const ffRing = (x, N = 56, a0 = 0, a1 = TAU, closed = true) =>
      sring(x, 0, FF.zc(x), FF.w(x), FF.zc(x) - FF.zt(x), FF.zb(x) - FF.zc(x), FF.n(x), N, a0, a1, closed);
    const span = (x0, x1, n, pw = 1) => Array.from({ length: n + 1 }, (_, i) => lerp(x0, x1, Math.pow(i / n, pw)));
    this.add(loft(span(9.55, 6.9, 16, 1.7).map((x) => ffRing(x))), this.radome);
    this.add(loft(span(6.9, 6.4, 3).map((x) => ffRing(x)), { capEnd: true }), this.skin);
    // Canopy profile (sill at z = -0.46).
    const CP = this.CP = prof({
      x:  [6.72, 6.45, 6.15, 5.85, 5.55, 5.2, 4.8, 4.3, 3.8, 3.3, 2.8, 2.4, 1.9],
      zt: [-0.47, -0.75, -1.0, -1.2, -1.33, -1.41, -1.45, -1.46, -1.45, -1.41, -1.35, -1.29, -1.19],
      w:  [0.44, 0.5, 0.54, 0.565, 0.58, 0.585, 0.585, 0.585, 0.58, 0.565, 0.54, 0.5, 0.4],
      n:  [2.8, 2.7, 2.5, 2.4, 2.3, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.2, 2.3],
    });
    const SILL = -0.46;
    // Mid fuselage with the cockpit opening between the canopy rails.
    const openAng = (x, inset) => {
      const w = FF.w(x), n = FF.n(x), wo = Math.min(CP.w(Math.min(6.72, Math.max(1.9, x))) - inset, w * 0.95);
      return Math.asin(Math.min(1, Math.pow(wo / w, n / 2)));
    };
    const midX = span(6.4, 2.2, 22);
    this.add(loft(midX.map((x) => { const a = openAng(x, 0.03); return ffRing(x, 56, a, TAU - a, false); }), { closed: false }), this.skin);
    this.fwdMid = B.children[B.children.length - 1];
    // Cockpit tub, seen from inside through the canopy.
    this.add(loft(span(6.36, 2.24, 12).map((x) => {
      const a = openAng(x, 0.05);
      return sring(x, 0, FF.zc(x), FF.w(x) - 0.05, FF.zc(x) - FF.zt(x) - 0.03, FF.zb(x) - FF.zc(x) - 0.25, FF.n(x), 40, a, TAU - a, false);
    }), { closed: false, capStart: true, capEnd: true }), this.pitDark);
    this.add(loft(span(2.2, 0.3, 8).map((x) => ffRing(x)), { capStart: true }), this.skin);
    // Chin pod (TCS / IRST fairing).
    this.add(loft(span(8.05, 6.7, 10).map((x) => {
      const t = (8.05 - x) / 1.35, k = Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) * (x < 7.0 ? (x - 6.7) / 0.3 : 1);
      return sring(x, 0, 0.8, 0.03 + 0.14 * k, 0.12, 0.02 + 0.2 * k, 2.2, 24);
    }), { capStart: true, capEnd: true }), this.skin);
    // Pitot probe on the radome tip.
    this.add(rod(V3(9.5, 0, 0.42), V3(10.0, 0, 0.42), 0.022, 0.009, 8), this.chrome);
    // Canopy glass.
    const cRing = (x, N = 48) => sring(x, 0, SILL, CP.w(x), SILL - CP.zt(x), 0.12, CP.n(x), N);
    this.canopy = this.add(loft(span(6.72, 1.9, 30).map((x) => cRing(x)), { capStart: true, capEnd: true }), this.glass);
    this.canopy.castShadow = false; this.canopy.renderOrder = 2;
    // Point on the canopy surface at station x where |y| = yy (upper half), pushed out by off.
    const cPt = (x, yy, side, off = 0.012) => {
      const w = CP.w(x), h = SILL - CP.zt(x), n = CP.n(x);
      const s = Math.min(1, Math.abs(yy) / w), c = Math.pow(Math.max(0, 1 - Math.pow(s, n)), 1 / n);
      const p = V3(x, side * s * w, SILL - h * c);
      const nrm = V3(0, side * Math.pow(s, n - 1) / w, -Math.pow(c, n - 1) / h).normalize();
      return p.addScaledVector(nrm, off);
    };
    // Frame: windscreen bow, the two windscreen posts (three-piece windscreen), sill rails and the aft frame.
    const bow = [], aft = [];
    for (let k = 0; k <= 24; k++) {
      const yy = lerp(-1, 1, k / 24);
      bow.push(cPt(5.72, yy * CP.w(5.72) * 0.985, Math.sign(yy) || 1));
      aft.push(cPt(2.0, yy * CP.w(2.0) * 0.98, Math.sign(yy) || 1));
    }
    this.add(tube(bow, 0.017), this.frame);
    this.add(tube(aft, 0.03), this.frame);
    for (const side of [-1, 1]) {
      const post = [], rail = [];
      for (let k = 0; k <= 10; k++) { const x = lerp(6.7, 5.72, k / 10); post.push(cPt(x, lerp(0.22, 0.32, k / 10), side, 0.01)); }
      this.add(tube(post, 0.013, 16), this.frame);
      for (let k = 0; k <= 30; k++) { const x = lerp(6.72, 1.95, k / 30); rail.push(V3(x, side * (CP.w(x) + 0.005), SILL + 0.03)); }
      this.add(tube(rail, 0.035, 60), this.frame);
      // Windscreen base frame.
      const base = []; for (let k = 0; k <= 6; k++) base.push(cPt(6.705, lerp(0, CP.w(6.705) * 0.98, k / 6) * side || 0.001, side, 0.004));
      this.add(tube(base, 0.028, 8), this.frame);
    }
    // Turtle deck (spine) behind the canopy, fading into the flat centre fuselage.
    const SP = prof({ x: [2.6, 2.2, 1.5, 1.0, 0.0, -1.0, -2.5, -4.0, -5.5], zt: [-1.15, -1.18, -1.12, -1.05, -0.87, -0.7, -0.56, -0.48, -0.43],
      w: [0.34, 0.4, 0.5, 0.56, 0.66, 0.74, 0.8, 0.8, 0.7], n: [2.3, 2.3, 2.3, 2.4, 2.5, 2.7, 3, 3.3, 3.5] });
    this.SP = SP;
    this.add(loft(span(2.6, -5.5, 28).map((x) => sring(x, 0, -0.3, SP.w(x), -0.3 - SP.zt(x), 0.25, SP.n(x), 40)), { capStart: true, capEnd: true }), this.skin);

    // ---------------- Centre fuselage "pancake" and beavertail ----------------
    const CB = this.CB = prof({
      x:  [2.2, 1.0, 0.0, -1.5, -3.0, -4.5, -6.0, -7.0, -8.0, -8.8, -9.45],
      w:  [0.9, 1.1, 1.22, 1.28, 1.28, 1.25, 1.15, 1.0, 0.8, 0.62, 0.48],
      zt: [-0.44, -0.44, -0.44, -0.43, -0.42, -0.4, -0.36, -0.32, -0.26, -0.18, -0.1],
      zb: [0.55, 0.5, 0.46, 0.45, 0.45, 0.44, 0.42, 0.4, 0.35, 0.28, 0.18],
      n:  [4, 4.5, 5, 5, 5, 5, 4.5, 4, 3.5, 3, 3],
    });
    const cbRing = (x) => { const zc = (CB.zt(x) + CB.zb(x)) / 2, h = (CB.zb(x) - CB.zt(x)) / 2; return sring(x, 0, zc, CB.w(x), h, h, CB.n(x), 48); };
    this.add(loft(span(2.2, -9.45, 30).map(cbRing), { capStart: true, capEnd: true }), this.skin);
    this.cbTop = (x, y) => {
      const zc = (CB.zt(x) + CB.zb(x)) / 2, h = (CB.zb(x) - CB.zt(x)) / 2, n = CB.n(x);
      return zc - h * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y) / CB.w(x), n)), 1 / n);
    };
    this.cbBot = (x, y) => 2 * ((CB.zt(x) + CB.zb(x)) / 2) - this.cbTop(x, y);
    // Fuel dump mast between the nozzles.
    this.add(rod(V3(-9.3, 0, 0.04), V3(-9.85, 0, 0.04), 0.06, 0.05, 10), this.metal);

    // ---------------- Engine nacelles, raked intakes, nozzles ----------------
    const NY = 1.43;
    const NC = this.NC = prof({
      x:  [3.6, 2.3, 1.0, 0.0, -1.5, -3.0, -4.5, -6.0, -7.2, -8.0, -8.6],
      w:  [0.46, 0.48, 0.51, 0.53, 0.54, 0.55, 0.55, 0.54, 0.52, 0.5, 0.49],
      zt: [-0.33, -0.34, -0.36, -0.37, -0.38, -0.38, -0.38, -0.37, -0.34, -0.31, -0.31],
      zb: [0.74, 0.82, 0.94, 1.0, 1.06, 1.1, 1.1, 1.05, 0.92, 0.78, 0.67],
      n:  [8, 7.5, 6, 5, 4.6, 4.2, 3.8, 3.2, 2.6, 2.2, 2.0],
    });
    const RAKE = 1.9; // intake lower lip sits this far aft of the upper lip
    this.nacelles = [];
    for (const side of [-1, 1]) {
      const yc = side * NY;
      const nRing = (x, inset = 0, N = 48, n) => {
        const zt = NC.zt(x) + inset, zb = NC.zb(x) - inset, zc = (zt + zb) / 2, h = (zb - zt) / 2;
        return sring(x, yc, zc, NC.w(x) - inset, h, h, n ?? NC.n(x), N);
      };
      const rake = (ring, x0) => { const zt = NC.zt(x0), zb = NC.zb(x0); for (const p of ring) p.x = x0 - RAKE * (p.z - zt) / (zb - zt); return ring; };
      const face = rake(nRing(3.6), 3.6);
      const body = [face, ...span(1.55, -8.6, 26).map((x) => nRing(x))];
      const nm = this.add(loft(body), this.skin); this.nacelles.push(nm);
      // Inner duct and lip.
      const inFace = rake(nRing(3.6, 0.055), 3.6);
      const duct = [inFace, rake(nRing(3.6, 0.07), 3.3), nRing(1.5, 0.08), nRing(0.9, 0.1, 48, 5), nRing(0.3, 0.13, 48, 3.5)];
      this.add(loft(duct, { inward: true }), this.intakeMat);
      this.add(loft([duct[duct.length - 1], nRing(0.2, 0.14, 48, 3.5)], { inward: true, capEnd: true }), this.dark);
      this.add(loft([face, inFace], { outDir: () => V3(1, 0, -0.2) }), this.skin);
      // Variable ramp panels in the duct roof.
      const rw = NC.w(3.6) - 0.09, zr = NC.zt(3.6) + 0.07;
      const ramp = new THREE.Mesh(new THREE.BoxGeometry(1.5, rw * 2, 0.02), this.dark);
      ramp.position.set(2.45, yc, zr + 0.16); ramp.rotation.y = -0.2; B.add(ramp);
      // Splitter plate: the inboard intake wall carried a little ahead of the raked lip, standing off the fuselage.
      const zt0 = NC.zt(3.6), zb0 = NC.zb(3.6), lipX = (z) => 3.6 - RAKE * (z - zt0) / (zb0 - zt0);
      const spY = side * (NY - NC.w(3.6) + 0.01);
      this.add(surface([zt0 + 0.02, (zt0 + zb0) / 2, zb0 - 0.05].map((z) => ({ y: z, xle: lipX(z) + 0.28, xte: lipX(z) - 0.6, z: 0, t: 0.012, f: SLAB })),
        { nC: 6, capStart: true, capEnd: true, matrix: new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 0, 1), V3(0, -1, 0)).setPosition(0, spY, 0) }), this.skin);
      // Diverter closing the boundary layer gap under the intake.
      this.add(surface([{ y: side * 0.8, xle: 2.6, xte: 0.2, z: 0.6, t: 0.05, f: SLAB }, { y: side * 1.02, xle: 2.6, xte: 0.2, z: 0.64, t: 0.05, f: SLAB }]), this.skin);
      // Nozzle: petal shroud, dark liner, flame holder.
      const NZ = 0.18;
      const petal = (x, r, amp, N = 64) => { const p = []; for (let k = 0; k < N; k++) { const a = k / N * TAU; const rr = r * (1 + amp * Math.cos(a * 16)); p.push(V3(x, yc + rr * Math.sin(a), NZ - rr * Math.cos(a))); } return p; };
      const rim = petal(-9.62, 0.435, 0.018);
      for (let k = 0; k < rim.length; k++) rim[k].x += 0.05 * Math.pow(Math.abs(Math.cos(k / rim.length * TAU * 8)), 3);
      this.add(loft([petal(-8.55, 0.492, 0), petal(-8.9, 0.482, 0.006), petal(-9.3, 0.46, 0.014), rim]), this.metal);
      const liner = [rim.map((p) => { const q = p.clone(); q.y = yc + (q.y - yc) * 0.92; q.z = NZ + (q.z - NZ) * 0.92; return q; }), petal(-9.2, 0.39, 0), petal(-8.8, 0.37, 0)];
      this.add(loft(liner, { inward: true, capEnd: true }), this.hot);
      this.add(loft([rim, liner[0]], { outDir: () => V3(-1, 0, 0) }), this.metal);
      const holder = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24), this.hot);
      holder.rotation.y = Math.PI / 2; holder.position.set(-8.85, yc, NZ); B.add(holder);
    }

    // ---------------- Glove (fixed, highly swept) and aft shelf ----------------
    // Glove leading edge from the nacelle top corner out to the pivot fairing: x = 3.03 - 2.364 (y - 1.73).
    const gle = (y) => 3.03 - (y - 1.73) * 2.364;
    const GZ = -0.2;
    this.gloves = [];
    for (const side of [-1, 1]) {
      const m = side < 0;
      const shelf = this.add(surface([
        { y: 1.75, xle: gle(1.75), xte: -8.75, z: GZ, t: 0.15, f: SLAB },
        { y: 2.05, xle: gle(2.05), xte: -8.75, z: GZ, t: 0.15, f: SLAB },
        { y: 2.34, xle: gle(2.34), xte: -8.75, z: GZ, t: 0.13, f: SLAB },
      ], { nC: 22, capEnd: true, mirror: m }), this.skin);
      const outer = this.add(surface([
        { y: 2.3, xle: gle(2.3), xte: -4.35, z: GZ, t: 0.15, f: SLAB },
        { y: 2.7, xle: gle(2.7), xte: -4.3, z: GZ, t: 0.15, f: SLAB },
        { y: 3.0, xle: gle(3.0), xte: -4.0, z: GZ, t: 0.13, f: SLAB },
        { y: 3.3, xle: gle(3.3), xte: -3.3, z: GZ, t: 0.1, f: SLAB },
        { y: 3.55, xle: gle(3.55), xte: -2.25, z: GZ, t: 0.05, f: SLAB },
      ], { nC: 18, capEnd: true, mirror: m }), this.skin);
      this.gloves.push({ side, shelf, outer });
      // Small fence on the outer glove.
      this.add(surface([{ y: 0, xle: -1.2, xte: -2.9, z: 0, t: 0.012 }, { y: 0.16, xle: -1.7, xte: -2.9, z: 0, t: 0.01 }], {
        nC: 6, capEnd: true, capStart: true,
        matrix: new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 0, -1), V3(0, 1, 0)).setPosition(0, side * 3.15, GZ - 0.075) }), this.skin);
    }

    // ---------------- Outer wing panels: pivot at y = +/-2.72 m ----------------
    // Unswept planform in the pivot frame: straight leading edge at x = +0.37, trailing edge
    // x = -2.56 + 0.2586 (y - 1.12), raked tip. The pivot rotation supplies the sweep (20 deg = LE sweep 20).
    const PX = -1.18, PZ = GZ;
    const wte = (y) => -2.56 + (y - 1.12) * 0.2586;
    const wst = (y, extra = {}) => ({ y, xle: 0.37, xte: wte(y), z: 0, t: (0.37 - wte(y)) * lerp(0.045, 0.034, y / 7.5), ...extra });
    const tipSt = { yle: 7.08, yte: 7.54, xle: 0.37, xte: -0.9, z: 0, t: 0.03 };
    const SL = 0.13, FL = 0.745, SPL = 0.58;
    this.wings = [];
    for (const side of [-1, 1]) {
      const m = side < 0;
      const pivot = new THREE.Group(); pivot.position.set(PX, side * 2.72, PZ); B.add(pivot);
      const wmesh = [];
      wmesh.push(this.add(surface([wst(0.15), wst(1.0)], { capStart: true, capEnd: true, mirror: m }), this.skin, pivot));
      wmesh.push(this.add(surface([wst(1.0), wst(1.25)], { u0: SL, capEnd: true, mirror: m }), this.skin, pivot));
      wmesh.push(this.add(surface([wst(1.25), wst(3.0), wst(5.0), wst(6.95)], { u0: SL, u1: FL, mirror: m }), this.skin, pivot));
      wmesh.push(this.add(surface([wst(6.95), wst(7.05), tipSt], { capStart: true, capEnd: true, mirror: m }), this.skin, pivot));
      // Slats, hinged along their lower trailing edge.
      const sA = afPt(station(wst(1.0)), SL, false), sB = afPt(station(wst(6.95)), SL, false);
      if (m) { sA.y = -sA.y; sB.y = -sB.y; }
      const slF = m ? hingeFrame(pivot, sB, sA) : hingeFrame(pivot, sA, sB);
      this.add(surface([wst(1.0), wst(3.5), wst(6.95)], { u1: SL - 0.004, capStart: true, capEnd: true, mirror: m, matrix: slF.inv }), this.skin, slF.hinge);
      // Flaps, hinged at mid-thickness of their leading edge.
      const fA = afPt(station(wst(1.25)), FL, true).lerp(afPt(station(wst(1.25)), FL, false), 0.5);
      const fB = afPt(station(wst(6.95)), FL, true).lerp(afPt(station(wst(6.95)), FL, false), 0.5);
      if (m) { fA.y = -fA.y; fB.y = -fB.y; }
      const flF = m ? hingeFrame(pivot, fB, fA) : hingeFrame(pivot, fA, fB);
      this.add(surface([wst(1.25), wst(3.5), wst(6.95)], { u0: FL + 0.004, capStart: true, capEnd: true, mirror: m, matrix: flF.inv }), this.skin, flF.hinge);
      // Spoilers: a thin plate on the upper skin ahead of the flaps, hinged at its leading edge.
      const spSt = (y) => ({ ...wst(y), surf: (x, yy, zc, th, top) => V3(x, yy, zc - th - (top ? 0.012 : 0.001)) });
      const pA = afPt(station(spSt(1.35)), SPL, true), pB = afPt(station(spSt(4.6)), SPL, true);
      if (m) { pA.y = -pA.y; pB.y = -pB.y; }
      const spF = m ? hingeFrame(pivot, pB, pA) : hingeFrame(pivot, pA, pB);
      this.add(surface([spSt(1.35), spSt(4.6)], { nC: 4, u0: SPL, u1: FL - 0.01, capStart: true, capEnd: true, mirror: m, matrix: spF.inv }), this.skin, spF.hinge);
      // Position light at the tip.
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: side > 0 ? 0x00ff66 : 0xff2222 }));
      light.position.set(0.28, side * 7.12, 0); pivot.add(light);
      this.wings.push({ side, pivot, flapHinge: flF.hinge, slatHinge: slF.hinge, spHinge: spF.hinge, meshes: wmesh });
    }

    // ---------------- Stabilators (all-moving, with the leading-edge sawtooth) ----------------
    this.stabs = [];
    const SZ = 0.02;
    for (const side of [-1, 1]) {
      const m = side < 0;
      const hinge = new THREE.Group(); hinge.position.set(-7.35, side * 2.05, SZ); B.add(hinge);
      const T = new THREE.Matrix4().makeTranslation(7.35, 0, -SZ);
      const T2 = new THREE.Matrix4().makeTranslation(0, -side * 2.05, 0).premultiply(T);
      const st = (y, xle, xte) => ({ y, xle, xte, z: SZ, t: (xte - xle) * -0.022 });
      this.add(surface([st(2.0, -5.02, -9.3), st(2.28, -5.35, -9.31), st(2.75, -5.9, -9.33)], { capStart: true, capEnd: true, mirror: m, matrix: T2 }), this.skin, hinge);
      this.add(surface([st(2.72, -6.2, -9.33), st(3.8, -7.4, -9.39), st(4.75, -8.5, -9.45), st(4.98, -8.95, -9.45)], { capEnd: true, mirror: m, matrix: T2 }), this.skin, hinge);
      this.stabs.push({ side, hinge });
    }

    // ---------------- Twin vertical tails, canted outboard 5 deg, with rudders ----------------
    this.rudders = []; this.fins = [];
    const CANT = 5 * DEG;
    for (const side of [-1, 1]) {
      const root = V3(-5.35, side * 1.5, -0.36);
      const ex = V3(1, 0, 0), es = V3(0, side * Math.sin(CANT), -Math.cos(CANT)), en = V3(0, side * Math.cos(CANT), Math.sin(CANT));
      const M = new THREE.Matrix4().makeBasis(ex, es, en).setPosition(root);
      // Fin planform in (x along body, s up the span): root chord 3.65 m, tip chord 1.15 m, LE sweep about 48 deg.
      const fle = (s) => -s * 1.125, fte = (s) => -3.65 - s * 0.172;
      const fs = (s, t) => ({ y: s, xle: fle(s), xte: fte(s), z: 0, t: t ?? (fle(s) - fte(s)) * 0.024 });
      const RU = 0.7;
      const fm = [
        this.add(surface([fs(-0.25), fs(0.25)], { capStart: true, capEnd: true, matrix: M }), this.skin),
        this.add(surface([fs(0.25), fs(1.3), fs(2.45)], { u1: RU, matrix: M }), this.skin),
        this.add(surface([fs(2.45), fs(2.62, 0.014)], { capStart: true, capEnd: true, matrix: M }), this.skin),
      ];
      this.fins.push({ side, M, en, root, fle, fte, meshes: fm });
      // Fin cap fairing (antenna) running aft past the trailing edge.
      const capRings = span(-2.72, -4.55, 10).map((x, i, a) => {
        const t = i / (a.length - 1), r = 0.065 * Math.sqrt(Math.sin(Math.min(1, t * 1.15) * Math.PI) + 0.02);
        return sring(x, 0, 0, r, r, r, 2, 16).map((p) => p.applyMatrix4(new THREE.Matrix4().makeBasis(ex, es, en).setPosition(root.clone().addScaledVector(es, 2.62))));
      });
      this.add(loft(capRings, { capStart: true, capEnd: true }), this.skin);
      // Rudder about its swept hinge line.
      const hp = (s) => { const st = station(fs(s)); const a = afPt(st, RU, true), b = afPt(st, RU, false); return a.lerp(b, 0.5).applyMatrix4(M); };
      const rf = hingeFrame(B, hp(0.25), hp(2.45), en.clone().multiplyScalar(side));
      this.add(surface([fs(0.25), fs(1.3), fs(2.45)], { u0: RU + 0.006, capStart: true, capEnd: true, matrix: rf.inv.clone().multiply(M) }), this.skin, rf.hinge);
      this.rudders.push({ side, rudHinge: rf.hinge });
    }

    // ---------------- Ventral fins under the nacelles ----------------
    for (const side of [-1, 1]) {
      const c = 18 * DEG;
      const root = V3(-4.2, side * (NY + 0.22), 0.98);
      const M = new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, side * Math.sin(c), Math.cos(c)), V3(0, side * Math.cos(c), -side * Math.sin(c))).setPosition(root);
      this.add(surface([{ y: -0.15, xle: 0.1, xte: -1.6, z: 0, t: 0.035 }, { y: 0.1, xle: -0.05, xte: -1.6, z: 0, t: 0.035 }, { y: 0.62, xle: -0.55, xte: -1.35, z: 0, t: 0.018 }],
        { capStart: true, capEnd: true, matrix: M, nC: 8 }), this.skin);
    }

    // ---------------- Speed brakes (upper and lower, on the beavertail) ----------------
    const sbX0 = -6.75, sbX1 = -8.15;
    const topSurf = (off0, off1) => (x, y, zc, th, top) => V3(x, y, this.cbTop(x, y) - (top ? off0 : off1));
    this.sbUp = new THREE.Group(); this.sbUp.position.set(sbX0, 0, this.cbTop(sbX0, 0)); B.add(this.sbUp);
    const toHinge = (g) => new THREE.Matrix4().makeTranslation(-g.position.x, -g.position.y, -g.position.z);
    this.add(surface([-0.46, -0.2, 0, 0.2, 0.46].map((y) => ({ y, xle: sbX0 + 0.02, xte: sbX1, z: 0, t: 0.01, surf: topSurf(0.018, -0.004) })),
      { nC: 6, capStart: true, capEnd: true, matrix: toHinge(this.sbUp) }), this.skin, this.sbUp);
    this.sbLo = [];
    for (const side of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(-7.0, side * 0.42, this.cbBot(-7.0, 0.42)); B.add(g);
      const botSurf = (x, y, zc, th, top) => V3(x, y, this.cbBot(x, y) + (top ? -0.004 : 0.016));
      this.add(surface([0.2, 0.42, 0.62].map((y) => ({ y: side * y, xle: -7.02, xte: -8.2, z: 0, t: 0.01, surf: botSurf })),
        { nC: 5, capStart: true, capEnd: true, matrix: toHinge(g) }), this.skin, g);
      this.sbLo.push(g);
    }

    // ---------------- Cockpit interior visible from outside: seats, consoles, crew ----------------
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.85 });
    const suit = new THREE.MeshStandardMaterial({ color: 0x4f5446, roughness: 0.9 });
    const helm = new THREE.MeshStandardMaterial({ color: 0xcfcbbd, roughness: 0.45 });
    const visor = new THREE.MeshStandardMaterial({ color: 0x1b1f22, roughness: 0.1, metalness: 0.6 });
    for (const [sx, top, hideable] of [[4.78, -1.14, true], [3.36, -1.12, false]]) {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.8), seatMat); seat.position.set(sx, 0, top + 0.44); B.add(seat);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.24), seatMat); head.position.set(sx + 0.02, 0, top + 0.02); B.add(head);
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.22, 4, 12), suit); torso.scale.set(0.75, 1.15, 1); torso.rotation.x = Math.PI / 2; torso.position.set(sx + 0.24, 0, top + 0.46);
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12), helm); helmet.position.set(sx + 0.3, 0, top + 0.08);
      const vis = new THREE.Mesh(new THREE.SphereGeometry(0.138, 16, 8, -1.1, 2.2, 1.2, 0.8), visor);
      vis.rotation.z = Math.PI / 2; vis.position.copy(helmet.position);
      B.add(torso, helmet, vis);
      if (hideable) this.arches.push(torso, helmet, vis);
    }
    // Rear cockpit coaming and instrument panel behind the front seat.
    const coam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.8, 0.22), seatMat); coam.position.set(4.52, 0, -0.62); B.add(coam);

    // ---------------- Landing gear ----------------
    this.gearParts = [];
    const wheel = (r, w) => {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.TorusGeometry(r - w * 0.32, w * 0.42, 10, 28), this.tire); t.scale.set(1, 1, 1.15); g.add(t);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w * 0.8, 20), this.white); hub.rotation.x = Math.PI / 2; g.add(hub);
      g.rotation.x = Math.PI / 2; // wheel axis along body y
      const wrap = new THREE.Group(); wrap.add(g); return wrap;
    };
    // Nose gear (retracts forward). Tyre bottoms at z = 2.05 (FDM contact 1.95 plus static compression).
    const ng = new THREE.Group(); ng.position.set(6.25, 0, 0.78); B.add(ng);
    ng.add(new THREE.Mesh(rod(V3(0, 0, 0), V3(0, 0, 0.62), 0.075), this.white));
    ng.add(new THREE.Mesh(rod(V3(0, 0, 0.55), V3(0, 0, 0.99), 0.05), this.chrome));
    ng.add(new THREE.Mesh(rod(V3(0, -0.22, 0.99), V3(0, 0.22, 0.99), 0.035), this.white));
    for (const s of [-1, 1]) { const w = wheel(0.28, 0.17); w.position.set(0, s * 0.2, 0.99); ng.add(w); }
    ng.add(new THREE.Mesh(rod(V3(0, 0, 0.32), V3(0.75, 0, 0.02), 0.03), this.white));                 // drag brace
    ng.add(new THREE.Mesh(rod(V3(0.05, 0, 0.9), V3(0.72, 0, 0.72), 0.03), this.white));                // launch bar (stowed up)
    const lt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 0.6 }));
    lt.position.set(0.08, 0, 0.6); ng.add(lt);
    for (const s of [-1, 1]) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.02, 0.36), this.skin); d.position.set(-0.25, s * 0.25, 0.2); d.rotation.x = s * 0.12; ng.add(d);
    }
    this.gearParts.push({ g: ng, kind: 'nose' });
    for (const side of [-1, 1]) {
      // Main gear: trunnion aft in the glove, leg raked forward down to the axle (x = -0.75, y = +/-2.5).
      const mg = new THREE.Group(); mg.position.set(-1.25, side * 2.14, -0.02); B.add(mg);
      const axle = V3(0.5, side * 0.24, 1.6);
      mg.add(new THREE.Mesh(rod(V3(0, 0, 0), V3(0.42, side * 0.2, 1.25), 0.11), this.white));
      mg.add(new THREE.Mesh(rod(V3(0.4, side * 0.19, 1.15), axle, 0.075), this.chrome));
      mg.add(new THREE.Mesh(rod(V3(0.24, side * 0.12, 0.72), V3(-0.75, -side * 0.25, 0.1), 0.05), this.white));
      mg.add(new THREE.Mesh(rod(V3(0.5, side * 0.12, 1.6), V3(0.5, side * 0.36, 1.6), 0.05), this.white));
      const w = wheel(0.47, 0.28); w.position.set(axle.x, side * 0.36, axle.z); mg.add(w);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.025, 0.75), this.skin);
      door.position.set(0.25, side * 0.04, 0.62); door.rotation.x = -side * 0.16; door.rotation.y = -0.32; mg.add(door);
      this.gearParts.push({ g: mg, kind: 'main', side });
    }

    // ---------------- Tailhook ----------------
    this.hook = new THREE.Group(); this.hook.position.set(-5.95, 0, 0.42); B.add(this.hook);
    this.hook.add(new THREE.Mesh(rod(V3(0, 0, 0), V3(-2.12, 0, 0.11), 0.05, 0.04), this.metal));
    const hkTip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.14, 0.14), this.dark); hkTip.position.set(-2.2, 0, 0.16); this.hook.add(hkTip);
    const hkBand = new THREE.Mesh(rod(V3(-1.6, 0, 0.083), V3(-1.9, 0, 0.098), 0.052), this.white); this.hook.add(hkBand);

    // ---------------- Afterburner flames: layered additive cones with shock diamonds ----------------
    this.flames = [];
    // Fade along the plume: bright at the nozzle, gone at the tip (cone uv v runs along its height).
    const fadeTex = (() => { const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = g; x.fillRect(0, 0, 4, 128); return new THREE.CanvasTexture(c); })();
    const flameMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, map: fadeTex, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    for (const side of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(-9.62, side * NY, 0.18); B.add(g);
      // Short plume: orange skirt about 3 m, blue-white core about 1.5 m, five shock diamonds, glowing exit disc.
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.0, 20, 1, true), flameMat(0xff7a2a, 0.3));
      outer.rotation.z = Math.PI / 2; outer.position.x = -1.5; g.add(outer);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.5, 16, 1, true), flameMat(0xbfd8ff, 0.8));
      core.rotation.z = Math.PI / 2; core.position.x = -0.75; g.add(core);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.43, 20), new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      disc.rotation.y = -Math.PI / 2; disc.position.x = 0.02; g.add(disc);
      const diamonds = [];
      for (let i = 0; i < 5; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        d.scale.set(1.9, 1, 1); d.position.x = -0.45 - i * 0.52; g.add(d); diamonds.push(d);
      }
      g.visible = false;
      this.flames.push({ g, outer, core, diamonds, disc });
    }
    // Glove shoulder pylons with launch rails.
    for (const side of [-1, 1]) {
      this.add(surface([{ y: -0.06, xle: 1.7, xte: -0.5, z: 0, t: 0.07, f: SLAB }, { y: 0.26, xle: 1.55, xte: -0.35, z: 0, t: 0.06, f: SLAB }],
        { nC: 10, capStart: true, capEnd: true, matrix: new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 0, 1), V3(0, -1, 0)).setPosition(0, side * 2.78, GZ + 0.12) }), this.skin);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.07), this.frame); rail.position.set(0.55, side * 2.78, GZ + 0.42); B.add(rail);
    }
    // Blade antennas: UHF/TACAN on the spine and under the forward fuselage, and the AOA probe.
    const blade = (x, y, z, h, c, up) => {
      const M = new THREE.Matrix4().makeBasis(V3(1, 0, 0), V3(0, 0, up ? -1 : 1), V3(0, 1, 0)).setPosition(x, y, z);
      return this.add(surface([{ y: -0.03, xle: 0, xte: -c, z: 0, t: 0.012 }, { y: h, xle: -c * 0.55, xte: -c * 0.95, z: 0, t: 0.006 }], { nC: 5, capEnd: true, capStart: true, matrix: M }), this.skin);
    };
    blade(0.4, 0, SP.zt(0.4) + 0.02, 0.2, 0.35, true);
    blade(-3.2, 0, SP.zt(-3.2) + 0.02, 0.16, 0.3, true);
    blade(3.4, 0, FF.zb(3.4) - 0.02, 0.18, 0.3, false);
    this.add(rod(V3(7.3, 0.62, 0.05), V3(7.62, 0.66, 0.05), 0.012, 0.006, 6), this.chrome);
    // Anti-collision beacon on the spine.
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    this.beacon.position.set(-1.3, 0, SP.zt(-1.3) - 0.02); B.add(this.beacon);
  }

  // Front cockpit seen from the pilot's eye (EYE_POINT 5.2, 0, -1.15).
  buildCockpit() {
    const ck = new THREE.Group(); this.body.add(ck); this.cockpit = ck;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 384;
    const x = c.getContext('2d');
    x.fillStyle = '#23272c'; x.fillRect(0, 0, 1024, 384);
    const dial = (cx, cy, r, label) => {
      x.fillStyle = '#0c0e10'; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#8a9096'; x.lineWidth = 3; x.stroke();
      x.strokeStyle = '#d8dcd6'; x.lineWidth = 2;
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); x.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); x.stroke(); }
      x.fillStyle = '#c9cdc7'; x.font = '15px Arial'; x.textAlign = 'center'; x.fillText(label, cx, cy + r * 0.45);
    };
    // Vertical display indicator (VDI) and horizontal situation display, flanked by round gauges.
    x.fillStyle = '#050706'; x.fillRect(392, 40, 240, 200); x.strokeStyle = '#555c62'; x.lineWidth = 6; x.strokeRect(392, 40, 240, 200);
    x.fillStyle = '#123a1d'; x.fillRect(400, 48, 224, 92); x.fillStyle = '#2b2012'; x.fillRect(400, 140, 224, 92);
    x.strokeStyle = '#7dffa8'; x.lineWidth = 2; x.beginPath(); x.moveTo(400, 140); x.lineTo(624, 140); x.stroke();
    x.fillStyle = '#050706'; x.fillRect(412, 252, 200, 120); x.strokeStyle = '#555c62'; x.strokeRect(412, 252, 200, 120);
    dial(300, 110, 62, 'AIRSPEED'); dial(300, 260, 55, 'AOA'); dial(724, 110, 62, 'ALT'); dial(724, 260, 55, 'VVI');
    dial(150, 120, 48, 'RPM L'); dial(150, 250, 48, 'RPM R'); dial(874, 120, 48, 'FUEL'); dial(874, 250, 48, 'G');
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.panelCanvas = c; this.panelTex = tex;
    const panelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.37), panelMat);
    panel.position.set(6.02, 0, -0.6);
    panel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0.35, 0, -1).normalize(), V3(-1, 0, -0.35).normalize()));
    ck.add(panel);
    // Glare shield over the panel.
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.95, side: THREE.DoubleSide }));
    shield.rotation.z = Math.PI / 2; shield.position.set(6.18, 0, -0.6); shield.scale.set(1, 1, 0.35); ck.add(shield);
    // HUD combiner glass.
    const comb = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.22), new THREE.MeshPhysicalMaterial({ color: 0x88ffcc, transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }));
    comb.position.set(6.0, 0, -0.9); comb.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0.3, 0, -1).normalize(), V3(-1, 0, -0.3).normalize()));
    ck.add(comb);
    // Canopy sills inside the cockpit and the three rear-view mirrors on the windscreen bow.
    const mirMat = new THREE.MeshStandardMaterial({ color: 0x6d757c, metalness: 1, roughness: 0.25 });
    for (const [y, z] of [[0, -1.29], [-0.4, -1.12], [0.4, -1.12]]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.075, 0.026), mirMat); mirror.position.set(5.68, y, z + 0.04); ck.add(mirror);
    }
  }

  // Paint (vertex colours, darker on upward-facing skin), shadows, decals and markings.
  finish() {
    this.root.updateMatrixWorld(true);
    const nm = new THREE.Matrix3(), n = V3(0, 0, 0), col = new THREE.Color();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = !o.material.transparent && !o.material.isMeshBasicMaterial; o.receiveShadow = true;
      if (o.material !== this.skin) return;
      const g = o.geometry; if (!g.attributes.normal) g.computeVertexNormals();
      nm.getNormalMatrix(o.matrixWorld);
      const N = g.attributes.normal, cols = new Float32Array(N.count * 3);
      for (let i = 0; i < N.count; i++) {
        n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
        col.copy(PAINT_LOW).lerp(PAINT_TOP, smooth((-n.z + 0.15) / 0.75));
        cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    });
    this.markings();
  }

  // Project a canvas decal onto a mesh. right is the text direction; normal points out of the surface.
  decal(mesh, pos, normal, right, w, h, tex, o = {}) {
    normal = normal.clone().normalize();
    right = right.clone().sub(normal.clone().multiplyScalar(right.dot(normal))).normalize();
    const up = normal.clone().cross(right);
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal));
    const g = new DecalGeometry(mesh, pos, e, V3(w, h, o.depth ?? 0.35));
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.62, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -4,
      depthWrite: false, ...(o.emissive ? { emissive: o.emissive, emissiveMap: tex, emissiveIntensity: o.ei ?? 0.5 } : {}) });
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.renderOrder = 1;
    this.body.add(m); return m;
  }

  markings() {
    const text = (s, w, h, font, color = MARK) => canvasTex(w, h, (x) => {
      x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s, w / 2, h / 2 + h * 0.04);
    });
    const FF = this.FF;
    const strip = canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#c9d6b0'; x.fillRect(8, 4, w - 16, h - 8); });
    for (const side of [-1, 1]) {
      const fwdR = V3(side, 0, 0);
      // Modex on the nose, aft of the radome joint.
      const xm = 5.95, wm = FF.w(xm);
      this.decal(this.fwdMid, V3(xm, side * wm, 0.3), V3(0, side, 0.12), fwdR, 0.78, 0.4, text('201', 512, 256, 'bold 230px Arial'));
      // NAVY on the nacelle sides, under the glove.
      const nac = this.nacelles[side > 0 ? 1 : 0];
      this.decal(nac, V3(-3.2, side * (1.43 + 0.55), 0.5), V3(0, side, 0), fwdR, 1.3, 0.34, text('NAVY', 512, 128, 'bold 118px Arial'));
      // Formation light strips: forward fuselage below the canopy and aft on the nacelles.
      this.decal(this.fwdMid, V3(3.9, side * FF.w(3.9), -0.05), V3(0, side, 0), fwdR, 0.07, 0.42, strip, { emissive: 0xc8f0a0, ei: 0.15 });
      this.decal(nac, V3(-7.0, side * (1.43 + 0.52), 0.3), V3(0, side, 0), fwdR, 0.07, 0.42, strip, { emissive: 0xc8f0a0, ei: 0.15 });
      // Glove top formation strip.
      const gl = this.gloves.find((g) => g.side === side).outer;
      this.decal(gl, V3(-0.6, side * 3.02, -0.34), V3(0, 0, -1), V3(0, side, 0), 0.07, 0.5, strip, { emissive: 0xc8f0a0, ei: 0.15, depth: 0.4 });
      // Gun port and vents, left side only.
      if (side < 0) {
        const gun = canvasTex(512, 256, (x, w, h) => {
          x.fillStyle = '#1f2226'; x.beginPath(); x.ellipse(w * 0.82, h * 0.5, 44, 34, 0, 0, TAU); x.fill();
          x.strokeStyle = '#3a4046'; x.lineWidth = 6; x.strokeRect(w * 0.08, h * 0.2, w * 0.62, h * 0.6);
          x.fillStyle = '#2a2e33'; for (let i = 0; i < 6; i++) x.fillRect(w * 0.13 + i * 50, h * 0.32, 26, h * 0.36);
        });
        this.decal(this.fwdMid, V3(5.35, -FF.w(5.35), 0.52), V3(0, -1, 0.15), V3(-1, 0, 0), 0.9, 0.3, gun);
      }
      // Tail: squadron band near the fin tip and the tail code, on the outboard face of each fin.
      const fin = this.fins.find((f) => f.side === side);
      const s0 = 0.3, s1 = 2.55, x0 = -4.4, x1 = 0.1, W = 1024, H = Math.round(W * (s1 - s0) / (x1 - x0));
      const px = (xl) => side > 0 ? (xl - x0) / (x1 - x0) * W : (x1 - xl) / (x1 - x0) * W;
      const py = (s) => (s1 - s) / (s1 - s0) * H;
      const tt = canvasTex(W, H, (x) => {
        const band = (sa, sb, col) => {
          x.fillStyle = col; x.beginPath();
          x.moveTo(px(fin.fle(sa) - 0.05), py(sa)); x.lineTo(px(fin.fte(sa) + 0.75), py(sa));
          x.lineTo(px(fin.fte(sb) + 0.75), py(sb)); x.lineTo(px(fin.fle(sb) - 0.05), py(sb)); x.closePath(); x.fill();
        };
        band(2.05, 2.3, '#4b535b'); band(1.95, 2.0, '#4b535b');
        x.fillStyle = MARK; x.font = 'bold 150px Arial'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText('AJ', px(-2.05), py(1.2));
        x.font = 'bold 60px Arial'; x.fillText('201', px(-1.3), py(0.55));
      });
      const c = V3((x0 + x1) / 2, (s0 + s1) / 2, 0.07).applyMatrix4(fin.M);
      const nrm = fin.en.clone();
      const upv = V3(0, side * Math.sin(5 * DEG), -Math.cos(5 * DEG));
      const rgt = upv.clone().cross(nrm).normalize();
      for (const mesh of fin.meshes) this.decal(mesh, c, nrm, rgt, x1 - x0, s1 - s0, tt, { depth: 0.12 });
      // Panel lines on the glove top: stowed glove vane outline and shelf joints.
      const gx0 = -8.2, gx1 = 3.2, gy0 = 1.7, gy1 = 3.6, GW = 2048, GH = Math.round(GW * (gy1 - gy0) / (gx1 - gx0));
      const gp = (x, y) => [(x - gx0) / (gx1 - gx0) * GW, (y - gy0) / (gy1 - gy0) * GH];
      const gTex = canvasTex(GW, GH, (x) => {
        x.strokeStyle = 'rgba(38,42,48,0.55)'; x.lineWidth = 2.2;
        const poly = (pts, close = true) => { x.beginPath(); pts.forEach((p, i) => { const [u, v] = gp(...p); if (i) x.lineTo(u, v); else x.moveTo(u, v); }); if (close) x.closePath(); x.stroke(); };
        poly([[2.95, 1.83], [0.95, 2.68], [0.7, 2.63], [2.7, 1.8]]);
        poly([[1.2, 1.9], [-3.9, 3.02]], false);
        for (const xx of [-1.6, -3.9, -6.1]) poly([[xx, 1.95], [xx - 0.1, 2.33]], false);
        poly([[-4.6, 2.33], [-8.4, 2.33]], false);
        x.strokeStyle = 'rgba(38,42,48,0.4)'; x.setLineDash([3, 7]);
        poly([[1.8, 2.05], [-2.6, 3.3]], false);
      });
      const yc = side * (gy0 + gy1) / 2;
      for (const mesh of [this.gloves.find((g) => g.side === side).shelf, gl]) {
        const d = this.decal(mesh, V3((gx0 + gx1) / 2, yc, -0.36), V3(0, 0, -1), V3(1, 0, 0), gx1 - gx0, gy1 - gy0, gTex, { depth: 0.26 });
        // Seen from above with text-right = +x, decal up is -y; flip v on the left so both sides share one canvas.
        if (side < 0) d.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = 1 - v; });
      }
    }
  }

  // Update moving parts from the flight model state.
  setCockpitView(on) { this.canopy.material.opacity = on ? 0.06 : 0.4; for (const a of this.arches) a.visible = !on; }
  update(ac, t) {
    const sweep = ac.sweep ?? 20;
    for (const w of this.wings) {
      // Rotation about the pivot; at 20 deg program sweep the leading edge sits 20 deg aft.
      w.pivot.rotation.z = w.side * sweep * DEG;
      w.flapHinge.rotation.y = (ac.flaps ?? 0) * 35 * DEG;           // trailing edge down
      w.slatHinge.rotation.y = -(ac.slats ?? 0) * 17 * DEG;          // leading edge down
      const sp = (ac.surf?.sp ?? 0) * w.side;
      w.spHinge.rotation.y = -(Math.max(0, sp) * 55 * DEG + (ac.ctl?.dlc && ac.flaps > 0.5 ? 3 * DEG : 0)); // trailing edge up
    }
    for (const s of this.stabs) {
      // Positive stab = trailing edge down; da = left minus right.
      const ds = (ac.surf?.ds ?? 0) - s.side * (ac.surf?.da ?? 0) * 0.5;
      s.hinge.rotation.y = ds * DEG;
    }
    for (const r of this.rudders) r.rudHinge.rotation.y = -(ac.surf?.dr ?? 0) * DEG;   // positive = trailing edge left
    const sb = ac.speedbrake ?? 0;
    this.sbUp.rotation.y = -sb * 55 * DEG;
    for (const g of this.sbLo) g.rotation.y = sb * 45 * DEG;
    const g = ac.gear ?? 1;
    for (const p of this.gearParts) {
      p.g.rotation.y = (1 - g) * (p.kind === 'nose' ? 1.75 : 1.6);   // both retract forward
      p.g.visible = g > 0.02;
    }
    this.hook.rotation.y = (ac.hookPos ?? 0) * 0.52;
    const ab = [ac.engL?.ab ?? 0, ac.engR?.ab ?? 0];
    this.flames.forEach((f, i) => {
      const a = ab[i];
      f.g.visible = a > 0.02;
      if (!f.g.visible) return;
      const flick = 0.92 + 0.08 * Math.sin(t * 60 + i * 2) + 0.05 * Math.sin(t * 23.7);
      f.g.scale.set(0.55 + 0.6 * a * flick, 1, 1);
      f.outer.material.opacity = (0.15 + 0.25 * a) * flick; f.core.material.opacity = 0.45 + 0.4 * a;
      f.disc.material.opacity = 0.5 + 0.45 * a;
      f.diamonds.forEach((d, k) => { d.material.opacity = (0.6 - k * 0.1) * a * flick; });
    });
    this.beacon.visible = Math.floor(t * 1.2) % 2 === 0;
  }
}
