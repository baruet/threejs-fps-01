// input.js — keyboard + mouse, pointer lock, and the per-step input snapshot.
// Edges (fire pressed this step, reload pressed, slot keys, grenade keys) are
// collected by main.js and cleared after each fixed step so a 60 Hz sim never
// misses a click that happened between steps.
export function createInput() {
  return {
    f: false, b: false, l: false, r: false, crouch: false, jump: false, walk: false,
    ads: false, use: false, fire: false,
    fireEdge: false, reloadEdge: false, fragEdge: false, smokeEdge: false,
    slot: -1, // 0..3 edge: weapon slot keys 1-4
    buyToggle: false, restartEdge: false,
    yawDelta: 0, pitchDelta: 0, // accumulated mouse movement, consumed by main
    locked: false,
  };
}

const KEYMAP = {
  KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r',
  ControlLeft: 'crouch', KeyC: 'crouch', Space: 'jump', ShiftLeft: 'walk', ShiftRight: 'walk',
  KeyE: 'use',
};

export function bindInput(input, canvas, onLockChange) {
  const down = (e) => {
    if (e.repeat) return;
    const k = KEYMAP[e.code];
    if (k) { input[k] = true; if (k === 'jump') input.jump = true; }
    if (e.code === 'KeyR') input.reloadEdge = true;
    if (e.code === 'KeyG') input.fragEdge = true;
    if (e.code === 'KeyQ') input.smokeEdge = true;
    if (e.code === 'Digit1') input.slot = 0;
    if (e.code === 'Digit2') input.slot = 1;
    if (e.code === 'Digit3') input.slot = 2;
    if (e.code === 'Digit4') input.slot = 3;
    if (e.code === 'KeyB') input.buyToggle = true;
    if (e.code === 'KeyM') input.restartEdge = true;
    if (e.code === 'KeyM') { /* M restarts the match from the end screen */ }
  };
  const up = (e) => {
    const k = KEYMAP[e.code];
    if (k) input[k] = false;
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => {
    for (const k of ['f', 'b', 'l', 'r', 'crouch', 'jump', 'walk', 'use']) input[k] = false;
    input.fire = false; input.ads = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(input.locked);
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.yawDelta -= e.movementX * 0.0021;
    input.pitchDelta -= e.movementY * 0.0021;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!input.locked) { canvas.requestPointerLock(); return; }
    if (e.button === 0) { input.fire = true; input.fireEdge = true; }
    if (e.button === 2) input.ads = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.fire = false;
    if (e.button === 2) input.ads = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Build the per-step snapshot: held keys + this step's edges.
export function snapshot(input, out) {
  out.f = input.f; out.b = input.b; out.l = input.l; out.r = input.r;
  out.crouch = input.crouch; out.jump = input.jump; out.walk = input.walk;
  out.ads = input.ads; out.use = input.use;
  out.fire = input.fire || input.fireEdge;
  out.reload = input.reloadEdge; out.frag = input.fragEdge; out.smoke = input.smokeEdge;
  out.slot = input.slot;
  return out;
}

export function clearEdges(input) {
  input.fireEdge = false; input.reloadEdge = false;
  input.fragEdge = false; input.smokeEdge = false; input.slot = -1;
  input.buyToggle = false; input.restartEdge = false;
}
