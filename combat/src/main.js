// InfiniteFlight Combat: F-14 over the real SF Bay and Sierra.
import * as THREE from 'three';
import { F14, EYE_POINT, qrot } from './fdm/fdm.js';
import { KT, FT, DEG } from './fdm/atmosphere.js';
import { Terrain } from './world/terrain.js';
import { Environment } from './world/environment.js';
import { F14Model } from './aircraft/f14model.js';
import { Input } from './input.js';
import { HUD } from './hud.js';
import { llToEN } from './world/geo.js';
import { Carrier, DECK_H } from './world/carrier.js';
import { trim } from './fdm/trim.js';
import { qinvrot, qFromEuler } from './fdm/fdm.js';

export const VERSION = 'v00.2.0';
export const BUILD = '2026-09-30 13:20 PT';

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.62;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 6e5);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const env = new Environment(scene, renderer);
const terrain = new Terrain(scene, renderer);
const model = new F14Model(); scene.add(model.root);
const input = new Input();
const hud = new HUD();
const ac = new F14();
const carrier = new Carrier(scene, { lat: 37.70, lon: -123.10, heading: 320, speedKt: 22 });
carrier.naturalWindKt = 10;
const windNED = [-10 * KT * Math.cos(carrier.heading), -10 * KT * Math.sin(carrier.heading), 0];

// NED -> three.js basis: x = east, y = up, z = south.
const qC = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, -1, 0, -1, 0, 0, 0, 0, 0, 0, 1));
const toThree = (p) => new THREE.Vector3(p[1], -p[2], -p[0]);

const surfaceQuery = (pw) => {
  const deck = carrier.surface(pw); if (deck) return deck;
  const h = terrain.heightAt(pw[1], pw[0]);
  if (h === null || h <= 0.5) return { h: 0, water: true, mu: 0.3 };
  return { h, water: false, mu: 0.7 };
};
const simEnv = { surface: surfaceQuery, agl: (p) => -p[2] - (carrier.surface(p)?.h ?? Math.max(0, terrain.heightAt(p[1], p[0]) ?? 0)), wind: windNED };

