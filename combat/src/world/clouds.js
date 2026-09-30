// Cloud layer: clustered, camera-facing puffs drawn as one instanced mesh.
// Each puff is lit from the sun direction in the shader: brighter on the sun side and top, darker grey bases.
import * as THREE from 'three';

// Four puff variants in a 2x2 atlas. Each is a cluster of soft lobes eroded by value noise, so edges are wispy
// and no two neighbouring puffs look the same.
function puffTexture(size = 512, seed = 5) {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  const half = size / 2;
  for (let v = 0; v < 4; v++) {
    const ox = (v & 1) * half, oy = (v >> 1) * half;
    x.save(); x.beginPath(); x.rect(ox, oy, half, half); x.clip();
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2, d = Math.pow(r(), 0.8) * half * 0.3;
      const cx = ox + half / 2 + Math.cos(a) * d * 1.2, cy = oy + half * 0.55 + Math.sin(a) * d * 0.55 - r() * half * 0.08;
      const rad = half * (0.04 + r() * 0.1);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(0.6, 'rgba(255,255,255,0.1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(ox, oy, half, half);
    }
    x.restore();
  }
  // Erode with value noise and soften the flat base.
  const img = x.getImageData(0, 0, size, size), d = img.data;
  const N = 64, grid = new Float32Array(N * N).map(() => r());
  const noise = (u, v) => { const fx = u * N, fy = v * N, i = Math.floor(fx) % N, j = Math.floor(fy) % N, i1 = (i + 1) % N, j1 = (j + 1) % N, tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
    const a = grid[j * N + i] * (1 - tx) + grid[j * N + i1] * tx, b = grid[j1 * N + i] * (1 - tx) + grid[j1 * N + i1] * tx; return a * (1 - ty) + b * ty; };
  for (let y = 0; y < size; y++) for (let xx = 0; xx < size; xx++) {
    const k = (y * size + xx) * 4;
    const n = 0.55 * noise(xx / size, y / size) + 0.3 * noise(xx / size * 2.7, y / size * 2.7) + 0.15 * noise(xx / size * 7, y / size * 7);
    const a = d[k] / 255;
    d[k] = d[k + 1] = d[k + 2] = 255;
    d[k + 3] = Math.max(0, Math.min(255, (a * 1.8 - (1 - n) * 0.55) * 255));
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace;
  return t;
}

export class Clouds {
  constructor(scene, { count = 3200, radius = 45000, base = 1100, top = 2300, seed = 3 } = {}) {
    this.scene = scene; this.radius = radius;
    let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        uTex: { value: puffTexture() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color(1, 0.97, 0.9) },
        uAmb: { value: new THREE.Color(0.55, 0.62, 0.72) }, uOffset: { value: new THREE.Vector2() },
      }]),
      vertexShader: `
        attribute vec4 aPuff; // xyz center (relative to layer origin), w size
        attribute float aShade; attribute float aVar;
        uniform vec2 uOffset;
        varying vec2 vUv; varying float vShade; varying float vH; varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main() {
          vUv = (uv + vec2(mod(aVar, 2.0), floor(aVar / 2.0))) * 0.5; vShade = aShade;
          vec3 c = aPuff.xyz; c.xz += uOffset;
          vec4 wp = modelMatrix * vec4(c, 1.0);
          // Billboard: expand in view space.
          vec4 mvPosition = viewMatrix * wp;
          mvPosition.xy += position.xy * aPuff.w * vec2(1.0, 0.62);
          vH = position.y; vWorld = wp.xyz;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `
        uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uSunColor; uniform vec3 uAmb;
        varying vec2 vUv; varying float vShade; varying float vH; varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main() {
          float a = texture2D(uTex, vUv).r;
          if (a < 0.01) discard;
          vec3 toCam = normalize(cameraPosition - vWorld);
          float sunSide = 0.5 + 0.5 * dot(normalize(vec3(uSun.x, 0.0, uSun.z) + vec3(0.0, 0.001, 0.0)), -toCam * vec3(1.0, 0.0, 1.0));
          float lit = clamp(0.45 + 0.55 * (vH + 0.5) * vShade + 0.25 * sunSide, 0.0, 1.2);
          vec3 col = mix(uAmb * 0.75, uSunColor * 1.05, lit);
          // Silver lining when looking toward the sun through thin edges.
          float fwd = pow(max(0.0, dot(-toCam, normalize(uSun))), 8.0);
          col += uSunColor * fwd * (1.0 - a) * 0.8;
          gl_FragColor = vec4(col, a * 0.8);
          #include <fog_fragment>
        }`,
    });
    this.mat = mat;
    const puffs = new Float32Array(count * 4), shade = new Float32Array(count), vari = new Float32Array(count);
    // Clusters of puffs: a few big heaps and scattered small cells.
    let i = 0;
    while (i < count) {
      const cx = (r() * 2 - 1) * radius, cz = (r() * 2 - 1) * radius;
      const cell = 700 + r() * 2200, n = 10 + Math.floor(r() * 40), hgt = base + r() * 250;
      for (let k = 0; k < n && i < count; k++, i++) {
        const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * cell;
        const y = hgt + Math.pow(r(), 1.5) * (top - base) * (1 - d / cell * 0.7);
        puffs.set([cx + Math.cos(a) * d, y, cz + Math.sin(a) * d * 0.8, 450 + r() * 1100 * (1 - d / cell * 0.5)], i * 4);
        shade[i] = 0.6 + r() * 0.5; vari[i] = Math.floor(r() * 4);
      }
    }
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = geo.index; ig.attributes.position = geo.attributes.position; ig.attributes.uv = geo.attributes.uv;
    ig.setAttribute('aPuff', new THREE.InstancedBufferAttribute(puffs, 4));
    ig.setAttribute('aShade', new THREE.InstancedBufferAttribute(shade, 1));
    ig.setAttribute('aVar', new THREE.InstancedBufferAttribute(vari, 1));
    ig.instanceCount = count;
    this.mesh = new THREE.Mesh(ig, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }
  update(camPos, sunDir, sunColor, windOffset) {
    // Wrap the layer around the camera so it never runs out.
    const R = this.radius * 2;
    this.mesh.position.set(Math.floor(camPos.x / R) * R, 0, Math.floor(camPos.z / R) * R);
    this.mat.uniforms.uSun.value.copy(sunDir);
    if (sunColor) this.mat.uniforms.uSunColor.value.copy(sunColor);
    if (windOffset) this.mat.uniforms.uOffset.value.copy(windOffset);
  }
}
