# InfiniteFlight Revamp Plan
**v01.0.0 - 2026-07-06 PT**

Goal: turn the current single-file tech demo into a genuinely fun, realistic, and competitive browser flight simulator, with full support for Michael's Microsoft SideWinder Precision 2 joystick.

---

## 1. The Joystick (from IMG_8920.HEIC)

The photo shows the underside label of a **Microsoft SideWinder Precision 2 Joystick**, Part No. X05-92624, made ~2000. Key facts:

- It is a **standard USB HID joystick**: no drivers needed on modern macOS. Plug it in (via a USB-A to USB-C adapter if the Mac has no USB-A port) and the OS sees it as a generic game controller.
- Controls it offers: X axis (roll), Y axis (pitch), **twist grip (rudder/yaw)**, a **throttle slider**, 8 buttons, and an 8-way hat switch (perfect for looking around / camera views).
- Browsers (Chrome, Edge, Safari) expose it through the **Gamepad API** (`navigator.getGamepads()`), which works with any HID joystick, not just Xbox-style pads. No install, works on a plain web page.
- **Risk to verify first:** some forum reports say this 25-year-old stick can be flaky on modern Macs (one user saw it disconnect after ~40 seconds, and the Precision 2 line had a known static-buildup issue). The very first step of this plan is a 10-minute detection test before we build anything on top of it.
  - https://forums.moneysavingexpert.com/discussion/5527849/using-a-microsoft-sidewinder-precision-2-joystick-on-an-apple-mac-computer
  - https://en.wikipedia.org/wiki/Microsoft_SideWinder

## 2. What We Have Today

`index.html` (4,218 lines, one file): Three.js 0.170 from CDN, 7 aircraft (incl. F-117, F-14 with afterburners), 8 locations (incl. real USGS Yosemite terrain from AWS Terrain Tiles with IndexedDB caching), custom arcade-ish physics, autopilot with a Yosemite valley-run mode, canvas HUD and instrument panel, keyboard + touch controls. Also deployed as a free app at aiquorum.org/flight behind AIQuorum auth.

Gaps for the stated goal:
- **No joystick support at all** (no Gamepad API code present).
- Physics is simplified: no real lift/drag curves, no stall behavior, no trim, no wind.
- No sound at all (engine, wind, stall warning, gear).
- Nothing competitive: no scoring, no timers, no leaderboards, no missions.
- No in-app version stamp (violates the Version Stamp Rule; fix in first coding session).
- Everything from Feb 27 onward is still **untested on device**.

## 3. Research Findings (Research-First Rule)

1. **Gamepad API is the right and only sensible way** to read the stick in a browser. Universal, no dependency, ~100 lines for an input manager. Axis order on non-standard sticks varies by browser/OS, so we build a small **calibration screen** ("move the stick left/right", "push the throttle") that saves a mapping profile to localStorage.
2. **kristoffer-dyrkorn/flightsimulator**: browser F-16 sim implementing NASA's real F-16 aerodynamic data (NASA-TN-D-8176), 60 fps on a laptop. Best single source to study/borrow flight-model patterns from (check license before copying).
   - https://github.com/kristoffer-dyrkorn/flightsimulator
3. **JSBSim** (the professional open-source flight dynamics engine used by FlightGear) exists as a JS/WASM port (csbrandt/JSBSim.js). It is the "maximum realism" option but heavyweight, an old port, and overkill for a fun-first sim.
   - https://github.com/JSBSim-Team/jsbsim
   - https://github.com/csbrandt/JSBSim.js
4. Other useful reference repos for structure/ideas:
   - https://github.com/dimartarmizi/web-flight-simulator (arcade F-15 over CesiumJS real-world terrain)
   - https://www.jakobmaier.at/posts/flight-simulator-in-javascript/ (good writeup of a three.js flight model)

**Recommendation: upgrade our own physics in place**, borrowing the lift/drag/stall approach from the dyrkorn F-16 repo, rather than adopting JSBSim. Zero new dependencies (Gamepad API and Web Audio are built into the browser), keeps the sim a self-contained HTML file that still deploys to aiquorum.org unchanged.

## 4. Roadmap

