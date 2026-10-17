// Headless verification: menus + demo races + battle + keyboard driving. Usage: node tools/verify.mjs [base] [outdir] [quick]
import { chromium } from '/home/alexandr/projects/smash64/node_modules/playwright/index.mjs';
import { mkdirSync } from 'fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8321/';
const OUT = process.argv[3] || 'comparisons/round1';
mkdirSync(OUT + '/ours', { recursive: true });
const browser = await chromium.launch({ executablePath: '/home/alexandr/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox', '--enable-unsafe-swiftshader','--use-angle=swiftshader-webgl'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 640 } });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push('CONSOLE: ' + m.text()); });
const shot = async n => { await page.screenshot({ path: `${OUT}/ours/${n}.png` }); console.log('shot', n); };
const state = () => page.evaluate(() => window.__KART__?.state());
const waitRacing = async (ms = 25000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await state().catch(() => null); if (s?.race && s.phase === 'racing' && s.time > 1.5) return s; await page.waitForTimeout(600); } return state().catch(() => null); };
let fails = 0; const check = (c, n) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) fails++; };
// menus
for (const [url, name] of [['', '01_title'], ['?screen=mode', '02_mode'], ['?screen=chars', '03_chars'], ['?screen=courses', '04_courses'], ['?screen=online', '05_online']]) {
  await page.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200); await shot(name);
}
check(errors.length === 0, 'no errors on menus: ' + errors.join(' | '));
// demo race: AI drives, must gain speed + progress, complete progress over time
await page.goto(BASE + '?autotest=1&track=mario&char=toad&engine=150cc', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(7000);
let st = await state(); console.log('race@7s', JSON.stringify(st));
check(st?.race && st.phase === 'racing', 'race running');
check(st?.me?.speed > 8, 'kart at speed ' + st?.me?.speed);
await shot('06_race_mario');
await page.waitForTimeout(12000); const st2 = await state(); console.log('race@19s', JSON.stringify(st2?.me));
check(st2.me.progress > st.me.progress + 30, `progress advanced ${st.me.progress} -> ${st2.me.progress}`);
await shot('07_race_mario2');
// keyboard driving on a fresh race: hold ArrowUp through countdown (late = no rocket, still drives)
await page.goto(BASE, { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(900);
await page.evaluate(() => window.__KART__.screens.mode()); await page.waitForTimeout(300);
await page.evaluate(() => { // drive the real menu flow via the same functions buttons call
  const K = window.__KART__; K.startDemo('luigi', 'mario', '100cc', 'race'); K.app.race.demo = false; });
await page.waitForTimeout(4200); // countdown done
await page.keyboard.down('ArrowUp'); await page.waitForTimeout(3500);
st = await state(); console.log('kbd', JSON.stringify(st?.me));
check(st.me.speed > 10, 'keyboard accel drives kart, speed ' + st.me.speed);
await page.keyboard.down('ArrowRight'); await page.waitForTimeout(900); await page.keyboard.up('ArrowRight');
await shot('08_race_keyboard');
await page.keyboard.up('ArrowUp');
// other tracks smoke (demo 6s each)
for (const tr of ['bowser', 'rainbow', 'turnpike', 'yoshi']) {
  await page.goto(`${BASE}?autotest=1&track=${tr}`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(6500); st = await state();
  check(st?.race && st.me.speed > 3, `${tr} demo speed ${st?.me?.speed}`); await shot('track_' + tr);
}
// battle demo
await page.goto(BASE + '?autotest=1&kind=battle&track=fort', { waitUntil: 'networkidle' }).catch(() => {});
await page.waitForTimeout(8000); st = await state(); console.log('battle', JSON.stringify(st));
check(st?.kind === 'battle' && st.me.speed >= 0, 'battle running'); await shot('09_battle_fort');
// lap-time measure: let demo run a mario lap (up to 75s) and report
if (!process.argv.includes('quick')) {
  await page.goto(BASE + '?autotest=1&track=mario&char=toad&engine=150cc', { waitUntil: 'networkidle' }).catch(() => {});
  const t0 = Date.now(); let lap = 1;
  while (Date.now() - t0 < 80000) { await page.waitForTimeout(3000); st = await state(); if (st.me.lap > 1) { lap = st.me.lap; break; } }
  console.log('LAPCHECK mario lap reached', lap, 'raceTime', st.time);
  check(lap > 1, 'demo completes a lap');
  check(st.time < 75, 'lap pace vs SPEC ~30s staff: raceTime at lap2 = ' + st.time);
}
check(errors.length === 0, 'no page errors overall: ' + errors.slice(0, 4).join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILURES` : '\nALL CHECKS PASSED');
process.exit(fails ? 1 : 0);
