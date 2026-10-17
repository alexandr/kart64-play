// SPEC checks: run with `node tests/spec.test.mjs`
import { CHARACTERS, ENGINES, GP_POINTS, ITEM_ODDS, BATTLE_ODDS, ITEMS, rollItem, statsFor, timeToTop, DriftMachine, rocketStart, rubberBand, fmtTime, ordinal, mulberry } from '../src/logic.js';
import { TRACKS, ARENAS, CUPS, cupTracks } from '../src/tracks.js';
let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.log('FAIL:', name); } };
// roster & classes
ok(CHARACTERS.length === 8, '8 characters');
ok(['peach','yoshi','toad'].every(id => CHARACTERS.find(c => c.id === id).cls === 'light'), 'lights');
ok(['mario','luigi'].every(id => CHARACTERS.find(c => c.id === id).cls === 'middle'), 'middles');
ok(['dk','wario','bowser'].every(id => CHARACTERS.find(c => c.id === id).cls === 'heavy'), 'heavies');
// engine classes
ok(statsFor('mario','50cc').top < statsFor('mario','100cc').top && statsFor('mario','100cc').top < statsFor('mario','150cc').top, 'engine top speeds ordered');
ok(ENGINES.extra.mirror && Math.abs(ENGINES.extra.topMul - ENGINES['100cc'].topMul) < 1e-9, 'Extra = mirrored 100cc');
// class trade-offs: light reaches top sooner, heavy top is highest
ok(timeToTop('toad','150cc') < timeToTop('mario','150cc') && timeToTop('mario','150cc') < timeToTop('bowser','150cc'), `accel order light<mid<heavy (${timeToTop('toad','150cc').toFixed(2)} ${timeToTop('mario','150cc').toFixed(2)} ${timeToTop('bowser','150cc').toFixed(2)})`);
ok(statsFor('bowser','150cc').top > statsFor('toad','150cc').top, 'heavy top > light top');
// GP points
ok(JSON.stringify(GP_POINTS) === JSON.stringify([9,6,3,1,0,0,0,0]), 'GP points 9/6/3/1');
// item odds rows sum to 100; rare items unavailable in 1st, common in 8th
ITEM_ODDS.forEach((r, i) => ok(r.reduce((a, b) => a + b, 0) === 100, `odds row ${i + 1} sums 100`));
ok(BATTLE_ODDS.reduce((a, b) => a + b, 0) === 100, 'battle odds sum 100');
const spiny = ITEMS.indexOf('spiny');
ok(ITEM_ODDS[0][spiny] === 0 && ITEM_ODDS[7][spiny] === 20, 'spiny only when behind');
// sampling sanity (seeded): 8th gets spiny/star/lightning/golden far more than 1st gets anything rare
const rng = mulberry(42); const counts = pos => { const c = {}; for (let i = 0; i < 8000; i++) { const it = rollItem(pos, rng); c[it] = (c[it] || 0) + 1; } return c; };
const c1 = counts(1), c8 = counts(8);
ok(!c1.spiny && !c1.lightning && !c1.star && !c1.golden, '1st never gets power items');
ok(c8.spiny > 1200 && c8.lightning > 800, `8th power items frequent (spiny ${c8.spiny})`);
ok((c1.banana || 0) > (c8.banana || 0), '1st mostly bananas/greens');
// mini-turbo state machine: one wiggle pair -> yellow (0.7s), two -> red (1.25s)
const d = new DriftMachine(-1); d.update(1); ok(d.stage === 0, 'counter-steer alone no stage'); d.update(-1); ok(d.stage === 1 && d.boostSeconds() === 0.7, 'one pair = yellow 0.7s');
d.update(1); d.update(-1); ok(d.stage === 2 && d.boostSeconds() === 1.25, 'two pairs = red 1.25s');
const d2 = new DriftMachine(1); for (let i = 0; i < 20; i++) d2.update(1); ok(d2.boostSeconds() === 0, 'holding drift direction = no boost');
// rocket start windows
ok(rocketStart(-0.2) === 'rocket' && rocketStart(0.05) === 'rocket', 'rocket window');
ok(rocketStart(-1.5) === 'burnout', 'early hold = burnout');
ok(rocketStart(null) === 'none' && rocketStart(0.6) === 'none', 'late/none');
// rubber banding: behind speeds up (within +12%*cpuMul), ahead slows
ok(rubberBand(0, 1000, '150cc', 1000) > 1.02, 'cpu behind -> boost');
ok(rubberBand(1000, 0, '150cc', 1000) < 0.98, 'cpu ahead -> slowed');
// tracks: 16 across 4 cups, 4 arenas, unique ids, plausible lengths via control polygon
ok(TRACKS.length === 16 && CUPS.every(c => cupTracks(c.id).length === 4), '16 tracks / 4 cups');
ok(ARENAS.length === 4, '4 battle arenas');
ok(new Set(TRACKS.map(t => t.id)).size === 16, 'unique track ids');
for (const t of TRACKS) { let L = 0; for (let i = 0; i < t.points.length; i++) { const a = t.points[i], b = t.points[(i + 1) % t.points.length]; L += Math.hypot(a[0] - b[0], a[2] - b[2]); }
  const lapAt150 = L / 24; // rough avg speed with corners
  // Rainbow Road is famously ~2x a normal course (~110s/lap casual) — allow it longer.
  ok(L > 400 && L < (t.id === 'rainbow' ? 3200 : 2600), `${t.id} polygon length ${Math.round(L)}m (~${lapAt150.toFixed(0)}s/lap avg)`); }
const rainbow = TRACKS.find(t => t.id === 'rainbow'); const mario = TRACKS.find(t => t.id === 'mario');
ok(rainbow.points.length >= 10, 'rainbow exists'); ok(!!mario, 'mario raceway exists');
// formatting
ok(fmtTime(90.25) === `1'30"25` && ordinal(1) === '1st' && ordinal(8) === '8th', 'fmt helpers');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
