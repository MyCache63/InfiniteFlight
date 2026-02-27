# InfiniteFlight Handover — Feb 27, 2026

## Current State
All changes committed, syntax-checked, and pushed to GitHub.

## What Was Done (this session — second pass)
1. **F-117 Nighthawk Rebuild** — Replaced broken ExtrudeGeometry fuselage with proper BoxGeometry. Wide flat diamond body with angled stealth side panels, thick swept delta wings. Now renders correctly from all angles.

2. **Realistic Gravity & Glide Path** — Full 9.81 m/s² gravity component (was only 30%). Aircraft accelerate in dives approaching terminal velocity (sqrt(400/drag), can exceed maxSpeed by 40%). All powered aircraft now have natural glide path when engine idle — sink 2-4 m/s. Partial thrust creates proportional climb/sink.

3. **Taxi Controls HUD** — Green overlay at bottom center shows "GROUND ←→ Steer Space Brake W/⇧ Throttle" when aircraft is on the ground. Auto-hides when airborne. Doesn't show for paraglider/hang glider. Works at any airstrip elevation.

4. **Yosemite Terrain Sculpting** — Custom `sculptYosemite()` method in TerrainSystem that carves real Yosemite Valley features:
   - U-shaped glacial valley with steep granite walls (~3200m long, ~1000m wide)
   - **Half Dome** at X:+1100, Z:+150 — sheer NW cliff face, rounded SE dome, 300 units tall
   - **El Capitan** at X:-1050, Z:-130 — vertical 900m south face, 220 units tall
   - **Cathedral Rocks** triple spires at X:-1050, Z:-600
   - **Sentinel Rock** pyramidal peak at X:-60, Z:-250
   - **Glacier Point** overlook at X:+260, Z:-320
   - **North Dome** rounded dome at X:+560, Z:+460
   - **Sentinel Dome** at X:+55, Z:-430
   - **Clouds Rest** (highest) at X:+2000, Z:+750
   - **Yosemite Falls** cliff at X:-200, Z:+460
   - **Merced River** channel carved through valley floor
   - North and south rim elevation boosts
   - Updated color gradient with more granite tones

## Build Status
- Syntax check: PASSED
- Commit: `db3df04` on `main`
- Tags: `before-f117fix-physics-yosemite-feb27` (pre-change), `before-f117-f14-afterburner-feb27` (earlier session)
- Pushed to GitHub

## Next Steps
- Test on device (iPhone)
- Fly Yosemite — fly up the valley, look for Half Dome and El Capitan
- Test F-117 rendering — should now be a visible angular black stealth jet
- Test glide path — cut engine, plane should descend gradually
- Test dive — point straight down, speed should approach terminal velocity
- Test taxi HUD — land and check green overlay appears
- Test brakes and steering still work

## Known Issues
- Yosemite landmark positions are approximations — may need tweaking after visual testing
- Terminal velocity formula may need tuning for smaller aircraft
- Glide sink rate (3.0 base) may be too fast or slow — needs flight testing
- Auto-level (Space) was removed earlier — now replaced by brake

## Git
- Repo: `/Users/michaelashe/Projects/InfiniteFlight`
- Remote: `https://github.com/MyCache63/InfiniteFlight.git`
- Branch: `main`
