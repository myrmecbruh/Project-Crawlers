/* The in-game test harness. Tests drive the game through this and nothing else.
   A broken ruler is worse than no ruler, so it reports its own self-check. */
window.__test = {
  version: VERSION,
  field: FIELD,

  get state() { return Game.state; },

  /* Stop the animation clock. Without this a test races the real loop and
     `frame()` would mean "one step, plus however many the clock slipped in". */
  pause() { Game.paused = true; return true; },
  resume() { Game.paused = false; Game.last = performance.now(); Game.acc = 0; return true; },

  /* Restart the match on a known seed. A number without its seed is not a number. */
  seed(n) {
    Game.state = newState(n >>> 0);
    bindInput(Game.state, Game.canvas, (cx, cy) => Game.toField(cx, cy));
    return Game.state.seed;
  },

  press(name, down) { Game.state.input[name] = !!down; },
  aim(x, y) { Game.state.input.aimX = x; Game.state.input.aimY = y; },
  release() { Game.state.input.aimX = null; Game.state.input.aimY = null; },

  /* Advance the simulation without drawing. */
  step(n) { for (let i = 0; i < (n || 1); i++) step(Game.state); return Game.state.tick; },

  /* Advance AND draw, so `consumed` is what a player would have seen. */
  frame(n) { for (let i = 0; i < (n || 1); i++) Game.frame(); return Render.consumed; },

  /* What actually reached the canvas last draw. Never read Render.batch. */
  consumed() { return Render.consumed; },
  record(on) { Render.recordItems = !!on; },

  mover() {
    const m = Game.state.mover;
    return { x: m.x, y: m.y, vx: m.vx, vy: m.vy, r: m.r };
  },

  /* Does the ruler measure? Run on a throwaway state; the live one is untouched. */
  selfCheck() {
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name: name, ok: !!ok, detail: detail });

    const keepConsumed = Render.consumed;
    const keepRecord = Render.recordItems;
    const keepState = Game.state;
    const off = document.createElement('canvas');
    off.width = FIELD.w; off.height = FIELD.h;
    const ctx = off.getContext('2d');

    try {
      const run = (seed) => {
        const s = newState(seed);
        s.input.right = true;
        s.input.down = true;
        for (let i = 0; i < 60; i++) step(s);
        return s;
      };

      const a = run(777), b = run(777), c = run(778);
      add('step advances the tick', a.tick === 60, 'tick=' + a.tick);
      add('the mover moved at all', Math.hypot(a.mover.x - FIELD.w / 2, a.mover.y - FIELD.h / 2) > 1,
          'moved ' + Math.hypot(a.mover.x - FIELD.w / 2, a.mover.y - FIELD.h / 2).toFixed(2) + 'u');
      add('same seed, same result', a.mover.x === b.mover.x && a.mover.y === b.mover.y,
          a.mover.x.toFixed(4) + ' vs ' + b.mover.x.toFixed(4));
      add('the seed is actually carried', c.seed === 778, 'seed=' + c.seed);

      Game.state = a;
      Render.recordItems = true;
      Render.build(a);
      const built = Render.batch.length;
      const drew = Render.draw(ctx, a);
      add('the renderer consumed what was built', drew && drew.count === built,
          'built ' + built + ', drew ' + (drew ? drew.count : 0));
      add('the mover reached the canvas', !!(drew.items || []).some((i) => i.kind === 'mover'),
          'kinds ' + JSON.stringify(drew.kinds));

      Render.batch.length = 0;
      const empty = Render.draw(ctx, a);
      add('an empty batch draws nothing', empty.count === 0, 'drew ' + empty.count);
    } catch (e) {
      add('self-check ran without throwing', false, String(e && e.message || e));
    } finally {
      Game.state = keepState;
      Render.consumed = keepConsumed;
      Render.recordItems = keepRecord;
    }

    return { ok: checks.every((c) => c.ok), version: VERSION, checks: checks };
  }
};
