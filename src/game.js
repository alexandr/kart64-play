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
function itemEmoji(id) { return { banana: '🍌', bunch: '🍌×5', green: '🐢', tripleGreen: '🐢×3', red: '🔴', tripleRed: '🔴×3', spiny: '💙', fake: '❔', mushroom: '🍄', tripleMushroom: '🍄×3', golden: '🌟🍄', lightning: '⚡', star: '⭐', boo: '👻' }[id] || '❓'; }
// ---------- menus ----------
function showTitle() {
  Audio8.music('off'); app.race?.dispose(); app.race = null;
  const s = screen(`<h1 class="logo">KART 64</h1><div class="sub">A from-scratch fan recreation of the 1996 N64 classic — original art &amp; sound, no ROM.<br>16 courses · 4 battle arenas · 8 racers · online rooms · phone controls</div>`, true);
  s.append(btn('▶ PRESS START', showMode, 'green'));
  const roomCode = (Q.get('room') || '').toUpperCase();
  if (/^[A-Z]{4}$/.test(roomCode)) s.append(btn(`🌐 JOIN ROOM ${roomCode}`, () => showOnline(roomCode), 'alt'));
  s.insertAdjacentHTML('beforeend', `<div class="kbd">Arrows/WASD drive · SPACE drift/hop · Q item · P2: IJKL + U/O · Gamepad supported<br>Phone: left stick steers, A/B/DRIFT/ITEM buttons on the right</div>`);
}
function showMode() {
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
    t.innerHTML = `<div class="face">${faceEmoji(c.id)}</div><div class="nm" style="color:#${c.color.toString(16).padStart(6, '0')}">${c.name}</div><div class="ds">${c.cls.toUpperCase()}<br>SPD ${st.top} · ACC ${st.accel}<br>HND ${st.handling} · WT ${st.weight}</div>`;
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
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const resize = () => renderer.setSize(innerWidth, innerHeight);
  addEventListener('resize', resize); resize(); return renderer;
}
const MAT = c => new THREE.MeshLambertMaterial({ color: c });
function box(w, h, d, c, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT(c)); m.position.set(x, y, z); return m; }
function buildKartMesh(char) {
  const g = new THREE.Group(); const c = CHARACTERS.find(x => x.id === char) || CHARACTERS[0];
  const body = box(1.7, 0.5, 2.4, c.color, 0, 0.45, 0); g.add(body);
  g.add(box(1.5, 0.35, 0.8, 0x333333, 0, 0.72, 0.65)); // seat back
  g.add(box(0.9, 0.7, 0.55, c.color, 0, 1.05, 0.35)); // torso
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), MAT(c.skin)); head.position.set(0, 1.62, 0.35); g.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.46, 0.25, 10), MAT(c.hat)); hat.position.set(0, 1.92, 0.35); g.add(hat);
  if (char === 'toad') { hat.scale.set(1.3, 1.1, 1.3); const dot = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), MAT(0xe52521)); dot.position.set(0.2, 2.05, 0.35); g.add(dot); }
  if (char === 'yoshi') { const nose = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), MAT(0x52c234)); nose.position.set(0, 1.55, -0.05); g.add(nose); }
  if (char === 'bowser') for (let i = -1; i <= 1; i++) { const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 6), MAT(0xffffff)); spike.position.set(i * 0.35, 1.15, 0.72); g.add(spike); }
  g.add(box(1.1, 0.12, 0.5, 0x222222, 0, 0.95, -0.35)); // steering area
  const wheelG = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheels = [];
  for (const [x, z] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) {
    const w = new THREE.Mesh(wheelG, MAT(0x1a1a1a)); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w); wheels.push(w); }
  const balloons = new THREE.Group(); g.add(balloons);
  const orbit = new THREE.Group(); g.add(orbit);
  g.userData = { wheels, balloons, orbit, body };
  return g;
}
function setBalloons(mesh, n, color) {
  const b = mesh.userData.balloons; b.clear();
  for (let i = 0; i < n; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), MAT(color)); const a = i / Math.max(1, n) * Math.PI * 2; s.position.set(Math.cos(a) * 1.1, 1.5, Math.sin(a) * 1.1); b.add(s); }
}
function buildTrackScene(tr, mirror) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(tr.sky);
  scene.fog = new THREE.Fog(tr.fog, 90, 420);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(60, 120, 40); scene.add(sun);
  let pts = tr.points.map(p => new THREE.Vector3(mirror ? -p[0] : p[0], p[1], p[2]));
  if (mirror) pts = pts.reverse();
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const N = 360, samples = [];
  for (let i = 0; i < N; i++) { const t = i / N, pos = curve.getPointAt(t), tan = curve.getTangentAt(t); tan.y = 0; tan.normalize();
    samples.push({ pos, tan, side: new THREE.Vector3(-tan.z, 0, tan.x) }); }
  let length = 0; for (let i = 0; i < N; i++) length += samples[i].pos.distanceTo(samples[(i + 1) % N].pos);
  // road ribbon (+ wider edge ribbon beneath)
  const mkRibbon = (halfW, yOff, colorFn) => {
    const verts = [], cols = [], idx = [];
    for (let i = 0; i <= N; i++) { const s = samples[i % N];
      for (const sgn of [-1, 1]) { const p = s.pos.clone().addScaledVector(s.side, sgn * halfW); verts.push(p.x, s.pos.y + yOff, p.z);
        const c = new THREE.Color(colorFn(i)); cols.push(c.r, c.g, c.b); }
      if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  };
  const rainbowCols = [0xe52521, 0xf08c1e, 0xf7d117, 0x2fae3f, 0x2f6bff, 0x9a5ad8];
  scene.add(mkRibbon(tr.width / 2 + 1.6, -0.06, i => (Math.floor(i / 4) % 2 ? tr.edge : 0xffffff)));
  scene.add(mkRibbon(tr.width / 2, 0.02, i => tr.rainbow ? rainbowCols[Math.floor(i / 6) % 6] : tr.road));
  // start line (checker)
  const s0 = samples[0]; const start = box(tr.width, 0.08, 3, 0xffffff, s0.pos.x, s0.pos.y + 0.08, s0.pos.z);
  start.rotation.y = Math.atan2(s0.tan.x, s0.tan.z); scene.add(start);
  // ground
  const minY = Math.min(...samples.map(s => s.pos.y));
  const groundY = tr.fall ? minY - 14 : minY - 0.25;
  if (!tr.rainbow) { const gnd = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), MAT(tr.fall && tr.off === 'water' ? 0x1a4a8a : tr.fall && tr.off === 'lava' ? 0xe85a17 : tr.ground));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = groundY; scene.add(gnd); }
  else { const starGeo = new THREE.BufferGeometry(); const sv = []; const r = mulberry(7);
    for (let i = 0; i < 700; i++) sv.push((r() - 0.5) * 1400, r() * 260 - 60, (r() - 0.5) * 1400);
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3)); scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2 }))); }
  // walls (visual blocks on walled courses)
  if (tr.wall) for (let i = 0; i < N; i += 6) { const s = samples[i];
    for (const sgn of [-1, 1]) { const p = s.pos.clone().addScaledVector(s.side, sgn * (tr.width / 2 + 1.7));
      const w = box(1, 1.1, length / N * 6.2, Math.floor(i / 6) % 2 ? tr.edge : 0xf2f2f2, p.x, s.pos.y + 0.5, p.z); w.rotation.y = Math.atan2(s.tan.x, s.tan.z); scene.add(w); } }
  // decor
  const rng = mulberry(tr.id.length * 977 + 13);
  const decorCols = { tree: 0x2f8f2f, pine: 0x2a6e46, palm: 0x3fbf5a, cactus: 0x3f9e4d, rock: 0x8a7a66, pipe: 0x2fae3f, lamp: 0xf7d117, tire: 0x2a2a2a, fence: 0xb98a56, star: 0xffd84a };
  for (let i = 0; i < 90; i++) { const s = samples[Math.floor(rng() * N)]; const sgn = rng() > 0.5 ? 1 : -1;
    const p = s.pos.clone().addScaledVector(s.side, sgn * (tr.width / 2 + 5 + rng() * 26)); const y = tr.fall ? Math.max(groundY, s.pos.y - 0.3) : s.pos.y;
    let m; const col = decorCols[tr.decor] || 0x2f8f2f;
    if (['tree', 'pine', 'palm'].includes(tr.decor)) { m = new THREE.Group(); m.add(box(0.5, 2.2, 0.5, 0x7a4a22, 0, 1.1, 0));
      const top = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.6, 7), MAT(col)); top.position.y = 3.6; m.add(top); }
    else if (tr.decor === 'cactus') { m = box(0.7, 3, 0.7, col, 0, 1.5, 0); }
    else if (tr.decor === 'pipe') { m = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 10), MAT(col)); m.position.y = 1.1; }
    else if (tr.decor === 'lamp') { m = new THREE.Group(); m.add(box(0.25, 4, 0.25, 0x555555, 0, 2, 0)); m.add(box(0.7, 0.5, 0.7, col, 0, 4.2, 0)); }
    else if (tr.decor === 'star') { m = new THREE.Mesh(new THREE.OctahedronGeometry(1.1), MAT(col)); m.position.y = 2 + rng() * 5; }
    else { m = box(1.6, 1.2, 1.6, col, 0, 0.6, 0); }
    m.position.x += p.x; m.position.z += p.z; if (m.position.y === 0) m.position.y = y; scene.add(m); }
  return { scene, samples, N, length, groundY };
}
function buildArenaScene(ar) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(ar.sky); scene.fog = new THREE.Fog(ar.sky, 90, 320);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95)); const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(50, 100, 30); scene.add(sun);
  const S = ar.size, obstacles = [];
  const floor = new THREE.Mesh(new THREE.CircleGeometry(S / 2, 28), MAT(ar.ground)); floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const addBlock = (x, z, w, d, h, c) => { const m = box(w, h, d, c, x, h / 2, z); scene.add(m); obstacles.push({ x, z, hw: w / 2, hd: d / 2, h }); };
  if (ar.kind === 'donut') { const lava = new THREE.Mesh(new THREE.CircleGeometry(16, 24), MAT(0xe85a17)); lava.rotation.x = -Math.PI / 2; lava.position.y = -0.5; scene.add(lava);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; addBlock(Math.cos(a) * 26, Math.sin(a) * 26, 8, 3, 1.2, 0x8a8a94); } }
  if (ar.kind === 'fort') { const cols = [0xe52521, 0x2f6bff, 0x2fae3f, 0xf7d117];
    [[-30, -30], [30, -30], [-30, 30], [30, 30]].forEach(([x, z], i) => { addBlock(x, z - 8, 18, 3, 5, cols[i]); addBlock(x - 8, z, 3, 16, 5, cols[i]); addBlock(x + 8, z, 3, 16, 5, cols[i]); }); }
  if (ar.kind === 'deck') { addBlock(0, -22, 40, 4, 4, 0x6a6a74); addBlock(0, 22, 40, 4, 4, 0x6a6a74); addBlock(-22, 0, 4, 40, 4, 0x6a6a74); addBlock(22, 0, 4, 40, 4, 0x6a6a74); addBlock(0, 0, 10, 10, 2, 0x8a8a94); }
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
    this.renderer = getRenderer(); this.cameras = [new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900), new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 900)];
    this.rng = mulberry(cfg.seed || 12345); this.onFinish = cfg.onFinish || (() => {});
    this.remoteInputs = {}; this.snapshot = null; this.ghostRecord = []; this.ghostPlayback = cfg.ghost || null; this.demo = !!cfg.demo;
    if (this.kind === 'battle') this.setupBattle(); else this.setupRace();
    this.setupKarts(); this.setupPickups();
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
  setupHazards() {
    const add = (type, frac, lat, mesh, r) => { const s = this.sampleAt(frac); const p = s.pos.clone().addScaledVector(s.side, lat);
      mesh.position.set(p.x, s.pos.y, p.z); this.scene.add(mesh); this.hazards.push({ type, frac, lat, mesh, r, phase: this.rng() * 6 }); };
    for (const hz of this.tr.hazards) {
      if (hz === 'car') for (let i = 0; i < 5; i++) add('car', i / 5, i % 2 ? 3.5 : -3.5, box(2.2, 1.8, 5, [0xf7d117, 0x2f6bff, 0xe52521, 0xffffff, 0x2fae3f][i], 0, 1, 0), 2.6);
      if (hz === 'train') add('train', 0.32, 0, box(3, 3, 26, 0x8a2a2a, 0, 1.6, 0), 3);
      if (hz === 'penguin') for (let i = 0; i < 4; i++) add('penguin', 0.15 + i * 0.2, 0, box(0.9, 1.2, 0.9, 0x223355, 0, 0.6, 0), 1.3);
      if (hz === 'snowman') for (let i = 0; i < 5; i++) add('snowman', 0.1 + i * 0.18, (i % 2 ? 3 : -3), box(1.1, 1.6, 1.1, 0xffffff, 0, 0.8, 0), 1.3);
      if (hz === 'mole') for (let i = 0; i < 4; i++) add('mole', 0.2 + i * 0.18, (i % 2 ? 2 : -2), box(1, 0.7, 1, 0x6a4a2a, 0, 0.35, 0), 1.2);
      if (hz === 'crab') for (let i = 0; i < 4; i++) add('crab', 0.12 + i * 0.22, 0, box(1.2, 0.5, 0.8, 0xe5452a, 0, 0.3, 0), 1.2);
      if (hz === 'piranha') for (let i = 0; i < 3; i++) add('piranha', 0.25 + i * 0.25, (i % 2 ? 4 : -4), box(1, 1.4, 1, 0xe52521, 0, 0.7, 0), 1.2);
      if (hz === 'thwomp') for (let i = 0; i < 3; i++) add('thwomp', 0.2 + i * 0.28, 0, box(3.4, 3, 3.4, 0x7a7a8a, 0, 5, 0), 2.4);
      if (hz === 'boulder') for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(1.4, 9, 7), MAT(0x6a5136)); add('boulder', 0.3 + i * 0.2, 0, m, 1.8); }
      if (hz === 'egg') { const m = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 9), MAT(0xffffff)); m.scale.y = 1.25; add('egg', 0.5, 0, m, 3); }
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
    if (this.kind === 'battle') this.karts.forEach((k, i) => { const a = i / this.karts.length * Math.PI * 2; k.x = Math.cos(a) * this.arenaSize * 0.3; k.z = Math.sin(a) * this.arenaSize * 0.3; k.h = Math.atan2(-k.x, -k.z); k.y = 0; k.tx = k.x; k.tz = k.z; k.th = k.h; });
    else this.karts.forEach((k, i) => { const back = 6 + Math.floor(i / 2) * 5, lat = (i % 2 ? 3 : -3);
      const idx = (this.N - Math.round(back / this.trackLength * this.N) + this.N) % this.N; const s = this.samples[idx];
      const p = s.pos.clone().addScaledVector(s.side, lat); k.x = p.x; k.z = p.z; k.y = s.pos.y; k.h = Math.atan2(s.tan.x, s.tan.z);
      k.idx = idx; k.progress = -Math.round(back / this.trackLength * this.N); k.tx = k.x; k.ty = k.y; k.tz = k.z; k.th = k.h; });
    if (this.ghostPlayback?.length) { this.ghostMesh = buildKartMesh(this.karts[0].char);
      this.ghostMesh.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.35; } }); this.scene.add(this.ghostMesh); }
  }
  setupPickups() {
    const addBox = (x, y, z) => { const m = box(1.5, 1.5, 1.5, 0xffd84a, x, y + 1, z); m.material = new THREE.MeshLambertMaterial({ color: 0xffd84a, emissive: 0x664400 });
      this.scene.add(m); this.boxes.push({ x, y: y + 1, z, t: 0, mesh: m }); };
    if (this.kind === 'battle') { const n = 10; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; addBox(Math.cos(a) * this.arenaSize * 0.32, 0, Math.sin(a) * this.arenaSize * 0.32); } addBox(0, 0, 0); return; }
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
    if (this.phase === 'racing' && Math.abs(k.speed) < 1.2 && k.spin <= 0) { k.stuckT = (k.stuckT || 0) + dt;
      if (k.stuckT > 1.6) { // unstick: snap heading to the racing line / arena centre and roll
        if (this.kind !== 'battle') { const cs = this.samples[k.idx]; k.h = Math.atan2(cs.pos.x + cs.tan.x * 8 - k.x, cs.pos.z + cs.tan.z * 8 - k.z); }
        else k.h = Math.atan2(-k.x, -k.z);
        k.speed = 5; k.stuckT = 0; } } else k.stuckT = 0;
    if (this.kind === 'battle') {
      const foes = this.karts.filter(o => o !== k && o.alive);
      const boxAvail = this.boxes.find(b => b.t <= 0);
      const target = !k.item && boxAvail ? boxAvail : foes.sort((a, b) => ((a.x-k.x)**2+(a.z-k.z)**2) - ((b.x-k.x)**2+(b.z-k.z)**2))[0];
      if (!target) return { steer: 0, accel: false, brake: false, drift: false, item: false };
      tx = target.x; tz = target.z;
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
    let want = Math.atan2(tx - k.x, tz - k.z);
    let diff = want - k.h; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    k.cpuItemT -= dt; let item = false;
    if (k.item && k.cpuItemT <= 0) { item = true; k.cpuItemT = 2 + this.rng() * 6; }
    return { steer: clamp(diff * 1.6, -1, 1), accel: Math.abs(diff) < 2.4 || Math.abs(k.speed) < 3, brake: Math.abs(diff) > 2.4 && k.speed > 4, drift: Math.abs(diff) > 0.85 && k.speed > k.stats.top * 0.55, item };
  }
  hitKart(k, kind = 'spin', by = null) {
    if (k.star > 0 || k.ghostT > 0 || k.rescue > 0 || k.spin > 0.4) return false;
    if (this.kind === 'battle') {
      if (k.hitCooldown > 0) return false;
      k.balloons--; k.hitCooldown = 2; k.spin = 0.9; Audio8.beep(180, 0.25, 'sawtooth', 0.15);
      setBalloons(k.mesh, Math.max(0, k.balloons), k.balloonColor);
      if (k.balloons <= 0) { k.alive = false; k.mesh.visible = false; this.battleOrder = this.battleOrder || []; this.battleOrder.push(k); this.checkBattleEnd(); }
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
    const mesh = kind === 'banana' ? new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), MAT(0xf7d117)) : box(1.5, 1.5, 1.5, 0xff6a5e, 0, 0.8, 0);
    mesh.position.set(x, y + 0.5, z); if (kind === 'banana') { mesh.scale.set(1, 0.6, 1.6); mesh.position.y = y + 0.3; }
    this.scene.add(mesh); this.placed.push({ kind, x, y, z, owner: owner?.id, grace: 1, mesh });
  }
  fireShell(k, kind) {
    const col = kind === 'green' ? 0x2fae3f : kind === 'red' ? 0xe52521 : 0x2f6bff;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), MAT(col)); mesh.scale.y = 0.6;
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
      for (let i = 0; i < k.itemCount; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), MAT(col)); m.scale.y = 0.6; o.add(m); }
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
    } else roadY = 0;
    // hop / drift
    if (input.drift && !k.prevDriftBtn && Math.abs(k.speed) > 5 && k.hopT <= 0) { k.hopT = 0.28; k.vy = 4.5; Audio8.beep(500, 0.06, 'square', 0.05); }
    if (k.hopT > 0) k.y = roadY + Math.sin((0.28 - k.hopT) / 0.28 * Math.PI) * 0.7; else k.y = roadY;
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
      if (this.ar.kind === 'scraper' && d > maxR + 4) { this.hitKart(k, 'spin'); k.x *= 0.3; k.z *= 0.3; k.speed = 0; k.rescue = 1; }
      else if (d > maxR) { k.x *= maxR / d; k.z *= maxR / d; k.speed *= 0.6; }
      if (this.ar.kind === 'donut' && d < 16) { if (k.hitCooldown <= 0) this.hitKart(k, 'spin'); const s2 = 20 / Math.max(1, d); k.x *= s2; k.z *= s2; k.speed *= 0.4; }
      for (const o of this.obstacles) { if (Math.abs(k.x - o.x) < o.hw + 1 && Math.abs(k.z - o.z) < o.hd + 1) {
        const px = o.hw + 1 - Math.abs(k.x - o.x), pz = o.hd + 1 - Math.abs(k.z - o.z);
        if (px < pz) k.x += Math.sign(k.x - o.x) * px; else k.z += Math.sign(k.z - o.z) * pz; k.speed *= 0.55; } }
    }
    // item boxes
    if (!k.item && k.roulette <= 0 && k.alive) for (const b of this.boxes) { if (b.t > 0) continue;
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
      for (const k of this.karts) { if (!k.alive) continue; if (k.id === p.owner && p.grace > 0) continue; if (k.ghostT > 0) continue;
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
  checkBattleEnd() { const alive = this.karts.filter(k => k.alive); if (alive.length <= 1 && this.phase === 'racing') this.finish(); }
  finish() {
    if (this.phase === 'done') return; this.phase = 'done'; Audio8.engine(false); Audio8.music('menu');
    setTimeout(() => { if (!this.disposed) this.onFinish(this.results()); }, 1400);
  }
  results() {
    if (this.kind === 'battle') { const alive = this.karts.filter(k => k.alive); const order = [...alive, ...(this.battleOrder || []).slice().reverse()];
      return { kind: 'battle', order: order.map(k => ({ id: k.id, name: k.name, char: k.char, human: k.human, balloons: k.balloons })) }; }
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
    this.stepProjectiles(dt); this.stepCollisions(dt); if (this.kind !== 'battle') this.stepHazards(dt);
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
      k: this.karts.map(k => [+k.x.toFixed(1), +k.y.toFixed(1), +k.z.toFixed(1), +k.h.toFixed(2), +k.speed.toFixed(1), k.item, k.itemCount, k.lap, k.rank, k.balloons, k.alive ? 1 : 0, k.spin > 0 ? 1 : 0, k.shrink > 0 ? 1 : 0, k.star > 0 ? 1 : 0, k.drifting ? (k.drift?.stage || 0) + 1 : 0, k.finished ? 1 : 0, k.finishTime]),
      p: this.projectiles.map(p => [p.kind, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]),
      b: this.placed.map(p => [p.kind, +p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)]),
      boxes: this.boxes.map(b => b.t > 0 ? 0 : 1).join('') };
  }
  clientStep(dt) {
    // send my input ~20 Hz
    this.netTimer -= dt;
    if (this.netTimer <= 0 && app.net?.room) { this.netTimer = 1 / 20; app.net.room.send('host', { t: 'input', slot: this.cfg.mySlot, i: encodeInput(pollInput(0)) }); }
    const s = this.snapshot; if (!s) return;
    this.time = s.time; if (s.phase === 'racing' && this.phase === 'countdown') { this.phase = 'racing'; this.flashMsg('GO!'); $('#lights').innerHTML = ''; }
    s.k.forEach((a, i) => { const k = this.karts[i]; if (!k) return;
      [k.tx, k.ty, k.tz, k.th, k.speed] = a; k.item = a[5]; k.itemCount = a[6]; k.lap = a[7]; k.rank = a[8];
      if (k.balloons !== a[9]) { k.balloons = a[9]; if (this.kind === 'battle') setBalloons(k.mesh, Math.max(0, k.balloons), k.balloonColor); }
      k.alive = !!a[10]; k.spin = a[11] ? 0.5 : 0; k.shrink = a[12] ? 1 : 0; k.star = a[13] ? 1 : 0; k.finished = !!a[15]; k.finishTime = a[16];
      k.mesh.visible = k.alive; });
    // rebuild projectile / placed visuals cheaply
    const syncDyn = (arr, list, make) => { while (list.length < arr.length) { const m = make(arr[list.length][0]); this.scene.add(m); list.push(m); }
      while (list.length > arr.length) { this.scene.remove(list.pop()); }
      arr.forEach((a, i) => list[i].position.set(a[1], a[2] + 0.5, a[3])); };
    this._dynP = this._dynP || []; this._dynB = this._dynB || [];
    syncDyn(s.p, this._dynP, kind => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), MAT(kind === 'green' ? 0x2fae3f : kind === 'red' ? 0xe52521 : 0x2f6bff)); m.scale.y = 0.6; return m; });
    syncDyn(s.b, this._dynB, kind => kind === 'banana' ? Object.assign(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), MAT(0xf7d117)), {}) : box(1.5, 1.5, 1.5, 0xff6a5e));
    this.boxes.forEach((b, i) => b.mesh.visible = s.boxes?.[i] === '1');
    for (const b of this.boxes) b.mesh.rotation.y += dt * 2.4;
    if (this.kind !== 'battle') this.stepHazardsVisualOnly(dt);
  }
  stepHazardsVisualOnly(dt) { const save = this.karts; this.karts = []; this.stepHazards(dt); this.karts = save; }
  syncMeshes(dt) {
    const t = performance.now() / 1000;
    for (const k of this.karts) {
      if (this.cfg.netRole === 'client') { const f = clamp(dt * 12, 0, 1); k.x = lerp(k.x, k.tx, f); k.y = lerp(k.y, k.ty, f); k.z = lerp(k.z, k.tz, f); k.h = angLerp(k.h, k.th, f); }
      k.mesh.position.set(k.x, k.y, k.z); k.mesh.rotation.set(0, k.h, 0);
      if (k.drifting) k.mesh.rotation.z = -k.drift.dir * 0.12; 
      const sc = k.shrink > 0 ? 0.55 : 1; k.mesh.scale.set(sc, sc * (k.flat > 0 ? 0.35 : 1), sc);
      k.wheelRot += k.speed * dt * 2.2; for (const w of k.mesh.userData.wheels) w.rotation.x = k.wheelRot;
      k.mesh.traverse(o => { if (o.material && o.material.transparent !== undefined && o.geometry?.type !== 'SphereGeometry') {} });
      k.mesh.visible = k.alive;
      const ghost = k.ghostT > 0; k.mesh.userData.body.material.transparent = ghost; k.mesh.userData.body.material.opacity = ghost ? 0.3 : 1;
      if (k.star > 0) k.mesh.userData.body.material.emissive?.setHSL((t * 2) % 1, 1, 0.45); else k.mesh.userData.body.material.emissive?.setHex(0x000000);
      const orb = k.mesh.userData.orbit; orb.children.forEach((m, i) => { const a = t * 4 + i * (Math.PI * 2 / Math.max(1, orb.children.length)); m.position.set(Math.cos(a) * 1.6, 0.55, Math.sin(a) * 1.6); });
    }
    if (this.ghostMesh && this.ghostPlayback) { const idx = clamp(Math.floor(Math.max(0, this.time) * 10), 0, this.ghostPlayback.length - 1); const g = this.ghostPlayback[idx];
      if (g) { this.ghostMesh.position.set(g[0], g[1], g[2]); this.ghostMesh.rotation.y = g[3]; } }
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
      const dist = 9.5, height = 4.2;
      const cx = k.x - fx * dist, cz = k.z - fz * dist;
      cam.position.x = lerp(cam.position.x || cx, cx, 0.18); cam.position.z = lerp(cam.position.z || cz, cz, 0.18);
      cam.position.y = k.y + height;
      cam.lookAt(k.x + fx * 9, k.y + 1.1, k.z + fz * 9);
      r.render(this.scene, cam);
    });
    r.setScissorTest(false);
  }
  updateHUD() {
    const k = this.me(); if (!k) return;
    if (this.kind === 'battle') { $('#pos').textContent = k.alive ? '🎈×' + k.balloons : 'OUT!'; $('#lap').textContent = this.karts.filter(x => x.alive).length + ' LEFT'; $('#balloons').textContent = '🎈'.repeat(Math.max(0, k.balloons)); }
    else { $('#pos').textContent = this.tr.mystery && !k.finished ? '?th' : ordinal(k.rank); $('#lap').textContent = `LAP ${clamp(k.lap, 1, this.tr.laps)}/${this.tr.laps}`; $('#balloons').textContent = ''; }
    const lapCur = this.phase === 'racing' ? Math.max(0, this.time - (k.lapStart || 0)) : 0;
    $('#timer').textContent = `TIME ${fmtTime(Math.max(0, this.time))}\nLAP  ${fmtTime(lapCur)}` + (k.lapTimes.length ? `\nBEST ${fmtTime(Math.min(...k.lapTimes))}` : '');
    const slot = $('#itemslot');
    if (k.roulette > 0) { slot.textContent = itemEmoji(['banana','green','red','mushroom','star','spiny'][Math.floor(performance.now() / 90) % 6]); slot.title = '...'; }
    else if (k.item) { slot.textContent = itemEmoji(k.item); slot.title = ITEM_LABEL[k.item] + (k.itemCount > 1 ? ' ×' + k.itemCount : ''); }
    else { slot.textContent = ''; slot.title = ''; }
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
  toast(`${trackById(trackId).name} — ${ENGINES[app.engine].label}${app.gp ? ' · Race ' + (app.gp.raceIdx + 1) + '/4' : ''}. Hold A just before GO for a Rocket Start!`, 4200);
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
  screens: { title: showTitle, mode: showMode, chars: () => showCharSelect(0), courses: showCourseSelect, online: () => showOnline() },
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
