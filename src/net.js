// PeerJS room transport — same approach as ../smash64/src/net/room.js (star topology,
// 4-letter code, host simulations, STUN + public TURN fallback for cellular NATs).
/* global Peer */
const PREFIX = 'kart64-play-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export const MAX_PLAYERS = 4;
const ICE = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
];
export function randomCode() { let s = ''; for (let i = 0; i < 4; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)]; return s; }
export class Room {
  constructor() { this.peer = null; this.conns = new Map(); this.host = null; this.isHost = false; this.code = null; this.handlers = {}; this.closed = false; }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  emit(ev, ...a) { this.handlers[ev]?.(...a); }
  makePeer(id) { if (!window.Peer) throw new Error('PeerJS failed to load (no network?)'); return new Peer(id, { config: { iceServers: ICE }, debug: 0 }); }
  create(tries = 0) {
    return new Promise((resolve, reject) => {
      const code = randomCode(); const peer = this.makePeer(PREFIX + code);
      peer.on('open', () => { this.peer = peer; this.code = code; this.isHost = true; peer.on('connection', c => this.accept(c)); peer.on('disconnected', () => { if (!this.closed) peer.reconnect(); }); resolve(code); });
      peer.on('error', e => { if (e.type === 'unavailable-id' && tries < 5) { peer.destroy(); this.create(tries + 1).then(resolve, reject); } else if (!this.peer) reject(e); else this.emit('error', e); });
    });
  }
  accept(conn) {
    conn.on('open', () => { if (this.conns.size >= MAX_PLAYERS - 1) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 500); return; } this.conns.set(conn.peer, conn); this.emit('join', conn.peer); });
    conn.on('data', msg => this.emit('message', conn.peer, msg));
    const gone = () => { if (this.conns.delete(conn.peer)) this.emit('leave', conn.peer); };
    conn.on('close', gone); conn.on('error', gone);
  }
  join(code) {
    return new Promise((resolve, reject) => {
      code = code.toUpperCase().trim(); const peer = this.makePeer(undefined); let done = false;
      const fail = e => { if (!done) { done = true; reject(e); } else this.emit('error', e); };
      peer.on('error', e => fail(e.type === 'peer-unavailable' ? new Error('Room ' + code + ' not found') : e));
      peer.on('open', id => {
        this.peer = peer; this.code = code;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        const timer = setTimeout(() => fail(new Error('Could not reach room ' + code)), 15000);
        conn.on('open', () => { clearTimeout(timer); done = true; this.host = conn; resolve(id); });
        conn.on('data', msg => { if (msg?.t === 'full') fail(new Error('Room is full')); else this.emit('message', 'host', msg); });
        conn.on('close', () => { if (!this.closed) this.emit('hostLeft'); });
        conn.on('error', e => fail(e));
      });
    });
  }
  send(to, msg) { if (to === 'host') { if (this.host?.open) this.host.send(msg); return; } const c = this.conns.get(to); if (c?.open) c.send(msg); }
  broadcast(msg) { for (const c of this.conns.values()) if (c.open) c.send(msg); }
  close() { this.closed = true; try { this.peer?.destroy(); } catch {} this.conns.clear(); }
}
export function joinLink(code) { const u = new URL(location.href); u.search = '?room=' + code; return u.toString(); }
export function encodeInput(i) { return [Math.round((i.steer || 0) * 50), (i.accel ? 1 : 0) | (i.brake ? 2 : 0) | (i.drift ? 4 : 0) | (i.item ? 8 : 0)]; }
export function decodeInput(a) { return { steer: (a?.[0] || 0) / 50, accel: !!(a?.[1] & 1), brake: !!(a?.[1] & 2), drift: !!(a?.[1] & 4), item: !!(a?.[1] & 8) }; }
