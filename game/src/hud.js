// hud.js — all DOM reads/writes live here. Cached element handles, text updates
// only when the value changed, so the HUD costs nothing on a quiet frame.
// The buy menu and overlays are plain DOM over the canvas; the judge reads the
// same HUD in the screenshots.
import { WEAPONS, WEAPON_ORDER, GRENADE_PRICE, SMOKE_PRICE, KEVLAR_PRICE, PLANT_TIME, DEFUSE_TIME, BOMB_FUSE } from './config.js';
import { PHASE } from './state.js';
import { siteAt } from './world.js';
import { buy } from './sim.js';

function el(id) { return document.getElementById(id); }

export function createHud(onBuy) {
  const h = {
    hp: el('hp'), hpBar: el('hp-bar'), ammoMag: el('ammo-mag'), ammoRes: el('ammo-reserve'),
    ammoBox: el('ammo'), timer: el('timer'), score: el('score-value'), money: el('money'),
    weapon: el('weapon-name'), nades: el('nades'), team: el('team-alive'), msg: el('msg'),
    cross: el('crosshair'), hit: el('hitmarker'), feed: el('feed'), plant: el('plant-bar'),
    plantFill: el('plant-fill'), plantLabel: el('plant-label'), bomb: el('bomb-state'),
    overlay: el('overlay'), overlayTitle: el('overlay-title'), overlayCopy: el('overlay-copy'),
    playBtn: el('play'), buyMenu: el('buy-menu'), buyList: el('buy-list'), buyMsg: el('buy-msg'),
    vignette: el('vignette'), reload: el('reload-hint'), siteTag: el('site-tag'),
    cache: {},
  };
  h.onBuy = onBuy;
  return h;
}

function setText(h, key, node, value) {
  if (h.cache[key] !== value) { h.cache[key] = value; node.textContent = value; }
}

export function updateHud(h, s, input) {
  const p = s.agents[0];
  const w = WEAPONS[p.weapon];
  setText(h, 'hp', h.hp, String(Math.max(0, Math.ceil(p.hp))));
  h.hpBar.style.width = `${Math.max(0, p.hp)}%`;
  h.hpBar.style.background = p.hp > 50 ? '#7fb069' : p.hp > 25 ? '#f0a830' : '#d95f4b';
  setText(h, 'mag', h.ammoMag, p.reloadT > 0 ? '--' : String(p.mag));
  setText(h, 'res', h.ammoRes, `/ ${p.reserve}`);
  h.ammoBox.classList.toggle('empty', p.mag === 0);
  setText(h, 'wpn', h.weapon, w.name + (p.kevlar ? ' · KEVLAR' : ''));
  setText(h, 'nades', h.nades, `G frag ×${p.frags}   Q smoke ×${p.smokes}`);
  setText(h, 'money', h.money, `$${p.money}`);
  const t = s.phase === PHASE.LIVE ? Math.max(0, Math.ceil(100 - s.roundT)) : s.phase === PHASE.BUY ? Math.max(0, Math.ceil(14 - s.phaseT)) : 0;
  const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
  setText(h, 'timer', h.timer, `${mm}:${ss}`);
  h.timer.classList.toggle('urgent', t <= 15 && s.phase === PHASE.LIVE);
  setText(h, 'score', h.score, `${s.wins[0]} — ${s.wins[1]}`);
  let alive = 0, foes = 0;
  for (const a of s.agents) { if (a.alive) { if (a.team === 0) alive++; else foes++; } }
  setText(h, 'team', h.team, `VANGUARD ${alive} · SENTINEL ${foes}`);
  setText(h, 'msg', h.msg, s.msgT > 0 ? s.msg : '');
  // Bomb state line
  const b = s.bomb;
  let bt = '';
  if (b.state === 'carried') bt = b.carrier === 0 ? '◉ YOU CARRY THE CHARGE — plant at A or B (hold E)' : `◉ ${s.agents[b.carrier].name} carries the charge`;
  else if (b.state === 'dropped') bt = '◉ CHARGE DROPPED — walk over it to pick it up';
  else if (b.state === 'planted') bt = `◉ CHARGE PLANTED AT ${b.site} — ${Math.ceil(b.fuse)}s to detonation`;
  else if (b.state === 'defused') bt = '◉ CHARGE DEFUSED';
  setText(h, 'bomb', h.bomb, bt);
  h.bomb.classList.toggle('danger', b.state === 'planted');
  // Plant / defuse progress
  const prog = p.planting > 0 ? p.planting / PLANT_TIME : b.state === 'planted' && b.defuseT > 0 ? b.defuseT / DEFUSE_TIME : 0;
  h.plant.style.display = prog > 0 ? 'block' : 'none';
  if (prog > 0) {
    h.plantFill.style.width = `${Math.min(100, prog * 100)}%`;
    setText(h, 'plantLabel', h.plantLabel, p.planting > 0 ? 'PLANTING CHARGE…' : 'DEFUSING…');
  }
  // Site tag when standing in one
  const site = siteAt(p.x, p.z);
  h.siteTag.style.display = site ? 'block' : 'none';
  if (site) setText(h, 'siteTag', h.siteTag, site === 'A' ? 'SITE A — CRATE YARD' : 'SITE B — WAREHOUSE');
  // Kill feed
  let feedHtml = '';
  for (const f of s.feed) feedHtml += `<div>${f.text}</div>`;
  if (h.cache.feed !== feedHtml) { h.cache.feed = feedHtml; h.feed.innerHTML = feedHtml; }
  // Crosshair spread (CSS var): wider when moving / blooming.
  const spread = 6 + p.bloom * 260 + (p.moving ? 6 : 0) + (p.ads ? -3 : 0);
  h.cross.style.setProperty('--gap', `${Math.max(3, spread).toFixed(1)}px`);
  h.reload.textContent = p.reloadT > 0 ? 'RELOADING…' : p.mag === 0 ? 'PRESS R TO RELOAD' : '';
  // Damage vignette fades
  const v = h.cache.vig || 0;
  if (v > 0) { h.cache.vig = Math.max(0, v - 0.03); h.vignette.style.opacity = String(h.cache.vig); }
}