// Start: 3,000 ft over the Pacific west of the Golden Gate, heading east at 300 kt.
function startAir() {
  const p = llToEN(37.79, -122.85);
  ac.reset({ pos: [p.n, p.e, -3000 * FT], V: 300 * KT, heading: 80 * DEG, fuelKg: 6500 });
  ac.ctl.throttle = input.throttle = 0.72; ac.ctl.gear = 0; ac.gear = 0; ac.ctl.trim = -3.5; ac.surf.ds = -3.5;
}
// In the groove: on glide slope and centerline, on-speed, hook and gear down, 3/4 nm behind the ramp.
function startGroove(rangeM = 1400) {
  const axis = carrier.landingAxis();
  // Closure c along the landing axis so that the airspeed is 128 kt: |v_ship + c*axis - wind| = Va.
  const vs = carrier.shipVelNED(), Va = 128 * KT;
  const bx = vs[0] - windNED[0], by = vs[1] - windNED[1];
  const B = 2 * (bx * axis[0] + by * axis[1]), C = bx * bx + by * by - Va * Va;
  const cl = (-B + Math.sqrt(B * B - 4 * C)) / 2;
  const vAir = [bx + cl * axis[0], by + cl * axis[1]];
  const hdg = Math.atan2(vAir[1], vAir[0]); // crab into the deck's sideways drift
  const t = trim({ V: 128 * KT, h: 60, massKg: 44531 * 0.4536 + 3600, cfg: { flaps: 1, gear: 1 }, gammaDeg: -2.6 });
  apState.th0 = t.throttle; apState.thI = 0; apState.lastLat = null; apState.lastH = null; apState.pI = 0;
  // Hook on the 3.5 deg path to the hook touchdown point (230 ft from the ramp).
  const s = -rangeM, hookH = (70.1 - s) * Math.tan(3.5 * DEG);
  const lp = carrier.landingPoint(s, 0, 0);
  const w = carrier.toWorld(lp[0], lp[1], DECK_H + hookH + 3.5);
  ac.reset({ pos: w, V: 128 * KT, heading: hdg, pitch: 0, fuelKg: 3600 });
  const pitch = (t.alpha - 2.6) * DEG;
  ac.q = qFromEuler(0, pitch, hdg);
  const vAirBody = [128 * KT * Math.cos(t.alpha * DEG), 0, 128 * KT * Math.sin(t.alpha * DEG)];
  const wb = qinvrot(ac.q, windNED);
  ac.vel = [vAirBody[0] + wb[0], vAirBody[1] + wb[1], vAirBody[2] + wb[2]];
  Object.assign(ac.ctl, { gear: 1, flaps: 1, hook: 1, throttle: t.throttle, trim: t.ds + 33 * 0 });
  ac.gear = 1; ac.flaps = 1; ac.slats = 1; ac.hookPos = 1; ac.sweep = 20; ac.surf.ds = t.ds; ac.ctl.trim = t.ds;
  for (const e of [ac.engL, ac.engR]) { e.T = e.commandedDry(t.throttle); e.Tdot = 0; e.ab = 0; }
  input.throttle = t.throttle; input.throttleAbs = null;
  carrier.trap = null; carrier.cat = null; carrier.lso.pass = null; carrier.prevHookS = null;
  carrier.update(0, ac); // refresh hook geometry so nothing reads the pre-reset state
  mode = 'groove';
}
function startCat() { carrier.spotOnCat(ac, 1); input.throttle = 0.2; input.throttleAbs = null; mode = 'cat'; }
// Case I break: 800 ft, 350 kt, overhead the ship heading along the ship's course, hook down.
function startBreak() {
  const w = carrier.toWorld(-2200, 800, 800 * FT);
  ac.reset({ pos: w, V: 350 * KT, heading: carrier.heading, fuelKg: 4000 });
  const t = trim({ V: 350 * KT, h: 250, massKg: ac.mass });
  ac.q = qFromEuler(0, t.alpha * DEG, carrier.heading);
  ac.vel = [350 * KT * Math.cos(t.alpha * DEG), 0, 350 * KT * Math.sin(t.alpha * DEG)];
  Object.assign(ac.ctl, { gear: 0, flaps: 0, hook: 1, throttle: t.throttle, trim: t.ds }); ac.surf.ds = t.ds; ac.hookPos = 1; ac.gear = 0;
  for (const e of [ac.engL, ac.engR]) { e.T = e.commandedDry(t.throttle); e.Tdot = 0; }
  input.throttle = t.throttle; input.throttleAbs = null; mode = 'break';
}
let mode = 'free';
let autoApproach = false;
// Approach autopilot for testing and demos: APC-style autothrottle on AOA, pitch on the ball, roll on lineup.
const apState = { thI: 0, lastLat: null, th0: 0.3, lastH: null, pI: 0 };
function approachPilot(dt) {
  const c = ac.ctl, hi = carrier.hookInfo; if (!hi || dt <= 0) return;
  if (carrier.trap) { c.throttle = carrier.trap.stopped ? 0 : 0.8; c.pitch = 0; c.roll = 0; return; }
  const e = ac.euler;
  // APC mode (the F-14's approach power compensator): throttle holds on-speed AOA; the pilot flies the ball
  // with pitch attitude. Target attitude = on-speed alpha + commanded flight path.
  const pathH = (70.1 - hi.s) * Math.tan(3.5 * DEG), hErr = hi.h - pathH;
  const hRate = apState.lastH === null ? 0 : Math.max(-15, Math.min(15, (hErr - apState.lastH) / dt)); apState.lastH = hErr;
  const kh = apState.kh ?? 0.25, kr = apState.kr ?? 1.0;
  const gamCmd = (-2.6 - Math.max(-2.5, Math.min(2.5, kh * hErr + kr * hRate))) * DEG;
  const alphaOn = ((15 / 0.6) - 10) / 1.2 * DEG;
  c.pitch = Math.max(-0.5, Math.min(0.5, (alphaOn + gamCmd - e.theta) * 5.0 - ac.omega[1] * 2.0));
  const aoaErr = ac.aoaUnits - 15;
  apState.thI = Math.max(-0.3, Math.min(0.3, apState.thI + aoaErr * 0.03 * dt));
  c.throttle = Math.max(0.05, Math.min(0.8, apState.th0 + 1.7 * (gamCmd + 2.6 * DEG) + aoaErr * 0.06 + apState.thI));
  // Lineup: bank toward the centerline with damping on the drift rate, limited to 10 deg.
  const latRate = apState.lastLat === null ? 0 : (hi.lat - apState.lastLat) / dt; apState.lastLat = hi.lat;
  const bankCmd = Math.max(-10, Math.min(10, -(0.8 * hi.lat + 3.5 * latRate))) * DEG;
  c.roll = Math.max(-0.5, Math.min(0.5, (bankCmd - e.phi) * 2.5 - ac.omega[0] * 0.4));
  c.yaw = Math.max(-0.3, Math.min(0.3, ac.beta * 0.05));
  if (ac.onGround || carrier.trap) { c.throttle = 0.8; } // military power at touchdown (NATOPS), not before
}
let viewMode = 'chase';
const views = ['chase', 'cockpit', 'orbit', 'flyby'];
const camState = { yaw: 0, pitch: -0.08, dist: 32, smooth: new THREE.Vector3(), flyby: null };
let paused = false, freeze = false, timeScale = 1, showBall = false;
let dragging = false, lastMouse = null;
renderer.domElement.addEventListener('mousedown', (e) => { dragging = true; lastMouse = [e.clientX, e.clientY]; });
addEventListener('mouseup', () => { dragging = false; });
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouse[0], dy = e.clientY - lastMouse[1]; lastMouse = [e.clientX, e.clientY];
  if (viewMode === 'cockpit') { input.look.x -= dx * 0.004; input.look.y -= dy * 0.004; }
  else { camState.yaw -= dx * 0.005; camState.pitch = Math.max(-1.4, Math.min(1.4, camState.pitch - dy * 0.005)); }
});
addEventListener('wheel', (e) => { camState.dist = Math.max(12, Math.min(400, camState.dist * (1 + e.deltaY * 0.001))); });

