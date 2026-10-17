# Kart 64 recreation — SPEC (reference targets)

From-scratch fan recreation inspired by Mario Kart 64 (N64, 1996). No Nintendo assets:
no ROM, models, textures, music or voices. All art/audio here is original, low-poly N64-style.

## Sources
- Super Mario Wiki, "Mario Kart 64": https://www.mariowiki.com/Mario_Kart_64 (modes, cups, courses, items)
- Super Mario Wiki, "Drift" / Mario Kart Wiki, "Mini-Turbo": counter-steer wiggle turns drift smoke
  yellow, repeating turns it orange/red, releasing the drift fires the Mini-Turbo.
- Community guides (GameFAQs MK64 guide): engine classes, Extra unlock, staff-ghost unlock times
  (Luigi Raceway 1'52"00, Mario Raceway 1'30"00, Royal Raceway 2'40"00 for 3 laps).
- Character classes (multiple guides): Light = Peach/Yoshi/Toad, Middle = Mario/Luigi,
  Heavy = Donkey Kong/Wario/Bowser. Lights accelerate and recover fastest; heavies have the
  highest top speed and shove others aside; middles are balanced. Same-class racers share stats.

## Characters (8) — our tuned numbers (150cc = ×1.00 baseline)
| Class | Racers | Top speed | Accel | Handling | Weight | Off-road |
|---|---|---|---|---|---|---|
| Light | Peach, Yoshi, Toad | 27.5 m/s | 14.0 | 1.18 | 0.7 | 0.55 |
| Middle | Mario, Luigi | 28.5 m/s | 10.5 | 1.00 | 1.0 | 0.45 |
| Heavy | DK, Wario, Bowser | 29.5 m/s | 7.5 | 0.86 | 1.5 | 0.38 |

Luigi is a touch lighter/taller visually only — class stats are shared, as in the original.

## Engine classes
- 50cc: top speed ×0.72, accel ×0.85, CPU slower. 100cc: ×0.86 / ×0.93. 150cc: ×1.00.
- Extra: 100cc speeds on mirrored courses (left/right flipped), unlocked like the original
  (here: always listed, marked "mirrored", so browser players can try it without a save grind).

## Driving
- A accelerate, B brake/reverse (reverse caps ~8 m/s), R hop/drift, Z item, stick steers.
- Hop: R tap at speed gives a small hop; holding R + steering starts a power slide (drift).
- Mini-Turbo: while drifting, steer opposite then back (one "wiggle pair") → yellow sparks;
  a second pair → orange/red sparks. Releasing R: yellow = 0.7 s boost, red = 1.25 s boost
  (boost top speed = top ×1.35). No wiggle = no boost.
- Rocket start: begin holding A in the short window just as the final start signal sounds
  (≈0.35 s before GO through GO) → boost start. Holding A much earlier → burnout spin-out.
- Off-road (grass/sand/snow/dirt) caps speed by the off-road factor unless boosting/starred.
- Kart-vs-kart bumps push by weight ratio. Walls stop/slow the kart. Falling off / deep water /
  lava → Lakitu-style rescue: lifted back to the last road position, ~2.5 s lost.
- No coins (N64 rules). 3 laps per race. GP points: 9/6/3/1/0/0/0/0; finish 5th–8th = retry the race.
- Rubber-banding: CPU target speed scales with distance to the leading human (behind: up to
  +12%, far ahead: down to −10%), stronger at 150cc — the original is famous for this.

