// Keyboard and joystick input. Joystick uses the calibration saved by joystick_test_v01.0.0_July6.html
// (localStorage 'if_joy_map_v1', same origin), with the SideWinder Precision 2 defaults otherwise.
export class Input {
  constructor() {
    this.keys = {}; this.edges = [];
    this.pitch = 0; this.roll = 0; this.yaw = 0; this.throttle = 0.72; this.brake = 0;
    this.look = { x: 0, y: 0 };
    this.joy = null; this.joyName = ''; this.customMap = false; this.prevButtons = [];
    this.map = { axes: { roll: { i: 0, s: 1 }, pitch: { i: 1, s: 1 }, yaw: { i: 2, s: 1 }, throttle: { i: 3, s: -1 } },
      hat: { i: 9 }, buttons: { brake: 0, autopilot: 1, view: 2, reset: 3 }, deadzone: 0.08, expo: 0.3 };
    try { const s = localStorage.getItem('if_joy_map_v1'); if (s) { Object.assign(this.map, JSON.parse(s)); this.customMap = true; } } catch (e) { /* defaults */ }
    addEventListener('keydown', (e) => { if (!this.keys[e.code]) this.edges.push(e.code); this.keys[e.code] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); });
    addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    addEventListener('gamepadconnected', (e) => { this.joy = e.gamepad.index; this.joyName = e.gamepad.id; });
    addEventListener('gamepaddisconnected', (e) => { if (e.gamepad.index === this.joy) this.joy = null; });
    this.throttleAbs = null;
  }
  shape(v) {
    const dz = this.map.deadzone; if (Math.abs(v) < dz) return 0;
    const n = (Math.abs(v) - dz) / (1 - dz), ex = this.map.expo;
    return Math.sign(v) * Math.min(1, (1 - ex) * n + ex * n * n * n);
  }
  takeEdges() { const e = this.edges; this.edges = []; return e; }
  update(dt) {
    const k = this.keys;
    // Keyboard: smooth toward full deflection so taps are small inputs.
    const toward = (cur, tgt, rate) => cur + Math.max(-rate * dt, Math.min(rate * dt, tgt - cur));
    const kp = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0);
    const kr = (k.ArrowRight ? 1 : 0) - (k.ArrowLeft ? 1 : 0);
    const ky = (k.KeyE || k.Period ? 1 : 0) - (k.KeyQ || k.Comma ? 1 : 0);
    this.pitch = toward(this.pitch, kp * 0.85, kp ? 1.6 : 4);
    this.roll = toward(this.roll, kr, kr ? 3 : 6);
    this.yaw = toward(this.yaw, ky, ky ? 3 : 6);
    if (k.KeyW || k.ShiftLeft) { this.throttle = Math.min(1, this.throttle + 0.35 * dt); this.throttleAbs = null; }
    if (k.KeyS || k.ControlLeft) { this.throttle = Math.max(0, this.throttle - 0.35 * dt); this.throttleAbs = null; }
    this.brake = k.Space ? 1 : 0;
    this.pollJoystick(dt);
    if (this.throttleAbs !== null) this.throttle = this.throttleAbs;
  }
  pollJoystick() {
    if (!navigator.getGamepads) return;
    if (this.joy === null) for (const p of navigator.getGamepads()) if (p) { this.joy = p.index; this.joyName = p.id; break; }
    if (this.joy === null) return;
    const gp = navigator.getGamepads()[this.joy]; if (!gp) return;
    const m = this.map, ax = (s) => (gp.axes[s.i] ?? 0) * s.s;
    const r = this.shape(ax(m.axes.roll)), p = this.shape(ax(m.axes.pitch)), y = this.shape(ax(m.axes.yaw));
    if (r) this.roll = r;
    if (p) this.pitch = -p; // stick forward reads negative; our +1 is aft stick (nose up)
    if (y) this.yaw = y;
    if (m.axes.throttle && gp.axes[m.axes.throttle.i] !== undefined) this.throttleAbs = Math.max(0, Math.min(1, (ax(m.axes.throttle) + 1) / 2));
    if (m.hat && gp.axes[m.hat.i] !== undefined) {
      const hv = gp.axes[m.hat.i];
      if (hv >= -1.01 && hv <= 1.01) {
        const d = Math.round((hv + 1) / (2 / 7));
        this.look.x += ([0, 1, 1, 1, 0, -1, -1, -1][d] || 0) * 0.04; this.look.y += ([-1, -1, 0, 1, 1, 1, 0, -1][d] || 0) * 0.03;
      }
    }
    const pressed = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (pressed(m.buttons.brake)) this.brake = 1;
    for (const [name, code] of [['view', 'KeyV'], ['reset', 'KeyR'], ['autopilot', 'KeyH']]) {
      const i = m.buttons[name];
      if (i !== undefined && pressed(i) && !this.prevButtons[i]) this.edges.push(code);
    }
    this.prevButtons = gp.buttons.map((b) => b.pressed);
  }
}
