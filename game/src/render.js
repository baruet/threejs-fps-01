// render.js — three.js scene, kept apart from the simulation. It reads state and
// writes meshes; it never decides gameplay. All hot-loop objects are pooled:
// tracers, impact particles and smoke puffs are preallocated and reused, and
// per-frame math reuses module-level scratch vectors (no `new` in render()).
import * as THREE from 'three';
import { WORLD } from './world.js';
import { PALETTE, WEAPONS } from './config.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

const MAX_TRACER = 24, MAX_PART = 160, MAX_SMOKE = 10;

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyTop);
  scene.fog = new THREE.Fog(0xc98a5a, 55, 130);

  const camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.08, 220);
  camera.rotation.order = 'YXZ';

  // Dusk sun + sky fill.
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-28, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.far = 120;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.9));
  const fill = new THREE.DirectionalLight(0x6a7fa8, 0.5);
  fill.position.set(20, 18, -30); scene.add(fill);

  buildWorld(scene);
  const R = {
    renderer, scene, camera, sun,
    agents: new Map(), // id -> {group, body, head, gun, nameTag, hpBar}
    viewmodel: null, muzzle: null, muzzleLight: null,
    tracers: [], particles: [], smokes: [],
    bombMesh: null, bombLight: null, siteRings: [],
    clock: 0,
  };
  buildPools(R);
  buildViewmodel(R);
  buildBomb(R);
  return R;
}

const MAT = {};
function mat(color, rough) {
  const key = color + ':' + rough;
  if (!MAT[key]) MAT[key] = new THREE.MeshStandardMaterial({ color, roughness: rough ?? 0.9, metalness: 0.05 });
  return MAT[key];
}

function buildWorld(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 52),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  // Yard grid: darker paving strips for lanes, so the map reads at a glance.
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(4, 48), mat(0x6b563c, 1));
  strip.rotation.x = -Math.PI / 2; strip.position.set(0, 0.02, 0); strip.receiveShadow = true;
  scene.add(strip);
  for (const b of WORLD.boxes) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat(b.c, b.kind === 'container' ? 0.6 : 0.95));
    m.position.set(b.x, b.y + b.h / 2, b.z);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    if (b.kind === 'container') { // roof ribs
      const rib = new THREE.Mesh(new THREE.BoxGeometry(b.w * 0.96, 0.08, 0.3), mat(0x2c2f36, 0.7));
      rib.position.set(b.x, b.y + b.h + 0.02, b.z); scene.add(rib);
    }
    if (b.kind === 'crate') {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.06, 0.1, b.d + 0.06), mat(0x8a6a3d, 1));
      edge.position.set(b.x, b.y + b.h - 0.05, b.z); scene.add(edge);
    }
  }
  // Site markers: painted rings + floating site letters on the floor.
  for (const k of ['A', 'B']) {
    const s = WORLD.sites[k];
    const ring = new THREE.Mesh(new THREE.RingGeometry(s.r - 0.35, s.r, 40),
      new THREE.MeshBasicMaterial({ color: k === 'A' ? 0xf0a830 : 0x2e7f86, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, 0.05, s.z);
    scene.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24),
      new THREE.MeshBasicMaterial({ color: 0xf0a830, transparent: true, opacity: 0.35 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(s.x, 0.04, s.z);
    scene.add(disc);
  }
  // Perimeter light poles (warm pools of light at the corners).
  for (const [x, z] of [[-28, -22], [28, -22], [-28, 22], [28, 22], [0, -22]]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.4, 8), mat(0x3a3f46, 0.6));
    pole.position.set(x, 2.7, z); pole.castShadow = true; scene.add(pole);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    lamp.position.set(x, 5.5, z); scene.add(lamp);
    const pl = new THREE.PointLight(0xffc98a, 12, 16, 1.8);
    pl.position.set(x, 5.2, z); scene.add(pl);
  }
  // Distant skyline silhouettes so the yard is not a void.
  for (let i = 0; i < 10; i++) {
    const h = 8 + (i * 37 % 14);
    const b = new THREE.Mesh(new THREE.BoxGeometry(6 + (i * 13 % 6), h, 6), mat(0x4a3f38, 1));
    b.position.set(-52 + i * 11.5, h / 2 - 0.5, -38 - (i % 3) * 4);
    scene.add(b);
  }
}

function makeAgentMesh(team) {
  const g = new THREE.Group();
  const bodyC = team === 0 ? 0x7fb069 : 0xd95f4b;
  // Per-agent material (cloned) so hit-flash emissive never leaks to others.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.85, 4, 10), mat(bodyC, 0.85).clone());
  body.position.y = 0.95; body.castShadow = true; g.add(body);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.4), mat(0x2c2f36, 0.9));
  vest.position.y = 1.05; g.add(vest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10), mat(0xc9a06b, 0.8));
  head.position.y = 1.62; head.castShadow = true; g.add(head);
  const helm = new THREE.Mesh(new THREE.SphereGeometry(0.23, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(team === 0 ? 0x3f6b4f : 0x6b3a2f, 0.7));
  helm.position.y = 1.66; g.add(helm);
  const gun = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.85), mat(0x1e2228, 0.5));
  barrel.position.set(0.18, 1.25, -0.4); gun.add(barrel);
  g.add(gun);
  // Floating name plate (sprite-less: two thin boxes read as a tag at distance).
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.02), new THREE.MeshBasicMaterial({ color: team === 0 ? 0x7fb069 : 0xd95f4b }));
  tag.position.y = 2.05; g.add(tag);
  return { group: g, body, head, gun, tag };
}

