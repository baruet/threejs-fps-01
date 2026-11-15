// config.js — one place for every tunable number: weapons, economy, rounds,
// movement and bot behaviour. Nothing here allocates; sim.js reads it read-only.
// Game: MERIDIAN YARD — an original dusk industrial yard. Attackers (Vanguard,
// the player + 2 ally bots) push from the south yard into sites A (west, crate
// yard) and B (east, warehouse); defenders (Sentinel bots) hold the sites.
export const DT = 1 / 60;
export const ROUND_TIME = 100;      // seconds per round
export const BUY_TIME = 14;         // buy phase before each round
export const BOMB_FUSE = 35;        // seconds after plant before detonation
export const PLANT_TIME = 3.0;      // hold E to plant
export const DEFUSE_TIME = 5.0;     // hold E to defuse
export const WIN_ROUNDS = 5;        // first to 5 takes the match (max 9 rounds)
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const ROUND_WIN_REWARD = 3250;
export const ROUND_LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

// name, price, damage(body), headshot x, rpm, mag, reserve, spread(rad, hip),
// recoil pitch/yaw per shot, moveSpread, range, auto?, tracer colour
export const WEAPONS = {
  p9:      { name: 'Kestrel P9',  kind: 'pistol', price: 0,    dmg: 26, head: 2.2, rpm: 320, mag: 12, reserve: 48, spread: 0.011, recoil: 0.011, yaw: 0.004, move: 0.030, range: 42, auto: false, zoom: 1.0 },
  hornet:  { name: 'Hornet-9',    kind: 'smg',    price: 1200, dmg: 22, head: 2.0, rpm: 720, mag: 28, reserve: 112, spread: 0.016, recoil: 0.009, yaw: 0.005, move: 0.026, range: 34, auto: true,  zoom: 1.0 },
  longbow: { name: 'Longbow AR', kind: 'rifle',  price: 2700, dmg: 33, head: 2.5, rpm: 600, mag: 30, reserve: 90,  spread: 0.008, recoil: 0.014, yaw: 0.005, move: 0.034, range: 60, auto: true,  zoom: 1.15 },
  falcon:  { name: 'Falcon-50',   kind: 'sniper', price: 4750, dmg: 95, head: 2.5, rpm: 55,  mag: 5,  reserve: 15,  spread: 0.002, recoil: 0.055, yaw: 0.010, move: 0.060, range: 90, auto: false, zoom: 2.2 },
};
export const WEAPON_ORDER = ['p9', 'hornet', 'longbow', 'falcon'];
export const GRENADE_PRICE = 300;
export const SMOKE_PRICE = 300;
export const KEVLAR_PRICE = 650;
export const FRAG = { fuse: 1.6, radius: 9, maxDmg: 110, throwSpeed: 17 };

// Movement (m/s). Spread and recoil punish firing on the move: see weapons.js.
export const MOVE = {
  walk: 5.4, crouch: 2.7, ads: 3.4, air: 4.6, accel: 52, friction: 11,
  jumpVel: 5.4, gravity: 14.5, eyeStand: 1.62, eyeCrouch: 1.05, radius: 0.38,
};

// Bot tuning: reaction time, aim error and burst discipline per skill tier.
export const BOT = {
  thinkHz: 10, visionRange: 46, fovCos: 0.42, hearShot: 34, hearStep: 7,
  reactMin: 0.28, reactMax: 0.62, aimErr: 0.028, burstMin: 3, burstMax: 6,
  walkSpeed: 4.4, holdTime: [4, 9], hp: 100,
};

export const PALETTE = {
  skyTop: 0x2b3a55, skyBot: 0xd98a4a, sun: 0xffc98a, hemiSky: 0x8fa3c0, hemiGround: 0x5a4632,
  ground: 0x8a6f4d, groundDark: 0x6b563c, wallSand: 0xc9a06b, wallRust: 0x9a5a34,
  containerTeal: 0x2e7f86, containerRust: 0xc65d21, crate: 0xb08d57, trim: 0x3a3f46,
  accent: 0xf0a830, ally: 0x7fb069, enemy: 0xd95f4b, smoke: 0x9aa0a8,
};
