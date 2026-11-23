// Demo autoplayer for ?demo=1 capture and the stress test. Pure: drives a Game through its public API.
import { mulberry32, range } from './rng.js';
import { PHASE, LETTERS, resultsLayout } from './game.js';
import { enemyPose } from './schedule.js';
import { headAnchor } from './scene.js';

export class DemoBot {
  constructor(seed = 42, { skill = 0.8, name = 'DMO', fakeShotRate = 0.15 } = {}) {
    this.rng = mulberry32(seed);
    this.skill = skill;
    this.name = name;
    this.fakeShotRate = fakeShotRate;
    this.reset();
  }

  reset() { this.phase = null; this.wait = 0; this.plan = null; this.queue = []; this.done = false; }

  update(game, dt) {
    if (game.phase !== this.phase) { this.reset(); this.phase = game.phase; }
    this.wait += dt;
    if (game.phase === PHASE.ATTRACT && this.wait > 1500) { this.wait = 0; game.pointerDown(800, 600); }
    else if (game.phase === PHASE.PLAY) this.play(game, dt);
    else if (game.phase === PHASE.RESULTS) this.results(game);
  }

  play(game, dt) {
    const r = game.run;
    const next = r.peeks.find((p) => p.cued && !p.resolved);
    let tx = 800, ty = 400;
    if (next) {
      if (!this.plan || this.plan.peek !== next) {
        const miss = (1 - this.skill) * 90;
        const a = range(this.rng, 0, Math.PI * 2);
        this.plan = {
          peek: next, ex: Math.cos(a) * miss * this.rng(), ey: Math.sin(a) * miss * this.rng(),
          react: range(this.rng, 200, 200 + (1 - this.skill) * 700), shootFake: this.rng() < this.fakeShotRate,
        };
      }
      const a = headAnchor(next.edge);
      tx = a.x + this.plan.ex; ty = a.y + this.plan.ey;
      const due = next.appearAt + (next.fake ? 250 : this.plan.react);
      if (next.appeared && r.t >= due && (!next.fake || this.plan.shootFake)) {
        const q = enemyPose(next, r.t);
        const sx = next.fake ? next.edge.x + next.edge.dir * 6 : q.cx + range(this.rng, -4, 4);
        const sy = next.fake ? q.headY + q.headR * 2 : q.headY + range(this.rng, -4, 4);
        game.pointerMove(sx, sy);
        game.pointerDown(sx, sy);
        this.plan = null;
        return;
      }
    }
    const k = Math.min(1, dt / 90);
    game.pointerMove(game.mouse.x + (tx - game.mouse.x) * k, game.mouse.y + (ty - game.mouse.y) * k);
  }

  results(game) {
    if (this.wait < 1200) return;
    if (!this.queue.length && !this.done) {
      const L = resultsLayout();
      for (let i = 0; i < 3; i++) {
        const want = LETTERS.indexOf(this.name[i]);
        const fwd = (want - game.initials[i] + 26) % 26;
        const r = fwd <= 13 ? L.slots[i].down : L.slots[i].up;
        for (let k = 0; k < Math.min(fwd, 26 - fwd); k++) this.queue.push(r);
      }
      this.queue.push(L.done);
      this.done = true;
    }
    if (this.queue.length && this.wait >= 1300) {
      this.wait = 1200;
      const r = this.queue.shift();
      game.pointerDown(r.x + r.w / 2, r.y + r.h / 2);
    }
  }
}
