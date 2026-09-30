// Nimitz-class carrier: kinematics, deck contact, arresting gear, catapults, Fresnel lens and LSO.
//
// Numbers (see F14_Carrier_Research_2026-09-30.md):
//  - 1,092 ft long, 252 ft flight deck, 9 deg angled deck (Navy fact file).
//  - 4 wires; ramp-to-wire 169.9 / 209.9 / 250.4 / 291.2 ft (forum quoting NAEC-MISC-06900, UNVERIFIED).
//  - Hook touchdown point 230 ft from the ramp, 3.5 deg basic angle, minimum hook-to-ramp 10 ft (LSO NATOPS).
//  - IFLOLS: 10 amber cells of 0.13 deg and 2 red low cells of 0.20 deg; 10 green datums a side (LSO NATOPS).
//  - Mk 7 Mod 3 arresting gear: constant 344 ft runout, 47.5 million ft-lb max energy (NRTC 14310 ch. 3).
//  - C-13-1 catapult power stroke 309.7 ft (NRTC 14310 ch. 4).
// EST: flight-deck height 18.3 m above the waterline, deck-edge outline, lens position, ship motion amplitudes.
import * as THREE from 'three';
import { llToEN } from './geo.js';

const FT = 0.3048, KT = 0.514444, DEG = Math.PI / 180;
export const DECK_H = 18.3;
const HALF_L = 166.4;                     // 1,092 ft
const RAMP_X = -HALF_L + 4;               // ramp (aft edge of the landing area), ship-local x
const RAMP_Y = 9;                         // landing-area centerline at the ramp, starboard of the ship centerline (EST)
const ANG = 9 * DEG;
const WIRE_FT = [169.9, 209.9, 250.4, 291.2];
const HTDP = 230 * FT;
const GS = 3.5 * DEG;
const LENS_S = 125;                       // lens distance from ramp along the landing axis (EST)
const RUNOUT = 344 * FT;
const CAT_STROKE = 309.7 * FT;

// Deck outline in ship-local metres (x forward, y starboard). EST from Nimitz plan views.
const DECK_POLY = [[-162, -22], [-162, 30], [-120, 37], [60, 37], [118, 36], [150, 24], [166, 8], [166, -8], [150, -18],
  [100, -28], [40, -39], [-40, -39], [-110, -33]];

