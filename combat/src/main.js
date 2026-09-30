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

export const VERSION = 'v00.1.0';
export const BUILD = '2026-09-30 10:40 PT';

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

// NED -> three.js basis: x = east, y = up, z = south.
const qC = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, -1, 0, -1, 0, 0, 0, 0, 0, 0, 1));
const toThree = (p) => new THREE.Vector3(p[1], -p[2], -p[0]);

const surfaceQuery = (pw) => {
  const h = terrain.heightAt(pw[1], pw[0]);
  if (h === null || h <= 0.5) return { h: 0, water: true, mu: 0.3 };
  return { h, water: false, mu: 0.7 };
};
const simEnv = { surface: surfaceQuery, agl: (p) => -p[2] - Math.max(0, terrain.heightAt(p[1], p[0]) ?? 0), wind: [0, 0, 0] };

// Start: 3,000 ft over the Pacific west of the Golden Gate, heading east at 300 kt.
function startAir() {
  const p = llToEN(37.79, -122.85);
  ac.reset({ pos: [p.n, p.e, -3000 * FT], V: 300 * KT, heading: 80 * DEG, fuelKg: 6500 });
  ac.ctl.throttle = input.throttle = 0.72; ac.ctl.gear = 0; ac.gear = 0; ac.ctl.trim = -3.5; ac.surf.ds = -3.5;
}
startAir();

let viewMode = 'chase';
const views = ['chase', 'cockpit', 'orbit', 'flyby'];
const camState = { yaw: 0, pitch: -0.08, dist: 32, smooth: new THREE.Vector3(), flyby: null };
let paused = false, freeze = false, timeScale = 1;
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
    if (code === 'KeyR') startAir();
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
  if (!paused && !freeze) {
    acc += real * timeScale;
    while (acc >= DT) { ac.step(DT, simEnv); acc -= DT; t += DT; }
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
    camera.fov = 70; model.root.visible = true; model.setCockpitView(true);
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
    radarAlt: agl, message: ac.crashed ? ac.crashReason.toUpperCase() + '  (R to restart)' : paused ? 'PAUSED' : '' });
  stamp.textContent = `${VERSION} · ${BUILD}${input.joy !== null ? ' · STICK ' + (input.customMap ? 'CAL' : 'DEFAULT MAP') : ''}`;
}

const stamp = document.getElementById('stamp');

// Debug and screenshot API.
window.IFC = {
  ac, env, terrain, camera, scene, renderer, model, input,
  setView(v) { viewMode = v; },
  setFreeze(f) { freeze = f; },
  advance(sec) { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { ac.step(DT, simEnv); t += DT; } },
  place({ lat, lon, altFt, kt, hdg, pitch = 0 }) {
    const q = llToEN(lat, lon);
    ac.reset({ pos: [q.n, q.e, -altFt * FT], V: kt * KT, heading: hdg * DEG, pitch: pitch * DEG, fuelKg: 6500 });
  },
  cam(o) { Object.assign(camState, o); },
  terrainReady() { return { loaded: terrain.loadedCount, inflight: terrain.inflight, queued: terrain.queue.length, failed: terrain.failed }; },
  render() { render(0.016); },
};
requestAnimationFrame(frame);
