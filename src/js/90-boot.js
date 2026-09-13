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
    this.fit();
    addEventListener('resize', () => { this.fit(); if (this.state) this.state.viewDirty = true; });
    bindInput(this.state, this.canvas, (cx, cy) => this.toBuffer(cx, cy));

    document.getElementById('version').textContent = 'v' + VERSION;
    const touch = matchMedia('(hover: none)').matches;
    document.getElementById('hint').textContent =
      N(touch ? 'ui.hint_touch' : 'ui.hint_desktop');
    this.bindButtons();

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
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
    if (s.geomDirty) { Render.build(s); Render.drawPick(s); }
    if (s.pointer.over) {
      const hit = Render.pickAt(s, s.pointer.bx, s.pointer.by);
      if (hit !== s.hover) { s.hover = hit; s.viewDirty = true; }
    }
    if (s.viewDirty) {
      Render.draw(s);
      Tooltip.render(s);
    }
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

  /* The arrow keys pan here rather than inside the simulation, because panning
     is what lets time run -- if the simulation did it, time would wind itself. */
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

    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK_MS && steps < 8) { step(s); this.acc -= TICK_MS; steps++; }

    this.render();
    if ((this.frames = (this.frames || 0) + 1) % 12 === 0) this.readout();
    requestAnimationFrame((tt) => this.loop(tt));
  },

  readout() {
    const el = document.getElementById('readout');
    if (!el) return;
    const s = this.state;
    const camp = campSummary(s.camp);
    el.textContent = 'seed ' + s.seed
      + ' · tick ' + s.tick
      + ' · camp ' + camp.built + '/' + camp.sites
      + ' · zoom ' + s.cam.zoom + '×';
  }
};

function boot() { Game.start(1); }
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
