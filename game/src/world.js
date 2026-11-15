// world.js — MERIDIAN YARD, an original map. All geometry is data: boxes with
// position/size/colour, plus sites, spawns and a waypoint graph the bots walk.
// Collision and sight are pure AABB math (no three.js here), shared by the
// player, the bots and the hitscan resolver, so what you see is what blocks you.
//
// Layout (x east, z south, metres; origin = mid). Attackers spawn south (z+20),
// defenders north (z-20). A site west (x-24), B site east (x+24), mid lane x~0.
// Lanes: A-long (west corridor), mid (double doors), B-tunnel (east underpass).
// Sightlines are broken by crates and containers so no lane sees spawn-to-spawn.
const B = (x, z, w, d, h, y, c, kind) => ({ x, z, w, d, h, y: y || 0, c, kind: kind || 'wall' });

export const WORLD = {
  name: 'MERIDIAN YARD',
  bounds: { minX: -30, maxX: 30, minZ: -24, maxZ: 24 },
  boxes: [
    // perimeter (h=5, thick 1)
    B(0, -24.5, 62, 1, 5, 0, 0x8a6f4d), B(0, 24.5, 62, 1, 5, 0, 0x8a6f4d),
    B(-30.5, 0, 1, 50, 5, 0, 0x8a6f4d), B(30.5, 0, 1, 50, 5, 0, 0x8a6f4d),
    // mid structure: double-door wall with a 4 m gap at x -4..4, crates flanking it
    B(-6, -6, 4, 1.2, 3.6, 0, 0xc9a06b), B(6, -6, 4, 1.2, 3.6, 0, 0xc9a06b),
    B(-8.5, -2, 2.4, 2.4, 1.4, 0, 0xb08d57, 'crate'), B(8.5, -2, 2.4, 2.4, 1.4, 0, 0xb08d57, 'crate'),
    B(-8.5, -2, 2.4, 2.4, 1.2, 1.4, 0x9a5a34, 'crate'), B(0, -10, 3, 1.6, 1.1, 0, 0xb08d57, 'crate'),
    // A site (west): crate yard + teal container, plant zone marked on the floor
    B(-24, -14, 10, 1.2, 3.4, 0, 0xc9a06b), B(-28.5, -8, 1.2, 12, 3.4, 0, 0xc9a06b),
    B(-22, -18, 6, 2.2, 2.6, 0, 0x2e7f86, 'container'), B(-19, -12, 2.2, 2.2, 1.3, 0, 0xb08d57, 'crate'),
    B(-25, -10, 2.2, 2.2, 1.3, 0, 0xb08d57, 'crate'), B(-25, -10, 2.2, 2.2, 1.1, 1.3, 0x9a5a34, 'crate'),
    B(-16, -20, 2, 2, 2.4, 0, 0x2e7f86, 'container'),
    // B site (east): warehouse block + rust container, tunnel mouth at z+2
    B(24, -14, 10, 1.2, 3.4, 0, 0xc9a06b), B(28.5, -8, 1.2, 12, 3.4, 0, 0xc9a06b),
    B(22, -18, 6, 2.2, 2.6, 0, 0xc65d21, 'container'), B(19, -12, 2.2, 2.2, 1.3, 0, 0xb08d57, 'crate'),
    B(25, -10, 2.2, 2.2, 1.3, 0, 0xb08d57, 'crate'), B(26, -16, 2.4, 2.4, 2.2, 0, 0xc65d21, 'container'),
    // mid / south cover: fountain block, sandbags, connector walls
    B(-12, 8, 6, 1.2, 2.6, 0, 0xc9a06b), B(12, 8, 6, 1.2, 2.6, 0, 0xc9a06b),
    B(0, 12, 4, 3, 1.0, 0, 0x6b563c, 'block'), B(-14, 2, 2, 1, 1.0, 0, 0xb08d57, 'crate'),
    B(14, 2, 2, 1, 1.0, 0, 0xb08d57, 'crate'), B(-20, 12, 3, 1.4, 1.2, 0, 0xb08d57, 'crate'),
    B(20, 12, 3, 1.4, 1.2, 0, 0xb08d57, 'crate'),
    // north connector walls behind the sites (defender rotation)
    B(-14, -16, 1.2, 8, 3.0, 0, 0xc9a06b), B(14, -16, 1.2, 8, 3.0, 0, 0xc9a06b),
    B(0, -19, 12, 1.2, 3.0, 0, 0xc9a06b),
  ],
  sites: {
    A: { x: -23, z: -13, r: 4.5, label: 'SITE A — CRATE YARD' },
    B: { x: 23, z: -13, r: 4.5, label: 'SITE B — WAREHOUSE' },
  },
  // waypoints: id, x, z, neighbours — bots patrol, rotate and push along these.
  waypoints: [
    { x: 0, z: 20, n: [1, 2, 3] },      // 0 attacker spawn
    { x: -10, z: 12, n: [0, 4, 6] },   // 1 to A-long
    { x: 10, z: 12, n: [0, 5, 6] },    // 2 to B-tunnel
    { x: 0, z: 10, n: [0, 1, 2, 7] },  // 3 mid doors approach
    { x: -20, z: 4, n: [1, 8] },       // 4 A-long
    { x: 20, z: 4, n: [2, 9] },        // 5 B-tunnel
    { x: 0, z: 0, n: [1, 2, 3, 7] },   // 6 mid cross
    { x: 0, z: -12, n: [3, 6, 8, 9] }, // 7 mid / defender yard
    { x: -23, z: -13, n: [4, 7] },     // 8 site A
    { x: 23, z: -13, n: [5, 7] },      // 9 site B
    { x: -16, z: -20, n: [7, 8] },     // 10 A back
    { x: 16, z: -20, n: [7, 9] },      // 11 B back
    { x: 0, z: -20, n: [7, 10, 11] },  // 12 defender spawn
  ],
  // bot hold posts: [waypoint, yaw] per role
  holds: { holdA: [[8, 1.2], [10, -0.6]], holdB: [[9, -1.2], [11, 0.6]], roam: [[7, 0]] },
};

