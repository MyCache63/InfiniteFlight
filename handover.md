# InfiniteFlight Handover - September 30, 2026

## Update 2026-09-30 afternoon: combat mode built (combat/ folder)
- **Run it:** `./start_infiniteflight.sh`, then open http://localhost:8471/combat/ (menu: 1 groove, 2 catapult, 3 Case I break, 0 free flight).
- **Flight model:** `combat/src/fdm/` holds the AFWAL-TR-80-3141 F-14A tables (hand-transcribed, symmetry-checked, 3 faint cells filled and marked), estimated sweep/Mach/flap terms, TF30 engines, a 6-DOF RK4 core, and a trim solver. `node combat/tests/validate_f14.mjs` gives 9/9 checks against published numbers (approach speed, stall, Mach 1.28 at sea level, Mach 2.27 at 40,000 ft, 186 deg/s roll, 7.6 g).
- **Carrier:** `combat/src/world/carrier.js` has the moving deck, 4 wires, Mk 7 constant-runout arrestment, catapult, IFLOLS lens, LSO calls and grades. An automated test pilot traps on 12 of 12 passes at 575-740 fpm sink, and grades range from _OK_ to Cut.
- **World:** streaming real terrain (AWS Terrarium elevation + USGS imagery), FFT-spectrum ocean, sky, sound.
- **Tools:** `combat/tools/shoot.py <shots.json> <outdir>` takes GPU screenshots; review rounds go in `combat/review/` (gitignored).
- **In progress:** a separate agent is rebuilding the F-14 3D model in a worktree; an outside-reviewer agent is critiquing screenshots.
- **Open:** the joystick flight test is still owed; the joystick calibration from the old sim is read automatically (same origin).

