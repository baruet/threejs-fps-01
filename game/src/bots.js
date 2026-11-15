// bots.js — Sentinel defenders + Vanguard allies. A bot is a small state machine
// driven at 10 Hz (think) with continuous steering in between:
//   HOLD   — sit on a site post, watch a lane, strafe-peek occasionally
//   PATROL — walk the waypoint graph toward a goal (site, sound, last seen)
//   ENGAGE — a visible enemy: stop, aim with reaction delay + error, burst fire
//   PLANT/DEFUSE — objective behaviour (allies push the site, defenders retake)
//   RETREAT — fall back toward the bomb site when the bomb is planted
// Vision is a cone + line-of-sight test against world boxes; smoke blocks it.
// Hearing is a noise list the sim fills (gunshots, steps while sprinting).
import { BOT, MOVE } from './config.js';
import { WORLD, losBlocked, nearestWp, collideCircle } from './world.js';
import { fireWeapon, startReload } from './weapons.js';

const EYE = 1.5;

// Can `a` see `t` right now? Range, FOV cone, LOS, and smoke in between.
export function canSee(s, a, t) {
  if (!t.alive) return false;
  const dx = t.x - a.x, dz = t.z - a.z;
  const d2 = dx * dx + dz * dz;
  if (d2 > BOT.visionRange * BOT.visionRange) return false;
  const d = Math.sqrt(d2);
  const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw);
  if ((dx * fx + dz * fz) / (d || 1) < BOT.fovCos && d > 3) return false;
  const ay = a.y + EYE, ty = t.y + (t.crouch ? 1.0 : 1.35);
  if (losBlocked(a.x, ay, a.z, t.x, ty, t.z)) return false;
  for (const sm of s.smokes) { // smoke puffs block sight
    const mx = (a.x + t.x) / 2, mz = (a.z + t.z) / 2;
    if ((mx - sm.x) ** 2 + (mz - sm.z) ** 2 < sm.r * sm.r) return false;
  }
  return true;
}

