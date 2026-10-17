// Kart 64 — original from-scratch fan recreation (Three.js). No Nintendo assets.
// Host-simulated online via PeerJS; local 1–2P split-screen; CPU fills races to 8.
import * as THREE from 'three';
import { CHARACTERS, ENGINES, CLASSES, GP_POINTS, ITEM_LABEL, rollItem, statsFor, stepSpeed,
  DriftMachine, rocketStart, rubberBand, fmtTime, ordinal, mulberry } from './logic.js';
import { TRACKS, ARENAS, CUPS, trackById, cupTracks } from './tracks.js';
import { Room, joinLink, encodeInput, decodeInput } from './net.js';
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
const Q = new URLSearchParams(location.search);
function toast(m, ms = 3500) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', ms); }
// ---------- audio: original synth (engine, beeps, tiny menu/race loops) ----------
const Audio8 = { ctx: null, musicTimer: null, engineNodes: null,
  init() { if (this.ctx) return; try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} },
  beep(f = 440, d = 0.12, type = 'square', g = 0.12) { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), v = this.ctx.createGain(); o.type = type; o.frequency.value = f; v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(v).connect(this.ctx.destination); o.start(t); o.stop(t + d); },
  jingle(notes) { notes.forEach((f, i) => setTimeout(() => this.beep(f, 0.16, 'square', 0.1), i * 130)); },
  music(kind) { this.stopMusic(); if (!this.ctx || kind === 'off') return;
    const seq = kind === 'race' ? [392, 523, 659, 784, 659, 523, 440, 523] : [330, 392, 494, 392, 330, 294, 330, 392];
    let i = 0; this.musicTimer = setInterval(() => this.beep(seq[i++ % seq.length], 0.14, 'triangle', 0.045), kind === 'race' ? 190 : 260); },
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; },
  engine(on, rpm = 0) { if (!this.ctx) return;
    if (on && !this.engineNodes) { const o = this.ctx.createOscillator(), v = this.ctx.createGain(); o.type = 'sawtooth'; v.gain.value = 0.03; o.connect(v).connect(this.ctx.destination); o.start(); this.engineNodes = { o, v }; }
    if (this.engineNodes) { this.engineNodes.o.frequency.value = 55 + rpm * 90; if (!on) { try { this.engineNodes.o.stop(); } catch {} this.engineNodes = null; } } },
};
window.addEventListener('pointerdown', () => Audio8.init(), { once: true });
// ---------- input ----------
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); Audio8.init(); });
addEventListener('keyup', e => keys[e.code] = false);
const touchState = { steer: 0, down: {} };
function isTouch() { return Q.has('touch') || (('ontouchstart' in window) || navigator.maxTouchPoints > 0); }
function pollInput(player) {
  const p2 = player === 1;
  let steer = 0;
  if (!p2) { if (keys.ArrowLeft || keys.KeyA) steer -= 1; if (keys.ArrowRight || keys.KeyD) steer += 1; steer += touchState.steer; }
  else { if (keys.KeyJ) steer -= 1; if (keys.KeyL) steer += 1; }
  const gp = navigator.getGamepads?.()[player];
  let accel = p2 ? !!keys.KeyI : !!(keys.ArrowUp || keys.KeyW || touchState.down.A);
  let brake = p2 ? !!keys.KeyK : !!(keys.ArrowDown || keys.KeyS || touchState.down.B);
  let drift = p2 ? !!keys.KeyU : !!(keys.Space || keys.ShiftRight || keys.KeyE || touchState.down.R);
  let item = p2 ? !!keys.KeyO : !!(keys.KeyQ || keys.Enter || touchState.down.Z);
  if (gp) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.15) steer += ax; accel ||= !!(gp.buttons[0]?.pressed || gp.buttons[7]?.pressed); brake ||= !!(gp.buttons[1]?.pressed || gp.buttons[6]?.pressed); drift ||= !!(gp.buttons[5]?.pressed || gp.buttons[4]?.pressed); item ||= !!(gp.buttons[2]?.pressed || gp.buttons[3]?.pressed); }
  return { steer: clamp(steer, -1, 1), accel, brake, drift, item };
}
function mountTouch() {
  if (!isTouch() || document.querySelector('#touch .zone')) return;
  const root = $('#touch'); const zone = document.createElement('div'); zone.className = 'zone'; root.appendChild(zone);
  const defs = [['A', 'A', 84, 8, 22, '#2f6bff'], ['B', 'B', 70, 24, 6, '#2fb84a'], ['R', 'DRIFT', 64, 3, 44, '#9a5ad8'], ['Z', 'ITEM', 64, 20, 42, '#8a8a8a']];
  for (const [id, label, size, right, bottom, color] of defs) {
    const b = document.createElement('div'); b.className = 'tbtn'; b.textContent = label;
    Object.assign(b.style, { width: size + 'px', height: size + 'px', right: right + 'vw', bottom: bottom + 'vh', background: color, fontSize: label.length > 1 ? '13px' : '26px' });
    const on = e => { e.preventDefault(); touchState.down[id] = true; b.classList.add('on'); navigator.vibrate?.(8); };
    const off = e => { e.preventDefault(); touchState.down[id] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
    root.appendChild(b);
  }
  if (window.nipplejs) { const nip = nipplejs.create({ zone, mode: 'dynamic', color: 'white', size: 130, threshold: 0.05 });
    nip.on('move', (e, d) => { const k = Math.min(1, (d.distance || 0) / 55); touchState.steer = Math.cos(d.angle?.radian || 0) * k; });
    nip.on('end', () => touchState.steer = 0); }
  document.addEventListener('contextmenu', e => e.preventDefault());
}
// ---------- app / flow state ----------
const app = { mode: 'gp', players: 1, engine: '100cc', cup: 'mushroom', track: 'luigi', arena: 'donut',
  chars: ['mario', 'luigi'], gp: null, race: null, net: null, paused: false };
const ui = $('#ui');
function screen(html, checker = false) { ui.innerHTML = `<div class="screen ${checker ? 'checker' : ''}">${html}</div>`; $('#hud').classList.add('hidden'); $('#touch').style.display = 'none'; return ui.firstElementChild; }
function hideScreens() { ui.innerHTML = ''; $('#hud').classList.remove('hidden'); $('#touch').style.display = isTouch() ? '' : 'none'; }
const btn = (label, fn, cls = '') => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.innerHTML = label; b.onclick = () => { Audio8.init(); Audio8.beep(660, 0.07); fn(); }; return b; };
function faceEmoji(id) { return { mario: '🧢', luigi: '💚', peach: '👑', toad: '🍄', yoshi: '🦖', dk: '🦍', wario: '🧄', bowser: '🐢' }[id] || '🏎'; }
function itemEmoji(id) { return { banana: '🍌', bunch: '🍌', green: '🟢', tripleGreen: '🟢', red: '🔴', tripleRed: '🔴', spiny: '🔵', fake: '❔', mushroom: '🍄', tripleMushroom: '🍄', golden: '🌟', lightning: '⚡', star: '⭐', boo: '👻' }[id] || '❓'; }
// ---------- menus ----------
function showTitle() {
  Audio8.music('off'); app.race?.dispose(); app.race = null;
  // attract mode: a demo race runs behind the title, like the original
  try { app.mode = 'vs'; app.players = 1; app.engine = '100cc'; const keepChars = app.chars; app.chars = ['mario', 'luigi'];
    startRaceLocal('luigi', { demo: true, seed: 2026, quiet: true }); app.chars = keepChars;
    if (app.race) app.race.onFinish = () => { if (document.querySelector('.logo')) showTitle(); };
  } catch (e) { console.warn('attract demo unavailable', e); }
  const s = screen(`<h1 class="logo">KART 64</h1><div class="sub">A from-scratch fan recreation of the 1996 N64 classic — original art &amp; sound, no ROM.<br>16 courses · 4 battle arenas · 8 racers · online rooms · phone controls</div>`, true);
  s.style.background = 'linear-gradient(rgba(8,8,36,.62), rgba(8,8,36,.12) 38%, rgba(8,8,36,.12) 62%, rgba(8,8,36,.62))';
  s.append(btn('▶ PRESS START', showMode, 'green'));
  const roomCode = (Q.get('room') || '').toUpperCase();
  if (/^[A-Z]{4}$/.test(roomCode)) s.append(btn(`🌐 JOIN ROOM ${roomCode}`, () => showOnline(roomCode), 'alt'));
  s.insertAdjacentHTML('beforeend', `<div class="kbd">Arrows/WASD drive · SPACE drift/hop · Q item · P2: IJKL + U/O · Gamepad supported<br>Phone: left stick steers, A/B/DRIFT/ITEM buttons on the right</div>`);
}
function showMode() {
  if (app.race?.demo) { app.race.dispose(); app.race = null; }
  const s = screen(`<h2>SELECT MODE</h2>`);
  const modes = [['gp', '🏆 MARIO GRAND PRIX', '4-race cups vs 7 CPU'], ['tt', '⏱ TIME TRIALS', '3 laps, race your ghost'], ['vs', '🏁 VS RACE', 'Single race, pick any course'], ['battle', '🎈 BATTLE', '3 balloons, last kart standing'], ['online', '🌐 ONLINE PLAY', 'Room code + link, up to 4 friends']];
  for (const [id, label, ds] of modes) { const b = btn(`${label}<br><span style="font:700 12px Arial">${ds}</span>`, () => { if (id === 'online') return showOnline(); app.mode = id; showPlayers(); }, id === 'online' ? 'alt' : ''); s.append(b); }
  s.append(btn('◀ TITLE', showTitle, 'small alt'));
}
function showPlayers() {
  const s = screen(`<h2>HOW MANY PLAYERS?</h2><div class="sub">Local split-screen on this device. For 3–4 players use Online Play (each on their own phone).</div>`);
  s.append(btn('1 PLAYER', () => { app.players = 1; showEngine(); }, 'green'), btn('2 PLAYERS (SPLIT)', () => { app.players = 2; showEngine(); }), btn('◀ BACK', showMode, 'small alt'));
}
function showEngine() {
  if (app.mode === 'battle') return showCharSelect(0);
  const s = screen(`<h2>ENGINE CLASS</h2>`);
  for (const id of ['50cc', '100cc', '150cc', 'extra']) s.append(btn(`${ENGINES[id].label}${id === 'extra' ? ' — mirrored courses' : ''}`, () => { app.engine = id; showCharSelect(0); }, app.engine === id ? 'green sel' : ''));
  s.append(btn('◀ BACK', showPlayers, 'small alt'));
}
function showCharSelect(player) {
  const s = screen(`<h2>PLAYER ${player + 1}: CHOOSE YOUR RACER</h2>`);
  const g = document.createElement('div'); g.className = 'grid'; s.append(g);
  for (const c of CHARACTERS) {
    const st = CLASSES[c.cls]; const t = document.createElement('div'); t.className = 'tile' + (app.chars[player] === c.id ? ' sel' : '');
    const bar = (label, frac) => `<div style="display:flex;align-items:center;gap:4px;font:700 9px Arial">${label}<span style="flex:1;height:6px;background:#ffffff2a;border-radius:3px;overflow:hidden"><span style="display:block;height:100%;width:${Math.round(frac * 100)}%;background:#ffd84a"></span></span></div>`;
    t.innerHTML = `<div class="face">${faceEmoji(c.id)}</div><div class="nm" style="color:#${c.color.toString(16).padStart(6, '0')}">${c.name}</div><div class="ds">${c.cls.toUpperCase()}</div>` +
      bar('SPD', st.top / 32) + bar('ACC', st.accel / 15) + bar('HND', st.handling / 1.3) + bar('WT ', st.weight / 1.6);
    t.onclick = () => { Audio8.beep(770, 0.08); app.chars[player] = c.id; player + 1 < app.players ? showCharSelect(player + 1) : showCourseSelect(); };
    g.append(t);
  }
  s.append(btn('◀ BACK', () => player > 0 ? showCharSelect(player - 1) : showEngine(), 'small alt'));
}
function showCourseSelect() {
  if (app.mode === 'battle') {
    const s = screen(`<h2>CHOOSE ARENA</h2>`); const g = document.createElement('div'); g.className = 'grid'; s.append(g);
    for (const a of ARENAS) { const t = document.createElement('div'); t.className = 'tile'; t.innerHTML = `<div class="face">🎈</div><div class="nm">${a.name}</div>`; t.onclick = () => { app.arena = a.id; startBattleLocal(); }; g.append(t); }
    s.append(btn('◀ BACK', () => showCharSelect(app.players - 1), 'small alt')); return;
  }
  if (app.mode === 'gp') {
    const s = screen(`<h2>CHOOSE CUP — ${ENGINES[app.engine].label}</h2>`); const g = document.createElement('div'); g.className = 'grid'; s.append(g);
    for (const cup of CUPS) { const t = document.createElement('div'); t.className = 'tile'; t.innerHTML = `<div class="face">🏆</div><div class="nm">${cup.name}</div><div class="ds">${cupTracks(cup.id).map(t => t.name).join('<br>')}</div>`;
      t.onclick = () => { app.cup = cup.id; app.gp = { cup: cup.id, raceIdx: 0, points: {} }; startRaceLocal(cupTracks(cup.id)[0].id); }; g.append(t); }
    s.append(btn('◀ BACK', () => showCharSelect(app.players - 1), 'small alt')); return;
  }
  const s = screen(`<h2>CHOOSE COURSE — ${app.mode === 'tt' ? 'TIME TRIAL' : 'VS'} ${ENGINES[app.engine].label}</h2>`);
  for (const cup of CUPS) { const h = document.createElement('div'); h.className = 'sub'; h.textContent = cup.name; s.append(h);
    const g = document.createElement('div'); g.className = 'grid'; s.append(g);
    for (const tr of cupTracks(cup.id)) { const best = localStorage.getItem('kart64-best-' + tr.id);
      const t = document.createElement('div'); t.className = 'tile'; t.innerHTML = `<div class="nm">${tr.name}</div><div class="ds">${best ? 'BEST ' + fmtTime(+best) : '3 LAPS'}</div>`;
      t.onclick = () => { app.track = tr.id; startRaceLocal(tr.id); }; g.append(t); } }
  s.append(btn('◀ BACK', () => showCharSelect(app.players - 1), 'small alt'));
}
function showResults(title, rows, onNext, nextLabel) {
  Audio8.jingle([523, 659, 784, 1046]); const s = screen(`<h2>${title}</h2>`);
  const tb = document.createElement('table'); tb.innerHTML = rows; s.append(tb);
  s.append(btn(nextLabel, onNext, 'green'), btn('TITLE', showTitle, 'small alt'));
}
// ---------- 3D helpers ----------
let renderer = null;
function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ canvas: $('#gl'), antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const resize = () => renderer.setSize(innerWidth, innerHeight);
  addEventListener('resize', resize); resize(); return renderer;
}
const MAT = c => new THREE.MeshLambertMaterial({ color: c });
function box(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT(c)); m.position.set(x, y, z); return m; }
function cyl(rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), MAT(c)); m.position.set(x, y, z); return m; }
function sph(r, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), MAT(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); return m; }
function cone(r, h, c, x = 0, y = 0, z = 0, seg = 9) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), MAT(c)); m.position.set(x, y, z); return m; }
// ---- procedural canvas textures (original, N64-style tiling) ----
const TEXCACHE = {};
function canvasTex(key, size, draw, rx = 1, ry = 1) {
  if (TEXCACHE[key]) { const t = TEXCACHE[key].clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); return t; }
  const cv = document.createElement('canvas'); cv.width = cv.height = size; const g = cv.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; TEXCACHE[key] = t;
  const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); return c;
}
function noiseFill(g, S, base, spots, n = 2600, rMax = 3) {
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) { g.fillStyle = spots[Math.floor(Math.random() * spots.length)]; const r = 1 + Math.random() * rMax; g.fillRect(Math.random() * S, Math.random() * S, r, r); }
}
function texRoad(kind) {
  return canvasTex('road_' + kind, 256, (g, S) => {
    if (kind === 'checker') { const n = 8, c = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#2a4fd0' : '#e8ecf5'; g.fillRect(i * c, j * c, c, c); } g.fillStyle = '#b02020'; g.fillRect(S * 0.44, 0, S * 0.12, S); return; }
    if (kind === 'highway') { noiseFill(g, S, '#4c4c55', ['#43434c', '#585864', '#3d3d46'], 3000, 3);
      g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 5, S); g.fillRect(S - 5, 0, 5, S);
      g.fillStyle = '#f7d117'; g.fillRect(S * 0.485, 0, 4, S); g.fillRect(S * 0.515, 0, 4, S);
      g.fillStyle = '#e8e8e8'; g.fillRect(S * 0.25, 0, 4, S * 0.45); g.fillRect(S * 0.75, 0, 4, S * 0.45); return; }
    if (kind === 'rainbow') { const cols = ['#e52521', '#f08c1e', '#f7d117', '#2fae3f', '#2f6bff', '#9a5ad8']; cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(0, i * S / 6, S, S / 6 + 1); });
      g.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * S, Math.random() * S, 3, 3); return; }
    if (kind === 'planks') { g.fillStyle = '#8a6a48'; g.fillRect(0, 0, S, S); for (let j = 0; j < 6; j++) { g.fillStyle = j % 2 ? '#7d5f3f' : '#96754e'; g.fillRect(0, j * S / 6, S, S / 6 - 2); } noiseFill(g, 0, 'rgba(0,0,0,0)', []); return; }
    const conf = { asphalt: ['#5a5a62', ['#4c4c54', '#686872', '#55555e', '#71717c']], dirt: ['#a8845a', ['#96754c', '#bb9668', '#8a6a42']], sand: ['#dcbd7e', ['#cdb071', '#ecd08e', '#c2a566']], snow: ['#dfeaf6', ['#cddcee', '#ffffff', '#d4e4f4']], ice: ['#cfe8fa', ['#bcdcf6', '#e8f6ff', '#a9d2f2']] }[kind] || ['#5a5a62', ['#4c4c54', '#686872']];
    noiseFill(g, S, conf[0], conf[1], 3200, 3);
    if (kind === 'ice') { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { g.beginPath(); let x = Math.random() * S, y = Math.random() * S; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (Math.random() - .5) * 60; y += (Math.random() - .5) * 60; g.lineTo(x, y); } g.stroke(); } }
    if (kind === 'dirt' || kind === 'sand') { g.fillStyle = 'rgba(0,0,0,.13)'; g.fillRect(S * .18, 0, S * .16, S); g.fillRect(S * .66, 0, S * .16, S); }
    // edge lines (u = across road)
    if (kind === 'asphalt') { g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, 5, S); g.fillRect(S - 5, 0, 5, S); }
  });
}
function texGround(kind) {
  return canvasTex('gnd_' + kind, 256, (g, S) => {
    const conf = { grass: ['#4ea63e', ['#439435', '#5ab54a', '#3c842f', '#67c255']], sand: ['#e3c382', ['#d4b273', '#f0d292', '#c8a869']], snow: ['#eef4fc', ['#dde9f6', '#ffffff']], dirt: ['#8a613c', ['#7a5433', '#9c7147']], dark: ['#2e2e38', ['#26262f', '#3a3a46']], lava: ['#e85a17', ['#f07a2a', '#ffb03a', '#c93e0c']] }[kind] || ['#4ea63e', ['#439435', '#5ab54a']];
    noiseFill(g, S, conf[0], conf[1], 3800, 4);
    if (kind === 'grass') { g.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 14; i++) g.fillRect(Math.random() * S, Math.random() * S, 3, 3); }
    if (kind === 'lava') { g.strokeStyle = '#ffd84a'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(Math.random() * S, 0); g.lineTo(Math.random() * S, S); g.stroke(); } }
  }, 48, 48);
}
function texBrick() { return canvasTex('brick', 256, (g, S) => { g.fillStyle = '#5c6650'; g.fillRect(0, 0, S, S); const bh = S / 8, bw = S / 4;
  for (let j = 0; j < 8; j++) for (let i = -1; i < 5; i++) { g.fillStyle = ['#6a7560', '#626d58', '#71806a'][((i + j) % 3 + 3) % 3]; const x = i * bw + (j % 2 ? bw / 2 : 0); g.fillRect(x + 2, j * bh + 2, bw - 4, bh - 4); } }); }
