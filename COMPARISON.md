# Comparison log

Each round: every screen + sampled courses captured headlessly (`node tools/verify.mjs … comparisons/round<N>`
→ `comparisons/round<N>/index.html`), `node tests/spec.test.mjs` (53 SPEC checks), and for online
`node tools/net-test.mjs` (two separate browser contexts over PeerJS). Reference behaviour checked against
`reference/SPEC.md` (wiki/community documentation — see `reference/REFS.md`; Nintendo screenshots are not
redistributed in this repo).

## Round 1 — 2026-10-17
**Measurements:** spec tests 53/53 after one fix. Demo (AI-driven) Mario Raceway lap reached at race time
36.2 s (target: expert/staff ≈30 s, casual AI with items expected slower — plausible). Track length 788 m.

**Differences found**
| # | Area | Finding | Fix |
|---|---|---|---|
| 1 | Courses | All courses ~2× too long (Mario Raceway spline 1576 m ⇒ ~70 s laps vs documented ~30 s staff pace). | Rescaled every course layout ≈0.5× (Rainbow Road kept longest at ~110 s/lap casual, as in the original). |
| 2 | Walled courses | On Bowser's Castle / Rainbow Road / Toad's Turnpike the demo kart pinned itself to a wall at ~0.5 m/s — wall response multiplied speed ×0.55 every tick and the CPU racing line cut inside corners. | One-shot impact damping + gradual scrub; CPU steers back to centre near walls; CPU "unstick" recovery. |
| 3 | Title screen | Chequered background made subtitle text unreadable. | Dark overlay above the chequer pattern. |
| 4 | Battle | CPU karts spawned facing away from the arena centre and braked instead of turning. | Spawn heading faces centre; CPU always rolls when nearly stopped. |

## Round 2 — 2026-10-17
**Measurements:** spec 53/53. Verify: all checks pass (menus, keyboard driving, demo progress on
Mario/Bowser/Rainbow/Turnpike/Yoshi, battle). Online: two browser contexts — host created room, guest
joined via `?room=` link, host started; guest received synced state, saw CPUs at speed, and its own
keyboard input drove its kart in the host simulation (speed 22 m/s).
**Verified fixed from round 1:** lap scale, wall trapping, battle spawns (longer probe: balloons lost,
items picked up and fired), title readability.

**Differences found (open, lower priority)**
| # | Area | Finding | Status |
|---|---|---|---|
| 1 | Look | Drivers/tracks are simpler flat-shaded boxes than the original's textured low-poly models and sprite drivers; course geometry is an original approximation of each layout, not a 1:1 trace. | Open — art pass would be next. |
| 2 | HUD | Item slot shows an empty navy box before the first item; the original shows nothing until a roulette starts. | Open (cosmetic). |
| 3 | Battle CPU | CPU karts still pause briefly after obstacle bumps/convergence in Block Fort. | Open — unstick recovery keeps battles moving. |
| 4 | Drift feel | Sparks are conveyed via kart lean + boost, no tyre-smoke particles yet. | Open. |

## Round 3 — 2026-10-17
**Measurements:** spec 53/53; full verify (incl. lap check) all pass. Demo Mario Raceway lap at race
time 36–45 s across runs (variance from items/traffic; clean staff target ≈30 s — a skilled human with
mini-turbos runs faster than the demo CPU). Menus 0 page errors; HUD/minimap/positions correct in captures;
Yoshi Valley shows "?" position as in the original.
**Remaining known gaps vs the 1996 original** (documented honestly, not blockers to play):
- Exact 1:1 course geometry, textures, character models, music and voice clips are originals, not
  reproductions of Nintendo assets (by design — see BRIEF assets rule).
- 3–4-player local split-screen is provided via Online Play instead (up to 4 separate devices);
  local split is 2 players. Local Battle fills with CPU; the original's "loser becomes a bomb" rule is
  simplified to spectating.
- Some signature set pieces are simplified (Rainbow Road rails are guard blocks; no staff ghosts —
  Time Trials race your own saved ghost).

