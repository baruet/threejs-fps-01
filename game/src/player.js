// player.js — first-person movement: acceleration, friction, crouch, jump and
// AABB collision. Velocity is exponential-approach: snappy but with weight, and
// air control is weaker so jumps commit you. Reads input state, writes agent.
import { MOVE } from './config.js';
import { collideCircle } from './world.js';

// input: {f,b,l,r,crouch,jump,walk} booleans, consumed fresh each fixed step.
export function stepPlayerMove(a, input, dt) {
  if (!a.alive) return;
  const wantX = (input.r ? 1 : 0) - (input.l ? 1 : 0);
  const wantZ = (input.f ? 1 : 0) - (input.b ? 1 : 0);
  const len = Math.hypot(wantX, wantZ) || 1;
  const sy = Math.sin(a.yaw), cy = Math.cos(a.yaw);
  // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
  const mx = (-sy * wantZ + cy * wantX) / len;
  const mz = (-cy * wantZ - sy * wantX) / len;
  const maxSpd = a.crouch ? MOVE.crouch : a.ads ? MOVE.ads : input.walk ? MOVE.walk * 0.55 : MOVE.walk;
  const accel = a.onGround ? MOVE.accel : MOVE.accel * 0.35;
  const tx = mx * maxSpd, tz = mz * maxSpd;
  const k = 1 - Math.exp(-accel * dt / maxSpd * 8);
  a.vx += (tx - a.vx) * Math.min(1, k);
  a.vz += (tz - a.vz) * Math.min(1, k);
  if (wantX === 0 && wantZ === 0 && a.onGround) {
    const f = Math.exp(-MOVE.friction * dt);
    a.vx *= f; a.vz *= f;
    if (Math.hypot(a.vx, a.vz) < 0.05) { a.vx = 0; a.vz = 0; }
  }
  a.speed = Math.hypot(a.vx, a.vz);
  a.moving = a.speed > 0.4;
  // Vertical: gravity + jump, ground is y=0 (crates are not climbable).
  a.vy = a.vy ?? 0;
  if (input.jump && a.onGround) { a.vy = MOVE.jumpVel; a.onGround = false; }
  a.vy -= MOVE.gravity * dt;
  a.y += a.vy * dt;
  if (a.y <= 0) { a.y = 0; a.vy = 0; a.onGround = true; }
  const p = collideCircle(a.x, a.z, MOVE.radius, a.vx * dt, a.vz * dt);
  a.x = p.x; a.z = p.z;
  a.crouch = !!input.crouch;
}

// Recoil recovery + bloom decay, shared by player and bots.
export function stepWeaponFeel(a, dt) {
  a.recoilP *= Math.exp(-7 * dt);
  a.recoilY *= Math.exp(-7 * dt);
  a.bloom = Math.max(0, a.bloom - dt * 0.11);
  if (a.fireCd > 0) a.fireCd -= dt;
  if (a.reloadT > 0) {
    a.reloadT -= dt;
    if (a.reloadT <= 0) { a.reloadT = 0; }
  }
}
