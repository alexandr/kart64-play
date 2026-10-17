// Pure game data + rules (no DOM / THREE) so tests can import it directly. See reference/SPEC.md.
export const CLASSES = {
  light:  { top: 27.5, accel: 14.0, handling: 1.18, weight: 0.7, offroad: 0.55 },
  middle: { top: 28.5, accel: 10.5, handling: 1.00, weight: 1.0, offroad: 0.45 },
  heavy:  { top: 29.5, accel: 7.5,  handling: 0.86, weight: 1.5, offroad: 0.38 },
};
export const CHARACTERS = [
  { id: 'mario',  name: 'Mario',  cls: 'middle', color: 0xe52521, skin: 0xffcf9e, hat: 0xe52521 },
  { id: 'luigi',  name: 'Luigi',  cls: 'middle', color: 0x2fae3f, skin: 0xffcf9e, hat: 0x2fae3f },
  { id: 'peach',  name: 'Peach',  cls: 'light',  color: 0xf7a8c4, skin: 0xffe0bd, hat: 0xffd84a },
  { id: 'toad',   name: 'Toad',   cls: 'light',  color: 0xf2f2f2, skin: 0xffe0bd, hat: 0xffffff },
  { id: 'yoshi',  name: 'Yoshi',  cls: 'light',  color: 0x52c234, skin: 0xffffff, hat: 0x52c234 },
  { id: 'dk',     name: 'DK',     cls: 'heavy',  color: 0x8a5a2b, skin: 0xd9a066, hat: 0xe52521 },
  { id: 'wario',  name: 'Wario',  cls: 'heavy',  color: 0xf7d117, skin: 0xffcf9e, hat: 0xf7d117 },
  { id: 'bowser', name: 'Bowser', cls: 'heavy',  color: 0xf08c1e, skin: 0xffe6a3, hat: 0x2fae3f },
];
export const ENGINES = {
  '50cc':  { topMul: 0.72, accelMul: 0.85, cpuMul: 0.80, mirror: false, label: '50cc' },
  '100cc': { topMul: 0.86, accelMul: 0.93, cpuMul: 0.90, mirror: false, label: '100cc' },
  '150cc': { topMul: 1.00, accelMul: 1.00, cpuMul: 1.00, mirror: false, label: '150cc' },
  'extra': { topMul: 0.86, accelMul: 0.93, cpuMul: 0.92, mirror: true,  label: 'EXTRA' },
};
export const GP_POINTS = [9, 6, 3, 1, 0, 0, 0, 0];
export const ITEMS = ['banana','bunch','green','tripleGreen','red','tripleRed','spiny','fake',
  'mushroom','tripleMushroom','golden','lightning','star','boo'];
export const ITEM_LABEL = { banana:'Banana', bunch:'Banana Bunch', green:'Green Shell', tripleGreen:'Triple Green Shells',
  red:'Red Shell', tripleRed:'Triple Red Shells', spiny:'Spiny Shell', fake:'Fake Item Box', mushroom:'Mushroom',
  tripleMushroom:'Triple Mushrooms', golden:'Golden Mushroom', lightning:'Lightning', star:'Star', boo:'Boo' };
export const ITEM_ODDS = [
  [30,5,30,0,5,0,0,15,10,0,0,0,0,5],
  [20,10,25,5,15,0,0,10,10,0,0,0,0,5],
  [10,10,20,10,20,5,0,5,10,5,0,0,0,5],
  [5,10,15,10,20,10,0,5,10,5,0,0,5,5],
  [0,5,10,10,15,15,5,0,10,10,5,0,10,5],
  [0,5,5,10,10,15,10,0,5,10,10,5,10,5],
  [0,0,5,5,10,15,15,0,5,10,10,10,10,5],
  [0,0,0,5,5,15,20,0,0,10,15,15,10,5],
];
export const BATTLE_ODDS = [18,8,18,10,14,8,0,10,6,0,0,0,8,0];
export function rollItem(position, rng = Math.random, battle = false) {
  const row = battle ? BATTLE_ODDS : ITEM_ODDS[Math.max(1, Math.min(8, position)) - 1];
  let r = rng() * 100;
  for (let i = 0; i < row.length; i++) { r -= row[i]; if (r < 0) return ITEMS[i]; }
  return 'banana';
}
export function statsFor(charId, engineId) {
  const c = CHARACTERS.find(x => x.id === charId) || CHARACTERS[0];
  const base = CLASSES[c.cls], e = ENGINES[engineId] || ENGINES['150cc'];
  return { ...base, top: base.top * e.topMul, accel: base.accel * e.accelMul, cls: c.cls };
}
// 1-D top-speed approach used by both the game and tests: accelerate, coast drag, brake.
export function stepSpeed(speed, throttle, brake, stats, dt, cap = stats.top) {
  if (throttle) speed += stats.accel * (1 - Math.max(0, speed) / (cap * 1.15)) * dt;
  else speed -= 6 * dt * Math.sign(speed || 0);
  if (brake) speed += (speed > 0.5 ? -22 : -8) * dt;
  if (!throttle && Math.abs(speed) < 0.4) speed = 0;
  return Math.max(-8, Math.min(cap * 1.35, speed));
}
export function timeToTop(charId, engineId, frac = 0.95) {
  const s = statsFor(charId, engineId); let v = 0, t = 0;
  while (v < s.top * frac && t < 30) { v = stepSpeed(v, true, false, s, 1 / 60); if (v > s.top) v = s.top; t += 1 / 60; }
  return t;
}
// Drift state machine: feed steer sign each tick while drifting; counts opposite->back pairs.
export class DriftMachine {
  constructor(dir) { this.dir = dir; this.stage = 0; this.phase = 0; } // stage 0 none, 1 yellow, 2 red
  update(steer) {
    const s = steer > 0.35 ? 1 : steer < -0.35 ? -1 : 0;
    if (this.phase === 0 && s === -this.dir) this.phase = 1;
    else if (this.phase === 1 && s === this.dir) { this.phase = 0; this.stage = Math.min(2, this.stage + 1); }
    return this.stage;
  }
  boostSeconds() { return this.stage === 2 ? 1.25 : this.stage === 1 ? 0.7 : 0; }
}
// Rocket start: accel first pressed at t seconds relative to GO (negative = before).
export function rocketStart(pressAt) {
  if (pressAt === null || pressAt === undefined) return 'none';
  if (pressAt < -0.4) return 'burnout';
  if (pressAt <= 0.15) return 'rocket';
  return 'none';
}
export function rubberBand(cpuProgress, humanProgress, engineId, lapLen = 1000) {
  const gap = (humanProgress - cpuProgress) / lapLen; // >0 cpu behind
  const strength = engineId === '150cc' ? 1 : engineId === '50cc' ? 0.5 : 0.75;
  const f = 1 + Math.max(-0.10, Math.min(0.12, gap * 0.35)) * strength;
  return f * (ENGINES[engineId]?.cpuMul ?? 1);
}
export function fmtTime(sec) {
  if (!isFinite(sec) || sec === null || sec === undefined) return "--'--\"--";
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), cs = Math.floor((sec % 1) * 100);
  return `${m}'${String(s).padStart(2, '0')}"${String(cs).padStart(2, '0')}`;
}
export function ordinal(n) { return n + (['th','st','nd','rd'][((n % 100) > 10 && (n % 100) < 14) ? 0 : Math.min(n % 10, 4)] || 'th'); }
export function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
