# Brief: a faithful recreation of Mario Kart 64 (N64, 1996), in the browser, online with friends, playable on phones

The user wants Mario Kart 64 recreated as exactly as possible, hosted on GitHub Pages, with online rooms and phone controls. It's a from-scratch recreation (Three.js or similar), not an emulator running a ROM.

## Research first, and keep it as the reference
- Specs from wikis (Super Mario Wiki, Mario Kart Wiki, speedrun and community docs):
  - All 8 characters and their weight classes, with top speed, acceleration and handling per class.
  - The engine classes: 50cc, 100cc, 150cc and Extra.
  - Item odds by position, and every item's behaviour.
  - Drifting and the mini-turbo (the stick-wiggle spark colors), the rocket start, and hop.
  - Lakitu rescue, the coin-less N64 rules, and rubber-banding and the CPU behaviour.
  - All 16 tracks (4 cups) with their layouts, hazards and shortcuts, plus the 4 Battle arenas.
  - Every screen and menu: title, mode select, player count, character select, cup and track select, the race HUD (position, lap, items, timer, mini-map), results and podium, Time Trials with ghosts, VS and Battle with balloons.
- Collect screenshots and gameplay videos of every track and screen (YouTube, wikis). Pull frames into `reference/`. Write `reference/SPEC.md` with every number and behaviour you'll match, and cite each source.

## Build
- Every mode above, all tracks, all characters, all items, with CPU racers.
- Physics and feel matched to the specs: speeds, drift arcs, mini-turbo timing, item effects, collisions and spin-outs.
- **Assets:** no ripped Nintendo assets (no ROM, extracted models, textures, music or voice clips). Make original ones that match the look and feel as closely as possible: the N64 low-poly style, track geometry and colors from the references, the same camera, the same HUD layout.

## Online + mobile (follow the sibling project's approach)
- Read `~/projects/smash64` (`src/net/room.js` and its touch controls) and reuse the approach: PeerJS WebRTC, a 4-letter room code plus a join link, the host runs the simulation, up to 4 players (the N64 limit; Battle too), and STUN plus a public TURN fallback for cellular networks.
- Phone controls: a nipplejs joystick for steering on the left. On the right, buttons for accelerate (A), brake/reverse (B), hop/drift (R) and item (Z), big enough for thumbs. Landscape, with a "rotate your phone" hint, and no zoom or scroll bounce.
- Keyboard and gamepad (Gamepad API) on desktop.
- Host on GitHub Pages like smash64 (`gh` is logged in as alexandr): a public repo with a neutral name like `kart64-play`, with a neutral description and no trademarked name in the repo name. Get a playable version live early, then keep it deployed as you improve it. Test a real multi-player session across separate browser contexts before calling online "done".

## Verify, again and again
When you think you're done, run at least 3 rounds of extreme comparison. Each round:
1. For every track and screen, capture your game (headless screenshots and short recordings) side by side with the reference frames, and show these comparison pages to the user with `show-user`.
2. Measure against SPEC.md with automated tests: speeds per weight class and engine class, mini-turbo timing, item odds, lap and track lengths compared with known world-record lap times.
3. List every difference, fix it, and repeat.

Keep `COMPARISON.md` with each round's findings and fixes. Don't stop after one clean-looking round.

## Show
- Show the live URL with `show-user <url>` as soon as a first version is playable, and keep it updated.
- Mark the latest full build with `show-user --cut`.
- `show-user` is a shell command on this machine (in ~/.local/bin); `show-user --help` explains it.
- Commit and deploy as you go: this is a long project.
