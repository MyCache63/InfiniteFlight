// Sky, sun, fog and ocean.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { patchCurvature } from './terrain.js';

// Tileable ocean normal map built from integer-frequency waves so it wraps seamlessly.
function makeWaveNormals(size = 512, seed = 7) {
  let s = seed; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 48; i++) {
    const k = 1 + Math.floor(rnd() * 22), ang = rnd() * Math.PI * 2;
    const kx = Math.round(Math.cos(ang) * k), ky = Math.round(Math.sin(ang) * k);
    if (kx === 0 && ky === 0) continue;
    waves.push({ kx, ky, a: 1 / Math.pow(Math.hypot(kx, ky), 1.35), ph: rnd() * 6.283 });
  }
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let dx = 0, dy = 0;
    const u = x / size * 6.283185, v = y / size * 6.283185;
    for (const w of waves) {
      const t = w.kx * u + w.ky * v + w.ph;
      // Sharpened crests: derivative of a trochoid-like profile.
      const cs = Math.cos(t);
      dx += w.a * w.kx * cs * (1 + 0.6 * Math.sin(t)); dy += w.a * w.ky * cs * (1 + 0.6 * Math.sin(t));
    }
    const nx = -dx * 0.06, ny = -dy * 0.06, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const k = (y * size + x) * 4;
    img.data[k] = (nx / l * 0.5 + 0.5) * 255; img.data[k + 1] = (ny / l * 0.5 + 0.5) * 255;
    img.data[k + 2] = (nz / l * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene; this.renderer = renderer;
    this.sky = new Sky(); this.sky.scale.setScalar(4.5e5);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2; u.rayleigh.value = 1.25; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);
    this.sunDir = new THREE.Vector3();
    this.sun = new THREE.DirectionalLight(0xfff3e0, 3.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 400;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun); scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a5448, 0.9);
    scene.add(this.hemi);
    scene.fog = new THREE.FogExp2(0xb9cde0, 0.000028);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.buildOcean();
    this.setTimeOfDay(15.5);
  }

  setTimeOfDay(hours) {
    this.hours = hours;
    // Simple solar position for late September at 37.8 N: elevation peaks near 52 deg at solar noon.
    const ha = (hours - 13.0) / 24 * Math.PI * 2;
    const dec = -1.5 * Math.PI / 180, lat = 37.8 * Math.PI / 180;
    const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
    const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) + Math.PI;
    this.sunEl = el;
    const phi = Math.PI / 2 - el;
    this.sunDir.setFromSphericalCoords(1, phi, -az + Math.PI);
    this.sky.material.uniforms.sunPosition.value.copy(this.sunDir);
    const warm = Math.max(0, Math.min(1, el / 0.35));
    this.sun.color.setRGB(1, 0.78 + 0.2 * warm, 0.6 + 0.35 * warm);
    this.sun.intensity = 3.2 * Math.max(0.05, Math.min(1, el / 0.12));
    this.hemi.intensity = 0.35 + 0.65 * Math.max(0, Math.min(1, (el + 0.05) / 0.3));
    this.scene.fog.color.setRGB(0.62 + 0.1 * (1 - warm), 0.72, 0.82).multiplyScalar(0.25 + 0.75 * Math.max(0, Math.min(1, (el + 0.05) / 0.25)));
    // Environment map for reflections on the jet, ship and water.
    const skyScene = new THREE.Scene(); const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.assign(sky2.material.uniforms.sunPosition.value, this.sunDir);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) sky2.material.uniforms[k].value = this.sky.material.uniforms[k].value;
    skyScene.add(sky2);
    const ground = new THREE.Mesh(new THREE.SphereGeometry(900, 16, 8, 0, Math.PI * 2, Math.PI / 2 + 0.02, Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5d7488, side: THREE.BackSide }));
    skyScene.add(ground);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(skyScene, 0.02);
    this.scene.environment = this.envRT.texture;
  }

  buildOcean() {
    const nrm = makeWaveNormals();
    // Radial grid: dense near the camera, coarse to the horizon (the mesh follows the camera).
    const rings = 90, segs = 128, pos = [], idx = [];
    for (let r = 0; r <= rings; r++) {
      const rad = r === 0 ? 0 : 6 * Math.pow(1.12, r - 1) - 5;
      for (let s = 0; s < segs; s++) { const a = s / segs * Math.PI * 2; pos.push(Math.cos(a) * rad, 0, Math.sin(a) * rad); }
    }
    for (let r = 0; r < rings; r++) for (let s = 0; s < segs; s++) {
      const a = r * segs + s, b = r * segs + (s + 1) % segs, c = a + segs, d = b + segs;
      idx.push(a, b, c, b, d, c); // counter-clockwise seen from above
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const uvs = []; for (let i = 0; i < pos.length; i += 3) uvs.push(pos[i] / 61, -pos[i + 2] / 61);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0x0d2a3c, roughness: 0.06, metalness: 0.0, normalMap: nrm, envMapIntensity: 1.0 });
    mat.normalScale.set(0.42, 0.42);
    const uniforms = { uTime: { value: 0 }, uNrm: { value: nrm } };
    this.oceanUniforms = uniforms;
    mat.userData.onShader = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = 'varying vec3 vWorldO;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorldO = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = 'uniform float uTime; uniform sampler2D uNrm; varying vec3 vWorldO;\n' + sh.fragmentShader
        .replace('#include <normal_fragment_maps>', `
          // Four octaves of scrolling wave normals at unrelated scales and rotations, faded with distance,
          // so no repeat is visible from altitude. A very large octave breaks up the far field.
          float dist = length(vWorldO - cameraPosition);
          vec2 w = vWorldO.xz;
          mat2 r1 = mat2(0.8, -0.6, 0.6, 0.8), r2 = mat2(0.28, 0.96, -0.96, 0.28);
          vec2 s1 = texture2D(uNrm, (r1 * w) / 173.0 + vec2(0.006, 0.002) * uTime).xy * 2.0 - 1.0;
          vec2 s2 = texture2D(uNrm, (r2 * w) / 67.0 + vec2(-0.011, 0.013) * uTime).xy * 2.0 - 1.0;
          vec2 s3 = texture2D(uNrm, w / 19.0 + vec2(0.021, -0.017) * uTime).xy * 2.0 - 1.0;
          vec2 s4 = texture2D(uNrm, (r1 * w) / 1900.0 + vec2(0.0007, 0.0003) * uTime).xy * 2.0 - 1.0;
          float fNear = 1.0 - smoothstep(150.0, 1800.0, dist);
          float fMid = 1.0 - smoothstep(1500.0, 9000.0, dist);
          vec2 slope = s1 * 0.55 * fMid + s2 * 0.45 * fMid + s3 * 0.35 * fNear + s4 * 0.35;
          vec3 mapN = normalize(vec3(slope * normalScale, 1.0));
          normal = normalize( tbn * mapN );`)
        .replace('#include <opaque_fragment>', `
          // Water body color: brighter, greener in the troughs seen at grazing angles (subsurface look).
          vec3 vdir = normalize(cameraPosition - vWorldO);
          float grazing = 1.0 - clamp(dot(vdir, vec3(0.0,1.0,0.0)), 0.0, 1.0);
          outgoingLight += vec3(0.0, 0.035, 0.04) * pow(grazing, 3.0) * (1.0 - clamp(dist/8000.0,0.0,1.0));
          #include <opaque_fragment>`);
    };
    // Tangent frame for a flat plane: the default derivative-based TBN works; keep it.
    patchCurvature(mat);
    this.ocean = new THREE.Mesh(g, mat);
    this.ocean.receiveShadow = true;
    this.ocean.frustumCulled = false;
    this.ocean.renderOrder = -1;
    this.scene.add(this.ocean);
  }

  update(dt, camPos) {
    this.oceanUniforms.uTime.value += dt;
    // Keep the ocean grid centered under the camera (snap to avoid swimming texture).
    this.ocean.position.set(Math.round(camPos.x / 50) * 50, 0, Math.round(camPos.z / 50) * 50);
    this.sky.position.copy(camPos);
    // Thinner haze at altitude.
    const alt = Math.max(0, camPos.y);
    this.scene.fog.density = 0.000032 * Math.exp(-alt / 5200) + 0.000004;
  }

  placeSunShadow(target) {
    this.sun.position.copy(target).addScaledVector(this.sunDir, 200);
    this.sun.target.position.copy(target);
  }
}