export function spawnPoint(team, id) {
  if (team === 0) return { x: (id - 1) * 3, z: 20, yaw: 0 }; // face north (-z)
  const spots = [[-6, -20, Math.PI], [0, -21, Math.PI], [6, -20, Math.PI], [-12, -18, Math.PI + 0.5], [12, -18, Math.PI - 0.5]];
  const s = spots[(id - 3) % spots.length];
  return { x: s[0], z: s[1], yaw: s[2] };
}
export const spawn = spawnPoint;

// --- collision: circle (agent) vs AABB, axis-separated so sliding works ---
export function collideCircle(x, z, r, dx, dz) {
  // returns corrected {x, z} after moving (dx,dz); boxes are static.
  let nx = x + dx, nz = z + dz;
  for (const b of WORLD.boxes) {
    const hw = b.w / 2 + r, hd = b.d / 2 + r;
    if (Math.abs(nx - b.x) < hw && Math.abs(z - b.z) < hd) nx = x; // x move blocked
    if (Math.abs(nx - b.x) < hw && Math.abs(nz - b.z) < hd) nz = z; // z move blocked
  }
  nx = Math.max(WORLD.bounds.minX + r, Math.min(WORLD.bounds.maxX - r, nx));
  nz = Math.max(WORLD.bounds.minZ + r, Math.min(WORLD.bounds.maxZ - r, nz));
  return { x: nx, z: nz };
}

// Segment (x0,y0,z0)->(x1,y1,z1) vs box: true if the segment hits the solid.
export function segmentHitsBox(x0, y0, z0, x1, y1, z1, b) {
  const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
  const minY = b.y, maxY = b.y + b.h;
  const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
  let tmin = 0, tmax = 1;
  const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
  const axes = [[x0, dx, minX, maxX], [y0, dy, minY, maxY], [z0, dz, minZ, maxZ]];
  for (let i = 0; i < 3; i++) {
    const o = axes[i][0], d = axes[i][1], mn = axes[i][2], mx = axes[i][3];
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return false; }
    else {
      let t1 = (mn - o) / d, t2 = (mx - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export function losBlocked(x0, y0, z0, x1, y1, z1) {
  for (const b of WORLD.boxes) if (segmentHitsBox(x0, y0, z0, x1, y1, z1, b)) return true;
  return false;
}

// Ray from origin along dir (unit) up to maxDist; returns nearest hit {t, box} or null.
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = null;
  for (const b of WORLD.boxes) {
    const minX = b.x - b.w / 2, maxX = b.x + b.w / 2;
    const minY = b.y, maxY = b.y + b.h;
    const minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
    let tmin = 0, tmax = maxDist;
    const axes = [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]];
    let ok = true;
    for (let i = 0; i < 3; i++) {
      const o = axes[i][0], d = axes[i][1], mn = axes[i][2], mx = axes[i][3];
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) { ok = false; break; } }
      else {
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && (!best || tmin < best.t)) best = { t: tmin, box: b };
  }
  return best;
}

// Ray vs an agent's hitboxes: body AABB (0..1.35m) and head box (1.35..1.7m).
// Returns {t, head} for the nearest hit, or null. dir must be a unit vector.
export function rayAgent(ox, oy, oz, dx, dy, dz, maxDist, a) {
  const r = 0.38, hw = r;
  const hitBox = (y0, y1) => {
    const minX = a.x - hw, maxX = a.x + hw, minY = y0, maxY = y1;
    const minZ = a.z - hw, maxZ = a.z + hw;
    let tmin = 0, tmax = maxDist;
    const axes = [[ox, dx, minX, maxX], [oy, dy, minY, maxY], [oz, dz, minZ, maxZ]];
    for (let i = 0; i < 3; i++) {
      const o = axes[i][0], d = axes[i][1], mn = axes[i][2], mx = axes[i][3];
      if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return -1; }
      else {
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    return tmin;
  };
  const eyeY = a.y + (a.crouch ? 1.05 : 1.62);
  const headY0 = a.y + (a.crouch ? 0.82 : 1.38), headY1 = a.y + (a.crouch ? 1.05 : 1.70);
  const tHead = hitBox(headY0, headY1);
  const tBody = hitBox(a.y, a.crouch ? 0.82 : 1.38);
  void eyeY;
  if (tHead >= 0 && (tBody < 0 || tHead <= tBody)) return { t: tHead, head: true };
  if (tBody >= 0) return { t: tBody, head: false };
  return null;
}

export function siteAt(x, z) {
  for (const k of ['A', 'B']) {
    const s = WORLD.sites[k];
    const dx = x - s.x, dz = z - s.z;
    if (dx * dx + dz * dz < s.r * s.r) return k;
  }
  return '';
}

// Nearest waypoint index to (x,z).
export function nearestWp(x, z) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < WORLD.waypoints.length; i++) {
    const w = WORLD.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
