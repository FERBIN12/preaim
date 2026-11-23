// PreAim state machine. Pure: no DOM, no timers. Time only advances via update(dt).
import { generateSchedule, hitTest, enemyPose } from './schedule.js';
import { WORLD, headAnchor } from './scene.js';
import { SCORE, hitPoints, summarize } from './scoring.js';

export const PHASE = Object.freeze({ ATTRACT: 'attract', COUNTDOWN: 'countdown', PLAY: 'play', RESULTS: 'results', BOARD: 'board' });
export const TIMING = Object.freeze({ playMs: 60000, countdownMs: 3000, idleResetMs: 20000, boardMaxMs: 45000, boardClickGuardMs: 1500, maxDt: 100 });
export const MAX_EVENTS = 256;
export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const ATTRACT_LOOP_MS = 24000;

const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Clickable areas on the results screen (world coords). */
export function resultsLayout() {
  const slots = [650, 800, 950].map((cx) => ({
    up: { x: cx - 55, y: 495, w: 110, h: 50 },
    letter: { x: cx - 60, y: 552, w: 120, h: 120 },
    down: { x: cx - 55, y: 679, w: 110, h: 50 },
    cx,
  }));
  return { slots, done: { x: 680, y: 760, w: 240, h: 80 } };
}

export class Game {
  constructor({ seed = 1, timing = {} } = {}) {
    this.seedBase = seed >>> 0;
    this.timing = { ...TIMING, ...timing };
    this.sessions = 0;
    this.time = 0;
    this.mouse = { x: WORLD.w / 2, y: 665 };
    this.events = [];
    this.attract = generateSchedule(0xa77ac7, ATTRACT_LOOP_MS); // read-only ambient loop
    this.reset('init');
  }

  reset(reason = 'reset') {
    this.phase = PHASE.ATTRACT;
    this.phaseT = 0;
    this.idleT = 0;
    this.run = null;
    this.summary = null;
    this.initials = [0, 0, 0];
    this.board = null;
    this.entry = null;
    this.lastCount = 0;
    this.emit({ type: 'reset', reason });
  }

  operatorReset() { this.reset('operator'); }

