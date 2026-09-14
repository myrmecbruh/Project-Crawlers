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
    Game.fit();                       /* the picture follows the new zoom */
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

  /* A tap on the picture, which is how the game itself makes a selection: it
     pins the thing AND decides whether the view rides it. */
  tap(pick) {
    const s = Game.state;
    s.selected = pick;
    setFollow(s, pick);
    s.viewDirty = true;
    Game.render();
    return { selected: s.selected, follow: s.cam.follow };
  },

  zoom(z) { setZoom(Game.state, z); Game.render(); return Game.state.cam.zoom; },

  /* Turn the view a quarter, and run the swing to its end. */
  rotate(quarters) {
    rotateCamera(Game.state, quarters);
    this.settle();
    return this.camera();
  },
  tilt(up) {
    tiltCamera(Game.state, up);
    this.settle();
    return this.camera();
  },
  /* Push the swing along by hand, in milliseconds of real time. */
  camStep(ms) { const moved = camAnimate(Game.state, ms); Game.render(); return moved; },
  settle() {
    for (let i = 0; i < 400 && camAnimate(Game.state, 16); i++) { /* swing it out */ }
    Game.render();
    return this.camera();
  },
  loopOnce(ms) {
    const s = Game.state, before = s.tick;
    Game.paused = false; Game.last = performance.now() - (ms || 20);
    Game.loop(performance.now());
    Game.paused = true;
    return { ticks: s.tick - before };
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
  lightAt(x, y) {
    const s = Game.state;
    return lightAt(s, y * s.world.n + x);
  },
  lightSources() { return lightSourcesIn(Game.state); },
  litCells() {
    const s = Game.state;
    let lit = 0, dark = 0;
    for (let i = 0; i < s.world.cells.length; i++) {
      if (lightAt(s, i) > 0.15) lit++; else dark++;
    }
    return { lit: lit, dark: dark, total: s.world.cells.length };
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
  /* The player's clock, which is not the same thing as the test freeze. */
  clock() {
    const s = Game.state;
    return { paused: s.paused, speed: s.speed, name: speedName(s),
             multiplier: speedOf(s), steps: SPEED_IDS.length };
  },
  setPaused(on) { setPaused(Game.state, on); Game.refreshControls(); return this.clock(); },
  setSpeed(i) { setSpeed(Game.state, i); Game.refreshControls(); return this.clock(); },
  controlsOnScreen() {
    const g = (id) => document.getElementById(id);
    return { pause: g('pause') ? g('pause').textContent : null,
             pressed: g('pause') ? g('pause').getAttribute('aria-pressed') : null,
             speed: g('speed') ? g('speed').textContent : null,
             slowerOff: g('slower') ? g('slower').disabled : null,
             fasterOff: g('faster') ? g('faster').disabled : null };
  },

  camera() {
    const c = Game.state.cam;
    return { fx: c.fx, fy: c.fy, fh: c.fh, ox: c.ox, oy: c.oy, follow: c.follow,
             yaw: c.yaw, yawTarget: c.yawTarget, quarter: ((c.quarter % 4) + 4) % 4,
             pitch: c.pitch, pitchTarget: c.pitchTarget,
             tileH: c.tileH, zoom: c.zoom };
  },
  behind() { return behindDir(Game.state); },

  step(n) { for (let i = 0; i < (n || 1); i++) step(Game.state); return Game.state.tick; },
  frame(n) { for (let i = 0; i < (n || 1); i++) Game.frame(); return Render.consumed; },

  /* What actually reached the buffer last draw. Never read Render.batch. */
  consumed() { return Render.consumed; },
  record(on) { Render.recordItems = !!on; Game.state.viewDirty = true; },

  actors() {
    return Game.state.actors.map(function (a) {
      const at = actorPos(Game.state, a);
      return { index: a.index, name: a.name, x: a.x, y: a.y, attr: a.attr,
               skills: a.skills, worn: Object.assign({}, a.worn),
               steps: a.steps, doing: a.doing, face: a.face,
               fromX: a.fromX, fromY: a.fromY, moveT: a.moveT,
               gx: at.gx, gy: at.gy, gh: at.h,
               stumbles: a.stumbles, pick: Game.state.world.cells.length + a.index };
    });
  },
  /* Put something in one of the twelve slots, or take it out. */
  wear(i, slot, item) {
    const a = Game.state.actors[i];
    if (item) a.worn[slot] = item; else delete a.worn[slot];
    Game.state.geomDirty = true; Game.state.viewDirty = true;
    return Object.assign({}, a.worn);
  },
  strip(i) {
    const a = Game.state.actors[i];
    a.worn = {};
    Game.state.geomDirty = true; Game.state.viewDirty = true;
    return a.worn;
  },
  /* What a crawler can actually do right now, with what they are carrying. */
  ability(i, skill) {
    const a = Game.state.actors[i];
    return { ability: ability(a, skill), base: attributeBase(a, skill),
             bonus: gearBonus(a, skill), tool: toolPenalty(a, skill),
             skill: skillLevel(a, skill) };
  },
  pose(i) {
    const a = Game.state.actors[i];
    const p = poseFor(a, Game.state.tick);
    const bones = buildSkeleton(p);
    const out = {};
    for (const id of BONE_IDS) out[id] = bones[id].p.slice();
    return { bob: p.bob, face: a.face, doing: a.doing, bones: out };
  },
  rolls() { return Game.state.rolls; },

  /* Find a built wall on screen and report BOTH its face in the world and the
     transform the renderer used to lay stonework on it, so a test can say the
     texture is mapped onto the model rather than pasted across the screen. */
  wallFaceMap() {
    const s = Game.state;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s);
    const it = Render.batch.find(function (z) {
      return z.kind === 'cell' && z.solid && z.wallM > 0
          && TILE(z.cell.tile).pattern === 'masonry';
    });
    if (!it) return null;
    Render.draw(s);
    const def = TILE(it.cell.tile);
    const pat = Render.matPattern(litShade(def.side, CFG.shadeLeft, it.light), def.pattern);
    Render.faceFill(pat, it.left[0], it.left[1], it.left[3], 1, it.wallM);
    const px = Math.round(CFG.patternPx);
    /* Where the texture's own corners land once the map is applied. */
    const m = pat._lastMatrix;
    const put = function (tx, ty) {
      return { x: m[0] * tx + m[2] * ty + m[4], y: m[1] * tx + m[3] * ty + m[5] };
    };
    return { tile: it.cell.tile, wallM: it.wallM, masonryPx: px,
             a: { x: it.left[0].x, y: it.left[0].y },
             b: { x: it.left[1].x, y: it.left[1].y },
             d: { x: it.left[3].x, y: it.left[3].y },
             mappedB: put(px, 0), mappedD: put(0, px * it.wallM) };
  },

  /* ---- the figure, measured rather than admired ------------------------- */

  /* Draw ONE crawler alone and count how many pixels of them land on each row
     of the picture. A hole in the body shows up as a row with nothing in it; a
     joint pinched down to a point shows up as a row one pixel wide. Neither is
     visible in a screenshot at 32 pixels to the metre, and both made the figure
     read as a pile of floating chunks. */
  figureRows(index, doing, tick) {
    const s = Game.state, i = index || 0, a = s.actors[i];
    if (!a) return null;
    const wasDoing = a.doing, wasTick = s.tick;
    if (doing) a.doing = doing;
    if (tick !== undefined) s.tick = tick;
    const wasSel = s.selected, wasHover = s.hover, wasOver = s.pointer.over;
    s.selected = -1; s.hover = -1; s.pointer.over = false;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s);
    const want = Render.actorBase(s) + i;
    const keep = Render.batch.filter(function (z) { return z.i === want; });
    if (!keep.length) {
      a.doing = wasDoing; s.tick = wasTick;
      s.selected = wasSel; s.hover = wasHover; s.pointer.over = wasOver;
      return null;
    }
    Render.batch.length = 0;
    for (let k = 0; k < keep.length; k++) Render.batch.push(keep[k]);
    Render.draw(s);
    const px = Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
    const y0 = Math.max(0, Math.floor(keep[0].minY));
    const y1 = Math.min(Render.h - 1, Math.ceil(keep[0].maxY));
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let n = 0;
      for (let x = 0; x < Render.w; x++) {
        const q = (y * Render.w + x) * 4;
        /* the buffer is cleared to #06080b; anything brighter is the crawler */
        if (px[q] > 18 || px[q + 1] > 18 || px[q + 2] > 22) n++;
      }
      rows.push(n);
    }
    a.doing = wasDoing; s.tick = wasTick;
    s.selected = wasSel; s.hover = wasHover; s.pointer.over = wasOver;
    s.geomDirty = true; s.viewDirty = true;
    return { y0: y0, y1: y1, rows: rows, doing: doing || wasDoing };
  },

  /* Where every part of the skeleton actually sits, in metres, so a test can
     argue about whether two parts that are supposed to join actually overlap
     -- authoring them to MEET is authoring them to come apart. */
  figureSpans(index) {
    const s = Game.state, a = s.actors[index || 0];
    if (!a) return null;
    const pose = poseFor(a, s.tick);
    const bones = buildSkeleton(pose);
    const scale = CFG.actorHeight / CFG.figureNominal;
    const out = {};
    const parts = figureParts(a);
    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].part, bone = bones[f.bone];
      if (!bone) continue;
      const m = partMesh(bone, f, scale);
      let lo = Infinity, hi = -Infinity, xl = Infinity, xh = -Infinity;
      for (let v = 0; v < m.verts.length; v++) {
        lo = Math.min(lo, m.verts[v][2]); hi = Math.max(hi, m.verts[v][2]);
        xl = Math.min(xl, m.verts[v][0]); xh = Math.max(xh, m.verts[v][0]);
      }
      out[parts[i].id] = { lo: lo, hi: hi, w: xh - xl };
    }
    return out;
  },

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

  /* Rebuild the grain at a different strength, so a test can compare a
     textured picture against a flat one of the same moment. */
  setTexture(strength) {
    CFG.texStrength = strength;
    Render.makeGrain();
    Game.state.geomDirty = true; Game.state.viewDirty = true;
    return { strength: CFG.texStrength, on: Render.grainOn,
             coarse: Render.grainCoarse.width, fine: Render.grainFine.width };
  },
  /* How many different colours appear along one line across the picture. A flat
     fill gives few; a grained one gives more. */
  colourSpread(y) {
    const px = Render.buf.getContext('2d').getImageData(0, Math.floor(y), Render.w, 1).data;
    const seen = {};
    for (let i = 0; i < px.length; i += 4) {
      seen[px[i] + ',' + px[i + 1] + ',' + px[i + 2]] = 1;
    }
    return Object.keys(seen).length;
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
  describe(i) { return Inspector.describe(Game.state, i); },

  /* What the hover tooltip is showing right now. */
  tooltipOnScreen() {
    const el = document.getElementById('tooltip');
    if (!el || el.hidden) return null;
    return { showing: Inspector.showing, text: el.textContent,
             lines: el.childElementCount };
  },

  /* What the pinned panel is showing, and how big it is. */
  panelOnScreen() {
    const el = document.getElementById('panel');
    if (!el || el.hidden) return null;
    const folds = Array.from(el.querySelectorAll('.fold')).map((f) => ({
      id: f.dataset.section, open: f.getAttribute('aria-expanded') === 'true',
      count: f.querySelector('.fold-count').textContent
    }));
    return {
      pinned: Inspector.pinned, text: el.textContent, folds: folds,
      rows: el.querySelectorAll('.gear').length,
      skills: el.querySelectorAll('.skill').length,
      attrs: el.querySelectorAll('.attr').length,
      tags: Array.from(el.querySelectorAll('.tag')).map((n) => n.textContent),
      height: el.offsetHeight, width: el.offsetWidth
    };
  },
  /* Click a fold open or shut, the way a finger would. */
  clickFold(id) {
    const el = document.querySelector('#panel [data-section="' + id + '"]');
    if (el) el.click();
    return this.panelOnScreen();
  },
  closePanel() {
    const el = document.querySelector('#panel [data-close]');
    if (el) el.click();
    return this.panelOnScreen();
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
      add('the view starts square on and at the normal angle',
          a.cam.quarter === 0 && a.cam.pitch === 0,
          'quarter ' + a.cam.quarter + ', pitch ' + a.cam.pitch);
      add('one metre is exactly render.rise pixels, at any zoom',
          p0.y - pUp.y === CFG.rise, (p0.y - pUp.y) + 'px for 1 m');
      const pRight = Render.project(a, 5, 4, 0);
      add('one tile east is half a tile wide, half a tile down',
          Math.abs(pRight.x - p0.x - CFG.tileW / 2) < 1e-9
          && Math.abs(pRight.y - p0.y - a.cam.tileH / 2) < 1e-9,
          'dx=' + (pRight.x - p0.x) + ' dy=' + (pRight.y - p0.y)
          + ' (tile ' + CFG.tileW + 'x' + a.cam.tileH + ')');
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
          a.cam.ox === Math.round(a.cam.ox) && a.cam.oy === Math.round(a.cam.oy),
          a.cam.ox + ',' + a.cam.oy);

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
