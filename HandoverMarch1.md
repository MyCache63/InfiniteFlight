# InfiniteFlight Handover — March 1, 2026

## Project Overview
A browser-based 3D flight simulator built as a **single HTML file** (~4,200 lines) using Three.js. Fly 7 aircraft across 8 real-world-inspired locations with procedural terrain, realistic physics, cockpit views, and an autopilot system. Runs on desktop (keyboard + mouse) and iPhone (touch/tilt).

- **Repo:** `/Users/michaelashe/Projects/InfiniteFlight`
- **Remote:** `https://github.com/MyCache63/InfiniteFlight.git`
- **Branch:** `main`
- **Latest commit:** `5f57ecc` — all changes pushed

---

## Current Build Status
- **Syntax check:** PASSED (`node --check` on extracted JS)
- **Device testing:** NOT YET DONE — all recent commits marked `[builds, not device-tested]`
- **No known build errors**

---

## What Exists Today

### Aircraft (7 total)
| # | Key | Aircraft | Max Speed | Engine | Afterburner | Notes |
|---|-----|----------|-----------|--------|-------------|-------|
| 0 | 1 | Biplane | 55 m/s | Yes | No | Red vintage biplane |
| 1 | 2 | Cessna | 75 m/s | Yes | No | Default starter aircraft |
| 2 | 3 | Glider | 60 m/s | No | No | Unpowered soaring |
| 3 | 4 | Paraglider | 18 m/s | No | No | Slow, high lift |
| 4 | 5 | Hang Glider | 28 m/s | No | No | Unpowered, moderate speed |
| 5 | 6 | F-117 Nighthawk | 280 m/s | Yes | Yes | Stealth fighter, angular black body |
| 6 | 7 | F-14 Tomcat | 350 m/s | Yes | Yes | Twin-engine swept-wing, fastest aircraft |

Each aircraft has: 3D model (chase view), cockpit interior (first-person), unique flight characteristics (drag, lift, pitch/roll/yaw rates).

### Locations (8 total)
| # | Location | Terrain Style | Highlights |
|---|----------|--------------|------------|
| 0 | Tropical Islands | Low islands, ocean | Palm trees, water, sandy beaches |
| 1 | Rain Forest | Rolling hills | Dense vegetation, rivers |
| 2 | Desert | Plateaus, canyons | Sparse shrubs, dry terrain |
| 3 | Redwood Forest | Gentle hills | Tall redwoods, conifers |
| 4 | Yosemite | **Real USGS elevation data** | Half Dome, El Capitan, granite walls |
| 5 | SF Bay | Coastal hills | Golden Gate Bridge landmark |
| 6 | Chicago | Flat terrain | City skyline landmark |
| 7 | Bellagio / Lake Como | Mountain lake | Alpine villas landmark |

### Controls
| Key | Action |
|-----|--------|
| Arrow Up/Down | Pitch (nose up/down) |
| Arrow Left/Right | Roll (or ground steering at low speed) |
| W / Shift | Throttle up |
| S / Ctrl | Throttle down |
| Space | Brake (ground only) |
| 1-7 | Select aircraft |
| V | Toggle chase/cockpit view |
| A | Toggle autopilot |
| G | Toggle god mode |
| R | Reset aircraft |
| Mouse | Free-look (click to lock pointer) |

