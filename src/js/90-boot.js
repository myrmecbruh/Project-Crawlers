/* The low-resolution pipeline and the fixed-timestep loop.
 *
 * The world is drawn into a small buffer and that buffer is blown up by the
 * browser with hard pixel edges. That is the whole trick behind "3D that looks
 * like sprite work": the geometry is real, the resolution is not.
 */
const Game = {
  state: null,
  canvas: null,
  ctx: null,
  cssScale: 1,
  acc: 0,
  last: 0,
  paused: false,   /* tests stop the clock so a frame means exactly one step */

  start(seed) {
    Render.ensure();
    this.canvas = document.getElementById('screen');
    this.canvas.width = CFG.lowW;
    this.canvas.height = CFG.lowH;
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;

    this.state = newState(seed === undefined ? 1 : seed);
    this.fit();
    addEventListener('resize', () => this.fit());
    bindInput(this.state, this.canvas, (cx, cy) => this.toBuffer(cx, cy));

    document.getElementById('version').textContent = 'v' + VERSION;
    const touch = matchMedia('(hover: none)').matches;
    document.getElementById('hint').textContent =
      N(touch ? 'ui.hint_touch' : 'ui.hint_desktop');

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  /* Whole-number scaling wherever it fits, so pixels stay square. Below 1:1 --
     a narrow phone -- it scales fractionally rather than cropping the world. */
  fit() {
    const availW = Math.max(160, innerWidth - 32);
    const availH = Math.max(120, innerHeight - 24 - 40);
    let s = Math.min(availW / CFG.lowW, availH / CFG.lowH);
    if (s >= 1) s = Math.floor(s);
    this.cssScale = s;
    this.canvas.style.width = Math.round(CFG.lowW * s) + 'px';
    this.canvas.style.height = Math.round(CFG.lowH * s) + 'px';
  },

  toBuffer(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.cssScale,
             y: (clientY - r.top) / this.cssScale };
  },

  /* Rebuild only what changed. Nothing moves in the labyrinth yet, so a still
     camera costs a blit and nothing else. */
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

  /* One frame, forced: exactly one step and one full redraw. Tests use this. */
  frame() {
    step(this.state);
    this.state.geomDirty = true;
    this.state.viewDirty = true;
    this.render();
  },

  loop(t) {
    if (this.paused) { this.last = t; requestAnimationFrame((tt) => this.loop(tt)); return; }
    const dt = Math.min(t - this.last, 250); /* a backgrounded tab must not fast-forward */
    this.last = t;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK_MS && steps < 8) { step(this.state); this.acc -= TICK_MS; steps++; }
    this.render();
    if ((this.state.tick & 15) === 0) this.readout();
    requestAnimationFrame((tt) => this.loop(tt));
  },

  readout() {
    const el = document.getElementById('readout');
    if (!el) return;
    const s = this.state;
    el.textContent = 'seed ' + s.seed + ' · ' + s.world.n + '×' + s.world.n
      + ' m · zoom ' + s.cam.zoom + '×';
  }
};

function boot() { Game.start(1); }
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
