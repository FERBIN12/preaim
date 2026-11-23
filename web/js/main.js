// Browser wiring: canvas sizing, input, loop, audio, leaderboard. All game rules live in game.js.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { AudioFX } from './audio.js';
import { DemoBot } from './bot.js';
import { WORLD } from './scene.js';
import { createLeaderboard, createMemoryStorage } from './leaderboard.js';

const params = new URLSearchParams(location.search);
const demo = params.has('demo');
const seedParam = parseInt(params.get('seed'), 10);
const seed = Number.isFinite(seedParam) ? seedParam : (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const fsBtn = document.getElementById('fs');
const game = new Game({ seed });
const renderer = new Renderer(ctx);
const audio = new AudioFX();
const bot = demo ? new DemoBot(seed ^ 0x5eed) : null;
let view = null;
/** @type {?import('./leaderboard.js').Leaderboard} */
let lb = null;
let top = null;

function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const cssW = window.innerWidth, cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  const scale = Math.min(cssW / WORLD.w, cssH / WORLD.h);
  view = { cssW, cssH, dpr, scale, ox: (cssW - WORLD.w * scale) / 2, oy: (cssH - WORLD.h * scale) / 2 };
  renderer.resize(view);
}

const toWorld = (e) => {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
};

// Fire-and-forget by design: the frame loop never waits on the network. Errors are handled here.
function refreshTop() {
  if (!lb) return;
  lb.top().then((b) => { top = b; }, () => { /* keep last */ });
}

function submitScore(token, entry) {
  lb.submit(entry)
    .then(() => lb.top())
    .then((b) => { top = b; game.setBoard(token, b); }, () => game.setBoard(token, { day: [], all: [] }));
}

function onEvents(events) {
  renderer.handle(events);
  audio.handle(events);
  for (const e of events) {
    if (e.type === 'submit' && lb) submitScore(e.token, e.entry);
    if (e.type === 'reset') { bot?.reset(); refreshTop(); }
  }
}

function tick(ms) {
  game.update(ms);
  bot?.update(game, ms);
  onEvents(game.drainEvents());
}

let last = performance.now();
let lastPhase = null;
function frame(now) {
  const dt = Math.min(100, now - last);
  last = now;
  tick(dt);
  if (game.phase !== lastPhase) {
    lastPhase = game.phase;
    document.body.dataset.phase = game.phase;
  }
  renderer.draw(game, dt, { top, mode: lb?.mode });
  requestAnimationFrame(frame);
}

canvas.addEventListener('pointermove', (e) => { if (!demo) { const p = toWorld(e); game.pointerMove(p.x, p.y); } });
canvas.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (demo || e.button !== 0) return;
  const p = toWorld(e);
  game.pointerDown(p.x, p.y);
});
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!demo) { const p = toWorld(e); game.wheel(p.x, p.y, e.deltaY); } }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.shiftKey && (e.key === 'R' || e.key === 'r')) { e.preventDefault(); game.operatorReset(); }
  if (e.shiftKey && (e.key === 'M' || e.key === 'm')) audio.muted = !audio.muted;
});
fsBtn.addEventListener('click', () => {
  audio.unlock();
  if (document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
});
window.addEventListener('resize', resize);
window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`)?.addEventListener?.('change', resize);

// Test/capture hook: deterministic fast-forward without real time passing.
window.__preaim = {
  game, renderer,
  step(ms, chunk = 16) { for (let t = 0; t < ms; t += chunk) { tick(chunk); renderer.step(chunk); } },
  get mode() { return lb?.mode; },
};

resize();
requestAnimationFrame(frame);
(async () => {
  lb = demo
    ? await createLeaderboard({ storage: createMemoryStorage(), forceLocal: true })
    : await createLeaderboard({ fetchFn: window.fetch.bind(window), storage: window.localStorage, base: '.', forceLocal: location.protocol === 'file:' });
  document.body.dataset.mode = lb.mode;
  refreshTop();
})();
