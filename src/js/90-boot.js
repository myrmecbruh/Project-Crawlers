/* Fixed-timestep loop. The simulation only ever advances in whole TICK_MS
   steps, so a slow frame changes how smooth it looks and nothing else. */
const Game = {
  state: null,
  canvas: null,
  ctx: null,
  scale: 1,
  offX: 0,
  offY: 0,
  acc: 0,
  last: 0,
  paused: false,   /* tests stop the clock so a frame means exactly one step */

  start(seed) {
    this.state = newState(seed === undefined ? 1 : seed);
    this.canvas = document.getElementById('screen');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.fit();
    addEventListener('resize', () => this.fit());
    bindInput(this.state, this.canvas, (cx, cy) => this.toField(cx, cy));
    document.getElementById('version').textContent = 'v' + VERSION;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  },

  fit() {
    const pad = 16;
    const availW = Math.max(160, innerWidth - pad * 2);
    const availH = Math.max(120, innerHeight - pad * 2 - 34);
    this.scale = Math.min(availW / FIELD.w, availH / FIELD.h);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(FIELD.w * this.scale * dpr);
    this.canvas.height = Math.round(FIELD.h * this.scale * dpr);
    this.canvas.style.width = Math.round(FIELD.w * this.scale) + 'px';
    this.canvas.style.height = Math.round(FIELD.h * this.scale) + 'px';
    this.ctx.setTransform(this.scale * dpr, 0, 0, this.scale * dpr, 0, 0);
  },

  toField(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / this.scale, y: (clientY - r.top) / this.scale };
  },

  /* One frame: catch the simulation up, then draw once. */
  frame() {
    step(this.state);
    Render.build(this.state);
    Render.draw(this.ctx, this.state);
  },

  readout() {
    const el = document.getElementById('readout');
    if (el) el.textContent = 'seed ' + this.state.seed + ' \u00b7 tick ' + this.state.tick;
  },

  loop(t) {
    if (this.paused) { this.last = t; requestAnimationFrame((tt) => this.loop(tt)); return; }
    const dt = Math.min(t - this.last, 250); /* a backgrounded tab must not fast-forward */
    this.last = t;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= TICK_MS && steps < 8) { step(this.state); this.acc -= TICK_MS; steps++; }
    Render.build(this.state);
    Render.draw(this.ctx, this.state);
    if ((this.state.tick & 15) === 0) this.readout();
    requestAnimationFrame((tt) => this.loop(tt));
  }
};

function boot() { Game.start(1); }
if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
else boot();
