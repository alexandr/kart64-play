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
- Some signature set pieces are simplified (Rainbow Road rails are guard blocks; Double Deck is one level
  with perimeter walls; no staff ghosts — Time Trials race your own saved ghost).