function buildPools(R) {
  const tracerGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
  for (let i = 0; i < MAX_TRACER; i++) {
    const m = new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
    m.visible = false; R.scene.add(m); R.tracers.push(m);
  }
  const partGeo = new THREE.SphereGeometry(0.07, 6, 5);
  for (let i = 0; i < MAX_PART; i++) {
    const m = new THREE.Mesh(partGeo, new THREE.MeshBasicMaterial({ color: 0xffc98a, transparent: true, opacity: 0 }));
    m.visible = false; R.scene.add(m);
    R.particles.push({ m, vx: 0, vy: 0, vz: 0, life: 0 });
  }
  const smokeGeo = new THREE.SphereGeometry(1, 12, 10);
  for (let i = 0; i < MAX_SMOKE; i++) {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshStandardMaterial({ color: PALETTE.smoke, roughness: 1, transparent: true, opacity: 0 }));
    m.visible = false; R.scene.add(m); R.smokes.push(m);
  }
}

function buildViewmodel(R) {
  const g = new THREE.Group();
  const recv = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.55), mat(0x1e2228, 0.45));
  g.add(recv);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), mat(0x2c323a, 0.4));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.01, -0.48); g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.12), mat(0x3a3f46, 0.6));
  mag.position.set(0, -0.15, -0.05); mag.rotation.x = 0.25; g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.07, 0.12), mat(0xf0a830, 0.5));
  sight.position.set(0, 0.1, -0.15); g.add(sight);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.1), mat(0x4a2f1d, 0.8));
  grip.position.set(0, -0.12, 0.2); grip.rotation.x = 0.3; g.add(grip);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.28, 8), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
  flash.rotation.x = -Math.PI / 2; flash.position.set(0, 0.01, -0.78); g.add(flash);
  const light = new THREE.PointLight(0xffc98a, 0, 6, 2);
  light.position.set(0, 0, -0.8); g.add(light);
  R.viewmodel = g; R.muzzle = flash; R.muzzleLight = light;
  R.camera.add(g);
  R.scene.add(R.camera);
  g.scale.setScalar(0.85);
  g.position.set(0.3, -0.28, -0.62);
}

function buildBomb(R) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.24), mat(0x2c2f36, 0.5));
  g.add(box);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  led.position.set(0.1, 0.13, 0); g.add(led);
  const light = new THREE.PointLight(0xff3b30, 0, 8, 2);
  light.position.y = 0.4; g.add(light);
  g.visible = false;
  R.scene.add(g);
  R.bombMesh = g; R.bombLight = light;
}

// Spawn an impact burst at (x,y,z): reuse dead particles.
function burst(R, x, y, z, color, n, speed) {
  let made = 0;
  for (const p of R.particles) {
    if (p.life > 0) continue;
    p.life = 0.5 + Math.random() * 0.3;
    p.m.position.set(x, y, z); p.m.visible = true;
    p.m.material.color.setHex(color);
    p.m.material.opacity = 0.95;
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI;
    p.vx = Math.cos(a) * Math.cos(e) * speed; p.vz = Math.sin(a) * Math.cos(e) * speed; p.vy = Math.sin(e) * speed + speed * 0.4;
    if (++made >= n) break;
  }
}

