// Synthesized sound with Web Audio: no audio files. Starts on the first key press or click
// (browsers block audio until the user interacts).
export class Audio {
  constructor() {
    this.ctx = null; this.on = false;
    const start = () => { if (!this.ctx) this.init(); };
    addEventListener('keydown', start, { once: false }); addEventListener('mousedown', start, { once: false });
  }
  noiseBuffer(seconds = 2, brown = false) {
    const n = this.ctx.sampleRate * seconds, b = this.ctx.createBuffer(1, n, this.ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  loopNoise(brown) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuffer(3, brown); s.loop = true; s.start(); return s; }
  init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.7; this.master.connect(c.destination);
    // Cockpit filter: the canopy muffles the outside noise.
    this.cockpit = c.createBiquadFilter(); this.cockpit.type = 'lowpass'; this.cockpit.frequency.value = 18000; this.cockpit.connect(this.master);
    const chain = (src, type, f, q, gain) => { const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(this.cockpit); return { fl, g }; };
    // Engine rumble (brown noise, low-passed) and turbine whine (two detuned oscillators, band-passed).
    this.rumble = chain(this.loopNoise(true), 'lowpass', 180, 0.7, 0);
    this.whine = [];
    for (const det of [1, 1.013]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 2000 * det; o.start();
      this.whine.push({ o, det, ...chain(o, 'bandpass', 3200, 6, 0) });
    }
    // Afterburner roar: wide band noise with a slow flutter.
    this.ab = chain(this.loopNoise(false), 'bandpass', 420, 0.6, 0);
    // Wind: high-passed noise rising with dynamic pressure.
    this.wind = chain(this.loopNoise(false), 'highpass', 900, 0.5, 0);
    // Buffet at high AOA: low thumping noise.
    this.buffet = chain(this.loopNoise(true), 'lowpass', 60, 1.2, 0);
    this.on = true;
  }
  burst({ f = 120, dur = 0.4, gain = 0.8, type = 'lowpass', sweep = 0 } = {}) {
    if (!this.on) return;
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noiseBuffer(dur + 0.1, true);
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f;
    if (sweep) fl.frequency.linearRampToValueAtTime(f + sweep, c.currentTime + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(fl); fl.connect(g); g.connect(this.master); s.start(); s.stop(c.currentTime + dur + 0.1);
  }
  update(ac, inCockpit) {
    if (!this.on) return;
    const t = this.ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.08);
    const rpm = (ac.engL.rpmPct + ac.engR.rpmPct) / 200; // 0.62 idle .. 1.0 military
    const thr = Math.max(0, (rpm - 0.6) / 0.4);
    const ab = Math.max(ac.engL.ab, ac.engR.ab);
    const q = ac.qbar / 40000;
    set(this.rumble.g.gain, 0.12 + 0.5 * thr + 0.4 * ab);
    set(this.rumble.fl.frequency, 120 + 180 * thr);
    for (const w of this.whine) { set(w.o.frequency, (1500 + 2600 * rpm) * w.det); set(w.g.gain, 0.02 + 0.05 * rpm * (inCockpit ? 0.6 : 1)); set(w.fl.frequency, 2400 + 1600 * rpm); }
    set(this.ab.g.gain, ab * (0.55 + 0.1 * Math.sin(t * 17)));
    set(this.wind.g.gain, Math.min(0.5, 0.05 * q + 0.02));
    set(this.wind.fl.frequency, 700 + 900 * Math.min(1, q / 4));
    const buf = Math.max(0, Math.min(1, (ac.aoaUnits - 19) / 8)) * Math.min(1, ac.qbar / 5000);
    set(this.buffet.g.gain, buf * 0.9);
    set(this.cockpit.frequency, inCockpit ? 2600 : 16000);
    // One-shot events.
    const gearNow = ac.gear > 0.98 ? 1 : ac.gear < 0.02 ? 0 : -1;
    if (this.lastGear !== undefined && gearNow !== -1 && gearNow !== this.lastGear) this.burst({ f: 90, dur: 0.35, gain: 0.7 });
    if (gearNow !== -1) this.lastGear = gearNow;
    if (ac.onGround && !this.wasGround) this.burst({ f: 70, dur: 0.5, gain: 1.0 });
    this.wasGround = ac.onGround;
  }
}
