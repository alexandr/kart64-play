# kart64-play

A from-scratch fan recreation of the 1996 N64 kart racer, playable in the browser — on desktop and phones, solo, split-screen, or online with friends. All art, models and sound are original low-poly creations; no ROM or ripped Nintendo assets are used. Unofficial fan project, not affiliated with Nintendo.

**Play:** https://alexandr.github.io/kart64-play/

## What's in it
- **Modes:** Grand Prix (4 cups × 4 races, 9/6/3/1 points, must finish top 4), Time Trials with a saved local ghost, VS single races, and Battle (3 balloons) in 4 arenas: Big Donut, Block Fort, Double Deck, Skyscraper.
- **16 courses** across the Mushroom, Flower, Star and Special Cups, with hazards (traffic on Toad's Turnpike, the Kalimari train, Thwomps, penguins, Chain Chomps…), boost pads and Lakitu-style rescues.
- **8 racers** in 3 weight classes (light/middle/heavy), **4 engine classes** (50cc/100cc/150cc/Extra-mirrored).
- **Driving:** hop + power-slide drifting, counter-steer wiggle mini-turbos (yellow/red sparks), rocket start (and burnout), off-road slowdown, rubber-banding CPUs.
- **14 items** with position-weighted odds: bananas, green/red/spiny shells (incl. triples), mushrooms (incl. golden), star, lightning, Boo, fake item box.
- **Online:** create a room, share the 4-letter code or join link (`?room=CODE`); up to 4 humans, host-simulated over WebRTC (PeerJS) with STUN + TURN fallback, races filled to 8 with CPU.
- **Controls:** keyboard (Arrows/WASD + Space drift, Q item; player 2 on IJKL+U/O), gamepad, and on phones a virtual stick + A/B/DRIFT/ITEM buttons in landscape.

## Develop
```sh
python3 -m http.server 8321   # then open http://localhost:8321/
npm test                      # SPEC checks (stats, item odds, mini-turbo, tracks)
node tools/verify.mjs         # headless menu/race/battle verification + screenshots
node tools/net-test.mjs       # two-context online session test
```
Design targets and sources: [reference/SPEC.md](reference/SPEC.md). Verification history: [COMPARISON.md](COMPARISON.md).
