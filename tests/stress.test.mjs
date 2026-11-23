// Stress: 500 full sessions through the pure state machine with the demo bot.
// Asserts every reset returns the machine to an identical clean state (no leaked run/board/events).
// Run alone: node --test tests/stress.test.mjs   (SESSIONS=2000 to go longer)
import test from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { Game, PHASE, MAX_EVENTS } from '../web/js/game.js';
import { DemoBot } from '../web/js/bot.js';

const SESSIONS = Number(process.env.SESSIONS || 500);
const cleanShape = (g) => JSON.stringify({
  phase: g.phase, phaseT: g.phaseT, idleT: g.idleT, run: g.run, summary: g.summary,
  initials: g.initials, board: g.board, entry: g.entry, keys: Object.keys(g).sort(),
});

test(`${SESSIONS} sessions: complete loop every time, clean reset, bounded memory`, () => {
  const g = new Game({ seed: 99 });
  const bot = new DemoBot(7, { skill: 0.7 });
  const fresh = cleanShape(g);
  g.drainEvents();
  const dt = 33;
  let completed = 0, totalEvents = 0, maxQueue = 0, totalSteps = 0, totalHits = 0;
  const scores = new Set();
  const heap0 = process.memoryUsage().heapUsed;
  for (let s = 0; s < SESSIONS; s++) {
    let sawBoard = false, steps = 0;
    const startSessions = g.sessions;
    while (true) {
      g.update(dt);
      bot.update(g, dt);
      maxQueue = Math.max(maxQueue, g.events.length);
      const ev = g.drainEvents();
      totalEvents += ev.length;
      for (const e of ev) {
        if (e.type === 'hit') totalHits++;
        if (e.type === 'submit') { assert.ok(g.setBoard(e.token, { day: [e.entry], all: [e.entry] })); scores.add(e.entry.score); }
      }
      if (g.phase === PHASE.BOARD) sawBoard = true;
      if (sawBoard && g.phase === PHASE.ATTRACT) break;
      totalSteps++;
      if (++steps > 200000 / dt * 10) assert.fail(`session ${s} stuck in ${g.phase}`);
    }
    assert.equal(g.sessions, startSessions + 1);
    assert.equal(cleanShape(g), fresh, `state leaked after session ${s}`);
    completed++;
  }
  assert.equal(completed, SESSIONS);
  assert.ok(maxQueue <= MAX_EVENTS);
  assert.ok(scores.size > SESSIONS / 10, 'seeded runs differ between players');
  if (globalThis.gc) globalThis.gc();
  const growthMb = (process.memoryUsage().heapUsed - heap0) / 1e6;
  assert.ok(growthMb < 50, `heap grew ${growthMb.toFixed(1)} MB`);
  console.log(`stress: ${completed} sessions, ${totalSteps} updates (${(totalSteps * dt / 3.6e6).toFixed(1)} h simulated), ${totalHits} hits, ${totalEvents} events, distinct scores ${scores.size}, heap +${growthMb.toFixed(1)} MB`);
});
