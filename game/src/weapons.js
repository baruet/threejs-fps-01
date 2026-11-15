// weapons.js — the gunplay model, shared by player and bots.
// Spread grows with speed, air time, bloom and ADS; recoil kicks pitch/yaw and
// recovers over time, so stopping to aim pays. All math is scalar (no allocs).
import { WEAPONS, MOVE, FRAG } from './config.js';
import { rayWorld, rayAgent, losBlocked } from './world.js';
import { pushEvent, pushFeed } from './state.js';

// Scratch direction vector, reused by every shot (never allocate per shot).
const DIR = { x: 0, y: 0, z: 0 };

export function eyePos(a, out) {
  out.x = a.x; out.y = a.y + (a.crouch ? MOVE.eyeCrouch : MOVE.eyeStand); out.z = a.z;
  return out;
}

function aimDir(a, spread, rng, out) {
  const cp = Math.cos(a.pitch + a.recoilP), sp = Math.sin(a.pitch + a.recoilP);
  const cy = Math.cos(a.yaw + a.recoilY), sy = Math.sin(a.yaw + a.recoilY);
  // Forward is -z rotated by yaw, pitched by pitch. (yaw=PI faces -z? see note)
  out.x = -sy * cp; out.y = sp; out.z = -cy * cp;
  if (spread > 0) {
    const ang = rng() * Math.PI * 2, r = spread * Math.sqrt(rng());
    out.x += Math.cos(ang) * r; out.y += Math.sin(ang) * r * 0.7; out.z += Math.sin(ang) * r;
    const l = Math.hypot(out.x, out.y, out.z); out.x /= l; out.y /= l; out.z /= l;
  }
  return out;
}

// Current spread for an agent: base + movement + air + bloom, reduced by ADS.
export function currentSpread(a) {
  const w = WEAPONS[a.weapon];
  const speed = Math.hypot(a.vx, a.vz);
  const moveK = Math.min(1, speed / MOVE.walk);
  let s = w.spread + w.move * moveK + a.bloom;
  if (!a.onGround) s += 0.05;
  if (a.crouch) s *= 0.85;
  if (a.ads) s *= 0.45;
  return s;
}

export function canFire(a) {
  return a.alive && a.fireCd <= 0 && a.reloadT <= 0 && a.mag > 0;
}

// Resolve one hitscan shot. Returns 'hit' | 'head' | 'miss' | 'wall'.
export function fireWeapon(s, a) {
  const w = WEAPONS[a.weapon];
  a.mag--; a.fireCd = 60 / w.rpm;
  a.bloom = Math.min(0.09, a.bloom + w.recoil * 0.55);
  a.recoilP += w.recoil * (0.8 + s.rng() * 0.4);
  a.recoilY += (s.rng() - 0.5) * w.yaw * 2;
  if (a.isPlayer) { s.stats.shotsFired++; }
  const spread = currentSpread(a);
  const o = eyePos(a, { x: 0, y: 0, z: 0 });
  const d = aimDir(a, spread, s.rng, DIR);
  // Nearest wall hit caps the shot.
  const wall = rayWorld(o.x, o.y, o.z, d.x, d.y, d.z, w.range);
  const wallT = wall ? wall.t : w.range;
  let best = null, bestA = null;
  for (const t of s.agents) {
    if (t === a || !t.alive || t.team === a.team) continue;
    const hit = rayAgent(o.x, o.y, o.z, d.x, d.y, d.z, wallT, t);
    if (hit && (!best || hit.t < best.t)) { best = hit; bestA = t; }
  }
  const endT = best ? best.t : wallT;
  s.shots.push({ x0: o.x, y0: o.y, z0: o.z, x1: o.x + d.x * endT, y1: o.y + d.y * endT, z1: o.z + d.z * endT, life: 0.07, color: a.team === 0 ? 0xffd27a : 0xff7a5c });
  if (s.shots.length > 24) s.shots.shift();
  pushEvent(s, { kind: 'shot', id: a.id, x: o.x, y: o.y, z: o.z, team: a.team, weapon: a.weapon });
  // Gunshots are heard: bots within hearShot investigate the shooter's position.
  s.noises.push({ x: a.x, z: a.z, r: 34, team: a.team });
  if (!best) return wall ? 'wall' : 'miss';
  let dmg = w.dmg * (best.head ? w.head : 1);
  if (bestA.kevlar && !best.head) dmg *= 0.7;
  damageAgent(s, bestA, dmg, a, best.head);
  if (a.isPlayer) { s.stats.shotsHit++; if (best.head) s.stats.headshots++; s.stats.damage += dmg; }
  return best.head ? 'head' : 'hit';
}

