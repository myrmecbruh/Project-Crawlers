/* The isometric view, drawn pixel for pixel.
 *
 * THE SCALE IS LOCKED: one metre of height is render.rise game pixels, always.
 * Zooming does not make the world bigger -- it makes each game pixel cover more
 * real screen pixels, by a whole number, and the picture is drawn smaller to
 * match. So every edge lands on a whole pixel at every zoom, and a crawler is
 * the same 52 pixels tall whether you are close in or far out.
 *
 * A builder with no consumer looks exactly like working code. So build() fills
 * `batch`, draw() paints it AND records `consumed` -- what actually reached the
 * buffer -- and every test asserts against `consumed`, never against `batch`.
 */
const Render = {
  w: 0, h: 0,                  /* the picture, in game pixels              */
  buf: null, bctx: null,
  pick: null, pctx: null,
  batch: [],
  consumed: null,
  recordItems: false,

  resize(w, h) {
    w = Math.max(64, Math.round(w));
    h = Math.max(48, Math.round(h));
    if (this.buf && this.w === w && this.h === h) return false;
    this.w = w; this.h = h;
    if (!this.buf) {
      this.buf = document.createElement('canvas');
      this.pick = document.createElement('canvas');
      this.bctx = this.buf.getContext('2d', { alpha: false });
      this.pctx = this.pick.getContext('2d', { alpha: false, willReadFrequently: true });
    }
    this.buf.width = w; this.buf.height = h;
    this.pick.width = w; this.pick.height = h;
    return true;
  },

  ensure() {
    if (!this.buf) this.resize(CFG.maxBufW, CFG.maxBufH);
    if (!this.grainCoarse) this.makeGrain();
  },

  /* ---- the grain ---------------------------------------------------------
   * Grit, rust and mottling, generated once into two small tiles: a coarse one
   * for the ground and a finer one for crawlers and what they build, because a
   * face is only about eight pixels across and the floor is sixty-four.
   *
   * It is a transparent OVERLAY rather than a coloured texture, so one tile
   * works over every material and the lighting underneath still shows through.
   * Seeded, so the same grit comes back every time.
   */
  makeGrain() {
    const build = (px) => {
      const c = document.createElement('canvas');
      c.width = px; c.height = px;
      const g = c.getContext('2d');
      const img = g.createImageData(px, px);
      const rand = makeRand(CFG.texSeed + px);

      /* A low-frequency lattice, wrapped so the tile has no seam, gives soft
         blotches -- damp, soot, wear. Per-pixel white noise gives a dither
         checkerboard instead, which is what the first attempt looked like. */
      const lo = 4;
      const lat = new Float32Array(lo * lo);
      for (let i = 0; i < lat.length; i++) lat[i] = rand();
      const at = (x, y) => lat[((y % lo) + lo) % lo * lo + ((x % lo) + lo) % lo];
      const smooth = (t) => t * t * (3 - 2 * t);

      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const fx = x / px * lo, fy = y / px * lo;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const tx = smooth(fx - x0), ty = smooth(fy - y0);
          const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
          const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
          const m = top * (1 - ty) + bot * ty;

          /* Mostly grime, with the occasional hard fleck of grit or rust. */
          let v = (m - 0.5) * 0.8 - 0.10;
          const roll = rand();
          if (roll < CFG.texSpeck) v -= 0.45 + rand() * 0.55;
          else if (roll < CFG.texSpeck * 1.35) v += 0.40 + rand() * 0.35;

          const i = (y * px + x) * 4;
          const dark = v < 0;
          img.data[i] = dark ? 6 : 255;
          img.data[i + 1] = dark ? 5 : 246;
          img.data[i + 2] = dark ? 4 : 226;
          img.data[i + 3] = Math.min(255, Math.abs(v) * 255 * CFG.texStrength);
        }
      }
      g.putImageData(img, 0, 0);
      return c;
    };
    this.grainCoarse = build(Math.max(2, Math.round(CFG.floorPx)));
    this.grainFine = build(Math.max(2, Math.round(CFG.finePx)));
    this.patCache = {};
    this.grainOn = CFG.texStrength > 0;
  },

  /* A surface colour with the grain already baked into it, cached.
   *
   * Filling every face twice -- once for colour, once for grain -- cost eight
   * milliseconds a frame, which is half the budget. Baking the two together and
   * keeping the result means one fill again, at the price of quantising the
   * lighting so the cache stays small. The banding that costs is not a loss:
   * at this resolution it reads as paint.
   */
  grainPattern(colour, fine) {
    const key = (fine ? 'f|' : 'c|') + colour;
    let pat = this.patCache[key];
    if (pat) return pat;
    const tile = fine ? this.grainFine : this.grainCoarse;
    const c = document.createElement('canvas');
    c.width = tile.width; c.height = tile.height;
    const g = c.getContext('2d');
    g.fillStyle = colour;
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(tile, 0, 0);
    pat = this.bctx.createPattern(c, 'repeat');
    pat._pinned = '';
    this.patCache[key] = pat;
    return pat;
  },

  /* Pin the grain to something so it does not swim: the world's is pinned to
     the world, a crawler's to the crawler. Each pattern is moved at most once
     per frame per anchor. */
  pin(pat, ox, oy, stamp) {
    if (!pat || !pat.setTransform) return pat;
    if (pat._pinned === stamp) return pat;
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]));
    pat._pinned = stamp;
    return pat;
  },

  /* The finished fill for one surface: colour, or colour-with-grain pinned to
     its anchor. */
  surface(colour, fine, ox, oy, stamp) {
    if (!this.grainOn) return colour;
    return this.pin(this.grainPattern(colour, fine), ox, oy, stamp);
  },

  /* Grid corner (gxx, gyy) at elevation h metres -> game pixels.
     The grid is turned by the camera's yaw first, which is what lets the view
     swing. No zoom term anywhere: the world has exactly one size. */
  project(s, gxx, gyy, h) {
    const cam = s.cam;
    const u = gxx * cam.cos - gyy * cam.sin;
    const v = gxx * cam.sin + gyy * cam.cos;
    return {
      x: (u - v) * (CFG.tileW / 2) - cam.ox + this.w / 2,
      y: (u + v) * (cam.tileH / 2) - h * CFG.rise - cam.oy + this.h / 2
    };
  },

  /* How far back something is, in the direction the camera is looking. Bigger
     is nearer the camera, so painting in ascending order paints back to front.
     At any yaw. */
  depth(s, gxx, gyy) {
    const cam = s.cam;
    return gxx * (cam.cos + cam.sin) + gyy * (cam.cos - cam.sin);
  },

  box(s, gx, gy, half, z0, z1) {
    const o = [[-half, -half], [half, -half], [half, half], [-half, half]];
    const top = new Array(4), bot = new Array(4);
    for (let c = 0; c < 4; c++) {
      top[c] = this.project(s, gx + o[c][0], gy + o[c][1], z1);
      bot[c] = this.project(s, gx + o[c][0], gy + o[c][1], z0);
    }
    return { top: top,
             right: [top[1], top[2], bot[2], bot[1]],
             left: [top[2], top[3], bot[3], bot[2]] };
  },

  /* Where the camera is, in the space the world is measured in. Two points on
     this line land on the same pixel, so it is both the cull test and the
     depth order -- and it swings with the view. */
  towardCamera(s, nx, ny, nz) {
    const cam = s.cam;
    const nu = nx * cam.cos - ny * cam.sin;
    const nv = nx * cam.sin + ny * cam.cos;
    return nu + nv + nz * (cam.tileH / CFG.rise);
  },

  /* One fixed light, in the WORLD rather than in the camera, so the sun does
     not spin when the view does. */
  lightOn(nx, ny, nz) {
    const len = Math.hypot(nx, ny, nz) || 1;
    const d = (nx * 0.30 + ny * -0.42 + nz * 0.86) / len;
    const lit = CFG.lightAmbient + CFG.lightDiffuse * Math.max(0, d);
    /* Stepped, not continuous: it keeps the grain cache small and it reads as
       paint rather than as a gradient. */
    return Math.round(lit * 14) / 14;
  },

  /* One posed crawler, as real boxes on real bones. */
  figure3d(s, actor, gx, gy, ground, scale) {
    const pose = poseFor(actor, s.tick);
    const bones = buildSkeleton(pose);
    const parts = figureParts(actor);
    const out = [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];

    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].part;
      const bone = bones[f.bone];
      if (!bone) continue;
      const mesh = partMesh(bone, f, scale);
      const pts = mesh.verts;
      const n8 = pts.length;
      const scr = new Array(n8);
      let cx = 0, cy = 0, cz = 0;
      for (let c = 0; c < n8; c++) {
        const q = pts[c];
        scr[c] = this.project(s, gx + q[0], gy + q[1], ground + q[2]);
        cx += q[0]; cy += q[1]; cz += q[2];
      }
      const faces = [];
      let biggest = null, biggestArea = 0;
      for (let k = 0; k < mesh.faces.length; k++) {
        const fa = mesh.faces[k];
        const a = pts[fa[0]], b2 = pts[fa[1]], c2 = pts[fa[2]];
        const ux = b2[0] - a[0], uy = b2[1] - a[1], uz = b2[2] - a[2];
        const vx = c2[0] - b2[0], vy = c2[1] - b2[1], vz = c2[2] - b2[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (this.towardCamera(s, nx, ny, nz) <= 0) continue;   /* facing away */
        const poly = new Array(fa.length);
        for (let q = 0; q < fa.length; q++) poly[q] = scr[fa[q]];
        /* A rounded limb has a lot of surfaces that never cover a whole pixel.
           Drawing them costs real time and changes nothing anyone can see. */
        let area = 0;
        for (let q = 0; q < poly.length; q++) {
          const a1 = poly[q], b1 = poly[(q + 1) % poly.length];
          area += a1.x * b1.y - b1.x * a1.y;
        }
        const lit = this.lightOn(nx, ny, nz);
        const size = Math.abs(area) * 0.5;
        if (size > biggestArea) { biggestArea = size; biggest = { pts: poly, lit: lit }; }
        if (size < CFG.minFacePx) continue;
        faces.push({ pts: poly, lit: lit });
      }
      /* Rule 4: a part that is worn is a part that is drawn. If every one of its
         faces came out too small to bother with, keep the largest anyway rather
         than letting a piece of gear silently vanish. */
      if (!faces.length && biggest) faces.push(biggest);
      if (!faces.length) continue;
      this.bounds(scr, box);
      out.push({ id: parts[i].id, slot: f.slot, item: f.item, colour: f.colour,
                 faces: faces,
                 depth: this.towardCamera(s, gx + cx / n8, gy + cy / n8, ground + cz / n8) });
    }
    /* Nearest last. Two dozen convex parts sort reliably by their middles. */
    out.sort(function (a, b) { return a.depth - b.depth; });
    return { parts: out, box: box };
  },

  bounds(pts, box) {
    for (let c = 0; c < pts.length; c++) {
      if (pts[c].x < box[0]) box[0] = pts[c].x;
      if (pts[c].y < box[1]) box[1] = pts[c].y;
      if (pts[c].x > box[2]) box[2] = pts[c].x;
      if (pts[c].y > box[3]) box[3] = pts[c].y;
    }
    return box;
  },

  /* Painter's order is back to front, which is ascending depth along whatever
     direction the camera is looking. With the view able to swing, that is no
     longer the order the cells are stored in, so everything visible goes into
     one list with its depth and the list is sorted. Crawlers and structures sit
     a hair in front of the ground they stand on, so they paint after it. */
  build(s) {
    const w = s.world, n = w.n, b = this.batch;
    this.ensure();
    b.length = 0;

    const standing = {}, sited = {};
    for (let i = 0; i < s.actors.length; i++) {
      const a = s.actors[i], key = a.y * n + a.x;
      (standing[key] || (standing[key] = [])).push(i);
    }
    if (s.camp) {
      for (let i = 0; i < s.camp.sites.length; i++) {
        const st = s.camp.sites[i], key = st.y * n + st.x;
        (sited[key] || (sited[key] = [])).push(i);
      }
    }

    const scale = CFG.actorHeight / CFG.figureNominal;

    for (let i = 0; i < w.cells.length; i++) {
      const cell = w.cells[i];
      const x = cell.x, y = cell.y;

      const top = new Array(4);
      const box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let c = 0; c < 4; c++) {
        top[c] = this.project(s, x + CORNERS[c][0], y + CORNERS[c][1],
                              cornerHeight(cell, c));
      }
      this.bounds(top, box);
      if (box[2] < 0 || box[0] > this.w || box[1] > this.h) continue;

      const baseB = this.project(s, x + 1, y, 0);
      const baseC = this.project(s, x + 1, y + 1, 0);
      const baseD = this.project(s, x, y + 1, 0);
      const baseA = this.project(s, x, y, 0);
      let low = Math.max(baseA.y, baseB.y, baseC.y, baseD.y);
      if (low > box[3]) box[3] = low;
      if (box[3] < 0) continue;

      const depth = this.depth(s, x + 0.5, y + 0.5);

      /* Which two walls of the block face the camera changes as the view
         swings, so pick the pair by which corners are lowest on screen. */
      const order = [0, 1, 2, 3].sort(function (p, q) { return top[p].y - top[q].y; });
      const near = order[3], left = order[2], right = order[1];
      const bases = [baseA, baseB, baseC, baseD];

      b.push({
        kind: 'cell', i: i, cell: cell, top: top, depth: depth,
        left: [top[near], top[left], bases[left], bases[near]],
        right: [top[near], top[right], bases[right], bases[near]],
        solid: cell.h > 0,
        cutaway: cell.cutaway === true,
        minX: box[0], minY: box[1], maxX: box[2], maxY: box[3],
        cx: (top[0].x + top[2].x) / 2, cy: (top[0].y + top[2].y) / 2
      });

      const ground = surfaceHeight(cell);

      const here = sited[i];
      if (here) {
        for (let q = 0; q < here.length; q++) {
          const site = s.camp.sites[here[q]];
          const def = STRUCT(site.structure);
          const frac = site.built ? 1 : site.progress / 100;
          const zTop = ground + Math.max(0.05, def.height_m * frac);
          const shape = this.box(s, x + 0.5, y + 0.5, def.half_width, ground, zTop);
          const sbox = this.bounds(shape.top, [Infinity, Infinity, -Infinity, -Infinity]);
          if (sbox[2] < 0 || sbox[0] > this.w || sbox[3] + CFG.rise < 0 || sbox[1] > this.h) continue;
          b.push({
            kind: 'site', i: w.cells.length + s.actors.length + here[q],
            site: site, shape: shape, solid: true, depth: depth + 0.01,
            minX: sbox[0], minY: sbox[1], maxX: sbox[2], maxY: sbox[3] + CFG.rise,
            cx: (shape.top[0].x + shape.top[2].x) / 2,
            cy: (shape.top[0].y + shape.top[2].y) / 2
          });
        }
      }

      const people = standing[i];
      if (!people) continue;
      for (let q = 0; q < people.length; q++) {
        const actor = s.actors[people[q]];
        const fig = this.figure3d(s, actor, x + 0.5, y + 0.5, ground, scale);
        const abox = fig.box;
        if (!fig.parts.length) continue;
        if (abox[2] < 0 || abox[0] > this.w || abox[3] < 0 || abox[1] > this.h) continue;
        b.push({
          kind: 'actor', i: w.cells.length + people[q],
          actor: actor, parts: fig.parts, solid: true, depth: depth + 0.02,
          minX: abox[0], minY: abox[1], maxX: abox[2], maxY: abox[3],
          cx: (abox[0] + abox[2]) / 2, cy: abox[1] + (abox[3] - abox[1]) * 0.35
        });
      }
    }

    b.sort(function (p, q) { return p.depth - q.depth; });
    s.geomDirty = false;
    return b;
  },

  /* One path, filled with the surface colour and then again with the grain --
     which costs a second fill but not a second path. */
  poly(ctx, pts, fill, grain) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (grain) { ctx.fillStyle = grain; ctx.fill(); }
  },

  /* Every polygon a thing is made of, so it can be haloed as one shape. */
  shapeOf(item) {
    if (item.kind === 'actor') {
      const out = [];
      for (let i = 0; i < item.parts.length; i++) {
        const fs = item.parts[i].faces;
        for (let g = 0; g < fs.length; g++) out.push(fs[g].pts);
      }
      return out;
    }
    if (item.kind === 'site') {
      return [item.shape.top, item.shape.left, item.shape.right];
    }
    return item.solid ? [item.top, item.left, item.right] : [item.top];
  },

  /* The highlight: the thing's own shapes, fattened by a stroke, painted in one
     colour UNDERNEATH it. The thing is then drawn on top and covers all of it
     except the ring that stuck out -- which is the silhouette, and only the
     silhouette. Internal edges never show, because they are covered. */
  halo(ctx, polys, colour, width) {
    ctx.save();
    ctx.fillStyle = colour;
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 0; i < polys.length; i++) {
      const pts = polys[i];
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  },

  outline(ctx, pts, colour) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let c = 1; c < pts.length; c++) ctx.lineTo(pts[c].x, pts[c].y);
    ctx.closePath();
    ctx.stroke();
  },

  occludes(item, focus) {
    return item.i !== focus.i
      && item.minX < focus.maxX && item.maxX > focus.minX
      && item.minY < focus.maxY && item.maxY > focus.minY;
  },

  draw(s) {
    this.ensure();
    const ctx = this.bctx, b = this.batch;
    const kinds = {};
    let drawn = 0, faded = 0, people = 0, structures = 0, cutaway = 0;
    const wornDrawn = [];

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, this.w, this.h);

    const focusIdx = s.hover >= 0 ? s.hover : s.selected;
    let focus = null, focusPos = -1;
    if (focusIdx >= 0) {
      for (let k = 0; k < b.length; k++) {
        if (b[k].i === focusIdx) { focus = b[k]; focusPos = k; break; }
      }
    }

    const items = this.recordItems ? [] : null;
    let outlined = false;

    const outlineColour = N('ui.colour_outline');
    const worldStamp = 'w' + s.cam.ox + ',' + s.cam.oy;

    for (let k = 0; k < b.length; k++) {
      const it = b[k];

      let alpha = 1;
      /* The see-through fourth wall: rock standing between you and a floor
         behind it goes translucent, so a room is never hidden by its own
         near wall. */
      if (it.kind === 'cell' && it.cutaway) { alpha = CFG.cutawayFade; cutaway++; }
      if (focus && k > focusPos && this.occludes(it, focus)) {
        alpha = Math.min(alpha, CFG.occluderFade);
        faded++;
      }

      /* The highlighted thing is never faded -- it is the one you are looking
         at -- and its halo goes down first, at full strength. */
      if (focus && k === focusPos) {
        alpha = 1;
        ctx.globalAlpha = 1;
        this.halo(ctx, this.shapeOf(it), outlineColour, CFG.outlineWidth);
        outlined = true;
      }
      ctx.globalAlpha = alpha;

      if (it.kind === 'actor') {
        /* A crawler's grain travels with them rather than sliding underneath. */
        const aStamp = 'a' + it.i + ',' + Math.round(it.minX) + ',' + Math.round(it.minY);
        for (let r = 0; r < it.parts.length; r++) {
          const pt = it.parts[r];
          for (let g = 0; g < pt.faces.length; g++) {
            this.poly(ctx, pt.faces[g].pts,
              this.surface(shade(pt.colour, pt.faces[g].lit), true,
                           it.minX, it.minY, aStamp));
          }
          if (pt.slot !== 'body') wornDrawn.push(pt.item);
        }
        people++; drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'actor', name: it.actor.name,
                       x: it.actor.x, y: it.actor.y, doing: it.actor.doing,
                       face: it.actor.face,
                       parts: it.parts.map(function (q) { return q.id; }),
                       worn: it.parts.filter(function (q) { return q.slot !== 'body'; })
                              .map(function (q) { return q.item; }),
                       faces: it.parts.reduce(function (n, q) { return n + q.faces.length; }, 0),
                       alpha: alpha, sx: it.cx, sy: it.cy });
        }
        continue;
      }

      if (it.kind === 'site') {
        const def = STRUCT(it.site.structure);
        const done = it.site.built;
        const col = done ? def.colour : shade(def.colour, 0.45);
        const sStamp = 's' + it.i + ',' + Math.round(it.minX) + ',' + Math.round(it.minY);
        const sk = (c) => this.surface(c, true, it.minX, it.minY, sStamp);
        this.poly(ctx, it.shape.left, sk(shade(col, CFG.shadeLeft)));
        this.poly(ctx, it.shape.right, sk(shade(col, CFG.shadeRight)));
        this.poly(ctx, it.shape.top, sk(col));
        if (!done) this.outline(ctx, it.shape.top, 'rgba(255,233,168,0.35)');
        structures++; drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'site', structure: it.site.structure,
                       x: it.site.x, y: it.site.y, built: done,
                       progress: it.site.progress, cleared: it.site.cleared,
                       alpha: alpha, sx: it.cx, sy: it.cy });
        }
        continue;
      }

      const def = TILE(it.cell.tile);
      const lift = Math.round((1 + it.cell.h * CFG.heightTint) * 100) / 100;
      /* Grain goes on the ground, which is most of what you look at, and on
         anything that stands on it. The two side walls of a block are in shadow
         and edge-on; grain there costs a third of the frame and reads as almost
         nothing, so they stay flat. */
      if (it.solid) {
        this.poly(ctx, it.left, shade(def.side, CFG.shadeLeft * lift));
        this.poly(ctx, it.right, shade(def.side, CFG.shadeRight * lift));
      }
      this.poly(ctx, it.top,
        this.surface(shade(def.top, lift), false, -s.cam.ox, -s.cam.oy, worldStamp));

      kinds[it.cell.tile] = (kinds[it.cell.tile] || 0) + 1;
      drawn++;
      if (items) {
        items.push({ i: it.i, kind: 'cell', x: it.cell.x, y: it.cell.y, h: it.cell.h,
                     tile: it.cell.tile, slope: it.cell.slope, cutaway: it.cutaway,
                     alpha: alpha, sx: it.cx, sy: it.cy });
      }
    }

    ctx.globalAlpha = 1;

    this.consumed = {
      tick: s.tick, count: drawn, kinds: kinds,
      people: people, structures: structures, worn: wornDrawn,
      faded: faded, cutaway: cutaway, outlined: outlined,
      focus: focusIdx, zoom: s.cam.zoom,
      bufW: this.w, bufH: this.h
    };
    if (items) this.consumed.items = items;
    s.viewDirty = false;
    return this.consumed;
  },

  /* The same scene painted flat in identity colours. Reading one pixel of it
     says exactly what the player is pointing at -- elevation, ramps, crawlers
     and half-built structures included. The only honest answer to "anything you
     can SEE" (rule 8). */
  drawPick(s) {
    this.ensure();
    const ctx = this.pctx, b = this.batch;
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.w, this.h);
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      const id = it.i + 1;
      const col = 'rgb(' + (id & 255) + ',' + ((id >> 8) & 255) + ',' + ((id >> 16) & 255) + ')';
      if (it.kind === 'actor') {
        for (let r = 0; r < it.parts.length; r++) {
          const fs = it.parts[r].faces;
          for (let g = 0; g < fs.length; g++) this.poly(ctx, fs[g].pts, col);
        }
        continue;
      }
      if (it.kind === 'site') {
        this.poly(ctx, it.shape.left, col);
        this.poly(ctx, it.shape.right, col);
        this.poly(ctx, it.shape.top, col);
        continue;
      }
      if (it.solid) { this.poly(ctx, it.left, col); this.poly(ctx, it.right, col); }
      this.poly(ctx, it.top, col);
    }
    return b.length;
  },

  /* Pick numbers run cells, then crawlers, then camp sites, so one number
     identifies anything on screen. */
  actorBase(s) { return s.world.cells.length; },
  siteBase(s) { return s.world.cells.length + s.actors.length; },
  isActorPick(s, p) { return p >= this.actorBase(s) && p < this.siteBase(s); },
  isSitePick(s, p) { return p >= this.siteBase(s); },
  actorFromPick(s, p) { return s.actors[p - this.actorBase(s)]; },
  siteFromPick(s, p) { return s.camp ? s.camp.sites[p - this.siteBase(s)] : null; },

  pickAt(s, bx, by) {
    if (!this.pick) return -1;
    const x = Math.floor(bx), y = Math.floor(by);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const d = this.pctx.getImageData(x, y, 1, 1).data;
    const id = d[0] + d[1] * 256 + d[2] * 65536;
    const max = s.world.cells.length + s.actors.length
              + (s.camp ? s.camp.sites.length : 0);
    if (id < 1 || id > max) return -1;
    return id - 1;
  }
};
