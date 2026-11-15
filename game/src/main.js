// main.js — bootstrap and the frame loop. The simulation runs at a fixed 60 Hz
// (accumulator, max 4 steps a frame) and rendering only reads state, so the
// game plays the same on any display. Input is sampled once per fixed step.
// `?shot=start|buy|play|plant|end&seed=N` stages a deterministic scene for
// screenshots: no pointer lock, bots posed, HUD live, window.__shotReady set
// once the scene has rendered.
import * as world from './world.js';
import { createState, PHASE } from './state.js';
import { startMatch, step, setWorld, SIM_DT } from './sim.js';
import { createInput, bindInput, snapshot, clearEdges } from './input.js';
import { createRenderer, render, onResize, handleRenderEvent } from './render.js';
import { createHud, updateHud, showOverlay, hideOverlay, setBuyOpen, flashHitmarker, flashDamage, tickBombBeep } from './hud.js';
import { initAudio, playEvent, beep } from './audio.js';

window.__errors = [];
window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') || '';
const SEED = Number(params.get('seed') || 7);

const state = createState(SEED);
window.__game = state; // debug/testing handle (read-only use by local tests)
setWorld(world);
const input = createInput();
const R = createRenderer(document.getElementById('game'));
const hud = createHud(() => { /* buy click: hud re-renders itself */ });
bindInput(input, R.renderer.domElement, (locked) => {
  if (!locked && state.phase === PHASE.LIVE && !SHOT) showPause();
});
window.addEventListener('resize', () => onResize(R));

let beepMark = { v: -1 };
let framesRendered = 0;

function showPause() {
  if (state.phase !== PHASE.LIVE) return;
  state.paused = true;
  showOverlay(hud, 'PAUSED', 'Pointer released. Click to resume the round.', 'Resume');
}
function showMenu() {
  showOverlay(hud, 'MERIDIAN YARD',
    'Vanguard vs Sentinel — plant the charge at Site A or B, or eliminate the defenders. First to 5 rounds takes the match.',
    'Click to play');
}

hud.playBtn.addEventListener('click', () => {
  initAudio();
  hideOverlay(hud);
  if (state.phase === PHASE.MENU || state.phase === PHASE.MATCH) { startMatch(state); }
  state.paused = false;
  if (!SHOT) R.renderer.domElement.requestPointerLock();
});

// Buy menu toggle (B) — only during the buy phase.
function pollBuyToggle() {
  if (!input.buyToggle) return;
  input.buyToggle = false;
  if (state.phase === PHASE.BUY) setBuyOpen(hud, state, !state.buyOpen);
}

// Drain sim events once per frame: audio, hitmarkers, damage flash.
function drainEvents() {
  for (const e of state.events) {
    playEvent(e);
    handleRenderEvent(R, e);
    if (e.kind === 'hitmark') flashHitmarker(hud, e.head);
    if (e.kind === 'damage' && e.id === 0) flashDamage(hud);
    if (e.kind === 'round') playEvent({ kind: 'round' });
  }
  state.events.length = 0;
  if (tickBombBeep(state, beepMark)) beep();
}

