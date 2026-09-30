// Head-up display drawn on a 2D canvas over the 3D view.
// Pitch ladder and flight-path marker are scaled to the camera's field of view so they overlay the
// real horizon in the cockpit view.
const DEG = Math.PI / 180;

export class HUD {
  constructor() {
    this.c = document.createElement('canvas');
    Object.assign(this.c.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: 5 });
    document.body.appendChild(this.c);
    this.x = this.c.getContext('2d');
    this.resize(); addEventListener('resize', () => this.resize());
    this.color = '#7dffa8';
  }
  resize() { const d = Math.min(2, devicePixelRatio || 1); this.c.width = innerWidth * d; this.c.height = innerHeight * d; this.dpr = d; }

  draw(ac, cam, mode, extra = {}) {
    const x = this.x, W = this.c.width, H = this.c.height, d = this.dpr;
    x.clearRect(0, 0, W, H);
    if (mode === 'none') return;
    const e = ac.euler;
    const pxPerDeg = (H / 2) / Math.tan(cam.fov / 2 * DEG) * DEG;
    const cx = W / 2, cy = H * (mode === 'cockpit' ? 0.5 : 0.46);
    x.save();
    x.strokeStyle = this.color; x.fillStyle = this.color; x.lineWidth = 1.6 * d;
    x.shadowColor = 'rgba(80,255,150,0.6)'; x.shadowBlur = 4 * d;
    x.font = `${13 * d}px "IBM Plex Mono", Menlo, monospace`; x.textBaseline = 'middle';
    const kts = ac.V / 0.514444, altFt = ac.altitude / 0.3048;
    const full = mode === 'cockpit';
    // Pitch ladder, rotated by bank, centered on the boresight (waterline). Cockpit view only.
    if (full) {
    x.save(); x.translate(cx, cy); x.rotate(-e.phi);
    x.beginPath(); x.rect(-W * 0.22, -H * 0.3, W * 0.44, H * 0.6); x.clip();
    const pitchDeg = e.theta / DEG;
    for (let p = -90; p <= 90; p += 5) {
      const y = (pitchDeg - p) * pxPerDeg;
      if (Math.abs(y) > H * 0.32) continue;
      const w = p === 0 ? W * 0.2 : W * 0.06, gap = W * 0.025;
      x.setLineDash(p < 0 ? [6 * d, 5 * d] : []);
      x.beginPath();
      x.moveTo(-w - gap, y); x.lineTo(-gap, y); x.moveTo(gap, y); x.lineTo(w + gap, y);
      if (p !== 0) { const t = p > 0 ? 8 * d : -8 * d; x.moveTo(-w - gap, y); x.lineTo(-w - gap, y + t); x.moveTo(w + gap, y); x.lineTo(w + gap, y + t); }
      x.stroke();
      if (p !== 0) { x.textAlign = 'right'; x.fillText(Math.abs(p), -w - gap - 6 * d, y); x.textAlign = 'left'; x.fillText(Math.abs(p), w + gap + 6 * d, y); }
    }
    x.setLineDash([]);
    x.restore();
    }
    // Waterline (gun cross) and flight-path marker (velocity vector).
    if (full) {
    x.beginPath(); x.moveTo(cx - 18 * d, cy); x.lineTo(cx - 8 * d, cy); x.lineTo(cx - 4 * d, cy + 5 * d); x.lineTo(cx, cy); x.lineTo(cx + 4 * d, cy + 5 * d); x.lineTo(cx + 8 * d, cy); x.lineTo(cx + 18 * d, cy); x.stroke();
    const fpmY = cy + ac.alpha * pxPerDeg, fpmX = cx - ac.beta * pxPerDeg;
    x.beginPath(); x.arc(fpmX, fpmY, 7 * d, 0, Math.PI * 2);
    x.moveTo(fpmX - 7 * d, fpmY); x.lineTo(fpmX - 16 * d, fpmY); x.moveTo(fpmX + 7 * d, fpmY); x.lineTo(fpmX + 16 * d, fpmY);
    x.moveTo(fpmX, fpmY - 7 * d); x.lineTo(fpmX, fpmY - 13 * d); x.stroke();
    }
    // Heading tape.
    const hdg = ((e.psi / DEG) + 360) % 360;
    const ty = H * 0.14;
    x.textAlign = 'center';
    for (let h = Math.floor(hdg / 5) * 5 - 30; h <= hdg + 30; h += 5) {
      const px = cx + (h - hdg) * 6 * d;
      x.beginPath(); x.moveTo(px, ty); x.lineTo(px, ty + (h % 10 === 0 ? 10 : 5) * d); x.stroke();
      if (h % 10 === 0) x.fillText(String(((h % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), px, ty - 10 * d);
    }
    x.beginPath(); x.moveTo(cx, ty + 14 * d); x.lineTo(cx - 5 * d, ty + 22 * d); x.lineTo(cx + 5 * d, ty + 22 * d); x.closePath(); x.stroke();
    // Airspeed and altitude boxes.
    const box = (bx, by, txt, al) => { x.strokeRect(bx - 38 * d, by - 11 * d, 76 * d, 22 * d); x.textAlign = al; x.fillText(txt, bx + (al === 'right' ? 32 : al === 'left' ? -32 : 0) * d, by); };
    x.font = `bold ${15 * d}px "IBM Plex Mono", Menlo, monospace`;
    box(cx - W * 0.2, cy, String(Math.round(kts)), 'right');
    box(cx + W * 0.2, cy, altFt >= 1000 ? (altFt / 1000).toFixed(1).replace('.', ',') + '00' : String(Math.round(altFt / 10) * 10), 'right');
    x.font = `${13 * d}px "IBM Plex Mono", Menlo, monospace`;
    x.textAlign = 'left';
    const lx = cx - W * 0.2 - 38 * d, rx = cx + W * 0.2 - 38 * d;
    x.fillText('M ' + ac.mach.toFixed(2), lx, cy + 28 * d);
    x.fillText('G ' + ac.nz.toFixed(1), lx, cy + 46 * d);
    x.fillText('α ' + ac.aoaUnits.toFixed(1) + 'u', lx, cy + 64 * d);
    const vs = ac.vWorld[2] * -196.85;
    x.fillText((vs >= 0 ? '+' : '') + Math.round(vs / 10) * 10 + ' fpm', rx, cy + 28 * d);
    if (extra.radarAlt !== undefined && extra.radarAlt < 5000) x.fillText('R ' + Math.round(extra.radarAlt) + ' ft', rx, cy + 46 * d);
    // Status line.
    const thr = ac.ctl.throttle, ab = Math.max(ac.engL.ab, ac.engR.ab);
    const pwr = ab > 0.01 ? 'AB ' + Math.round(ab * 100) + '%' : thr >= 0.79 ? 'MIL' : Math.round(thr / 0.8 * 100) + '%';
    const flags = [pwr, 'SWP ' + Math.round(ac.sweep), ac.gear > 0.5 ? 'GEAR' : '', ac.flaps > 0.5 ? 'FLAPS' : '', ac.hookPos > 0.5 ? 'HOOK' : '', ac.speedbrake > 0.3 ? 'SPD BRK' : ''].filter(Boolean);
    x.textAlign = 'center';
    x.fillText(flags.join('   '), cx, H * 0.8);
    x.fillText('FUEL ' + Math.round(ac.fuel / 0.4536 / 10) * 10 + ' LB', cx, H * 0.8 + 18 * d);
    if (extra.message) { x.font = `bold ${18 * d}px "IBM Plex Mono", Menlo, monospace`; x.fillText(extra.message, cx, H * 0.3); }
    x.restore();
  }
}