function texRock() { return canvasTex('rock', 256, (g, S) => { noiseFill(g, S, '#8a6a4a', ['#7a5c3e', '#9c7c56', '#6b4f35'], 2400, 5);
  for (let j = 0; j < 6; j++) { g.fillStyle = 'rgba(60,40,20,.35)'; g.fillRect(0, j * S / 6 + Math.random() * 8, S, 4); } }); }
function texCrowd() { return canvasTex('crowd', 256, (g, S) => { g.fillStyle = '#3a3a44'; g.fillRect(0, 0, S, S); const cols = ['#e52521', '#2f6bff', '#f7d117', '#2fae3f', '#ffffff', '#f7a8c4', '#f08c1e'];
  for (let i = 0; i < 1500; i++) { g.fillStyle = cols[Math.floor(Math.random() * cols.length)]; g.fillRect(Math.random() * S, Math.random() * S, 4, 5); } }); }
function texSign(text, bg = '#f2f2f2', fg = '#2030a0') {
  return canvasTex('sign_' + text + bg, 256, (g, S) => { g.fillStyle = bg; g.fillRect(0, 0, S, S); g.strokeStyle = fg; g.lineWidth = 10; g.strokeRect(6, 6, S - 12, S - 12);
    g.fillStyle = fg; g.font = `italic 900 ${Math.min(58, Math.floor(430 / Math.max(4, text.length)))}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, S / 2, S / 2); });
}
function texArrow() { return canvasTex('arrow', 128, (g, S) => { g.fillStyle = '#f7d117'; g.fillRect(0, 0, S, S); g.fillStyle = '#141414';
  for (const o of [18, 58]) { g.beginPath(); g.moveTo(o, 24); g.lineTo(o + 44, S / 2); g.lineTo(o, S - 24); g.lineTo(o + 16, S / 2); g.closePath(); g.fill(); } }); }
function texItemBox(fake = false) { return canvasTex('itembox' + (fake ? 'f' : ''), 128, (g, S) => {
  const grad = g.createLinearGradient(0, 0, S, S); ['#e52521', '#f7d117', '#2fae3f', '#2f6bff', '#9a5ad8'].forEach((c, i) => grad.addColorStop(i / 4, c));
  g.fillStyle = fake ? '#c93e2a' : grad; g.fillRect(0, 0, S, S); g.strokeStyle = '#fff'; g.lineWidth = 6; g.strokeRect(5, 5, S - 10, S - 10);
  g.fillStyle = '#fff'; g.font = '900 84px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (fake) { g.save(); g.translate(S / 2, S / 2); g.rotate(Math.PI); g.fillText('?', 0, 4); g.restore(); } else g.fillText('?', S / 2, S / 2 + 4); }); }
function texThwompFace() { return canvasTex('thwomp', 128, (g, S) => { g.fillStyle = '#7d8494'; g.fillRect(0, 0, S, S); noiseFill(g, S, 'rgba(0,0,0,0)', [], 0);
  g.fillStyle = '#fff'; g.fillRect(22, 30, 26, 26); g.fillRect(80, 30, 26, 26); g.fillStyle = '#c22'; g.fillRect(30, 40, 12, 12); g.fillRect(88, 40, 12, 12);
  g.fillStyle = '#141414'; g.fillRect(16, 18, 38, 10); g.fillRect(74, 18, 38, 10); g.fillRect(28, 82, 72, 26); g.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) { g.beginPath(); const x = 32 + i * 14; g.moveTo(x, 82); g.lineTo(x + 7, 96); g.lineTo(x + 14, 82); g.fill(); } }); }
function matTex(tex, color = 0xffffff) { return new THREE.MeshLambertMaterial({ map: tex, color }); }

function buildKartMesh(char) {
  const g = new THREE.Group(); const c = CHARACTERS.find(x => x.id === char) || CHARACTERS[0];
  const col = c.color;
  // ---- pipe-frame kart (original design echoing the N64 pipe frame) ----
  const kart = new THREE.Group(); g.add(kart);
  kart.add(box(1.1, 0.16, 1.9, 0x2b2b30, 0, 0.42, 0.1)); // floor pan
  for (const sx of [-0.62, 0.62]) { const rail = cyl(0.09, 0.09, 2.3, col, sx, 0.55, 0, 8); rail.rotation.x = Math.PI / 2; kart.add(rail); }
  const noseB = cyl(0.09, 0.09, 1.35, col, 0, 0.55, -1.12, 8); noseB.rotation.z = Math.PI / 2; kart.add(noseB);
  const rearB = cyl(0.09, 0.09, 1.35, col, 0, 0.58, 1.12, 8); rearB.rotation.z = Math.PI / 2; kart.add(rearB);
  const nose = box(0.85, 0.3, 0.55, col, 0, 0.62, -0.92); nose.rotation.x = 0.25; kart.add(nose);
  const body = box(1.25, 0.55, 0.5, col, 0, 0.95, 0.78); body.rotation.x = -0.18; kart.add(body); // seat back (userData.body)
  kart.add(box(1.05, 0.18, 0.75, 0x33333a, 0, 0.66, 0.42)); // seat cushion
  kart.add(box(0.7, 0.42, 0.5, 0x8a8f99, 0, 0.72, 1.02)); // engine block
  for (const sx of [-0.28, 0.28]) { const ex = cyl(0.085, 0.085, 0.62, 0xb9bec9, sx, 1.05, 1.16, 8); ex.rotation.x = 0.5; kart.add(ex);
    kart.add(cyl(0.1, 0.1, 0.1, 0x3a3a40, sx, 1.22, 1.3, 8)); }
  const column = cyl(0.06, 0.06, 0.75, 0x555b66, 0, 0.95, -0.28, 8); column.rotation.x = 0.65; kart.add(column);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.055, 8, 18), MAT(0x1d1d22)); wheel.position.set(0, 1.14, -0.42); wheel.rotation.x = 0.65; kart.add(wheel);
  const wheels = [], frontPivots = [];
  const mkWheel = (x, z, r, w, front) => { const pivot = new THREE.Group(); pivot.position.set(x, r, z); kart.add(pivot);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), MAT(0x17171b)); tire.rotation.z = Math.PI / 2; pivot.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.45, r * 0.45, w + 0.04, 10), MAT(0xd8dce4)); hub.rotation.z = Math.PI / 2; pivot.add(hub);
    wheels.push(pivot); if (front) frontPivots.push(pivot); return pivot; };
  mkWheel(-0.82, -0.82, 0.34, 0.3, true); mkWheel(0.82, -0.82, 0.34, 0.3, true);
  mkWheel(-0.88, 0.82, 0.48, 0.42, false); mkWheel(0.88, 0.82, 0.48, 0.42, false);
  // blob shadow (N64 racers sit on one)
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.45, 18), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.06; shadow.scale.set(1, 1.35, 1); g.add(shadow);
  // ---- driver: big-headed, seated, arms to the wheel ----
  const d = new THREE.Group(); d.position.set(0, 0.55, 0.42); g.add(d);
  const skin = c.skin;
  const suit = { mario: 0x2456c8, luigi: 0x2456c8, peach: 0xf78fb8, toad: 0x2456c8, yoshi: 0x52c234, dk: 0x8a5a2b, wario: 0x7a4fc0, bowser: 0xf2b13a }[char];
  const sleeves = { mario: 0xe52521, luigi: 0x2fae3f, peach: 0xf78fb8, toad: 0xf2f2f2, yoshi: 0x52c234, dk: 0x8a5a2b, wario: 0xf7d117, bowser: 0xf2b13a }[char];
  const big = (c.cls === 'heavy' ? 1.28 : c.cls === 'light' ? 1.0 : 1.12) * 1.12;
  d.scale.setScalar(big);
  const torso = char === 'peach' ? cone(0.55, 0.95, suit, 0, 0.55, 0, 12) : sph(0.52, suit, 0, 0.58, 0, 1, 1.05, 0.85);
  d.add(torso);
  if (char === 'yoshi') { d.add(sph(0.4, 0xffffff, 0, 0.5, -0.22, 0.85, 0.95, 0.55)); d.add(box(0.62, 0.16, 0.5, 0xe5452a, 0, 0.95, 0.3)); const tail = cone(0.18, 0.6, 0x52c234, 0, 0.35, 0.62); tail.rotation.x = -0.9; d.add(tail); }
  if (char === 'dk') d.add(box(0.2, 0.5, 0.08, 0xe52521, 0, 0.52, -0.42)); // tie
  if (char === 'bowser') { const shell = sph(0.55, 0x2fae3f, 0, 0.62, 0.34, 1, 1.05, 0.6); d.add(shell);
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 2; j++) d.add(cone(0.11, 0.3, 0xffffff, i * 0.3, 0.5 + j * 0.34, 0.62)); }
  // arms forward to wheel + legs
  for (const sx of [-1, 1]) {
    const arm = cyl(0.13, 0.11, 0.72, sleeves, sx * 0.44, 0.72, -0.34, 8); arm.rotation.x = 1.15; arm.rotation.z = sx * 0.35; d.add(arm);
    d.add(sph(0.15, char === 'dk' ? 0xd9a066 : 0xffffff, sx * 0.3, 0.58, -0.66)); // glove/hand on wheel
    const leg = cyl(0.14, 0.12, 0.62, char === 'peach' ? suit : suit, sx * 0.28, 0.14, -0.4, 8); leg.rotation.x = 1.35; d.add(leg);
    d.add(box(0.24, 0.14, 0.4, char === 'yoshi' ? 0xf08c1e : 0x6b4423, sx * 0.3, 0.02, -0.72)); // shoe
  }
  // head + character features
  const headG = new THREE.Group(); headG.position.set(0, 1.32, -0.02); d.add(headG);
  if (char === 'yoshi') {
    headG.add(sph(0.4, 0x52c234, 0, 0.02, 0.08)); headG.add(sph(0.3, 0x6fd44e, 0, -0.05, -0.38, 0.95, 0.7, 1.15)); // snout
    headG.add(sph(0.13, 0xffffff, -0.16, 0.3, -0.1)); headG.add(sph(0.13, 0xffffff, 0.16, 0.3, -0.1));
    headG.add(sph(0.07, 0x141414, -0.16, 0.34, -0.2)); headG.add(sph(0.07, 0x141414, 0.16, 0.34, -0.2));
    headG.add(sph(0.17, 0xffffff, -0.3, -0.08, -0.22)); headG.add(sph(0.17, 0xffffff, 0.3, -0.08, -0.22));
  } else if (char === 'toad') {
    headG.add(sph(0.34, skin, 0, -0.28, 0));
    const cap = sph(0.62, 0xffffff, 0, 0.16, 0, 1, 0.72, 1); headG.add(cap);
    for (const [x, y, z] of [[0, 0.52, -0.18], [-0.4, 0.3, -0.3], [0.42, 0.28, -0.26], [-0.42, 0.32, 0.3], [0.4, 0.34, 0.32]]) headG.add(sph(0.15, 0xe52521, x, y, z, 1, 0.5, 1));
    headG.add(sph(0.05, 0x141414, -0.12, -0.24, -0.3)); headG.add(sph(0.05, 0x141414, 0.12, -0.24, -0.3));
  } else if (char === 'bowser') {
    headG.add(sph(0.44, 0xf2b13a, 0, 0, 0.05)); headG.add(sph(0.3, 0xffe6a3, 0, -0.14, -0.34, 1.05, 0.7, 0.8)); // muzzle
    for (const sx of [-1, 1]) { const horn = cone(0.11, 0.42, 0xffffff, sx * 0.38, 0.34, 0.1); horn.rotation.z = -sx * 0.5; headG.add(horn); }
    headG.add(cone(0.16, 0.4, 0xe52521, 0, 0.44, 0.12)); // hair tuft
    headG.add(sph(0.06, 0x141414, -0.16, 0.08, -0.4)); headG.add(sph(0.06, 0x141414, 0.16, 0.08, -0.4));
    headG.add(box(0.44, 0.09, 0.05, 0x8a3a1a, 0, 0.2, -0.38)); // brow
  } else if (char === 'dk') {
    headG.add(sph(0.46, 0x8a5a2b, 0, 0, 0.06)); headG.add(sph(0.3, 0xd9a066, 0, -0.16, -0.3, 1.1, 0.75, 0.8));
    headG.add(box(0.56, 0.14, 0.2, 0xd9a066, 0, 0.16, -0.32)); headG.add(cone(0.14, 0.3, 0x8a5a2b, 0, 0.46, 0.05));
    headG.add(sph(0.06, 0x141414, -0.15, 0.04, -0.44)); headG.add(sph(0.06, 0x141414, 0.15, 0.04, -0.44));
  } else { // plumbers, peach, wario
    headG.add(sph(0.42, skin, 0, 0, 0));
    headG.add(sph(0.13, skin, 0, -0.06, -0.42)); // nose
    headG.add(sph(0.055, 0x141414, -0.15, 0.06, -0.38)); headG.add(sph(0.055, 0x141414, 0.15, 0.06, -0.38));
    if (char === 'peach') {
      headG.add(sph(0.46, 0xffd84a, 0, 0.1, 0.14, 1.02, 1.05, 1.02)); headG.add(sph(0.4, skin, 0, -0.02, -0.12)); // hair + face front
      headG.add(sph(0.12, skin, 0, -0.08, -0.46)); headG.add(sph(0.05, 0x2456c8, -0.14, 0.04, -0.44)); headG.add(sph(0.05, 0x2456c8, 0.14, 0.04, -0.44));
      const crown = cyl(0.2, 0.23, 0.2, 0xffd84a, 0, 0.5, 0, 10); headG.add(crown);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; headG.add(cone(0.05, 0.16, 0xffd84a, Math.cos(a) * 0.18, 0.64, Math.sin(a) * 0.18)); }
      headG.add(sph(0.07, 0xe52521, 0, 0.52, -0.2));
    } else {
      const capCol = c.hat;
      const dome = sph(0.44, capCol, 0, 0.14, 0.03, 1, 0.72, 1); headG.add(dome);
      const brim = cyl(0.3, 0.34, 0.06, capCol, 0, 0.16, -0.42, 12); brim.scale.set(1.15, 1, 1); headG.add(brim);
      const badge = cyl(0.12, 0.12, 0.05, 0xffffff, 0, 0.3, -0.39, 12); badge.rotation.x = Math.PI / 2 - 0.35; headG.add(badge);
      if (char === 'wario') { headG.add(sph(0.19, 0xf7a8c4, 0, -0.08, -0.46));
        for (const sx of [-1, 1]) { const mz = box(0.24, 0.07, 0.06, 0x2b2b30, sx * 0.18, -0.22, -0.42); mz.rotation.y = sx * 0.5; mz.rotation.z = sx * 0.45; headG.add(mz); } }
      else { const mo = sph(0.2, 0x3a2617, 0, -0.2, -0.4, 1.5, 0.5, 0.6); headG.add(mo); } // mustache
      // sideburn hair
      headG.add(box(0.08, 0.24, 0.2, 0x5a3a1e, -0.42, 0.02, 0.02)); headG.add(box(0.08, 0.24, 0.2, 0x5a3a1e, 0.42, 0.02, 0.02));
    }
  }
  const balloons = new THREE.Group(); g.add(balloons);
  const orbit = new THREE.Group(); g.add(orbit);
  g.userData = { wheels, frontPivots, balloons, orbit, body, driver: d, steerWheel: wheel, shadow };
  return g;
}
function makeShellMesh(color) {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.58, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT(color)); dome.position.y = 0.12; g.add(dome);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.13, 8, 16), MAT(0xf2f2f2)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.1; g.add(rim);
  g.add(cyl(0.3, 0.36, 0.16, 0xf7e8c9, 0, 0.02, 0, 10));
  return g;
}
function makeBananaMesh() {
  const m = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.17, 7, 12, Math.PI * 1.25), MAT(0xf7d117));
  m.rotation.set(Math.PI / 2.3, 0, 0.6); const g = new THREE.Group(); g.add(m); m.position.y = 0.25; return g;
}
function setBalloons(mesh, n, color) {
  const b = mesh.userData.balloons; b.clear();
  for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), MAT(color)); const a = i / Math.max(1, n) * Math.PI * 2; s.position.set(Math.cos(a) * 1.1, 1.5, Math.sin(a) * 1.1); b.add(s); }
}
function buildTrackScene(tr, mirror) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(tr.sky);
  scene.fog = new THREE.Fog(tr.fog, 130, 680);
  scene.add(new THREE.HemisphereLight(tr.sky, tr.ground, 0.85));
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.25); sun.position.set(60, 120, 40); scene.add(sun);
  let pts = tr.points.map(p => new THREE.Vector3(mirror ? -p[0] : p[0], p[1], p[2]));
  if (mirror) pts = pts.reverse();
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const N = 360, samples = [];
  for (let i = 0; i < N; i++) { const t = i / N, pos = curve.getPointAt(t), tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
    samples.push({ pos, tan, side: new THREE.Vector3(-tan.z, 0, tan.x) }); }
  let length = 0; const segLen = [];
  for (let i = 0; i < N; i++) { const d = samples[i].pos.distanceTo(samples[(i + 1) % N].pos); segLen.push(d); length += d; }
  // surface kinds per course
  const roadKind = tr.rainbow ? 'rainbow' : tr.id === 'bowser' ? 'checker' : tr.id === 'banshee' ? 'planks' : tr.id === 'turnpike' ? 'highway'
    : tr.id === 'farm' ? 'dirt' : tr.off === 'snow' ? 'snow' : tr.off === 'ice' ? 'ice' : tr.off === 'sand' ? 'sand' : tr.off === 'dirt' ? 'dirt' : 'asphalt';
  const groundKind = tr.off === 'snow' || tr.off === 'ice' ? 'snow' : tr.off === 'sand' ? 'sand' : tr.off === 'dirt' ? 'dirt' : tr.off === 'lava' ? 'lava' : tr.off === 'water' ? 'dark' : 'grass';
  const mkRibbon = (halfW, yOff, mat, vScale = 9, uScale = 1) => {
    const verts = [], uvs = [], idx = []; let v = 0;
    for (let i = 0; i <= N; i++) { const sm = samples[i % N];
      for (const sgn of [-1, 1]) { const pp = sm.pos.clone().addScaledVector(sm.side, sgn * halfW); verts.push(pp.x, sm.pos.y + yOff, pp.z); uvs.push(sgn < 0 ? 0 : uScale, v); }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); v += segLen[i % N] / vScale; } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, mat);
  };
  // kerbs: red/white (or themed) alternating blocks hugging the road edge
  const kerbTex = canvasTex('kerb_' + tr.edge.toString(16), 64, (g, S) => { g.fillStyle = '#f2f2f2'; g.fillRect(0, 0, S, S); g.fillStyle = '#' + tr.edge.toString(16).padStart(6, '0'); g.fillRect(0, 0, S, S / 2); });
  kerbTex.repeat.set(1, 1);
  scene.add(mkRibbon(tr.width / 2 + 1.1, -0.05, matTex(kerbTex), 7));
  const roadTex = texRoad(roadKind);
  scene.add(mkRibbon(tr.width / 2, 0.03, matTex(roadTex), roadKind === 'checker' ? 7 : 10, roadKind === 'checker' ? 2 : 1));
  // start line chequers
  const s0 = samples[0];
  const startTex = canvasTex('startline', 128, (g, S) => { const n = 8, c = S / n; for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * c, j * S / 2, c, S / 2); } });
  const start = new THREE.Mesh(new THREE.BoxGeometry(tr.width, 0.09, 2.6), matTex(startTex));
  start.position.set(s0.pos.x, s0.pos.y + 0.09, s0.pos.z); start.rotation.y = Math.atan2(s0.tan.x, s0.tan.z); scene.add(start);
  // textured ground (big plane follows lowest point; raised infield plateau keeps off-road areas near road height)
  const minY = Math.min(...samples.map(sm => sm.pos.y));
  const groundY = tr.fall ? minY - 14 : minY - 0.25;
  if (!tr.rainbow) { const gt = texGround(groundKind);
    const gnd = new THREE.Mesh(new THREE.PlaneGeometry(1700, 1700), matTex(gt, tr.fall && tr.off === 'water' ? 0x7fb8e8 : 0xffffff));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = groundY; scene.add(gnd);
    if (!tr.fall) { // soft infield/outfield apron at road height so terrain does not float over a flat sheet
      scene.add(mkRibbon(tr.width / 2 + 30, -0.35, matTex(texGround(groundKind)), 26)); }
  } else { const starGeo = new THREE.BufferGeometry(); const sv = []; const r = mulberry(7);
    for (let i = 0; i < 900; i++) sv.push((r() - 0.5) * 1500, r() * 300 - 70, (r() - 0.5) * 1500);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, fog: false }))); }
  // continuous guardrails (walled courses): grey rail with a coloured top stripe; brick for the castle
  if (tr.wall) {
    const wallH = tr.id === 'bowser' ? 3.4 : 1.0;
    const wallMat = tr.id === 'bowser' ? matTex(texBrick()) : matTex(canvasTex('rail_' + tr.edge.toString(16), 128, (g, S) => {
      g.fillStyle = '#c8ccd4'; g.fillRect(0, 0, S, S); g.fillStyle = '#9aa0ab'; g.fillRect(0, S * 0.45, S, S * 0.18);
      g.fillStyle = '#' + tr.edge.toString(16).padStart(6, '0'); g.fillRect(0, 0, S, S * 0.22); g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < S; x += 32) g.fillRect(x, S * 0.3, 5, S * 0.7); }));
    const mkWall = sgn => { const verts = [], uvs = [], idx = []; let v = 0;
      for (let i = 0; i <= N; i++) { const sm = samples[i % N]; const pp = sm.pos.clone().addScaledVector(sm.side, sgn * (tr.width / 2 + 1.55));
        verts.push(pp.x, sm.pos.y - 0.2, pp.z, pp.x, sm.pos.y + wallH, pp.z); uvs.push(v, 0, v, 1);
        if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); v += segLen[i % N] / 8; } }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
      return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: wallMat.map, side: THREE.DoubleSide })); };
    scene.add(mkWall(-1)); scene.add(mkWall(1));
  }
  buildScenery(scene, tr, samples, N, length, groundY);
  return { scene, samples, N, length, groundY };
}
function buildScenery(scene, tr, samples, N, length, groundY) {
  const rng = mulberry(tr.id.length * 977 + 13);
  const at = (frac, lat) => { const sm = samples[Math.floor(((frac % 1) + 1) % 1 * N) % N]; const pp = sm.pos.clone().addScaledVector(sm.side, lat); return { x: pp.x, y: sm.pos.y, z: pp.z, sm }; };
  const groundAt = sm => tr.fall ? Math.max(groundY, sm.pos.y - 0.3) : sm.pos.y - 0.3;
  // clouds (flat ovals like the original) + horizon hills
  if (!tr.rainbow && tr.id !== 'bowser' && tr.id !== 'banshee') {
    for (let i = 0; i < 14; i++) { const cl = new THREE.Group(); const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
      for (let j = 0; j < 3; j++) { const b = new THREE.Mesh(new THREE.SphereGeometry(7 + rng() * 6, 10, 7), cm); b.scale.set(1.5, 0.32, 1); b.position.x = j * 8 - 8; cl.add(b); }
      cl.position.set((rng() - 0.5) * 900, 75 + rng() * 45, (rng() - 0.5) * 900); scene.add(cl); }
    const hillCol = tr.off === 'snow' || tr.off === 'ice' ? 0xdcebf8 : tr.off === 'sand' ? 0xc9a05e : tr.off === 'dirt' ? 0x8a6238 : tr.id === 'bowser' ? 0x4a3040 : tr.id === 'banshee' ? 0x27355a : 0x3f9142;
    for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2 + rng() * 0.35, R = 430 + rng() * 150;
      const h = new THREE.Mesh(new THREE.ConeGeometry(80 + rng() * 60, 34 + rng() * 36, 9), MAT(hillCol)); h.scale.y = 0.62;
      h.position.set(Math.cos(a) * R, groundY + 2, Math.sin(a) * R); scene.add(h); }
  } else if (tr.rainbow) { // floating planets + star rings
    for (let i = 0; i < 7; i++) { const pl = sph(6 + rng() * 9, [0xf08c1e, 0x9a5ad8, 0x2f6bff, 0xe5452a][i % 4], (rng() - 0.5) * 1000, 60 + rng() * 110, (rng() - 0.5) * 1000); scene.add(pl); }
  }
  // start banner arch + cloud referee with the start light
  {
    const s0 = samples[0]; const rotY = Math.atan2(s0.tan.x, s0.tan.z);
    const arch = new THREE.Group(); arch.position.copy(s0.pos); arch.rotation.y = rotY;
    for (const sx of [-1, 1]) arch.add(cyl(0.35, 0.45, 9, (sx < 0 ? 0xe52521 : 0x2f6bff), sx * (tr.width / 2 + 1.5), 4.5, 0, 8));
    const banner = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 4, 2.4, 0.4), matTex(texSign(tr.name.toUpperCase(), '#ffffff', '#c81e1e')));
    banner.position.y = 8.6; banner.rotation.y = Math.PI; arch.add(banner); scene.add(arch);
    const ref = new THREE.Group(); const rp = s0.pos.clone().addScaledVector(s0.side, -(tr.width / 2 + 4.5)); ref.position.set(rp.x, s0.pos.y + 7.5, rp.z); ref.rotation.y = rotY;
    ref.add(sph(1.5, 0xffffff, 0, 0, 0, 1.4, 0.65, 1)); ref.add(sph(1.0, 0xffffff, -1.2, -0.15, 0.2)); ref.add(sph(1.0, 0xffffff, 1.2, -0.15, -0.2));
    ref.add(sph(0.55, 0xffe0bd, 0, 0.95, 0)); ref.add(cyl(0.42, 0.5, 0.7, 0x2fae3f, 0, 0.45, 0, 8));
    ref.add(cyl(0.3, 0.3, 0.14, 0x3a3a40, -0.2, 1.12, -0.42, 10)).children;
    const gog = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12), MAT(0x3a3a40)); gog.position.set(-0.22, 1.05, -0.48); ref.add(gog);
    const pole = cyl(0.05, 0.05, 4.6, 0x8a6a34, 1.4, -0.6, -0.6, 6); pole.rotation.z = 0.35; ref.add(pole);
    ref.add(box(1.1, 2.6, 0.5, 0x2b2b30, 2.2, -2.4, -0.8));
    for (let i = 0; i < 3; i++) { const lamp = cyl(0.34, 0.34, 0.18, 0xff352e, 2.2, -1.6 - i * 0.75, -1.08, 12); lamp.rotation.x = Math.PI / 2; ref.add(lamp); }
    ref.userData.bob = true; scene.add(ref); scene.userData.referee = ref;
  }
  // billboards + chevron signs around the lap
  const signWords = ['KART 64', 'TURBO', 'STAR OIL', 'GO! GO!', 'GRAND PRIX', 'ITEM', 'SPEED', 'KART 64'];
  signWords.forEach((w, i) => { const f = 0.08 + i * 0.115, sideSign = i % 2 ? 1 : -1; const { x, y, z, sm } = at(f, sideSign * (tr.width / 2 + 6.5));
    const grp = new THREE.Group(); grp.position.set(x, groundAt(sm), z); grp.rotation.y = Math.atan2(sm.tan.x, sm.tan.z) + (sideSign > 0 ? Math.PI : 0);
    grp.add(box(0.3, 3.4, 0.3, 0x6a6a72, -2.2, 1.7, 0)); grp.add(box(0.3, 3.4, 0.3, 0x6a6a72, 2.2, 1.7, 0));
    const board = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.6, 0.25), matTex(texSign(w, ['#ffffff', '#ffd84a', '#bfe3ff'][i % 3], ['#2030a0', '#c81e1e', '#14551f'][i % 3])));
    board.position.y = 4.2; grp.add(board); scene.add(grp); });
  for (let i = 0; i < 7; i++) { const f = 0.05 + i * 0.14; const a = samples[Math.floor(f * N) % N], b = samples[Math.floor(f * N + 26) % N];
    let turn = Math.atan2(b.tan.x, b.tan.z) - Math.atan2(a.tan.x, a.tan.z); while (turn > Math.PI) turn -= Math.PI * 2; while (turn < -Math.PI) turn += Math.PI * 2;
    if (Math.abs(turn) < 0.35) continue;
    const sgn = turn > 0 ? -1 : 1; const { x, y, z, sm } = at(f, sgn * (tr.width / 2 + 2.2));
    const grp = new THREE.Group(); grp.position.set(x, sm.pos.y, z); grp.rotation.y = Math.atan2(sm.tan.x, sm.tan.z) + Math.PI; if (sgn > 0) grp.scale.x = -1;
    grp.add(box(0.22, 2, 0.22, 0x555b66, 0, 1, 0));
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 0.18), matTex(texArrow())); board.position.y = 2.9; grp.add(board); scene.add(grp); }
  // rich roadside decor
  const makeDecor = () => {
    const kind = tr.decor; const m = new THREE.Group();
    if (kind === 'tree') { m.add(cyl(0.24, 0.34, 2.0, 0x7a4a22, 0, 1.0, 0, 7)); m.add(sph(1.65, 0x2f8f2f, 0, 3.0, 0)); m.add(sph(1.15, 0x37a838, 0.9, 2.5, 0.4)); m.add(sph(1.0, 0x2a8029, -0.9, 2.6, -0.3)); }
    else if (kind === 'pine') { m.add(cyl(0.25, 0.38, 1.6, 0x6b4423, 0, 0.8, 0, 7)); m.add(cone(2.0, 2.6, 0x2a6e46, 0, 2.6, 0)); m.add(cone(1.55, 2.2, 0x2f7d4f, 0, 4.0, 0)); m.add(cone(1.05, 1.8, 0x35915c, 0, 5.3, 0)); if (tr.off === 'snow') m.add(cone(0.8, 1.0, 0xffffff, 0, 5.9, 0)); }
    else if (kind === 'palm') { const t1 = cyl(0.24, 0.36, 3.2, 0x9a7a52, 0, 1.6, 0, 7); t1.rotation.z = 0.18; m.add(t1);
      for (let i = 0; i < 7; i++) { const fr = sph(1.35, 0x2fae4a, 0, 0, -1.15, 0.22, 0.07, 1); const hold = new THREE.Group(); hold.position.set(0.55, 3.5, 0); hold.rotation.y = i / 7 * Math.PI * 2; fr.rotation.x = 0.62; hold.add(fr); m.add(hold); } m.add(sph(0.3, 0x8a6a34, 0.45, 3.2, 0.25)); }
    else if (kind === 'cactus') { m.add(cyl(0.42, 0.5, 3, 0x3f9e4d, 0, 1.5, 0, 9)); m.add(sph(0.42, 0x3f9e4d, 0, 3, 0));
      const a1 = cyl(0.2, 0.2, 1.2, 0x3f9e4d, -0.75, 1.8, 0, 7); m.add(a1); const a2 = cyl(0.18, 0.18, 0.9, 0x3f9e4d, 0.7, 2.2, 0, 7); m.add(a2); }
    else if (kind === 'pipe') { m.add(cyl(1.05, 1.05, 2.2, 0x2fae3f, 0, 1.1, 0, 14)); m.add(cyl(1.3, 1.3, 0.55, 0x37c047, 0, 2.3, 0, 14)); }
    else if (kind === 'lamp') { m.add(cyl(0.14, 0.18, 5.4, 0x4a5058, 0, 2.7, 0, 8)); const lampB = box(1.1, 0.4, 0.6, 0xffedb5, 0.5, 5.5, 0); lampB.material = new THREE.MeshLambertMaterial({ color: 0xffedb5, emissive: 0xaa8830 }); m.add(lampB); m.add(box(1.1, 0.15, 0.15, 0x4a5058, 0.3, 5.35, 0)); }
    else if (kind === 'tire') { for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.34, 8, 16), MAT([0xe52521, 0xffffff, 0x2b2b30][i])); t.rotation.x = Math.PI / 2; t.position.y = 0.4 + i * 0.62; m.add(t); } }
    else if (kind === 'fence') { m.add(box(0.18, 1.3, 0.18, 0x8a6a44, -1.8, 0.65, 0)); m.add(box(0.18, 1.3, 0.18, 0x8a6a44, 1.8, 0.65, 0)); m.add(box(4, 0.16, 0.1, 0xb98a56, 0, 1.05, 0)); m.add(box(4, 0.16, 0.1, 0xb98a56, 0, 0.55, 0)); }
    else if (kind === 'star') { const st = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x886600 })); st.position.y = 2.5 + rng() * 4; m.add(st); }
    else { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3), MAT(tr.id === 'choco' ? 0x7a4a26 : 0x8a7a66)); r.position.y = 0.9; r.scale.set(1, 0.75, 0.9); m.add(r); }
    return m;
  };
  if (tr.decor === 'lamp') {
    for (let i = 0; i < 34; i++) { const sm = samples[Math.floor(i / 34 * N)]; const sgn = i % 2 ? 1 : -1;
      const pp = sm.pos.clone().addScaledVector(sm.side, sgn * (tr.width / 2 + 3.4));
      const m = makeDecor(); m.position.set(pp.x, groundAt(sm), pp.z); m.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(m); }
    for (let i = 0; i < 40; i++) { const sm = samples[Math.floor(rng() * N)]; const pp = sm.pos.clone().addScaledVector(sm.side, (rng() > 0.5 ? 1 : -1) * (tr.width / 2 + 9 + rng() * 22));
      const t = new THREE.Group(); t.add(cyl(0.28, 0.4, 2.4, 0x7a4a22, 0, 1.2, 0, 7)); t.add(sph(2.0, 0x2f8f2f, 0, 3.5, 0)); t.position.set(pp.x, groundAt(sm), pp.z); scene.add(t); }
  } else for (let i = 0; i < 150; i++) { const sm = samples[Math.floor(rng() * N)]; const sgn = rng() > 0.5 ? 1 : -1;
    const pp = sm.pos.clone().addScaledVector(sm.side, sgn * (tr.width / 2 + 4 + rng() * 30));
    let m; if (tr.decor === 'pipe' && rng() < 0.55) { m = new THREE.Group(); m.add(cyl(0.28, 0.4, 2.4, 0x7a4a22, 0, 1.2, 0, 7)); m.add(sph(2.1, 0x2f8f2f, 0, 3.6, 0)); m.add(sph(1.4, 0x37a838, 1.1, 3.0, 0.4)); }
    else m = makeDecor();
    const sc = 0.8 + rng() * 0.9; m.scale.setScalar(sc); m.rotation.y = rng() * Math.PI * 2;
    m.position.set(pp.x, groundAt(sm), pp.z); scene.add(m); }
  if (tr.off === 'grass') for (let i = 0; i < 60; i++) { const sm = samples[Math.floor(rng() * N)]; const pp = sm.pos.clone().addScaledVector(sm.side, (rng() > 0.5 ? 1 : -1) * (tr.width / 2 + 2 + rng() * 10));
    const f = box(0.35, 0.35, 0.35, [0xff5e7a, 0xffd84a, 0xffffff][i % 3], pp.x, groundAt(sm) + 0.3, pp.z); scene.add(f); }
  buildLandmark(scene, tr, at, groundAt, samples, N);
}
function buildLandmark(scene, tr, at, groundAt, samples, N) {
  const place = (grp, frac, lat, faceRoad = true) => { const { x, y, z, sm } = at(frac, lat); grp.position.set(x, groundAt(sm), z);
    if (faceRoad) grp.rotation.y = Math.atan2(sm.tan.x, sm.tan.z) + (lat > 0 ? Math.PI : 0); scene.add(grp); return grp; };
  const grandstand = (roofCol = 0xe52521) => { const g = new THREE.Group();
    for (let i = 0; i < 4; i++) { const step = new THREE.Mesh(new THREE.BoxGeometry(34, 2.2, 3.4), matTex(texCrowd())); step.position.set(0, 2 + i * 2.1, i * 3.2); g.add(step); }
    const roof = box(36, 0.5, 17, roofCol, 0, 12.5, 5); roof.rotation.x = 0.16; g.add(roof);
    for (const sx of [-16, 16]) g.add(box(0.6, 10, 0.6, 0x9aa0ab, sx, 6, -1)); return g; };
  switch (tr.id) {
    case 'luigi': case 'mario': place(grandstand(tr.id === 'luigi' ? 0x2fae3f : 0xe52521), 0.03, -(tr.width / 2 + 20)); break;
    case 'royal': { place(grandstand(0xf78fb8), 0.04, -(tr.width / 2 + 20));
      const castle = new THREE.Group(); castle.add(box(22, 12, 8, 0xf2d7e0, 0, 6, 0));
      for (const sx of [-12, 0, 12]) { castle.add(cyl(3.2, 3.6, 17, 0xf2d7e0, sx, 8.5, 0, 10)); castle.add(cone(4.2, 6, 0xe5456e, sx, 20, 0, 10)); }
      castle.add(box(5, 7, 1, 0x6b4423, 0, 3.5, -4.2)); place(castle, 0.52, -(tr.width / 2 + 30)); break; }
    case 'farm': { const barn = new THREE.Group(); barn.add(box(11, 6, 8, 0xb03024, 0, 3, 0));
      const roof = box(12.5, 0.5, 6, 0x7a2a1e, 0, 7.4, -1.8); roof.rotation.x = 0.62; barn.add(roof);
      const roof2 = box(12.5, 0.5, 6, 0x7a2a1e, 0, 7.4, 1.8); roof2.rotation.x = -0.62; barn.add(roof2);
      barn.add(box(3.6, 4.2, 0.3, 0xffffff, 0, 2.1, -4.1)); barn.add(cyl(2, 2, 9, 0xd8dce4, 8, 4.5, 1, 12)); barn.add(cone(2.3, 2, 0x9aa0ab, 8, 10, 1, 12));
      place(barn, 0.3, -(tr.width / 2 + 18)); break; }
    case 'beach': { const arch = new THREE.Group(); const rockM = matTex(texRock());
      const leg1 = new THREE.Mesh(new THREE.BoxGeometry(4, 11, 4), rockM); leg1.position.set(-7, 5.5, 0); arch.add(leg1);
      const leg2 = leg1.clone(); leg2.position.x = 7; arch.add(leg2); const top = new THREE.Mesh(new THREE.BoxGeometry(19, 4, 4.5), rockM); top.position.y = 12; arch.add(top);
      const { x, y, z, sm } = at(0.45, 0); arch.position.set(x, sm.pos.y - 0.3, z); arch.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(arch); break; }
    case 'desert': { for (const [f, l, s] of [[0.22, -34, 1.4], [0.6, 30, 1.0]]) { const py = cone(13, 15, 0xd9b96e, 0, 7, 0, 4); py.scale.setScalar(s); place((() => { const g = new THREE.Group(); g.add(py); return g; })(), f, l); }
      const mesa = new THREE.Group(); const mm = new THREE.Mesh(new THREE.BoxGeometry(46, 18, 14), matTex(texRock())); mm.position.y = 8; mesa.add(mm); place(mesa, 0.75, -(tr.width / 2 + 30)); break; }
    case 'turnpike': { for (const f of [0.25, 0.62]) { const gantry = new THREE.Group();
        for (const sx of [-1, 1]) gantry.add(box(0.7, 9, 0.7, 0x6a7078, sx * (tr.width / 2 + 1), 4.5, 0));
        const board = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 3, 2.6, 0.4), matTex(texSign(f < 0.5 ? 'TURNPIKE →' : 'EXIT 64 →', '#1a7a3a', '#ffffff'))); board.position.y = 8.2; gantry.add(board);
        const { x, y, z, sm } = at(f, 0); gantry.position.set(x, sm.pos.y, z); gantry.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(gantry); } break; }
    case 'frappe': { const sm2 = new THREE.Group(); sm2.add(sph(2.6, 0xffffff, 0, 2.2, 0)); sm2.add(sph(1.8, 0xffffff, 0, 5.2, 0)); sm2.add(cone(0.35, 1.4, 0xf08c1e, 0, 5.2, -1.9));
      const nose = sm2.children[2]; nose.rotation.x = -Math.PI / 2; place(sm2, 0.4, -(tr.width / 2 + 9)); break; }
    case 'choco': { const tun = new THREE.Group(); const rm = matTex(texRock());
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(5, 12, 16), rm); l1.position.set(-(tr.width / 2 + 2), 5, 0); tun.add(l1);
      const l2 = l1.clone(); l2.position.x = tr.width / 2 + 2; tun.add(l2); const tp = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 10, 5, 16), rm); tp.position.y = 12.5; tun.add(tp);
      const { x, y, z, sm } = at(0.55, 0); tun.position.set(x, sm.pos.y - 0.5, z); tun.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(tun); break; }
    case 'wario': { place(grandstand(0xf7d117), 0.05, -(tr.width / 2 + 20)); place(grandstand(0x7a4fc0), 0.55, (tr.width / 2 + 20));
      for (const f of [0.2, 0.7]) { const fl = new THREE.Group(); fl.add(cyl(0.3, 0.4, 13, 0x555b66, 0, 6.5, 0, 8));
        const heads = box(3.4, 2, 0.5, 0xffedb5, 0, 13.4, 0); heads.material = new THREE.MeshLambertMaterial({ color: 0xffedb5, emissive: 0x997722 }); fl.add(heads); place(fl, f, -(tr.width / 2 + 8)); } break; }
    case 'sherbet': { const cave = new THREE.Group(); const im = MAT(0xbfe2f5);
      const l1 = new THREE.Mesh(new THREE.BoxGeometry(5, 10, 13), im); l1.position.set(-(tr.width / 2 + 1.5), 4.4, 0); cave.add(l1);
      const l2 = l1.clone(); l2.position.x = tr.width / 2 + 1.5; cave.add(l2); const tp = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 9, 4.4, 13), im); tp.position.y = 10.8; cave.add(tp);
      const { x, y, z, sm } = at(0.6, 0); cave.position.set(x, sm.pos.y - 0.4, z); cave.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(cave); break; }
    case 'bowser': { const gate = new THREE.Group(); const bm = matTex(texBrick());
      for (const sx of [-1, 1]) { const tw = new THREE.Mesh(new THREE.BoxGeometry(5.5, 15, 5.5), bm); tw.position.set(sx * (tr.width / 2 + 3), 7, 0); gate.add(tw); gate.add(cone(4.4, 4, 0x3a3a44, sx * (tr.width / 2 + 3), 16.5, 0, 6)); }
      const beam = new THREE.Mesh(new THREE.BoxGeometry(tr.width + 9, 3.6, 5), bm); beam.position.y = 13; gate.add(beam);
      const { x, y, z, sm } = at(0.12, 0); gate.position.set(x, sm.pos.y - 0.3, z); gate.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(gate); break; }
    case 'jungle': { const boat = new THREE.Group(); boat.add(box(4, 2, 13, 0xf2f2f2, 0, 1, 0)); boat.add(box(3.2, 2.2, 6, 0xf2f2f2, 0, 2.8, 0.5));
      boat.add(cyl(0.5, 0.6, 3.4, 0xe52521, 0, 4.6, -2.6, 10)); place(boat, 0.35, -(tr.width / 2 + 22)); break; }
    case 'banshee': { const house = new THREE.Group(); house.add(box(13, 8, 9, 0x39415e, 0, 4, 0));
      const hr = cone(10, 5.5, 0x232a44, 0, 10.5, 0, 4); hr.rotation.y = Math.PI / 4; house.add(hr);
      for (const [wx, wy] of [[-3.5, 5], [3.5, 5], [0, 2.6]]) { const win = box(1.5, 1.8, 0.2, 0xffd84a, wx, wy, -4.6); win.material = new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0xaa7710 }); house.add(win); }
      place(house, 0.42, -(tr.width / 2 + 20)); break; }
    case 'rainbow': { const arch = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(tr.width * 0.75, 0.7, 10, 28, Math.PI), new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x775500 }));
      ring.position.y = 1; arch.add(ring); const star = new THREE.Mesh(new THREE.OctahedronGeometry(2.2), new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x998800 })); star.position.y = tr.width * 0.75 + 2; arch.add(star);
      const { x, y, z, sm } = at(0.3, 0); arch.position.set(x, sm.pos.y, z); arch.rotation.y = Math.atan2(sm.tan.x, sm.tan.z); scene.add(arch); break; }
    case 'yoshi': { for (const [f2, l2] of [[0.2, -16], [0.72, 15]]) { const hill = new THREE.Group();
        hill.add(sph(7, 0x54b84a, 0, 2.5, 0, 1.3, 0.65, 1)); hill.add(sph(0.5, 0x141414, -2, 5.2, -5.2)); hill.add(sph(0.5, 0x141414, 2, 5.2, -5.2)); place(hill, f2, l2); } break; }
  }
}
function buildArenaScene(ar) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(ar.sky); scene.fog = new THREE.Fog(ar.sky, 90, 320);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95)); const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(50, 100, 30); scene.add(sun);
  const S = ar.size, obstacles = [];
  const floorMat = ar.kind === 'deck' ? matTex(texGround('dirt'), 0xd86a5e) : ar.kind === 'donut' ? matTex(texGround('dark')) : matTex(texGround('grass'), 0xb9c2cc);
  const floor = ar.kind === 'donut'
    ? new THREE.Mesh(new THREE.CircleGeometry(S / 2, 28), floorMat)
    : new THREE.Mesh(new THREE.PlaneGeometry(S, S), floorMat); // Fort/Deck/Skyscraper are square in the original
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const addBlock = (x, z, w, d, h, c) => { const m = box(w, h, d, c, x, h / 2, z); scene.add(m); obstacles.push({ x, z, hw: w / 2, hd: d / 2, h }); };
  if (ar.kind === 'donut') { const lava = new THREE.Mesh(new THREE.CircleGeometry(16, 24), MAT(0xe85a17)); lava.rotation.x = -Math.PI / 2; lava.position.y = -0.5; scene.add(lava);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; addBlock(Math.cos(a) * 26, Math.sin(a) * 26, 8, 3, 1.2, 0x8a8a94); } }
  if (ar.kind === 'fort') { const cols = [0xe52521, 0x2f6bff, 0x2fae3f, 0xf7d117];
    [[-30, -30], [30, -30], [-30, 30], [30, 30]].forEach(([x, z], i) => { addBlock(x, z - 8, 18, 3, 5, cols[i]); addBlock(x - 8, z, 3, 16, 5, cols[i]); addBlock(x + 8, z, 3, 16, 5, cols[i]); }); }
  if (ar.kind === 'deck') { // upper ring deck at y=4 with 4 ramps (ramps along the cardinals)
    for (const [x, z, w, d] of [[0, -38, 96, 20], [0, 38, 96, 20], [-38, 0, 20, 56], [38, 0, 20, 56]]) {
      const m = box(w, 4, d, 0x3f9e4d, x, 2, z); scene.add(m); }
    for (const [x, z, ry] of [[0, -23, 0], [0, 23, Math.PI], [-23, 0, Math.PI / 2], [23, 0, -Math.PI / 2]]) {
      const ramp = box(16, 0.8, 13, 0x9a5a3a, x, 2, z); ramp.rotation.y = ry; ramp.rotation.x = ry === 0 || ry === Math.PI ? 0 : 0; ramp.rotateX(0.38); scene.add(ramp); }
    addBlock(0, 0, 10, 10, 2, 0x8a8a94);
    obstacles.push({ x: 0, z: -38, hw: 6, hd: 6, h: 2, baseY: 4 }); const dm = box(12, 2, 12, 0x8a8a94, 0, 5, -38); scene.add(dm); }
  if (ar.kind === 'scraper') { addBlock(-18, -18, 12, 12, 2, 0x7a7a84); addBlock(18, 18, 12, 12, 2, 0x7a7a84); addBlock(0, 0, 6, 20, 1.5, 0x9a9aa2); }
  return { scene, obstacles, size: S };
}
// ---------- race / battle simulation ----------
const ITEM_BOX_FRACS = [0.06, 0.18, 0.30, 0.42, 0.54, 0.66, 0.78, 0.90];
class Race {
  constructor(cfg) {
    // cfg: {kind:'race'|'battle'|'tt', trackId, arenaId, engine, racers:[{char,name,human(-1 cpu|slot)}], localHumans:[slots], netRole}
    this.cfg = cfg; this.kind = cfg.kind; this.engine = cfg.engine || '100cc';
    this.mirror = !!ENGINES[this.engine].mirror; this.time = -3.4; this.phase = 'countdown';
    this.projectiles = []; this.placed = []; this.boxes = []; this.hazards = []; this.finishedCount = 0;
    this.renderer = getRenderer(); this.cameras = [new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1200), new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 1200)];
    this.rng = mulberry(cfg.seed || 12345); this.onFinish = cfg.onFinish || (() => {});
    this.remoteInputs = {}; this.snapshot = null; this.ghostRecord = []; this.ghostPlayback = cfg.ghost || null; this.demo = !!cfg.demo;
    if (this.kind === 'battle') this.setupBattle(); else this.setupRace();
    this.setupKarts(); this.setupPickups(); this.initParticles();
    this.lastTs = performance.now(); this.acc = 0; this.netTimer = 0; this.raf = 0; this.disposed = false;
    this.lightsShown = 0; this.goHandled = false;
    $('#lights').innerHTML = '<div class="light"></div><div class="light"></div><div class="light"></div>';
    Audio8.music('race'); Audio8.engine(true, 0.1);
    const loop = ts => { if (this.disposed) return; this.frame(ts); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  setupRace() {
    this.tr = trackById(this.cfg.trackId); const b = buildTrackScene(this.tr, this.mirror);
    this.scene = b.scene; this.samples = b.samples; this.N = b.N; this.trackLength = b.length; this.groundY = b.groundY;
    for (const pad of this.tr.boostPads) { const s = this.sampleAt(pad); const m = box(5, 0.1, 4, 0xf08c1e, s.pos.x, s.pos.y + 0.1, s.pos.z); m.rotation.y = Math.atan2(s.tan.x, s.tan.z); this.scene.add(m); }
    this.setupHazards();
  }
  setupBattle() {
    this.ar = ARENAS.find(a => a.id === this.cfg.arenaId) || ARENAS[0];
    const b = buildArenaScene(this.ar); this.scene = b.scene; this.obstacles = b.obstacles; this.arenaSize = b.size;
    this.samples = null; this.trackLength = 300;
  }
  sampleAt(frac) { return this.samples[Math.floor(((frac % 1) + 1) % 1 * this.N) % this.N]; }
  arenaHeight(x, z) {
    if (this.ar?.kind !== 'deck') return 0;
    const ax = Math.abs(x), az = Math.abs(z);
    if (az > 28 || ax > 28) return 4;
    if (az > 18 && ax < 16) return (az - 18) / 10 * 4;   // north/south ramps
    if (ax > 18 && az < 16) return (ax - 18) / 10 * 4;   // east/west ramps
    return 0;
  }
  initParticles() {
    this.particles = [];
    const puff = canvasTex('puff', 64, (g, S) => { const gr = g.createRadialGradient(S/2, S/2, 2, S/2, S/2, S/2);
      gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, S, S); });
    for (let i = 0; i < 160; i++) { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false }));
      m.visible = false; this.scene.add(m); this.particles.push({ mesh: m, life: 0, maxLife: 0.6, vx: 0, vy: 0, vz: 0, grow: 2 }); }
    this._pNext = 0;
  }
  spawnP(x, y, z, color, n = 1, spread = 2.2, up = 2.4) {
    if (!this.particles) return;
    for (let i = 0; i < n; i++) { const P = this.particles[this._pNext++ % this.particles.length];
      P.mesh.visible = true; P.mesh.material.color.setHex(color); P.mesh.material.opacity = 0.55; P.mesh.position.set(x, y, z);
      const sc = color === 0xe8e8e8 ? 0.65 + Math.random() * 0.45 : 0.4 + Math.random() * 0.35; // modest smoke puffs, small sparks
      P.mesh.scale.set(sc, sc, 1); P.grow = color === 0xe8e8e8 ? 1.1 : 0.25; P.maxLife = P.life = 0.4 + Math.random() * 0.25;
      P.vx = (Math.random() - 0.5) * spread; P.vy = Math.random() * up; P.vz = (Math.random() - 0.5) * spread; }
  }
  stepParticles(dt) {
    if (!this.particles) return;
    for (const P of this.particles) { if (P.life <= 0) continue; P.life -= dt;
      P.mesh.position.x += P.vx * dt; P.mesh.position.y += P.vy * dt; P.mesh.position.z += P.vz * dt;
      P.vy -= 1.5 * dt; const gs = P.mesh.scale.x + P.grow * dt; P.mesh.scale.set(gs, gs, 1);
      P.mesh.material.opacity = 0.55 * Math.max(0, P.life / P.maxLife); if (P.life <= 0) P.mesh.visible = false; }
  }
  setupHazards() {
    const add = (type, frac, lat, mesh, r) => { const s = this.sampleAt(frac); const p = s.pos.clone().addScaledVector(s.side, lat);
      mesh.position.set(p.x, s.pos.y, p.z); this.scene.add(mesh); this.hazards.push({ type, frac, lat, mesh, r, phase: this.rng() * 6 }); };
    for (const hz of this.tr.hazards) {
      if (hz === 'car') for (let i = 0; i < 5; i++) { const car = new THREE.Group(); const cc = [0xf7d117, 0x2f6bff, 0xe52521, 0xffffff, 0x2fae3f][i];
        car.add(box(2.1, 0.85, 4.6, cc, 0, 0.75, 0)); car.add(box(1.85, 0.8, 2.3, 0xbfd9ea, 0, 1.5, 0.2));
        for (const [wx, wz] of [[-1, -1.6], [1, -1.6], [-1, 1.6], [1, 1.6]]) car.add(cyl(0.42, 0.42, 0.25, 0x17171b, wx, 0.42, wz, 10));
        car.children.slice(-4).forEach(w => w.rotation.z = Math.PI / 2);
        car.add(box(1.9, 0.25, 0.2, 0xffedb5, 0, 0.8, -2.35)); add('car', i / 5, i % 2 ? 3.5 : -3.5, car, 2.6); }
      if (hz === 'train') { const train = new THREE.Group(); train.add(box(2.8, 2.6, 7, 0x2b2b30, 0, 1.8, -8)); train.add(cyl(0.55, 0.7, 1.8, 0x141414, 0, 3.9, -10.5, 10));
        train.add(box(3.1, 1, 2, 0xe52521, 0, 0.8, -11.8)); train.add(box(2.8, 2.4, 6, 0x8a2a2a, 0, 1.7, -1)); train.add(box(2.8, 2.4, 6, 0x2a5a8a, 0, 1.7, 5.5)); train.add(box(2.8, 2.4, 6, 0x8a6a34, 0, 1.7, 12));
        add('train', 0.32, 0, train, 3); }
      if (hz === 'penguin') for (let i = 0; i < 4; i++) { const pg = new THREE.Group(); pg.add(sph(0.55, 0x223355, 0, 0.62, 0, 1, 1.25, 1)); pg.add(sph(0.4, 0xffffff, 0, 0.55, -0.22, 0.85, 1.1, 0.6));
        const bk = cone(0.13, 0.4, 0xf08c1e, 0, 1.05, -0.55); bk.rotation.x = -Math.PI / 2; pg.add(bk); add('penguin', 0.15 + i * 0.2, 0, pg, 1.3); }
      if (hz === 'snowman') for (let i = 0; i < 5; i++) { const sn = new THREE.Group(); sn.add(sph(0.72, 0xffffff, 0, 0.6, 0)); sn.add(sph(0.5, 0xffffff, 0, 1.55, 0));
        const cr = cone(0.13, 0.55, 0xf08c1e, 0, 1.55, -0.55); cr.rotation.x = -Math.PI / 2; sn.add(cr); add('snowman', 0.1 + i * 0.18, (i % 2 ? 3 : -3), sn, 1.3); }
      if (hz === 'mole') for (let i = 0; i < 4; i++) add('mole', 0.2 + i * 0.18, (i % 2 ? 2 : -2), box(1, 0.7, 1, 0x6a4a2a, 0, 0.35, 0), 1.2);
      if (hz === 'crab') for (let i = 0; i < 4; i++) add('crab', 0.12 + i * 0.22, 0, box(1.2, 0.5, 0.8, 0xe5452a, 0, 0.3, 0), 1.2);
      if (hz === 'piranha') for (let i = 0; i < 3; i++) add('piranha', 0.25 + i * 0.25, (i % 2 ? 4 : -4), box(1, 1.4, 1, 0xe52521, 0, 0.7, 0), 1.2);
      if (hz === 'thwomp') for (let i = 0; i < 3; i++) { const th = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3, 3.4), matTex(texThwompFace())); th.position.y = 5; add('thwomp', 0.2 + i * 0.28, 0, th, 2.4); }
      if (hz === 'boulder') for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 9, 7), MAT(0x6a5136)); add('boulder', 0.3 + i * 0.2, 0, m, 1.8); }
      if (hz === 'egg') { const egg = new THREE.Group(); const sh = new THREE.Mesh(new THREE.SphereGeometry(2.6, 14, 11), MAT(0xffffff)); sh.scale.y = 1.25; sh.position.y = 3.1; egg.add(sh);
        for (const [ex, ey, ez] of [[1.8, 4, 1.2], [-2, 3, 0.8], [0.5, 5.2, -1.8], [-1, 2.2, -2]]) egg.add(sph(0.75, 0x52c234, ex, ey, ez, 1, 0.8, 0.5)); add('egg', 0.5, 0, egg, 3); }
      if (hz === 'chomp') for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1.6, 10, 8), MAT(0x222222)); add('chomp', i / 3, 3, m, 2); }
      if (hz === 'boo') for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), MAT(0xf2f2ff)); add('boo', 0.2 + i * 0.25, 0, m, 1.4); }
    }
  }
  setupKarts() {
    this.karts = this.cfg.racers.map((r, i) => {
      const mesh = buildKartMesh(r.char); this.scene.add(mesh);
      const k = { id: i, char: r.char, name: r.name || CHARACTERS.find(c => c.id === r.char)?.name || 'CPU', human: r.human,
        stats: statsFor(r.char, this.engine), x: 0, y: 0, z: 0, h: 0, speed: 0, vy: 0, idx: 0, progress: 0, lap: 1, rank: i + 1,
        item: null, itemCount: 0, roulette: 0, spin: 0, shrink: 0, flat: 0, star: 0, ghostT: 0, goldenT: 0, boost: 0, rescue: 0,
        drifting: false, drift: null, prevDriftBtn: false, prevItemBtn: false, hopT: 0, finished: false, finishTime: null,
        lapTimes: [], lapStart: 0, cpuOffset: (this.rng() - 0.5) * 5, cpuItemT: 2 + this.rng() * 5, cpuTopMul: 1,
        pressAt: null, balloons: 3, alive: true, hitCooldown: 0, wheelRot: 0, mesh, tx: 0, ty: 0, tz: 0, th: 0 };
      if (this.kind === 'battle') { const col = [0xe52521, 0x2f6bff, 0x2fae3f, 0xf7d117][i % 4]; setBalloons(mesh, 3, col); k.balloonColor = col; }
      return k;
    });
    if (this.kind === 'tt') { const k = this.karts[0]; k.item = 'tripleMushroom'; k.itemCount = 3; }
    // grid / spawns
    if (this.kind === 'battle') this.karts.forEach((k, i) => { const a = i / this.karts.length * Math.PI * 2; k.x = Math.cos(a) * this.arenaSize * 0.3; k.z = Math.sin(a) * this.arenaSize * 0.3; k.h = Math.atan2(-k.x, -k.z); k.y = this.arenaHeight(k.x, k.z); k.tx = k.x; k.ty = k.y; k.tz = k.z; k.th = k.h; });
    else this.karts.forEach((k, i) => { const back = 6 + Math.floor(i / 2) * 5, lat = (i % 2 ? 3 : -3);
      const idx = (this.N - Math.round(back / this.trackLength * this.N) + this.N) % this.N; const s = this.samples[idx];
      const p = s.pos.clone().addScaledVector(s.side, lat); k.x = p.x; k.z = p.z; k.y = s.pos.y; k.h = Math.atan2(s.tan.x, s.tan.z);
      k.idx = idx; k.progress = -Math.round(back / this.trackLength * this.N); k.tx = k.x; k.ty = k.y; k.tz = k.z; k.th = k.h; });
    if (this.ghostPlayback?.length) { this.ghostMesh = buildKartMesh(this.karts[0].char);
      this.ghostMesh.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; } }); this.scene.add(this.ghostMesh); }
  }
  setupPickups() {
    const addBox = (x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.12, 1.12, 1.12), new THREE.MeshLambertMaterial({ map: texItemBox(), emissive: 0x555500, emissiveMap: texItemBox() })); m.position.set(x, y + 1, z);
      this.scene.add(m); this.boxes.push({ x, y: y + 1, z, t: 0, mesh: m }); };
    if (this.kind === 'battle') { const n = 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; const bx = Math.cos(a) * this.arenaSize * 0.32, bz = Math.sin(a) * this.arenaSize * 0.32; addBox(bx, this.arenaHeight(bx, bz), bz); } addBox(0, 0, 0); return; }
    if (this.kind === 'tt') return;
    for (const f of ITEM_BOX_FRACS) { const s = this.sampleAt(f);
      for (const lat of [-4.5, -1.5, 1.5, 4.5]) { const p = s.pos.clone().addScaledVector(s.side, clamp(lat, -this.tr.width / 2 + 1, this.tr.width / 2 - 1)); addBox(p.x, s.pos.y, p.z); } }
  }

  nearest(k) {
    let best = k.idx, bd = 1e12;
    for (let d = -40; d <= 40; d++) { const i = (k.idx + d + this.N) % this.N; const s = this.samples[i];
      const dd = (k.x - s.pos.x) ** 2 + (k.z - s.pos.z) ** 2; if (dd < bd) { bd = dd; best = i; } }
    let delta = best - k.idx; if (delta > this.N / 2) delta -= this.N; if (delta < -this.N / 2) delta += this.N;
    k.progress += delta; k.idx = best;
    const s = this.samples[best];
    const lat = (k.x - s.pos.x) * s.side.x + (k.z - s.pos.z) * s.side.z;
    return { s, lat, dist: Math.sqrt(bd) };
  }
  cpuInput(k, dt) {
    let tx, tz;
    // displacement check: speed can stay high while grinding a wall/cliff
    k.stuckCheckT = (k.stuckCheckT || 0) + dt;
    if (k.stuckCheckT > 1.5) { const moved = Math.hypot(k.x - (k.lastPX ?? k.x), k.z - (k.lastPZ ?? k.z));
      k.lastPX = k.x; k.lastPZ = k.z; k.stuckCheckT = 0;
      if (this.phase === 'racing' && moved < 1 && k.spin <= 0 && k.alive) { k.h += Math.PI * (0.8 + this.rng() * 0.4); k.speed = 6; if (this.kind === 'battle') { k.x *= 0.92; k.z *= 0.92; } } }
    if (this.phase === 'racing' && Math.abs(k.speed) < 1.2 && k.spin <= 0) { k.stuckT = (k.stuckT || 0) + dt;
      if (k.stuckT > 1.6) { // unstick: snap heading to the racing line / arena centre and roll
        if (this.kind !== 'battle') { const cs = this.samples[k.idx]; k.h = Math.atan2(cs.pos.x + cs.tan.x * 8 - k.x, cs.pos.z + cs.tan.z * 8 - k.z); }
        else k.h = Math.atan2(-k.x, -k.z);
        k.speed = 5; k.stuckT = 0; } } else k.stuckT = 0;
    if (this.kind === 'battle') {
      const foes = this.karts.filter(o => o !== k && o.alive && !o.bomb);
      const boxAvail = this.boxes.filter(b => b.t <= 0).sort((a2, b2) => ((a2.x-k.x)**2+(a2.z-k.z)**2) - ((b2.x-k.x)**2+(b2.z-k.z)**2))[0];
      const target = (!k.item && !k.bomb && boxAvail) ? boxAvail : foes.sort((a, b) => ((a.x-k.x)**2+(a.z-k.z)**2) - ((b.x-k.x)**2+(b.z-k.z)**2))[0];
      if (!target) return { steer: 0, accel: false, brake: false, drift: false, item: false };
      tx = target.x; tz = target.z;
      if (this.ar?.kind === 'deck' && Math.abs(this.arenaHeight(tx, tz) - k.y) > 1.5) {
        const ramps = [[0, -23], [0, 23], [-23, 0], [23, 0]];
        let best = null, bd = 1e12;
        for (const [rx, rz] of ramps) { const d = Math.hypot(rx - k.x, rz - k.z) + Math.hypot(tx - rx, tz - rz); if (d < bd) { bd = d; best = [rx, rz]; } }
        // aim through the ramp: near ramp base when climbing, ramp top when descending
        const t2 = k.y < 2 ? [best[0] * 1.35, best[1] * 1.35] : [best[0] * 0.55, best[1] * 0.55];
        tx = t2[0]; tz = t2[1]; }
    } else {
      const look = 6 + Math.abs(k.speed) * 0.55;
      const ahead = Math.round(look / this.trackLength * this.N);
      const s = this.samples[(k.idx + ahead) % this.N];
      if (this.rng() < dt * 0.15) k.cpuOffset = (this.rng() - 0.5) * (this.tr.width - 4);
      tx = s.pos.x + s.side.x * k.cpuOffset; tz = s.pos.z + s.side.z * k.cpuOffset;
      // dodge placed bananas ahead
      for (const p of this.placed) if ((p.x - tx) ** 2 + (p.z - tz) ** 2 < 9) { tx += s.side.x * 4; tz += s.side.z * 4; }
    }
    if (this.kind !== 'battle' && this.tr.wall) { const cs = this.samples[k.idx]; const clat = (k.x - cs.pos.x) * cs.side.x + (k.z - cs.pos.z) * cs.side.z;
      if (Math.abs(clat) > this.tr.width / 2 - 2.5) { tx = cs.pos.x + cs.tan.x * 10; tz = cs.pos.z + cs.tan.z * 10; } }
    if (this.kind === 'battle' && this.obstacles) { // steer around blocks instead of grinding on them
      for (const o of this.obstacles) { if (Math.abs(k.y - (o.baseY || 0)) > 2) continue;
        const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz), rr = Math.max(o.hw, o.hd) + 5.5;
        if (d < rr && d > 0.1) { const away = (rr - d) * 2.2; tx -= dx / d * away; tz -= dz / d * away; } } }
    let want = Math.atan2(tx - k.x, tz - k.z);
    let diff = want - k.h; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    k.cpuItemT -= dt; let item = false;
    if (k.item && k.cpuItemT <= 0) { item = true; k.cpuItemT = 2 + this.rng() * 6; }
    return { steer: clamp(diff * 1.6, -1, 1), accel: Math.abs(diff) < 2.4 || Math.abs(k.speed) < 3, brake: Math.abs(diff) > 2.4 && k.speed > 4, drift: Math.abs(diff) > 0.85 && k.speed > k.stats.top * 0.55, item };
  }
  hitKart(k, kind = 'spin', by = null) {
    if (k.bomb || k.star > 0 || k.ghostT > 0 || k.rescue > 0 || k.spin > 0.4) return false;
    if (this.kind === 'battle') {
      if (k.hitCooldown > 0) return false;
      k.balloons--; k.hitCooldown = 2; k.spin = 0.9; Audio8.beep(180, 0.25, 'sawtooth', 0.15);
      setBalloons(k.mesh, Math.max(0, k.balloons), k.balloonColor);
      this.spawnP(k.x, k.y + 1.2, k.z, k.balloonColor, 10, 5, 4);
      if (k.balloons <= 0) { // original rule: you become a bomb kart and can still take someone with you
        k.bomb = true; k.item = null; k.itemCount = 0; this.updateOrbit(k);
        k.mesh.userData.body.material.color.setHex(0x141414);
        const bombMesh = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), MAT(0x1a1a1a)); bombMesh.position.set(0, 1.4, 0.7); k.mesh.add(bombMesh);
        if (k.human >= 0) this.flashMsg("💣 YOU'RE A BOMB — RAM A RIVAL!");
        this.battleOrder = this.battleOrder || []; this.battleOrder.push(k); this.checkBattleEnd(); }
      return true;
    }
    k.spin = kind === 'big' ? 1.6 : 1.1; if (kind === 'flat') { k.flat = 1.2; k.spin = 0.8; }
    k.speed *= 0.15; Audio8.beep(160, 0.25, 'sawtooth', 0.13); return true;
  }
  useItem(k) {
    const it = k.item; if (!it || k.roulette > 0) return;
    const fwd = { x: Math.sin(k.h), z: Math.cos(k.h) };
    const consume = () => { k.itemCount--; if (k.itemCount <= 0) { k.item = null; k.itemCount = 0; } };
    Audio8.beep(880, 0.08);
    switch (it) {
      case 'banana': case 'bunch': {
        const n = it === 'bunch' ? k.itemCount : 1;
        for (let i = 0; i < n; i++) this.placeItem('banana', k.x - fwd.x * (2.5 + i * 0.8), k.y, k.z - fwd.z * (2.5 + i * 0.8), k);
        k.item = null; k.itemCount = 0; break; }
      case 'fake': this.placeItem('fake', k.x - fwd.x * 2.5, k.y, k.z - fwd.z * 2.5, k); consume(); break;
      case 'green': case 'tripleGreen': this.fireShell(k, 'green'); consume(); break;
      case 'red': case 'tripleRed': this.fireShell(k, 'red'); consume(); break;
      case 'spiny': this.fireShell(k, 'spiny'); consume(); break;
      case 'mushroom': case 'tripleMushroom': k.boost = Math.max(k.boost, 0.95); Audio8.jingle([660, 990]); consume(); break;
      case 'golden': if (k.goldenT <= 0) { k.goldenT = 8; } k.boost = Math.max(k.boost, 0.9); Audio8.jingle([660, 880, 1100]); break;
      case 'star': k.star = 8; consume(); Audio8.jingle([784, 988, 1175, 1568]); break;
      case 'lightning': for (const o of this.karts) if (o !== k && o.star <= 0 && o.ghostT <= 0) { o.shrink = 5; o.speed *= 0.5; } consume(); Audio8.beep(120, 0.5, 'sawtooth', 0.2); this.flashMsg('⚡ LIGHTNING!'); break;
      case 'boo': { k.ghostT = 6; const foes = this.karts.filter(o => o !== k && o.item && o.ghostT <= 0);
        consume(); if (foes.length) { const v = foes[Math.floor(this.rng() * foes.length)]; k.item = v.item; k.itemCount = v.itemCount; v.item = null; v.itemCount = 0; } break; }
    }
    this.updateOrbit(k);
  }
  placeItem(kind, x, y, z, owner) {
    const mesh = kind === 'banana' ? makeBananaMesh() : new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshLambertMaterial({ map: texItemBox(true), emissive: 0x441111 }));
    mesh.position.set(x, y + (kind === 'banana' ? 0.15 : 0.8), z);
    this.scene.add(mesh); this.placed.push({ kind, x, y, z, owner: owner?.id, grace: 1, mesh });
  }
  fireShell(k, kind) {
    const col = kind === 'green' ? 0x2fae3f : kind === 'red' ? 0xe52521 : 0x2f6bff;
    const mesh = makeShellMesh(col); if (kind === 'spiny') for (let si = 0; si < 6; si++) { const a = si / 6 * Math.PI * 2; mesh.add(cone(0.13, 0.4, 0xffffff, Math.cos(a) * 0.35, 0.55, Math.sin(a) * 0.35)); }
    const fwd = { x: Math.sin(k.h), z: Math.cos(k.h) };
    mesh.position.set(k.x + fwd.x * 2.2, k.y + 0.5, k.z + fwd.z * 2.2); this.scene.add(mesh);
    let target = null;
    if (kind === 'red') { const ahead = this.karts.filter(o => o !== k && (this.kind === 'battle' ? o.alive : o.progress > k.progress)).sort((a, b) => (a.progress - b.progress) || ((a.x-k.x)**2 - (b.x-k.x)**2)); target = ahead[0] || null; if (this.kind === 'battle') target = this.karts.filter(o => o !== k && o.alive).sort((a,b)=>((a.x-k.x)**2+(a.z-k.z)**2)-((b.x-k.x)**2+(b.z-k.z)**2))[0] || null; }
    if (kind === 'spiny') target = [...this.karts].sort((a, b) => b.progress - a.progress)[0];
    this.projectiles.push({ kind, x: mesh.position.x, y: k.y, z: mesh.position.z, h: k.h, speed: 34, owner: k.id, life: 12, target: target?.id, mesh, grace: 0.4 });
  }
  updateOrbit(k) {
    const o = k.mesh.userData.orbit; o.clear();
    if ((k.item === 'tripleGreen' || k.item === 'tripleRed') && k.itemCount > 0) {
      const col = k.item === 'tripleGreen' ? 0x2fae3f : 0xe52521;
      for (let i = 0; i < k.itemCount; i++) o.add(makeShellMesh(col));
    }
  }
  giveItem(k, id) {
    k.item = id; k.itemCount = id === 'bunch' ? 5 : (id.startsWith('triple') ? 3 : 1); this.updateOrbit(k);
  }

  flashMsg(m) { const el = $('#msg'); el.textContent = m; clearTimeout(this._msgT); this._msgT = setTimeout(() => { if ($('#msg').textContent === m) $('#msg').textContent = ''; }, 1600); }
  stepKart(k, input, dt) {
    const st = k.stats;
    for (const key of ['spin','shrink','flat','star','ghostT','boost','rescue','hitCooldown','hopT']) if (k[key] > 0) k[key] -= dt;
    if (k.goldenT > 0) { k.goldenT -= dt; if (k.goldenT <= 0 && k.item === 'golden') { k.item = null; k.itemCount = 0; } }
    if (k.roulette > 0) { k.roulette -= dt; if (k.roulette <= 0) this.giveItem(k, rollItem(this.kind === 'battle' ? 4 : k.rank, this.rng, this.kind === 'battle')); }
    if (!k.alive) { k.speed = 0; return; } // eliminated karts stop (bomb karts stay alive until they explode)
    if (k.rescue > 0) { k.speed = 0; return; }
    if (!k.alive || k.finished) input = (k.human < 0 || this.demo || k.finished) ? this.cpuInput(k, dt) : input;
    if (k.spin > 0) { k.h += dt * 14; k.speed = Math.max(0, k.speed - 18 * dt); }
    // world info
    let offroad = false, roadY = 0, lat = 0, sample = null;
    if (this.kind !== 'battle') { const nr = this.nearest(k); sample = nr.s; lat = nr.lat; roadY = sample.pos.y;
      offroad = Math.abs(lat) > this.tr.width / 2;
      if (this.tr.wall && Math.abs(lat) > this.tr.width / 2 + 1.2) {
        const push = (Math.abs(lat) - (this.tr.width / 2 + 1.2)) * Math.sign(lat);
        k.x -= sample.side.x * push; k.z -= sample.side.z * push;
        if (Math.abs(k.speed) > 6 && !k.wallHit) { Audio8.beep(90, 0.08, 'square', 0.08); k.speed *= 0.6; }
        k.wallHit = true; k.speed *= Math.max(0, 1 - 1.2 * dt); } else k.wallHit = false;
      if (this.tr.fall && Math.abs(lat) > this.tr.width / 2 + 7) { // falling
        k.vy -= 30 * dt; k.y += k.vy * dt;
        if (k.y < roadY - 12) { // Lakitu rescue
          if (this.kind === 'battle') {} 
          const back = this.samples[(k.idx - 4 + this.N) % this.N]; k.x = back.pos.x; k.z = back.pos.z; k.y = back.pos.y + 2; k.vy = 0; k.speed = 0; k.rescue = 1.2; k.h = Math.atan2(back.tan.x, back.tan.z); return; }
        k.x += Math.sin(k.h) * k.speed * dt; k.z += Math.cos(k.h) * k.speed * dt; return; }
    } else { roadY = this.arenaHeight(k.x, k.z);
      if (roadY > k.y + 1.5) { // driving into the deck's cliff face outside a ramp: bump back
        k.x -= Math.sin(k.h) * Math.max(1, Math.abs(k.speed)) * dt * 1.6; k.z -= Math.cos(k.h) * Math.max(1, Math.abs(k.speed)) * dt * 1.6;
        if (Math.abs(k.speed) > 6) k.speed *= 0.55; roadY = k.y; } }
    // hop / drift
    if (input.drift && !k.prevDriftBtn && Math.abs(k.speed) > 5 && k.hopT <= 0) { k.hopT = 0.28; k.vy = 4.5; Audio8.beep(500, 0.06, 'square', 0.05); }
    if (k.hopT > 0) k.y = roadY + Math.sin((0.28 - k.hopT) / 0.28 * Math.PI) * 0.7;
    else if (k.y > roadY + 0.08) { k.vy -= 30 * dt; k.y += k.vy * dt; if (k.y <= roadY) { k.y = roadY; k.vy = 0; } }
    else k.y = roadY;
    if (input.drift && Math.abs(k.speed) > 7 && Math.abs(input.steer) > 0.25 && !k.drifting && k.spin <= 0) { k.drifting = true; k.drift = new DriftMachine(Math.sign(input.steer)); }
    if (k.drifting) {
      if (!input.drift || Math.abs(k.speed) < 4) { const b = k.drift.boostSeconds(); if (b > 0) { k.boost = Math.max(k.boost, b); Audio8.jingle([880, 1174]); } k.drifting = false; k.drift = null; }
      else k.drift.update(input.steer);
    }
    k.prevDriftBtn = !!input.drift;
    // steering
    const speedFrac = clamp(Math.abs(k.speed) / st.top, 0, 1);
    let turn = input.steer * 1.85 * st.handling * (0.35 + 0.65 * speedFrac) * (k.speed < 0 ? -1 : 1);
    if (k.drifting) turn = k.drift.dir * 2.15 * st.handling * (0.5 + 0.5 * speedFrac) + input.steer * 0.7;
    if (k.spin <= 0) k.h += turn * dt * (this.tr?.off === 'ice' ? 0.88 : 1);
    // speed
    let cap = st.top * (k.human < 0 && this.kind === 'race' ? k.cpuTopMul : 1);
    if (offroad && k.boost <= 0 && k.star <= 0) cap *= st.offroad + 0.25;
    if (k.shrink > 0) cap *= 0.55;
    if (k.drifting) cap *= 0.94;
    if (k.boost > 0 || k.star > 0) cap = st.top * 1.35;
    if (this.phase !== 'racing') { k.speed = 0; }
    else if (k.spin <= 0) { k.speed = stepSpeed(k.speed, input.accel, input.brake, st, dt, cap); if (k.speed > cap && k.boost <= 0) k.speed = Math.max(cap, k.speed - 14 * dt); }
    if (input.item && !k.prevItemBtn && this.phase === 'racing') this.useItem(k);
    k.prevItemBtn = !!input.item;
    k.x += Math.sin(k.h) * k.speed * dt; k.z += Math.cos(k.h) * k.speed * dt;
    // boost pads
    if (this.kind !== 'battle') for (const pad of this.tr.boostPads) { const s2 = this.sampleAt(pad);
      if ((k.x - s2.pos.x) ** 2 + (k.z - s2.pos.z) ** 2 < 16 && Math.abs(lat) < 4) { if (k.boost < 0.5) Audio8.jingle([740, 1108]); k.boost = Math.max(k.boost, 0.85); } }
    // battle bounds + obstacles
    if (this.kind === 'battle') {
      const d = Math.hypot(k.x, k.z), maxR = this.arenaSize / 2 - 2;
      if (this.ar.kind === 'donut') { if (d > maxR) { k.x *= maxR / d; k.z *= maxR / d; k.speed *= 0.6; } }
      else if (this.ar.kind === 'scraper' && (Math.abs(k.x) > maxR + 4 || Math.abs(k.z) > maxR + 4)) { if (!k.bomb) this.hitKart(k, 'spin'); k.x *= 0.3; k.z *= 0.3; k.speed = 0; k.rescue = 1; }
      else { if (Math.abs(k.x) > maxR) { k.x = Math.sign(k.x) * maxR; k.speed *= 0.6; } if (Math.abs(k.z) > maxR) { k.z = Math.sign(k.z) * maxR; k.speed *= 0.6; } }
      if (this.ar.kind === 'donut' && d < 16) { if (k.hitCooldown <= 0) this.hitKart(k, 'spin'); const s2 = 20 / Math.max(1, d); k.x *= s2; k.z *= s2; k.speed *= 0.4; }
      for (const o of this.obstacles) { if (Math.abs(k.y - (o.baseY || 0)) > 2) continue;
        if (Math.abs(k.x - o.x) < o.hw + 1 && Math.abs(k.z - o.z) < o.hd + 1) {
        const px = o.hw + 1 - Math.abs(k.x - o.x), pz = o.hd + 1 - Math.abs(k.z - o.z);
        if (px < pz) k.x += Math.sign(k.x - o.x) * px; else k.z += Math.sign(k.z - o.z) * pz; k.speed *= Math.max(0, 1 - 2 * dt); } }
    }
    // item boxes
    if (!k.item && k.roulette <= 0 && k.alive && !k.bomb) for (const b of this.boxes) { if (b.t > 0) continue;
      if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 4.5) { b.t = 4; b.mesh.visible = false; k.roulette = 0.8; Audio8.beep(1180, 0.09, 'square', 0.09); break; } }
    // placed items
    for (let i = this.placed.length - 1; i >= 0; i--) { const p = this.placed[i];
      if (p.owner === k.id && p.grace > 0) continue; if (k.ghostT > 0) continue;
      if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 2.1) { const wasStar = k.star > 0; this.scene.remove(p.mesh); this.placed.splice(i, 1); if (!wasStar) this.hitKart(k, p.kind === 'fake' ? 'big' : 'spin'); } }
    // laps / finish
    if (this.kind !== 'battle' && this.phase === 'racing' && !k.finished) {
      const lapNow = Math.floor(k.progress / this.N) + 1;
      if (lapNow > k.lap) { k.lapTimes.push(this.time - k.lapStart); k.lapStart = this.time; k.lap = lapNow;
        if (k.human >= 0) { if (lapNow === this.tr.laps) { this.flashMsg('FINAL LAP!'); Audio8.jingle([659, 784, 988]); } else this.flashMsg('LAP ' + lapNow); } }
      if (k.progress >= this.tr.laps * this.N) { k.finished = true; k.finishTime = this.time; k.lapTimes.push(this.time - k.lapStart); this.finishedCount++;
        if (k.human >= 0) { this.flashMsg('FINISH! ' + ordinal(k.rank)); Audio8.jingle([523, 659, 784, 1046, 1318]); } this.checkRaceEnd(); }
    }
  }
  stepProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) { const p = this.projectiles[i]; p.life -= dt; p.grace -= dt;
      const tgt = this.karts[p.target];
      if ((p.kind === 'red' || p.kind === 'spiny') && tgt && tgt.alive) { const want = Math.atan2(tgt.x - p.x, tgt.z - p.z); p.h = angLerp(p.h, want, clamp(dt * (p.kind === 'spiny' ? 2.2 : 3.2), 0, 1)); p.y = tgt.y; }
      else if (this.kind !== 'battle') { // green shells: stay near road, bounce off walls
        let bd = 1e12, bs = null; const approxIdx = Math.round(((Math.atan2(p.z, p.x)))); // fallback: search around owner progress
        // nearest sample by coarse search every step is fine at this scale
        for (let j = 0; j < this.N; j += 3) { const s = this.samples[j]; const dd = (p.x - s.pos.x) ** 2 + (p.z - s.pos.z) ** 2; if (dd < bd) { bd = dd; bs = s; } }
        if (bs) { p.y = bs.pos.y; const lat = (p.x - bs.pos.x) * bs.side.x + (p.z - bs.pos.z) * bs.side.z;
          if (Math.abs(lat) > this.tr.width / 2) { // reflect lateral velocity component
            const vx = Math.sin(p.h), vz = Math.cos(p.h); const dot = vx * bs.side.x + vz * bs.side.z;
            const rx = vx - 2 * dot * bs.side.x, rz = vz - 2 * dot * bs.side.z; p.h = Math.atan2(rx, rz);
            p.x -= bs.side.x * Math.sign(lat) * 0.6; p.z -= bs.side.z * Math.sign(lat) * 0.6; } }
      }
      p.x += Math.sin(p.h) * p.speed * dt; p.z += Math.cos(p.h) * p.speed * dt;
      p.mesh.position.set(p.x, p.y + (p.kind === 'spiny' ? 1.6 : 0.45), p.z); p.mesh.rotation.y += dt * 6;
      let dead = p.life <= 0;
      for (const k of this.karts) { if (!k.alive || k.bomb) continue; if (k.id === p.owner && p.grace > 0) continue; if (k.ghostT > 0) continue;
        if ((k.x - p.x) ** 2 + (k.z - p.z) ** 2 < (p.kind === 'spiny' ? 9 : 2.6)) {
          if (p.kind === 'spiny') { for (const o of this.karts) if ((o.x - p.x) ** 2 + (o.z - p.z) ** 2 < 25) this.hitKart(o, 'big'); this.flashMsg('💙 SPINY SHELL!'); }
          else if ((k.item === 'tripleGreen' || k.item === 'tripleRed') && k.itemCount > 0) { k.itemCount--; if (!k.itemCount) k.item = null; this.updateOrbit(k); }
          else this.hitKart(k, 'spin');
          dead = true; break; } }
      if (dead) { this.scene.remove(p.mesh); this.projectiles.splice(i, 1); } }
    for (const p of this.placed) if (p.grace > 0) p.grace -= dt;
  }
  stepHazards(dt) {
    const t = Math.max(0, this.time);
    for (const hz of this.hazards) {
      if (hz.type === 'car' || hz.type === 'chomp') { hz.frac = (hz.frac + dt * (hz.type === 'car' ? 9 : 13) / this.trackLength) % 1; const s = this.sampleAt(hz.frac);
        const p = s.pos.clone().addScaledVector(s.side, hz.lat); hz.mesh.position.set(p.x, s.pos.y + (hz.type === 'chomp' ? 1.2 : 0), p.z); hz.mesh.rotation.y = Math.atan2(s.tan.x, s.tan.z); }
      else if (hz.type === 'train') { const s = this.sampleAt(hz.frac); const off = ((t * 6 + hz.phase * 10) % 60) - 30; const p = s.pos.clone().addScaledVector(s.side, off); hz.mesh.position.set(p.x, s.pos.y, p.z); hz.mesh.rotation.y = Math.atan2(s.side.x, s.side.z); }
      else if (['penguin','crab','boulder','boo'].includes(hz.type)) { const s = this.sampleAt(hz.frac); const lat = Math.sin(t * 0.7 + hz.phase) * (this.tr.width / 2 - 2); const p = s.pos.clone().addScaledVector(s.side, lat); hz.mesh.position.set(p.x, s.pos.y + (hz.type === 'boo' ? 1.2 : 0), p.z); }
      else if (hz.type === 'thwomp') { const s = this.sampleAt(hz.frac); const cyc = (t + hz.phase) % 3; hz.mesh.position.y = s.pos.y + (cyc < 1.6 ? 5 : cyc < 2 ? 5 - (cyc - 1.6) * 11 : 0.8); hz.mesh.position.x = s.pos.x; hz.mesh.position.z = s.pos.z; }
      else if (hz.type === 'egg') hz.mesh.rotation.y += dt * 0.8;
      else if (hz.type === 'mole') hz.mesh.position.y = this.sampleAt(hz.frac).pos.y + (Math.sin(t * 1.3 + hz.phase) > 0.2 ? 0.35 : -0.5);
      for (const k of this.karts) { if (!k.alive || k.rescue > 0) continue;
        if ((k.x - hz.mesh.position.x) ** 2 + (k.z - hz.mesh.position.z) ** 2 < hz.r * hz.r) {
          if (hz.type === 'thwomp' && hz.mesh.position.y > k.y + 2.5) continue;
          if (k.hitCooldown <= 0) { if (this.hitKart(k, hz.type === 'thwomp' ? 'flat' : 'spin')) k.hitCooldown = 1.2; } } }
    }
  }
  stepCollisions(dt) {
    for (let i = 0; i < this.karts.length; i++) for (let j = i + 1; j < this.karts.length; j++) {
      const a = this.karts[i], b = this.karts[j]; if (!a.alive || !b.alive) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 < 4.4 && d2 > 0.0001) { const d = Math.sqrt(d2), push = (2.1 - d) / d;
        const wa = a.stats.weight, wb = b.stats.weight, tot = wa + wb;
        a.x -= dx * push * (wb / tot); a.z -= dz * push * (wb / tot); b.x += dx * push * (wa / tot); b.z += dz * push * (wa / tot);
        if (a.star > 0) this.hitKart(b, 'spin'); if (b.star > 0) this.hitKart(a, 'spin');
        if (this.kind === 'battle') for (const [bomb, victim] of [[a, b], [b, a]]) if (bomb.bomb && bomb.alive && !victim.bomb && victim.alive) {
          this.spawnP(bomb.x, bomb.y + 1, bomb.z, 0xff7a2a, 22, 8, 6); Audio8.beep(70, 0.5, 'sawtooth', 0.22);
          victim.spin = 0; victim.hitCooldown = 0; this.hitKart(victim, 'big'); bomb.alive = false; bomb.mesh.visible = false; this.checkBattleEnd(); }
        if (this.kind === 'battle') { if (a.star > 0) this.hitKart(b); if (b.star > 0) this.hitKart(a); }
        // orbiting shells block
        for (const [holder, other] of [[a, b], [b, a]]) if ((holder.item === 'tripleGreen' || holder.item === 'tripleRed') && holder.itemCount > 0 && other.hitCooldown <= 0) { holder.itemCount--; if (!holder.itemCount) holder.item = null; this.updateOrbit(holder); this.hitKart(other, 'spin'); other.hitCooldown = Math.max(other.hitCooldown, 1); }
        if (a.shrink > 0 && b.shrink <= 0 && Math.abs(b.speed) > 8) this.hitKart(a, 'flat');
        if (b.shrink > 0 && a.shrink <= 0 && Math.abs(a.speed) > 8) this.hitKart(b, 'flat');
      } }
  }
  updateRanks() {
    if (this.kind === 'battle') return;
    const sorted = [...this.karts].sort((a, b) => (b.finishTime !== null && a.finishTime !== null) ? a.finishTime - b.finishTime : (b.finished - a.finished) || (b.progress - a.progress));
    sorted.forEach((k, i) => k.rank = i + 1);
    const leadHuman = Math.max(...this.karts.filter(k => k.human >= 0).map(k => k.progress / this.N * this.trackLength), 0);
    for (const k of this.karts) if (k.human < 0) k.cpuTopMul = rubberBand(k.progress / this.N * this.trackLength, leadHuman, this.engine, this.trackLength);
  }
  checkRaceEnd() {
    const humans = this.karts.filter(k => k.human >= 0);
    if (this.phase !== 'racing') return;
    if (humans.every(k => k.finished) || (this.kind === 'tt' && this.karts[0].finished)) this.finish();
  }
  checkBattleEnd() { const alive = this.karts.filter(k => k.alive && !k.bomb); if (alive.length <= 1 && this.phase === 'racing') this.finish(); }
  finish() {
    if (this.phase === 'done') return; this.phase = 'done'; Audio8.engine(false); Audio8.music('menu');
    setTimeout(() => { if (!this.disposed) this.onFinish(this.results()); }, 1400);
  }
  results() {
    if (this.kind === 'battle') { const alive = this.karts.filter(k => k.alive && !k.bomb); const order = [...alive, ...(this.battleOrder || []).slice().reverse()];
      return { kind: 'battle', order: order.map(k => ({ id: k.id, name: k.name, char: k.char, human: k.human, balloons: k.balloons, bomb: !!k.bomb })) }; }
    const order = [...this.karts].sort((a, b) => a.rank - b.rank);
    return { kind: this.kind, order: order.map(k => ({ id: k.id, name: k.name, char: k.char, human: k.human, time: k.finishTime, lapTimes: k.lapTimes, rank: k.rank })),
      ghost: this.ghostRecord, bestLap: Math.min(...this.karts.flatMap(k => k.lapTimes.length ? k.lapTimes : [Infinity])) };
  }

  // ----- per-frame -----
  inputFor(k, dt) {
    if (this.demo) return this.cpuInput(k, dt);
    if (this.cfg.netRole === 'host' && k.human > 0) return this.remoteInputs[k.human] || { steer: 0, accel: false, brake: false, drift: false, item: false };
    if (k.human >= 0) {
      if (this.cfg.netRole === 'host' || !this.cfg.netRole) return pollInput(this.localIndexOf(k.human));
      return { steer: 0, accel: false, brake: false, drift: false, item: false };
    }
    return this.cpuInput(k, dt);
  }
  localIndexOf(slot) { const li = (this.cfg.localHumans || [0]).indexOf(slot); return li < 0 ? 0 : li; }
  me() { return this.karts.find(k => k.human === (this.cfg.mySlot ?? 0)) || this.karts[0]; }
  frame(ts) {
    const r = this.renderer; let dtMs = ts - this.lastTs; this.lastTs = ts;
    if (app.paused) dtMs = 0;
    this.acc += Math.min(100, dtMs);
    const STEP = 1000 / 60;
    while (this.acc >= STEP) { this.acc -= STEP; this.step(STEP / 1000); }
    this.syncMeshes(dtMs / 1000); this.render(r); this.updateHUD();
  }
  step(dt) {
    if (this.cfg.netRole === 'client') { this.clientStep(dt); return; }
    this.time += dt;
    // countdown lights + rocket start
    const lights = document.querySelectorAll('#lights .light');
    if (this.phase === 'countdown') {
      const n = this.time > -2.4 ? 1 : this.time > -1.6 ? 2 : this.time > -0.8 ? 3 : 0;
      const lit = this.time > -3.2 ? Math.min(3, Math.floor((this.time + 3.4) / 0.85)) : 0;
      if (lit !== this.lightsShown && lit <= 3) { this.lightsShown = lit; lights.forEach((l, i) => l.className = 'light' + (i < lit ? ' on' : '')); if (lit > 0) Audio8.beep(440, 0.15, 'square', 0.12); }
      for (const k of this.karts) if (k.human >= 0 && k.pressAt === null) { const inp = this.inputFor(k, dt); if (inp.accel) k.pressAt = this.time; }
      if (this.time >= 0) { this.phase = 'racing'; this.karts.forEach(k => k.lapStart = 0);
        lights.forEach(l => l.className = 'light go'); Audio8.beep(880, 0.4, 'square', 0.14); this.flashMsg('GO!');
        setTimeout(() => { const el = $('#lights'); if (el) el.innerHTML = ''; }, 1200);
        for (const k of this.karts) { const verdict = k.human < 0 ? (this.rng() < 0.5 ? 'rocket' : 'none') : rocketStart(k.pressAt);
          if (verdict === 'rocket') k.boost = 1.0; if (verdict === 'burnout') k.spin = 1.1; }
      }
    }
    for (const k of this.karts) this.stepKart(k, this.inputFor(k, dt), dt);
    this.stepProjectiles(dt); this.stepCollisions(dt); if (this.kind !== 'battle') this.stepHazards(dt); this.stepParticles(dt);
    for (const b of this.boxes) { if (b.t > 0) { b.t -= dt; if (b.t <= 0) b.mesh.visible = true; } b.mesh.rotation.y += dt * 2.4; }
    this.updateRanks();
    if (this.kind === 'tt' && this.phase === 'racing') { this._gT = (this._gT || 0) + dt;
      if (this._gT > 0.1) { this._gT = 0; const k = this.karts[0]; this.ghostRecord.push([+k.x.toFixed(1), +k.y.toFixed(1), +k.z.toFixed(1), +k.h.toFixed(2)]); } }
    // host broadcast
    if (this.cfg.netRole === 'host' && app.net?.room) { this.netTimer -= dt;
      if (this.netTimer <= 0) { this.netTimer = 1 / 15; app.net.room.broadcast({ t: 'state', s: this.serialize() }); }
      if (this.phase === 'done' && !this._sentResults) { this._sentResults = true; app.net.room.broadcast({ t: 'results', r: this.results() }); } }
  }
  serialize() {
    return { time: +this.time.toFixed(2), phase: this.phase,
      k: this.karts.map(k => [+k.x.toFixed(1), +k.y.toFixed(1), +k.z.toFixed(1), +k.h.toFixed(2), +k.speed.toFixed(1), k.item, k.itemCount, k.lap, k.rank, k.balloons, k.alive ? 1 : 0, k.spin > 0 ? 1 : 0, k.shrink > 0 ? 1 : 0, k.star > 0 ? 1 : 0, k.drifting ? (k.drift?.stage || 0) + 1 : 0, k.finished ? 1 : 0, k.finishTime, k.bomb ? 1 : 0]),
      p: this.projectiles.map(p => [p.kind, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]),
      b: this.placed.map(p => [p.kind, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]),
      boxes: this.boxes.map(b => b.t > 0 ? 0 : 1).join('') };
  }
  clientStep(dt) { this.stepParticles(dt);
    // send my input ~20 Hz
    this.netTimer -= dt;
    if (this.netTimer <= 0 && app.net?.room) { this.netTimer = 1 / 20; app.net.room.send('host', { t: 'input', slot: this.cfg.mySlot, i: encodeInput(pollInput(0)) }); }
    const s = this.snapshot; if (!s) return;
    this.time = s.time; if (s.phase === 'racing' && this.phase === 'countdown') { this.phase = 'racing'; this.flashMsg('GO!'); $('#lights').innerHTML = ''; }
    s.k.forEach((a, i) => { const k = this.karts[i]; if (!k) return;
      [k.tx, k.ty, k.tz, k.th, k.speed] = a; k.item = a[5]; k.itemCount = a[6]; k.lap = a[7]; k.rank = a[8];
      if (k.balloons !== a[9]) { k.balloons = a[9]; if (this.kind === 'battle') setBalloons(k.mesh, Math.max(0, k.balloons), k.balloonColor); }
      k.alive = !!a[10]; k.spin = a[11] ? 0.5 : 0; k.shrink = a[12] ? 1 : 0; k.star = a[13] ? 1 : 0; k.driftVisual = a[14] || 0; k.finished = !!a[15]; k.finishTime = a[16]; k.bomb = !!a[17]; if (k.bomb) k.mesh.userData.body.material.color.setHex(0x141414);
      k.mesh.visible = k.alive; });
    // rebuild projectile / placed visuals cheaply
    const syncDyn = (arr, list, make) => { while (list.length < arr.length) { const m = make(arr[list.length][0]); this.scene.add(m); list.push(m); }
      while (list.length > arr.length) { this.scene.remove(list.pop()); }
      arr.forEach((a, i) => list[i].position.set(a[1], a[2] + 0.5, a[3])); };
    this._dynP = this._dynP || []; this._dynB = this._dynB || [];
    syncDyn(s.p, this._dynP, kind => makeShellMesh(kind === 'green' ? 0x2fae3f : kind === 'red' ? 0xe52521 : 0x2f6bff));
    syncDyn(s.b, this._dynB, kind => kind === 'banana' ? makeBananaMesh() : new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshLambertMaterial({ map: texItemBox(true) })));
    this.boxes.forEach((b, i) => b.mesh.visible = s.boxes?.[i] === '1');
    for (const b of this.boxes) b.mesh.rotation.y += dt * 2.4;
    if (this.kind !== 'battle') this.stepHazardsVisualOnly(dt);
  }
  stepHazardsVisualOnly(dt) { const save = this.karts; this.karts = []; this.stepHazards(dt); this.karts = save; }
  syncMeshes(dt) {
    const t = performance.now() / 1000;
    for (const k of this.karts) {
      if (this.cfg.netRole === 'client') { const f = clamp(dt * 12, 0, 1); k.x = lerp(k.x, k.tx, f); k.y = lerp(k.y, k.ty, f); k.z = lerp(k.z, k.tz, f); k.h = angLerp(k.h, k.th, f); }
      k.mesh.position.set(k.x, k.y, k.z); k.mesh.rotation.set(0, k.h + Math.PI, 0); // model nose is -Z
      if (k.drifting) k.mesh.rotation.z = -k.drift.dir * 0.12;
      { const dh = k.prevH === undefined ? 0 : (k.h - k.prevH); k.prevH = k.h;
        const steerVis = clamp(dh / Math.max(dt, 0.001) * 0.22, -0.55, 0.55);
        for (const fp of k.mesh.userData.frontPivots || []) fp.rotation.y = steerVis;
        if (k.mesh.userData.steerWheel) k.mesh.userData.steerWheel.rotation.z = -steerVis * 1.6;
        if (k.mesh.userData.driver) { k.mesh.userData.driver.rotation.z = -steerVis * 0.35; k.mesh.userData.driver.rotation.x = k.boost > 0 ? 0.14 : 0; } }
      { const ref = this.scene.userData.referee; if (ref) { if (ref.userData.baseY === undefined) ref.userData.baseY = ref.position.y; ref.position.y = ref.userData.baseY + Math.sin(t * 1.7) * 0.35; } }
      const dStage = k.drifting ? (k.drift?.stage || 0) : (k.driftVisual ? k.driftVisual - 1 : -1);
      if (dStage >= 0 && Math.abs(k.speed) > 4 && Math.random() < dt * 40) {
        const col = dStage >= 2 ? 0xff5a1e : dStage === 1 ? 0xffd117 : 0xe8e8e8; // white -> yellow -> orange/red sparks over tyre smoke
        this.spawnP(k.x - Math.sin(k.h) * 1.3, k.y + 0.25, k.z - Math.cos(k.h) * 1.3, col, 2, 3, 2); }
      if ((k.boost > 0) && Math.random() < dt * 40) this.spawnP(k.x - Math.sin(k.h) * 1.5, k.y + 0.4, k.z - Math.cos(k.h) * 1.5, 0x3fa9ff, 2, 1, 0.5);
      const sc = k.shrink > 0 ? 0.55 : 1; k.mesh.scale.set(sc, sc * (k.flat > 0 ? 0.35 : 1), sc);
      k.wheelRot += k.speed * dt * 2.2; for (const w of k.mesh.userData.wheels) w.rotation.x = k.wheelRot;
      k.mesh.traverse(o => { if (o.material && o.material.transparent !== undefined && o.geometry?.type !== 'SphereGeometry') {} });
      k.mesh.visible = k.alive;
      const ghost = k.ghostT > 0; k.mesh.userData.body.material.transparent = ghost; k.mesh.userData.body.material.opacity = ghost ? 0.3 : 1;
      if (k.star > 0) k.mesh.userData.body.material.emissive?.setHSL((t * 2) % 1, 1, 0.45); else k.mesh.userData.body.material.emissive?.setHex(0x000000);
      const orb = k.mesh.userData.orbit; orb.children.forEach((m, i) => { const a = t * 4 + i * (Math.PI * 2 / Math.max(1, orb.children.length)); m.position.set(Math.cos(a) * 1.6, 0.55, Math.sin(a) * 1.6); });
    }
    if (this.ghostMesh && this.ghostPlayback) { const idx = clamp(Math.floor(Math.max(0, this.time) * 10), 0, this.ghostPlayback.length - 1); const g = this.ghostPlayback[idx];
      if (g) { this.ghostMesh.position.set(g[0], g[1], g[2]); this.ghostMesh.rotation.y = g[3] + Math.PI; } }
    // drift sparks: tint a small exhaust box colour via body emissive handled above; add simple spark sprites count in HUD only
  }
  render(r) {
    const locals = this.cfg.netRole ? [this.me()] : (this.cfg.localHumans || [0]).map(s => this.karts.find(k => k.human === s)).filter(Boolean);
    const views = locals.length ? locals : [this.karts[0]];
    r.setScissorTest(views.length > 1);
    views.forEach((k, vi) => {
      const cam = this.cameras[vi % 2]; const H = innerHeight, W = innerWidth;
      if (views.length > 1) { const h = Math.floor(H / 2); r.setViewport(0, vi === 0 ? h : 0, W, h); r.setScissor(0, vi === 0 ? h : 0, W, h); cam.aspect = W / h; }
      else { r.setViewport(0, 0, W, H); cam.aspect = W / H; }
      cam.updateProjectionMatrix();
      const fx = Math.sin(k.h), fz = Math.cos(k.h);
      const dist = 7.6 + Math.min(2.2, Math.abs(k.speed) * 0.045), height = 3.1;
      const cx = k.x - fx * dist, cz = k.z - fz * dist;
      cam.position.x = lerp(cam.position.x || cx, cx, 0.18); cam.position.z = lerp(cam.position.z || cz, cz, 0.18);
      cam.position.y = k.y + height;
      cam.lookAt(k.x + fx * 8, k.y + 1.0, k.z + fz * 8);
      r.render(this.scene, cam);
    });
    r.setScissorTest(false);
  }
  updateHUD() {
    const k = this.me(); if (!k) return;
    if (this.kind === 'battle') { $('#pos').textContent = k.bomb ? '💣 BOMB!' : k.alive ? '🎈×' + k.balloons : 'OUT!'; $('#lap').textContent = this.karts.filter(x => x.alive && !x.bomb).length + ' LEFT'; $('#balloons').textContent = '🎈'.repeat(Math.max(0, k.balloons)); }
    else { $('#pos').textContent = this.tr.mystery && !k.finished ? '?th' : ordinal(k.rank); $('#lap').textContent = `LAP ${clamp(k.lap, 1, this.tr.laps)}/${this.tr.laps}`; $('#balloons').textContent = ''; }
    const lapCur = this.phase === 'racing' ? Math.max(0, this.time - (k.lapStart || 0)) : 0;
    $('#timer').textContent = `TIME ${fmtTime(Math.max(0, this.time))}\nLAP  ${fmtTime(lapCur)}` + (k.lapTimes.length ? `\nBEST ${fmtTime(Math.min(...k.lapTimes))}` : '');
    const slot = $('#itemslot');
    const setSlot = (icon, count, title) => { const html = icon ? `<span class="itm">${icon}</span>` + (count > 1 ? `<span class="cnt">×${count}</span>` : '') : '';
      if (slot._html !== html) { slot.innerHTML = html; slot._html = html; } slot.title = title; };
    if (k.roulette > 0) setSlot(itemEmoji(['banana','green','red','mushroom','star','spiny'][Math.floor(performance.now() / 90) % 6]), 0, '...');
    else if (k.item) setSlot(itemEmoji(k.item), k.itemCount, ITEM_LABEL[k.item] + (k.itemCount > 1 ? ' ×' + k.itemCount : ''));
    else setSlot('', 0, '');
    slot.style.visibility = (k.roulette > 0 || k.item) ? 'visible' : 'hidden'; // original shows no box before the roulette
    Audio8.engine(this.phase === 'racing', Math.abs(k.speed) / Math.max(1, k.stats.top));
    this.drawMinimap(k);
  }
  drawMinimap(me) {
    const cv = $('#minimap'); const ctx = cv.getContext('2d'); const W = cv.width;
    ctx.clearRect(0, 0, W, W);
    if (this.kind === 'battle') { ctx.strokeStyle = '#fff'; ctx.strokeRect(14, 14, W - 28, W - 28);
      for (const k of this.karts) { ctx.fillStyle = '#' + (k.balloonColor || 0xffffff).toString(16).padStart(6, '0'); ctx.beginPath(); ctx.arc(W/2 + k.x / this.arenaSize * W * 0.9, W/2 + k.z / this.arenaSize * W * 0.9, k === me ? 9 : 6, 0, 7); ctx.fill(); } return; }
    if (!this._mm) { let minX=1e9,maxX=-1e9,minZ=1e9,maxZ=-1e9; for (const s of this.samples) { minX=Math.min(minX,s.pos.x);maxX=Math.max(maxX,s.pos.x);minZ=Math.min(minZ,s.pos.z);maxZ=Math.max(maxZ,s.pos.z);} this._mm = { minX, maxX, minZ, maxZ }; }
    const m = this._mm, sx = (W - 24) / (m.maxX - m.minX || 1), sz = (W - 24) / (m.maxZ - m.minZ || 1), sc = Math.min(sx, sz);
    const X = x => 12 + (x - m.minX) * sc, Z = z => 12 + (z - m.minZ) * sc;
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 7; ctx.beginPath();
    this.samples.forEach((s, i) => i ? ctx.lineTo(X(s.pos.x), Z(s.pos.z)) : ctx.moveTo(X(s.pos.x), Z(s.pos.z))); ctx.closePath(); ctx.stroke();
    for (const k of this.karts) { const c = CHARACTERS.find(x => x.id === k.char); ctx.fillStyle = '#' + (c?.color || 0xffffff).toString(16).padStart(6, '0');
      ctx.strokeStyle = k === me ? '#ffd84a' : '#000'; ctx.lineWidth = k === me ? 4 : 1.5; ctx.beginPath(); ctx.arc(X(k.x), Z(k.z), k === me ? 8 : 5.5, 0, 7); ctx.fill(); ctx.stroke(); }
  }
  dispose() { this.disposed = true; cancelAnimationFrame(this.raf); Audio8.engine(false); Audio8.stopMusic();
    this.scene?.traverse(o => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose?.()); }); }
}

// ---------- local flow ----------
function cpuRacers(excludeChars, n) {
  const pool = CHARACTERS.map(c => c.id).filter(id => !excludeChars.includes(id));
  const out = []; let i = 0; while (out.length < n) { const id = pool[i % pool.length] || 'mario'; out.push({ char: id, name: (CHARACTERS.find(c => c.id === id)?.name || id) + (out.some(o => o.char === id) ? ' 2' : ''), human: -1 }); i++; }
  return out;
}
function startRaceLocal(trackId, opts = {}) {
  app.race?.dispose(); hideScreens(); mountTouch(); app.paused = false;
  const humans = app.chars.slice(0, app.players).map((char, i) => ({ char, name: 'P' + (i + 1) + ' ' + CHARACTERS.find(c => c.id === char).name, human: i }));
  const kind = app.mode === 'tt' ? 'tt' : 'race';
  const racers = kind === 'tt' ? humans.slice(0, 1) : [...humans, ...cpuRacers(app.chars.slice(0, app.players), 8 - app.players)];
  // humans start at the back like the original (7th/8th) in GP/VS: put CPUs first on the grid
  const ordered = kind === 'tt' ? racers : [...racers.filter(r => r.human < 0), ...racers.filter(r => r.human >= 0)];
  let ghost = null;
  if (kind === 'tt') { try { ghost = JSON.parse(localStorage.getItem('kart64-ghost-' + trackId) || 'null'); } catch {} }
  if (!opts.quiet) toast(`${trackById(trackId).name} — ${ENGINES[app.engine].label}${app.gp ? ' · Race ' + (app.gp.raceIdx + 1) + '/4' : ''}. Hold A just before GO for a Rocket Start!`, 4200);
  app.race = new Race({ kind, trackId, engine: app.engine, racers: ordered, localHumans: humans.map(h => h.human), mySlot: humans[0]?.human ?? 0,
    demo: !!opts.demo, seed: opts.seed || (Date.now() % 100000), ghost, onFinish: res => handleRaceResults(trackId, res) });
}
function handleRaceResults(trackId, res) {
  app.race?.dispose(); app.race = null;
  const rowsHead = `<tr><th>POS</th><th>RACER</th><th>TIME</th>${app.mode === 'gp' ? '<th>PTS</th><th>TOTAL</th>' : ''}</tr>`;
  if (app.mode === 'tt') {
    const me = res.order[0]; const total = me.time;
    const prevBest = +(localStorage.getItem('kart64-best-' + trackId) || Infinity);
    let note = '';
    if (total && total < prevBest) { localStorage.setItem('kart64-best-' + trackId, String(total)); try { localStorage.setItem('kart64-ghost-' + trackId, JSON.stringify(res.ghost)); } catch {} note = ' — NEW BEST! Ghost saved 👻'; }
    const rows = rowsHead + `<tr class="me"><td>—</td><td>${faceEmoji(me.char)} ${me.name}</td><td>${fmtTime(total)}${note}</td></tr>` +
      me.lapTimes.map((t, i) => `<tr><td></td><td>Lap ${i + 1}</td><td>${fmtTime(t)}</td></tr>`).join('');
    return showResults(`${trackById(trackId).name} — TIME TRIAL`, rows, () => startRaceLocal(trackId), '↻ RACE AGAIN (vs your ghost)');
  }
  if (app.mode === 'gp' && app.gp) {
    res.order.forEach((r, i) => { const key = r.name; app.gp.points[key] = (app.gp.points[key] || 0) + GP_POINTS[i]; r.pts = GP_POINTS[i]; r.total = app.gp.points[key]; });
    const humanBest = Math.min(...res.order.filter(r => r.human >= 0).map(r => r.rank));
    const rows = rowsHead + res.order.map(r => `<tr class="${r.human >= 0 ? 'me' : ''}"><td>${ordinal(r.rank)}</td><td>${faceEmoji(r.char)} ${r.name}</td><td>${fmtTime(r.time)}</td><td>+${r.pts}</td><td>${r.total}</td></tr>`).join('');
    const cupName = CUPS.find(c => c.id === app.gp.cup).name;
    if (humanBest > 4) return showResults(`${trackById(trackId).name} — ${ordinal(humanBest)}: RANK OUT!`, rows, () => { // retry: undo points
      res.order.forEach(r => app.gp.points[r.name] -= r.pts); startRaceLocal(trackId); }, '↻ RETRY RACE (finish top 4!)');
    const nextIdx = app.gp.raceIdx + 1; const tracks = cupTracks(app.gp.cup);
    if (nextIdx >= 4) {
      const standings = Object.entries(app.gp.points).sort((a, b) => b[1] - a[1]);
      const podium = standings.slice(0, 3).map(([n, p], i) => `${['🥇','🥈','🥉'][i]} ${n} — ${p} pts`).join('<br>');
      const s = screen(`<h2>🏆 ${cupName} CHAMPION</h2><div class="sub" style="font-size:20px">${podium}</div>`);
      const tb = document.createElement('table'); tb.innerHTML = rows; s.append(tb);
      s.append(btn('▶ ANOTHER CUP', () => { app.gp = null; showCourseSelect(); }, 'green'), btn('TITLE', showTitle, 'small alt')); return;
    }
    return showResults(`${trackById(trackId).name} — ${cupName} ${app.gp.raceIdx + 1}/4`, rows, () => { app.gp.raceIdx = nextIdx; startRaceLocal(tracks[nextIdx].id); }, `▶ NEXT: ${tracks[nextIdx].name}`);
  }
  const rows = rowsHead + res.order.map(r => `<tr class="${r.human >= 0 ? 'me' : ''}"><td>${ordinal(r.rank)}</td><td>${faceEmoji(r.char)} ${r.name}</td><td>${fmtTime(r.time)}</td></tr>`).join('');
  showResults(`${trackById(trackId).name} — RESULTS`, rows, () => startRaceLocal(trackId), '↻ RACE AGAIN');
}
function startBattleLocal() {
  app.race?.dispose(); hideScreens(); mountTouch(); app.paused = false;
  const humans = app.chars.slice(0, app.players).map((char, i) => ({ char, name: 'P' + (i + 1) + ' ' + CHARACTERS.find(c => c.id === char).name, human: i }));
  const racers = [...humans, ...cpuRacers(app.chars.slice(0, app.players), 4 - app.players)];
  const arena = ARENAS.find(a => a.id === app.arena);
  toast(`${arena.name} — pop 3 balloons to knock each rival out!`, 3500);
  app.race = new Race({ kind: 'battle', arenaId: app.arena, engine: '100cc', racers, localHumans: humans.map(h => h.human), mySlot: 0, seed: Date.now() % 100000,
    onFinish: res => { app.race?.dispose(); app.race = null;
      const rows = `<tr><th>POS</th><th>RACER</th><th>BALLOONS</th></tr>` + res.order.map((r, i) => `<tr class="${r.human >= 0 ? 'me' : ''}"><td>${ordinal(i + 1)}</td><td>${faceEmoji(r.char)} ${r.name}</td><td>${'🎈'.repeat(Math.max(0, r.balloons)) || '💥'}</td></tr>`).join('');
      showResults(`${arena.name} — ${res.order[0]?.name} WINS!`, rows, startBattleLocal, '↻ BATTLE AGAIN'); } });
}
// ---------- online ----------
function showOnline(prefill = '') {
  app.race?.dispose(); app.race = null; closeNet();
  const s = screen(`<h2>🌐 ONLINE PLAY</h2><div class="sub">One player creates a room and shares the 4-letter code or link. Up to 4 players (the N64 limit); races fill to 8 with CPU. The host phone runs the simulation.</div>`);
  const nameIn = document.createElement('input'); nameIn.value = localStorage.getItem('kart64-name') || ''; nameIn.placeholder = 'Your name'; nameIn.maxLength = 12;
  nameIn.style.cssText = 'font:700 16px Arial;border-radius:10px;border:3px solid #fff;padding:9px;background:#111;color:#fff';
  const codeIn = document.createElement('input'); codeIn.className = 'code'; codeIn.placeholder = 'CODE'; codeIn.maxLength = 4; codeIn.value = prefill;
  const status = document.createElement('div'); status.className = 'sub';
  const row1 = document.createElement('div'); row1.className = 'row'; row1.append('Name ', nameIn); s.append(row1);
  s.append(btn('＋ CREATE ROOM', () => createRoom(nameIn.value || 'Player 1', status), 'green'));
  const row2 = document.createElement('div'); row2.className = 'row'; row2.append(codeIn, btn('JOIN ROOM', () => joinRoom(codeIn.value, nameIn.value || 'Player', status), 'small')); s.append(row2);
  s.append(status, btn('◀ BACK', showMode, 'small alt'));
  if (prefill) status.textContent = 'Tap JOIN ROOM to enter ' + prefill;
}
function closeNet() { try { app.net?.room?.close(); } catch {} app.net = null; }
async function createRoom(name, status) {
  status.textContent = 'Creating room… (needs internet for PeerJS)'; localStorage.setItem('kart64-name', name);
  try { const room = new Room(); const code = await room.create();
    app.net = { room, mySlot: 0, host: true, cfg: { mode: 'race', trackId: 'luigi', arenaId: 'donut', engine: '100cc' },
      players: [{ pid: 'host', name, char: 'mario', slot: 0 }] };
    wireHost(room); showLobby(); toast('Room ' + code + ' created');
  } catch (e) { status.textContent = 'Could not create room: ' + (e.message || e); closeNet(); }
}
async function joinRoom(code, name, status) {
  code = (code || '').toUpperCase().trim(); if (code.length !== 4) { status.textContent = 'Enter the 4-letter code.'; return; }
  status.textContent = 'Joining ' + code + '…'; localStorage.setItem('kart64-name', name);
  try { const room = new Room(); app.net = { room, mySlot: -1, host: false, players: [], cfg: null, myName: name, myChar: 'yoshi' };
    wireClient(room); await room.join(code); room.send('host', { t: 'hello', name, char: app.net.myChar });
    status.textContent = 'Connected — waiting for lobby…';
  } catch (e) { status.textContent = e.message || String(e); closeNet(); }
}
function lobbyState() { return { players: app.net.players, cfg: app.net.cfg, code: app.net.room.code }; }
function wireHost(room) {
  room.on('message', (pid, msg) => { const net = app.net; if (!net) return;
    if (msg.t === 'hello') { if (net.players.length >= 4) return room.send(pid, { t: 'full2' });
      const slot = net.players.length; net.players.push({ pid, name: String(msg.name || 'Player').slice(0, 12), char: msg.char || 'yoshi', slot });
      toast(msg.name + ' joined'); room.broadcast({ t: 'lobby', s: lobbyState() }); showLobby(); }
    if (msg.t === 'pick') { const pl = net.players.find(p => p.pid === pid); if (pl) { pl.char = msg.char; room.broadcast({ t: 'lobby', s: lobbyState() }); showLobby(); } }
    if (msg.t === 'input') { if (app.race) app.race.remoteInputs[msg.slot] = decodeInput(msg.i); }
    if (msg.t === 'rematch') { net.rematch = (net.rematch || 0) + 1; toast('A player wants a rematch'); }
  });
  room.on('leave', pid => { const net = app.net; if (!net) return; const pl = net.players.find(p => p.pid === pid);
    net.players = net.players.filter(p => p.pid !== pid); net.players.forEach((p, i) => p.slot = i);
    if (pl) toast(pl.name + ' left'); room.broadcast({ t: 'lobby', s: lobbyState() }); if (!app.race) showLobby(); });
}
function wireClient(room) {
  room.on('message', (pid, msg) => { const net = app.net; if (!net) return;
    if (msg.t === 'lobby') { net.players = msg.s.players; net.cfg = msg.s.cfg;
      const me = net.players.find(p => p.name === net.myName) || net.players[net.players.length - 1];
      // match by assigned slot message order: host echoes players; identify self by peer id stored server-side
      const self = net.players.find(p => p.pid === room.peer?.id); net.mySlot = self ? self.slot : net.mySlot;
      if (!app.race) showLobby(); }
    if (msg.t === 'start') startOnlineRace(msg.cfg, false);
    if (msg.t === 'state' && app.race) app.race.snapshot = msg.s;
    if (msg.t === 'results' && app.race) { const cfg = app.net.cfg; app.race.dispose(); app.race = null; showOnlineResults(msg.r, cfg); }
    if (msg.t === 'full2') toast('Room is full');
  });
  room.on('hostLeft', () => { toast('Host left'); app.race?.dispose(); app.race = null; closeNet(); showMode(); });
}
function showLobby() {
  const net = app.net; if (!net?.room) return;
  const isHost = net.host; const cfg = net.cfg || { mode: 'race', trackId: 'luigi', arenaId: 'donut', engine: '100cc' };
  const s = screen(`<h2>ROOM</h2><div class="bigcode">${net.room.code}</div><div class="sub">Share the code or link. ${net.players.length}/4 players.</div>`);
  const linkRow = document.createElement('div'); linkRow.className = 'row';
  linkRow.append(btn('🔗 COPY JOIN LINK', () => { navigator.clipboard?.writeText(joinLink(net.room.code)).then(() => toast('Link copied')).catch(() => toast(joinLink(net.room.code))); }, 'small alt')); s.append(linkRow);
  const pl = document.createElement('div'); pl.className = 'sub';
  pl.innerHTML = net.players.map(p => `${p.slot === (isHost ? 0 : net.mySlot) ? '▶' : '·'} ${faceEmoji(p.char)} ${p.name} — ${CHARACTERS.find(c => c.id === p.char)?.name}`).join('<br>') || 'Waiting…';
  s.append(pl);
  const g = document.createElement('div'); g.className = 'grid'; s.append(g);
  const myChar = isHost ? net.players[0]?.char : net.myChar;
  for (const c of CHARACTERS) { const t = document.createElement('div'); t.className = 'tile' + (myChar === c.id ? ' sel' : '');
    t.innerHTML = `<div class="face">${faceEmoji(c.id)}</div><div class="nm">${c.name}</div><div class="ds">${c.cls}</div>`;
    t.onclick = () => { if (isHost) { net.players[0].char = c.id; net.room.broadcast({ t: 'lobby', s: lobbyState() }); showLobby(); } else { net.myChar = c.id; net.room.send('host', { t: 'pick', char: c.id }); showLobby(); } }; g.append(t); }
  if (isHost) {
    const mkSel = (label, options, val, fn) => { const row = document.createElement('div'); row.className = 'row'; const lb = document.createElement('span'); lb.className = 'sub'; lb.textContent = label; row.append(lb);
      for (const [v, name] of options) { const b = btn(name, () => { fn(v); net.room.broadcast({ t: 'lobby', s: lobbyState() }); showLobby(); }, 'small' + (val === v ? ' green sel' : ' alt')); row.append(b); } s.append(row); };
    mkSel('Mode', [['race', '🏁 RACE'], ['battle', '🎈 BATTLE']], cfg.mode, v => cfg.mode = v);
    if (cfg.mode === 'race') { mkSel('Engine', ['50cc','100cc','150cc','extra'].map(e => [e, ENGINES[e].label]), cfg.engine, v => cfg.engine = v);
      const trSel = document.createElement('select'); trSel.style.cssText = 'font:700 15px Arial;padding:9px;border-radius:10px';
      trSel.innerHTML = TRACKS.map(t => `<option value="${t.id}" ${t.id === cfg.trackId ? 'selected' : ''}>${t.name}</option>`).join('');
      trSel.onchange = () => { cfg.trackId = trSel.value; net.room.broadcast({ t: 'lobby', s: lobbyState() }); };
      const row = document.createElement('div'); row.className = 'row'; row.append('Course ', trSel); s.append(row); }
    else mkSel('Arena', ARENAS.map(a => [a.id, a.name]), cfg.arenaId, v => cfg.arenaId = v);
    s.append(btn('🏁 START!', () => { const cfgMsg = { ...cfg, players: net.players }; net.room.broadcast({ t: 'start', cfg: cfgMsg }); startOnlineRace(cfgMsg, true); }, 'green'));
  } else s.append(Object.assign(document.createElement('div'), { className: 'sub', textContent: `Host picks: ${cfg.mode === 'battle' ? (ARENAS.find(a => a.id === cfg.arenaId)?.name) : trackById(cfg.trackId).name + ' · ' + ENGINES[cfg.engine].label} — waiting for START…` }));
  s.append(btn('LEAVE ROOM', () => { closeNet(); showMode(); }, 'small alt'));
}
function startOnlineRace(cfg, isHost) {
  const net = app.net; net.cfg = cfg; app.race?.dispose(); hideScreens(); mountTouch(); app.paused = false;
  const players = cfg.players || net.players;
  const humans = players.map(p => ({ char: p.char, name: p.name, human: p.slot }));
  const kind = cfg.mode === 'battle' ? 'battle' : 'race';
  const racers = kind === 'battle' ? humans : [...cpuRacers(humans.map(h => h.char), 8 - humans.length), ...humans];
  app.race = new Race({ kind, trackId: cfg.trackId, arenaId: cfg.arenaId, engine: cfg.engine || '100cc', racers,
    localHumans: [net.mySlot], mySlot: net.mySlot, netRole: isHost ? 'host' : 'client', seed: 4242,
    onFinish: res => { if (isHost) { app.race?.dispose(); app.race = null; showOnlineResults(res, cfg); } } });
}
function showOnlineResults(res, cfg) {
  const isBattle = res.kind === 'battle';
  const rows = `<tr><th>POS</th><th>RACER</th><th>${isBattle ? 'BALLOONS' : 'TIME'}</th></tr>` + res.order.map((r, i) =>
    `<tr class="${r.human === app.net?.mySlot ? 'me' : ''}"><td>${ordinal(isBattle ? i + 1 : r.rank)}</td><td>${faceEmoji(r.char)} ${r.name}</td><td>${isBattle ? ('🎈'.repeat(Math.max(0, r.balloons)) || '💥') : fmtTime(r.time)}</td></tr>`).join('');
  const s = screen(`<h2>${res.order[0]?.name} WINS!</h2>`); const tb = document.createElement('table'); tb.innerHTML = rows; s.append(tb);
  if (app.net?.host) s.append(btn('↻ REMATCH', () => { const cfgMsg = { ...cfg, players: app.net.players }; app.net.room.broadcast({ t: 'start', cfg: cfgMsg }); startOnlineRace(cfgMsg, true); }, 'green'));
  else s.append(btn('↻ ASK REMATCH', () => { app.net.room.send('host', { t: 'rematch' }); toast('Rematch requested — host starts it'); }, 'green'));
  s.append(btn('LOBBY', showLobby, 'small alt'), btn('TITLE', () => { closeNet(); showTitle(); }, 'small alt'));
}

// ---------- boot, pause, test hooks ----------
$('#pauseBtn').onclick = () => { if (!app.race) return; app.paused = !app.paused; toast(app.paused ? 'PAUSED — tap ❚❚ to resume. Esc also quits to title.' : 'Resumed'); };
addEventListener('keydown', e => {
  if ((e.code === 'Enter' || e.code === 'Space') && !app.race && document.querySelector('.logo')) showMode();
  if (e.code === 'Escape' && app.race) { app.race.dispose(); app.race = null; closeNet(); app.paused = false; showTitle(); }
});
mountTouch();
window.__KART__ = { app, Race, CHARACTERS, TRACKS, ARENAS,
  startDemo(trackId = 'mario', char = 'toad', engine = '150cc', kind = 'race') { app.mode = kind === 'battle' ? 'battle' : 'vs'; app.players = 1; app.engine = engine; app.chars = [char, 'mario'];
    if (kind === 'battle') { app.arena = trackId; startBattleLocal(); app.race.demo = true; } else startRaceLocal(trackId, { demo: true, seed: 99 }); return true; },
  state() { const r = app.race; if (!r) return { race: false }; const me = r.me();
    return { race: true, kind: r.kind, phase: r.phase, time: +r.time.toFixed(2), trackLength: r.trackLength,
      me: { x: +me.x.toFixed(1), z: +me.z.toFixed(1), speed: +me.speed.toFixed(1), lap: me.lap, rank: me.rank, progress: me.progress, item: me.item },
      karts: r.karts.map(k => ({ name: k.name, rank: k.rank, lap: k.lap, speed: +k.speed.toFixed(1) })) }; },
  screens: { title: showTitle, mode: showMode, chars: () => showCharSelect(0), courses: showCourseSelect, online: () => showOnline(),
    players: showPlayers, engine: showEngine, cups: () => { app.mode = 'gp'; showCourseSelect(); }, arenas: () => { app.mode = 'battle'; showCourseSelect(); } },
  finishNow() { const r = app.race; if (!r) return false; r.phase = 'racing';
    if (r.kind === 'battle') { r.karts.forEach((k, i) => { if (i > 0 && !r.battleOrder?.includes(k)) { k.balloons = 0; k.bomb = false; k.alive = false; k.mesh.visible = false; (r.battleOrder = r.battleOrder || []).push(k); } }); r.checkBattleEnd(); }
    else { r.karts.forEach(k => { if (k.human >= 0 && !k.finished) { k.finished = true; k.finishTime = Math.max(1, r.time); k.lapTimes = [r.time / 3, r.time / 3, r.time / 3]; } }); r.updateRanks(); r.checkRaceEnd(); }
    return true; },
  startSplit(trackId = 'luigi') { app.mode = 'vs'; app.players = 2; app.engine = '100cc'; app.chars = ['mario', 'yoshi']; startRaceLocal(trackId, { demo: true, seed: 7 }); return true; },
  startGPFinale() { app.mode = 'gp'; app.players = 1; app.engine = '100cc'; app.chars = ['toad', 'mario']; app.cup = 'mushroom';
    app.gp = { cup: 'mushroom', raceIdx: 3, points: { 'P1 Toad': 24, Mario: 18, Luigi: 12 } }; startRaceLocal('desert', { demo: true, seed: 3 }); return true; },
};
if (Q.get('autotest')) {
  const kind = Q.get('kind') || 'race';
  window.__KART__.startDemo(Q.get('track') || 'mario', Q.get('char') || 'toad', Q.get('engine') || '150cc', kind);
} else if (Q.get('screen') === 'mode') showMode();
else if (Q.get('screen') === 'chars') { app.mode = 'vs'; showCharSelect(0); }
else if (Q.get('screen') === 'courses') { app.mode = 'vs'; showCourseSelect(); }
else if (Q.get('screen') === 'online') showOnline();
else if (Q.get('room')) showTitle();
else showTitle();
// default demo behind title after idle? keep title clean for screenshots.
