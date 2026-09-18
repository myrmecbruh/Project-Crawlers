/* The in-game test harness. Tests drive the game through this and nothing else.
   A broken ruler is worse than no ruler, so it reports its own self-check. */

/* How far a pixel has to move before it counts as a change you would NOTICE,
   as opposed to the hairline shift where two shapes' soft edges overlap. Two
   rectangles that share an edge always disagree in the last pixel of that edge
   by a little; a shape that is actually missing moves whole pixels by a lot. */
const NOTICEABLE = 8;

/* Every colour in a picture or a canvas, as a sorted list of "r,g,b" -- the
   whole palette of a thing rather than a sample of it, so "these colours are
   what this tile is made of" can be asserted instead of hoped at. */
function coloursIn(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const set = new Set();
  for (let i = 0; i < px.length; i += 4) {
    set.add(px[i] + ',' + px[i + 1] + ',' + px[i + 2]);
  }
  return Array.from(set).sort();
}

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

  /* The world the way a crawler meets it: fetched, and with a while of digging
     behind it. `frame()` gets there too, but it PAINTS every one of those frames
     and the painting is the whole cost -- 2,000 frames take about 40 seconds
     that way and about a tenth of a second this way, and the two come out pixel
     for pixel identical (`files/probe-settlefast.txt`). So the game is stepped
     forward without drawing, and then the ground that has come into range is
     fetched in a few fat passes instead of two pieces at a time. */
  advance(n, passes) {
    for (let i = 0; i < (n || 1); i++) step(Game.state);
    const was = CFG.chunksPerFrame;
    CFG.chunksPerFrame = 200;
    for (let i = 0; i < (passes || 4); i++) {
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
      Game.render();
    }
    CFG.chunksPerFrame = was;
    return Game.state.tick;
  },

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

  /* Paint the LID of a solid block, the way the game used to: a stone surface --
     material and all -- laid across the top of the rock. It is NOT what the game
     ships. A wall has NO top at all now -- what fills the space a lid would have
     occupied is the wall's own sides reaching up into it -- and turning this on
     is the picture as it was before v0.36.0, the yardstick the new look is proved
     against. Called with nothing it only reports which way it is set, so a test
     can say which way the game ships. */
  wallCaps(on) {
    if (on !== undefined) {
      Render.wallCaps = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.wallCaps;
  },

  /* Paint the rock where a wall's cap used to be: flat, untextured, lit like the
     wall's own faces -- a slab laid over the top of every wall, which is v0.41.0's
     picture (`wallBody: true`), NOT the look the game ships. It is the negative
     control the shipped look is proved against inside one build: with a slab
     across the top, no gap can exist between the face and the rock above it by
     construction, so the difference between the two arms is exactly the cost of
     having no lid. Called with nothing it only reports which way it is set. */
  wallBody(on) {
    if (on !== undefined) {
      Render.wallBody = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.wallBody;
  },

  /* Leave out of the picture the rock that has rock on every side of it -- the
     way the game ships (v0.47.0): only the rock that touches open space is
     drawn, and everything buried behind it is black. Every wall is one tile
     thick. Turning this OFF is the picture as it was before, with the whole
     body of the hill drawn -- the arm the new look is proved against inside ONE
     build (lesson 21), and the arm the suite's drop-count is checked against.
     Called with nothing it only reports which way it is set. Which squares are
     in the batch is decided while the shapes are built, so changing it has to
     ask for them to be built again. */
  wallSkin(on) {
    if (on !== undefined) {
      Render.wallSkin = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.wallSkin;
  },

  /* SHOW A SIDE OF A WALL ONLY WHERE WALKABLE GROUND IS IN FRONT OF IT. `2`, the
     way the game ships (v0.48.0), is the rule entire: a side whose square in
     front is buried rock is not painted at all, so a wall seen from its rock side
     is see-through into whatever is behind it. `1` cuts that side down to the
     strip standing above the rock in front instead of deleting it. `0` is
     v0.47.0, where buried rock counted as nothing in front of a face and the
     whole stored side -- eight metres -- was painted: the arm this is proved
     against inside ONE build (lesson 21), and the arm the suite's counters are
     compared with. Called with nothing it only reports which way it is set.
     Which faces are painted is decided while the shapes are built, so changing it
     has to ask for them to be built again. */
  rockSides(n) {
    if (n !== undefined) {
      Render.rockSides = n | 0;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.rockSides;
  },

  /* The strips of rock a block shows along its far edges, where the block behind
     it is too low to cover it. ON (`backBands: true`), and they are painted only
     where rock is drawn SHORT -- which is only while `cut_solid` is 0, so at the
     shipped setting this flag paints nothing at all. Turning it off is the other
     arm of the proof that nothing is opened by leaving them out. Called with
     nothing it only reports which way it is set. The strips are built with the
     shapes, so changing it rebuilds them. */
  backBands(on) {
    if (on !== undefined) {
      Render.backBands = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.backBands;
  },

  /* Paint those strips EVEN WHERE NOTHING IS DRAWN SHORT -- the picture v0.44.0
     shipped, and NOT what the game ships now. It is the A/B the cull is proved
     against inside one build (lesson 23): with the strips painted there, the
     census of bare backdrop is identical to the census with them left out, to
     the last pixel, so the paint was provably being wasted. Also the arm that
     makes the other number honest -- with this on, switching `backBands` off
     really does change the picture, so a suite that saw no difference would be
     measuring a build that ignores the gate. Called with nothing it only reports
     which way it is set. */
  backBandsSolid(on) {
    if (on !== undefined) {
      Render.backBandsSolid = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.backBandsSolid;
  },

  /* Fade away the top `metres` of every wall face, the way the game ships -- 1
     metre by default, read from the sheet. 0 leaves a wall solid to its top,
     which is the picture as it was before, for proving the new look against it.
     Called with nothing it only reports which way it is set. Nothing to rebuild:
     the band is painted, not built. */
  wallFade(metres) {
    if (metres !== undefined) {
      CFG.wallFadeM = Number(metres);
      Game.state.viewDirty = true;
    }
    return CFG.wallFadeM;
  },

  /* Snap every wall face's foot to a whole metre -- the blocks line up, the way
     the game ships. False is the picture as it was before, cut at whatever
     height the arithmetic gave, which is the arm the new look is proved against
     inside one build. Called with nothing it only reports which way it is set.
     The cut is worked out while the shapes are built, so changing it has to ask
     for them to be built again. */
  voxelBlocks(on) {
    if (on !== undefined) {
      Render.voxelBlocks = !!on;
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.voxelBlocks;
  },

  /* How much of a block hidden behind the wall in front stays standing, the way
     the game ships -- 1 metre by default, read from the sheet. 0 deletes the
     whole square, which leaves the nothing at the bottom of a hidden column that
     v0.37.0 shipped, and is the negative control the foot of rock is proved
     against in one build. Called with nothing it only reports the height.
     Changing it changes how tall a block is DRAWN, so the shapes are built
     again. */
  cutStump(metres) {
    if (metres !== undefined) {
      CFG.cutStumpM = Number(metres);
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return CFG.cutStumpM;
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

  /* A square of ground may only skip its own placement while the pattern still
     carries that floor's plane, the way the game ships. Turning this OFF is the
     old rule -- skip and hope -- which is what let a ramp's sloped transform be
     worn by every floor square laid after it at the same height. Called with
     nothing it only reports which way it is set. See groundFill(). */
  ownPlane(on) {
    if (on !== undefined) {
      Render.ownPlane = !!on;
      Game.state.viewDirty = true;
    }
    return Render.ownPlane;
  },

  /* Hand a selected block's halo the STORED side -- the quad running down to the
     floor of the world -- instead of the side as far as the clip leaves it. This
     is the rule the selection test was fixed FROM and it is that test's own
     control: with it on, the ring runs away past the shapes that were painted in
     37 of its 50 selections, by as much as 220px, where the shipped rule escapes
     in none. See shapeOf(). */
  ringStored(on) {
    if (on !== undefined) {
      Render.ringStored = !!on;
      Game.state.viewDirty = true;
    }
    return Render.ringStored;
  },

  /* ---- the ramps, and the proof that repairing them costs nothing --------
     A ramp is a promise that the square it leans toward is one metre up. It can
     fail that promise in two ways, and only one of them is a defect:

       leaning at SOLID ROCK  -- a slope fetching up against a face. THEY ASKED
                                 FOR THIS ("happens in caves and rubble all the
                                 time", v0.33.2) and it is left alone.
       leaning at OPEN GROUND -- a drop, a ledge, another ramp at the same
         not a metre up         height. A WEDGE: nothing explains the refusal
                                 and the map will not let you off the top of it.
                                 The generator repairs these at the end of every
                                 piece (repairSlopes()).

     This counts every ramp and every step a crawler can really take with the
     repair OFF and then ON in one build. The sweep throws no dice, so those are
     the same world twice and the difference between them is exactly the repair.
     The world it was given back is the one it hands back.

     A seed REPLACES the world, so the state is read after seeding (lesson 27),
     and the battery reports how much work it did: cases, worlds, pieces. */
  slopeRepair(on) {
    if (on !== undefined) SLOPES_REPAIRED = !!on;
    return SLOPES_REPAIRED;
  },

  slopeAudit(seeds) {
    const list = (seeds && seeds.length) ? seeds : [1, 2, 3, 7];
    const n = CFG.chunkTiles;
    const keep = Game.state, wasCut = SLOPES_REPAIRED;
    const out = { cases: list.length, worlds: 0, pieces: 0,
                  rampsOld: 0, rampsNew: 0, wedgesOld: 0, wedgesNew: 0,
                  atRockOld: 0, atRockNew: 0,
                  aimed: 0, flatted: 0, rock: 0, left: 0,
                  stepsOld: 0, stepsNew: 0, lost: 0, gained: 0, notJudged: 0,
                  causes: {}, worst: [] };
    const look = function (where) {
      const w = Game.state.world;
      const steps = new Set();
      const bad = {};
      let pieces = 0, ramps = 0, wedges = 0, rock = 0;
      for (const piece of w.live) {
        pieces++;
        for (const c of piece.cells) {
          for (const s of STEPS) {
            const nb = w.at(c.x + s[0], c.y + s[1]);
            if (!nb || !canStep(c, nb, s[0], s[1])) continue;
            steps.add(c.x + ',' + c.y + ',' + s[0] + ',' + s[1]);
          }
          if (!c.slope || TILE(c.tile).footing === 'block') continue;
          ramps++;
          const d = slopeDir(c.slope);
          const nb = w.at(c.x + d[0], c.y + d[1]);
          if (!nb) { out.notJudged++; continue; }
          if (TILE(nb.tile).footing === 'block') { rock++; continue; }
          if (canStep(c, nb, d[0], d[1])) continue;
          wedges++;
          const cause = nb.h < c.h + 1
            ? 'the ground drops (' + TILE(nb.tile).name + ' at ' + nb.h + ')'
            : 'a step of ' + (nb.h - c.h) + ' m into open ' + TILE(nb.tile).name;
          bad[cause] = (bad[cause] || 0) + 1;
          if (where === 'old' && out.worst.length < 8) {
            out.worst.push({ seed: w.seed, x: c.x, y: c.y, h: c.h, room: c.room,
                             slope: c.slope, into: TILE(nb.tile).name,
                             intoH: nb.h, cause: cause });
          }
        }
      }
      return { pieces: pieces, ramps: ramps, wedges: wedges, rock: rock,
               steps: steps, bad: bad };
    };
    const run = function (sd, cut, where) {
      SLOPES_REPAIRED = cut;
      Game.state = newState(sd >>> 0);
      const w = Game.state.world;
      for (let cx = -1; cx <= 1; cx++) {
        for (let cy = -1; cy <= 1; cy++) w.ensure(cx * n + (n >> 1), cy * n + (n >> 1));
      }
      out.worlds++;
      const r = look(where);
      if (cut) {
        for (const piece of w.live) {
          const f = piece.slopeFix;
          if (!f) continue;
          out.aimed += f.aimed; out.flatted += f.flatted;
          out.left += f.left; out.rock += f.rock;
        }
      }
      return r;
    };
    const diff = function (a, b, lostKey, gainedKey) {
      a.steps.forEach(function (k) { if (!b.steps.has(k)) out[lostKey]++; });
      b.steps.forEach(function (k) { if (!a.steps.has(k)) out[gainedKey]++; });
    };
    for (const sd of list) {
      const old = run(sd, false, 'old');
      const fixed = run(sd, true, null);
      out.pieces += old.pieces;
      out.rampsOld += old.ramps; out.rampsNew += fixed.ramps;
      out.wedgesOld += old.wedges; out.wedgesNew += fixed.wedges;
      out.atRockOld += old.rock; out.atRockNew += fixed.rock;
      out.stepsOld += old.steps.size; out.stepsNew += fixed.steps.size;
      for (const k in old.bad) out.causes[k] = (out.causes[k] || 0) + old.bad[k];
      diff(old, fixed, 'lost', 'gained');
    }
    SLOPES_REPAIRED = wasCut;
    Game.state = keep;
    return out;
  },

  /* Bring the rock down to suit the ground it stands in, or leave it at the
     plateau, the way the game used to. Called with nothing it only reports
     which way it is set, so a test can say which way the game ships. */
  rockTops(on) {
    if (on !== undefined) ROCK_LOWERED = !!on;
    return ROCK_LOWERED;
  },

  /* Does bringing the rock down leave the world a crawler can USE untouched?

     Rock is not a square anybody stands on, so the promise this makes is easy
     to state and worth counting exactly: every square that is not a block comes
     out at the same height, wearing the same tile, in the same room, leaning the
     same way. Nothing walkable moves by a millimetre -- the promise the doorways
     and the ramps are held to as well -- and only the rock around them changes.

     Run both ways IN ONE BUILD (lesson 21): the generator throws no dice that
     this can disturb, so the two runs are the same world and the difference
     between them is exactly the rock. The battery prints how much work it did
     (worlds, pieces, squares) because a probe that cannot say it did nothing
     will report nothing, loudly (lesson 27). */
  rockAudit(seeds) {
    const list = (seeds && seeds.length) ? seeds : [1, 2, 3, 7];
    const n = CFG.chunkTiles;
    const keep = Game.state, wasLow = ROCK_LOWERED;
    const out = { cases: list.length, worlds: 0, pieces: 0, ground: 0,
                  moved: 0, retiled: 0, rerolled: 0, reproomed: 0,
                  rockOld: 0, rockNew: 0, tallestOld: 0, tallestNew: 0,
                  lowered: 0, raised: 0, topOld: {}, topNew: {}, worst: [] };
    const run = function (sd, low) {
      ROCK_LOWERED = low;
      Game.state = newState(sd >>> 0);
      const w = Game.state.world;
      for (let cx = -1; cx <= 1; cx++) {
        for (let cy = -1; cy <= 1; cy++) w.ensure(cx * n + (n >> 1), cy * n + (n >> 1));
      }
      out.worlds++;
      const ground = new Map();
      let pieces = 0, rock = 0, tallest = 0;
      for (const piece of w.live) {
        pieces++;
        const f = piece.rockFix;
        if (f) { out.lowered += f.lowered; out.raised += f.raised; }
        for (const c of piece.cells) {
          if (TILE(c.tile).footing === 'block') {
            rock++;
            const top = low ? out.topNew : out.topOld;
            top[c.h] = (top[c.h] || 0) + 1;
            if (c.h > tallest) tallest = c.h;
            continue;
          }
          ground.set(c.x + ',' + c.y,
                     { h: c.h, tile: c.tile, room: c.room, slope: c.slope });
        }
      }
      return { ground: ground, pieces: pieces, rock: rock, tallest: tallest };
    };
    for (const sd of list) {
      const old = run(sd, false);
      const now = run(sd, true);
      out.pieces += old.pieces;
      out.ground += old.ground.size;
      out.rockOld += old.rock; out.rockNew += now.rock;
      if (old.tallest > out.tallestOld) out.tallestOld = old.tallest;
      if (now.tallest > out.tallestNew) out.tallestNew = now.tallest;
      old.ground.forEach(function (a, k) {
        const b = now.ground.get(k);
        if (!b) { out.moved++; return; }
        if (b.h !== a.h) {
          out.moved++;
          if (out.worst.length < 8) {
            out.worst.push({ seed: sd, at: k, was: a.h, now: b.h });
          }
        }
        if (b.tile !== a.tile) out.retiled++;
        if (b.room !== a.room) out.reproomed++;
        if (b.slope !== a.slope) out.rerolled++;
      });
      now.ground.forEach(function (b, k) { if (!old.ground.has(k)) out.moved++; });
    }
    ROCK_LOWERED = wasLow;
    Game.state = keep;
    return out;
  },

  /* Lay each material on the SIDES of a block too, the way the game ships.
     Turning this OFF is the old way of painting, in which only masonry -- the
     facing on a worked room -- had anything on its sides and every other wall
     in the labyrinth was flat colour. Kept as the yardstick the new way is
     proved against. Called with nothing it only reports which way it is set, so
     a test can say which way the game ships. */
  mappedWalls(on) {
    if (on !== undefined) {
      Render.mappedWalls = !!on;
      Game.state.viewDirty = true;
    }
    return Render.mappedWalls;
  },

  /* Compose each material from the pictures somebody dropped into
     textures/<material>/ rather than generating it, which is the way the game
     ships when there are any. Turning it OFF is how every surface in the game
     looked before there were pictures -- so the same moment can be painted both
     ways and counted, which is the only thing that tells a picture that reached
     the screen from a picture that was loaded and then ignored. */
  pictures(on) {
    if (on !== undefined) {
      Render.pictures = !!on;
      Render.forgetMaterials();
      Game.state.geomDirty = true;
      Game.state.viewDirty = true;
    }
    return Render.pictures;
  },

  /* Have the pictures dropped into textures/ finished decoding? The suite waits
     on this before it trusts a picture, because an image arrives when it
     arrives and a test that reads one early reads a game with no pictures in it
     -- and passes. */
  texturesReady() {
    return { ready: Textures.ready, done: Textures.done, wants: Textures.wants };
  },

  /* What was dropped into textures/ and what became of it: how many pictures
     each material has, how many decoded, and -- for one material named -- the
     colours in the tile the renderer makes out of each of them against the
     colours in the picture itself. A picture that never reached the game and a
     picture that reached it and was thrown away look the same on screen; this is
     how a test tells them apart.

     For a named material it also hands back the SCATTER: which picture each
     square of a patch of ground picks. That is the half of "use them randomly"
     that no single tile can show -- one picture per metre, chosen from where the
     square is -- so the count of each, how often a square picks the same picture
     as the one next to it, and how many whole rows and columns came out all one
     picture. Those four numbers are what tells a scatter from a lattice, and
     from a picker that has stopped picking. */
  textures(name) {
    const out = { ready: Textures.ready, on: !!Render.pictures,
                  done: Textures.done, wants: Textures.wants,
                  files: {}, decoded: {} };
    /* Every material the game has, whether or not anybody has dropped a picture
       into its folder -- a list built from the tiles that wear them, so a
       material nobody has drawn yet reports 0 rather than being absent, which
       would read the same as a name nothing ever asked about. */
    const known = new Set(Object.keys(Textures.files));
    for (const k of Object.keys(DATA.tiles)) {
      if (DATA.tiles[k].pattern) known.add(DATA.tiles[k].pattern);
    }
    /* And a material the renderer has generated a tile for at all, which is the
       one honest answer to "does this name exist". */
    for (const k of Object.keys(Render.mats || {})) known.add(k);
    for (const k of known) {
      out.files[k] = (Textures.files[k] || []).length;
      out.decoded[k] = (Textures.imgs[k] || []).filter(Boolean).length;
    }
    out.materials = Object.keys(out.files).filter((k) => out.files[k]);
    if (name) {
      const raw = Render.matPictures(name);
      out.tiles = raw.map((c) => c.width + 'x' + c.height);
      out.tilesColours = raw.map((c) => coloursIn(c));
      out.sources = (Textures.imgs[name] || []).filter(Boolean)
        .map((img) => ({ w: img.width, h: img.height, colours: coloursIn(img) }));
      out.scatter = window.__test.scatter(name, 24, 24);
    }
    return out;
  },

  /* Which picture a patch of ground picks, walked square by square as the ground
     is: `w` by `h` squares from the origin, at one height, row by row. Pure --
     it reads the picker and nothing else -- so it can be asked about ground no
     match has ever stood on.

     It hands back the picks themselves rather than a summary of them, because
     what a scatter has to be told apart from is a LATTICE, and telling those two
     apart takes fitting one: a lattice repeats at a fixed step, so squares that
     far apart agree every time. The test does that arithmetic; this only reports
     what the renderer would wear where. See Render.pickIndex. */
  scatter(name, w, h, salt) {
    const n = Render.matPictures(name).length;
    const saltAt = salt === undefined ? PICK_GROUND : salt;
    const picks = new Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        picks[y * w + x] = n ? Render.pickFor(name, x, y, saltAt) % n : 0;
      }
    }
    return { n: n, w: w, h: h, picks: picks };
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
  /* Where the bones are, optionally posed as something else. A WALK pose is a
     crawler mid-step, so asking for one puts them half way through a step --
     standing still they breathe, whatever they are up to. */
  pose(i, doing, moveT, tick) {
    const a = Game.state.actors[i];
    const wasDoing = a.doing, wasMove = a.moveT;
    if (doing) a.doing = doing;
    if (moveT !== undefined) a.moveT = moveT;
    else if (doing === 'walking') a.moveT = 0.5;
    const p = poseFor(a, tick === undefined ? Game.state.tick : tick);
    const bones = buildSkeleton(p);
    const out = {};
    for (const id of BONE_IDS) out[id] = bones[id].p.slice();
    a.doing = wasDoing; a.moveT = wasMove;
    return { bob: p.bob, face: a.face, doing: doing || wasDoing, bones: out };
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
    const pat = Render.matPattern(litShade(def.side, CFG.shadeLeft, it.light), def.pattern,
      undefined, lightShade(CFG.shadeLeft, it.light));
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

  /* HOW TALL EVERY WALL FACE THE PICTURE PAINTS STANDS, in metres, and how many
     of them are NOT a whole number (v0.46.0).

     Asked exactly the way `draw()` asks it -- `wallsPainted` against the alpha
     plan of the frame's own batch -- so this counts the faces that reached the
     canvas, not the faces that were merely built. A side counts only where the
     picture has a polygon for it, which is what makes "every block stands a
     whole number of metres" a claim about the picture rather than about the
     arithmetic that fed it.

     `frac` is the histogram of the fractions the odd faces stood, because a
     number that is wrong in ONE way is a different mistake from one wrong in a
     hundred and the histogram tells them apart. `stepM`, `fade` and `buried` are
     reported so a test can work out WHY a face is not whole instead of knowing
     it: the depth step of the view plus the fade band is the height a foot
     lands at before anything rounds it, and `buried` counts the solid blocks
     that have no face at all -- the ones inside the rock next door.

     `taller` is how many of those faces stand MORE than the fade band, which is
     the same set the drawing's own `faded` counter counts (`paintSide` fades
     exactly while `metres > wallFadeM`). It is here so a test can hold this
     ruler against a number the game was already keeping: two counts of one thing
     that have to agree is how a new measurement is shown to be measuring.

     `paintPx` is how much of the picture those faces cover, added up the same way
     the drawing adds it up (`Render.area` of the very quad `wallsPainted` handed
     back), so it is a third identity -- against `consumed.wallPx`. `oddPx` is
     the area of the part-metre faces ALONE, which is what a change that only
     makes a foot land lower can possibly repaint: every one of them gains the
     fraction of a metre it was carrying, so a test can bound the seam by the
     strips that moved rather than by a percentage nobody derived.

     WHICH SQUARES IT WALKS IS THE DRAWING'S OWN RULE, square for square, and it
     has to be: a census that selects by a rule of its own is measuring a
     different picture, and `faces` against `consumed.walls` is then the only
     thing that would ever say so. So a square cut away whole (`alphaOf` 0) is
     skipped into `cut` -- the same count the drawing keeps under that name, and
     the same rule for it, so it is a second identity a test can hold -- and the
     case that caught this one: a square with NO
     HEIGHT of its own is NOT skipped, because the picture paints it. A ramp
     whose low end reaches the floor of the world has `wallM` 0 and still lays
     two cheek faces on the canvas; `walls++` counts them and this did not, which
     came out 2 faces short on seed 2 and 2 short on seed 777. ZERO METRES IS A
     HEIGHT TOO, and it is a whole number of metres, so such a face is `whole`
     and never odd. */
  wallMetres() {
    const s = Game.state;
    s.geomDirty = true; s.viewDirty = true;
    const b = Render.build(s);
    const alphaOf = Render.alphas(s, b).list;
    const out = { faces: 0, whole: 0, odd: 0, taller: 0, shortest: 0, tallest: 0,
                  blocks: 0, buried: 0, cut: 0, frac: {}, sample: null,
                  paintPx: 0, oddPx: 0,
                  stepM: s.cam.tileH / CFG.rise, fade: CFG.wallFadeM };
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      if (!(alphaOf[k] > 0)) { out.cut++; continue; }
      if (it.kind !== 'cell' || !it.solid) continue;
      out.blocks++;
      const f = Render.wallsPainted(it, alphaOf);
      const side = [[f.l, f.ml], [f.r, f.mr]];
      let painted = 0;
      for (let q = 0; q < 2; q++) {
        if (!side[q][0]) continue;
        const m = side[q][1];
        painted++;
        out.faces++;
        out.paintPx += Render.area(side[q][0]);
        if (m > CFG.wallFadeM) out.taller++;
        if (!out.shortest || m < out.shortest) out.shortest = m;
        if (m > out.tallest) out.tallest = m;
        if (Math.abs(m - Math.round(m)) < 1e-9) { out.whole++; continue; }
        out.odd++;
        out.oddPx += Render.area(side[q][0]);
        const key = (Math.round((m - Math.floor(m)) * 1000) / 1000).toFixed(3);
        out.frac[key] = (out.frac[key] || 0) + 1;
        if (!out.sample) {
          out.sample = { wallM: it.wallM, cut: m, cellH: it.cell.h,
                         stumped: !!it.stumped };
        }
      }
      if (!painted) out.buried++;
    }
    /* The drawing rounds its own total once (`wallPx: Math.round(wallPx)`), so
       this one rounds the same way -- otherwise the two counts agree to within a
       pixel and never agree exactly, and an identity that cannot be stated
       exactly is not an identity. */
    out.paintPx = Math.round(out.paintPx);
    return out;
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
    if (!it) {
      this.mapMiss = `no ${want.footing || 'any'} square in the picture at all `
        + `(${Render.batch.length} things in it)`;
      return null;
    }
    Render.draw(s);
    const px = Math.round(CFG.patternPx);
    /* Lay one square's material the way the draw lays it -- ask for the pattern
       the picture would ask for, clear what that pattern remembers, fill, read
       back. Clearing `_laid` also defeats the once-a-frame shortcut inside the
       renderer, so the real laying is measured rather than remembered. */
    const lay = function (z) {
      const d2 = TILE(z.cell.tile);
      const lift2 = Math.round((1 + z.cell.h * CFG.heightTint) * 100) / 100;
      const col2 = litShade(d2.top, lift2, z.light);
      /* The SAME call ground() makes, pick included: which of the material's
         pictures a square wears is part of the pattern's identity, so asking
         with the pick left out names a different object -- and then the plane
         was laid on one pattern and read back from another. */
      const p2 = Render.matPattern(col2, d2.pattern, z.cell.h, lightShade(lift2, z.light),
        Render.pickFor(d2.pattern, z.cell.x, z.cell.y, PICK_GROUND));
      p2._lastLaid = null; p2._lastMatrix = null; p2._laid = ''; p2._pinned = '';
      const gave = Render.ground(col2, d2.pattern, z, s, 'w' + s.cam.ox + ',' + s.cam.oy,
        lightShade(lift2, z.light));
      return { m: p2._lastLaid || p2._lastMatrix, pat: p2, gave: gave };
    };
    const one = lay(it);
    const pat = one.pat, m = one.m;
    if (!m) {
      /* Which of the two ways this came back empty, and how much of the rest of
         the frame did answer -- an instrument that cannot say what it did is
         worth nothing (lesson 27). */
      let ok = 0, bad = 0, firstBad = '';
      Render.batch.forEach(function (z) {
        if (z === it || z.kind !== 'cell') return;
        const t2 = TILE(z.cell.tile);
        if (!t2.pattern) return;
        const r2 = lay(z);
        if (r2.m) { ok += 1; return; }
        bad += 1;
        if (!firstBad) firstBad = `${z.cell.tile}@${z.cell.x},${z.cell.y} h${z.cell.h}`;
      });
      this.mapMiss = `found ${it.cell.tile} at ${it.cell.x},${it.cell.y} h${it.cell.h} `
        + `but the fill laid no plane (mapped ${Render.mappedGround}, `
        + `flat ${it.cell.slope === SLOPE_FLAT}, gave the pattern back ${one.gave === pat}, `
        + `can be placed ${!!pat.setTransform}, pick ${pat._pick}); `
        + `of the frame's other patterned squares ${ok} laid one`
        + (bad ? ` and ${bad} did not, first ${firstBad}` : '');
      return null;
    }
    this.mapMiss = '';
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

  /* Every square of ground that was painted in a plane that is not its own
     floor's, over one drawn frame, with both answers side by side: how far a
     metre of its material really went (got) and where its own floor says that
     metre goes (want). A ramp is the only square that should ever differ from
     the shared plane, and it is mapped from its own corners on purpose -- so a
     ramp is not counted; a flat square that came out with a ramp's stretch is,
     and that is the whole of what this asks.

     `on` says which rule to measure under: true is the way the game ships, false
     is the old one -- lay the material once a frame per pattern and skip the
     rest. Both run in the same build on the same frame, which is the only way a
     rule that takes work AWAY is allowed to be proved. */
  groundPlaneFaults(on) {
    Render.ownPlane = on === undefined ? Render.ownPlane : !!on;
    const s = Game.state;
    const was = Render.planeFaults;
    Render.planeFaults = true;
    Render._faults = null;
    let flats = 0, ramps = 0;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s);
    for (let i = 0; i < Render.batch.length; i++) {
      const z = Render.batch[i];
      if (z.kind !== 'cell') continue;
      if (!TILE(z.cell.tile).pattern) continue;   /* only these are laid */
      if (z.cell.slope === SLOPE_FLAT) flats++; else ramps++;
    }
    Render.draw(s);
    Render.planeFaults = was;
    const faults = (Render._faults || []).slice();
    Render._faults = null;
    return { ownPlane: !!Render.ownPlane, flats: flats, ramps: ramps,
             count: faults.length, faults: faults.slice(0, 8) };
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
    const wasDoing = a.doing, wasTick = s.tick, wasMove = a.moveT;
    if (doing) {
      a.doing = doing;
      /* A walk pose is a crawler mid-step; standing still they breathe. */
      a.moveT = doing === 'walking' ? 0.5 : 1;
    }
    if (tick !== undefined) s.tick = tick;
    const wasSel = s.selected, wasHover = s.hover, wasOver = s.pointer.over;
    s.selected = -1; s.hover = -1; s.pointer.over = false;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s);
    const want = Render.actorBase(s) + i;
    const keep = Render.batch.filter(function (z) { return z.i === want; });
    if (!keep.length) {
      a.doing = wasDoing; a.moveT = wasMove; s.tick = wasTick;
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
    a.doing = wasDoing; a.moveT = wasMove; s.tick = wasTick;
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
     or a repeating pattern. Patterns are the expensive kind, and exactly two
     places in the game are allowed to wear one -- the GROUND, and the SIDES OF
     BLOCKS. Everything else is flat-coloured lit faces, and that is what makes a
     crawler and a piece of the camp read as shape rather than as surface.

     So this counts WHERE a texture came from rather than how many there are:
     every patterned fill is put to the door it came through, and `other` counts
     the ones that came through neither of the two. That is a census of the whole
     picture, which is the only kind of assertion that can hold a line like
     "materials are on the ground and on walls and nowhere else" -- a count of
     patterned fills against the number of ground squares cannot, because since
     v0.24.0 the block sides carry a material too and legitimately outnumber it.

     `foul` paints one pattern through the wrong door before the counts are read,
     so a test can prove the census can SEE the thing it is looking for. A ruler
     that cannot fail is worth less than no ruler.

     FOUR DOORS, because a wall's material can reach the picture two ways and a
     wall's top metre is not a material at all: `Render.ground` (a material on a
     square of ground), `Render.wall` (a material on the face of a block),
     `Render.wallBand` (the SAME picture of that material on the faded top of the
     face, so the stonework runs on up the wall instead of stopping), and
     `Render.fadeBand`, which paints a GRADIENT -- the wall's own colour
     dissolving -- and is not a surface at all. So a gradient is counted as
     `band`, not as a pattern: "nothing is textured when the texture dial is off"
     has to go on meaning that, and with the material off every wall side fades
     through a gradient.

     `things` is everything the frame consumed, which used to be called `drawn`
     here -- and no longer is, because as of v0.30.0 "drawn" means a material
     made out of a picture somebody dropped in (Render.drawn), and two meanings
     for one word in one file is how a later session mis-reads a number. The
     frame's own counters come back beside the fills (`cells`, `walls`, `banded`,
     `backs`, `body`, `capsOff`) so a test can tie the two together -- how many
     squares wear a material, and how many wall sides do -- without asking which
     frame `Render.consumed` belongs to now.

     This counts FILLS, and a count of fills is not the same as a share of the
     picture: since v0.42.0 one wall side paints up to four of them (the face, the
     band above it, and the strip of rock along each far edge). `fillMap()` is the
     one to ask about size -- it paints the frame in five flat colours, one per
     kind, and counts the pixels. */
  fillKinds(foul) {
    const s = Game.state, ctx = Render.bctx;
    const real = ctx.fill.bind(ctx);
    const realGround = Render.ground, realWall = Render.wall;
    const realWallBand = Render.wallBand, realFadeBand = Render.fadeBand;
    const from = new Map();      /* a fill object -> the door it came out of */
    let plain = 0, pattern = 0, band = 0, ground = 0, wall = 0, other = 0;
    const door = (f, which) => { if (f && typeof f === 'object') from.set(f, which); return f; };
    Render.ground = function () { return door(realGround.apply(this, arguments), 'ground'); };
    Render.wall = function () { return door(realWall.apply(this, arguments), 'wall'); };
    /* The band carries the face's own material on up the wall, so it is the same
       door -- and while fadeBand() runs, whatever object it paints with (its
       gradient) belongs to the wall as well. */
    Render.wallBand = function () { return door(realWallBand.apply(this, arguments), 'wall'); };
    Render.fadeBand = function () {
      const wasPoly = Render.poly;
      Render.poly = function (c, q, fill) {
        if (fill && typeof fill === 'object') from.set(fill, 'wall');
        return wasPoly.apply(this, arguments);
      };
      try { return realFadeBand.apply(this, arguments); }
      finally { Render.poly = wasPoly; }
    };

    ctx.fill = function () {
      const f = this.fillStyle;
      if (f && typeof f === 'object') {
        if (typeof f.addColorStop === 'function') band++;   /* a fade, not a surface */
        else {
          pattern++;
          const d = from.get(f);
          if (d === 'ground') ground++;
          else if (d === 'wall') wall++;
          else other++;
        }
      } else plain++;
      return real();
    };
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s); Render.draw(s);
    if (foul) {
      /* One pattern drawn by hand, from no door at all. The census has to put it
         in `other` and nowhere else. */
      Render.poly(ctx, [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 3 }],
                  Render.matPattern('#ffffff', 'moss'));
    }
    ctx.fill = real;
    Render.ground = realGround; Render.wall = realWall;
    Render.wallBand = realWallBand; Render.fadeBand = realFadeBand;
    const c = Render.consumed;
    return { plain: plain, pattern: pattern, band: band, things: c.count,
             ground: ground, wall: wall, other: other,
             cells: c.count - c.people - c.structures,
             walls: c.walls, banded: c.banded, backs: c.backs,
             body: c.body, capsOff: c.capsOff };
  },

  /* THE SAME CENSUS, ASKED IN PIXELS. `fillKinds()` counts fills, and since
     v0.42.0 one wall side paints up to four of them (its face, the band above
     it, and a strip of rock along each far edge), so a count of fills stopped
     saying how much of the picture is wearing a material. This draws the very
     same frame again with every fill replaced by one flat colour per kind -- a
     plain fill, a material on the ground, a material on a wall, a gradient, and
     a pattern that came through neither door -- and counts the pixels of each.
     What is left over is the backdrop and the single antialiased pixel between
     two faces, where the two colours have blended and the pixel belongs to
     neither.

     The numbers are shares of the CANVAS, so they answer the question a person
     asks about a picture -- "how much of this is flat colour?" -- as a
     proportion of the thing they are looking at. COUNT A GRADIENT AS FLAT: a
     wall's material dissolving into its own colour is a surface of one colour
     getting dimmer, and the whole point of it is that the wall does not stop
     where the material does.

     It leaves the picture painted in the map's colours, so draw the real one
     again (`t.redraw()`) before asking the frame anything else.

     `foul` paints one patterned triangle through no door at all, exactly as
     `fillKinds(true)` does, so the pixel count can be shown to see what it is
     looking for before a count of zero is believed. */
  fillMap(foul) {
    const s = Game.state, ctx = Render.bctx;
    const real = ctx.fill.bind(ctx);
    const realGround = Render.ground, realWall = Render.wall;
    const realWallBand = Render.wallBand, realFadeBand = Render.fadeBand;
    const from = new Map();      /* a fill object -> the door it came out of */
    const door = (f, which) => { if (f && typeof f === 'object') from.set(f, which); return f; };
    Render.ground = function () { return door(realGround.apply(this, arguments), 'ground'); };
    Render.wall = function () { return door(realWall.apply(this, arguments), 'wall'); };
    Render.wallBand = function () { return door(realWallBand.apply(this, arguments), 'wall'); };
    Render.fadeBand = function () {
      const wasPoly = Render.poly;
      Render.poly = function (c, q, fill) {
        if (fill && typeof fill === 'object') from.set(fill, 'wall');
        return wasPoly.apply(this, arguments);
      };
      try { return realFadeBand.apply(this, arguments); }
      finally { Render.poly = wasPoly; }
    };
    const INK = { plain: '#fe00fe', ground: '#00fe00', wall: '#0000fe',
                  other: '#fefe00', band: '#00fefe' };
    const pack = (r, g, b) => (r << 16) | (g << 8) | b;
    const given = (hex) => pack(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
                                parseInt(hex.slice(5, 7), 16));
    const ofPixel = new Map();
    for (const k in INK) ofPixel.set(given(INK[k]), k);
    ofPixel.set(given(BACKDROP), 'backdrop');
    ctx.fill = function () {
      const f = this.fillStyle;
      let k = 'plain';
      if (f && typeof f === 'object') {
        if (typeof f.addColorStop === 'function') k = 'band';
        else k = from.get(f) === 'ground' ? 'ground' : from.get(f) === 'wall' ? 'wall' : 'other';
      }
      this.fillStyle = INK[k];
      return real();
    };
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s); Render.draw(s);
    if (foul) {
      Render.poly(ctx, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }],
                  Render.matPattern('#ffffff', 'moss'));
    }
    ctx.fill = real;
    Render.ground = realGround; Render.wall = realWall;
    Render.wallBand = realWallBand; Render.fadeBand = realFadeBand;
    const out = { plain: 0, ground: 0, wall: 0, other: 0, band: 0,
                  backdrop: 0, mingled: 0, canvas: Render.w * Render.h };
    const px = ctx.getImageData(0, 0, Render.w, Render.h).data;
    for (let i = 0; i < px.length; i += 4) {
      const k = ofPixel.get(pack(px[i], px[i + 1], px[i + 2]));
      out[k === undefined ? 'mingled' : k]++;
    }
    /* What the two questions are actually asked about: flat colour (a fill with
       no material on it, and a wall fading through its own colour) against
       surface (a material on the ground or on a wall). */
    out.flat = out.plain + out.band;
    out.surface = out.ground + out.wall + out.other;
    return out;
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

      /* -- the pictures somebody dropped in, if there are any --------------- */
      const dropped = Textures.wants;
      const drawnMats = Object.keys(Textures.files).filter((k) => Render.drawn(k));
      add('the pictures dropped into textures/ became materials',
          dropped === 0 ? drawnMats.length === 0
                        : (Textures.ready && drawnMats.length > 0),
          dropped === 0
            ? 'none dropped in, so every surface is the one the game generates'
            : Textures.done + ' of ' + dropped + ' decoded, and ' + drawnMats.length
              + ' material' + (drawnMats.length === 1 ? '' : 's') + ' drawn from them ('
              + drawnMats.join(', ') + ')');

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

      /* -- everything built was either painted or cut away ---------------- */
      Render.recordItems = true;
      const built = Render.build(a).length;
      const drew = Render.draw(a);
      add('every square the frame built was painted or counted as cut away',
          drew.count + drew.cut === built,
          'built ' + built + ', drew ' + drew.count + ', cut ' + drew.cut);
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
         view is only a window onto a chunk wider than itself.

         The pixel is taken from that block's own NEAR FACE, not from the middle
         of its square: a square's screen footprint is its TOP, and the tops are
         exactly what the wall look deletes -- so the centre of a block is a
         pixel the block itself no longer paints, and the honest answer there is
         whatever the deleted lid was hiding. A near face is painted in every
         look, which is what makes this a check on the picker rather than on the
         lid.

         WHAT IS TESTED FOR BEING INSIDE THE PICTURE IS THAT PIXEL, not the
         square's centre. A near face is four metres of wall -- 128 pixels down
         the screen -- and the point is 60% of the way down it, which can easily
         be past the bottom edge of the window while the square's own centre sits
         comfortably in the middle of it. Judging the centre handed pickAt() a
         point off the canvas, and refusing one is the one thing pickAt() is
         right to do; the check then failed on behalf of a picker that was
         working. (It is the pixel the answer is about, so it is the pixel that
         has to be in the picture.) */
      Render.drawPick(a);
      let front = null;
      for (let k = drew.items.length - 1; k >= 0; k--) {
        const it = drew.items[k];
        if (!it.aim) continue;
        const m = 8;
        if (!(it.aim.x > m && it.aim.x < Render.w - m
              && it.aim.y > m && it.aim.y < Render.h - m)) continue;
        front = it; break;
      }
      add('some of the labyrinth is actually in view', !!front,
          drew.items.length + ' blocks drawn');
      const hit = front ? Render.pickAt(a, front.aim.x, front.aim.y) : -2;
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
          cut > 0 && cut < rock, cut + ' of ' + rock + ' rock columns stand in the way');

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
