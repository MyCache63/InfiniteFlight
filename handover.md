# InfiniteFlight Handover — Feb 27, 2026

## Current State
All changes committed, syntax-checked, and pushed to GitHub.

## What Was Done (this session)
1. **F-117 Nighthawk** (aircraft index 5) — Angular stealth geometry, matte black 0x1a1a1a, V-tail, gold-tinted canopy, flat exhaust slot, afterburner cone
2. **F-14 Tomcat** (aircraft index 6) — Swept-wing twin-engine fighter, twin vertical tails, box intakes, Navy-style orange tail stripes, twin afterburner cones
3. **Afterburner Effects** — `updateAfterburner()` method on AircraftModels. Below 10% throttle: hidden. 10-85%: small dim glow. Above 85%: big pulsing flames with flickering
4. **F-117 Cockpit** — Dark angular panels, HUD frame (green wireframe), side stick, gold-tint canopy glass, ejection seat, SPD/ALT/HDG gauges with green ticks
5. **F-14 Cockpit** — Full six-pack instruments, HUD frame, center stick with trigger, twin throttle levers, radar scope, Mach display, canopy bow frame, ejection seat
6. **Spacebar Brakes** — Space key applies brakes on ground (speed *= 0.92 per frame). Works on all wheeled aircraft (Biplane, Cessna, Glider, F-117, F-14). Excluded: Paraglider and Hang Glider
7. **Ground Steering** — Left/right arrows apply yaw (nose-wheel steering) when on ground at speed < 30. Steering sensitivity decreases with speed. Above 30 or in air: normal roll
8. **Safe Landing Speeds** — Now scale with aircraft maxSpeed so jets can land at higher speeds without crashing (15% of maxSpeed for gentle, 25% for runway landing)
9. **Controls Updated** — All UI text updated: Space = Brake, 1-7 = Aircraft

## Build Status
- Syntax check: PASSED
- Commit: `13a2e4f` on `main`
- Tag: `before-f117-f14-afterburner-feb27` marks pre-change state
- Pushed to GitHub

## Next Steps
- Test on device (iPhone)
- Verify F-117 visible as angular black stealth jet in chase view
- Verify F-14 visible as gray twin-engine swept-wing fighter
- Full throttle on either jet — check for flaming afterburners from chase view
- Land on runway, press Space — aircraft should stop
- On ground at low speed, left/right arrows should steer (yaw turn, not roll)
- All 7 aircraft selectable via dropdown and keys 1-7
- Existing aircraft (Biplane, Cessna, Glider, Paraglider, Hang Glider) still work

## Known Issues
- Auto-level (Space) removed — replaced by brake. If auto-level is missed, could re-add on a different key
- F-117/F-14 landing speeds are high compared to prop planes — may need tuning after device testing

## Git
- Repo: `/Users/michaelashe/Projects/InfiniteFlight`
- Remote: `https://github.com/MyCache63/InfiniteFlight.git`
- Branch: `main`