function inPoly(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export class Carrier {
  constructor(scene, { lat = 37.70, lon = -123.10, heading = 320, speedKt = 22 } = {}) {
    this.scene = scene;
    const p = llToEN(lat, lon);
    this.pos = [p.n, p.e];              // NED north, east (m) of the ship's center at the waterline
    this.heading = heading * DEG;
    this.speed = speedKt * KT;
    this.t = 0;
    this.motion = { pitch: 0, roll: 0, heave: 0 };
    this.trap = null; this.cat = null;
    this.wires = WIRE_FT.map((f, i) => ({ i: i + 1, s: f * FT }));
    this.group = new THREE.Group(); scene.add(this.group);
    this.build();
    this.lso = new LSO(this);
  }

  // ----- frames -----
  // Ship-local (x fwd, y stbd, z up) to NED world, including deck motion.
  toWorld(lx, ly, lz) {
    const { pitch, roll, heave } = this.motion;
    // Small-angle deck motion about the ship center.
    let x = lx, y = ly, z = lz + heave;
    const z1 = z + x * Math.sin(pitch), x1 = x * Math.cos(pitch) - z * Math.sin(pitch) * 0;
    const z2 = z1 - y * Math.sin(roll), y2 = y * Math.cos(roll);
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    return [this.pos[0] + x1 * c - y2 * s, this.pos[1] + x1 * s + y2 * c, -z2];
  }
  toLocal(n, e, d) {
    const c = Math.cos(this.heading), s = Math.sin(this.heading);
    const dn = n - this.pos[0], de = e - this.pos[1];
    const x = dn * c + de * s, y = -dn * s + de * c;
    const { pitch, roll, heave } = this.motion;
    const deckZ = heave + x * Math.sin(pitch) - y * Math.sin(roll);
    return { x, y, z: -d, deckZ };
  }
  shipVelNED() { return [Math.cos(this.heading) * this.speed, Math.sin(this.heading) * this.speed, 0]; }
  landingAxis() { const h = this.heading - ANG; return [Math.cos(h), Math.sin(h)]; }
  // Distance along the landing axis from the ramp, and lateral offset (positive right of centerline).
  landingCoords(lx, ly) {
    const dx = lx - RAMP_X, dy = ly - RAMP_Y;
    const s = dx * Math.cos(ANG) - dy * Math.sin(ANG);
    const lat = dx * Math.sin(ANG) + dy * Math.cos(ANG);
    return { s, lat };
  }
  landingPoint(s, lat, z = 0) { // inverse of landingCoords, ship-local
    return [RAMP_X + s * Math.cos(ANG) + lat * Math.sin(ANG), RAMP_Y - s * Math.sin(ANG) + lat * Math.cos(ANG), z];
  }

  // Surface query for the flight model: deck if over it, else the sea.
  surface(pw) {
    const L = this.toLocal(pw[0], pw[1], pw[2]);
    if (inPoly(L.x, L.y, DECK_POLY) && L.z > DECK_H - 6 + L.deckZ) {
      const v = this.shipVelNED();
      return { h: DECK_H + L.deckZ, water: false, mu: 0.75, v, deck: true };
    }
    return null;
  }

  update(dt, ac) {
    this.t += dt;
    const t = this.t;
    this.motion.pitch = 0.35 * DEG * Math.sin(2 * Math.PI * t / 9.3);
    this.motion.roll = 0.5 * DEG * Math.sin(2 * Math.PI * t / 11.7 + 1);
    this.motion.heave = 0.35 * Math.sin(2 * Math.PI * t / 8.1 + 2);
    const v = this.shipVelNED();
    this.pos[0] += v[0] * dt; this.pos[1] += v[1] * dt;
    if (ac) { this.updateHook(dt, ac); this.updateCat(dt, ac); this.lso.update(dt, ac); }
    this.placeMeshes();
  }

  // ----- arresting gear -----
  hookWorld(ac, hookPoint) {
    const q = ac.q, p = hookPoint;
    const [w, x, y, z] = q;
    const tx = 2 * (y * p[2] - z * p[1]), ty = 2 * (z * p[0] - x * p[2]), tz = 2 * (x * p[1] - y * p[0]);
    return [ac.pos[0] + p[0] + w * tx + (y * tz - z * ty), ac.pos[1] + p[1] + w * ty + (z * tx - x * tz), ac.pos[2] + p[2] + w * tz + (x * ty - y * tx)];
  }
  updateHook(dt, ac) {
    // Hook tip: the hook swings down about its hinge; approximate tip position in body axes.
    const down = ac.hookPos;
    const hookBody = [-7.0 - 2.4 * Math.cos(0.785 * down), 0, 0.62 + 2.4 * Math.sin(0.785 * down)]; // hook reaches below the wheel line (EST)
    const hw = this.hookWorld(ac, hookBody);
    const L = this.toLocal(hw[0], hw[1], hw[2]);
    const lc = this.landingCoords(L.x, L.y);
    // Glide path is inertially stabilized (IFLOLS inertial mode): reference the mean deck, not the moving one.
    const onDeck = lc.s > -5;
    // The hook cannot go through the deck: over the deck it rides on the surface (held down by its damper).
    const hDeckRaw = L.z - DECK_H - L.deckZ;
    const overDeck = lc.s > 0 && lc.s < 240 && Math.abs(lc.lat) < 20;
    const hDeck = overDeck ? Math.max(0, hDeckRaw) : hDeckRaw;
    this.hookInfo = { s: lc.s, lat: lc.lat, h: L.z - DECK_H - (onDeck ? L.deckZ : 0), hDeck, onDeck: overDeck && hDeckRaw <= 0.02 };
    const vs = this.shipVelNED();
    const vw = ac.vWorld;
    const rel = [vw[0] - vs[0], vw[1] - vs[1]];
    const ax = this.landingAxis();
    const vAlong = rel[0] * ax[0] + rel[1] * ax[1];
    if (!this.trap && down > 0.9 && !ac.crashed) {
      for (const wire of this.wires) {
        const prev = this.prevHookS ?? lc.s;
        if (prev < wire.s && lc.s >= wire.s && Math.abs(lc.lat) < 16 && this.hookInfo.hDeck < 0.12) {
          this.trap = { wire: wire.i, s0: lc.s, v0: vAlong, t: 0, stopped: false, sink: ac.lastTouchSink };
          this.lso.onTrap(wire.i, ac); this.onEvent?.('trap');
          break;
        }
      }
    }
    this.prevHookS = lc.s;
    ac.extForce = [0, 0, 0]; ac.extMoment = [0, 0, 0];
    if (this.trap) {
      const tr = this.trap; tr.t += dt;
      const run = Math.max(0, lc.s - tr.s0);
      tr.run = run;
      // Constant-runout valve: pick the deceleration that stops the jet at the design runout.
      const remain = Math.max(3, RUNOUT - run);
      let decel = vAlong > 0 ? (vAlong * vAlong) / (2 * remain) : 0;
      decel *= Math.min(1, tr.t / 0.25); // cable stretch and purchase-cable take-up
      // Holds the jet against military thrust once stopped, and pulls back a little.
      const thrust = ac.engL.thrust(ac.air.sigma, 0, ac.air.p / 101325) + ac.engR.thrust(ac.air.sigma, 0, ac.air.p / 101325);
      // The valve meters pressure for the whole load, including the jet's own military thrust.
      let F = ac.mass * decel + (vAlong > 0.6 ? thrust * Math.min(1, tr.t / 0.25) : 0);
      if (vAlong < 0.6) { tr.stopped = true; F = thrust + ac.mass * (vAlong - 0.3) * -2.0; }
      // Pull along the cable toward the hook's engagement point (along -landing axis).
      const fw = [-ax[0] * F, -ax[1] * F, F * 0.08];
      ac.extForce = fw;
      // Moment about the CG: r_hook x F (body frame).
      const [w, x, y, z] = ac.q;
      const inv = [w, -x, -y, -z];
      const rot = (q, v) => { const [qw, qx, qy, qz] = q; const tx = 2 * (qy * v[2] - qz * v[1]), ty = 2 * (qz * v[0] - qx * v[2]), tz = 2 * (qx * v[1] - qy * v[0]); return [v[0] + qw * tx + (qy * tz - qz * ty), v[1] + qw * ty + (qz * tx - qx * tz), v[2] + qw * tz + (qx * ty - qy * tx)]; };
      const fb = rot(inv, fw);
      ac.extMoment = [hookBody[1] * fb[2] - hookBody[2] * fb[1], hookBody[2] * fb[0] - hookBody[0] * fb[2], hookBody[0] * fb[1] - hookBody[1] * fb[0]];
      if (tr.stopped && ac.ctl.throttle < 0.3 && ac.ctl.hook < 0.5) { this.trap = null; }
    }
  }

  // ----- catapult -----
  // Put the jet on catapult 1 (bow, starboard), tensioned. Launch when throttle is at MIL or above for 2 s.
  spotOnCat(ac, n = 1) {
    const y = n === 1 ? 8 : -8;
    const x0 = 150 - CAT_STROKE - 2;
    const pw = this.toWorld(x0, y, DECK_H + 2.0);
    const hdg = this.heading;
    ac.reset({ pos: pw, V: this.speed, heading: hdg, fuelKg: 5500, onGround: true });
    ac.ctl.gear = 1; ac.gear = 1; ac.ctl.flaps = 1; ac.flaps = 1; ac.slats = 1; ac.sweep = 20;
    ac.ctl.throttle = 0.2; ac.ctl.trim = -8; ac.surf.ds = -8; ac.ctl.hook = 0; ac.hookPos = 0;
    this.cat = { n, y, x0, state: 'tension', timer: 0, s: 0 };
    this.trap = null;
  }
  updateCat(dt, ac) {
    const c = this.cat; if (!c) return;
    const L = this.toLocal(ac.pos[0], ac.pos[1], ac.pos[2]);
    // Safety: the catapult only acts on a jet sitting on its track.
    if (Math.abs(L.y - c.y) > 6 || L.z - DECK_H > 6 || ac.crashed) { this.cat = null; ac.extForce = [0, 0, 0]; return; }
    const vs = this.shipVelNED(), vw = ac.vWorld;
    const fwd = [Math.cos(this.heading), Math.sin(this.heading)];
    const rel = (vw[0] - vs[0]) * fwd[0] + (vw[1] - vs[1]) * fwd[1];
    if (c.state === 'tension') {
      // Holdback keeps the jet in place; shuttle holds it on the track.
      ac.extForce = [-fwd[0] * (ac.engL.thrust(ac.air.sigma, 0, 1) + ac.engR.thrust(ac.air.sigma, 0, 1)) - rel * ac.mass * fwd[0] * 3, -fwd[1] * (ac.engL.thrust(ac.air.sigma, 0, 1) + ac.engR.thrust(ac.air.sigma, 0, 1)) - rel * ac.mass * fwd[1] * 3, 0];
      if (ac.ctl.throttle >= 0.79) c.timer += dt; else c.timer = 0;
      if (c.timer > 2.0) { c.state = 'stroke'; c.xs = L.x; this.lso.say('Shooter salute, launch.'); this.onEvent?.('cat'); }
      return;
    }
    if (c.state === 'stroke') {
      const s = L.x - c.xs;
      // Steam pressure set for about 150 kt end airspeed with the wind over the deck (EST 2.4 s stroke).
      const endRel = 150 * KT - this.windOverDeck();
      const a = Math.max(0, (endRel * endRel) / (2 * CAT_STROKE));
      ac.extForce = [fwd[0] * ac.mass * a, fwd[1] * ac.mass * a, 0];
      if (s >= CAT_STROKE) { c.state = 'done'; ac.extForce = [0, 0, 0]; this.cat = null; this.lso.say('Good shot.'); }
    }
  }
  windOverDeck() { return this.speed + (this.naturalWindKt ?? 10) * KT; }

  // ----- geometry -----
  build() {
    const g = this.group;
    this.shipRoot = new THREE.Group(); g.add(this.shipRoot);   // x fwd, y up, z port? built in three local, see placeMeshes
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5f666d, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide });
    const deckMat = new THREE.MeshStandardMaterial({ map: this.deckTexture(), roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide });
    // Hull: lofted from waterline sections (local three frame: x fwd, y up, z = -starboard).
    const shape = new THREE.Shape();
    // Shape in (x fwd, -y) so that after the -90 deg x rotation ship starboard maps to local +z.
    DECK_POLY.forEach(([x, y], i) => (i ? shape.lineTo(x, -y) : shape.moveTo(x, -y)));
    shape.closePath();
    const deckGeo = new THREE.ShapeGeometry(shape);
    // UVs from ship coords.
    const pos = deckGeo.attributes.position, uv = [];
    for (let i = 0; i < pos.count; i++) uv.push((pos.getX(i) + 170) / 340, (-pos.getY(i) + 40) / 80);
    deckGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.rotation.x = -Math.PI / 2; deck.position.y = DECK_H;
    deck.receiveShadow = true;
    this.shipRoot.add(deck);
    // Flight deck edge slab and hull below.
    const slab = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false }), hullMat);
    slab.rotation.x = -Math.PI / 2; slab.position.y = DECK_H - 1.21; this.shipRoot.add(slab);
    const hull = this.hullGeometry();
    this.shipRoot.add(new THREE.Mesh(hull, hullMat));
    this.buildDetails(hullMat);
    // Island (starboard, amidships-aft) with mast and radars.
    const isl = new THREE.Group(); this.shipRoot.add(isl);
    const box = (w, h, d, x, y, z, m = hullMat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); isl.add(b); return b; };
    box(34, 9, 11, 18, DECK_H + 4.5, 31);
    box(26, 7, 9.5, 20, DECK_H + 12.5, 31);
    box(18, 5.5, 8, 22, DECK_H + 18.7, 31);
    const glass = new THREE.MeshStandardMaterial({ color: 0x1a2630, roughness: 0.1, metalness: 0.6 });
    box(18.2, 1.4, 8.2, 22, DECK_H + 20.2, 31, glass); box(26.2, 1.0, 9.7, 20, DECK_H + 14.2, 31, glass);
    box(1.2, 16, 1.2, 16, DECK_H + 29, 31);
    box(7, 0.4, 0.4, 16, DECK_H + 33, 31);
    const radar = box(0.3, 3, 6, 18, DECK_H + 36, 31); this.radar = radar;
    box(4, 3, 4, 26, DECK_H + 23, 31);
    // Deck-edge elevators (lighter squares) and catwalk nets, as shading on the texture; add jet blast deflectors.
    for (const [x, z] of [[150 - 309.7 * FT - 12, -8], [150 - 309.7 * FT - 12, 8]]) {
      const jbd = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.2, 12), hullMat); jbd.position.set(x, DECK_H + 1.1, z); jbd.rotation.z = 0.9; this.shipRoot.add(jbd);
    }
    // Arresting wires: thin cables across the landing area just above the deck.
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x2e2e2e, roughness: 0.4, metalness: 0.8 });
    this.wireMeshes = [];
    for (const w of this.wires) {
      const a = this.landingPoint(w.s, -14), b = this.landingPoint(w.s, 14);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), wireMat);
      m.rotation.x = Math.PI / 2; m.rotation.z = 0; // along three z
      const holder = new THREE.Group(); holder.add(m);
      holder.position.set((a[0] + b[0]) / 2, DECK_H + 0.09, (a[1] + b[1]) / 2);
      holder.rotation.y = ANG; // perpendicular to the landing axis
      this.shipRoot.add(holder); this.wireMeshes.push(holder);
    }
    // Fresnel lens (IFLOLS) on the port side.
    this.buildLens();
    // Wake: foam trail astern.
    this.wake = new THREE.Group(); const wk = this.makeWake(); wk.position.set(-HALF_L - 690, 0.2, 0); this.wake.add(wk); g.add(this.wake);
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // Hull lofted from the flight-deck outline down to a narrower waterline hull and the keel, so the flight deck
  // overhangs on sponsons like the real ship. Three rings: deck edge (z 17.1), hangar deck line (z 10, over the
  // waterline hull), keel (z -11.3). EST proportions: waterline beam 40.8 m, draft 11.3 m (published).
  hullGeometry() {
    const M = 260, per = [];
    const P = DECK_POLY.concat([DECK_POLY[0]]);
    const segLen = []; let total = 0;
    for (let i = 0; i < P.length - 1; i++) { const l = Math.hypot(P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]); segLen.push(l); total += l; }
    for (let k = 0; k < M; k++) {
      let d = k / M * total, i = 0;
      while (d > segLen[i]) { d -= segLen[i]; i++; }
      const t = d / segLen[i];
      per.push([P[i][0] + (P[i + 1][0] - P[i][0]) * t, P[i][1] + (P[i + 1][1] - P[i][1]) * t]);
    }
    const bw = (x) => { // waterline half-beam
      if (x > 95) return 20.4 * Math.max(0.02, 1 - Math.pow((x - 95) / 68, 1.6));
      if (x < -150) return 18.5;
      return 20.4;
    };
    const rings = [];
    // Ring 0: deck edge, just under the deck slab.
    rings.push(per.map(([x, y]) => [x, y, DECK_H - 1.2]));
    // Ring 1: top of the sponson flare; ring 2: hangar-deck line over the waterline hull.
    rings.push(per.map(([x, y]) => { const xw = Math.max(-160, Math.min(163, x)); const b = bw(xw); const yy = Math.sign(y || 1) * Math.min(Math.abs(y), b + (Math.abs(y) - b) * 0.25); return [x * 0.998, yy, DECK_H - 4.2]; }));
    rings.push(per.map(([x, y]) => { const xw = Math.max(-158, Math.min(162, x)); return [xw, Math.sign(y || 1) * Math.min(Math.abs(y), bw(xw)), 10]; }));
    rings.push(per.map(([x, y]) => { const xw = Math.max(-158, Math.min(162, x)); return [xw, Math.sign(y || 1) * Math.min(Math.abs(y), bw(xw)), 0]; }));
    rings.push(per.map(([x, y]) => { const xw = Math.max(-150, Math.min(150, x)); const bow = Math.max(0, (xw - 100) / 50); return [xw, Math.sign(y || 1) * Math.min(Math.abs(y), bw(xw)) * 0.75, -11.3 + bow * 6]; }));
    const pos = [], idx = [];
    for (const r of rings) for (const [x, y, z] of r) pos.push(x, z, y); // ship-local three: x fwd, y up, z stbd
    for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < M; k++) {
      const a = r * M + k, b = r * M + (k + 1) % M, c = a + M, d = b + M;
      idx.push(a, c, b, b, c, d);
    }
    // Close the bottom.
    const base = pos.length / 3; pos.push(0, -11.3, 0);
    for (let k = 0; k < M; k++) idx.push(base, (rings.length - 1) * M + k, (rings.length - 1) * M + (k + 1) % M);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  // Deck-edge elevators, hangar openings, catwalks, LSO platform, island detail and parked jets.
  buildDetails(hullMat) {
    const R = this.shipRoot, dark = new THREE.MeshStandardMaterial({ color: 0x1b1e21, roughness: 0.9 });
    const deckGray = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.9 });
    const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); R.add(m); return m; };
    // Elevators (starboard: two forward of the island, one aft; port: one aft on the angled deck edge).
    for (const [x0, x1, side] of [[44, 62, 1], [66, 84, 1], [-40, -22, 1], [-112, -94, -1]]) {
      const w = x1 - x0, zc = side > 0 ? 37 + 7.5 : -39 - 7.5;
      add(new THREE.BoxGeometry(w, 0.9, 15), deckGray, (x0 + x1) / 2, DECK_H - 0.45, zc);
      add(new THREE.BoxGeometry(w + 2, 7, 0.3), dark, (x0 + x1) / 2, DECK_H - 6.5, side * (side > 0 ? 36.2 : 38.2));
    }
    // Hangar-bay openings behind the elevators (dark).
    // Catwalk ledges around the deck edge.
    const ledge = new THREE.MeshStandardMaterial({ color: 0x3a3e42, roughness: 0.9 });
    for (const [x0, x1, y] of [[-150, 40, 37.5], [-100, 40, -39.8]]) add(new THREE.BoxGeometry(x1 - x0, 0.25, 2.2), ledge, (x0 + x1) / 2, DECK_H - 1.6, y + Math.sign(y) * 1.1);
    // LSO platform, port side aft, next to the landing area.
    const lp = this.landingPoint(30, -26);
    add(new THREE.BoxGeometry(10, 0.3, 5), ledge, lp[0], DECK_H - 0.3, lp[1]);
    // Island detail: bridge window band, hull number, SPS-48 style radar and mast yardarms.
    const white = new THREE.MeshBasicMaterial({ color: 0xe8e6dc });
    const numC = document.createElement('canvas'); numC.width = 256; numC.height = 256; const nx = numC.getContext('2d');
    nx.fillStyle = '#e8e6dc'; nx.font = 'bold 200px Arial'; nx.textAlign = 'center'; nx.textBaseline = 'middle'; nx.fillText('70', 128, 138);
    const numT = new THREE.CanvasTexture(numC); numT.colorSpace = THREE.SRGBColorSpace;
    const num = add(new THREE.PlaneGeometry(7, 7), new THREE.MeshBasicMaterial({ map: numT, transparent: true }), 14, DECK_H + 13.5, 26.1);
    num.rotation.y = Math.PI;
    const ant = add(new THREE.BoxGeometry(0.4, 5, 7), hullMat, 20, DECK_H + 41, 31); this.radar2 = ant;
    for (const yy of [DECK_H + 34, DECK_H + 38]) add(new THREE.BoxGeometry(0.3, 0.3, 9), hullMat, 16, yy, 31);
    void white;
    // Parked aircraft: simple low-poly jets with wings folded or oversept, for scale.
    const jetMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.6, metalness: 0.2 });
    const jet = () => {
      const g = new THREE.Group();
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 17, 10), jetMat); f.rotation.z = Math.PI / 2; f.position.y = 1.6; g.add(f);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.6, 10), jetMat); nose.rotation.z = -Math.PI / 2; nose.position.set(9.8, 1.6, 0); g.add(nose);
      const w = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.18, 10.5), jetMat); w.position.set(-1.2, 1.7, 0); g.add(w);
      for (const sz of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(2.8, 3.0, 0.15), jetMat); t.position.set(-6.8, 3.2, sz * 1.5); t.rotation.x = sz * 0.1; g.add(t); }
      const can = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.5 }));
      can.scale.set(3, 0.9, 1); can.position.set(4.5, 2.2, 0); g.add(can);
      return g;
    };
    const spots = [[120, 30, -2.6], [104, 30, -2.6], [88, 30, -2.6], [-5, 30, -2.4], [-20, 30, -2.4], [100, -16, 0.5], [130, -8, 0.3]];
    for (const [x, y, rot] of spots) { const j = jet(); j.position.set(x, DECK_H, y); j.rotation.y = rot; R.add(j); }
  }

  deckTexture() {
    const W = 4096, H = 1024, c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    const X = (lx) => (lx + 170) / 340 * W, Y = (ly) => (1 - (ly + 40) / 80) * H; // ship y (stbd) up in texture
    x.fillStyle = '#44484c'; x.fillRect(0, 0, W, H);
    // Non-skid mottling and rubber and fuel stains in the landing area.
    for (let i = 0; i < 9000; i++) { const v = 55 + Math.random() * 25; x.fillStyle = `rgba(${v},${v + 2},${v + 5},0.25)`; x.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 10, 2 + Math.random() * 6); }
    const P = (s, lat) => { const p = this.landingPoint(s, lat); return [X(p[0]), Y(p[1])]; };
    x.save();
    for (let i = 0; i < 70; i++) { const [px, py] = P(40 + Math.random() * 90, (Math.random() - 0.5) * 8); x.fillStyle = 'rgba(20,20,22,0.18)'; x.beginPath(); x.ellipse(px, py, 40 + Math.random() * 90, 4 + Math.random() * 6, -ANG, 0, 6.28); x.fill(); }
    x.restore();
    const line = (a, b, col, w, dash) => { x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash || []); x.beginPath(); x.moveTo(...a); x.lineTo(...b); x.stroke(); x.setLineDash([]); };
    // Landing area edge lines (white), centerline (white dashed), foul lines (red/white).
    line(P(0, -12), P(235, -12), '#e8e6dc', 6); line(P(0, 12), P(235, 12), '#e8e6dc', 6);
    line(P(0, 0), P(235, 0), '#e8e6dc', 5, [60, 40]);
    line(P(0, 16), P(240, 16), '#c9c02a', 4, [30, 20]);
    // Ramp stripes.
    for (let k = -12; k < 12; k += 3) line(P(0, k), P(6, k + 1.5), '#e8e6dc', 8);
    // Bow catapult tracks and a waist cat.
    for (const yy of [8, -8]) { line([X(150 - CAT_STROKE - 3), Y(yy)], [X(152), Y(yy)], '#2a2c2e', 10); line([X(150 - CAT_STROKE - 3), Y(yy)], [X(152), Y(yy)], '#b8a42c', 2, [18, 18]); }
    line(P(120, -22), P(215, -22), '#2a2c2e', 10);
    // Deck numbers at the bow and a yellow taxi line.
    x.fillStyle = '#e8e6dc'; x.font = 'bold 150px Arial'; x.textAlign = 'center';
    x.save(); x.translate(X(135), Y(0)); x.rotate(Math.PI / 2); x.fillText('70', 0, 50); x.restore();
    line([X(-60), Y(26)], [X(110), Y(26)], '#c9c02a', 4, [40, 30]);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
    return t;
  }

  buildLens() {
    const L = new THREE.Group(); this.shipRoot.add(L); this.lens = L;
    const p = this.landingPoint(LENS_S, -22.5);
    L.position.set(p[0], DECK_H + 1.8, p[1]);
    L.rotation.y = Math.PI + ANG; // facing aft along the approach path
    const dark = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    L.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 1.2), dark));
    const emis = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
    this.cells = [];
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.6), emis(i < 2 ? 0xff2010 : 0xffa030));
      m.position.set(0.31, -0.9 + i * 0.165, 0); m.visible = false; L.add(m); this.cells.push(m);
    }
    // Datum lights: 10 green each side, on horizontal arms.
    for (const side of [-1, 1]) for (let k = 0; k < 10; k++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), emis(0x30ff60));
      d.position.set(0.3, 0.0, side * (1.2 + k * 0.45)); L.add(d);
    }
    this.waveoffLights = []; this.cutLights = [];
    for (const side of [-1, 1]) for (let k = 0; k < 3; k++) { const w = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), emis(0xff1010)); w.position.set(0.3, 0.5 - k * 0.5, side * 0.85); w.visible = false; L.add(w); this.waveoffLights.push(w); }
    for (let k = 0; k < 4; k++) { const cl = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), emis(0x30ff60)); cl.position.set(0.3, 1.3, -0.6 + k * 0.4); cl.visible = false; L.add(cl); this.cutLights.push(cl); }
    // Glow sprites so the ball can be seen from 3/4 mile.
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    this.ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa030, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.ballGlow.scale.set(1.6, 1.6, 1); L.add(this.ballGlow);
    this.datumGlow = [];
    for (const side of [-1, 1]) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x30ff60, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.scale.set(5, 1.1, 1); s.position.set(0.4, 0, side * 3.2); L.add(s); this.datumGlow.push(s); }
  }

  // Ball position in cells above (+) or below (-) center, from the jet's hook glide-slope error seen from the lens.
  ballCells(ac) {
    const hi = this.hookInfo; if (!hi) return null;
    const along = LENS_S - hi.s;
    if (hi.s > LENS_S - 5 || hi.s < -3000) return null;
    const pathH = (HTDP - hi.s) * Math.tan(GS);
    const err = Math.atan2(hi.h - pathH, Math.max(20, along)) / DEG;
    return err / 0.13;
  }

  makeWake() {
    // Foam trail astern: long axis along ship x; u = 0 far astern, u = 1 at the stern.
    const c = document.createElement('canvas'); c.width = 2048; c.height = 256;
    const x = c.getContext('2d');
    for (let i = 0; i < 6000; i++) {
      const u = Math.random(), v = Math.random();
      const spread = 0.12 + (1 - u) * 0.75;
      const yy = 128 + (Math.random() - 0.5) * 256 * spread * (0.4 + 0.6 * Math.random());
      const a = (0.05 + 0.35 * u * u) * v;
      x.fillStyle = `rgba(255,255,255,${a})`; x.beginPath(); x.ellipse(u * 2048, yy, 3 + v * 12, 1 + v * 3, 0, 0, 6.28); x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1380, 110), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.rotation.x = -Math.PI / 2; m.renderOrder = 2;
    return m;
  }

  placeMeshes() {
    // Ship-local (x fwd, y stbd, z up) -> three: position from NED; orientation: heading plus deck motion.
    const w = this.toWorld(0, 0, 0);
    this.shipRoot.position.set(w[1], -w[2], -w[0]);
    this.shipRoot.rotation.set(0, 0, 0);
    // Local three frame of the ship root: x = forward, y = up, z = port (so ship y-starboard maps to -z).
    const e = new THREE.Euler(this.motion.roll, -this.heading + Math.PI / 2, this.motion.pitch, 'YXZ');
    this.shipRoot.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2 - this.heading, 0, 'YXZ'));
    this.shipRoot.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(this.motion.roll, 0, this.motion.pitch, 'XZY')));
    void e;
    this.wake.position.set(this.shipRoot.position.x, 0, this.shipRoot.position.z);
    this.wake.rotation.set(0, Math.PI / 2 - this.heading, 0);
    this.radar.rotation.y = this.t * 2.5; if (this.radar2) this.radar2.rotation.y = -this.t * 1.6;
  }

  updateLens(ac) {
    const b = this.ballCells(ac);
    this.cells.forEach((c) => (c.visible = false));
    if (b === null) { this.ballGlow.visible = false; return; }
    // Cells: index 0-1 red (bottom), 2-11 amber. Center of amber field at index 6.5.
    let i = Math.round(6.5 + b);
    this.ballGlow.visible = true;
    if (i < 2) i = b < -6 ? 0 : 1;
    i = Math.min(11, Math.max(0, i));
    this.cells[i].visible = true;
    this.ballGlow.position.set(0.4, this.cells[i].position.y, 0);
    this.ballGlow.material.color.set(i < 2 ? 0xff2010 : 0xffa030);
    const wo = this.lso.waveoff && Math.floor(this.t * 3) % 2 === 0;
    this.waveoffLights.forEach((l) => (l.visible = wo));
    const cut = this.lso.cutFlash > 0; this.cutLights.forEach((l) => (l.visible = cut));
  }
}

