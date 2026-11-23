// Canvas renderer: neon-on-dark scene, enemies, HUD, screens, particles, shake.
import { WORLD, COVER } from './scene.js';
import { enemyPose } from './schedule.js';
import { PHASE, LETTERS, resultsLayout } from './game.js';

const C = { bg: '#05070d', wall: '#0b1222', cyan: '#2ef2ff', mag: '#ff3d8b', lime: '#b8ff3c', amber: '#ffb52e', white: '#eaf6ff', dim: '#6c7fa3' };
const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
const MONO = 'ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace';
const MAX_PARTICLES = 400, MAX_POPUPS = 24;

function text(ctx, s, x, y, { size = 32, color = C.white, align = 'center', glow = 0, weight = 800, font = FONT, base = 'middle', spacing = 0 } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.shadowBlur = 0;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

function neonRect(ctx, x, y, w, h, color, glow = 14, lw = 3) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.shadowColor = color; ctx.shadowBlur = glow;
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** Static scene, drawn once per resize into an offscreen canvas. */
function drawScene(ctx) {
  const { w, h, wallTop, floorY } = WORLD;
  let g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#070b16'); g.addColorStop(1, '#03040a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // back wall with panels
  g = ctx.createLinearGradient(0, wallTop, 0, floorY);
  g.addColorStop(0, '#0e1730'); g.addColorStop(1, '#0a1020');
  ctx.fillStyle = g; ctx.fillRect(0, wallTop, w, floorY - wallTop);
  ctx.strokeStyle = 'rgba(46,242,255,0.06)'; ctx.lineWidth = 2;
  for (let x = 40; x < w; x += 120) { ctx.beginPath(); ctx.moveTo(x, wallTop); ctx.lineTo(x, floorY); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(0, 520); ctx.lineTo(w, 520); ctx.stroke();
  // ceiling + floor perspective grid
  const vx = 800, vy = 410;
  ctx.strokeStyle = 'rgba(46,242,255,0.16)'; ctx.lineWidth = 1.5;
  for (let i = -12; i <= 12; i++) {
    ctx.beginPath(); ctx.moveTo(vx + (i / 12) * 1500, h); ctx.lineTo(vx + (i / 12) * 1500 * ((floorY - vy) / (h - vy)), floorY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(vx + (i / 12) * 1500, 0); ctx.lineTo(vx + (i / 12) * 1500 * ((vy - wallTop) / vy), wallTop); ctx.stroke();
  }
  for (let k = 1; k <= 9; k++) { const y = floorY + (h - floorY) * (k / 9) ** 1.8; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let k = 1; k <= 5; k++) { const y = wallTop - wallTop * (k / 5) ** 1.8; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.save(); ctx.strokeStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 18; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(w, floorY); ctx.moveTo(0, wallTop); ctx.lineTo(w, wallTop); ctx.stroke(); ctx.restore();
  // doorways (dark interiors, neon frames)
  for (const d of [COVER.door1, COVER.door2]) {
    const dg = ctx.createLinearGradient(0, d.top, 0, floorY);
    dg.addColorStop(0, '#010207'); dg.addColorStop(1, '#060a16');
    ctx.fillStyle = dg; ctx.fillRect(d.x0, d.top, d.x1 - d.x0, floorY - d.top);
    ctx.save(); ctx.strokeStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 16; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(d.x0, floorY); ctx.lineTo(d.x0, d.top); ctx.lineTo(d.x1, d.top); ctx.lineTo(d.x1, floorY); ctx.stroke(); ctx.restore();
  }
  // wall stencil
  text(ctx, 'SECTOR 09', 560, 230, { size: 28, color: 'rgba(46,242,255,0.35)', glow: 8, spacing: 8 });
  text(ctx, '>>', 1060, 420, { size: 40, color: 'rgba(255,181,46,0.25)', glow: 6 });
}

/** Foreground cover, drawn over enemies every frame (cheap shapes). */
function drawCover(ctx) {
  const c = COVER.crate, p = COVER.pillar, F = WORLD.floorY;
  const crate = (x0, y0, x1, y1) => {
    ctx.fillStyle = '#101a33'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = 'rgba(46,242,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x0 + 10, y0 + 10); ctx.lineTo(x1 - 10, y1 - 10); ctx.moveTo(x1 - 10, y0 + 10); ctx.lineTo(x0 + 10, y1 - 10); ctx.stroke();
    ctx.strokeRect(x0 + 10, y0 + 10, x1 - x0 - 20, y1 - y0 - 20);
    neonRect(ctx, x0, y0, x1 - x0, y1 - y0, C.cyan, 12, 3);
  };
  crate(c.x0, c.mid, c.x1, F);
  crate(c.topX0, c.top, c.topX1, c.mid);
  const pg = ctx.createLinearGradient(p.x0, 0, p.x1, 0);
  pg.addColorStop(0, '#0d1630'); pg.addColorStop(1, '#070c1a');
  ctx.fillStyle = pg; ctx.fillRect(p.x0, p.top, p.x1 - p.x0, WORLD.h - p.top);
  neonRect(ctx, p.x0, p.top, p.x1 - p.x0, WORLD.h - p.top + 10, C.cyan, 14, 3);
  ctx.fillStyle = 'rgba(255,181,46,0.18)';
  for (let y = 700; y < 880; y += 36) { ctx.beginPath(); ctx.moveTo(p.x0, y); ctx.lineTo(p.x1, y - 30); ctx.lineTo(p.x1, y - 14); ctx.lineTo(p.x0, y + 16); ctx.fill(); }
}

function drawEnemy(ctx, peek, t, flash = 0) {
  const q = enemyPose(peek, t);
  const [x0, x1, y0, y1] = peek.edge.clip;
  if (q.cx + q.shoulderHalf * 1.2 < x0 || q.cx - q.shoulderHalf * 1.2 > x1) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  const s = q.scale, top = q.headY + q.headR * 0.85, sh = q.shoulderHalf;
  const col = flash > 0 ? `rgba(184,255,60,${0.4 + 0.6 * flash})` : C.mag;
  ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.lineWidth = 3; ctx.strokeStyle = col;
  ctx.fillStyle = flash > 0 ? `rgba(60,90,20,${0.6 + 0.4 * flash})` : '#1c0a1c';
  // torso: rounded shoulders down to the floor
  ctx.beginPath();
  ctx.moveTo(q.cx - sh, WORLD.floorY + 4);
  ctx.lineTo(q.cx - sh, top + 26 * s);
  ctx.quadraticCurveTo(q.cx - sh, top, q.cx - sh + 24 * s, top);
  ctx.lineTo(q.cx + sh - 24 * s, top);
  ctx.quadraticCurveTo(q.cx + sh, top, q.cx + sh, top + 26 * s);
  ctx.lineTo(q.cx + sh, WORLD.floorY + 4);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // chest stripe
  ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,61,139,0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(q.cx - sh * 0.55, top + 40 * s); ctx.lineTo(q.cx + sh * 0.55, top + 40 * s); ctx.stroke();
  // head + visor
  if (!peek.fake) {
    ctx.shadowColor = col; ctx.shadowBlur = 18; ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(q.cx, q.headY, q.headR, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = flash > 0 ? C.white : '#ffd1e4'; ctx.shadowColor = C.mag; ctx.shadowBlur = 10;
    roundRect(ctx, q.cx - q.headR * 0.7, q.headY - q.headR * 0.25, q.headR * 1.4, q.headR * 0.38, 4); ctx.fill();
  }
  ctx.restore();
}

function drawCue(ctx, peek, t) {
  const e = peek.edge;
  const u = Math.max(0, Math.min(1, (t - peek.cueAt) / (peek.appearAt - peek.cueAt)));
  const a = 0.18 + 0.22 * u + 0.08 * Math.sin(t / 45);
  const x = e.x, dir = e.dir;
  const g = ctx.createLinearGradient(x, 0, x + dir * 70, 0);
  g.addColorStop(0, `rgba(255,181,46,${a})`); g.addColorStop(1, 'rgba(255,181,46,0)');
  ctx.fillStyle = g;
  ctx.fillRect(dir > 0 ? x : x - 70, e.headY - 70 * e.scale, 70, 210 * e.scale);
  ctx.save(); ctx.strokeStyle = `rgba(255,181,46,${a + 0.25})`; ctx.shadowColor = C.amber; ctx.shadowBlur = 12; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, e.headY - 70 * e.scale); ctx.lineTo(x, e.headY + 140 * e.scale); ctx.stroke();
  // footstep ticks on the floor
  for (let k = 0; k < 3; k++) { const fx = x - dir * (18 + k * 22); ctx.globalAlpha = Math.max(0, u - k * 0.25); ctx.fillRect(fx - 6, WORLD.floorY + 8 + k * 4, 12, 4); }
  ctx.restore();
}

export class Renderer {
  constructor(ctx, doc = globalThis.document) {
    this.ctx = ctx; this.doc = doc; this.view = null; this.sceneCanvas = null;
    this.clear();
  }

  clear() { this.particles = []; this.popups = []; this.shake = 0; this.hitFlash = 0; this.missFlash = 0; this.wallClock = 0; }

  resize(view) {
    this.view = view;
    const c = this.doc.createElement('canvas');
    c.width = Math.max(1, Math.round(WORLD.w * view.scale * view.dpr));
    c.height = Math.max(1, Math.round(WORLD.h * view.scale * view.dpr));
    const k = c.getContext('2d');
    k.scale(c.width / WORLD.w, c.height / WORLD.h);
    drawScene(k);
    this.sceneCanvas = c;
  }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.1, life: 0, max: 380 + Math.random() * 300, color, size: 2 + Math.random() * 3 });
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  popup(x, y, s, color, size = 34) {
    this.popups.push({ x, y, s, color, size, life: 0, max: 900 });
    if (this.popups.length > MAX_POPUPS) this.popups.shift();
  }

  handle(events) {
    for (const e of events) {
      switch (e.type) {
        case 'reset': this.clear(); break;
        case 'hit':
          this.burst(e.x, e.y, e.head ? C.lime : C.cyan, e.head ? 46 : 26, e.head ? 0.55 : 0.4);
          this.burst(e.x, e.y, C.white, 10, 0.25);
          this.shake = Math.max(this.shake, e.head ? 14 : 8); this.hitFlash = 1;
          this.popup(e.x, e.y - 50, `${e.head ? 'HEADSHOT ' : ''}+${e.points}`, e.head ? C.lime : C.cyan, e.head ? 40 : 32);
          break;
        case 'miss': this.burst(e.x, e.y, C.dim, 8, 0.15); this.missFlash = 1; this.popup(e.x, e.y - 30, 'MISS', C.dim, 26); break;
        case 'fake': this.burst(e.x, e.y, C.mag, 30, 0.45); this.shake = 18; this.missFlash = 1; this.popup(e.x, e.y - 40, 'FAKE PEEK -150', C.mag, 36); break;
        case 'dodge': this.popup(e.x, e.y - 60, 'HELD +25', C.amber, 28); break;
        case 'go': this.shake = 6; break;
        default: break;
      }
    }
  }

  step(dt) {
    this.wallClock += dt;
    for (const p of this.particles) { p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 0.0012 * dt; p.vx *= 0.985; }
    this.particles = this.particles.filter((p) => p.life < p.max);
    for (const p of this.popups) { p.life += dt; p.y -= dt * 0.05; }
    this.popups = this.popups.filter((p) => p.life < p.max);
    const k = Math.exp(-dt / 90);
    this.shake *= k; this.hitFlash *= Math.exp(-dt / 120); this.missFlash *= Math.exp(-dt / 160);
  }

  draw(game, dt, extra = {}) {
    const { ctx, view } = this;
    if (!view) return;
    this.step(dt);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, view.cssW, view.cssH);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(view.dpr * view.scale, 0, 0, view.dpr * view.scale, view.dpr * (view.ox + sx), view.dpr * (view.oy + sy));
    if (this.sceneCanvas) ctx.drawImage(this.sceneCanvas, 0, 0, WORLD.w, WORLD.h);

    const ph = game.phase;
    if (ph === PHASE.ATTRACT) this.drawWorld(game.attract, game.attractTime(), true);
    else if (game.run && (ph === PHASE.PLAY || ph === PHASE.COUNTDOWN)) this.drawWorld(game.run.peeks, game.run.t, false);
    else drawCover(ctx);

    for (const p of this.particles) {
      ctx.globalAlpha = 1 - p.life / p.max; ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const p of this.popups) {
      ctx.globalAlpha = Math.min(1, 2.5 * (1 - p.life / p.max));
      text(ctx, p.s, p.x, p.y, { size: p.size, color: p.color, glow: 16 });
    }
    ctx.globalAlpha = 1;
    if (this.missFlash > 0.02) { ctx.fillStyle = `rgba(255,61,139,${0.12 * this.missFlash})`; ctx.fillRect(0, 0, WORLD.w, WORLD.h); }

    if (ph === PHASE.ATTRACT) this.drawAttract(game, extra);
    else if (ph === PHASE.COUNTDOWN) this.drawCountdown(game);
    else if (ph === PHASE.PLAY) this.drawHud(game);
    else if (ph === PHASE.RESULTS) this.drawResults(game);
    else if (ph === PHASE.BOARD) this.drawBoard(game);
    this.drawCrosshair(game.mouse.x, game.mouse.y);
  }

  drawWorld(peeks, t, ambient) {
    const ctx = this.ctx;
    for (const p of peeks) {
      if (t < p.cueAt) break;
      if (t > p.endAt + 300) continue;
      if (!ambient && p.result === 'hit') {
        const u = (t - p.hitT) / 260;
        if (u < 1) { ctx.globalAlpha = 1 - u; drawEnemy(ctx, p, p.hitT, 1 - u); ctx.globalAlpha = 1; }
        continue;
      }
      if (!ambient && p.result === 'shot-fake') continue;
      if (t < p.appearAt && !ambient) drawCue(ctx, p, t);
      drawEnemy(ctx, p, t);
    }
    drawCover(ctx);
  }

  drawCrosshair(x, y) {
    const ctx = this.ctx;
    const col = this.hitFlash > 0.1 ? C.lime : C.white;
    const gap = 7 + this.hitFlash * 6, len = 14;
    ctx.save();
    ctx.lineCap = 'butt';
    for (const [lw, c] of [[6, 'rgba(0,0,0,0.85)'], [2.5, col]]) {
      ctx.strokeStyle = c; ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
      ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
      ctx.stroke();
    }
    ctx.fillStyle = C.cyan; ctx.shadowColor = C.cyan; ctx.shadowBlur = 8;
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    ctx.restore();
  }

  panel(x, y, w, h, color = C.cyan) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(4,7,16,0.82)'; roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.shadowColor = color; ctx.shadowBlur = 16; roundRect(ctx, x, y, w, h, 14); ctx.stroke(); ctx.restore();
  }

  drawAttract(game, extra) {
    const ctx = this.ctx, t = this.wallClock;
    ctx.fillStyle = 'rgba(3,5,10,0.55)'; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.globalAlpha = Math.sin(t / 70) > 0.97 ? 0.4 : 1; // neon flicker
    text(ctx, 'PRE', 640, 230, { size: 170, color: C.cyan, glow: 40, weight: 900, spacing: 6 });
    text(ctx, 'AIM', 990, 230, { size: 170, color: C.mag, glow: 40, weight: 900, spacing: 6 });
    ctx.globalAlpha = 1;
    text(ctx, 'CROSSHAIR PLACEMENT TRAINER  |  60 SECONDS', 800, 345, { size: 30, color: C.white, glow: 8, spacing: 4, weight: 700 });
    this.panel(370, 400, 860, 230, C.amber);
    const lines = [
      ['1', 'Park your crosshair where the enemy WILL appear', C.amber],
      ['2', 'Click the head as fast as you can', C.lime],
      ['3', 'Shoulder only? FAKE PEEK. Hold your fire', C.mag],
    ];
    lines.forEach(([n, s, c], i) => {
      text(ctx, n, 425, 455 + i * 62, { size: 38, color: c, glow: 14, weight: 900 });
      text(ctx, s, 470, 455 + i * 62, { size: 30, color: C.white, align: 'left', weight: 600 });
    });
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(t / 260); // pulse
    text(ctx, 'CLICK TO START', 800, 715, { size: 64, color: C.lime, glow: 30, weight: 900, spacing: 8 });
    ctx.globalAlpha = 1;
    const best = extra.top?.day?.[0] || extra.top?.all?.[0];
    if (best) text(ctx, `TODAY'S TOP  ${best.initials}  ${best.score}`, 800, 800, { size: 30, color: C.amber, glow: 10, font: MONO, weight: 700 });
    text(ctx, extra.mode === 'server' ? 'BOOTH MODE  |  LIVE BOARD' : 'LOCAL MODE', 800, 858, { size: 18, color: C.dim, weight: 600, spacing: 3 });
  }

  drawCountdown(game) {
    const n = Math.max(1, 3 - Math.floor(game.phaseT / 1000));
    const u = (game.phaseT % 1000) / 1000;
    this.ctx.fillStyle = 'rgba(3,5,10,0.45)'; this.ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    this.ctx.globalAlpha = 1 - u * 0.6;
    text(this.ctx, String(n), 800, 430, { size: 260 * (1.25 - 0.25 * u), color: C.cyan, glow: 50, weight: 900 });
    this.ctx.globalAlpha = 1;
    text(this.ctx, 'WATCH THE AMBER GLOW  |  PRE-AIM THE EDGE', 800, 640, { size: 30, color: C.amber, glow: 10, weight: 700, spacing: 3 });
  }

  drawHud(game) {
    const r = game.run, ctx = this.ctx;
    const left = Math.max(0, Math.ceil((game.timing.playMs - r.t) / 1000));
    ctx.fillStyle = 'rgba(3,5,12,0.7)'; ctx.fillRect(0, 0, WORLD.w, 110);
    text(ctx, 'SCORE', 50, 34, { size: 20, color: C.dim, align: 'left', spacing: 4 });
    text(ctx, String(Math.round(r.score)), 50, 76, { size: 54, color: C.white, align: 'left', glow: 10, font: MONO });
    text(ctx, String(left), 800, 58, { size: 84, color: left <= 10 ? C.mag : C.cyan, glow: 26, weight: 900, font: MONO });
    text(ctx, 'STREAK', 1550, 34, { size: 20, color: C.dim, align: 'right', spacing: 4 });
    text(ctx, `${r.streak}`, 1550, 76, { size: 54, color: r.streak >= 3 ? C.lime : C.white, align: 'right', glow: 10, font: MONO });
    const prog = Math.min(1, r.t / game.timing.playMs);
    ctx.fillStyle = 'rgba(46,242,255,0.15)'; ctx.fillRect(0, 106, WORLD.w, 4);
    ctx.fillStyle = left <= 10 ? C.mag : C.cyan; ctx.fillRect(0, 106, WORLD.w * prog, 4);
    const f = r.feedback;
    if (f && r.t - f.t < 1800 && (f.kind === 'head' || f.kind === 'body')) {
      ctx.globalAlpha = Math.min(1, (1800 - (r.t - f.t)) / 400);
      this.panel(400, 790, 800, 80, f.kind === 'head' ? C.lime : C.cyan);
      text(ctx, `PRE-AIM ${f.errPx} px   |   REACT ${f.reactionMs} ms`, 800, 830, { size: 32, color: C.white, font: MONO, weight: 700 });
      ctx.globalAlpha = 1;
    }
  }

  drawResults(game) {
    const ctx = this.ctx, s = game.summary, L = resultsLayout();
    ctx.fillStyle = 'rgba(3,5,10,0.86)'; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    text(ctx, 'RUN COMPLETE', 800, 70, { size: 34, color: C.dim, spacing: 10, weight: 700 });
    text(ctx, String(s.score), 800, 165, { size: 120, color: C.white, glow: 30, weight: 900, font: MONO });
    text(ctx, s.rank, 800, 255, { size: 50, color: C.lime, glow: 24, weight: 900, spacing: 6 });
    const tiles = [['AVG REACTION', `${s.avgReactionMs} ms`, C.cyan], ['AVG PRE-AIM ERROR', `${s.avgErrorPx} px`, C.amber], ['HIT RATE', `${s.hitPct}%`, C.lime], ['FAKES SHOT', `${s.fakeShots}`, C.mag]];
    tiles.forEach(([k, v, c], i) => {
      const x = 140 + i * 340;
      this.panel(x, 300, 300, 120, c);
      text(ctx, k, x + 150, 335, { size: 19, color: C.dim, spacing: 3, weight: 700 });
      text(ctx, v, x + 150, 385, { size: 46, color: c, glow: 12, font: MONO });
    });
    text(ctx, 'ENTER YOUR INITIALS', 800, 465, { size: 26, color: C.white, spacing: 6, weight: 700 });
    const blink = Math.sin(this.wallClock / 180) > 0;
    L.slots.forEach((sl, i) => {
      for (const [r, ch] of [[sl.up, '▲'], [sl.down, '▼']]) {
        const hov = game.mouse.x >= r.x && game.mouse.x <= r.x + r.w && game.mouse.y >= r.y && game.mouse.y <= r.y + r.h;
        this.panel(r.x, r.y, r.w, r.h, hov ? C.lime : C.dim);
        text(ctx, ch, r.x + r.w / 2, r.y + r.h / 2 + 2, { size: 30, color: hov ? C.lime : C.white });
      }
      this.panel(sl.letter.x, sl.letter.y, sl.letter.w, sl.letter.h, C.cyan);
      text(ctx, LETTERS[game.initials[i]], sl.cx, sl.letter.y + sl.letter.h / 2 + 4, { size: 84, color: C.cyan, glow: 22, font: MONO, weight: 900 });
    });
    const d = L.done;
    const hov = game.mouse.x >= d.x && game.mouse.x <= d.x + d.w && game.mouse.y >= d.y && game.mouse.y <= d.y + d.h;
    this.panel(d.x, d.y, d.w, d.h, hov || blink ? C.lime : C.cyan);
    text(ctx, 'DONE', d.x + d.w / 2, d.y + d.h / 2 + 2, { size: 44, color: hov ? C.lime : C.white, glow: 14, weight: 900, spacing: 8 });
    text(ctx, 'click arrows or scroll the wheel', 800, 870, { size: 20, color: C.dim, weight: 600 });
    this.idleBar(game);
  }

  idleBar(game) {
    const u = Math.min(1, game.idleT / game.timing.idleResetMs);
    if (u < 0.25) return;
    this.ctx.fillStyle = 'rgba(255,61,139,0.7)'; this.ctx.fillRect(0, WORLD.h - 6, WORLD.w * (1 - u), 6);
  }

  drawBoard(game) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(3,5,10,0.9)'; ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    text(ctx, 'LEADERBOARD', 800, 70, { size: 60, color: C.cyan, glow: 28, weight: 900, spacing: 10 });
    const b = game.board, me = game.entry;
    if (!b) { text(ctx, 'SAVING...', 800, 450, { size: 40, color: C.dim }); return; }
    const col = (title, rows, x, color) => {
      this.panel(x, 130, 640, 650, color);
      text(ctx, title, x + 320, 175, { size: 30, color, glow: 12, spacing: 6 });
      if (!rows.length) text(ctx, 'NO SCORES YET', x + 320, 420, { size: 28, color: C.dim });
      rows.slice(0, 10).forEach((r, i) => {
        const y = 240 + i * 52;
        const mine = me && r.initials === me.initials && r.score === me.score;
        if (mine) { ctx.fillStyle = 'rgba(184,255,60,0.16)'; ctx.fillRect(x + 16, y - 24, 608, 48); }
        const c = mine ? C.lime : i === 0 ? C.amber : C.white;
        text(ctx, `${i + 1}.`, x + 70, y, { size: 32, color: c, align: 'right', font: MONO });
        text(ctx, r.initials, x + 110, y, { size: 34, color: c, align: 'left', font: MONO, glow: mine ? 12 : 0 });
        text(ctx, String(r.score), x + 600, y, { size: 34, color: c, align: 'right', font: MONO, glow: mine ? 12 : 0 });
      });
    };
    col('TODAY', b.day || [], 140, C.amber);
    col('ALL TIME', b.all || [], 820, C.mag);
    text(ctx, game.phaseT > game.timing.boardClickGuardMs ? 'CLICK TO CONTINUE' : '', 800, 830, { size: 28, color: C.lime, glow: 10, spacing: 6 });
    this.idleBar(game);
  }
}