function handleKeys() {
  for (const code of input.takeEdges()) {
    const c = ac.ctl;
    if (code === 'KeyG') c.gear = c.gear ? 0 : 1;
    if (code === 'KeyF') c.flaps = c.flaps ? 0 : 1;
    if (code === 'KeyH') c.hook = c.hook ? 0 : 1;
    if (code === 'KeyB') c.speedbrake = c.speedbrake ? 0 : 1;
    if (code === 'KeyV') { viewMode = views[(views.indexOf(viewMode) + 1) % views.length]; camState.flyby = null; }
    if (code === 'KeyR') ({ groove: startGroove, cat: startCat, break: startBreak, free: startAir })[mode]();
    if (code === 'Digit1') startGroove();
    if (code === 'Digit2') startCat();
    if (code === 'Digit3') startBreak();
    if (code === 'Digit0') { startAir(); mode = 'free'; }
    if (code === 'KeyM') showBall = !showBall;
    if (code === 'KeyA' && input.keys.ShiftLeft) autoApproach = !autoApproach;
    if (code === 'KeyP') paused = !paused;
    if (code === 'BracketLeft') c.trim = Math.min(10, c.trim + 0.5);
    if (code === 'BracketRight') c.trim = Math.max(-20, c.trim - 0.5);
    if (code === 'KeyT') env.setTimeOfDay((env.hours + 1) % 24);
  }
}

const clock = new THREE.Clock();
let acc = 0, t = 0;
const DT = 1 / 120;
function frame() {
  const real = Math.min(0.1, clock.getDelta());
  input.update(real);
  handleKeys();
  const c = ac.ctl;
  c.pitch = input.pitch; c.roll = input.roll; c.yaw = input.yaw; c.throttle = input.throttle; c.brake = input.brake;
  if (autoApproach) approachPilot(real);
  if (!paused && !freeze) {
    acc += real * timeScale;
    while (acc >= DT) { carrier.update(DT, ac); ac.step(DT, simEnv); acc -= DT; t += DT; }
  }
  render(real);
  requestAnimationFrame(frame);
}

