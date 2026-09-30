# F-14 and Carrier Research for InfiniteFlight
**v01 - 2026-09-30 07:40 PT**

This file collects the research for the full-sim F-14 and the carrier mode. Numbers marked **derived** are my arithmetic from sourced values. Numbers marked **UNVERIFIED** came from secondary sources or weren't found in a primary one.

## Summary

- **There is a usable public F-14 data set.** AFWAL-TR-80-3141 Part III (1980) is approved for public release. It has F-14A coefficient tables from 0 to 55 degrees angle of attack and ±20 degrees sideslip, at 22 degrees of wing sweep. The text layer is garbled by OCR, so the tables have to be re-typed from the page images.
- **Other wing sweeps, high Mach and angles above 55 degrees are only published as plots.** NASA TN D-6909 covers -5 to 90 degrees at four sweeps. We'd digitize its plots and estimate the rest with NASA's free OpenVSP and Digital DATCOM tools.
- **We can't copy code from either open F-14 or F-16 project.** The FlightGear F-14 is GPL. The dyrkorn F-16 browser sim is CC BY-NC-SA 4.0, which is non-commercial and share-alike. We can copy the dyrkorn table layout as an idea, and we type in the government data ourselves.
- **The F-14 NATOPS manuals online are "Distribution Statement C".** That means they're not approved for public release, so we use them only to cross-check numbers.
- **The carrier numbers are solid.** They come from the public LSO NATOPS (2009), the Navy's arresting-gear and catapult training manuals, and a Navy T-45 carrier procedures manual. Wire spacing, the F-14 approach speed in knots, and catapult end speed are still unverified.

## Decisions for Michael

1. **Data path.** I suggest AFWAL Part III as the core, TN D-6909 plots for damping and high AOA, TM-81833 for the landing configuration, and OpenVSP estimates for sweep and Mach. This matches what the FlightGear author did, but with our own numbers.
2. **Licensing.** We'd copy no code or data files from FlightGear or dyrkorn. AIQuorum is free, so the non-commercial clause wouldn't bite, but the share-alike clause would force a license on InfiniteFlight. It's cleaner to avoid both.
3. **Next step.** I download the AFWAL PDF, read the Table 12 pages as images, and type the coefficients into a data file with a checker that plots them against the report's figures.

---

## Part 1. F-14 aerodynamic data

### Reports

| Report | Year | What it has | Numeric tables? |
|---|---|---|---|
| AFWAL-TR-80-3141 Part III, "Investigation of High-Angle-of-Attack Maneuver-Limiting Factors, Part III: Appendices - Aerodynamic Models" (DTIC ADA101648). https://zaretto.com/sites/zaretto.com/files/F-14-data/ADA101648.pdf | 1980 | It has the F-14A clean aircraft at low Mach and 22 degrees sweep. The data come from NASA Ames and Langley wind tunnels, adjusted to flight test. AOA runs 0-55 degrees in 5-degree steps, sideslip 0 to ±20 in 5-degree steps, and moments are referenced to 16% MAC. It's marked approved for public release. | **Yes.** Table 10 (equations) is on PDF pp. 67-70, Tables 11-12 (data) on pp. 72-77, Figs. 36-71 plot each coefficient, and Table 13 (flight-test checks) is on pp. 98-107. |
| NASA TN D-6909, dynamic stability derivatives from -5 to 90 degrees AOA for a variable-sweep twin-tail fighter. https://ntrs.nasa.gov/api/citations/19720024394/downloads/19720024394.pdf | 1972 | It's a 1/10-scale model tested at 22, 35, 50 and 68 degrees sweep. It covers static stability and pitch, roll and yaw damping versus sweep, and it shows yaw damping going unstable between 50 and 90 degrees AOA. | No, it's plots only. |
| NASA TM-81833, F-14A simulator with aileron-rudder interconnect during carrier approaches. https://ntrs.nasa.gov/api/citations/19800020867/downloads/19800020867.pdf | 1980 | It covers the landing configuration (20-degree sweep, slats 17, flaps 35, spoilers 3 up) from -5 to 30 degrees AOA. Appendix A has the aero equations and Appendix B the engine and autothrottle model. | Only mass and inertia (Table I). The aero data are plots. |
| NASA TM X-62306, large-scale F-14A lateral-directional data in the high-lift configuration. https://ntrs.nasa.gov/api/citations/19740004601/downloads/19740004601.pdf | 1973 | It's the Ames 40x80-ft tunnel, -2 to 30 degrees AOA, with direct lift control spoilers, speed brake and roll control. | It appears to be plots. Not every page was checked. |
| NASA/TM-2003-212145, nonlinear aircraft simulations in MATLAB. https://ntrs.nasa.gov/api/citations/20030013626/downloads/20030013626.pdf | 2003 | Its F-14 section gives the full coefficient build-up equations for -5 to 50 degrees AOA and Mach 0 to 1. | Only mass properties (48,669 lb, Ix 58,500, Iy 227,000, Iz 276,000, Ixz -2,820 slug-ft²). The data files weren't found online. |
| NASA TM X-2928 (1973) and TM-80058 (1979), Langley F-14 departure and spin simulator studies. | | These are the source of the AFWAL model. | **UNVERIFIED**: no PDF found. |
| NADC-81293-60, F-14 rotary balance tests, 0-90 degrees AOA. https://apps.dtic.mil/sti/tr/pdf/ADA124468.pdf | 1983 | It tested three sweeps. | **UNVERIFIED**: DTIC was down. The data may only exist on tape. |

