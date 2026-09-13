/* The in-game test harness. Tests drive the game through this and nothing else.
   A broken ruler is worse than no ruler, so it reports its own self-check. */
window.__test = {
  version: VERSION,
  cfg: CFG,
  data: DATA,

  /* The picture's size in game pixels. It follows the window and the zoom, so
     a test must ask rather than assume. */
  buffer() { return { w: Render.w, h: Render.h, zoom: Game.state.cam.zoom }; },

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
  /* Zoom while holding a point of the picture still, as the wheel does. */
  zoomAt(bx, by, z) {
    const was = Game.state.cam.zoom;
    setZoom(Game.state, z, bx * was, by * was);
    Game.render();
    return Game.state.cam.zoom;
  },
  motion() { return Game.state.motion; },
  loopOnce(ms) {
    const s = Game.state, before = s.tick;
    Game.paused = false; Game.last = performance.now() - (ms || 20);
    Game.loop(performance.now());
    Game.paused = true;
    return { ticks: s.tick - before, motion: s.motion };
  },

  camp() {
    const c = Game.state.camp;
    if (!c) return null;
    const sum = campSummary(c);
    return {
      room: { index: c.room.index, x: c.room.x, y: c.room.y,
              w: c.room.w, h: c.room.h, elev: c.room.elev },
      summary: sum,
      sites: c.sites.map(function (st) {
        return { index: st.index, structure: st.structure, x: st.x, y: st.y,
                 cleared: st.cleared, progress: st.progress, built: st.built,
                 efforts: st.efforts, room: Game.state.world.at(st.x, st.y).room,
                 pick: Render.siteBase(Game.state) + st.index };
      })
    };
  },
  rooms() {
    return Game.state.world.rooms.map(function (r) {
      return { index: r.index, x: r.x, y: r.y, w: r.w, h: r.h,
               elev: r.elev, floor: r.floor, area: r.area };
    });
  },
  /* Can every room be walked to from this one? Measured, never assumed. */
  connectivity() {
    const w = Game.state.world, n = w.n;
    const start = w.rooms[0];
    const field = reachableFrom(w, start.x + (start.w >> 1), start.y + (start.h >> 1));
    const out = [];
    for (const r of w.rooms) {
      const i = (r.y + (r.h >> 1)) * n + (r.x + (r.w >> 1));
      out.push({ room: r.index, elev: r.elev, steps: field[i] });
    }
    return out;
  },
  pan(dx, dy) { panCamera(Game.state, dx, dy); Game.render(); },
  camera() { return { x: Game.state.cam.x, y: Game.state.cam.y, zoom: Game.state.cam.zoom }; },

  step(n) { for (let i = 0; i < (n || 1); i++) step(Game.state); return Game.state.tick; },
  frame(n) { for (let i = 0; i < (n || 1); i++) Game.frame(); return Render.consumed; },

  /* What actually reached the buffer last draw. Never read Render.batch. */
  consumed() { return Render.consumed; },
  record(on) { Render.recordItems = !!on; Game.state.viewDirty = true; },

  actors() {
    return Game.state.actors.map(function (a) {
      return { index: a.index, name: a.name, x: a.x, y: a.y, attr: a.attr,
               skills: a.skills, worn: a.worn, steps: a.steps, doing: a.doing,
               stumbles: a.stumbles, pick: Game.state.world.cells.length + a.index };
    });
  },
  wearHat(i, on) {
    const a = Game.state.actors[i];
    if (on) a.worn.hat = 'hat'; else delete a.worn.hat;
    Game.state.geomDirty = true; Game.state.viewDirty = true;
    return a.worn;
  },
  rolls() { return Game.state.rolls; },

  /* Put the camera on a crawler AND get the pointer onto them. They are
     scattered over 56 metres and something may be standing in front, so a test
     that wants to inspect one has to go and look, then probe down the figure
     until the pick really is them. */
  pointAtActor(i) {
    this.centreOn(i);
    const s = Game.state, want = Render.actorBase(s) + i;
    Render.recordItems = true;
    s.geomDirty = true; s.viewDirty = true;
    Game.frame();
    const item = Render.consumed.items.find(function (q) { return q.i === want; });
    if (!item) return { found: false, why: 'not drawn' };
    for (let dy = 0; dy <= 24; dy += 2) {
      for (const dx of [0, -2, 2, -4, 4]) {
        if (this.point(item.sx + dx, item.sy + dy) === want) {
          return { found: true, pick: want, sx: item.sx + dx, sy: item.sy + dy,
                   name: item.name, parts: item.parts };
        }
      }
    }
    return { found: false, why: 'hidden behind something', sx: item.sx, sy: item.sy };
  },

  /* Any crawler the pointer can actually reach. Some are behind a wall or
     under a windbreak, and which ones depends on the tick. */
  pointAtAnyActor() {
    for (let i = 0; i < Game.state.actors.length; i++) {
      const got = this.pointAtActor(i);
      if (got.found) { got.index = i; return got; }
    }
    return { found: false, why: 'every crawler is out of sight' };
  },

  /* Draw the same moment again, without advancing it. A test comparing two
     pictures of one instant must not have time pass in between. */
  redraw() {
    const s = Game.state;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s); Render.drawPick(s); Render.draw(s);
    return Render.consumed;
  },

  /* Put the camera on a crawler. */
  centreOn(i) {
    const s = Game.state, a = s.actors[i];
    const p = Render.project(s, a.x + 0.5, a.y + 0.5, surfaceHeight(s.world.at(a.x, a.y)));
    panCamera(s, p.x - Render.w / 2, p.y - Render.h / 2);
    Game.render();
    return { x: a.x, y: a.y };
  },

  /* A controlled bench: one crawler, one skill, one difficulty, repeated in
     blocks, so rule 1 can be argued with numbers instead of adjectives.
     Runs on its own seeded luck and never touches the live match. */
  practice(opts) {
    const bench = { rand: makeRand(opts.seed === undefined ? 1 : opts.seed),
                    tick: 0, rolls: 0 };
    const a = makeActor(makeRand((opts.seed === undefined ? 1 : opts.seed) + 991),
                        0, 'bench');
    if (opts.attr) for (const k in opts.attr) a.attr[k] = opts.attr[k];
    const per = opts.per || 200, blocks = [];
    for (let b = 0; b < (opts.blocks || 4); b++) {
      const before = skillLevel(a, opts.skill);
      let wins = 0;
      for (let i = 0; i < per; i++) {
        if (attempt(bench, a, opts.skill, opts.difficulty).ok) wins++;
      }
      const after = skillLevel(a, opts.skill);
      blocks.push({ before: Math.round(before * 100) / 100,
                    after: Math.round(after * 100) / 100,
                    gain: Math.round((after - before) * 100) / 100,
                    wins: wins, attempts: per });
    }
    return { blocks: blocks, attributes: a.attr, cap: CFG.skillCap,
             base: attributeBase(a, opts.skill),
             ability: ability(a, opts.skill) };
  },

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
      add('one metre is exactly render.rise pixels, at any zoom',
          p0.y - pUp.y === CFG.rise, (p0.y - pUp.y) + 'px for 1 m');
      const pRight = Render.project(a, 5, 4, 0);
      add('one tile east is half a tile wide, half a tile down',
          Math.abs(pRight.x - p0.x - CFG.tileW / 2) < 1e-9
          && Math.abs(pRight.y - p0.y - CFG.tileH / 2) < 1e-9,
          'dx=' + (pRight.x - p0.x) + ' dy=' + (pRight.y - p0.y));
      add('a crawler stands 52 pixels tall at the locked scale',
          Math.round(CFG.actorHeight * CFG.rise) === 52,
          Math.round(CFG.actorHeight * CFG.rise) + 'px for ' + CFG.actorHeight + ' m');

      /* -- everything built reached the buffer ------------------------------ */
      Render.recordItems = true;
      const built = Render.build(a).length;
      const drew = Render.draw(a);
      add('the renderer consumed everything it built',
          drew.count === built, 'built ' + built + ', drew ' + drew.count);
      add('the picture is a whole number of game pixels',
          drew.bufW === Math.round(drew.bufW) && drew.bufH === Math.round(drew.bufH)
          && drew.bufW > 0, drew.bufW + 'x' + drew.bufH);
      add('the camera sits on whole pixels, so nothing shimmers',
          a.cam.x === Math.round(a.cam.x) && a.cam.y === Math.round(a.cam.y),
          a.cam.x + ',' + a.cam.y);

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
        if (it.sx > 8 && it.sx < Render.w - 8 && it.sy > 8 && it.sy < Render.h - 8) {
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

      /* -- rule 2: one framework, six attributes ----------------------------- */
      add('there are exactly six natural attributes (rule 2)',
          ATTRIBUTE_IDS.length === 6, ATTRIBUTE_IDS.join(', '));
      let strayAttr = null;
      const pairsSeen = {};
      for (const sid of SKILL_IDS) {
        const der = SKILL(sid).derives;
        if (der.length !== 2) { strayAttr = sid + ' has ' + der.length + ' attributes'; continue; }
        for (const pair of der) {
          if (ATTRIBUTE_IDS.indexOf(pair[0]) < 0) strayAttr = sid + ' -> ' + pair[0];
        }
        pairsSeen[der.map(function (q) { return q[0]; }).sort().join('+')] = sid;
      }
      add('every skill is one pair of those six and nothing else (rule 2)',
          !strayAttr, strayAttr || (SKILL_IDS.length + ' skills'));
      let missing = [];
      for (let i = 0; i < ATTRIBUTE_IDS.length; i++) {
        for (let j = i + 1; j < ATTRIBUTE_IDS.length; j++) {
          const key = [ATTRIBUTE_IDS[i], ATTRIBUTE_IDS[j]].sort().join('+');
          if (!pairsSeen[key]) missing.push(key);
        }
      }
      add('all fifteen pairs of the six exist, each exactly once',
          SKILL_IDS.length === 15 && !missing.length && Object.keys(pairsSeen).length === 15,
          missing.length ? 'missing ' + missing.join(', ') : SKILL_IDS.length + ' skills');

      /* -- rule 1: failing is what teaches ----------------------------------- */
      const learner = makeActor(makeRand(5), 0, 'bench');
      const gainWin = learn(learner, 'clambering', true, 5);
      learner.skills.clambering = 0;
      const gainLose = learn(learner, 'clambering', false, -40);
      learner.skills.clambering = 0;
      const gainNear = learn(learner, 'clambering', false, -1);
      add('failing teaches more than succeeding (rule 1)',
          gainLose > gainWin, gainLose + ' vs ' + gainWin);
      add('only just failing teaches most of all (rule 1)',
          gainNear > gainLose, gainNear + ' vs ' + gainLose);

      /* -- the labyrinth is rooms and halls, and all of it is walkable ------- */
      add('the labyrinth has rooms', a.world.rooms.length >= 4,
          a.world.rooms.length + ' rooms');
      const levels = {};
      for (const r of a.world.rooms) levels[r.elev] = 1;
      add('the rooms are spread across several levels',
          Object.keys(levels).length >= 2, 'levels ' + Object.keys(levels).join(','));
      const start = a.world.rooms[0];
      const field = reachableFrom(a.world, start.x + (start.w >> 1), start.y + (start.h >> 1));
      let unreached = 0;
      for (const r of a.world.rooms) {
        if (field[(r.y + (r.h >> 1)) * a.world.n + (r.x + (r.w >> 1))] < 0) unreached++;
      }
      add('every room can be walked to from every other',
          unreached === 0, unreached + ' rooms cut off');
      let rock = 0, cut = 0;
      for (const c of a.world.cells) {
        if (TILE(c.tile).footing === 'block') { rock++; if (c.cutaway) cut++; }
      }
      add('some rock is cut away so rooms are not hidden by their own walls',
          cut > 0 && cut < rock, cut + ' of ' + rock + ' rock columns fade');

      /* -- the camp -------------------------------------------------------- */
      add('the crawlers picked a room to camp in', !!a.camp,
          a.camp ? 'room ' + a.camp.room.index + ' at ' + a.camp.room.elev + ' m' : 'none');
      let offPlan = 0;
      if (a.camp) {
        for (const st of a.camp.sites) {
          if (a.world.at(st.x, st.y).room !== a.camp.room.index) offPlan++;
        }
      }
      add('every part of the camp is laid out inside that room',
          a.camp && a.camp.sites.length > 0 && offPlan === 0,
          a.camp ? a.camp.sites.length + ' sites, ' + offPlan + ' astray' : '');

      /* -- crawlers are real, and standing somewhere they could stand -------- */
      let badGround = null;
      for (const act of a.actors) {
        const under = a.world.at(act.x, act.y);
        if (!under || TILE(under.tile).footing === 'block') {
          badGround = act.name + ' at ' + act.x + ',' + act.y;
        }
      }
      add('every crawler is standing on ground they could stand on',
          a.actors.length > 0 && !badGround,
          badGround || (a.actors.length + ' crawlers'));
      let cannotReach = 0;
      if (a.camp) {
        for (const act of a.actors) {
          if (a.camp.sites[0].field[act.y * a.world.n + act.x] < 0) cannotReach++;
        }
      }
      add('every crawler can actually walk to the camp',
          cannotReach === 0, cannotReach + ' cut off from it');

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
