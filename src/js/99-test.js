/* The in-game test harness. Tests drive the game through this and nothing else.
   A broken ruler is worse than no ruler, so it reports its own self-check. */

/* How far a pixel has to move before it counts as a change you would NOTICE,
   as opposed to the hairline shift where two shapes' soft edges overlap. Two
   rectangles that share an edge always disagree in the last pixel of that edge
   by a little; a shape that is actually missing moves whole pixels by a lot. */
const NOTICEABLE = 8;

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
    return lightAt(s, s.world.at(x, y));
  },
  lightSources() { return lightSourcesIn(Game.state); },
  litCells() {
    const s = Game.state;
    let lit = 0, dark = 0;
    for (const cell of s.world.cells) {
      if (lightAt(s, cell) > 0.15) lit++; else dark++;
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
    const w = Game.state.world;
    const start = w.rooms[0];
    const field = reachableFrom(w, start.x + (start.w >> 1), start.y + (start.h >> 1));
    const out = [];
    for (const r of w.rooms) {
      const mid = w.at(r.x + (r.w >> 1), r.y + (r.h >> 1));
      out.push({ room: r.index, elev: r.elev, steps: field.at(mid) });
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

  /* Paint the frame again WITHOUT letting time pass, so a test can paint the
     same picture two ways and compare them pixel for pixel. */
  repaint() { Game.state.viewDirty = true; Game.render(); return Render.consumed; },

  /* Leave out the part of a side wall that stands inside the block in front of
     it. Turning this off is the old way of painting, for proving the two agree.
     Where the wall is cut is worked out while the shapes are built, so this
     has to ask for them to be built again. */
  clipWalls(on) {
    Render.clipWalls = !!on;
    Game.state.geomDirty = true;
    Game.state.viewDirty = true;
    return Render.clipWalls;
  },

  /* Paint a crawler part way through a step after the whole of the ground that
     step covers, so the ground can never paint over their legs. Turning this
     off is the old way of painting a walking crawler -- ordering them by where
     their feet are and nothing else -- which is how the ground came to paint
     over their legs in the first place. Called with nothing it only reports
     which way it is set, so a test can say which way the game ships. Where a
     crawler lands in the painting order is worked out while the shapes are
     built, so changing it has to ask for them to be built again. */
  stepGround(on) {
    if (on !== undefined) {
      Render.stepGround = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.stepGround;
  },

  /* Lay each material ON the ground it lies on, the way the game ships.
     Turning this OFF is the old way of painting, for proving the new way
     against it: the picture it makes is the one with the floor's material
     facing the camera rather than lying in the floor. Called with nothing it
     only reports which way it is set, so a test can say which way the game
     ships. */
  mappedGround(on) {
    if (on !== undefined) {
      Render.mappedGround = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.mappedGround;
  },

  /* Keep the picture as it is now. diff() then reports how the next one differs
     from it -- how many pixels, how far the worst of them moved, and the first
     one that moved, so a failure points at the spot. The pixels never leave
     this file. */
  keep() {
    const px = Render.bctx.getImageData(0, 0, Render.w, Render.h);
    this._kept = { w: px.width, h: px.height, data: px.data };
    return { w: px.width, h: px.height };
  },
  diff() {
    const k = this._kept;
    if (!k) return { error: 'nothing was kept' };
    const now = Render.bctx.getImageData(0, 0, Render.w, Render.h);
    if (now.width !== k.w || now.height !== k.h) {
      return { w: k.w, h: k.h, resized: true, was: now.width + 'x' + now.height };
    }
    const a = k.data, c = now.data;
    let n = 0, worst = 0, deep = 0, fx = -1, fy = -1;
    /* The alpha channel is not compared: the picture is opaque, so what the
       player can see is the three colour channels. */
    for (let i = 0; i < a.length; i += 4) {
      const d0 = a[i] - c[i], d1 = a[i + 1] - c[i + 1], d2 = a[i + 2] - c[i + 2];
      if (d0 || d1 || d2) {
        n++;
        if (fx < 0) { const p = i >> 2; fx = p % k.w; fy = (p / k.w) | 0; }
        const d = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
        if (d > NOTICEABLE) deep++;
        if (d > worst) worst = d;
      }
    }
    return { w: k.w, h: k.h, pixels: k.w * k.h, differ: n, deep: deep,
             worst: worst, x: fx, y: fy };
  },

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

  /* Find a square of GROUND on screen and report where it is in the world, the
     transform the renderer used to lay its material on it, and where the
     material's own corners landed -- so a test can say the material lies on the
     ground rather than facing the camera.

     `find` narrows which square is measured, by any of:
       footing  'walk' for a floor, 'ramp' for a ramp
       slope    SLOPE_FLAT for a square that is level, or 'x-' and the like
       x, y     one named square of the world, to follow it through a turn
     Called with nothing it takes the first square of ground it finds that
     carries a material. A ramp is worth asking for by name: it is the one
     square whose corners are not all at one height, so it is mapped from its
     own corners rather than from the shared ground plane, and it is the one
     that can go wrong on its own.

     Both ways of painting are covered. `onGround` says which one happened:
     true when the material was placed in the ground's own plane -- the record
     only the mapped path writes -- and false when it was pasted flat across the
     screen. Reported rather than assumed, because a reading that quietly goes
     missing is how a bug hides.

     A material can be both a wall's face and a square of ground in the same
     frame, which is why the ground's record is kept apart from a face's. */
  groundFaceMap(find) {
    const want = find || {};
    const s = Game.state;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s);
    const it = Render.batch.find(function (z) {
      if (z.kind !== 'cell') return false;
      const def = TILE(z.cell.tile);
      if (!def.pattern) return false;
      if (want.footing !== undefined && def.footing !== want.footing) return false;
      if (want.slope !== undefined && z.cell.slope !== want.slope) return false;
      if (want.x !== undefined && (z.cell.x !== want.x || z.cell.y !== want.y)) return false;
      return true;
    });
    if (!it) return null;
    Render.draw(s);
    const def = TILE(it.cell.tile);
    const lift = Math.round((1 + it.cell.h * CFG.heightTint) * 100) / 100;
    const colour = litShade(def.top, lift, it.light);
    const pat = Render.matPattern(colour, def.pattern, it.cell.h);
    /* Clear what the material remembers and ask for the fill the draw asked
       for, so what is read back below is this call's placement and not an
       earlier frame's. Clearing `_laid` also defeats the once-a-frame shortcut
       inside the renderer, so the real laying is measured. */
    pat._lastLaid = null; pat._lastMatrix = null; pat._laid = ''; pat._pinned = '';
    Render.ground(colour, def.pattern, it, s, 'w' + s.cam.ox + ',' + s.cam.oy);
    const px = Math.round(CFG.patternPx);
    const m = pat._lastLaid || pat._lastMatrix;
    if (!m) return null;
    const at = function (tx, ty) {
      return { x: m[0] * tx + m[2] * ty + m[4], y: m[1] * tx + m[3] * ty + m[5] };
    };
    const a = { x: it.top[0].x, y: it.top[0].y };
    const b = { x: it.top[1].x, y: it.top[1].y };
    const d = { x: it.top[3].x, y: it.top[3].y };
    const sub = (p, q) => ({ x: p.x - q.x, y: p.y - q.y });
    return { tile: it.cell.tile, slope: it.cell.slope, h: it.cell.h,
             x: it.cell.x, y: it.cell.y,
             mapped: Render.mappedGround, patternPx: px,
             a: a, b: b, d: d,
             /* true when the material was placed in the ground's own plane --
                the record only the mapped ground path writes -- and false when
                it was pasted flat across the screen. */
             onGround: !!pat._lastLaid,
             /* Where the material's own corners land. Read as a pair these are
                the whole answer: the gap between them is how far one metre of
                material really went, and which way. On the ground that way is
                one of the square's own two edges. */
             mappedB: at(px, 0), mappedD: at(0, px),
             wentB: sub(at(px, 0), at(0, 0)), wentD: sub(at(0, px), at(0, 0)),
             isB: sub(b, a), isD: sub(d, a) };
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
    const s = Game.state;
    Render.recordItems = true;
    s.geomDirty = true; s.viewDirty = true;
    Game.frame();
    /* A crawler's pick number sits after every square of ground, and the ground
       is now laid down as the view travels -- so the frame above may have made
       more of it. The number has to be worked out AFTER that frame, and again
       after every repaint below, or the search hunts for a number the paint
       pass never used. */
    const want = Render.actorBase(s) + i;
    const item = Render.consumed.items.find(function (q) { return q.i === want; });
    if (!item) return { found: false, why: 'not drawn' };
    for (let dy = 0; dy <= 24; dy += 2) {
      for (const dx of [0, -2, 2, -4, 4]) {
        this.point(item.sx + dx, item.sy + dy);
        if (s.hover === Render.actorBase(s) + i) {
          return { found: true, pick: s.hover, sx: item.sx + dx, sy: item.sy + dy,
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

  /* ---- walking, and what the picture shows of a crawler ------------------ */

  /* Stand a crawler part way through one step, and put the camera on them.
     "from" is the square the step starts on and "to" the square it arrives at;
     "t" is how far along it is -- 0 standing on the starting square, 1 standing
     on the arriving one, 0.85 nearly there. Both ends must be named, because
     what is under the feet is ground at one end and ground at the other, and
     telling those apart is the whole question. Returns legal:false rather than
     freezing an illegal step, so no test can measure a step the game would
     refuse to take. The camera is pinned by hand: it does not ride anything
     until the next seed() or centreOn(). */
  midStep(index, fromX, fromY, toX, toY, t) {
    const s = Game.state, a = s.actors[index];
    if (!a) return { legal: false, why: 'no such crawler' };
    const here = s.world.at(fromX, fromY), there = s.world.at(toX, toY);
    if (!here || !there) return { legal: false, why: 'off the map' };
    const dx = toX - fromX, dy = toY - fromY;
    if ((dx || dy) && !canStep(here, there, dx, dy)) {
      return { legal: false, why: 'cannot step there' };
    }
    a.fromX = fromX; a.fromY = fromY;
    a.x = toX; a.y = toY;
    a.moveT = t === undefined ? 0.85 : t;
    a.cooldown = 1e6;                 /* the clock must not walk them on */
    if (dx || dy) a.face = a.faceTarget = facingFor(dx, dy);
    const at = actorPos(s, a);
    const cam = s.cam;
    cam.follow = -1;
    cam.fx = at.gx; cam.fy = at.gy; cam.fh = at.h;
    camRefresh(s);
    s.selected = -1; s.hover = -1; s.pointer.over = false;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s);
    Render.draw(s);
    return { legal: true, index: index, fromX: fromX, fromY: fromY,
             toX: toX, toY: toY, t: a.moveT, gx: at.gx, gy: at.gy, gh: at.h,
             face: a.face };
  },

  /* How much of a crawler the picture actually shows, and where it stops
     showing them. Four pictures of one instant, all from the same camera:
       alone   -- the crawler with everything else left out, which is their shape
       blank   -- nothing at all, so the shape can be told from the background
       scene   -- the world as it is, with the crawler in it
       without -- the same world with that one crawler left out
     and the world in both of those leaves out the OTHER crawlers: another
     creature standing in the way genuinely hides part of this one, and it
     moves as this one moves, so leaving it in would measure the crowd instead
     of the ground. What is left to hide a crawler is the world it walks
     through: ground, rock, and anything built on it.
     A pixel of the shape is still theirs when the scene differs from the scene
     without them, and is hidden when the two are identical -- something was
     painted over them there. Hidden is what the ground a crawler is walking on
     does to their feet, and also what a rock genuinely standing in front of
     them does to the rest of them. Measuring one moment of a stride against
     another is what tells those two apart, so this reports the number and
     leaves that argument to a test.
     The picture is rebuilt and repainted before returning. */
  actorOwnPixels(index) {
    const s = Game.state, i = index || 0, a = s.actors[i];
    if (!a) return null;
    const wasSel = s.selected, wasHover = s.hover, wasOver = s.pointer.over;
    s.selected = -1; s.hover = -1; s.pointer.over = false;
    s.geomDirty = true;
    Render.build(s);
    const want = Render.actorBase(s) + i;
    const item = Render.batch.find(function (z) { return z.i === want; });
    const all = Render.batch.slice();
    const paint = function (what) {
      Render.batch.length = 0;
      for (let k = 0; k < all.length; k++) {
        const z = all[k];
        if (Render.isActorPick(s, z.i) && z !== item) continue;
        if (what === 'alone' && z !== item) continue;
        if (what === 'without' && z === item) continue;
        if (what === 'blank') continue;
        Render.batch.push(z);
      }
      Render.draw(s);
      return Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
    };
    if (!item) {
      Render.batch.length = 0;
      for (let k = 0; k < all.length; k++) Render.batch.push(all[k]);
      s.selected = wasSel; s.hover = wasHover; s.pointer.over = wasOver;
      s.geomDirty = true; s.viewDirty = true;
      return null;
    }
    const alone = paint('alone');
    const blank = paint('blank');
    const scene = paint('scene');
    const without = paint('without');
    const x0 = Math.max(0, Math.floor(item.minX)), x1 = Math.min(Render.w - 1, Math.ceil(item.maxX));
    const y0 = Math.max(0, Math.floor(item.minY)), y1 = Math.min(Render.h - 1, Math.ceil(item.maxY));
    const w = Render.w;
    const out = { index: i, name: a.name, shape: 0, hidden: 0,
                  top: -1, bottom: -1, bottomShown: -1 };
    const rows = [];
    for (let y = y0; y <= y1; y++) {
      let mine = 0, shown = 0;
      for (let x = x0; x <= x1; x++) {
        const q = (y * w + x) * 4;
        if (alone[q] === blank[q] && alone[q + 1] === blank[q + 1]
            && alone[q + 2] === blank[q + 2]) continue;
        mine++;
        if (scene[q] === without[q] && scene[q + 1] === without[q + 1]
            && scene[q + 2] === without[q + 2]) out.hidden++;
        else shown++;
      }
      rows.push({ y: y, mine: mine, shown: shown });
      if (mine) { if (out.top < 0) out.top = y; out.bottom = y; }
      if (shown) out.bottomShown = y;
    }
    out.rows = rows;
    out.shape = rows.reduce(function (n, r) { return n + r.mine; }, 0);
    out.shown = out.shape - out.hidden;
    out.gap = out.bottomShown < 0 ? null : Math.round(item.maxY) - out.bottomShown;
    out.box = { x0: item.minX, y0: item.minY, x1: item.maxX, y1: item.maxY };
    out.pixels = Render.w * Render.h;
    Render.batch.length = 0;
    for (let k = 0; k < all.length; k++) Render.batch.push(all[k]);
    s.selected = wasSel; s.hover = wasHover; s.pointer.over = wasOver;
    s.geomDirty = true; s.viewDirty = true;
    return out;
  },

  /* Rebuild the materials at a different strength, so a test can compare a
     textured picture against a flat one of the same moment. */
  setTexture(strength) {
    CFG.texStrength = strength;
    Render.patCache = {};
    Game.state.geomDirty = true; Game.state.viewDirty = true;
    return { strength: CFG.texStrength, on: CFG.texStrength > 0,
             materials: Object.keys(Render.mats || {}).length };
  },
  /* Draw one frame and count what KIND of fill each face got: a plain colour,
     or a repeating pattern. Patterns are the expensive kind, and since the grit
     was taken off crawlers and camp pieces only the ground should still use
     them -- so this is how a test proves the grit is really gone rather than
     merely faint. */
  fillKinds() {
    const s = Game.state, ctx = Render.bctx;
    const real = ctx.fill.bind(ctx);
    let plain = 0, pattern = 0;
    ctx.fill = function () {
      if (typeof this.fillStyle === 'object') pattern++; else plain++;
      return real();
    };
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s); Render.draw(s);
    ctx.fill = real;
    return { plain: plain, pattern: pattern, drawn: Render.consumed.count,
             cells: Render.consumed.count - Render.consumed.people
                    - Render.consumed.structures };
  },

  /* How many different colours appear along one line across the picture. A flat
     fill gives few; a textured one gives more. */
  colourSpread(y) {
    const px = Render.buf.getContext('2d').getImageData(0, Math.floor(y), Render.w, 1).data;
    const seen = {};
    for (let i = 0; i < px.length; i += 4) {
      seen[px[i] + ',' + px[i + 1] + ',' + px[i + 2]] = 1;
    }
    return Object.keys(seen).length;
  },

  /* Draw the same moment again, without advancing it. A test comparing two
     pictures of one instant must not have time pass in between. Only the
     picture is repainted: the pick buffer is no longer read by the game, so
     painting it here would be work no test asked for. */
  redraw() {
    const s = Game.state;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s); Render.draw(s);
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
    return { seed: w.seed, n: w.n, cells: w.cells.length, pieces: w.live.length };
  },
  /* Make the ground at a world square by hand: what walking there does, only
     without the walking. Tests use it to ask for the same ground in a
     different ORDER and check it comes out the same, which is the promise the
     whole endless labyrinth rests on. */
  ensure(x, y) {
    const cell = Game.state.world.ensure(x, y);
    Game.state.geomDirty = true;
    Game.render();
    return cell ? { x: cell.x, y: cell.y, h: cell.h, tile: cell.tile } : null;
  },
  /* One live piece described in a fixed order, as a single string, so two
     matches can be compared character for character. */
  pieceSignature(cx, cy) {
    const p = pieceAt(Game.state.world, cx, cy);
    if (!p) return null;
    let out = '';
    for (const c of p.cells) out += c.h + c.tile + c.slope + ';';
    return out;
  },
  /* How many pieces of ground are wanted right now, and how many of those are
     live. The window's books, so a test can watch what it is holding. */
  windowBooks() {
    const s = Game.state;
    const want = wantedPieces(s, screenReach(Render.w, Render.h), CFG.liveRing);
    return { wanted: want.length, live: s.world.live.length,
             urgent: want.filter(function (p) { return p.urgent; }).length,
             reach: screenReach(Render.w, Render.h), ring: CFG.liveRing,
             perFrame: CFG.chunksPerFrame };
  },
  cell(x, y) {
    const w = Game.state.world, c = w.at(x, y);
    return c ? { x: c.x, y: c.y, h: c.h, tile: c.tile, slope: c.slope,
                 footing: TILE(c.tile).footing, index: w.cells.indexOf(c) } : null;
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
        const mid = a.world.at(r.x + (r.w >> 1), r.y + (r.h >> 1));
        if (field.at(mid) < 0) unreached++;
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
          if (a.camp.sites[0].field.at(a.world.at(act.x, act.y)) < 0) cannotReach++;
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
