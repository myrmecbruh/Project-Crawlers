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
    if (!this.masonry) this.makeMasonry();
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

  /* ---- masonry -----------------------------------------------------------
   * A wall somebody BUILT, as opposed to rock somebody dug through: irregular
   * blocks, big ones packed among small ones, with the joints between them
   * showing dark.
   *
   * Like the grain it is an OVERLAY -- dark lines along the joints and a small
   * shade delta per stone -- so it works over any colour at any light level and
   * goes through the same cached-pattern path. It is generated, not painted,
   * and seeded, so the same wall comes back every time.
   *
   * It TILES: course heights are chosen to sum exactly to the tile height and
   * each course's stones to sum exactly to its width, so there is no seam to
   * find. A wall is a metre of pattern repeated, and a metre is 32 pixels.
   */
  makeMasonry() {
    const px = Math.max(8, Math.round(CFG.masonryPx));
    const rand = makeRand(CFG.texSeed + 4099);
    const pick = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

    /* Build the wall as a MODEL first, then draw it. The first version walked
       the randomness twice -- once to shade the stones, once to place the
       joints -- and the two walks drifted apart, so the joints did not land on
       the stones. One model, drawn once, cannot disagree with itself. */
    const courses = [];
    let left = px;
    while (left > 0) {
      let h = pick(CFG.masonryCourseMin, CFG.masonryCourseMax);
      if (left - h < CFG.masonryCourseMin) h = left;   /* swallow the remainder */
      courses.push({ h: h, y: px - left, stones: [] });
      left -= h;
    }
    for (let r = 0; r < courses.length; r++) {
      const co = courses[r];
      let x = -pick(0, px - 1);          /* a random start, so joints stagger */
      let w = px;
      while (w > 0) {
        let sw = pick(CFG.masonryStoneMin, CFG.masonryStoneMax);
        if (w - sw < CFG.masonryStoneMin) sw = w;
        co.stones.push({ x: x, w: sw, shade: (rand() - 0.5) * 2, tall: false });
        x += sw; w -= sw;
      }
    }

    /* Real rubble is not courses of equal blocks: every so often a big stone
       takes up two courses at once, and that is most of what stops this reading
       as brickwork. A tall stone SWALLOWS the ground it stands over -- the
       stones of the course below, their head joints and the bed joint between
       -- or the course below simply paints back over it and leaves stray marks
       down the middle of the big block. */
    for (const co of courses) co.covered = new Uint8Array(px);
    for (let r = 0; r + 1 < courses.length; r++) {
      for (const st of courses[r].stones) {
        if (rand() > 0.22) continue;
        st.tall = true;
        st.h = courses[r].h + courses[r + 1].h;
        const below = courses[r + 1].covered;
        for (let x = st.x; x < st.x + st.w; x++) below[((x % px) + px) % px] = 1;
      }
    }
    const buried = (co, st) => co.covered[((Math.floor(st.x + st.w / 2) % px) + px) % px];

    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.clearRect(0, 0, px, px);

    /* Each stone takes its own shade, drawn three times a tile apart so a stone
       crossing the seam is the same stone on both sides of it. */
    for (const co of courses) {
      for (const st of co.stones) {
        if (buried(co, st)) continue;
        const v = st.shade * CFG.masonryVariation;
        const dark = v < 0;
        const h = (st.tall ? st.h : co.h) - 1;
        g.fillStyle = 'rgba(' + (dark ? '18,15,12' : '255,250,238')
                    + ',' + Math.abs(v).toFixed(3) + ')';
        for (let k = -1; k <= 1; k++) {
          g.fillRect(st.x + 1 + k * px, co.y + 1, st.w - 1, h);
        }
      }
    }

    /* Then the joints, straight off the same model. A bed joint is drawn in
       segments so it can be left out under a stone that spans two courses. */
    g.fillStyle = 'rgba(14,11,9,' + Math.min(1, CFG.masonryMortar).toFixed(3) + ')';
    for (let r = 0; r < courses.length; r++) {
      const co = courses[r];
      for (const st of co.stones) {
        if (buried(co, st)) continue;
        for (let k = -1; k <= 1; k++) {
          g.fillRect(st.x + k * px, co.y, 1, st.tall ? st.h : co.h);  /* head joint */
        }
      }
      /* The bed joint along the top of this course, broken wherever a stone
         from the course above reaches down through it. */
      for (let x = 0; x < px; x++) {
        if (!co.covered[x]) g.fillRect(x, co.y, 1, 1);
      }
    }

    this.masonry = c;
    this.patCache = {};
  },

  /* A surface colour with the masonry and the grain baked into it, cached the
     same way and by the same rules. */
  masonryPattern(colour) {
    const key = 'm|' + colour;
    let pat = this.patCache[key];
    if (pat) return pat;
    const px = this.masonry.width;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.fillStyle = colour;
    g.fillRect(0, 0, px, px);
    g.drawImage(this.masonry, 0, 0);
    /* the stones keep their grit: the coarse tile is 16px into a 32px wall */
    if (this.grainOn) {
      for (let oy = 0; oy < px; oy += this.grainCoarse.height) {
        for (let ox = 0; ox < px; ox += this.grainCoarse.width) {
          g.drawImage(this.grainCoarse, ox, oy);
        }
      }
    }
    pat = this.bctx.createPattern(c, 'repeat');
    pat._pinned = '';
    this.patCache[key] = pat;
    return pat;
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

  /* Map a repeating pattern onto ONE FACE, in that face's own space, rather
     than pasting it flat across the screen.
     
     `a` is the face's top corner, `b` the far end of its top edge (wM metres
     along), `d` the corner straight down from `a` (hM metres). Both edges are
     straight lines under an isometric projection and the face is a
     parallelogram, so the map from texture space to the screen is exactly
     affine -- no perspective term is needed and none is missing.
     
     One metre of wall is one tile of texture, so the courses run along the
     wall, the stones sit on its surface, and the whole thing turns with the
     wall when the view swings. Pasted in screen space it sheared instead, and
     the stonework slid across the wall as the camera moved. */
  faceFill(pat, a, b, d, wM, hM) {
    if (!pat || !pat.setTransform) return pat;
    const px = this.masonry.width;
    const su = wM * px, sv = hM * px;
    const m = [(b.x - a.x) / su, (b.y - a.y) / su,
               (d.x - a.x) / sv, (d.y - a.y) / sv, a.x, a.y];
    pat.setTransform(new DOMMatrix(m));
    pat._lastMatrix = m;       /* kept so a test can check where it landed */
    pat._pinned = '';          /* per face now: never reuse a stale transform */
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
                 glow: f.glow > 0, faces: faces,
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
    if (s.lightDirty) computeLight(s);
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
      const light = lightAt(s, i);

      /* Which two walls of the block face the camera changes as the view
         swings, so pick the pair by which corners are lowest on screen. */
      const order = [0, 1, 2, 3].sort(function (p, q) { return top[p].y - top[q].y; });
      const near = order[3], left = order[2], right = order[1];
      const bases = [baseA, baseB, baseC, baseD];

      b.push({
        kind: 'cell', i: i, cell: cell, top: top, depth: depth, light: light,
        left: [top[near], top[left], bases[left], bases[near]],
        right: [top[near], top[right], bases[right], bases[near]],
        solid: cell.h > 0,
        wallM: cell.h,              /* how far the faces drop, in metres */
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
            site: site, shape: shape, solid: true, depth: depth + 0.01, light: light, light: light,
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
        /* Mid-stride a crawler is between two squares, so where they are drawn
           -- and how far back they paint -- comes from actorPos(), not from the
           square they are filed under. */
        const at = actorPos(s, actor);
        const fig = this.figure3d(s, actor, at.gx, at.gy, at.h, scale);
        const abox = fig.box;
        if (!fig.parts.length) continue;
        if (abox[2] < 0 || abox[0] > this.w || abox[3] < 0 || abox[1] > this.h) continue;
        b.push({
          kind: 'actor', i: w.cells.length + people[q],
          actor: actor, parts: fig.parts, solid: true,
          gx: at.gx, gy: at.gy, gh: at.h,
          depth: this.depth(s, at.gx, at.gy) + 0.02, light: light, light: light,
          minX: abox[0], minY: abox[1], maxX: abox[2], maxY: abox[3],
          cx: (abox[0] + abox[2]) / 2, cy: abox[1] + (abox[3] - abox[1]) * 0.35
        });
      }
    }

    b.sort(function (p, q) { return p.depth - q.depth; });
    s.geomDirty = false;
    this.pickStale = true;     /* the pick buffer is now a frame behind */
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

    /* A pinned selection outranks whatever the pointer happens to be over, so
       the crawler you picked stays ringed while they walk away. */
    const focusIdx = s.selected >= 0 ? s.selected : s.hover;
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
          /* A flame is not darkened by the room it is lighting. */
          const pl = pt.glow ? 1 : it.light;
          for (let g = 0; g < pt.faces.length; g++) {
            this.poly(ctx, pt.faces[g].pts,
              this.surface(litShade(pt.colour, pt.faces[g].lit, pl), true,
                           it.minX, it.minY, aStamp));
          }
          if (pt.slot !== 'body') wornDrawn.push(pt.item);
        }
        people++; drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'actor', name: it.actor.name,
                       x: it.actor.x, y: it.actor.y, doing: it.actor.doing,
                       /* where the figure actually stood on the ground this
                          frame -- fractional while the stride plays out */
                       gx: it.gx, gy: it.gy, gh: it.gh,
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
        const lit = STRUCT(it.site.structure).light > 0 && done ? 1 : it.light;
        const sk = (c, f) => this.surface(litShade(c, f, lit), true,
                                          it.minX, it.minY, sStamp);
        this.poly(ctx, it.shape.left, sk(col, CFG.shadeLeft));
        this.poly(ctx, it.shape.right, sk(col, CFG.shadeRight));
        this.poly(ctx, it.shape.top, sk(col, 1));
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
      const laid = def.pattern === 'masonry' && it.wallM > 0;
      if (it.solid) {
        /* Raw rock keeps its flat sides -- grain there costs a third of the
           frame and reads as almost nothing. A wall somebody BUILT is the
           exception: its whole point is that you can see it was laid by hand,
           so a tile carrying a pattern pays for its faces, and the stonework is
           mapped ONTO each face rather than pasted over it. */
        const lf = litShade(def.side, CFG.shadeLeft * lift, it.light);
        const rf = litShade(def.side, CFG.shadeRight * lift, it.light);
        this.poly(ctx, it.left, laid
          ? this.faceFill(this.masonryPattern(lf),
                          it.left[0], it.left[1], it.left[3], 1, it.wallM)
          : lf);
        this.poly(ctx, it.right, laid
          ? this.faceFill(this.masonryPattern(rf),
                          it.right[0], it.right[1], it.right[3], 1, it.wallM)
          : rf);
      }
      const tf = litShade(def.top, lift, it.light);
      this.poly(ctx, it.top, laid
        ? this.faceFill(this.masonryPattern(tf), it.top[0], it.top[1], it.top[3], 1, 1)
        : this.surface(tf, false, -s.cam.ox, -s.cam.oy, worldStamp));

      kinds[it.cell.tile] = (kinds[it.cell.tile] || 0) + 1;
      drawn++;
      if (items) {
        items.push({ i: it.i, kind: 'cell', x: it.cell.x, y: it.cell.y, h: it.cell.h,
                     tile: it.cell.tile, slope: it.cell.slope, cutaway: it.cutaway,
                     light: it.light, alpha: alpha, sx: it.cx, sy: it.cy });
      }
    }

    ctx.globalAlpha = 1;

    this.consumed = {
      tick: s.tick, count: drawn, kinds: kinds,
      people: people, structures: structures, worn: wornDrawn,
      faded: faded, cutaway: cutaway, outlined: outlined,
      lights: s.light ? lightSourcesIn(s).length : 0,
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
    this.pickStale = false;
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
    /* Painting the whole scene a second time in identity colours is the most
       expensive thing in a frame, and nothing reads it unless a pointer is
       actually asking. So it is repainted here, on demand, rather than after
       every rebuild -- which, now that crawlers walk and the view can ride
       one, is every single frame. */
    if (this.pickStale) this.drawPick(s);
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