function render(dt) {
  const p = toThree(ac.pos);
  const qBody = new THREE.Quaternion(ac.q[1], ac.q[2], ac.q[3], ac.q[0]);
  model.root.position.copy(p);
  model.root.quaternion.copy(qC).multiply(qBody);
  model.update(ac, t);
  // Cameras.
  const fwd = toThree(qrot(ac.q, [1, 0, 0])).normalize();
  if (viewMode === 'cockpit') {
    camera.fov = input.keys.KeyZ ? 28 : 70; model.root.visible = true; model.setCockpitView(true);
    const eye = toThree(qrot(ac.q, EYE_POINT)).add(p);
    camera.position.copy(eye);
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(input.look.y, input.look.x, 0, 'YXZ'));
    // Camera looks along -z; body forward is +x. Rotate so camera -z = body +x, camera +y = body -z.
    const qCam = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      toThree(qrot(ac.q, [0, 1, 0])), toThree(qrot(ac.q, [0, 0, -1])), toThree(qrot(ac.q, [-1, 0, 0]))));
    camera.quaternion.copy(qCam).multiply(look);
    input.look.x *= 0.985; input.look.y *= 0.985;
  } else if (viewMode === 'flyby') {
    model.setCockpitView(false);
    camera.fov = 45;
    if (!camState.flyby || camState.flyby.distanceTo(p) > 900) camState.flyby = p.clone().addScaledVector(fwd, 400).add(new THREE.Vector3(30, 8, 30));
    camera.position.copy(camState.flyby); camera.lookAt(p);
  } else {
    model.setCockpitView(false);
    camera.fov = 58;
    const yaw = Math.atan2(fwd.x, fwd.z) + camState.yaw;
    const d = camState.dist;
    const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(camState.pitch), Math.sin(-camState.pitch), Math.cos(yaw) * Math.cos(camState.pitch)).multiplyScalar(-d);
    const target = p.clone().add(off);
    if (viewMode === 'chase') { camState.smooth.lerp(target, 1 - Math.exp(-dt * 6)); if (camState.smooth.distanceTo(p) > d * 4) camState.smooth.copy(target); camera.position.copy(camState.smooth); }
    else camera.position.copy(target);
    camera.lookAt(p.clone().addScaledVector(new THREE.Vector3(0, 1, 0), 2));
  }
  camera.updateProjectionMatrix();
  env.update(dt, camera.position);
  env.placeSunShadow(p);
  terrain.update(camera.position.x, -camera.position.z, camera.position.y);
  renderer.render(scene, camera);
  const agl = simEnv.agl(ac.pos) / FT;
  hud.draw(ac, camera, viewMode === 'cockpit' || viewMode === 'chase' ? viewMode : 'none', {
    radarAlt: agl, message: ac.crashed ? ac.crashReason.toUpperCase() + '  (R to restart)' : paused ? 'PAUSED' : carrier.trap?.stopped ? 'TRAPPED  ' + carrier.trap.wire + ' WIRE' : '',
    lso: carrier.lso.captionT > 0 ? 'LSO: ' + carrier.lso.caption : '', board: carrier.lso.board, ball: showBall ? carrier.ballCells(ac) : undefined });
  stamp.textContent = `${VERSION} · ${BUILD}${input.joy !== null ? ' · STICK ' + (input.customMap ? 'CAL' : 'DEFAULT MAP') : ''}`;
}

const stamp = document.getElementById('stamp');

// Debug and screenshot API.
window.IFC = {
  ac, env, terrain, camera, scene, renderer, model, input,
  setView(v) { viewMode = v; },
  setFreeze(f) { freeze = f; },
  advance(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { carrier.update(DT, ac); ac.step(DT, simEnv); t += DT; } },
  carrier, startGroove, startCat, startBreak,
  setAuto(v) { autoApproach = v; },
  apState,
  trace(sec, every = 1) { const out = []; const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { approachPilot(DT); carrier.update(DT, ac); ac.step(DT, simEnv); t += DT; if (i % Math.round(every / DT) === 0) { const h = carrier.hookInfo || {}; out.push([+(i * DT).toFixed(1), Math.round(h.s), +(h.lat ?? 0).toFixed(1), +(h.h ?? 0).toFixed(1), +(carrier.ballCells(ac) ?? 0).toFixed(2), +ac.aoaUnits.toFixed(1), +(ac.euler.theta / DEG).toFixed(1), +(ac.euler.phi / DEG).toFixed(1), +ac.ctl.throttle.toFixed(2), Math.round(ac.V / KT)]); } } return out; },
  stepAuto(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { approachPilot(DT); carrier.update(DT, ac); ac.step(DT, simEnv); t += DT; } },
  place({ lat, lon, altFt, kt, hdg, pitch = 0 }) {
    const q = llToEN(lat, lon);
    ac.reset({ pos: [q.n, q.e, -altFt * FT], V: kt * KT, heading: hdg * DEG, pitch: pitch * DEG, fuelKg: 6500 });
  },
  cam(o) { Object.assign(camState, o); },
  terrainReady() { return { loaded: terrain.loadedCount, inflight: terrain.inflight, queued: terrain.queue.length, failed: terrain.failed }; },
  render() { render(0.016); },
};
requestAnimationFrame(frame);
