// Streaming real-world terrain: a quadtree of Web Mercator tiles.
// Elevation: AWS Terrain Tiles (Terrarium PNG, open data, includes bathymetry).
//   https://registry.opendata.aws/terrain-tiles/
// Imagery: USGS The National Map, USGSImageryOnly (public domain US government data).
//   https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer
import * as THREE from 'three';
import { tileBounds, llToEN } from './geo.js';

const ELEV_URL = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const IMG_URL = (z, x, y) => `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/${z}/${y}/${x}`;
const GRID = 64;              // quads per tile edge
const MAX_Z = 15, ELEV_MAX_Z = 14, IMG_MAX_Z = 16;
const SPLIT = 2.2;            // split when distance < SPLIT * tile size
const MAX_INFLIGHT = 10;

// Shared curvature patch: drops distant geometry below the horizon like a real 6,371 km Earth.
export function patchCurvature(material) {
  material.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wpC = modelMatrix * vec4( transformed, 1.0 );
      vec3 dC = wpC.xyz - cameraPosition;
      wpC.y -= dot( dC.xz, dC.xz ) / 12742000.0;
      vec4 mvPosition = viewMatrix * wpC;
      gl_Position = projectionMatrix * mvPosition;`);
    if (material.userData.onShader) material.userData.onShader(sh);
  };
  return material;
}

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image(); im.crossOrigin = 'anonymous';
    im.onload = () => res(im); im.onerror = () => rej(new Error('load ' + url)); im.src = url;
  });
}

class Node {
  constructor(t, z, x, y, parent) {
    Object.assign(this, { t, z, x, y, parent });
    this.b = tileBounds(z, x, y);
    const nw = llToEN(this.b.latN, this.b.lonW), se = llToEN(this.b.latS, this.b.lonE);
    this.e0 = nw.e; this.e1 = se.e; this.n0 = se.n; this.n1 = nw.n;
    this.size = this.e1 - this.e0;
    this.center = [(this.e0 + this.e1) / 2, (this.n0 + this.n1) / 2];
    this.children = null; this.mesh = null; this.state = 'new'; this.heights = null; this.minH = 0; this.maxH = 0;
  }
}

export class Terrain {
  constructor(scene, renderer) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.queue = []; this.inflight = 0; this.loadedCount = 0; this.failed = 0;
    this.roots = [];
    // Region: Pacific west of the Golden Gate to the Sierra crest (z8 tiles).
    for (let x = 40; x <= 44; x++) for (let y = 97; y <= 99; y++) this.roots.push(new Node(this, 8, x, y, null));
    this.frame = 0;
  }

  // Decode a Terrarium PNG into a (GRID+1)^2 height grid covering the node, sampled from a
  // source tile that may be an ancestor (when the node is deeper than ELEV_MAX_Z).
  async fetchHeights(node) {
    let z = Math.min(node.z, ELEV_MAX_Z), x = node.x, y = node.y;
    const shift = node.z - z; x >>= shift; y >>= shift;
    const img = await loadImage(ELEV_URL(z, x, y));
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(0, 0, 256, 256).data;
    const sub = 2 ** shift, ox = (node.x - (x << shift)) / sub, oy = (node.y - (y << shift)) / sub;
    const h = new Float32Array((GRID + 1) * (GRID + 1));
    let mn = 1e9, mx = -1e9;
    for (let j = 0; j <= GRID; j++) for (let i = 0; i <= GRID; i++) {
      const u = (ox + i / GRID / sub) * 255, v = (oy + j / GRID / sub) * 255;
      const u0 = Math.floor(u), v0 = Math.floor(v), u1 = Math.min(255, u0 + 1), v1 = Math.min(255, v0 + 1);
      const fu = u - u0, fv = v - v0;
      const s = (uu, vv) => { const k = (vv * 256 + uu) * 4; return px[k] * 256 + px[k + 1] + px[k + 2] / 256 - 32768; };
      const val = (s(u0, v0) * (1 - fu) + s(u1, v0) * fu) * (1 - fv) + (s(u0, v1) * (1 - fu) + s(u1, v1) * fu) * fv;
      h[j * (GRID + 1) + i] = val; mn = Math.min(mn, val); mx = Math.max(mx, val);
    }
    node.minH = mn; node.maxH = mx;
    return h;
  }

  // Imagery one zoom level finer than the mesh: four 256 px tiles into one 512 px texture.
  async fetchImagery(node) {
    const z = Math.min(node.z + 1, IMG_MAX_Z);
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#12303d'; ctx.fillRect(0, 0, 512, 512); // sea color where imagery is missing offshore
    if (z === node.z + 1) {
      const jobs = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
        jobs.push(loadImage(IMG_URL(z, node.x * 2 + dx, node.y * 2 + dy)).then((im) => ctx.drawImage(im, dx * 256, dy * 256)).catch(() => {}));
      await Promise.all(jobs);
    } else {
      try { const im = await loadImage(IMG_URL(node.z, node.x, node.y)); ctx.drawImage(im, 0, 0, 512, 512); } catch (e) { /* offshore: keep sea color */ }
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = this.maxAniso;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    return tex;
  }

  buildMesh(node, h, tex) {
    const N = GRID + 1;
    const skirt = N * 4;
    const pos = new Float32Array((N * N + skirt) * 3), uv = new Float32Array((N * N + skirt) * 2);
    const b = node.b;
    const cx = node.center[0], cy = node.center[1];
    // Mercator-uniform rows so imagery lines up with the tile.
    const yMerc = (lat) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    const m0 = yMerc(b.latN), m1 = yMerc(b.latS);
    const idx = (i, j) => j * N + i;
    for (let j = 0; j < N; j++) {
      const lat = (2 * Math.atan(Math.exp(m0 + (m1 - m0) * j / GRID)) - Math.PI / 2) * 180 / Math.PI;
      for (let i = 0; i < N; i++) {
        const lon = b.lonW + (b.lonE - b.lonW) * i / GRID;
        const en = llToEN(lat, lon);
        let y = h[idx(i, j)]; if (y < 0.5) y = Math.min(-6, y * 0.3 - 6); // seabed: keep it well under the ocean surface
        const k = idx(i, j) * 3;
        pos[k] = en.e - cx; pos[k + 1] = y; pos[k + 2] = -(en.n - cy);
        uv[idx(i, j) * 2] = i / GRID; uv[idx(i, j) * 2 + 1] = 1 - j / GRID;
      }
    }
    const indices = [];
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const a = idx(i, j), b1 = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
      indices.push(a, c, b1, b1, c, d);
    }
    // Skirts hide cracks between neighbors at different detail levels.
    let s = N * N;
    const drop = Math.max(20, node.size * 0.02);
    const edge = [];
    for (let i = 0; i < N; i++) edge.push(idx(i, 0));
    for (let j = 0; j < N; j++) edge.push(idx(GRID, j));
    for (let i = GRID; i >= 0; i--) edge.push(idx(i, GRID));
    for (let j = GRID; j >= 0; j--) edge.push(idx(0, j));
    const skirtIdx = [];
    for (const e of edge.slice(0, skirt)) {
      pos[s * 3] = pos[e * 3]; pos[s * 3 + 1] = pos[e * 3 + 1] - drop; pos[s * 3 + 2] = pos[e * 3 + 2];
      uv[s * 2] = uv[e * 2]; uv[s * 2 + 1] = uv[e * 2 + 1];
      skirtIdx.push([e, s]); s++;
    }
    for (let k = 0; k < skirtIdx.length - 1; k++) {
      const [a, as] = skirtIdx[k], [b2, bs] = skirtIdx[k + 1];
      indices.push(a, as, b2, b2, as, bs, a, b2, as, b2, bs, as);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    const mat = this.makeMaterial(tex);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(cx, 0, -cy);
    mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    g.computeBoundingSphere();
    return mesh;
  }

  makeMaterial(tex) {
    const m = new THREE.MeshLambertMaterial({ map: tex });
    // Imagery already contains real shadows; soften the extra lighting so relief reads without doubling.
    m.userData.onShader = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
        outgoingLight = mix( diffuseColor.rgb * 0.62, outgoingLight, 0.55 );
        #include <opaque_fragment>`);
    };
    return patchCurvature(m);
  }

  request(node, pri) {
    if (node.state !== 'new') return;
    node.state = 'queued'; node.pri = pri; this.queue.push(node);
  }
  pump() {
    this.queue.sort((a, b) => a.pri - b.pri);
    while (this.inflight < MAX_INFLIGHT && this.queue.length) {
      const node = this.queue.shift();
      if (node.state !== 'queued') continue;
      node.state = 'loading'; this.inflight++;
      Promise.all([this.fetchHeights(node), this.fetchImagery(node)]).then(([h, tex]) => {
        node.heights = h; node.mesh = this.buildMesh(node, h, tex); node.mesh.visible = false;
        this.group.add(node.mesh); node.state = 'ready'; this.loadedCount++;
      }).catch(() => { node.state = 'failed'; this.failed++; })
        .finally(() => { this.inflight--; });
    }
  }

  // camE, camN in metres, camAlt in metres.
  update(camE, camN, camAlt) {
    this.frame++;
    const visit = (node) => {
      const dx = Math.max(0, Math.abs(camE - node.center[0]) - node.size / 2);
      const dy = Math.max(0, Math.abs(camN - node.center[1]) - node.size / 2);
      const dist = Math.hypot(dx, dy, Math.max(0, camAlt - node.maxH));
      const want = node.z < MAX_Z && dist < SPLIT * node.size;
      if (node.state === 'new') this.request(node, dist / node.size + (20 - node.z) * 0.01);
      if (want) {
        if (!node.children) node.children = [0, 1, 2, 3].map((k) => new Node(this, node.z + 1, node.x * 2 + (k & 1), node.y * 2 + (k >> 1), node));
        for (const ch of node.children) if (ch.state === 'new') this.request(ch, dist / ch.size);
        const ready = node.children.every((c) => c.state === 'ready' || c.state === 'failed');
        if (ready && node.children.some((c) => c.state === 'ready')) {
          if (node.mesh) node.mesh.visible = false;
          for (const ch of node.children) { if (ch.state === 'ready') visit(ch); else if (node.mesh) node.mesh.visible = true; }
          return;
        }
      } else if (node.children && this.frame % 120 === 0) this.prune(node, dist);
      if (node.mesh) node.mesh.visible = true;
      if (node.children) for (const ch of node.children) this.hide(ch);
    };
    for (const r of this.roots) visit(r);
    this.pump();
  }
  hide(node) {
    if (node.mesh) node.mesh.visible = false;
    if (node.children) for (const c of node.children) this.hide(c);
  }
  // Free GPU memory for far-away detail.
  prune(node, dist) {
    if (dist < 4 * SPLIT * node.size) return;
    const free = (n) => {
      if (n.children) n.children.forEach(free);
      if (n.mesh) { this.group.remove(n.mesh); n.mesh.geometry.dispose(); n.mesh.material.map?.dispose(); n.mesh.material.dispose(); }
    };
    node.children.forEach(free); node.children = null;
  }

  // Terrain height (m) at a point, from the finest loaded tile. Returns null if nothing loaded yet.
  heightAt(e, n) {
    let best = null;
    const walk = (node) => {
      if (e < node.e0 || e > node.e1 || n < node.n0 || n > node.n1) return;
      if (node.heights) best = node;
      if (node.children) for (const c of node.children) walk(c);
    };
    for (const r of this.roots) walk(r);
    if (!best) return null;
    const fx = (e - best.e0) / (best.e1 - best.e0) * GRID, fy = (best.n1 - n) / (best.n1 - best.n0) * GRID;
    const i = Math.max(0, Math.min(GRID - 1, Math.floor(fx))), j = Math.max(0, Math.min(GRID - 1, Math.floor(fy)));
    const u = fx - i, v = fy - j, N = GRID + 1, H = best.heights;
    const hh = (H[j * N + i] * (1 - u) + H[j * N + i + 1] * u) * (1 - v) + (H[(j + 1) * N + i] * (1 - u) + H[(j + 1) * N + i + 1] * u) * v;
    return hh;
  }
}