export function render(R, s, dt) {
  R.clock += dt;
  const p = s.agents[0];
  const cam = R.camera;
  // Camera: eye height, recoil pitch/yaw, ADS zoom, crouch dip, bob.
  const eyeY = p.y + (p.crouch ? 1.05 : 1.62);
  cam.position.set(p.x, eyeY, p.z);
  cam.rotation.y = p.yaw + p.recoilY;
  cam.rotation.x = p.pitch + p.recoilP;
  cam.rotation.z = 0;
  const bob = p.moving && p.onGround ? Math.sin(R.clock * 9) * 0.018 * Math.min(1, p.speed / 5) : 0;
  cam.position.y += bob;
  const targetFov = p.ads ? 78 / (WEAPONS[p.weapon].zoom || 1) : 78;
  if (Math.abs(cam.fov - targetFov) > 0.2) { cam.fov += (targetFov - cam.fov) * 0.25; cam.updateProjectionMatrix(); }
  // Viewmodel sway + recoil kick + reload dip.
  const vm = R.viewmodel;
  vm.position.x = 0.3 + (p.ads ? -0.13 : 0) + Math.sin(R.clock * 9) * 0.004 * (p.moving ? 1 : 0);
  vm.position.y = -0.28 + (p.ads ? 0.07 : 0) + Math.abs(Math.cos(R.clock * 9)) * 0.006 * (p.moving ? 1 : 0) - (p.reloadT > 0 ? 0.12 : 0);
  vm.rotation.x = p.recoilP * 1.6;
  vm.visible = p.alive;
  R.muzzle.material.opacity = Math.max(0, R.muzzle.material.opacity - dt * 14);
  R.muzzleLight.intensity = Math.max(0, R.muzzleLight.intensity - dt * 60);
  // Agents.
  for (const a of s.agents) {
    let rec = R.agents.get(a.id);
    if (!rec) { rec = makeAgentMesh(a.team); R.scene.add(rec.group); R.agents.set(a.id, rec); }
    if (a.isPlayer) { rec.group.visible = false; continue; }
    rec.group.visible = a.alive;
    if (!a.alive) continue;
    rec.group.position.set(a.x, a.y, a.z);
    rec.group.rotation.y = a.yaw + Math.PI; // model faces +z, yaw 0 faces -z
    rec.group.scale.y = a.crouch ? 0.72 : 1;
    rec.body.material.color.setHex(a.team === 0 ? 0x7fb069 : 0xd95f4b);
    // Hit flash: the sim tags the victim's last damage time on the agent.
    rec.body.material.emissive.setHex(s.time - (a.lastHitT || -99) < 0.12 ? 0x882211 : 0x000000);
    rec.tag.visible = a.team === 0;
  }
  // Tracers from sim shot records.
  let ti = 0;
  for (const t of s.shots) {
    if (ti >= MAX_TRACER) break;
    const m = R.tracers[ti++];
    V.set((t.x0 + t.x1) / 2, (t.y0 + t.y1) / 2, (t.z0 + t.z1) / 2);
    V2.set(t.x1 - t.x0, t.y1 - t.y0, t.z1 - t.z0);
    const len = V2.length();
    m.position.copy(V);
    m.scale.set(1, 1, len);
    m.lookAt(t.x1, t.y1, t.z1);
    m.material.color.setHex(t.color);
    m.material.opacity = Math.min(1, t.life / 0.07);
    m.visible = true;
  }
  for (; ti < MAX_TRACER; ti++) R.tracers[ti].visible = false;
  // Particles.
  for (const pt of R.particles) {
    if (pt.life <= 0) { pt.m.visible = false; continue; }
    pt.life -= dt;
    pt.m.position.x += pt.vx * dt; pt.m.position.y += pt.vy * dt; pt.m.position.z += pt.vz * dt;
    pt.vy -= 6 * dt;
    pt.m.material.opacity = Math.max(0, pt.life * 1.6);
    if (pt.m.position.y < 0.03) { pt.m.position.y = 0.03; pt.vy = 0; }
  }
  // Smoke puffs: each is a cluster of 3 offset spheres so it reads as a cloud.
  const SMOKE_OFF = [[0, 0, 0], [1.4, 0.5, 0.9], [-1.3, 0.3, -1.0]];
  let si = 0;
  for (const sm of s.smokes) {
    for (let k = 0; k < 3; k++) {
      if (si >= MAX_SMOKE) break;
      const m = R.smokes[si++];
      m.visible = true;
      m.position.set(sm.x + SMOKE_OFF[k][0], sm.y + SMOKE_OFF[k][1], sm.z + SMOKE_OFF[k][2]);
      const grow = 1 + (13 - sm.life) * 0.22;
      m.scale.setScalar(Math.min(2.4, grow + k * 0.3));
      m.material.opacity = Math.min(0.7, sm.life * 0.15 + 0.35);
    }
    if (si >= MAX_SMOKE) break;
  }
  for (; si < MAX_SMOKE; si++) R.smokes[si].visible = false;
  // Bomb mesh: on the ground when dropped/planted, hidden while carried.
  const b = s.bomb;
  if (b.state === 'dropped' || b.state === 'planted') {
    R.bombMesh.visible = true;
    R.bombMesh.position.set(b.x, b.state === 'planted' ? 0.14 : 0.12, b.z);
    const blink = b.state === 'planted' ? (Math.sin(R.clock * 6) > 0 ? 2.2 : 0.2) : 0.6;
    R.bombLight.intensity = blink;
  } else R.bombMesh.visible = false;
  R.renderer.render(R.scene, cam);
}

export function onResize(R) {
  R.camera.aspect = window.innerWidth / window.innerHeight;
  R.camera.updateProjectionMatrix();
  R.renderer.setSize(window.innerWidth, window.innerHeight);
}

// Called by main.js when it drains sim events that need a visual.
// Only the player's own shots flash the viewmodel muzzle; bots' shots are
// heard and seen as tracers, never as a flash on the player's gun.
export function handleRenderEvent(R, e) {
  if (e.kind === 'shot' && e.id === 0) {
    R.muzzle.material.opacity = 1; R.muzzleLight.intensity = 6;
  } else if (e.kind === 'explode') {
    burst(R, e.x, e.y, e.z, 0xff7733, 26, 7);
    burst(R, e.x, e.y + 0.4, e.z, 0x555555, 14, 4);
    if (e.big) burst(R, e.x, e.y + 1, e.z, 0xffcc66, 30, 10);
  }
}