## Update 2026-09-30: combat direction chosen
- Michael asked about Unreal Engine.  We're staying on Three.js because the sim must run in browsers on AIQuorum (review: `InfiniteFlight_UnrealEngineReview_v01_2026-09-30.html`).
- The project is now a modern JetFighter-style combat sim.  Design: `InfiniteFlight_CombatDesign_v02_2026-09-30.html` (https://claude.ai/artifact/LuJ2BDxwFC3CqfDH5A2Qfp).  Plan and Michael's answers: `InfiniteFlightCombatPlan_v01.0.0_Sep30.md`.
- Key answers: carrier traps first, full-sim realism with no assists, F-14 as the hero jet, SF Bay and Sierra theater, fictional enemy coalition.
- **The next step is still the joystick flight test below.  After that comes the F-14 flight model, with research first into public F-14 aero data.**

---
(August 8 state follows.)

## Current State
Revamp Phase 0 + Phase 1 (joystick support) are BUILT and COMMITTED. The sim (`index.html`, **v01.2.0**) reads Michael's Microsoft SideWinder Precision 2 through the browser Gamepad API: no drivers, no dependencies. It loads clean in a real browser with zero JS errors.

Michael ran the calibration wizard and reported it saved. He was told to reload the sim and fly, but **has not yet reported flight results**. That report is the thing this project is waiting on.

Working tree is clean except two deliberately untracked files (see Git section). Branch `main`, no worktrees, everything pushed to GitHub.

Master plan for the whole revamp: `InfiniteFlightRevampPlan_v01.0.0_July6.md` (5 phases: joystick, realistic physics, sound/feel, competitive layer with AIQuorum leaderboards, optional multiplayer).

## Build Status
- `node --check` on extracted JS: **PASS** (sim + test page)
- Browser load test on http://localhost:8471/index.html: **renders clean**, version stamp reads `v01.2.0 - 2026-07-30 08:42 PT`
- **Device/joystick flight testing: NOT DONE.** No commit is yet marked `[tested on device]`.
- Safety tag: `before-revamp-joystick-jul6`

## Exact Next Step
**Michael flies the sim with the stick plugged in and reports back.**

1. Run `./start_infiniteflight.sh` in the project root. It starts the local server on port 8471 and opens the sim in Chrome. (The sim must be served over http://, not opened as a file://.)
2. Press any button on the stick so Chrome reveals the gamepad.
3. Read the badge in the version stamp, bottom-right corner:
   - green **`CAL`** = the saved calibration profile loaded correctly
   - amber **`DEFAULT MAP`** = it fell back to the built-in guess, meaning the save did not persist and that needs debugging first
4. Fly, then report: pitch direction, roll direction, twist-rudder direction (on ground AND in air), throttle slider direction, hat look direction, trigger brake. Each of these is a one-line sign flip if wrong.
5. Also watch for the known SideWinder hardware issue: the stick dropping out after ~40 seconds. If that repeats, the plan's fallback is a ~$30 modern stick.

After that report: commit the working state marked `[tested on device]`, tag `good-joystick-<date>`, then start **Phase 2** (realistic flight model: angle of attack, lift curve with stall, induced drag, ground effect, trim, flaps, per-aircraft envelopes) per the plan doc.

## Open Issues
1. **Calibration persistence is UNCONFIRMED.** Reading `localStorage['if_joy_map_v1']` at origin `http://localhost:8471` from a Claude-controlled Chrome tab returned `NOT SAVED`, even though Michael saw the wizard's success message. Most likely explanation: the automated tab was a different Chrome profile than the one Michael used, and localStorage is per-profile. Not proven either way. The save code itself (`joystick_test_v01.0.0_July6.html:127`) was read and is correct. **Resolution path:** the new CAL / DEFAULT MAP badge makes this visible at a glance, so Michael's next look at the sim settles it.
2. Joystick axis mapping is unverified against the physical stick.
3. Ground steering sign fix is math-derived, not device-verified. If taxiing steers backwards, look at `FlightPhysics.update`, the `steerQ` block.
4. Safari (and Chrome) only expose gamepads after a button press. Handled in code, but the user must press something first.
5. All pre-existing issues from the March 23 handover still stand: aiquorum.org/flight deploy, nginx CSP check, iPhone testing, device-test Yosemite terrain / F-117 / F-14 / afterburners.

## Decisions Made (and Rejected)
| Decision | Choice | Why / why the alternative was rejected |
|---|---|---|
| Joystick tech | Browser Gamepad API | Built into the browser, zero dependencies, no drivers. The SideWinder is standard USB HID so nothing else is needed. |
| Physics engine | Upgrade our own physics | **JSBSim rejected** as massive overkill: a full flight-dynamics engine with XML aircraft definitions, would swamp a single-file browser sim. Plan is to borrow the aero approach from the kristoffer-dyrkorn F-16 repo (NASA TN-D-8176 data) in Phase 2, with a license check and source citation first. |
| New dependencies | None so far | Michael's rule requires his OK before adding any third-party dependency. Nothing has needed one yet. |
| File architecture | Keep `index.html` as one file through Phase 2 | Splitting it adds build tooling for no current benefit. Revisit if Phase 2 physics makes it unwieldy. |
| Calibration | Standalone wizard page saving to localStorage `if_joy_map_v1` | Keeps guesswork out of the sim itself and survives reloads. |
| Throttle | Slider is absolute; keyboard W/S takes over while held | Matches how a real throttle quadrant behaves, but does not strand a keyboard-only user. |
| Competitive layer | Ghost-replay time trials + AIQuorum leaderboards FIRST | **Live multiplayer deferred to Phase 5** because it needs a WebSocket server and constant uptime; ghost replays give the competitive feel with zero server cost. |
| Serving the sim | Local HTTP server via `start_infiniteflight.sh` | `file://` blocks ES module imports and misbehaves with the Gamepad API. |
| Version numbering | Feb 27 build retroactively = v01.0.0 | index.html is now v01.2.0. |

## Active Branch / Worktree
- Branch: `main`. No worktrees, no other branches. All work is on main.

## Git
- Repo: `/Users/michaelashe/Projects/InfiniteFlight`, remote https://github.com/MyCache63/InfiniteFlight.git
- All commits pushed. Recent, newest first:
  - `c5e514a` CAL / DEFAULT MAP badge in version stamp, bump v01.2.0 `[builds, not device-tested]`
  - `de96fc4` Add `start_infiniteflight.sh` launcher and `.gitignore` `[builds, not device-tested]`
  - `0953591` Revamp plan doc, handover update, track March planning docs
  - `0796043` Add joystick test + calibration wizard page `[builds, not device-tested]`
  - `09044cb` Add SideWinder joystick support, version stamp, ground steering sign fix `[builds, not device-tested]`
- Safety tag: `before-revamp-joystick-jul6`
- `IMG_8920.HEIC` (joystick photo, 1.5MB) left untracked on purpose. Not deleted; Michael's call whether to keep it.
- `logs/` is gitignored.

## Key Files
| File | What it is |
|---|---|
| `index.html` | The sim. Single file, v01.2.0. Version constants at line ~183. |
| `joystick_test_v01.0.0_July6.html` | Live axis/button test + 10-step calibration wizard. Open this first when the stick misbehaves. |
| `start_infiniteflight.sh` | Launcher. `--joystick` opens the test page, `--restart`, `--stop`, `--no-open`. |
| `InfiniteFlightRevampPlan_v01.0.0_July6.md` | The 5-phase master plan. |
| `handover.md` | This file. |
