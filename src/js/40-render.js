/* A builder with no consumer looks exactly like working code.
   So: build() fills `batch`, draw() empties it onto the canvas AND records
   what it actually drew in `consumed`. Tests assert against `consumed`,
   never against `batch` -- a picture nobody drew must never pass a test. */
const Render = {
  batch: [],
  consumed: null,     /* { tick, count, kinds } -- what reached the canvas */
  recordItems: false, /* tests switch this on to inspect individual items  */

  build(state) {
    const b = this.batch;
    b.length = 0;

    /* grid */
    for (let x = 0; x <= FIELD.w; x += 60) b.push({ kind: 'grid', x1: x, y1: 0, x2: x, y2: FIELD.h });
    for (let y = 0; y <= FIELD.h; y += 60) b.push({ kind: 'grid', x1: 0, y1: y, x2: FIELD.w, y2: y });

    /* the mover */
    const m = state.mover;
    b.push({ kind: 'mover', x: m.x, y: m.y, r: m.r, speed: Math.hypot(m.vx, m.vy) });

    return b;
  },

  draw(ctx, state) {
    const b = this.batch;
    const kinds = {};
    let drawn = 0;

    ctx.fillStyle = '#0b0f14';
    ctx.fillRect(0, 0, FIELD.w, FIELD.h);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120,180,255,0.07)';
    ctx.beginPath();
    for (const it of b) {
      if (it.kind !== 'grid') continue;
      ctx.moveTo(it.x1, it.y1);
      ctx.lineTo(it.x2, it.y2);
      kinds.grid = (kinds.grid || 0) + 1;
      drawn++;
    }
    ctx.stroke();

    for (const it of b) {
      if (it.kind !== 'mover') continue;
      const glow = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, it.r * 3.2);
      glow.addColorStop(0, 'rgba(90,200,255,0.30)');
      glow.addColorStop(1, 'rgba(90,200,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e8f4ff';
      ctx.strokeStyle = '#5ac8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      kinds.mover = (kinds.mover || 0) + 1;
      drawn++;
    }

    this.consumed = { tick: state.tick, count: drawn, kinds: kinds };
    if (this.recordItems) this.consumed.items = b.map((it) => Object.assign({}, it));
    return this.consumed;
  }
};
