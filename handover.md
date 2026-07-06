# InfiniteFlight Handover - July 6, 2026

## Current State
Revamp Phase 0 + Phase 1 (joystick support) built this session. The sim (`index.html`) now reads Michael's Microsoft SideWinder Precision 2 joystick through the browser Gamepad API: no drivers, no dependencies. Loads clean in a real browser (verified via localhost, zero JS errors). NOT yet tested with the physical stick plugged in.

Master plan for the whole revamp: `InfiniteFlightRevampPlan_v01.0.0_July6.md` (5 phases: joystick, realistic physics, sound/feel, competitive layer with AIQuorum leaderboards, optional multiplayer).

## What Was Done This Session
1. **Revamp plan written** - `InfiniteFlightRevampPlan_v01.0.0_July6.md`. Identified the stick from photo (IMG_8920.HEIC): SideWinder Precision 2, Part X05-92624, standard USB HID.
2. **Version stamp added (Version Stamp Rule)** - `VERSION = 'v01.1.0'`, `BUILD = '2026-07-06 13:00 PT'` constants at top of the module script in index.html; visible bottom-right in the UI. Shows 🕹 + stick name when a joystick connects.
3. **Joystick support in index.html (v01.1.0)**:
   - `InputController` polls Gamepad API each frame; auto-discovers already-plugged sticks; connect/disconnect events update the UI stamp.
   - Default SideWinder mapping: axis0=roll, axis1=pitch, axis2=twist rudder, axis3=throttle slider (inverted), hat on axis9, buttons: 0(trigger)=brake, 1=autopilot, 2=view, 3=reset.
   - Deadzone (0.08) + expo (0.3) shaping. Stick overrides keyboard when deflected; keyboard remains fallback.
   - Throttle slider is ABSOLUTE (`input.throttleAbs` sets `physics.throttle` directly); W/S keys temporarily take back control while held.
   - Twist rudder: in-air body-axis yaw (0.6 x aircraft yawRate); on ground, twist adds to steering.
   - Hat switch = look around (feeds existing decaying mouse-look).
   - Saved mapping in localStorage key `if_joy_map_v1` overrides defaults.
4. **Joystick test + calibration page** - `joystick_test_v01.0.0_July6.html`. Live axis bars + button lights, plus a 10-step calibration wizard (push right, pull back, twist, throttle, hat, 4 buttons) that saves the mapping profile to localStorage for the sim. THIS IS THE FIRST THING TO OPEN when testing the stick.
5. **Ground steering sign fix** - quaternion math showed right arrow steered LEFT on the ground (world +Y rotation = left turn, matching the turn-coordination code which already used the negative sign). Flipped sign so right steers right. If steering feels backwards on device, this is where to look (FlightPhysics.update, steerQ).

## Build Status
- `node --check` on extracted JS: PASS (sim + test page)
- Browser load test via Playwright on localhost: renders, only a harmless favicon 404
- **Device/joystick testing: NOT DONE** - stick was not plugged in this session
- Safety tag: `before-revamp-joystick-jul6`

## Next Steps
1. **Michael: plug in the SideWinder** (USB-A to USB-C adapter if needed), open `joystick_test_v01.0.0_July6.html` in Chrome, press a button, confirm axes move. Run the calibration wizard.
   - Quick local serve: `python3 -m http.server 8000` in the project folder, then http://localhost:8000/joystick_test_v01.0.0_July6.html and http://localhost:8000/index.html (same origin so the saved calibration carries over; file:// also works in Chrome for both).
   - Watch for the known SideWinder issue: stick disconnecting after ~40s (old hardware). If it happens repeatedly, plan says fall back to a ~$30 modern stick.
2. Fly with the stick: check pitch/roll direction, twist rudder direction (ground + air), throttle slider, hat look, trigger brake.
3. Report back: axis indices from the test page if the defaults were wrong, and whether ground steering direction feels right (see item 5 above).
4. Then Phase 2 (realistic flight model: AoA, stall, per-aircraft envelopes) per the plan doc.
5. Still outstanding from Feb/Mar: device-test Yosemite terrain, F-117/F-14, afterburners, aiquorum.org/flight deploy + CSP check.

## Open Issues
- Joystick axis mapping is a guess until the stick is tested; calibration wizard is the fix path.
- Ground steering sign fix is math-derived, not device-verified.
- Safari only exposes gamepads after a button press (handled, but user must press something first).
- All pre-existing open issues from the March 23 handover still stand (deploy, CSP, iPhone testing).

## Key Decisions Made
| Decision | Choice |
|---|---|
| Joystick tech | Browser Gamepad API, zero dependencies |
| Calibration | Standalone test page wizard, saves to localStorage `if_joy_map_v1` |
| Throttle | Slider is absolute; keyboard W/S overrides while held |
| Physics upgrade path | Own physics, borrow from dyrkorn F-16 repo (Phase 2), JSBSim rejected |
| Competitive | Ghost-replay time trials + AIQuorum leaderboards before any live multiplayer |
| Sim version | index.html now stamped v01.1.0 (Feb 27 build retroactively = v01.0.0) |

## Git
- Repo: `/Users/michaelashe/Projects/InfiniteFlight`, branch `main`, remote https://github.com/MyCache63/InfiniteFlight.git
- Safety tag this session: `before-revamp-joystick-jul6`
- IMG_8920.HEIC (joystick photo, 1.5MB) left untracked on purpose; delete or keep as Michael prefers.