// --- screenshot staging -------------------------------------------------
// Poses the world deterministically so each shot shows real gameplay.
function stageShot() {
  const s = state;
  startMatch(s);
  s.phase = PHASE.LIVE; s.phaseT = 30; s.roundT = 42;
  const p = s.agents[0];
  if (SHOT === 'start' || SHOT === 'buy') {
    s.phase = PHASE.BUY; s.phaseT = 4;
    p.x = 0; p.z = 19; p.yaw = 0.15; p.pitch = -0.02;
    s.agents[1].x = -3; s.agents[1].z = 18; s.agents[1].yaw = 0.4;
    s.agents[2].x = 3; s.agents[2].z = 18; s.agents[2].yaw = -0.4;
    s.agents[3].x = -8; s.agents[3].z = -2; s.agents[3].yaw = 2.6;
    s.agents[4].x = 8; s.agents[4].z = -2; s.agents[4].yaw = -2.6;
    s.msg = 'BUY PHASE — spend your $800 before the round starts.'; s.msgT = 99;
    if (SHOT === 'buy') { setBuyOpen(hud, s, true); hideOverlay(hud); }
    else showOverlay(hud, 'MERIDIAN YARD', 'Vanguard vs Sentinel — plant the charge at Site A or B, or eliminate the defenders. First to 5 rounds takes the match.', 'Click to play');
  } else if (SHOT === 'play') {
    p.x = 0; p.z = 8; p.yaw = 0.12; p.pitch = 0.01; p.weapon = 'longbow';
    p.mag = 30; p.reserve = 90; p.money = 3250; p.frags = 1; p.smokes = 1;
    s.owned = ['p9', 'hornet', 'longbow'];
    s.agents[1].x = -6; s.agents[1].z = 2; s.agents[1].yaw = 0.3;
    s.agents[3].x = -2; s.agents[3].z = -9; s.agents[3].yaw = Math.PI - 0.2; // mid defender
    s.agents[4].x = 6; s.agents[4].z = -12; s.agents[4].yaw = Math.PI + 0.3;
    s.agents[5].x = -14; s.agents[5].z = -6; s.agents[5].yaw = Math.PI - 0.5;
    s.agents[6].x = 20; s.agents[6].z = -13; s.agents[6].yaw = Math.PI;
    s.agents[7].x = -23; s.agents[7].z = -13; s.agents[7].yaw = Math.PI + 0.4;
    // A live tracer + a recent hit so the frame reads as a firefight.
    s.shots.push({ x0: -2, y0: 1.5, z0: -9, x1: 0, y1: 1.5, z1: 7.5, life: 0.07, color: 0xff7a5c });
    s.agents[3].lastHitT = s.time;
    s.msg = ''; s.msgT = 0;
    hideOverlay(hud);
  } else if (SHOT === 'plant') {
    p.x = -21; p.z = -9.5; p.yaw = 0.6; p.pitch = -0.12; p.weapon = 'longbow';
    p.money = 3550; p.frags = 1;
    s.bomb.state = 'planted'; s.bomb.site = 'A'; s.bomb.fuse = 27; s.bomb.x = -23; s.bomb.z = -13;
    s.smokes.push({ x: -26, y: 1.1, z: -17, r: 4.2, life: 10 });
    s.agents[1].x = -18; s.agents[1].z = -16; s.agents[1].yaw = -0.8;
    s.agents[3].x = -10; s.agents[3].z = -18; s.agents[3].yaw = Math.PI - 0.9;
    s.agents[4].x = -16; s.agents[4].z = -19; s.agents[4].yaw = Math.PI + 0.5;
    s.msg = 'CHARGE PLANTED AT A — defend it!'; s.msgT = 99;
    hideOverlay(hud);
  } else if (SHOT === 'end') {
    s.phase = PHASE.OVER; s.phaseT = 1; s.roundWinner = 0; s.roundReason = 'Sentinel team eliminated';
    s.wins = [2, 1];
    p.x = 0; p.z = 8; p.yaw = 0.1; p.money = 4550; p.kills = 3;
    s.agents[3].alive = false; s.agents[4].alive = false;
    s.agents[1].x = -4; s.agents[1].z = 4; s.agents[1].yaw = 0.5;
    s.msg = 'ROUND WON — Sentinel team eliminated'; s.msgT = 99;
    showOverlay(hud, 'ROUND WON', 'Sentinel team eliminated. Vanguard leads 2 — 1. Next round starts soon — press M to restart the match.', 'Continue');
  }
  if (SHOT) {
    // Let the staged scene settle for a few fixed steps (smoke, tracers).
    for (let i = 0; i < 5; i++) step(state, snapshot(input, {}), SIM_DT);
    state.events.length = 0;
  }
}

if (SHOT) stageShot();
else showMenu();

// --- fixed-step loop ----------------------------------------------------
let last = performance.now();
let acc = 0;
const snap = { f: false, b: false, l: false, r: false, crouch: false, jump: false, walk: false, ads: false, use: false, fire: false, reload: false, frag: false, smoke: false, slot: -1 };

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25;
  // Mouse look applies to the player directly (not part of the fixed sim).
  const p = state.agents[0];
  if (input.yawDelta || input.pitchDelta) {
    p.yaw += input.yawDelta;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch + input.pitchDelta));
    input.yawDelta = 0; input.pitchDelta = 0;
  }
  if (input.restartEdge && (state.phase === PHASE.MATCH || state.phase === PHASE.OVER)) {
    hideOverlay(hud); startMatch(state);
  }
  pollBuyToggle();
  if (!state.paused) {
    acc += dt;
    let n = 0;
    while (acc >= SIM_DT && n < 4) {
      snapshot(input, snap);
      if (SHOT) { snap.fire = false; snap.use = false; } // staged shots never shoot
      step(state, snap, SIM_DT);
      clearEdges(input);
      acc -= SIM_DT; n++;
    }
    if (n === 4) acc = 0; // drop backlog rather than spiral
  }
  // Round/match banners.
  if (state.phase === PHASE.MATCH && hud.overlay.hidden) {
    showOverlay(hud, state.matchWinner === 0 ? 'MATCH WON' : 'MATCH LOST',
      state.matchWinner === 0 ? 'Meridian Yard is yours — Vanguard takes the match.' : 'The Sentinels hold the yard. Press M to run it back.',
      'Play again');
  }
  if (state.phase === PHASE.OVER && SHOT !== 'end' && hud.overlay.hidden && !state.paused) {
    showOverlay(hud, state.roundWinner === 0 ? 'ROUND WON' : 'ROUND LOST', state.roundReason, 'Continue');
  }
  if (state.phase === PHASE.LIVE && !hud.overlay.hidden && !SHOT && !state.paused) hideOverlay(hud);
  if (state.phase === PHASE.BUY && !hud.overlay.hidden && !SHOT) hideOverlay(hud);
  drainEvents();
  updateHud(hud, state, input);
  // Staged 'play' shot: keep one live tracer in frame so the firefight reads.
  if (SHOT === 'play' && state.shots.length === 0) {
    state.shots.push({ x0: -2, y0: 1.5, z0: -9, x1: 0, y1: 1.5, z1: 7.5, life: 0.07, color: 0xff7a5c });
  }
  render(R, state, Math.min(dt, 0.05));
  framesRendered++;
  if (SHOT && framesRendered === 6) window.__shotReady = true;
}
requestAnimationFrame(frame);
