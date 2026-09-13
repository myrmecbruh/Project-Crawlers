/* The isometric view.
 *
 * Everything is drawn into a small buffer (480x270 by default) and then blown
 * up with hard pixel edges, which is what gives 3D geometry the look of 2D
 * sprite work. Nothing here is sprites -- these are real blocks with real
 * elevation, projected.
 *
 * A builder with no consumer looks exactly like working code. So build() fills
 * `batch`, draw() paints it AND records `consumed` -- what actually reached the
 * buffer -- and every test asserts against `consumed`, never against `batch`.
 */
const Render = {
  buf: null, bctx: null,       /* the low-resolution picture              */
  pick: null, pctx: null,      /* the same scene painted in id colours    */
  batch: [],
  consumed: null,
  recordItems: false,

  ensure() {
    if (this.buf) return;
    this.buf = document.createElement('canvas');
    this.buf.width = CFG.lowW; this.buf.height = CFG.lowH;
    this.bctx = this.buf.getContext('2d', { alpha: false });
    this.pick = document.createElement('canvas');
    this.pick.width = CFG.lowW; this.pick.height = CFG.lowH;
    this.pctx = this.pick.getContext('2d', { alpha: false, willReadFrequently: true });
  },

  /* Grid corner (gxx, gyy) at elevation h metres -> buffer pixels. */
  project(s, gxx, gyy, h) {
    const z = s.cam.zoom;
    return {
      x: (gxx - gyy) * (CFG.tileW / 2) * z - s.cam.x + CFG.lowW / 2,
      y: (gxx + gyy) * (CFG.tileH / 2) * z - h * CFG.rise * z - s.cam.y + CFG.lowH / 2
    };
  },

  /* An upright box measured in metres, centred on a point in the grid. Used for
     everything that stands on the ground rather than being the ground. */
  box(s, gx, gy, half, z0, z1) {
    const o = [[-half, -half], [half, -half], [half, half], [-half, half]];
    const top = new Array(4), bot = new Array(4);
    for (let c = 0; c < 4; c++) {
      top[c] = this.project(s, gx + o[c][0], gy + o[c][1], z1);
      bot[c] = this.project(s, gx + o[c][0], gy + o[c][1], z0);
    }
    return {
      top: top,
      right: [top[1], top[2], bot[2], bot[1]],
      left: [top[2], top[3], bot[3], bot[2]]
    };
  },

  /* Which parts of a figure are actually on this crawler right now. Rule 4: a
     part that is worn is a part that is drawn, and there is no other path. */
  figureParts(actor) {
    const out = [];
    for (let i = 0; i < FIGURE_IDS.length; i++) {
      const id = FIGURE_IDS[i], f = DATA.figure[id];
      if (f.slot === 'body' || actor.worn[f.slot] === id) out.push({ id: id, part: f });
    }
    /* Ground up, always. A hat painted before the head it sits on is a hat
       nobody can see -- which looks exactly like a hat that works. */
    out.sort(function (a, b) { return a.part.from_m - b.part.from_m; });
    return out;
  },

  /* Painter's order for a heightfield is simply back to front: x + y ascending.
     Two cells on the same diagonal never overlap, so their order is free.
     A crawler is painted directly after the ground they are standing on, so
     they are hidden by whatever is in front of that ground and nothing else. */
  build(s) {
    const w = s.world, n = w.n, b = this.batch;
    b.length = 0;

    const standing = {};
    for (let i = 0; i < s.actors.length; i++) {
      const a = s.actors[i];
      const key = a.y * n + a.x;
      (standing[key] || (standing[key] = [])).push(i);
    }

    for (let d = 0; d <= 2 * (n - 1); d++) {
      const x0 = Math.max(0, d - n + 1), x1 = Math.min(n - 1, d);
      for (let x = x0; x <= x1; x++) {
        const y = d - x;
        const i = y * n + x;
        const cell = w.cells[i];

        const top = new Array(4);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let c = 0; c < 4; c++) {
          const p = this.project(s, x + CORNERS[c][0], y + CORNERS[c][1],
                                 cornerHeight(cell, c));
          top[c] = p;
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        /* The sides fall from the two lower edges of the diamond to the floor. */
        const baseB = this.project(s, x + 1, y, 0);
        const baseC = this.project(s, x + 1, y + 1, 0);
        const baseD = this.project(s, x, y + 1, 0);
        if (baseC.y > maxY) maxY = baseC.y;

        if (maxX < 0 || minX > CFG.lowW || maxY < 0 || minY > CFG.lowH) continue;

        b.push({
          kind: 'cell',
          i: i, cell: cell, top: top,
          right: [top[1], top[2], baseC, baseB],
          left: [top[2], top[3], baseD, baseC],
          solid: cell.h > 0,
          minX: minX, minY: minY, maxX: maxX, maxY: maxY,
          cx: (top[0].x + top[2].x) / 2, cy: (top[0].y + top[2].y) / 2
        });

        const here = standing[i];
        if (!here) continue;
        const ground = surfaceHeight(cell);
        const scale = CFG.actorHeight / CFG.figureNominal;
        for (let q = 0; q < here.length; q++) {
          const actor = s.actors[here[q]];
          const parts = this.figureParts(actor);
          const drawn = [];
          let aMinX = Infinity, aMinY = Infinity, aMaxX = -Infinity, aMaxY = -Infinity;
          for (let r = 0; r < parts.length; r++) {
            const f = parts[r].part;
            const shape = this.box(s, x + 0.5, y + 0.5, f.half_width,
                                   ground + f.from_m * scale, ground + f.to_m * scale);
            drawn.push({ id: parts[r].id, colour: f.colour, shape: shape });
            for (let c = 0; c < 4; c++) {
              const t = shape.top[c];
              if (t.x < aMinX) aMinX = t.x;
              if (t.x > aMaxX) aMaxX = t.x;
              if (t.y < aMinY) aMinY = t.y;
              if (t.y > aMaxY) aMaxY = t.y;
            }
          }
          const crown = drawn[drawn.length - 1].shape.top;
          b.push({
            kind: 'actor',
            i: w.cells.length + here[q],
            actor: actor, parts: drawn, top: crown, solid: true,
            minX: aMinX, minY: aMinY, maxX: aMaxX, maxY: aMaxY + CFG.rise,
            cx: (crown[0].x + crown[2].x) / 2, cy: (crown[0].y + crown[2].y) / 2
          });
        }
      }
    }
    s.geomDirty = false;
    return b;
  },

  poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  },

  /* Is this block standing between the camera and the cell being inspected?
     Anything drawn later than the focus cell that covers it is in the way --
     that is the see-through fourth wall, and it is a knob, not a law. */
  occludes(item, focus) {
    return item.i !== focus.i
      && item.minX < focus.maxX && item.maxX > focus.minX
      && item.minY < focus.maxY && item.maxY > focus.minY;
  },

  draw(s) {
    this.ensure();
    const ctx = this.bctx, b = this.batch;
    const kinds = {};
    let drawn = 0, faded = 0;

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0d11';
    ctx.fillRect(0, 0, CFG.lowW, CFG.lowH);

    const focusIdx = s.hover >= 0 ? s.hover : s.selected;
    let focus = null, focusPos = -1;
    if (focusIdx >= 0) {
      for (let k = 0; k < b.length; k++) {
        if (b[k].i === focusIdx) { focus = b[k]; focusPos = k; break; }
      }
    }

    const items = this.recordItems ? [] : null;

    let people = 0;
    const wornDrawn = [];

    for (let k = 0; k < b.length; k++) {
      const it = b[k];

      let alpha = 1;
      if (focus && k > focusPos && this.occludes(it, focus)) {
        alpha = CFG.occluderFade;
        faded++;
      }
      ctx.globalAlpha = alpha;

      if (it.kind === 'actor') {
        for (let r = 0; r < it.parts.length; r++) {
          const pt = it.parts[r];
          this.poly(ctx, pt.shape.left, shade(pt.colour, CFG.shadeLeft));
          this.poly(ctx, pt.shape.right, shade(pt.colour, CFG.shadeRight));
          this.poly(ctx, pt.shape.top, shade(pt.colour, 1));
          if (DATA.figure[pt.id].slot !== 'body') wornDrawn.push(pt.id);
        }
        people++;
        drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'actor', name: it.actor.name,
                       x: it.actor.x, y: it.actor.y,
                       parts: it.parts.map(function (q) { return q.id; }),
                       alpha: alpha, sx: it.cx, sy: it.cy });
        }
        continue;
      }

      const def = TILE(it.cell.tile);
      const lift = 1 + it.cell.h * CFG.heightTint;
      if (it.solid) {
        this.poly(ctx, it.left, shade(def.side, CFG.shadeLeft * lift));
        this.poly(ctx, it.right, shade(def.side, CFG.shadeRight * lift));
      }
      this.poly(ctx, it.top, shade(def.top, lift));

      kinds[it.cell.tile] = (kinds[it.cell.tile] || 0) + 1;
      drawn++;
      if (items) {
        items.push({ i: it.i, kind: 'cell', x: it.cell.x, y: it.cell.y, h: it.cell.h,
                     tile: it.cell.tile, slope: it.cell.slope,
                     alpha: alpha, sx: it.cx, sy: it.cy });
      }
    }

    /* The outline highlight. Rule 8: anything you can see, you can interrogate. */
    ctx.globalAlpha = 1;
    let outlined = false;
    if (focus) {
      ctx.strokeStyle = '#ffe9a8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(focus.top[0].x, focus.top[0].y);
      for (let c = 1; c < 4; c++) ctx.lineTo(focus.top[c].x, focus.top[c].y);
      ctx.closePath();
      ctx.stroke();
      outlined = true;
    }

    this.consumed = {
      tick: s.tick, count: drawn, kinds: kinds,
      people: people, worn: wornDrawn,
      faded: faded, outlined: outlined,
      focus: focusIdx, zoom: s.cam.zoom,
      bufW: this.buf.width, bufH: this.buf.height
    };
    if (items) this.consumed.items = items;
    s.viewDirty = false;
    return this.consumed;
  },

  /* The same scene, painted flat in id colours. Reading one pixel of it tells
     you exactly what the player is pointing at, elevation and ramps included --
     which is the only way to be honest about "anything you can SEE". */
  drawPick(s) {
    this.ensure();
    const ctx = this.pctx, b = this.batch;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, CFG.lowW, CFG.lowH);
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      const id = it.i + 1;
      const col = 'rgb(' + (id & 255) + ',' + ((id >> 8) & 255) + ',' + ((id >> 16) & 255) + ')';
      if (it.kind === 'actor') {
        for (let r = 0; r < it.parts.length; r++) {
          this.poly(ctx, it.parts[r].shape.left, col);
          this.poly(ctx, it.parts[r].shape.right, col);
          this.poly(ctx, it.parts[r].shape.top, col);
        }
        continue;
      }
      if (it.solid) { this.poly(ctx, it.left, col); this.poly(ctx, it.right, col); }
      this.poly(ctx, it.top, col);
    }
    return b.length;
  },

  /* Pick numbers run cells first, then crawlers, so one number identifies
     anything on screen. */
  isActorPick(s, p) { return p >= s.world.cells.length; },
  actorFromPick(s, p) { return s.actors[p - s.world.cells.length]; },

  pickAt(s, bx, by) {
    if (!this.pick) return -1;
    const x = Math.floor(bx), y = Math.floor(by);
    if (x < 0 || y < 0 || x >= CFG.lowW || y >= CFG.lowH) return -1;
    const d = this.pctx.getImageData(x, y, 1, 1).data;
    const id = d[0] + d[1] * 256 + d[2] * 65536;
    if (id < 1 || id > s.world.cells.length + s.actors.length) return -1;
    return id - 1;
  }
};