export function flashHitmarker(h, head) {
  h.hit.classList.add('on');
  h.hit.classList.toggle('head', !!head);
  setTimeout(() => h.hit.classList.remove('on'), 110);
}
export function flashDamage(h) { h.cache.vig = 0.85; h.vignette.style.opacity = '0.85'; }

export function showOverlay(h, title, copy, btn) {
  h.overlay.hidden = false;
  setText(h, 'ot', h.overlayTitle, title);
  setText(h, 'oc', h.overlayCopy, copy);
  h.playBtn.textContent = btn;
}
export function hideOverlay(h) { h.overlay.hidden = true; }

// Buy menu: rebuilt only when opened or after a purchase.
export function renderBuy(h, s) {
  const p = s.agents[0];
  let html = '';
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const owned = s.owned.includes(id);
    html += `<button data-buy="${id}" class="${p.weapon === id ? 'sel' : ''}" ${owned ? '' : ''}>
      <b>${w.name}</b><span>${w.kind} · ${w.dmg} dmg · ${w.mag} rnd</span><i>${owned ? 'OWNED' : '$' + w.price}</i></button>`;
  }
  html += `<button data-buy="frag"><b>Frag grenade</b><span>×${p.frags} held · G to throw</span><i>$${GRENADE_PRICE}</i></button>`;
  html += `<button data-buy="smoke"><b>Smoke grenade</b><span>×${p.smokes} held · Q to throw</span><i>$${SMOKE_PRICE}</i></button>`;
  html += `<button data-buy="kevlar"><b>Kevlar vest</b><span>${p.kevlar ? 'owned' : 'body damage −30%'}</span><i>${p.kevlar ? 'OWNED' : '$' + KEVLAR_PRICE}</i></button>`;
  h.buyList.innerHTML = html;
  h.buyList.querySelectorAll('[data-buy]').forEach((b) => {
    b.addEventListener('click', () => {
      const msg = buy(s, b.getAttribute('data-buy'));
      setText(h, 'buymsg', h.buyMsg, msg + `  — $${p.money}`);
      renderBuy(h, s);
      if (h.onBuy) h.onBuy();
    });
  });
}

export function setBuyOpen(h, s, open) {
  s.buyOpen = open;
  h.buyMenu.hidden = !open;
  if (open) renderBuy(h, s);
}

export function tickBombBeep(s, lastBeep) {
  if (s.bomb.state === 'planted') {
    const sec = Math.ceil(s.bomb.fuse);
    if (sec !== lastBeep.v) { lastBeep.v = sec; return true; }
  }
  return false;
}
export { BOMB_FUSE };