export function damageAgent(s, victim, dmg, attacker, head) {
  if (!victim.alive) return;
  victim.hp -= dmg; victim.lastHitT = s.time;
  pushEvent(s, { kind: 'damage', id: victim.id, head: !!head, hp: victim.hp });
  if (victim.hp > 0) return;
  victim.alive = false; victim.hp = 0; victim.deaths++;
  if (attacker) {
    attacker.kills++;
    if (attacker.isPlayer) {
      attacker.money += 300;
      pushFeed(s, `YOU ▸ ${victim.name}${head ? ' — HEADSHOT' : ''}  +$300`);
    } else if (attacker.team === 0) pushFeed(s, `${attacker.name} ▸ ${victim.name}`);
    else pushFeed(s, `${victim.name} was dropped by ${attacker.name}`);
  }
  pushEvent(s, { kind: 'death', id: victim.id, x: victim.x, z: victim.z });
}

export function startReload(a) {
  const w = WEAPONS[a.weapon];
  if (a.reloadT > 0 || a.mag >= w.mag || a.reserve <= 0) return false;
  a.reloadT = a.weapon === 'falcon' ? 2.6 : a.weapon === 'p9' ? 1.4 : 2.1;
  return true;
}

export function finishReload(a) {
  const w = WEAPONS[a.weapon];
  const need = w.mag - a.mag, take = Math.min(need, a.reserve);
  a.mag += take; a.reserve -= take;
}

export function buyWeapon(s, a, id) {
  const w = WEAPONS[id];
  if (!w || a.money < w.price) return false;
  a.money -= w.price; a.weapon = id;
  a.mag = w.mag; a.reserve = w.reserve; a.reloadT = 0;
  return true;
}

export function throwGrenade(s, a, kind) {
  if (kind === 'frag' && a.frags <= 0) return false;
  if (kind === 'smoke' && a.smokes <= 0) return false;
  const o = eyePos(a, { x: 0, y: 0, z: 0 });
  const d = aimDir(a, 0, s.rng, DIR);
  if (kind === 'frag') a.frags--; else a.smokes--;
  s.grenades.push({
    x: o.x, y: o.y, z: o.z,
    vx: d.x * FRAG.throwSpeed + a.vx * 0.5, vy: d.y * FRAG.throwSpeed + 3.2, vz: d.z * FRAG.throwSpeed + a.vz * 0.5,
    fuse: kind === 'frag' ? FRAG.fuse : 1.1, kind, team: a.team, alive: true,
  });
  pushEvent(s, { kind: 'throw', x: o.x, y: o.y, z: o.z, gkind: kind });
  return true;
}

// Grenade physics + detonation. Bounces off boxes (damped), explodes on fuse.
export function stepGrenades(s, dt) {
  for (const g of s.grenades) {
    if (!g.alive) continue;
    g.fuse -= dt;
    g.vy -= 14.5 * dt;
    let nx = g.x + g.vx * dt, ny = g.y + g.vy * dt, nz = g.z + g.vz * dt;
    if (ny < 0.12) { ny = 0.12; g.vy = Math.abs(g.vy) * 0.45; g.vx *= 0.7; g.vz *= 0.7; }
    g.x = nx; g.y = ny; g.z = nz;
    if (g.fuse <= 0) {
      g.alive = false;
      if (g.kind === 'frag') {
        pushEvent(s, { kind: 'explode', x: g.x, y: g.y, z: g.z });
        for (const t of s.agents) {
          if (!t.alive) continue;
          const dx = t.x - g.x, dz = t.z - g.z, dy = (t.y + 0.9) - g.y;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > FRAG.radius) continue;
          if (losBlocked(g.x, g.y, g.z, t.x, t.y + 0.9, t.z)) continue; // walls shield
          const dmg = FRAG.maxDmg * (1 - dist / FRAG.radius) * 0.9 + 8;
          const atk = s.agents.find((x) => x.team === g.team && x.isPlayer) || null;
          damageAgent(s, t, dmg, atk, false);
        }
      } else {
        s.smokes.push({ x: g.x, y: 1.1, z: g.z, r: 4.2, life: 13 });
        pushEvent(s, { kind: 'smoke', x: g.x, y: 1.1, z: g.z });
      }
    }
  }
  s.grenades = s.grenades.filter((g) => g.alive);
}