The F-16 source TN D-8176 and the F-14 VSTFE reports turned out to have no F-14 flight-dynamics tables.

A secondary history paper with a good bibliography is Takahashi and Lorenzo, "Goose Didn't Have to Die" (2025): https://www.aerosociety.com/media/27097/paper-2025-04-f-14-lateral-stability-takahashi.pdf

### Open models

- **JSBSim** has no F-14 model: https://github.com/JSBSim-Team/jsbsim/tree/master/aircraft
- **The FlightGear F-14** (Richard Harrison) is at https://github.com/Zaretto/f-14b. It uses JSBSim, built from AFWAL Parts I and III, TM X-62306 and TM-81833. Wing sweep and spoiler effects are his own OpenVSP estimates. https://zaretto.com/f-14 says GPL v3, so we won't copy its files. His source page hosts the reports: https://zaretto.com/content/f-14-aerodynamic-data-sources
- **The dyrkorn F-16 browser sim** is at https://github.com/kristoffer-dyrkorn/flightsimulator and its license is CC BY-NC-SA 4.0. Its layout is worth copying as an idea: breakpoint arrays in `headerTables.js`, flat coefficient arrays in `dataTables.js`, n-dimensional linear interpolation in `interpolate.js`, and one wrapper per coefficient in `aerodynamicFunctions.js`.
- **The NATOPS manuals** are the F-14B at https://archive.org/details/navair-01-f-14-aap-1-natops-flight-manual-f-14-b and the F-14D at https://archive.org/details/navair-01-f-14-aad-1-natops-2004-edition-f-14-d. Both are Distribution Statement C, so we use them to cross-check only.

### Key F-14 numbers

