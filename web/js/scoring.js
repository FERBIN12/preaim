// Scoring rules. Pure.
export const SCORE = Object.freeze({
  base: 100, aimMax: 200, aimZeroPx: 250, rtMax: 300, rtFullMs: 180, rtZeroMs: 900,
  bodyMult: 0.6, missPenalty: 30, fakePenalty: 150, dodgeBonus: 25, streakStep: 0.1, streakMax: 1.5,
  maxTotal: 100000,
});
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export const aimPoints = (errPx) => Math.round(SCORE.aimMax * clamp01(1 - errPx / SCORE.aimZeroPx));
export const reactionPoints = (ms) =>
  Math.round(SCORE.rtMax * clamp01(1 - (ms - SCORE.rtFullMs) / (SCORE.rtZeroMs - SCORE.rtFullMs)));
export const streakMultiplier = (streak) => Math.min(SCORE.streakMax, 1 + SCORE.streakStep * Math.max(0, streak));

export function hitPoints({ errPx, reactionMs, head, streak = 0 }) {
  const raw = SCORE.base + aimPoints(errPx) + reactionPoints(reactionMs);
  return Math.round(raw * (head ? 1 : SCORE.bodyMult) * streakMultiplier(streak));
}

export const RANKS = Object.freeze([
  { min: 0, title: 'WALL STARER' },
  { min: 4000, title: 'CORNER CURIOUS' },
  { min: 8000, title: 'ANGLE HOLDER' },
  { min: 12000, title: 'PRE-AIM ADEPT' },
  { min: 16000, title: 'HEADLINE HUNTER' },
  { min: 20000, title: 'CROSSHAIR ORACLE' },
]);
export function rankFor(score) {
  let r = RANKS[0];
  for (const k of RANKS) if (score >= k.min) r = k;
  return r.title;
}

export function summarize(run) {
  const hits = run.hits;
  const n = hits.length;
  const avg = (f) => (n ? Math.round(hits.reduce((s, h) => s + f(h), 0) / n) : 0);
  const score = Math.max(0, Math.min(SCORE.maxTotal, Math.round(run.score)));
  return {
    score,
    hits: n,
    targets: run.presented,
    heads: hits.filter((h) => h.head).length,
    hitPct: run.presented ? Math.round((100 * n) / run.presented) : 0,
    avgReactionMs: avg((h) => h.reactionMs),
    avgErrorPx: avg((h) => h.errPx),
    shots: run.shots, misses: run.misses, fakeShots: run.fakeShots, fakeDodges: run.fakeDodges,
    bestStreak: run.bestStreak,
    rank: rankFor(score),
  };
}
