# InfiniteFlight Combat Plan
**v01.0.0 - 2026-09-30 06:55 PT**

This plan turns InfiniteFlight into a modern JetFighter-style combat sim. The research and the full design are in `InfiniteFlight_CombatDesign_v02_2026-09-30.html` (online at https://claude.ai/artifact/LuJ2BDxwFC3CqfDH5A2Qfp). The engine review that kept us on Three.js is in `InfiniteFlight_UnrealEngineReview_v01_2026-09-30.html`.

## Michael's decisions (2026-09-30)
| Question | Answer |
|---|---|
| Engine | Stay on Three.js, because the sim is for Michael and for AIQuorum browser players. |
| First thing to fly | Carrier traps. |
| Default realism | Full sim, like DCS. |
| Assists on by default | None.  Assists still exist as switches, and each one is recorded with the score. |
| Enemy | A fictional coalition flying real Russian and Chinese aircraft types. |
| Home theater | SF Bay and the Sierra. |
| Hero jet | F-14 Tomcat. |
| Story | Short text briefings only. |
| Live multiplayer | After the campaign. |

## What "full sim" changes
- The flight model has to be data-driven: lift, drag and moment coefficients by angle of attack and Mach, taken from published wind-tunnel data.  Tuned arcade constants won't do.
- The F-14 needs its own model: swing wings (20 to 68 degrees), a high-AOA departure risk, adverse yaw at slow speed, and the engines' slow spool-up.  Research first: find public F-14 aerodynamic data (NASA reports) and check the license on the dyrkorn F-16 code before borrowing its structure.
- Carrier approach speed, AOA, sink rate and hook-to-ramp clearance have to match the real numbers, or the LSO grade is meaningless.
- DCS takes a team years per aircraft.  The target here is one F-14 that flies convincingly, not DCS-level systems (no full radar modes or every switch in the cockpit).

## Build order (revised for these answers)
1. **Joystick flight test (owed since 2026-08-08).**  Full-sim tuning needs a stick that reads correctly.
2. **F-14 flight model**, 3 to 4 sessions.  This replaces Phase 2 of the revamp plan and starts with the F-14 only.
3. **Carrier**, 2 to 3 sessions.  A moving carrier off the Golden Gate, the catapult, the meatball, four wires, bolters, LSO calls and a graded boarding board.  Carrier quals (6 day, 6 night traps) are the first playable mode.
4. **Sound**, 1 session.
5. **Guns-only dogfight**, 2 to 3 sessions.
6. **Missiles, radar, countermeasures, wingmen**, 2 sessions.
7. **Strike missions**, 2 sessions.
8. **Campaign over the Bay and the Sierra, plus AIQuorum leaderboards**, 3 sessions.
9. **Live multiplayer and a mission editor**, later.
