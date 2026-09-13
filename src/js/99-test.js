/* The in-game test harness. Tests drive the game through this and nothing else.
   A broken ruler is worse than no ruler, so it reports its own self-check. */
window.__test = {
  version: VERSION,
  cfg: CFG,
  data: DATA,

  get state() { return Game.state; },

  /* Stop the animation clock. Without this a test races the real loop and
     `frame()` would mean "one step, plus however many the clock slipped in". */
  pause() { Game.paused = true; return true; },
  resume() { Game.paused = false; Game.last = performance.now(); Game.acc = 0; return true; },

  seed(n) {
    Game.state = newState(n >>> 0);
    bindInput(Game.state, Game.canvas, (cx, cy) => Game.toBuffer(cx, cy));
    return Game.state.seed;
  },

  press(name, down) { Game.state.input[name] = !!down; },

  /* Put the pointer somewhere in the low-resolution picture, as a real hover
     would. Returns the cell now under it. */
  point(bx, by) {
    const s = Game.state;
    s.pointer.over = true;
    s.pointer.bx = bx; s.pointer.by = by;
    s.pointer.clientX = 40; s.pointer.clientY = 40;
    Game.render();
    return s.hover;
  },
  unpoint() {
    Game.state.pointer.over = false;
    Game.state.hover = -1;
    Game.state.viewDirty = true;
    Game.render();
  },
  select(i) { Game.state.selected = i; Game.state.viewDirty = true; Game.render(); },

  zoom(z) { setZoom(Game.state, z); Game.render(); return Game.state.cam.zoom; },
  pan(dx, dy) { panCamera(Game.state, dx, dy); Game.render(); },
  camera() { return { x: Game.state.cam.x, y: Game.state.cam.y, zoom: Game.state.cam.zoom }; },

  step(n) { for (let i = 0; i < (n || 1); i++) step(Game.state); return Game.state.tick; },
  frame(n) { for (let i = 0; i < (n || 1); i++) Game.frame(); return Render.consumed; },

  /* What actually reached the buffer last draw. Never read Render.batch. */
  consumed() { return Render.consumed; },
  record(on) { Render.recordItems = !!on; Game.state.viewDirty = true; },

  world() {
    const w = Game.state.world;
    return { seed: w.seed, n: w.n, cells: w.cells.length };
  },
  cell(x, y) {
    const c = Game.state.world.at(x, y);
    return c ? { x: c.x, y: c.y, h: c.h, tile: c.tile, slope: c.slope,
                 footing: TILE(c.tile).footing, index: c.y * Game.state.world.n + c.x } : null;
  },
  project(x, y, h) { return Render.project(Game.state, x, y, h); },
  describe(i) { return Tooltip.describe(Game.state, i); },

  /* What the inspector is actually showing on the page right now. */
  tooltipOnScreen() {
    const el = document.getElementById('tooltip');
    if (!el || el.hidden) return null;
    return {
      showing: Tooltip.showing,
      text: el.textContent,
      tags: Array.from(el.querySelectorAll('.tag')).map((n) => n.textContent)
    };
  },

  /* Does the ruler measure? Run on a throwaway match; the live one is restored. */
  selfCheck() {
    const checks = [];
    const add = (name, ok, detail) => checks.push({ name: name, ok: !!ok, detail: detail });

    const keepState = Game.state;
    const keepConsumed = Render.consumed;
    const keepRecord = Render.recordItems;

    try {
      /* -- the spreadsheet actually reached the game ------------------------ */
      add('the spreadsheet is inside the built file',
          DATA && DATA.knobs && Object.keys(DATA.knobs).length > 0,
          Object.keys(DATA.knobs || {}).length + ' knobs, '
          + Object.keys(DATA.tiles || {}).length + ' tiles');
      add('one tile is one square metre (rule 7)',
          CFG.metresPerTile === 1, 'metres_per_tile=' + CFG.metresPerTile);

      /* -- the world is deterministic --------------------------------------- */
      const a = newState(777), b = newState(777), c = newState(778);
      const sig = (s) => s.world.cells.map((q) => q.h + q.tile).join('|');
      add('same seed, same labyrinth', sig(a) === sig(b), 'seed 777 twice');
      add('a different seed is a different labyrinth', sig(a) !== sig(c), 'seed 777 vs 778');
      add('the seed is actually carried', c.seed === 778, 'seed=' + c.seed);

      /* -- the projection is the projection we think it is ------------------ */
      Game.state = a;
      const p0 = Render.project(a, 4, 4, 0);
      const pUp = Render.project(a, 4, 4, 1);
      add('a metre of elevation lifts the picture',
          p0.y - pUp.y === CFG.rise * a.cam.zoom,
          (p0.y - pUp.y) + 'px for 1 m at zoom ' + a.cam.zoom);
      const pRight = Render.project(a, 5, 4, 0);
      add('one tile east is half a tile wide, half a tile down',
          Math.abs(pRight.x - p0.x - CFG.tileW / 2 * a.cam.zoom) < 1e-9
          && Math.abs(pRight.y - p0.y - CFG.tileH / 2 * a.cam.zoom) < 1e-9,
          'dx=' + (pRight.x - p0.x) + ' dy=' + (pRight.y - p0.y));

      /* -- everything built reached the buffer ------------------------------ */
      Render.recordItems = true;
      const built = Render.build(a).length;
      const drew = Render.draw(a);
      add('the renderer consumed everything it built',
          drew.count === built, 'built ' + built + ', drew ' + drew.count);
      add('the buffer is the size the spreadsheet says',
          drew.bufW === CFG.lowW && drew.bufH === CFG.lowH,
          drew.bufW + 'x' + drew.bufH);

      /* -- painter's order: back to front ----------------------------------- */
      let ordered = true;
      for (let k = 1; k < drew.items.length; k++) {
        if ((drew.items[k].x + drew.items[k].y) < (drew.items[k - 1].x + drew.items[k - 1].y)) {
          ordered = false; break;
        }
      }
      add('blocks are painted back to front', ordered, drew.items.length + ' blocks');

      /* -- picking finds what is under the pointer ---------------------------
         Use the LAST block painted that is comfortably inside the picture: it
         is in front of everything else, so nothing can be hiding it, and the
         view is only a window onto a chunk wider than itself. */
      Render.drawPick(a);
      let front = null;
      for (let k = drew.items.length - 1; k >= 0; k--) {
        const it = drew.items[k];
        if (it.sx > 8 && it.sx < CFG.lowW - 8 && it.sy > 8 && it.sy < CFG.lowH - 8) {
          front = it; break;
        }
      }
      add('some of the labyrinth is actually in view', !!front,
          drew.items.length + ' blocks drawn');
      const hit = front ? Render.pickAt(a, front.sx, front.sy) : -2;
      add('pointing at a block finds that block',
          front && hit === front.i, front ? 'wanted ' + front.i + ', got ' + hit : 'no block');
      add('pointing off the edge of the picture finds nothing',
          Render.pickAt(a, -5, -5) === -1, 'got ' + Render.pickAt(a, -5, -5));

      /* -- the inspector describes what was picked --------------------------- */
      const d = front ? Tooltip.describe(a, front.i) : null;
      add('the inspector describes the block it was given',
          !!d && d.name === TILE(front.tile).name && d.elevation === front.h,
          d ? d.name + ' at ' + d.elevationText : 'nothing');
      add('the description carries tags (rule 8)',
          !!d && d.tags.length > 0, d ? d.tags.join(',') : '');

      /* -- an empty scene draws nothing -------------------------------------- */
      Render.batch.length = 0;
      const empty = Render.draw(a);
      add('an empty scene draws nothing', empty.count === 0, 'drew ' + empty.count);
    } catch (e) {
      add('self-check ran without throwing', false, String((e && e.message) || e));
    } finally {
      Game.state = keepState;
      Render.consumed = keepConsumed;
      Render.recordItems = keepRecord;
      if (Game.state) { Game.state.geomDirty = true; Game.state.viewDirty = true; }
    }

    return { ok: checks.every((c) => c.ok), version: VERSION, checks: checks };
  }
};