// Landing Signal Officer: calls, and a grade for each pass using LSO NATOPS grades and P-1211 points.
export class LSO {
  constructor(ship) {
    this.ship = ship; this.pass = null; this.log = []; this.board = []; this.lastCall = 0; this.cutFlash = 0;
    this.caption = ''; this.captionT = 0; this.waveoff = false; this.voice = true;
  }
  say(text) {
    this.caption = text; this.captionT = 3.5;
    if (this.voice && window.speechSynthesis) {
      try { const u = new SpeechSynthesisUtterance(text); u.rate = 1.15; u.pitch = 0.9; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* no voice */ }
    }
  }
  update(dt, ac) {
    const ship = this.ship;
    this.captionT -= dt; this.cutFlash -= dt;
    ship.updateLens(ac);
    const hi = ship.hookInfo; if (!hi) return;
    const range = -hi.s; // metres behind the ramp
    const b = ship.ballCells(ac);
    const inGroove = range > 0 && range < 1500 && Math.abs(hi.lat) < 250 && ac.hookPos > 0.5 && ac.gear > 0.9;
    if (inGroove && !this.pass) {
      this.pass = { start: ship.t, dev: { X: [], IM: [], IC: [], AR: [] }, ballCalled: false, calls: [], minRamp: 99 };
      this.waveoff = false;
    }
    if (!this.pass) return;
    const p = this.pass;
    if (!p.ballCalled && range < 1300) { p.ballCalled = true; this.say('Two zero one, Tomcat ball, ' + (ac.fuel / 0.4536 / 1000).toFixed(1) + '.'); setTimeout(() => this.say('Roger ball.'), 1600); this.cutFlash = 0.6; }
    const seg = range > 900 ? 'X' : range > 450 ? 'IM' : range > 120 ? 'IC' : 'AR';
    const aoa = ac.aoaUnits;
    if (b !== null && range > 0) p.dev[seg].push({ b, lat: hi.lat, aoa });
    // Hook-to-ramp clearance as the hook crosses the ramp (LSO NATOPS minimum is 10 ft).
    if (range < 2 && range > -2) p.minRamp = Math.min(p.minRamp ?? 99, hi.hDeck);
    // Calls, at most one every 1.8 s.
    if (ship.t - this.lastCall > 1.8 && range > 0 && p.ballCalled && !this.waveoff) {
      let call = null;
      if (b !== null && b < -3.2 && range < 500) { call = 'Wave off, wave off.'; this.waveoff = true; p.result = 'WO'; }
      else if (b !== null && b < -2.2) call = 'Power.';
      else if (b !== null && b < -1.2) call = "You're low.";
      else if (b !== null && b > 2.5) call = "You're high.";
      else if (hi.lat > 4.5) call = 'Come left.';
      else if (hi.lat < -4.5) call = 'Right for lineup.';
      else if (aoa < 13.2) call = "You're fast.";
      else if (aoa > 17) call = 'Attitude.';
      if (call) { this.say(call); this.lastCall = ship.t; p.calls.push(call); }
    }
    // End of pass: trapped (handled in onTrap), bolter, or waveoff.
    if (range < -120 && !ship.trap && ac.altitude > DECK_H + 3 && !p.done) this.finish(ac, 'B');
    if (this.waveoff && range < 0 && !p.done) this.finish(ac, 'WO');
    if ((range > 2500 || ac.crashed) && !p.done) { if (ac.crashed) this.finish(ac, 'C'); else this.pass = null; }
  }
  onTrap(wire, ac) {
    if (!this.pass) this.pass = { start: this.ship.t, dev: { X: [], IM: [], IC: [], AR: [] }, calls: [] };
    this.finish(ac, 'TRAP', wire);
  }
  finish(ac, how, wire) {
    const p = this.pass; if (!p || p.done) return; p.done = true;
    // Worst deviations by segment, in cells and metres.
    const worst = {};
    let comments = [];
    for (const seg of ['X', 'IM', 'IC', 'AR']) {
      const d = p.dev[seg]; if (!d.length) continue;
      const lo = Math.min(...d.map((q) => q.b)), hiB = Math.max(...d.map((q) => q.b));
      const lat = Math.max(...d.map((q) => Math.abs(q.lat))) * Math.sign(d.reduce((a, q) => a + q.lat, 0));
      const aoa = d.reduce((a, q) => a + q.aoa, 0) / d.length;
      worst[seg] = { lo, hi: hiB, lat, aoa };
      const paren = (v, big) => (Math.abs(v) >= big ? '' : '(') + '%' + (Math.abs(v) >= big ? '' : ')');
      if (lo < -1) comments.push(paren(lo, 2).replace('%', 'LO') + seg);
      if (hiB > 1) comments.push(paren(hiB, 2).replace('%', 'H') + seg);
      if (Math.abs(lat) > 3) comments.push(paren(lat, 6).replace('%', lat > 0 ? 'LUR' : 'LUL') + seg);
      if (aoa < 13.5) comments.push('F' + seg); if (aoa > 16.5) comments.push('SLO' + seg);
    }
    const allB = Object.entries(worst).flatMap(([k, w]) => k === 'AR' ? [Math.abs(w.lo) * 0.6, Math.abs(w.hi) * 0.6] : [Math.abs(w.lo), Math.abs(w.hi)]);
    const maxB = allB.length ? Math.max(...allB) : 0;
    const maxLat = Math.max(0, ...Object.values(worst).map((w) => Math.abs(w.lat)));
    let grade, pts;
    if (how === 'B') { grade = 'B'; pts = 2.5; }
    else if (how === 'WO') { grade = 'WO'; pts = 1; }
    else if (how === 'C') { grade = 'C'; pts = 0; }
    else {
      const rampFt = (p.minRamp ?? 99) / 0.3048;
      if (rampFt < 10) { grade = 'C'; pts = 0; comments.push('RAMP ' + Math.round(rampFt) + 'ft'); }
      else if (maxB <= 1 && maxLat <= 3 && wire === 3 && comments.length === 0) { grade = '_OK_'; pts = 5; }
      else if (maxB <= 2 && maxLat <= 5 && wire >= 2) { grade = 'OK'; pts = 4; }
      else if (maxB <= 3 && maxLat <= 7) { grade = '(OK)'; pts = 3; }
      else { grade = '---'; pts = 2; }
    }
    const res = { grade, pts, wire: wire ?? null, comments: comments.join(' '), sink: Math.round((ac.lastTouchSink || 0) * 196.85), t: new Date().toLocaleTimeString() };
    this.board.unshift(res); this.last = res;
    const spoken = { '_OK_': 'OK, underline', 'OK': 'OK', '(OK)': 'Fair', '---': 'No grade', 'C': 'Cut pass', 'B': 'Bolter, bolter, bolter', 'WO': 'Wave off' }[grade];
    this.say(how === 'TRAP' ? `${spoken}, ${['one', 'two', 'three', 'four'][wire - 1]} wire.` : spoken + '.');
    this.pass = null;
  }
}