| Item | Value | Source |
|---|---|---|
| Simulated landing weight | 48,531 lb (44,531 empty + 4,000 fuel) | TM-81833 |
| Inertias | Ix 66,120, Iy 265,681, Iz 327,689, Ixz -2,537 slug-ft² | TM-81833 |
| Wing area / span at 20 deg / MAC | 565 ft² / 64.13 ft / 9.80 ft | TM-81833 |
| Engine lag (second order) | Spool up 3.464 rad/s, damping 1.617. Spool down 3.000 rad/s, damping 1.817 | TM-81833 |
| Thrust, both engines, landing model | Tc = -32,439 + 1,908 × throttle angle (deg), in lb | TM-81833 |
| g limit | 7.5 g (gear up, above Mach 0.24) | NATOPS F-14B |
| AOA gauge | 0-30 units = -10 to +40 degrees of probe rotation. On-speed is 15 units, stall warning 29 units. Units to true AOA depends on Mach. | NATOPS F-14B |
| Emergency sweep schedule | Mach 0.4 = 20 deg, 0.7 = 25, 0.8 = 50, 0.9 = 60, 1.0 = 68 | NATOPS |
| Sweep rate | 2 deg/s (Harrison's code) | FlightGear F-14 |
| F110-GE-400 thrust | 16,333 lbf dry, 26,950 lbf afterburner (static) | Wikipedia, secondary |
| Top speed / power-off stall | Mach 2.34 at 40,000 ft / 118 kt | Wikipedia, secondary |
| Max trap / max catapult weight | 54,000 lb / 76,000 lb | NATOPS F-14D |

---

## Part 2. Carrier recovery

### Sources
- LSO NATOPS, NAVAIR 00-80T-104 (2009): https://info.publicintelligence.net/LSO-NATOPS-MAY09.pdf
- CNATRA P-816, T-45 CV procedures: https://murphysys.com/dcs/P-816.pdf
- CNATRA P-1211 grading pages: https://navyflightmanuals.tpub.com/P-1211/Landing-Signal-Officer-Continued-P-12110026-26.htm
- Navy NRTC 14310 ch. 3, Mk 7 arresting gear: https://www.globalsecurity.org/military/library/policy/navy/nrtc/14310_ch3.pdf
- Navy NRTC 14310 ch. 4, steam catapults: https://www.globalsecurity.org/military/library/policy/navy/nrtc/14310_ch4.pdf
- USNA, "The Burble Effect": https://ia802804.us.archive.org/8/items/DTIC_ADA527798/DTIC_ADA527798.pdf
- Deck-motion modeling paper: https://arxiv.org/pdf/1901.07951

### How it works, in brief
- **The lens (IFLOLS)** has 10 amber cells of 0.13 degrees each and 2 red cells of 0.20 degrees at the bottom, with 10 green datum lights on each side. It's set for a 3.5-degree glide slope aimed at the 3-wire. It shows 3.75 degrees at 32-37 kt of wind over the deck and 4.0 degrees above 38 kt. Four green cut lights flash once for "Roger ball" and again for "power". Red waveoff lights flash for a waveoff.
- **The Case I pattern** starts with a break at 800 ft and 300-350 kt, then a 600-ft downwind leg. The 180 turn starts 1 to 1.2 nm abeam, the 90 is about 450 ft, bank is 25-27 degrees, and the groove lasts 15-18 seconds. The F-14 picks up the ball at about 0.6 nm.
- **The F-14 on approach** flies 15 units AOA and never more than 17 units to touchdown. It touches down at about 650 fpm sink (1,520 fpm is the limit), goes to full military power at touchdown, and flies a bolter like a touch-and-go. A waveoff with both afterburners is prohibited.
- **Case III (night)** uses gates of 1,200 ft at 3 nm, 800 ft at 2 nm, 400 ft at 1 nm and 200 ft at 0.5 nm, with the ball call at 3/4 mile. The F-14's ACLS Mode I can fly a hands-off landing.
- **LSO grades and points** are: perfect (underlined OK) 5, OK 4, Fair 3, bolter 2.5, no grade 2, waveoff 1, cut 0. Comments use shorthand such as LO (low), H (high), F (fast), SLO (slow), LUL (lined up left), X (at the start), IM (in the middle), IC (in close) and AR (at the ramp).
- **The deck** is angled 9 degrees. A Nimitz carrier has 4 wires, except CVN-76 and CVN-77, which have 3. The hook touchdown point is 230 ft from the ramp and the minimum hook-to-ramp clearance is 10 ft. Each foot of height error moves touchdown 16.4 ft.
- **The Mk 7 arresting gear** runs out to 344 ft whatever the weight and absorbs up to 47.5 million ft-lb. That works out to about 2.2 g average (**derived**).
- **The C-13-1 catapult** has a 309.7-ft stroke. The F-14 uses a launch bar, kneels 14 inches, and takes off hands-off.
- **The burble** is air flowing down behind the island, with a speed loss of up to 30% and a downward flow of up to 8 degrees. Deck motion over 8 ft in 4 seconds is beyond the lens's stabilization, and flying stops above 35 ft of total deck motion.

### Code constants

| Name | Value | Unit | Source |
|---|---|---|---|
| ANGLED_DECK_DEG | 9 | deg | Navy fact file |
| NUM_WIRES | 4 | - | P-816 |
| RAMP_TO_WIRES | 169.9 / 209.9 / 250.4 / 291.2 | ft | forum, UNVERIFIED |
| HOOK_TOUCHDOWN_FROM_RAMP | 230 | ft | LSO NATOPS |
| HOOK_RAMP_MIN | 10 | ft | LSO NATOPS |
| GLIDE_SLOPE | 3.5 / 3.75 / 4.0 | deg | LSO NATOPS |
| LENS_CELLS | 10 amber at 0.13, 2 red at 0.20 | deg | LSO NATOPS |
| LENS_STAB_LIMITS | pitch ±1.62, roll ±8.19 | deg | LSO NATOPS |
| TOUCHDOWN_SHIFT_PER_FT | 16.4 | ft per ft | LSO NATOPS |
| BREAK_ALT / SPEED | 800 / 300-350 | ft / kt | NATOPS F-14D |
| DOWNWIND_ALT | 600 | ft | NATOPS F-14D |
| ALT_AT_90 | 450 | ft | NATOPS F-14D |
| GROOVE_TIME | 15-18 | s | NATOPS F-14D |
| BALL_PICKUP | 0.6 | nm | NATOPS F-14D |
| ONSPEED_AOA / MAX | 15 / 17 | units | NATOPS F-14D |
| SINK_NOMINAL / LIMIT | 650 / 1,520 | fpm | NATOPS F-14D |
| CASE3_GATES | 3, 2, 1, 0.5 nm at 1,200, 800, 400, 200 ft | ft | P-816 |
| MK7_RUNOUT | 344 | ft | NRTC 14310 |
| MK7_MAX_ENERGY | 47.5 million | ft-lb | NRTC 14310 |
| C13_1_STROKE | 309.7 | ft | NRTC 14310 |
| WIND_OVER_DECK | 20-40 | kt | LSO NATOPS |
| DECK_MOTION_NO_GO | 35 | ft total | LSO NATOPS |
| BURBLE | 30% speed loss, -8 deg downflow | - | USNA |
| GRADE_POINTS | 5 / 4 / 3 / 2.5 / 2 / 1 / 0 | points | P-1211 |

### Still unverified
- The F-14 approach speed in knots. A forum says about 123 kt at 50,000 lb.
- The wire spacing. The manual contradicts itself between 20 and 40 ft, and the forum figures above give about 40 ft.
- The catapult end speed, time and g, and peak arrestment g.
- The F-14's hook-to-eye distance and lens roll setting.
- The height of the deck above the water, and typical ship motion in moderate seas.
- The fleet greenie board colors and whether the grade depends on the wire caught.
