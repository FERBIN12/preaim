import test from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../web/js/rng.js';
import { generateSchedule, peekOffset, hitTest, enemyPose, difficulty } from '../web/js/schedule.js';
import { aimPoints, reactionPoints, hitPoints, rankFor, streakMultiplier, SCORE } from '../web/js/scoring.js';
import { Game, PHASE, resultsLayout, MAX_EVENTS } from '../web/js/game.js';
import { headAnchor } from '../web/js/scene.js';
import { topEntries, createLocalStore, createMemoryStorage, detectServer, createLeaderboard, isValidInitials } from '../web/js/leaderboard.js';

const center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

test('rng is deterministic and in [0,1)', () => {
  const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
  const xs = Array.from({ length: 1000 }, a);
  assert.deepEqual(xs.slice(0, 5), Array.from({ length: 5 }, b));
  assert.notEqual(xs[0], c());
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('schedule is seed-deterministic, sorted, inside the run, and escalates', () => {
  const s1 = generateSchedule(123), s2 = generateSchedule(123), s3 = generateSchedule(124);
  const key = (s) => s.map((p) => [p.edgeIndex, Math.round(p.startAt), p.fake]);
  assert.deepEqual(key(s1), key(s2));
  assert.notDeepEqual(key(s1), key(s3));
  assert.ok(s1.length >= 18, `peeks: ${s1.length}`);
  for (let i = 1; i < s1.length; i++) assert.ok(s1[i].cueAt >= s1[i - 1].cueAt);
  for (const p of s1) {
    assert.ok(p.cueAt < p.appearAt && p.appearAt < p.endAt);
    assert.ok(p.startAt + p.slideMs + p.holdMs <= 60000);
  }
  assert.ok(difficulty(1).holdMs < difficulty(0).holdMs && difficulty(1).width > difficulty(0).width);
  // across many seeds: fakes and doubles only show up later, and they do show up
  let fakesEarly = 0, fakes = 0, doubles = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const s = generateSchedule(seed);
    for (const p of s) { if (p.fake) { fakes++; if (p.cueAt < 0.15 * 60000) fakesEarly++; } }
    for (let i = 1; i < s.length; i++) if (s[i].cueAt === s[i - 1].cueAt) doubles++;
  }
  assert.equal(fakesEarly, 0);
  assert.ok(fakes > 20 && doubles > 20, `fakes ${fakes} doubles ${doubles}`);
});

test('peek geometry: hidden before/after, head hittable only while out, fake never has a head', () => {
  const s = generateSchedule(5);
  const real = s.find((p) => !p.fake), fake = generateSchedule(9).concat(generateSchedule(10)).find((p) => p.fake);
  assert.equal(peekOffset(real, real.startAt - 1), real.hidden);
  assert.equal(peekOffset(real, real.endAt + 1), real.hidden);
  const mid = real.startAt + real.slideMs + real.holdMs / 2;
  const q = enemyPose(real, mid);
  assert.equal(hitTest(real, mid, q.cx, q.headY), 'head');
  assert.equal(hitTest(real, mid, q.cx, q.headY + q.headR + 40), 'body');
  assert.equal(hitTest(real, real.startAt - 10, q.cx, q.headY), null);
  assert.equal(hitTest(real, mid, q.cx + 300, q.headY), null);
  const fm = fake.startAt + fake.slideMs + 50;
  const fq = enemyPose(fake, fm);
  assert.ok(fq.cx * fake.edge.dir < fake.edge.x * fake.edge.dir - fq.headR, 'fake head stays behind cover');
  assert.equal(hitTest(fake, fm, fake.edge.x + fake.edge.dir * 5, fq.headY + fq.headR * 2), 'body');
});

test('scoring curves and ranks', () => {
  assert.equal(aimPoints(0), SCORE.aimMax);
  assert.equal(aimPoints(SCORE.aimZeroPx), 0);
  assert.equal(aimPoints(9999), 0);
  assert.equal(reactionPoints(100), SCORE.rtMax);
  assert.equal(reactionPoints(SCORE.rtZeroMs), 0);
  assert.ok(reactionPoints(300) > reactionPoints(500));
  assert.equal(hitPoints({ errPx: 0, reactionMs: 0, head: true, streak: 0 }), 600);
  assert.equal(hitPoints({ errPx: 0, reactionMs: 0, head: false, streak: 0 }), 360);
  assert.equal(streakMultiplier(100), SCORE.streakMax);
  assert.equal(rankFor(0), 'WALL STARER');
  assert.equal(rankFor(1e6), 'CROSSHAIR ORACLE');
});

function play(game, ms, step = 16) { for (let t = 0; t < ms; t += step) game.update(step); }

test('full loop: attract -> countdown -> play -> results -> board -> attract', () => {
  const g = new Game({ seed: 3 });
  assert.equal(g.phase, PHASE.ATTRACT);
  g.pointerDown(800, 450);
  assert.equal(g.phase, PHASE.COUNTDOWN);
  play(g, 3000);
  assert.equal(g.phase, PHASE.PLAY);
  // perfectly pre-aimed player: park on each live edge, shoot head 250 ms after it appears
  const r = g.run;
  while (g.phase === PHASE.PLAY) {
    const p = r.peeks.find((x) => x.cued && !x.resolved && !x.fake);
    if (p) {
      const a = headAnchor(p.edge);
      g.pointerMove(a.x, a.y);
      if (p.appeared && r.t > p.appearAt + 250) { const q = enemyPose(p, r.t); g.pointerDown(q.cx, q.headY); }
    }
    g.update(16);
  }
  assert.equal(g.phase, PHASE.RESULTS);
  const s = g.summary;
  assert.ok(s.hits > 10 && s.hitPct >= 90, JSON.stringify(s));
  assert.ok(s.avgReactionMs >= 250 && s.avgReactionMs < 320, JSON.stringify(s));
  // single peeks were pre-aimed exactly; double peeks (second enemy elsewhere) add real error
  assert.ok(r.hits.filter((h) => h.errPx < 5).length >= 0.7 * r.hits.length);
  assert.equal(s.fakeShots, 0);
  const L = resultsLayout();
  g.pointerDown(...center(L.slots[0].down)); // A -> B
  g.pointerDown(...center(L.slots[1].up)); // A -> Z
  g.wheel(L.slots[2].cx, L.slots[2].letter.y + 10, 1); // A -> B
  assert.equal(g.initialsString(), 'BZB');
  g.drainEvents();
  g.pointerDown(...center(L.done));
  assert.equal(g.phase, PHASE.BOARD);
  const sub = g.drainEvents().find((e) => e.type === 'submit');
  assert.deepEqual(sub.entry.initials, 'BZB');
  assert.equal(sub.entry.score, s.score);
  assert.ok(g.setBoard(sub.token, { day: [sub.entry], all: [sub.entry] }));
  g.pointerDown(1, 1); // click guard: too early
  assert.equal(g.phase, PHASE.BOARD);
  play(g, 20000);
  assert.equal(g.phase, PHASE.ATTRACT);
  assert.equal(g.run, null);
});

test('penalties: miss click, fake shot; results idle resets; stale board ignored', () => {
  const g = new Game({ seed: 11 });
  g.pointerDown(0, 0); play(g, 3000);
  g.update(16);
  g.pointerDown(5, 890); // nothing there
  assert.equal(g.run.misses, 1);
  assert.equal(g.run.score, 0, 'score floors at 0');
  // find a fake and shoot its shoulder
  let found = false;
  while (g.phase === PHASE.PLAY && !found) {
    const f = g.run.peeks.find((p) => p.fake && !p.resolved && g.run.t >= p.startAt + p.slideMs);
    if (f) { const q = enemyPose(f, g.run.t); g.pointerDown(f.edge.x + f.edge.dir * 4, q.headY + q.headR * 2); found = true; break; }
    g.update(16);
  }
  assert.ok(found, 'seed 11 has a fake peek');
  assert.equal(g.run.fakeShots, 1);
  while (g.phase === PHASE.PLAY) g.update(16);
  assert.equal(g.phase, PHASE.RESULTS);
  play(g, 19000);
  assert.equal(g.phase, PHASE.RESULTS, 'still waiting before 20 s idle');
  const token = g.sessions;
  play(g, 1100);
  assert.equal(g.phase, PHASE.ATTRACT);
  assert.equal(g.setBoard(token, { day: [], all: [] }), false);
  assert.equal(g.board, null);
});

test('operator reset mid-play and event queue is bounded', () => {
  const g = new Game({ seed: 1 });
  g.pointerDown(0, 0); play(g, 10000);
  for (let i = 0; i < 1000; i++) g.pointerDown(1, 899);
  assert.ok(g.events.length <= MAX_EVENTS);
  g.operatorReset();
  assert.equal(g.phase, PHASE.ATTRACT);
  assert.equal(g.run, null);
  assert.equal(g.drainEvents().at(-1).reason, 'operator');
  g.update(1e9); // huge dt is clamped
  assert.equal(g.time <= 10000 + 100 + 10000, true);
});

test('leaderboard helpers + local fallback detection', async () => {
  assert.ok(isValidInitials('ABC') && !isValidInitials('AB') && !isValidInitials('abc'));
  const now = Date.UTC(2026, 10, 22, 15);
  const rows = [
    { initials: 'AAA', score: 5, ts: now }, { initials: 'BBB', score: 9, ts: now - 3 * 864e5 },
    { initials: 'CCC', score: 7, ts: now }, { initials: 'bad', score: 99, ts: now },
  ];
  assert.deepEqual(topEntries(rows, 'all', now).map((r) => r.initials), ['BBB', 'CCC', 'AAA']);
  assert.deepEqual(topEntries(rows, 'day', now).map((r) => r.initials), ['CCC', 'AAA']);
  const st = createMemoryStorage();
  const store = createLocalStore(st);
  for (let i = 0; i < 15; i++) store.add({ initials: 'XYZ', score: i * 10 }, now);
  assert.equal(store.top(now).all.length, 10);
  assert.equal(store.top(now).all[0].score, 140);
  st.setItem('preaim.scores.v1', '{corrupt');
  assert.deepEqual(store.load(), []);
  // detection: static host 404, network error, wrong JSON, and a real server
  const res = (ok, body) => async () => ({ ok, json: async () => body });
  assert.equal(await detectServer(res(false, null)), false);
  assert.equal(await detectServer(async () => { throw new TypeError('offline'); }), false);
  assert.equal(await detectServer(res(true, { ok: true })), false);
  assert.equal(await detectServer(res(true, { ok: true, service: 'preaim' })), true);
  assert.equal(await detectServer(undefined), false);
  const lb = await createLeaderboard({ fetchFn: res(false, null), storage: createMemoryStorage() });
  assert.equal(lb.mode, 'local');
  await lb.submit({ initials: 'LOC', score: 42 });
  assert.equal((await lb.top()).all[0].initials, 'LOC');
});