### Phase 0 - Verify the foundation (1 short session)
1. Plug in the SideWinder, open a tiny `joystick_test_v01.0.0_JulXX.html` page that dumps axes/buttons live. Confirms the stick works on this Mac and captures its exact axis layout. If the stick is dead or drops out, we know before investing anything (a modern replacement like a Logitech Extreme 3D Pro is ~$30 if needed).
2. Add version stamp to the sim UI (Version Stamp Rule) and test the existing build on iPhone + desktop (the long-standing untested list in handover.md).

### Phase 1 - Joystick support (1-2 sessions)
- `JoystickInput` class polling the Gamepad API each frame, merged with existing keyboard/touch input (auto-detects: stick plugged in = stick wins).
- Default SideWinder mapping: X=roll, Y=pitch, twist=rudder (new! the sim currently has no independent rudder), slider=throttle, trigger=brakes/fire, hat=camera look, buttons for gear/flaps/afterburner/view.
- Calibration screen with deadzone + sensitivity curves (expo), profile saved to localStorage.
- Keyboard stays as fallback so iPhone/touch play is unchanged.

### Phase 2 - Realistic flight model (2-3 sessions)
- Proper lift/drag model: angle-of-attack, lift curve with **stall** (buffet + nose drop), induced drag, ground effect.
- Rudder as a real control surface (needed for the twist grip), adverse yaw, slip.
- Trim, flaps with real lift/drag effect, landing gear drag, per-aircraft envelopes (the Cessna should fly nothing like the F-14).
- Wind + gusts + turbulence option.
- Study/borrow from the dyrkorn F-16 repo with license check and source citation in comments.

### Phase 3 - Feel: sound, camera, polish (1-2 sessions)
- Web Audio: engine pitch tied to throttle/RPM, wind rush tied to airspeed, stall horn, gear thunk, afterburner rumble, crash. Sound is the single biggest "fun" multiplier and we have none.
- Camera work: hat-switch look-around, smooth chase cam, flyby cam, cockpit shake at high AoA/turbulence.
- Replay of the last 30 seconds after a crash or landing.

### Phase 4 - Competitive layer (2-3 sessions)
This is what makes it a game rather than a screensaver:
- **Landing challenge**: scored on touchdown vertical speed, centerline, distance from threshold. Instant grade (Butter / Firm / Crash).
- **Canyon time trials**: checkpoint gates through Yosemite valley, timed runs.
- **Leaderboards**: AIQuorum already has Flask + auth + user identities. Small `/api/flight/scores` endpoint + JSON store, per-challenge top-10 boards shown in the sim. This is the "competitive" hook: every AIQuorum user competes on the same boards.
- **Ghost replays**: race against the leaderboard holder's recorded flight path (positions are tiny, easy to store).

### Phase 5 - Multiplayer (optional, later)
Live shared skies via WebSockets on the AIQuorum Lightsail server. Real work (interpolation, server tick), so only after Phases 1-4 prove out. Ghost racing in Phase 4 delivers 80% of the competitive feel for 10% of the effort.

## 5. Architecture Decisions

| Question | Recommendation |
|---|---|
| Keep single-file index.html? | Yes through Phase 2 (simple deploys to AIQuorum). Revisit splitting into modules if it passes ~8k lines. |
| New dependencies? | None. Gamepad API + Web Audio are built-in. Three.js CDN stays as-is. |
| Physics engine? | Upgrade our own, borrowing from dyrkorn F-16 (NASA data). JSBSim/WASM rejected as overkill. |
| Where do leaderboards live? | AIQuorumPlatform (existing auth + Flask), new small API. |
| Joystick on iPhone? | Not applicable; stick is desktop. Touch controls remain for phone. |

## 6. Risks / Open Questions

- The 2000-era stick may be electrically flaky on modern macOS (Phase 0 test settles it; $30 modern stick is the fallback).
- Safari's Gamepad support only exposes the stick after a button press (by design); the calibration screen handles this ("press the trigger to begin").
- CSP on aiquorum.org nginx may block CDN/terrain requests (already an open issue in handover.md).
- iPhone performance once physics gets richer; keep a quality toggle.

## 7. Suggested Order of Work

Phase 0 next session (30 min, answers the only real unknown), then 1 -> 2 -> 3 -> 4. Roughly 7-10 working sessions to a joystick-flown, realistic, leaderboard-competitive sim.
