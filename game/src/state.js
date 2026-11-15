// state.js — the single store. Every mutable fact about a match lives in the
// object createState returns; modules read and write it, never keep their own
// copy of match state. Preallocated arrays only: the hot loop never allocates.
import { START_MONEY, WEAPONS } from './config.js';

// Deterministic RNG (mulberry32) so staged screenshots and replays agree.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PHASE = { MENU: 'menu', BUY: 'buy', LIVE: 'live', OVER: 'over', MATCH: 'match' };

export function createAgent(id, name, team, isPlayer, x, z, yaw) {
  return {
    id, name, team, isPlayer, alive: true, hp: 100, kevlar: false,
    x, z, y: 0, vx: 0, vz: 0, yaw, pitch: 0, crouch: false, onGround: true,
    weapon: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve, lastHitT: -99,
    frags: 0, smokes: 0, money: START_MONEY, kills: 0, deaths: 0,
    // weapon feel (player + bots share the model)
    bloom: 0, recoilP: 0, recoilY: 0, fireCd: 0, reloadT: 0, burstLeft: 0,
    burstCd: 0, ads: false,
    // bot brain (unused for the player)
    role: 'roam', state: 'hold', wp: 0, wpTarget: -1, holdT: 0, reactT: 0, targetId: -1,
    lastSeenX: 0, lastSeenZ: 0, lastSeenT: -99, heardX: 0, heardZ: 0, heardT: -99,
    thinkT: 0, aimErr: 0, strafeDir: 1, strafeT: 0, planting: 0, defusing: 0,
    speed: 0, moving: false,
  };
}

export function createState(seed) {
  const rng = mulberry32(seed);
  const agents = [];
  // Vanguard (attackers, team 0): the player + two allies. Sentinel (team 1): 5 bots.
  agents.push(createAgent(0, 'YOU', 0, true, 0, 20, 0)); // yaw 0 faces north (-z)
  agents.push(createAgent(1, 'KITE', 0, false, -3, 21, 0));
  agents.push(createAgent(2, 'ORIO', 0, false, 3, 21, 0));
  const foes = ['VEX', 'MIRA', 'DUSK', 'HALO', 'PIKE'];
  for (let i = 0; i < 5; i++) agents.push(createAgent(3 + i, foes[i], 1, false, 0, -20, Math.PI));
  return {
    seed, rng, time: 0, round: 1, phase: PHASE.MENU, phaseT: 0, roundT: 0,
    score: [0, 0], wins: [0, 0], // rounds won per team
    agents, playerId: 0,
    bomb: { state: 'carried', carrier: 0, x: 0, z: 0, site: '', plantT: 0, fuse: 0, defuseT: 0, defuser: -1 },
    // transient events the renderer/audio consume once (ring buffers, no alloc)
    events: [], // {kind, x,y,z, ...} pushed by sim, drained by render/hud
    shots: [],  // tracer records {x0,y0,z0,x1,y1,z1,life,color}
    tracers: [], particles: [], // pooled in render.js; sim only appends event records
    grenades: [], // {x,y,z,vx,vy,vz,fuse,kind,team,alive}
    smokes: [],   // {x,y,z,r,life}
    noises: [],   // {x,z,r,team} hearing stimuli, drained each step
    msg: '', msgT: 0, // centre announcement
    feed: [],     // kill feed lines {text, t}
    roundWinner: -1, roundReason: '', matchWinner: -1,
    buyOpen: false, paused: false, muted: false, owned: ['p9'],
    stats: { shotsFired: 0, shotsHit: 0, headshots: 0, damage: 0 },
  };
}

// Reset positions, health and round timers for a new round; money persists.
export function resetRound(s, world) {
  s.roundT = 0; s.phase = PHASE.BUY; s.phaseT = 0; s.roundWinner = -1; s.roundReason = '';
  s.bomb = { state: 'carried', carrier: 0, x: 0, z: 0, site: '', plantT: 0, fuse: 0, defuseT: 0, defuser: -1 };
  s.grenades.length = 0; s.smokes.length = 0; s.noises.length = 0; s.events.length = 0;
  for (const a of s.agents) {
    a.alive = true; a.hp = 100; a.bloom = 0; a.recoilP = 0; a.recoilY = 0;
    a.fireCd = 0; a.reloadT = 0; a.burstLeft = 0; a.targetId = -1; a.planting = 0; a.defusing = 0;
    a.mag = WEAPONS[a.weapon].mag; a.reserve = WEAPONS[a.weapon].reserve;
    const sp = world.spawn(a.team, a.id);
    a.x = sp.x; a.z = sp.z; a.y = 0; a.vx = 0; a.vz = 0; a.yaw = sp.yaw; a.pitch = 0;
    if (a.team === 0 && a.isPlayer) { a.frags = 0; a.smokes = 0; }
  }
  // Defenders take posts: two hold A, two hold B, one roams mid.
  // Allies push with the bomb carrier toward a site.
  const posts = [0, 1, 2, 3, 4];
  for (let i = 0; i < 5; i++) {
    const b = s.agents[3 + i];
    b.role = i < 2 ? 'holdA' : i < 4 ? 'holdB' : 'roam';
    b.wp = posts[i];
  }
  s.agents[1].role = 'push'; s.agents[2].role = 'push';
}

export function aliveCount(s, team) {
  let n = 0;
  for (const a of s.agents) if (a.team === team && a.alive) n++;
  return n;
}

export function pushEvent(s, e) { if (s.events.length < 64) s.events.push(e); }
export function pushFeed(s, text) {
  s.feed.push({ text, t: s.time });
  if (s.feed.length > 5) s.feed.shift();
}