## Round 4 — 2026-10-17 (full coverage + open-difference fixes)
`node tools/verify-full.mjs` captures **every** screen (title, mode, players, engine, character select,
cup select, course select, arena select, online), **all 16 courses**, **all 4 arenas**, countdown/HUD,
VS/GP-podium/TT/Battle results, 2P split-screen and mirrored Extra — with the round's reference frames
alongside (`comparisons/round4/index.html`). All checks passed; Mario Raceway spline 788 m, Rainbow Road
2016 m (longest, as in the original).
**Fixes applied (from round 2/3 open items):** item slot is hidden until the roulette (as in the original);
battle CPU picks its nearest item box, steers around blocks, and has displacement-based unstick (path-length
probe: 35–81 m per kart per 12 s); drift smoke/sparks particle system (white→yellow→red); Double Deck is now
two levels (upper ring at y=4, four ramps, cliff bumps, falls); losing your last balloon turns you into a
**bomb kart** that can still ram a rival (original rule); Fort/Deck/Skyscraper arenas are square like the
originals (Big Donut stays round). Two bugs found by the new tests and fixed: eliminated karts kept driving
invisibly; a bomb blast could be swallowed if the victim was mid-spin.

## Rounds 5–6 — 2026-10-17 (graphics overhaul, user-reported)
User verdict on rounds 1–4 from a real phone: gameplay fine, graphics "total shit", nothing like the
original. Response: pulled **real gameplay frames for every course/arena** from Super Mario Wiki galleries
into `reference/gameplay/` (plus the earlier course vistas in `reference/frames/`), rebuilt the visuals
against them, and re-captured everything side by side (`comparisons/round6/index.html`, ours | original).
- **Karts/drivers rebuilt:** pipe-frame karts (coloured rails, big rear/small front wheels with hubs that
  steer, steering wheel that turns, twin exhausts, engine block, seat) and big-headed drivers with
  per-character features (caps+brims+mustaches, Peach's crown/hair/dress, Toad's spotted cap, Yoshi's snout/
  saddle/tail, DK's tie/muzzle, Wario's pink nose/zigzag mustache, Bowser's horns/spiked shell), blob
  shadows, driver lean. Round-5 review caught the models facing backwards — flipped.
- **Textured everything (procedural canvas textures, all original):** asphalt/highway lanes, dirt with tyre
  bands, sand, snow, cracked ice, Bowser's blue/white checker + red carpet, rainbow bands, boardwalk planks,
  grass/sand/snow/lava ground, brick castle walls, rock strata, crowd grandstands, billboards and yellow
  chevron turn signs, rainbow "?" item boxes (fake = red, inverted ?), Thwomp faces, start-line chequers.
- **Scenery/landmarks per course:** continuous guardrails with coloured top stripe (brick walls in the
  castle), flat oval clouds, horizon hills, start banner arch with course name, cloud referee holding the
  start light, grandstands (raceways/Wario Stadium), Peach's castle (Royal), barn+silo (Farm), rock arch
  (Beach), pyramids+mesa (Desert), overhead gantries (Turnpike), giant snowman (Frappe), rock tunnel
  (Choco), floodlights (Wario), ice cave (Sherbet), castle gate (Bowser), steamboat (Jungle), ghost house
  with lit windows (Banshee), star arch+planets (Rainbow), face hills (Yoshi). Hazards rebuilt as proper
  cars/train/penguins/snowmen/Thwomps/spotted egg.
- **HUD/camera matched to the original 1P layout:** item top-left (count as a badge — fixes the cropped
  "×3" on phones), TIME/LAP top-right, position bottom-right (moved clear of phone buttons), mini-map
  bottom-left; closer/lower chase camera. Title screen now runs an attract-mode demo race behind the logo.
**Measurements (round 6):** SPEC 53/53; full round passed (all courses/arenas/screens + bomb/deck/drift/
HUD regressions + phone buttons); original quick verify passed; online two-context test passed again.
**Still not 1:1 (honest):** drivers are original low-poly models, not the original's pre-rendered sprites;
course geometry remains an original approximation of each layout (not traced 1:1); textures are procedural
echoes, not the N64's. Side-by-side pages make the remaining gap plain to see.