### Major Systems (17 classes)
| Class | Purpose | Lines |
|-------|---------|-------|
| `NoiseGenerator` | Perlin/Simplex noise for procedural terrain | ~180-262 |
| `YosemiteHeightmap` | Real USGS elevation data + IndexedDB cache | ~266-414 |
| `TerrainSystem` | Terrain chunk generation, LOD, height queries | ~593-711 |
| `WaterSystem` | Reflective water with distortion | ~714-765 |
| `SkyAtmosphere` | Dynamic sky dome and sun | ~768-798 |
| `VegetationSystem` | Instanced tree rendering | ~801-1052 |
| `LandmarkSystem` | Special structures (bridges, waterfalls, skylines) | ~1055-1151 |
| `CockpitRenderer` | 7 unique cockpit interiors, gauges, HUD | ~1154-2211 |
| `AircraftModels` | 7 aircraft 3D models + afterburner effects | ~2214-2937 |
| `AirstripSystem` | Runway generation at each location | ~2940-3164 |
| `FlightPhysics` | Gravity, lift, drag, terminal velocity, ground detection | ~3167-3414 |
| `InputController` | Keyboard, mouse, touch input | ~3417-3482 |
| `HUDManager` | Speed, altitude, throttle, compass, taxi overlay | ~3485-3757 |
| `PostProcessing` | Bloom, tone mapping | ~3760-3779 |
| `LocationManager` | Location switching orchestration | ~3782-3805 |
| `SmartAutoPilot` | AI flight phases (cruise, swoop, valley run, etc.) | ~3808-4002 |
| `App` | Main app init, animate loop, event wiring | ~4005-4213 |

---

## Recent Work (Feb 26-27 Sessions)

### Session 1 — Feb 26
- Red biplane with colorful aircraft models
- Airstrip beacons at each location
- Enhanced attitude indicator
- Cockpit detail improvements

### Session 2 — Feb 27 (first pass)
- **F-117 Nighthawk** and **F-14 Tomcat** added (models, cockpits, physics)
- **Afterburner effects** — flaming cones at high throttle on F-117 and F-14
- **Spacebar brakes** — replaces auto-level, strong decel on ground
- **Ground steering** — left/right arrows apply yaw when on ground at low speed
- Commit: `13a2e4f`

### Session 3 — Feb 27 (second pass)
- **F-117 model rebuilt** — replaced broken ExtrudeGeometry with proper BoxGeometry diamond body
- **Realistic gravity** — full 9.81 m/s² gravity (was only 30%)
- **Terminal velocity** — aircraft accelerate in dives up to `min(maxSpeed*1.4, sqrt(400/drag))`
- **Natural glide path** — all powered aircraft sink 2-4 m/s with engine idle
- **Taxi controls HUD** — green overlay when on ground showing steering/brake/throttle keys
- **Yosemite terrain sculpting** — hand-placed landmarks (Half Dome, El Capitan, etc.)
- Commit: `db3df04`

### Session 4 — Feb 27 (third pass, continued March 1)
- **Real USGS terrain for Yosemite** — replaced hand-sculpted `sculptYosemite()` with real elevation data
- `YosemiteHeightmap` class fetches 6 zoom-12 tiles from AWS Terrain Tiles
- Terrarium format decoding at 30m/pixel resolution
- **IndexedDB caching** — fetch once from AWS, load instantly from cache thereafter
- Bilinear interpolation for smooth height lookups
- Auto-triggers on Yosemite selection, regenerates terrain when data arrives
- Commit: `12736e2`

---

## Git Safety Tags (rollback points)
| Tag | Description |
|-----|-------------|
| `before-color-airstrip-attitude-feb26` | Before Feb 26 visual improvements |
| `before-f117-f14-afterburner-feb27` | Before jets, afterburners, brakes, steering |
| `before-f117fix-physics-yosemite-feb27` | Before F-117 rebuild, physics, Yosemite sculpting |
| `before-real-yosemite-terrain-feb27` | Before real USGS terrain data |

---

## Known Issues & Untested Items

### Must Test on Device (iPhone)
1. **Yosemite real terrain** — Does it load? Do AWS tile fetches succeed (CORS)? Does IndexedDB cache work? Does terrain look like real Yosemite?
2. **F-117 rendering** — Should now be visible angular black stealth jet (was broken, rebuilt)
3. **F-14 rendering** — Gray twin-engine swept-wing fighter
4. **Afterburners** — Flaming cones visible from chase view at high throttle?
5. **Brakes** — Space key stops aircraft on ground?
6. **Ground steering** — Left/right arrows turn the nose wheel on ground at low speed?
7. **Taxi HUD** — Green overlay appears when on ground, hides when airborne?
8. **Glide path** — Cut engine, aircraft descends gradually instead of stalling?
9. **Terminal velocity** — Dive straight down, speed exceeds normal max?
10. **All 7 aircraft selectable** — Keys 1-7 and dropdown both work?