function nearestEnemy(s, a) {
  let best = null, bd = 1e9;
  for (const t of s.agents) {
    if (t.team === a.team || !t.alive) continue;
    const d = (t.x - a.x) ** 2 + (t.z - a.z) ** 2;
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

// Pick a next waypoint on the graph toward goal wp (greedy: neighbour closest to goal).
function stepTowardWp(a, goal, rng) {
  const cur = nearestWp(a.x, a.z);
  if (cur === goal) return goal;
  const g = WORLD.waypoints[goal];
  let best = cur, bd = 1e9;
  for (const n of WORLD.waypoints[cur].n) {
    const w = WORLD.waypoints[n];
    const d = (w.x - g.x) ** 2 + (w.z - g.z) ** 2 + rng() * 4;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

function moveToward(a, tx, tz, dt, speedMul) {
  const dx = tx - a.x, dz = tz - a.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.4) return true;
  const sp = BOT.walkSpeed * (speedMul || 1);
  const vx = (dx / d) * sp, vz = (dz / d) * sp;
  const p = collideCircle(a.x, a.z, MOVE.radius, vx * dt, vz * dt);
  a.x = p.x; a.z = p.z;
  a.vx = vx; a.vz = vz; a.speed = sp; a.moving = true;
  a.yaw = Math.atan2(-dx, -dz); // face travel direction
  return false;
}

function aimAt(a, t, err) {
  const dx = t.x - a.x, dz = t.z - a.z;
  const want = Math.atan2(-dx, -dz);
  let diff = want - a.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  a.yaw += diff * 0.25; // turn rate limit: no snap-aim
  a.pitch = 0;
  a.aimErr = err;
}

// The 10 Hz brain. `now` is sim time.
export function thinkBot(s, a, now, dt) {
  if (!a.alive) return;
  a.thinkT -= dt;
  const enemy = nearestEnemy(s, a);
  const sees = enemy && canSee(s, a, enemy);
  if (sees) {
    a.targetId = enemy.id; a.lastSeenX = enemy.x; a.lastSeenZ = enemy.z; a.lastSeenT = now;
    if (a.reactT <= 0) a.reactT = BOT.reactMin + s.rng() * (BOT.reactMax - BOT.reactMin);
  }
  // Hearing: a recent noise from the other team pulls the bot toward it.
  for (const n of s.noises) {
    if (n.team === a.team) continue;
    const d2 = (n.x - a.x) ** 2 + (n.z - a.z) ** 2;
    if (d2 < n.r * n.r && now - a.heardT > 2) { a.heardX = n.x; a.heardZ = n.z; a.heardT = now; }
  }
  if (a.thinkT > 0) return;
  a.thinkT = 1 / BOT.thinkHz;
  const bomb = s.bomb;

  // --- objective overrides ---
  if (bomb.state === 'planted') {
    if (a.team === 1) { // defenders retake the planted site
      a.role = 'retake'; a.wpTarget = bomb.site === 'A' ? 8 : 9;
    } else if (a.team === 0) { // attackers guard the bomb
      a.role = 'guard'; a.wpTarget = bomb.site === 'A' ? 8 : 9;
    }
  }
  // --- role goals ---
  if (a.role === 'holdA' || a.role === 'holdB') {
    const posts = WORLD.holds[a.role];
    const post = posts[a.id % posts.length];
    const w = WORLD.waypoints[post[0]];
    const d = Math.hypot(w.x - a.x, w.z - a.z);
    if (d > 1.2) { a.wpTarget = post[0]; a.state = 'patrol'; }
    else { a.state = 'hold'; a.yaw = post[1] + Math.sin(now * 0.3 + a.id) * 0.35; }
  } else if (a.role === 'roam') {
    if (a.state !== 'patrol' || a.wpTarget < 0) {
      a.wpTarget = [6, 7, 3][Math.floor(s.rng() * 3)]; a.state = 'patrol';
    }
  } else if (a.role === 'push') { // allies follow the bomb carrier toward a site
    const carrier = s.agents[s.bomb.carrier];
    const site = carrier && carrier.alive ? (carrier.x < 0 ? 8 : 9) : 8;
    a.wpTarget = site; a.state = 'patrol';
  }
  // Heard something recently and nothing to do? Investigate.
  if (!sees && now - a.heardT < 4 && (a.role === 'roam' || a.role === 'retake')) {
    a.wpTarget = nearestWp(a.heardX, a.heardZ); a.state = 'patrol';
  }
  // Last-seen hunt: push the spot where an enemy was seen.
  if (!sees && now - a.lastSeenT < 3 && a.targetId >= 0) {
    a.wpTarget = nearestWp(a.lastSeenX, a.lastSeenZ); a.state = 'patrol';
  }
  // Hold-to-patrol transitions for retake/guard.
  if ((a.role === 'retake' || a.role === 'guard') && a.wpTarget >= 0) a.state = 'patrol';
  if (a.state === 'patrol' && a.wpTarget >= 0) {
    const w = WORLD.waypoints[a.wpTarget];
    if (Math.hypot(w.x - a.x, w.z - a.z) < 1.0) {
      if (a.role === 'retake' || a.role === 'guard' || a.role === 'push') { a.state = 'hold'; a.holdT = BOT.holdTime[0] + s.rng() * 4; }
      else if (a.role === 'roam') a.wpTarget = [0, 1, 2, 3, 6, 7][Math.floor(s.rng() * 6)];
      else a.wpTarget = stepTowardWp(a, a.wpTarget, s.rng);
    }
  }
}

// Continuous per-step bot update: steering, aiming, firing, planting/defusing.
export function stepBot(s, a, now, dt) {
  if (!a.alive) { a.moving = false; return; }
  thinkBot(s, a, now, dt);
  const enemy = a.targetId >= 0 ? s.agents[a.targetId] : null;
  const sees = enemy && enemy.alive && canSee(s, a, enemy);
  if (a.reactT > 0) a.reactT -= dt;

  // --- plant: an ally carrying the bomb plants it on a site ---
  if (s.bomb.state === 'carried' && s.bomb.carrier === a.id && a.team === 0 && !a.isPlayer) {
    const site = WORLD.sites[a.x < 0 ? 'A' : 'B'];
    if (Math.hypot(a.x - site.x, a.z - site.z) < site.r) {
      a.planting += dt;
      a.vx = 0; a.vz = 0; a.moving = false;
      if (a.planting >= 3) { s.bomb.state = 'planted'; s.bomb.site = a.x < 0 ? 'A' : 'B'; s.bomb.fuse = 35; s.bomb.x = a.x; s.bomb.z = a.z; }
      return;
    }
  }
  a.planting = 0;

  // --- defuse: a defender standing on a planted site defuses ---
  if (s.bomb.state === 'planted' && a.team === 1) {
    const site = WORLD.sites[s.bomb.site];
    if (Math.hypot(a.x - site.x, a.z - site.z) < site.r) {
      a.defusing += dt;
      if (a.defusing >= 5) { s.bomb.state = 'defused'; s.bomb.defuser = a.id; }
      return; // stand still and defuse
    }
  }
  a.defusing = 0;

  if (sees) {
    // ENGAGE: face the enemy, stop, and fire in bursts once reacted.
    const d = Math.hypot(enemy.x - a.x, enemy.z - a.z);
    aimAt(a, enemy, BOT.aimErr * (0.7 + d / 40));
    a.vx = 0; a.vz = 0; a.speed = 0; a.moving = false;
    if (a.reactT <= 0) {
      if (a.burstLeft <= 0 && a.burstCd <= 0) {
        a.burstLeft = BOT.burstMin + Math.floor(s.rng() * (BOT.burstMax - BOT.burstMin));
        a.burstCd = 0.5 + s.rng() * 0.7;
      }
      if (a.burstLeft > 0 && a.fireCd <= 0 && a.mag > 0) {
        // Aim error is injected as a temporary spread bump.
        a.bloom += a.aimErr;
        fireWeapon(s, a);
        a.burstLeft--;
        if (a.burstLeft <= 0) a.burstCd = 0.4 + s.rng() * 0.8;
      } else if (a.mag === 0) startReload(a);
      if (a.burstCd > 0) a.burstCd -= dt;
    }
    return;
  }
  a.targetId = -1;
  // --- steering: follow the waypoint graph hop by hop, never a straight line ---
  if (a.state === 'patrol' && a.wpTarget >= 0) {
    const goal = WORLD.waypoints[a.wpTarget];
    if (Math.hypot(goal.x - a.x, goal.z - a.z) < 0.8) { a.vx = 0; a.vz = 0; a.speed = 0; a.moving = false; }
    else {
      const hop = stepTowardWp(a, a.wpTarget, s.rng);
      const w = WORLD.waypoints[hop];
      moveToward(a, w.x, w.z, dt, 1);
    }
  } else if (a.state === 'hold') {
    a.vx = 0; a.vz = 0; a.speed = 0; a.moving = false;
    a.holdT -= dt;
    if (a.holdT <= 0 && (a.role === 'roam' || a.role === 'retake')) { a.state = 'patrol'; a.holdT = 0; }
    // peek strafe while holding: small sidesteps, still watching the lane
    a.strafeT -= dt;
    if (a.strafeT <= 0) { a.strafeDir *= -1; a.strafeT = 1.2 + s.rng() * 1.5; }
    const px = a.x + Math.cos(a.yaw) * a.strafeDir * 0.5;
    const pz = a.z - Math.sin(a.yaw) * a.strafeDir * 0.5;
    const p = collideCircle(a.x, a.z, MOVE.radius, (px - a.x) * dt, (pz - a.z) * dt);
    a.x = p.x; a.z = p.z;
  } else {
    a.vx = 0; a.vz = 0; a.speed = 0; a.moving = false;
  }
  if (a.mag === 0 && a.reloadT <= 0) startReload(a);
}
