// audio.js — procedural sound, no audio assets. A tiny synth: filtered noise
// bursts for shots, clicks for reloads, a low thump for explosions, beeps for
// the bomb. Created lazily on the first user gesture (autoplay policy); the
// shot-staging path never enables it, so screenshots stay silent.
let ctx = null, master = null, enabled = true;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.22; master.connect(ctx.destination);
  } catch { ctx = null; }
}
export function setMuted(m) { enabled = !m; if (master) master.gain.value = m ? 0 : 0.22; }

function noiseBuf(dur) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst(dur, freq, q, gain, type) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur);
  const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
}

function tone(freq, dur, gain, slideTo) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur);
}

// One entry point: the sim/render layer hands audio an event record.
export function playEvent(e) {
  if (!ctx || !enabled) return;
  switch (e.kind) {
    case 'shot': {
      const w = e.weapon;
      if (w === 'falcon') { burst(0.35, 900, 0.8, 0.9, 'lowpass'); tone(90, 0.25, 0.3, 45); }
      else if (w === 'p9') burst(0.09, 1800, 1, 0.5);
      else burst(0.12, 1400, 1, 0.6);
      break;
    }
    case 'dryfire': tone(1200, 0.03, 0.15); break;
    case 'hitmark': tone(1800, 0.05, 0.2); break;
    case 'death': tone(220, 0.3, 0.25, 90); break;
    case 'explode': burst(0.9, 160, 0.5, 1.0, 'lowpass'); tone(55, 0.8, 0.5, 28); break;
    case 'planted': tone(880, 0.12, 0.25); setTimeout(() => tone(880, 0.12, 0.25), 180); break;
    case 'round': tone(520, 0.4, 0.3); setTimeout(() => tone(780, 0.5, 0.3), 250); break;
    case 'reload': tone(600, 0.05, 0.15); setTimeout(() => tone(900, 0.05, 0.15), 350); break;
    default: break;
  }
}

// Bomb beep while planted: call once per second from the HUD tick.
export function beep() { tone(1200, 0.07, 0.2); }
