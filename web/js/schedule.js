// Peek scheduling + enemy pose geometry. Pure, deterministic from a seed.
import { mulberry32, range, pickIndex } from './rng.js';
import { EDGES, ENEMY } from './scene.js';

const lerp = (a, b, u) => a + (b - a) * Math.max(0, Math.min(1, u));

/** Difficulty knobs as a function of progress p in [0,1]. */
export function difficulty(p) {
  return {
    cueMs: lerp(800, 380, p),
    slideMs: lerp(230, 110, p),
    holdMs: lerp(1300, 600, p),
    retreatMs: lerp(170, 120, p),
    gapMs: lerp(700, 260, p),
    width: lerp(28, 100, p),
    pDouble: p < 0.3 ? 0 : lerp(0.12, 0.35, (p - 0.3) / 0.7),
    pFake: p < 0.2 ? 0 : lerp(0.1, 0.25, (p - 0.2) / 0.8),
  };
}

function makePeek(edgeIndex, startAt, d, rng, fake) {
  const edge = EDGES[edgeIndex];
  const s = edge.scale;
  const headR = ENEMY.headR * s;
  const hidden = -ENEMY.shoulderHalf * s - 4;
  const room = edge.clip[1] - edge.clip[0] - headR * 1.5;
  const width = fake ? -headR - 3 : Math.min(room, Math.max(headR * 0.6, d.width * s * range(rng, 0.8, 1.25)));
  const slideMs = fake ? d.slideMs * 0.8 : d.slideMs;
  const holdMs = fake ? range(rng, 260, 420) : d.holdMs * range(rng, 0.85, 1.15);
  // Moment the head (real) or shoulder (fake) first becomes visible, linear slide.
  const visibleOff = fake ? -ENEMY.shoulderHalf * s : -headR;
  const u = (visibleOff - hidden) / (width - hidden);
  const appearAt = startAt + Math.max(0, Math.min(1, u)) * slideMs;
  const endAt = startAt + slideMs + holdMs + d.retreatMs;
  return {
    edgeIndex, edge, fake, startAt, slideMs, holdMs, retreatMs: d.retreatMs,
    hidden, width, appearAt, endAt, cueAt: startAt - d.cueMs,
    // mutable per-run state
    cued: false, appeared: false, resolved: false, result: null, errPx: null, hitT: null,
  };
}

/** Generate the whole run's peeks up front, sorted by cueAt. */
export function generateSchedule(seed, durationMs = 60000) {
  const rng = mulberry32(seed);
  const peeks = [];
  let t = 1200;
  let lastEdge = -1;
  while (true) {
    const d = difficulty(t / durationMs);
    const startAt = t + d.cueMs;
    if (startAt + d.slideMs + d.holdMs > durationMs - 150) break;
    let e = pickIndex(rng, EDGES.length);
    if (e === lastEdge) e = (e + 1 + pickIndex(rng, EDGES.length - 1)) % EDGES.length;
    lastEdge = e;
    const fake = rng() < d.pFake;
    const first = makePeek(e, startAt, d, rng, fake);
    peeks.push(first);
    let end = first.endAt;
    if (!fake && rng() < d.pDouble) {
      let e2 = (e + 2 + pickIndex(rng, EDGES.length - 3)) % EDGES.length;
      if (EDGES[e2].clip[0] === EDGES[e].clip[0]) e2 = (e2 + 2) % EDGES.length;
      const second = makePeek(e2, startAt + range(rng, 120, 320), d, rng, false);
      second.cueAt = first.cueAt; // both areas go live together
      peeks.push(second);
      end = Math.max(end, second.endAt);
    }
    t = end + d.gapMs * range(rng, 0.8, 1.3);
  }
  peeks.sort((a, b) => a.cueAt - b.cueAt || a.startAt - b.startAt);
  return peeks;
}

/** How far (px) the enemy center has moved past the cover edge at time t. Negative = behind cover. */
export function peekOffset(p, t) {
  const a = p.startAt, b = a + p.slideMs, c = b + p.holdMs, d = c + p.retreatMs;
  if (t <= a || t >= d) return p.hidden;
  if (t < b) return lerp(p.hidden, p.width, (t - a) / p.slideMs);
  if (t < c) return p.width;
  return lerp(p.width, p.hidden, (t - c) / p.retreatMs);
}

export function enemyPose(p, t) {
  const e = p.edge, s = e.scale;
  const off = peekOffset(p, t);
  return { cx: e.x + e.dir * off, headY: e.headY, headR: ENEMY.headR * s, shoulderHalf: ENEMY.shoulderHalf * s, torso: ENEMY.torso * s, scale: s, off };
}

/** Returns 'head' | 'body' | null. Only the part inside the edge's visible window can be hit. */
export function hitTest(p, t, x, y) {
  const [x0, x1, y0, y1] = p.edge.clip;
  if (x < x0 || x > x1 || y < y0 || y > y1) return null;
  const q = enemyPose(p, t);
  const dx = x - q.cx, dy = y - q.headY;
  if (!p.fake && dx * dx + dy * dy <= (q.headR * 1.2) ** 2) return 'head';
  const top = q.headY + q.headR * 0.9;
  if (Math.abs(dx) <= q.shoulderHalf && y >= top && y <= top + q.torso) return 'body';
  return null;
}