  emit(e) {
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  drainEvents() { const e = this.events; this.events = []; return e; }

  setPhase(p) { this.phase = p; this.phaseT = 0; this.idleT = 0; }

  start() {
    this.sessions++;
    const seed = (this.seedBase + Math.imul(this.sessions, 0x9e3779b1)) >>> 0;
    this.run = {
      seed, t: 0, peeks: generateSchedule(seed, this.timing.playMs), score: 0, streak: 0, bestStreak: 0,
      hits: [], shots: 0, misses: 0, fakeShots: 0, fakeDodges: 0, escaped: 0, presented: 0, feedback: null,
    };
    this.summary = null;
    this.setPhase(PHASE.COUNTDOWN);
    this.lastCount = 3;
    this.emit({ type: 'countdown', n: 3 });
  }

  update(dtRaw) {
    const dt = Math.max(0, Math.min(this.timing.maxDt, Number(dtRaw) || 0));
    this.time += dt;
    this.phaseT += dt;
    switch (this.phase) {
      case PHASE.COUNTDOWN: {
        const n = 3 - Math.floor(this.phaseT / 1000);
        if (this.phaseT >= this.timing.countdownMs) { this.setPhase(PHASE.PLAY); this.emit({ type: 'go' }); }
        else if (n !== this.lastCount) { this.lastCount = n; this.emit({ type: 'countdown', n }); }
        break;
      }
      case PHASE.PLAY: this.updatePlay(dt); break;
      case PHASE.RESULTS:
        this.idleT += dt;
        if (this.idleT >= this.timing.idleResetMs) this.reset('idle');
        break;
      case PHASE.BOARD:
        this.idleT += dt;
        if (this.idleT >= this.timing.idleResetMs || this.phaseT >= this.timing.boardMaxMs) this.reset('board-done');
        break;
      default: break;
    }
  }

  updatePlay(dt) {
    const r = this.run;
    r.t += dt;
    for (const p of r.peeks) {
      if (r.t < p.cueAt) break;
      if (p.resolved) continue;
      if (!p.cued) { p.cued = true; this.emit({ type: 'cue', edge: p.edgeIndex }); }
      if (!p.appeared && r.t >= p.appearAt) this.markAppeared(p);
      if (r.t >= p.endAt) {
        p.resolved = true;
        if (p.fake) {
          p.result = 'dodged'; r.fakeDodges++; r.score += SCORE.dodgeBonus;
          r.feedback = { kind: 'dodge', t: r.t, points: SCORE.dodgeBonus };
          this.emit({ type: 'dodge', x: p.edge.x, y: p.edge.headY });
        } else {
          p.result = 'escaped'; r.escaped++; r.streak = 0;
          this.emit({ type: 'escape', x: p.edge.x, y: p.edge.headY });
        }
      }
    }
    if (r.t >= this.timing.playMs) this.finish();
  }

  markAppeared(p) {
    p.appeared = true;
    if (!p.fake) {
      this.run.presented++;
      p.errPx = Math.round(dist(this.mouse, headAnchor(p.edge)));
    }
    this.emit({ type: 'appear', fake: p.fake });
  }

  finish() {
    const r = this.run;
    for (const p of r.peeks) {
      if (!p.resolved && p.appeared && !p.fake) { p.resolved = true; p.result = 'escaped'; r.escaped++; }
    }
    this.summary = summarize(r);
    this.initials = [0, 0, 0];
    this.setPhase(PHASE.RESULTS);
    this.emit({ type: 'end', summary: this.summary });
  }

  shoot(x, y) {
    const r = this.run;
    r.shots++;
    let target = null, part = null;
    for (const p of r.peeks) {
      if (r.t < p.cueAt) break;
      if (p.resolved) continue;
      part = hitTest(p, r.t, x, y);
      if (part) { target = p; break; }
    }
    if (!target) {
      r.misses++; r.streak = 0; r.score = Math.max(0, r.score - SCORE.missPenalty);
      r.feedback = { kind: 'miss', t: r.t, points: -SCORE.missPenalty };
      this.emit({ type: 'miss', x, y });
      return;
    }
    target.resolved = true;
    target.hitT = r.t;
    if (target.fake) {
      target.result = 'shot-fake'; r.fakeShots++; r.streak = 0;
      r.score = Math.max(0, r.score - SCORE.fakePenalty);
      r.feedback = { kind: 'fake', t: r.t, points: -SCORE.fakePenalty };
      this.emit({ type: 'fake', x, y });
      return;
    }
    if (!target.appeared) this.markAppeared(target);
    const head = part === 'head';
    const reactionMs = Math.max(0, Math.round(r.t - target.appearAt));
    const points = hitPoints({ errPx: target.errPx, reactionMs, head, streak: r.streak });
    r.score += points;
    r.streak++;
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    r.hits.push({ errPx: target.errPx, reactionMs, head, points });
    target.result = 'hit';
    const pose = enemyPose(target, r.t);
    r.feedback = { kind: head ? 'head' : 'body', t: r.t, points, errPx: target.errPx, reactionMs };
    this.emit({ type: 'hit', head, points, x: pose.cx, y: head ? pose.headY : y, errPx: target.errPx, reactionMs });
  }

  pointerMove(x, y) {
    this.mouse.x = Math.max(0, Math.min(WORLD.w, x));
    this.mouse.y = Math.max(0, Math.min(WORLD.h, y));
    this.idleT = 0;
  }

  pointerDown(x, y) {
    this.pointerMove(x, y);
    switch (this.phase) {
      case PHASE.ATTRACT: this.start(); break;
      case PHASE.PLAY: this.shoot(this.mouse.x, this.mouse.y); break;
      case PHASE.RESULTS: this.clickResults(this.mouse.x, this.mouse.y); break;
      case PHASE.BOARD: if (this.phaseT >= this.timing.boardClickGuardMs) this.reset('board-click'); break;
      default: break;
    }
  }

  wheel(x, y, dy) {
    this.idleT = 0;
    if (this.phase !== PHASE.RESULTS || !dy) return;
    const L = resultsLayout();
    L.slots.forEach((s, i) => { if (Math.abs(x - s.cx) <= 60 && y >= s.up.y && y <= s.down.y + s.down.h) this.spin(i, dy > 0 ? 1 : -1); });
  }

  spin(i, d) {
    this.initials[i] = (this.initials[i] + d + LETTERS.length) % LETTERS.length;
    this.emit({ type: 'tick' });
  }

  initialsString() { return this.initials.map((i) => LETTERS[i]).join(''); }

  clickResults(x, y) {
    const L = resultsLayout();
    for (let i = 0; i < 3; i++) {
      const s = L.slots[i];
      if (inRect(s.up, x, y)) return this.spin(i, -1);
      if (inRect(s.down, x, y) || inRect(s.letter, x, y)) return this.spin(i, 1);
    }
    if (inRect(L.done, x, y)) this.submit();
  }

  submit() {
    const s = this.summary;
    this.entry = { initials: this.initialsString(), score: s.score, avg_ms: s.avgReactionMs, avg_err: s.avgErrorPx, hit_pct: s.hitPct };
    this.board = null;
    this.setPhase(PHASE.BOARD);
    this.emit({ type: 'submit', entry: this.entry, token: this.sessions });
  }

  /** Async leaderboard results arrive here; stale tokens (previous player) are ignored. */
  setBoard(token, board) {
    if (token !== this.sessions || this.phase !== PHASE.BOARD) return false;
    this.board = board;
    return true;
  }

  /** Ambient enemy loop for the attract screen. */
  attractTime() { return this.phaseT % ATTRACT_LOOP_MS; }
}
