// FULL capture + behavior round: every screen, every one of the 16 courses, all 4 battle arenas,
// results/podium/TT/battle-results, 2P split, plus regression checks for the round-4 fixes
// (hidden empty item slot, drift particles, Double Deck heights, bomb-kart rule, battle CPU travel).
// Usage: node tools/verify-full.mjs [base] [outdir]
import { chromium } from '/home/alexandr/projects/smash64/node_modules/playwright/index.mjs';
import { mkdirSync, copyFileSync, existsSync, writeFileSync, readdirSync, readFileSync } from 'fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8321/';
const OUT = process.argv[3] || 'comparisons/round4';
mkdirSync(OUT + '/ours', { recursive: true }); mkdirSync(OUT + '/ref', { recursive: true });
const TRACKS = ['luigi','farm','beach','desert','turnpike','frappe','choco','mario','wario','sherbet','royal','bowser','jungle','yoshi','banshee','rainbow'];
const ARENAS = ['donut','fort','deck','scraper'];
const GPIDX = existsSync('reference/gameplay/index.json') ? JSON.parse(readFileSync('reference/gameplay/index.json', 'utf8')) : {};
for (const id of [...TRACKS, ...ARENAS, 'title']) {
  const src = GPIDX[id] ? `reference/gameplay/${GPIDX[id]}` : `reference/frames/${id}.png`;
  if (existsSync(src)) copyFileSync(src, `${OUT}/ref/${id}.${src.split('.').pop()}`); }
const browser = await chromium.launch({ executablePath: '/home/alexandr/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader-webgl'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text()); });
let fails = 0; const check = (c, n) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fails++; };
const shot = async n => { await page.screenshot({ path: `${OUT}/ours/${n}.png` }); console.log('shot', n); };
const ev = fn => page.evaluate(fn);
const waitRacing = async (ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await ev(() => __KART__?.state()).catch(() => null); if (s?.race && s.phase === 'racing' && s.time > 1.5) return s; await page.waitForTimeout(600); } return ev(() => __KART__?.state()).catch(() => null); };
const goto = async u => { await page.goto(BASE + u, { waitUntil: 'load' }).catch(() => {}); await page.waitForTimeout(1400); };
// ---- every menu screen ----
await goto(''); await shot('scr01_title');
await ev(() => __KART__.screens.mode()); await page.waitForTimeout(350); await shot('scr02_mode');
await ev(() => __KART__.screens.players()); await page.waitForTimeout(350); await shot('scr03_players');
await ev(() => __KART__.screens.engine()); await page.waitForTimeout(350); await shot('scr04_engine');
await ev(() => __KART__.screens.chars()); await page.waitForTimeout(350); await shot('scr05_chars');
await ev(() => __KART__.screens.cups()); await page.waitForTimeout(350); await shot('scr06_cups');
await ev(() => { __KART__.app.mode = 'vs'; __KART__.screens.courses(); }); await page.waitForTimeout(350); await shot('scr07_courses');
await ev(() => __KART__.screens.arenas()); await page.waitForTimeout(350); await shot('scr08_arenas');
await ev(() => __KART__.screens.online()); await page.waitForTimeout(350); await shot('scr09_online');
// ---- every course (demo drive) ----
const lapInfo = {};
for (const tr of TRACKS) {
  await goto(`?autotest=1&track=${tr}`);
  const st = await waitRacing(30000); await page.waitForTimeout(2500);
  lapInfo[tr] = { length: Math.round(st.trackLength || 0), speed: st.me?.speed, progress: st.me?.progress };
  check(st.race && st.me.speed > 3, `course ${tr}: len=${lapInfo[tr].length}m speed=${st.me?.speed} progress=${st.me?.progress}`);
  await shot('track_' + tr);
}
// HUD regression: empty item slot hidden at race start (fresh race, before any box)
{
  await goto('?autotest=1&track=luigi'); await page.waitForTimeout(2500);
  const vis = await ev(() => getComputedStyle(document.querySelector('#itemslot')).visibility + ':' + (__KART__.app.race.me().item || 'none'));
  check(vis.startsWith('hidden'), 'item slot hidden before roulette (got ' + vis + ')');
  const vis2 = await ev(() => { const r = __KART__.app.race; r.me().roulette = 0.5; r.updateHUD(); return getComputedStyle(document.querySelector('#itemslot')).visibility; });
  check(vis2 === 'visible', 'item slot visible during roulette');
  // drift particle pool works
  const pc = await ev(() => { const r = __KART__.app.race; r.particles.forEach(p => { p.life = 0; p.mesh.visible = false; });
    r.spawnP(r.me().x, r.me().y + 1, r.me().z, 0xff5a1e, 12);
    const live = r.particles.filter(p => p.life > 0 && p.mesh.visible).length;
    r.stepParticles(2); const after = r.particles.filter(p => p.mesh.visible).length; // synchronous: no new emissions in between
    return { pool: r.particles.length, live, after }; });
  check(pc.pool >= 100 && pc.live >= 10, 'drift/spark particle pool emits (' + JSON.stringify(pc) + ')');
  check(pc.after === 0, 'particles expire after their life (' + pc.after + ' left)');
}
// countdown + race HUD + pause captures
{ await goto('?autotest=1&track=royal'); await page.waitForTimeout(1800); await shot('scr10_countdown'); await page.waitForTimeout(5000); await shot('scr11_hud'); }
// results (VS) via finishNow
{ await ev(() => __KART__.finishNow()); await page.waitForTimeout(2600); await shot('scr12_results_vs');
  const txt = await page.textContent('.screen').catch(() => ''); check(/RESULTS/.test(txt), 'VS results screen'); }
