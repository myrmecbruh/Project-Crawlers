/* The pixel-perfect pipeline and the fixed-timestep loop.
 *
 * The world is drawn into a buffer of whole game pixels, and that buffer is
 * blown up by a WHOLE NUMBER. No fractional scaling anywhere, no smoothing, and
 * the camera only ever sits on whole pixels -- which is what keeps every edge
 * hard and stops the ground shimmering as the view slides.
 *
 * Time runs on its own. The labyrinth does not wait to be looked at.
 */
const Game = {
  state: null,
  canvas: null,
  ctx: null,
  acc: 0,
  last: 0,
  paused: false,   /* tests stop the clock so a frame means exactly one step */

  start(seed) {
    this.canvas = document.getElementById('screen');
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    this.fit();
    this.state = newState(seed === undefined ? 1 : seed);
    /* The pictures dropped into textures/ decode in their own time. Loading them
       is once per page however many matches are started; what is baked before
       they arrive is thrown away for them. */
    Textures.load();
    this.fit();
    addEventListener('resize', () => { this.fit(); if (this.state) this.state.viewDirty = true; });
    bindInput(this.state, this.canvas, (cx, cy) => this.toBuffer(cx, cy));

    document.getElementById('version').textContent = 'v' + VERSION;
    const touch = matchMedia('(hover: none)').matches;
    document.getElementById('hint').textContent =
      N(touch ? 'ui.hint_touch' : 'ui.hint_desktop');
    this.bindButtons();
    Inspector.bind();
    this.refreshControls();

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  /* The buttons say what the clock is doing, because a paused game and a broken
     one look identical otherwise. */
  refreshControls() {
    const s = this.state;
    const pause = document.getElementById('pause');
    if (pause) {
      pause.textContent = s.paused ? '\u25B6' : '\u2758\u2758';
      pause.classList.toggle('on', s.paused);
      pause.setAttribute('aria-pressed', s.paused ? 'true' : 'false');
    }
    const label = document.getElementById('speed');
    if (label) label.textContent = speedName(s);
    const slower = document.getElementById('slower');
    const faster = document.getElementById('faster');
    if (slower) slower.disabled = s.speed === 0;
    if (faster) faster.disabled = s.speed === SPEED_IDS.length - 1;
  },

  zoom() { return this.state ? this.state.cam.zoom : CFG.zoomStart; },

  /* Rotating and tilting have to be reachable with a thumb, not only a
     keyboard -- half of rule 8's point is that the game works on a phone. */
  bindButtons() {
    const hit = (id, fn) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('click', (e) => { fn(); e.preventDefault(); });
    };
    hit('pause', () => { setPaused(this.state); this.refreshControls(); });
    hit('slower', () => { setSpeed(this.state, this.state.speed - 1); this.refreshControls(); });
    hit('faster', () => { setSpeed(this.state, this.state.speed + 1); this.refreshControls(); });
    hit('turn-left', () => rotateCamera(this.state, -1));
    hit('turn-right', () => rotateCamera(this.state, 1));
    hit('tilt', () => {
      tiltCamera(this.state);
      const el = document.getElementById('tilt');
      if (el) el.classList.toggle('on', this.state.cam.pitchTarget > 0.5);
    });
  },

  /* The picture is as big as the window allows at this zoom, in whole game
     pixels, capped so a very large screen does not cost a fortune to draw. */
  fit() {
    const z = this.zoom();
    const availW = Math.max(200, innerWidth - 32);
    const availH = Math.max(160, innerHeight - 24 - 40);
    const w = Math.min(CFG.maxBufW, Math.floor(availW / z));
    const h = Math.min(CFG.maxBufH, Math.floor(availH / z));
    Render.resize(w, h);
    this.canvas.width = Render.w;
    this.canvas.height = Render.h;
    this.ctx.imageSmoothingEnabled = false;
    this.canvas.style.width = (Render.w * z) + 'px';
    this.canvas.style.height = (Render.h * z) + 'px';
    if (this.state) { this.state.geomDirty = true; this.state.viewDirty = true; }
  },

  toBuffer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const z = this.zoom();
    return { x: (clientX - r.left) / z, y: (clientY - r.top) / z,
             screenX: clientX - r.left, screenY: clientY - r.top };
  },

  render() {
    const s = this.state;
    /* Riding a crawler happens here rather than in the loop, so the view keeps
       up however the frame was driven -- the game's own clock or a test's. */
    if (followCamera(s)) s.viewDirty = true;
    /* The ground follows the picture, so this is here and not in the step:
       walk the crawlers along and the window is dragged after them, drag the
       view by hand and it is dragged just the same. New ground means the
       picture has to be built again. */
    if (updateLiveWorld(s, Render.w, Render.h)) {
      s.geomDirty = true;
      s.viewDirty = true;
    }
    if (s.geomDirty) Render.build(s);   /* the list the pointer walks */
    /* Asking the pointer is arithmetic over that list now -- shapes and a
       bounding box each, no canvas -- so it is cheap enough to ask every frame
       the pointer is over the picture, which is what makes the tooltip keep up
       with a walking crawler. */
    if (s.pointer.over) {
      const hit = Render.pickAt(s, s.pointer.bx, s.pointer.by);
      if (hit !== s.hover) { s.hover = hit; s.viewDirty = true; }
    }
    if (s.viewDirty) {
      Render.draw(s);
      Inspector.render(s);
    }
    /* Laid straight onto the window. The picture is whole: it carries no
       transparency, so there is nothing to lay it onto first. */
    this.ctx.drawImage(Render.buf, 0, 0);
  },

  /* One frame, forced: exactly one step and one full redraw. Tests use this,
     and it ignores whether the view is moving. */
  frame() {
    step(this.state);
    this.state.geomDirty = true;
    this.state.viewDirty = true;
    this.render();
  },

  /* The arrow keys pan the view. This is not part of the simulation step: the
     camera runs on real time and the world runs on the player's clock. */
  keyPan() {
    const i = this.state.input;
    let dx = 0, dy = 0;
    if (i.panLeft) dx -= 1;
    if (i.panRight) dx += 1;
    if (i.panUp) dy -= 1;
    if (i.panDown) dy += 1;
    if (!dx && !dy) return;
    const d = Math.hypot(dx, dy);
    panCamera(this.state, dx / d * CFG.keyPan, dy / d * CFG.keyPan);
  },

  loop(t) {
    if (this.paused) { this.last = t; requestAnimationFrame((tt) => this.loop(tt)); return; }
    const dt = Math.min(t - this.last, 250); /* a backgrounded tab must not fast-forward */
    this.last = t;
    const s = this.state;

    this.keyPan();
    camAnimate(s, dt);

    /* The player's clock: paused stops the world, speed multiplies it. The
       camera above is untouched by both -- it always moves on real time. */
    const rate = speedOf(s);
    if (rate > 0) {
      this.acc += dt * rate;
      let steps = 0;
      while (this.acc >= TICK_MS && steps < CFG.maxSteps) {
        step(s); this.acc -= TICK_MS; steps++;
      }
      if (this.acc > TICK_MS * CFG.maxSteps) this.acc = 0;   /* do not bank a backlog */
    } else {
      this.acc = 0;
    }

    this.render();
    if ((this.frames = (this.frames || 0) + 1) % 12 === 0) this.readout();
    requestAnimationFrame((tt) => this.loop(tt));
  },

  readout() {
    const el = document.getElementById('readout');
    if (!el) return;
    const s = this.state;
    const camp = campSummary(s.camp);
    const rider = s.cam.follow >= 0 && s.actors[s.cam.follow]
      ? ' · ' + N('ui.label_following') + ' ' + s.actors[s.cam.follow].name : '';
    el.textContent = 'seed ' + s.seed
      + ' · tick ' + s.tick
      + ' · camp ' + camp.built + '/' + camp.sites
      + ' · zoom ' + s.cam.zoom + '×'
      + rider;
  }
};

function boot() { Game.start(1); }
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
