# InfiniteFlight Handover — Feb 27, 2026

## Current State
All changes committed, syntax-checked, and pushed to GitHub.

## What Was Done (this session — third pass)
1. **Real USGS Terrain for Yosemite** — Replaced hand-sculpted `sculptYosemite()` with real elevation data from AWS Terrain Tiles:
   - `YosemiteHeightmap` class fetches 6 zoom-12 tiles (686-688 x 1583-1584) from `s3.amazonaws.com/elevation-tiles-prod/terrarium/`
   - Covers 37.649°N to 37.788°N, -119.707°W to -119.443°W (~23km × 15km)
   - Terrarium format decoding: `elevation = (R*256 + G + B/256) - 32768`
   - 768×512 pixel heightmap, ~30m/pixel USGS resolution
   - **IndexedDB caching**: fetches from AWS once, saves decoded Float32Array to IndexedDB. On revisit, loads instantly from cache (no network needed)
   - Bilinear interpolation for smooth terrain lookups between pixels
   - Auto-triggers when Yosemite location selected — clears terrain chunks when data arrives so they regenerate with real heights
   - Base elevation 1200m subtracted so valley floor ≈ 0 in game world
   - Falls back to procedural noise outside heightmap bounds

## Previous Sessions
- **F-117 Nighthawk Rebuild** — BoxGeometry diamond body with angled stealth panels
- **F-14 Tomcat** — Twin-engine swept-wing fighter with twin afterburners
- **Afterburner Effects** — Flaming cones at high throttle on F-117 and F-14
- **Realistic Gravity & Glide Path** — Full 9.81 gravity, terminal velocity, natural glide
- **Taxi Controls HUD** — Green overlay when on ground
- **Spacebar Brakes + Ground Steering** — Arrow keys yaw on ground at low speed

## Build Status
- Syntax check: PASSED
- Commit: `12736e2` on `main`
- Tags: `before-real-yosemite-terrain-feb27`, `before-f117fix-physics-yosemite-feb27`, `before-f117-f14-afterburner-feb27`
- Pushed to GitHub

## Next Steps
- Test on device (iPhone)
- Fly Yosemite — real terrain should show Half Dome, El Capitan, valley walls from USGS data
- Check IndexedDB cache — second visit to Yosemite should load instantly (check console for "loaded from cache")
- Check that areas outside the heightmap bounds transition smoothly to procedural terrain
- Test all 7 aircraft still work correctly
- Test afterburners, brakes, ground steering

## Known Issues
- AWS Terrain Tiles require internet on first visit (cached after that)
- CORS on AWS tiles — should work (anonymous crossOrigin), but untested on device
- Heightmap covers ~23km × 15km — flying far outside this area falls back to procedural
- Base elevation offset (1200m) is approximate — may need adjustment after visual testing
- Terminal velocity formula may need tuning for smaller aircraft
- Glide sink rate (3.0 base) may be too fast or slow

## Git
- Repo: `/Users/michaelashe/Projects/InfiniteFlight`
- Remote: `https://github.com/MyCache63/InfiniteFlight.git`
- Branch: `main`