// GP podium (finale hook) + GP mid-cup results
{ await goto(''); await ev(() => __KART__.startGPFinale()); await page.waitForTimeout(6000); await ev(() => __KART__.finishNow()); await page.waitForTimeout(2800);
  await shot('scr13_podium'); const txt = await page.textContent('.screen').catch(() => ''); check(/CHAMPION/.test(txt), 'GP champion/podium screen: ' + txt.slice(0, 60).replace(/\s+/g, ' ')); }
// Time Trial results
{ await goto(''); await ev(() => { const K = __KART__; K.app.mode = 'tt'; K.app.players = 1; K.app.engine = '150cc'; K.app.chars = ['yoshi', 'mario']; K.startDemo('mario', 'yoshi', '150cc', 'race'); K.app.mode = 'tt'; });
  await page.waitForTimeout(6500); await ev(() => { __KART__.app.mode = 'tt'; __KART__.finishNow(); }); await page.waitForTimeout(2800);
  await shot('scr14_results_tt'); const txt = await page.textContent('.screen').catch(() => ''); check(/TIME TRIAL/.test(txt), 'TT results screen'); }
// 2P split-screen
{ await goto(''); await ev(() => __KART__.startSplit('luigi')); await page.waitForTimeout(7000); await shot('scr15_split2p');
  const st = await ev(() => __KART__.state()); check(st.race, '2P split race running'); }
// ---- every battle arena ----
for (const ar of ARENAS) {
  await goto(`?autotest=1&kind=battle&track=${ar}`); const st = await waitRacing(30000); await page.waitForTimeout(2500);
  check(st.kind === 'battle', `arena ${ar} running`); await shot('arena_' + ar);
}
// battle regressions on Double Deck: heights, bomb rule, CPU travel
{
  await goto('?autotest=1&kind=battle&track=deck'); await page.waitForTimeout(5500);
  const heights = await ev(() => { const r = __KART__.app.race; return { centre: r.arenaHeight(0, 0), ramp: r.arenaHeight(0, -23), deck: r.arenaHeight(0, -38), side: r.arenaHeight(38, 5) }; });
  check(heights.centre === 0 && Math.abs(heights.ramp - 2) < 0.3 && heights.deck === 4, 'Double Deck heights ' + JSON.stringify(heights));
  const bomb = await ev(() => { const r = __KART__.app.race; const v = r.karts[1]; v.balloons = 1; v.spin = 0; v.hitCooldown = 0; v.star = 0; r.hitKart(v);
    const became = { bomb: !!v.bomb, alive: v.alive, visible: v.mesh.visible, balloons: v.balloons };
    const hero = r.karts[0]; const before = hero.balloons; v.x = hero.x; v.z = hero.z; v.y = hero.y;
    return { became, before }; });
  check(bomb.became.bomb && bomb.became.alive && bomb.became.visible, 'losing last balloon -> bomb kart (stays in game) ' + JSON.stringify(bomb.became));
  await page.waitForTimeout(1500);
  const after = await ev(() => { const r = __KART__.app.race; return { heroBalloons: r.karts[0].balloons, bombAlive: r.karts[1].alive }; });
  check(after.heroBalloons < bomb.before && after.bombAlive === false, 'bomb ram pops a balloon then is gone ' + JSON.stringify(after));
  // CPU travel over time
  let prev = await ev(() => __KART__.app.race.karts.map(k => [k.x, k.z])); const startPos = prev.map(p2 => [...p2]);
  const pathLen = prev.map(() => 0), maxDisp = prev.map(() => 0);
  for (let i2 = 0; i2 < 9; i2++) { await page.waitForTimeout(1000);
    const cur = await ev(() => __KART__.app.race.karts.map(k => [k.x, k.z, k.alive]));
    cur.forEach((c2, j) => { pathLen[j] += Math.hypot(c2[0] - prev[j][0], c2[1] - prev[j][1]); maxDisp[j] = Math.max(maxDisp[j], Math.hypot(c2[0] - startPos[j][0], c2[1] - startPos[j][1])); prev[j] = c2; }); }
  const dist = pathLen.map((d, j) => ({ d, max: maxDisp[j], inGame: prev[j][2] }));
  check(dist.every(r => !r.inGame || (r.d > 15 && r.max > 4)), 'battle karts still in game keep moving (path m / max disp) ' + dist.map(r => r.d.toFixed(0) + '/' + r.max.toFixed(0) + (r.inGame ? '' : '(out)')).join(','));
  await shot('arena_deck_action');
  await ev(() => __KART__.finishNow()); await page.waitForTimeout(2800); await shot('scr16_results_battle');
  const txt = await page.textContent('.screen').catch(() => ''); check(/WINS/.test(txt), 'battle results screen');
}
// mirrored Extra course
{ await goto('?autotest=1&track=luigi&engine=extra'); await page.waitForTimeout(6500); await shot('track_luigi_extra');
  const st = await ev(() => __KART__.state()); check(st.race && st.me.speed > 3, 'EXTRA mirrored course drives'); }