### Known Potential Issues
- **AWS Terrain Tiles CORS** — Uses `crossOrigin: 'anonymous'`, should work but untested on iOS Safari
- **Heightmap boundary transition** — Flying outside Yosemite's ~23km × 15km heightmap area falls back to procedural noise; the transition might be jarring
- **Base elevation offset (1200m)** — Approximate; valley floor might not be at exactly game-world 0
- **Terminal velocity tuning** — Formula `sqrt(400/drag)` may be too fast for small aircraft
- **Glide sink rate** — Base 3.0 m/s may feel too fast or too slow
- **Touch controls on iPhone** — Not explicitly tested with new jets/brakes

---

## Detailed Next Steps

### Priority 1 — Device Testing
Open on iPhone, test everything listed above. Report what works and what doesn't. The phone is the source of truth.

### Priority 2 — Yosemite Polish
After confirming real terrain loads:
- Adjust `baseElevation` (currently 1200m) if valley floor isn't at the right height
- Check if Half Dome, El Capitan, and valley walls are recognizable at 30m resolution
- Consider adding landmark labels or waypoint markers for iconic features
- Tune terrain colors — current gradient may not match granite tones well enough
- Test boundary transition: fly from real heightmap area into procedural area

### Priority 3 — Real Terrain for Other Locations
The `YosemiteHeightmap` pattern could be generalized to load real terrain for any location:
- **SF Bay** — Would show real hills, bay shape, Marin Headlands
- **Lake Como** — Real Alpine terrain around the lake
- **Chicago** — Mostly flat, but real coastline along Lake Michigan
- Could create a generic `RealTerrainLoader` class that takes lat/lon bounds and tile coordinates

### Priority 4 — Physics Tuning
Based on device testing feedback:
- Adjust gravity effect if climbs/dives feel wrong
- Tune glide sink rate per aircraft type (currently uniform 3.0 base)
- Adjust terminal velocity limits if diving feels too fast or slow
- Consider stall behavior — currently no stall mechanics (low speed just means low lift)

### Priority 5 — Visual & Gameplay Enhancements (Ideas)
- **Sound effects** — Engine hum, wind, afterburner roar (Web Audio API)
- **Particle trails** — Smoke, contrails, exhaust behind aircraft
- **More landmarks** — Real buildings, bridges at other locations
- **Night mode** — Dark sky, lit cities, aircraft lights
- **Multiplayer** — WebRTC or WebSocket peer-to-peer (big effort)
- **More aircraft** — Helicopter, 747, drone, ultralite
- **Mission system** — Fly through waypoints, time trials, landing challenges

### Priority 6 — Code Architecture
- File is 4,200 lines in a single HTML file — works but getting large
- Could split into ES modules if it gets much bigger
- No automated tests — everything is manual visual testing
- Consider adding a debug overlay (FPS, chunk count, physics state)

---

## File Structure
```
/Users/michaelashe/Projects/InfiniteFlight/
├── index.html           # Entire application (4,218 lines)
├── handover.md          # Previous handover (Feb 27)
└── HandoverMarch1.md    # This file
```

---

## How to Run
1. Open `index.html` in a browser (Chrome, Safari, Firefox)
2. Or serve locally: `python3 -m http.server 8000` then open `http://localhost:8000`
3. For iPhone: push to GitHub Pages, or serve from Mac and open on same network
4. No build step, no dependencies to install — just a single HTML file + CDN Three.js

---

## How to Roll Back
If something is broken, roll back to any safety tag:
```bash
git checkout before-real-yosemite-terrain-feb27  # Before USGS terrain
git checkout before-f117fix-physics-yosemite-feb27  # Before physics/F-117 fix
git checkout before-f117-f14-afterburner-feb27  # Before jets/afterburners
git checkout before-color-airstrip-attitude-feb26  # Before Feb 26 changes
```
Then `git checkout main` to return to latest.