## Items (from Item Boxes; roulette then one item; position-weighted)
Banana (drop/hold behind), Banana Bunch (5), Green Shell (straight, bounces),
Triple Green Shells (orbit, fire one by one), Red Shell (homes to racer ahead),
Triple Red Shells, Spiny/Blue Shell (flies to 1st, explodes), Fake Item Box (upside-down "?",
explodes on touch), Mushroom (boost), Triple Mushrooms, Golden/Super Mushroom (repeat boosts
~8 s), Lightning (shrinks everyone else ~5 s; shrunken karts are slow and can be squashed),
Star (~8 s invincible, faster, knocks others spinning), Boo/Ghost (invisible, intangible,
steals a random rival's item). Spin-out from banana/shell ≈1.1 s; blue-shell flip ≈1.6 s.

### Item odds by race position (percent, rows sum to 100) — documented approximation
Columns: Banana, Bunch, Green, TripleGreen, Red, TripleRed, Spiny, Fake, Mushroom,
TripleMushroom, Golden, Lightning, Star, Boo.
- 1st: 30, 5, 30, 0, 5, 0, 0, 15, 10, 0, 0, 0, 0, 5
- 2nd: 20, 10, 25, 5, 15, 0, 0, 10, 10, 0, 0, 0, 0, 5
- 3rd: 10, 10, 20, 10, 20, 5, 0, 5, 10, 5, 0, 0, 0, 5
- 4th: 5, 10, 15, 10, 20, 10, 0, 5, 10, 5, 0, 0, 5, 5
- 5th: 0, 5, 10, 10, 15, 15, 5, 0, 10, 10, 5, 0, 10, 5
- 6th: 0, 5, 5, 10, 10, 15, 10, 0, 5, 10, 10, 5, 10, 5
- 7th: 0, 0, 5, 5, 10, 15, 15, 0, 5, 10, 10, 10, 10, 5
- 8th: 0, 0, 0, 5, 5, 15, 20, 0, 0, 10, 15, 15, 10, 5
Battle uses a flatter table (no Spiny/Lightning bias). Time Trials: start with Triple Mushrooms, no boxes.

## Courses (16) + Battle (4)
- Mushroom Cup: Luigi Raceway (oval, tunnel), Moo Moo Farm (mole hills, bridge),
  Koopa Troopa Beach (sand, water, rock shortcut), Kalimari Desert (train crossings).
- Flower Cup: Toad's Turnpike (traffic, mirrored traffic in Extra), Frappe Snowland (snowmen),
  Choco Mountain (falling boulders, hairpin), Mario Raceway (pipe, piranha plants).
- Star Cup: Wario Stadium (dirt, big jump), Sherbet Land (ice, penguins, cave),
  Royal Raceway (castle jump), Bowser's Castle (Thwomps, lava).
- Special Cup: DK's Jungle Parkway (river jump, cave), Yoshi Valley (maze, giant egg, unknown
  positions shown as "?" in the original), Banshee Boardwalk (ghost house, no rails),
  Rainbow Road (long, rails, Chain Chomps).
- Battle: Big Donut (lava centre), Block Fort (4 coloured forts), Double Deck (2 levels),
  Skyscraper (rooftop, fall off = lose a balloon). 3 balloons each; last kart standing wins;
  in the original a player who loses all balloons becomes a bomb — here they spectate as a bomb kart.

Track lengths are scaled so a clean 150cc lap lands near community-documented pace
(e.g. Mario Raceway 3 laps ≈ 1'30" at staff-ghost pace ⇒ ≈30 s/lap; Luigi ≈37 s/lap).

## Screens & HUD
Title → mode select (Grand Prix / Time Trials / VS / Battle / Online) → players →
engine class → character select (8 portraits) → cup/course select → countdown (Lakitu-style
traffic light) → HUD: big position ordinal, LAP x/3, race time + lap times, item slot with
roulette, course mini-map with racer dots, final-lap and wrong-way notices → results table
(times, points) → cup standings / podium. Time Trials keep a local ghost (best run replay).

## Online (following ~/projects/smash64 src/net/room.js)
PeerJS WebRTC star topology, 4-letter room code + join link (?room=CODE), host runs the
simulation and broadcasts state; STUN + public TURN (openrelay) fallback. Max 4 humans (N64
limit); races fill to 8 with CPU. Phone: nipplejs stick left; A/B/R/Z buttons right; landscape.