// phone layout (touch controls must not bury the position readout)
{ const mp = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  await mp.goto(BASE + '?autotest=1&track=luigi&touch=1', { waitUntil: 'load' }).catch(() => {});
  await mp.waitForTimeout(11000);
  const nb = await mp.evaluate(() => document.querySelectorAll('.tbtn').length).catch(() => 0);
  check(nb === 4, 'phone touch buttons present (' + nb + ')');
  await mp.screenshot({ path: OUT + '/ours/scr17_phone.png' }); console.log('shot scr17_phone'); await mp.close(); }
writeFileSync(OUT + '/measurements.json', JSON.stringify({ lapInfo, errors }, null, 1));
// side-by-side comparison page (ours | original reference frame)
{ const ours = readdirSync(OUT + '/ours').filter(f => f.endsWith('.png')).sort();
  const refs = {}; for (const f of readdirSync(OUT + '/ref')) refs[f.replace(/\.(png|jpg|jpeg)$/, '')] = f;
  const pair = id => { const o = ours.find(f => f === 'track_' + id + '.png' || f === 'arena_' + id + '.png' || (id === 'title' && f === 'scr01_title.png'));
    if (!o && !refs[id]) return '';
    return `<figure><div class=row>${o ? `<img src="ours/${o}">` : '<span>—</span>'}${refs[id] ? `<img src="ref/${refs[id]}">` : '<span>no ref</span>'}</div><figcaption>${id}: ours (left) · original reference (right)</figcaption></figure>`; };
  const singles = ours.filter(f => !f.startsWith('track_') && !f.startsWith('arena_') && f !== 'scr01_title.png').map(f => `<figure><img src="ours/${f}"><figcaption>${f}</figcaption></figure>`).join('');
  writeFileSync(OUT + '/index.html', `<!doctype html><meta charset=utf-8><title>Kart 64 — comparison</title><style>body{background:#101038;color:#fff;font:600 15px Arial;margin:20px}h1{color:#ffd84a;font-style:italic}.row{display:grid;grid-template-columns:1fr 1fr;gap:8px}img{width:100%;border:2px solid #fff5;border-radius:8px}figure{margin:0 0 18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:14px}</style><h1>Kart 64 — side-by-side (ours vs original reference frames)</h1><p>Reference frames: Super Mario Wiki course galleries (reference only, not game assets). Findings in ../../COMPARISON.md.</p>${[...TRACKS, ...ARENAS, 'title'].map(pair).join('')}<h1>Screens & modes (ours)</h1><div class=grid>${singles}</div>`); }
check(errors.length === 0, 'no page errors: ' + errors.slice(0, 4).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nFULL ROUND PASSED');
process.exit(fails ? 1 : 0);
