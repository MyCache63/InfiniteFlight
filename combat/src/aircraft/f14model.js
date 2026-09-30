// Procedural F-14 Tomcat model built in body axes (x forward, y right, z down), metres, origin at the CG.
// Proportions from the AFWAL-TR-80-3141 three-view (Fig. 35) and published dimensions:
// length 19.1 m, span 19.55 m at 20 deg sweep and 11.65 m at 68 deg, height 4.88 m.
// Moving parts: outer wings (sweep), stabilators, rudders, flaps, slats, spoilers, gear, hook, speed brakes,
// afterburner flames.
import * as THREE from 'three';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Superellipse loft along x. sections: {x, w, top, bot, zc, n}
function loft(sections, seg = 36, capStart = true, capEnd = true) {
  const pos = [], uv = [], idx = [];
  const rings = sections.length;
  for (let r = 0; r < rings; r++) {
    const s = sections[r];
    for (let k = 0; k <= seg; k++) {
      const t = k / seg * Math.PI * 2;
      const c = Math.cos(t), sn = Math.sin(t);
      const e = 2 / (s.n ?? 2.5);
      const y = s.w * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const hz = c >= 0 ? s.top : s.bot;
      const z = s.zc - hz * Math.sign(c) * Math.pow(Math.abs(c), e);
      pos.push(s.x, y, z); uv.push(k / seg, r / (rings - 1));
    }
  }
  for (let r = 0; r < rings - 1; r++) for (let k = 0; k < seg; k++) {
    const a = r * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const addCap = (r, flip) => {
    const s = sections[r]; const base = pos.length / 3;
    pos.push(s.x, 0, s.zc); uv.push(0.5, 0.5);
    for (let k = 0; k < seg; k++) {
      const a = r * (seg + 1) + k, b = a + 1;
      if (flip) idx.push(base, b, a); else idx.push(base, a, b);
    }
  };
  if (capStart) addCap(0, true);
  if (capEnd) addCap(rings - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Thin lifting surface from a planform: root and tip chords with sweep, airfoil thickness ratio.
// Built in its own frame: span along +y, chord along -x from the leading edge, then placed by the caller.
function wingSurface({ span, rootChord, tipChord, sweepLE, tc = 0.06, tcTip, dihedral = 0, nChord = 14, nSpan = 8, mirror = false }) {
  const pos = [], idx = [];
  const tanL = Math.tan(sweepLE * Math.PI / 180);
  tcTip = tcTip ?? tc;
  for (let j = 0; j <= nSpan; j++) {
    const f = j / nSpan, y = span * f;
    const chord = rootChord + (tipChord - rootChord) * f, xle = -y * tanL;
    const t = (tc + (tcTip - tc) * f) * chord;
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i <= nChord; i++) {
        const u = i / nChord;
        const xc = 0.5 - 0.5 * Math.cos(u * Math.PI); // cosine spacing
        const th = 5 * t * (0.2969 * Math.sqrt(xc) - 0.126 * xc - 0.3516 * xc * xc + 0.2843 * xc ** 3 - 0.1036 * xc ** 4);
        const z = (side === 0 ? -th : th) + y * Math.tan(-dihedral * Math.PI / 180);
        pos.push(xle - xc * chord, mirror ? -y : y, z);
      }
    }
  }
  const row = (nChord + 1) * 2;
  for (let j = 0; j < nSpan; j++) for (let side = 0; side < 2; side++) for (let i = 0; i < nChord; i++) {
    const a = j * row + side * (nChord + 1) + i, b = a + 1, c = a + row, d = c + 1;
    const flip = (side === 1) !== mirror;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  // Tip cap.
  const j = nSpan;
  for (let i = 0; i < nChord; i++) {
    const a = j * row + i, b = a + 1, c = j * row + nChord + 1 + i, d = c + 1;
    if (mirror) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function panelTexture(base = '#8e969e', seed = 3, size = 1024, lines = 26) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Subtle weathering blotches.
  for (let i = 0; i < 220; i++) {
    const g = x.createRadialGradient(r() * size, r() * size, 0, r() * size, r() * size, 10 + r() * 90);
    const d = r() > 0.5 ? 255 : 0;
    g.addColorStop(0, `rgba(${d},${d},${d},${0.035 + r() * 0.03})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, size, size);
  }
  x.strokeStyle = 'rgba(40,44,50,0.35)'; x.lineWidth = 1.2;
  for (let i = 0; i < lines; i++) {
    const p = r() * size;
    x.beginPath(); if (r() > 0.5) { x.moveTo(p, 0); x.lineTo(p, size); } else { x.moveTo(0, p); x.lineTo(size, p); } x.stroke();
  }
  // Rivet lines.
  x.fillStyle = 'rgba(30,32,36,0.22)';
  for (let i = 0; i < 12; i++) { const p = r() * size; for (let k = 0; k < size; k += 9) x.fillRect(p, k, 1.2, 1.2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function decal(text, { w = 2, h = 0.6, color = '#3b3f45', font = 'bold 160px Arial', bg = null } = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
  const x = c.getContext('2d'); if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
  x.fillStyle = color; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
}

export class F14Model {
  constructor() {
    this.root = new THREE.Group();          // oriented by the sim each frame
    this.body = new THREE.Group();          // body axes x fwd, y right, z down
    this.root.add(this.body);
    const tex = panelTexture();
    tex.repeat.set(3, 1);
    this.skin = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex, roughness: 0.62, metalness: 0.12 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.5, metalness: 0.4 });
    this.radome = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.45, metalness: 0.05 });
    this.metal = new THREE.MeshStandardMaterial({ color: 0x6d6a66, roughness: 0.35, metalness: 0.9 });
    this.white = new THREE.MeshStandardMaterial({ color: 0xe8e8e4, roughness: 0.5 });
    this.tire = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    this.glass = new THREE.MeshPhysicalMaterial({ color: 0x9fb4c4, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.28, envMapIntensity: 1.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
    this.build();
    this.buildCockpit();
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  add(g, mat, parent = this.body) { const m = new THREE.Mesh(g, mat); parent.add(m); return m; }

  build() {
    // --- Forward fuselage and radome (x from +9.55 nose tip back to +2) ---
    const fwd = [];
    const nose = [[9.55, 0.02, 0.02, 0.02, 0.28], [9.2, 0.26, 0.27, 0.26, 0.26], [8.6, 0.48, 0.47, 0.46, 0.22], [7.8, 0.66, 0.62, 0.62, 0.16],
      [7.0, 0.76, 0.72, 0.72, 0.12], [6.2, 0.82, 0.78, 0.82, 0.08], [5.2, 0.9, 0.8, 0.92, 0.06], [4.2, 0.98, 0.78, 1.0, 0.08],
      [3.2, 1.06, 0.74, 1.05, 0.12], [2.2, 1.1, 0.7, 1.06, 0.16]];
    for (const [x, w, top, bot, zc] of nose) fwd.push({ x, w, top, bot, zc, n: x > 8 ? 2 : 2.4 });
    const radomeG = loft(fwd.slice(0, 5), 40, false, false);
    this.add(radomeG, this.radome);
    this.add(loft(fwd.slice(4), 40, false, false), this.skin);
    // Canopy: tandem two-seat bubble.
    const can = [];
    for (const [x, w, top] of [[6.75, 0.05, 0.02], [6.35, 0.46, 0.4], [5.7, 0.6, 0.62], [4.8, 0.62, 0.7], [3.9, 0.6, 0.7], [3.1, 0.52, 0.56], [2.55, 0.4, 0.36], [2.15, 0.25, 0.15]])
      can.push({ x, w, top, bot: 0.05, zc: -0.62, n: 2.2 });
    this.canopy = this.add(loft(can, 40), this.glass);
    // Canopy frame arches.
    for (const x of [6.3, 4.4]) {
      const r = x > 6 ? 0.46 : 0.61;
      const arch = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 24, Math.PI), this.dark);
      arch.position.set(x, 0, -0.62);
      arch.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0, 0, -1), V3(-1, 0, 0)));
      arch.scale.set(1, x > 6 ? 0.9 : 1.14, 1); this.body.add(arch); (this.arches ||= []).push(arch);
    }
    // Spine behind the canopy blending into the center fuselage.
    const spine = [];
    for (const [x, w, top] of [[2.6, 0.5, 0.62], [1.2, 0.72, 0.6], [-1.2, 0.9, 0.5], [-3.8, 0.9, 0.38], [-6.4, 0.7, 0.28], [-8.6, 0.4, 0.15]])
      spine.push({ x, w, top, bot: 0.2, zc: -0.5, n: 2.8 });
    this.add(loft(spine, 32), this.skin);

    // --- Center fuselage "pancake" between the nacelles ---
    const pan = [];
    for (const [x, w, top, bot] of [[2.8, 1.2, 0.55, 0.85], [0.5, 2.4, 0.5, 0.75], [-2.5, 2.6, 0.45, 0.65], [-5.5, 2.3, 0.4, 0.55], [-7.6, 1.6, 0.32, 0.35], [-8.8, 0.9, 0.2, 0.2]])
      pan.push({ x, w, top, bot, zc: 0.25, n: 4.5 });
    this.add(loft(pan, 40), this.skin);

    // --- Engine nacelles with rectangular inlets ---
    for (const side of [-1, 1]) {
      const nac = [];
      for (const [x, w, top, bot, n] of [[4.2, 0.55, 0.72, 0.72, 5], [3.2, 0.6, 0.72, 0.72, 5], [0.5, 0.64, 0.7, 0.7, 4], [-3.5, 0.66, 0.66, 0.66, 3.2],
        [-6.5, 0.62, 0.6, 0.6, 2.4], [-8.2, 0.56, 0.56, 0.56, 2.1], [-9.0, 0.52, 0.52, 0.52, 2]])
        nac.push({ x, w, top, bot, zc: 0.55, n });
      const m = this.add(loft(nac, 32, false, false), this.skin);
      m.position.y = side * 1.35;
      // Inlet mouth (dark) and splitter plate.
      const mouth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.3), this.dark);
      mouth.position.set(4.19, side * 1.35, 0.55); mouth.rotation.y = -Math.PI / 2; this.body.add(mouth);
      // Nozzle: turkey-feather ring and dark interior.
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 0.9, 20, 1, true), this.metal);
      noz.rotation.z = Math.PI / 2; noz.position.set(-9.4, side * 1.35, 0.55); this.body.add(noz);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.46, 20), this.dark);
      inner.rotation.y = Math.PI / 2; inner.position.set(-9.2, side * 1.35, 0.55); this.body.add(inner);
      // Ventral fin under each nacelle.
      const vf = wingSurface({ span: 0.75, rootChord: 1.6, tipChord: 0.9, sweepLE: 50, tc: 0.05 });
      const vm = this.add(vf, this.skin); vm.rotation.x = Math.PI / 2 + side * 0.25; vm.position.set(-5.8, side * 1.35, 1.1);
    }

    // --- Wing glove (fixed, highly swept) ---
    for (const side of [-1, 1]) {
      const glove = wingSurface({ span: 1.9, rootChord: 7.8, tipChord: 2.6, sweepLE: 70, tc: 0.05, mirror: side < 0 });
      const gm = this.add(glove, this.skin); gm.position.set(4.2, side * 0.95, 0.1);
    }

    // --- Outer wing panels: pivot at y = +/-2.72 m ---
    this.wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(-0.4, side * 2.72, 0.1); this.body.add(pivot);
      const wg = wingSurface({ span: 7.6, rootChord: 3.0, tipChord: 1.2, sweepLE: 0, tc: 0.09, tcTip: 0.07, mirror: side < 0 });
      // Planform is built unswept; pivot rotation provides the sweep (leading-edge sweep 20 deg at minimum).
      const panel = new THREE.Mesh(wg, this.skin); panel.position.set(1.0, 0, 0); pivot.add(panel);
      // Flaps and slats as separate hinged strips.
      const flap = new THREE.Mesh(wingSurface({ span: 6.2, rootChord: 0.75, tipChord: 0.42, sweepLE: 0, tc: 0.05, mirror: side < 0 }), this.skin);
      const flapHinge = new THREE.Group(); flapHinge.position.set(1.0 - 2.1, side * 0.35, 0.02); flapHinge.add(flap); pivot.add(flapHinge);
      const slat = new THREE.Mesh(wingSurface({ span: 7.1, rootChord: 0.35, tipChord: 0.18, sweepLE: 0, tc: 0.05, mirror: side < 0 }), this.skin);
      const slatHinge = new THREE.Group(); slatHinge.position.set(1.28, side * 0.3, 0); slatHinge.add(slat); pivot.add(slatHinge);
      // Spoilers on the upper surface.
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.45, 3.4, 0.03), this.skin);
      const spHinge = new THREE.Group(); spHinge.position.set(-0.55, side * 2.4, -0.1); spoiler.position.set(-0.22, 0, 0); spHinge.add(spoiler); pivot.add(spHinge);
      // Position lights at the tips.
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: side > 0 ? 0x00ff66 : 0xff2222 }));
      light.position.set(0.3, side * 7.55, 0); pivot.add(light);
      this.wings.push({ side, pivot, flapHinge, slatHinge, spHinge });
    }

    // --- Stabilators (all-moving) ---
    this.stabs = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group(); hinge.position.set(-7.2, side * 1.95, 0.45); this.body.add(hinge);
      const st = wingSurface({ span: 3.3, rootChord: 3.2, tipChord: 0.9, sweepLE: 50, tc: 0.045, mirror: side < 0 });
      const m = new THREE.Mesh(st, this.skin); m.position.set(1.5, 0, 0); hinge.add(m);
      this.stabs.push({ side, hinge });
    }

    // --- Twin vertical tails, canted outboard 5 deg, with rudders ---
    this.rudders = [];
    for (const side of [-1, 1]) {
      const fin = new THREE.Group(); fin.position.set(-5.2, side * 1.6, -0.35); fin.rotation.x = -Math.PI / 2 - side * 0.087; this.body.add(fin);
      const vt = wingSurface({ span: 2.95, rootChord: 3.3, tipChord: 1.05, sweepLE: 46, tc: 0.045 });
      this.add(vt, this.skin, fin);
      const rudHinge = new THREE.Group(); rudHinge.position.set(-2.55, 0.35, 0); fin.add(rudHinge);
      const rud = new THREE.Mesh(wingSurface({ span: 2.3, rootChord: 0.9, tipChord: 0.5, sweepLE: 30, tc: 0.03 }), this.skin);
      rudHinge.add(rud);
      // Squadron-style tail band.
      const band = decal('', { w: 1.6, h: 0.18, bg: '#2d3440' });
      band.position.set(-2.75, 2.4, 0.075); band.scale.set(0.75, 1, 1); fin.add(band);
      this.rudders.push({ side, rudHinge });
    }

    // --- Speed brakes (top and bottom, between the tails) ---
    this.sbUp = new THREE.Group(); this.sbUp.position.set(-6.4, 0, -0.22); this.body.add(this.sbUp);
    const sbu = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 0.03), this.skin); sbu.position.set(-0.7, 0, 0); this.sbUp.add(sbu);

    // --- Markings ---
    const navy = decal('NAVY', { w: 1.5, h: 0.4, color: '#40454c', font: 'bold 300px Arial' });
    navy.position.set(-2.2, 0, -1.33); navy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(1, 0, 0), V3(0, 0, -1))); this.body.add(navy);
    for (const side of [-1, 1]) {
      const modex = decal('201', { w: 0.9, h: 0.45, color: '#3a3f46', font: 'bold 420px Arial' });
      modex.position.set(7.0, side * 0.735, 0.02);
      modex.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(side, 0, 0), V3(0, 0, -1), V3(0, side, 0)));
      this.body.add(modex);
    }

    // --- Landing gear ---
    this.gearParts = [];
    const strut = (len, r = 0.09) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), this.white);
    const wheel = (r, w) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 20), this.tire); m.rotation.x = Math.PI / 2; return m; };
    // Nose gear: twin wheels and catapult launch bar.
    const ng = new THREE.Group(); ng.position.set(6.25, 0, 0.55); this.body.add(ng);
    const ns = strut(1.1, 0.08); ns.rotation.z = Math.PI / 2; ns.rotation.set(0, 0, 0); ns.position.set(0, 0, 0.55); ns.rotation.x = Math.PI / 2; ng.add(ns);
    for (const s of [-1, 1]) { const w = wheel(0.29, 0.18); w.position.set(0, s * 0.2, 1.1); ng.add(w); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.06), this.white); bar.position.set(0.45, 0, 1.0); bar.rotation.y = -0.4; ng.add(bar);
    this.gearParts.push({ g: ng, kind: 'nose' });
    for (const side of [-1, 1]) {
      const mg = new THREE.Group(); mg.position.set(-0.75, side * 2.5, 0.35); this.body.add(mg);
      const ms = strut(1.35, 0.1); ms.rotation.x = Math.PI / 2; ms.position.set(0, 0, 0.62); mg.add(ms);
      const w = wheel(0.5, 0.3); w.position.set(0, side * 0.12, 1.3); mg.add(w);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.02, 0.8), this.skin); door.position.set(0, -side * 0.18, 0.4); mg.add(door);
      this.gearParts.push({ g: mg, kind: 'main', side });
    }

    // --- Tailhook ---
    this.hook = new THREE.Group(); this.hook.position.set(-7.0, 0, 0.62); this.body.add(this.hook);
    const hk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), this.metal); hk.position.set(-0.85, 0, 0); this.hook.add(hk);
    const hkTip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.12), this.dark); hkTip.position.set(-1.7, 0, 0.05); this.hook.add(hkTip);

    // --- Afterburner flames: layered additive cones with shock diamonds ---
    this.flames = [];
    const flameMat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(-9.85, side * 1.35, 0.55); this.body.add(g);
      const outer = new THREE.Mesh(new THREE.ConeGeometry(0.46, 4.2, 20, 1, true), flameMat(0xff8a3a, 0.35));
      outer.rotation.z = Math.PI / 2; outer.position.x = -2.1; g.add(outer);
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.6, 16, 1, true), flameMat(0x9ec8ff, 0.6));
      core.rotation.z = Math.PI / 2; core.position.x = -1.3; g.add(core);
      const diamonds = [];
      for (let i = 0; i < 4; i++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flameMat(0xffd6a0, 0.5));
        d.scale.set(1.7, 1, 1); d.position.x = -0.7 - i * 0.75; g.add(d); diamonds.push(d);
      }
      g.visible = false;
      this.flames.push({ g, outer, core, diamonds });
    }
    // Anti-collision beacons and formation lights.
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 }));
    this.beacon.position.set(-3.5, 0, -0.95); this.body.add(this.beacon);
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
    x.fillStyle = '#b8b020'; x.fillRect(470, 8, 84, 24); x.fillStyle = '#111'; x.font = 'bold 16px Arial'; x.textAlign = 'center'; x.fillText('MASTER ARM', 512, 26);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    this.panelCanvas = c; this.panelTex = tex;
    const panelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.39), panelMat);
    panel.position.set(6.05, 0, -0.62);
    panel.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0.35, 0, -1).normalize(), V3(-1, 0, -0.35).normalize()));
    ck.add(panel);
    // Glare shield over the panel.
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.56, 0.32, 24, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.95, side: THREE.DoubleSide }));
    shield.rotation.z = Math.PI / 2; shield.position.set(6.2, 0, -0.62); shield.scale.set(1, 1, 0.35); ck.add(shield);
    // HUD combiner glass and its frame.
    const comb = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.22), new THREE.MeshPhysicalMaterial({ color: 0x88ffcc, transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }));
    comb.position.set(6.02, 0, -0.93); comb.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(V3(0, 1, 0), V3(0.3, 0, -1).normalize(), V3(-1, 0, -0.3).normalize()));
    ck.add(comb);
    // Windscreen posts and canopy bow.
    for (const sgn of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.72), this.dark);
      post.position.set(6.42, sgn * 0.36, -0.95); post.rotation.set(sgn * 0.45, -0.75, 0); ck.add(post);
      const sill = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.09, 0.06), this.dark);
      sill.position.set(4.9, sgn * 0.6, -0.62); ck.add(sill);
    }
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: 0x9aa4ac, metalness: 1, roughness: 0.05 }));
    mirror.position.set(4.95, 0, -1.47); ck.add(mirror);
  }

  // Update moving parts from the flight model state.
  setCockpitView(on) { this.canopy.material.opacity = on ? 0.05 : 0.28; for (const a of this.arches) a.visible = !on; }
  update(ac, t) {
    const sweep = ac.sweep ?? 20;
    for (const w of this.wings) {
      // At 20 deg program sweep the panel leading edge sits 20 deg aft; rotation about the pivot.
      w.pivot.rotation.z = w.side * sweep * Math.PI / 180;
      w.flapHinge.rotation.y = -(ac.flaps ?? 0) * 35 * Math.PI / 180;
      w.slatHinge.rotation.y = (ac.slats ?? 0) * 17 * Math.PI / 180;
      const sp = (ac.surf?.sp ?? 0) * w.side;
      w.spHinge.rotation.y = Math.max(0, sp) * 0.9 + (ac.ctl?.dlc && ac.flaps > 0.5 ? 0.05 : 0);
    }
    for (const s of this.stabs) {
      const ds = (ac.surf?.ds ?? 0) + s.side * (ac.surf?.da ?? 0) * 0.5;
      s.hinge.rotation.y = -ds * Math.PI / 180;
    }
    for (const r of this.rudders) r.rudHinge.rotation.z = -(ac.surf?.dr ?? 0) * Math.PI / 180 * 0.8;
    this.sbUp.rotation.y = (ac.speedbrake ?? 0) * 0.9;
    const g = ac.gear ?? 1;
    for (const p of this.gearParts) {
      if (p.kind === 'nose') { p.g.rotation.y = (1 - g) * 1.7; p.g.visible = g > 0.02; }
      else { p.g.rotation.x = p.side * (1 - g) * 1.6; p.g.visible = g > 0.02; }
    }
    this.hook.rotation.y = -(ac.hookPos ?? 0) * 0.45;
    const ab = [ac.engL?.ab ?? 0, ac.engR?.ab ?? 0];
    this.flames.forEach((f, i) => {
      const a = ab[i];
      f.g.visible = a > 0.02;
      if (!f.g.visible) return;
      const flick = 0.92 + 0.08 * Math.sin(t * 60 + i * 2) + 0.05 * Math.sin(t * 23.7);
      f.g.scale.set(0.6 + 0.7 * a * flick, 1, 1);
      f.outer.material.opacity = 0.18 + 0.25 * a; f.core.material.opacity = 0.35 + 0.35 * a;
      f.diamonds.forEach((d, k) => { d.material.opacity = (0.45 - k * 0.09) * a; });
    });
    this.beacon.visible = Math.floor(t * 1.2) % 2 === 0;
  }
}
