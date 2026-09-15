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
  /* Paint only the part of a side wall that stands above the block standing in
     front of it. Flipped off only by the test that paints one frame both ways
     and compares the two pictures pixel for pixel. */
  clipWalls: true,
  /* Paint a crawler part way through a step after the whole of the ground that
     step covers, so the ground can never paint over their legs. Flipped off
     only by the test that walks one stride both ways and counts how many of the
     crawler's own pixels the ground covers. */
  stepGround: true,
  cellAt: null,                /* world square -> its place in the batch (Map) */
  alphaPlan: null,             /* how strong each thing painted, this frame   */

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
    if (!this.patCache) this.patCache = {};
    if (!this.mats) this.mats = {};
  },

  /* ---- masonry -----------------------------------------------------------
   * A wall somebody BUILT, as opposed to rock somebody dug through: irregular
   * blocks, big ones packed among small ones, with the joints between them
   * showing dark.
   *
   * It is an OVERLAY -- dark lines along the joints and a small
   * shade delta per stone -- so it works over any colour at any light level and
   * goes through the same cached-pattern path. It is generated, not painted,
   * and seeded, so the same wall comes back every time.
   *
   * It TILES: course heights are chosen to sum exactly to the tile height and
   * each course's stones to sum exactly to its width, so there is no seam to
   * find. A wall is a metre of pattern repeated, and a metre is 32 pixels.
   */
  /* ---- the materials -----------------------------------------------------
   * Every surface in the labyrinth is GENERATED, not painted, and every one of
   * them is a transparent OVERLAY a metre square: dark where the stone is cut,
   * light where it catches, nothing where the base colour should show. One
   * tile is one square metre, so a material lands ON the grid rather than
   * floating over it.
   *
   * The look follows the standard dark-fantasy tile vocabulary -- flagstone,
   * cobble, dirt, moss, rubble, bone, water, raw rock -- and the rule that
   * makes such a set hang together: ONE LOCKED PALETTE, so anything you put
   * down belongs with everything else. The tiles tab holds that palette; these
   * only cut the shapes.
   */
  matTile(name) {
    if (this.mats[name]) return this.mats[name];
    const px = Math.max(8, Math.round(CFG.patternPx));
    const rand = makeRand(CFG.texSeed + name.length * 977 + 31);
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    const dark = (a) => 'rgba(16,13,11,' + Math.max(0, a).toFixed(3) + ')';
    const pale = (a) => 'rgba(255,250,238,' + Math.max(0, a).toFixed(3) + ')';
    /* a rectangle drawn three times across, so nothing is cut by the seam */
    const wrapRect = (x, y, w, h, fill) => {
      g.fillStyle = fill;
      for (let k = -1; k <= 1; k++) g.fillRect(x + k * px, y, w, h);
    };
    const speck = (n, size, fill) => {
      g.fillStyle = fill;
      for (let i = 0; i < n; i++) {
        const sx = Math.floor(rand() * px), sy = Math.floor(rand() * px);
        const w = 1 + Math.floor(rand() * size);
        g.fillRect(sx, sy, w, 1 + Math.floor(rand() * size));
        if (sx + w > px) g.fillRect(sx - px, sy, w, 1);
      }
    };

    if (name === 'masonry') { this.mats[name] = this.matMasonry(px, rand); return this.mats[name]; }

    if (name === 'flagstone') {
      /* Big cut slabs, laid square and worn at the edges. The joints are the
         whole read at this size, so they are the only strong marks. */
      const cut = [0, Math.round(px * 0.5)];
      const rows = [0, Math.round(px * 0.52)];
      for (const y of rows) {
        const off = y ? Math.round(px * 0.27) : 0;
        for (const x of cut) {
          const sx = x + off;
          wrapRect(sx, y, 1, Math.round(px * 0.5), dark(0.30));   /* the joint */
          wrapRect(sx + 1, y + 1, Math.round(px * 0.5) - 2, 1, pale(0.05));
        }
        g.fillStyle = dark(0.30); g.fillRect(0, y, px, 1);
      }
      speck(14, 2, dark(0.10));
      speck(8, 1, pale(0.07));

    } else if (name === 'rock') {
      /* Rock somebody hacked through: no courses, no joints, just fracture.
         Every crack takes its own ANGLE -- stepping them all the same way down
         the tile made regular parallel hatching, which reads as a drawn shade
         rather than as broken stone. */
      for (let i = 0; i < 30; i++) {
        let x = rand() * px, y = rand() * px;
        const a = rand() * Math.PI * 2;
        let dx = Math.cos(a), dy = Math.sin(a);
        const steps = 2 + Math.floor(rand() * (px * 0.3));
        g.fillStyle = rand() < 0.6 ? dark(0.17) : pale(0.07);
        for (let k = 0; k < steps; k++) {
          g.fillRect(((Math.round(x) % px) + px) % px, ((Math.round(y) % px) + px) % px, 1, 1);
          /* the crack wanders as it runs, the way a split in stone does */
          if (rand() < 0.3) { const t = dx; dx = dy * (rand() < 0.5 ? 1 : -1); dy = t; }
          x += dx; y += dy;
        }
      }
      speck(22, 2, dark(0.12));

    } else if (name === 'dirt') {
      /* Trodden earth: clods and small stones, no structure at all. */
      speck(46, 3, dark(0.13));
      speck(26, 2, pale(0.07));
      for (let i = 0; i < 7; i++) {                     /* the odd pebble */
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        wrapRect(x, y, 2, 2, pale(0.13));
        wrapRect(x, y + 2, 2, 1, dark(0.18));
      }

    } else if (name === 'moss') {
      /* Growth taking a floor back. A blotch is a CLUMP of little squares, not
         a circle: drawn as circles they came out as evenly spaced polka dots,
         which is the one shape nothing organic makes. */
      for (let i = 0; i < 22; i++) {
        const bx = rand() * px, by = rand() * px;
        const n = 4 + Math.floor(rand() * 10);
        g.fillStyle = rand() < 0.55 ? dark(0.15) : pale(0.09);
        for (let k = 0; k < n; k++) {
          const ox = Math.round(bx + (rand() - 0.5) * 7);
          const oy = Math.round(by + (rand() - 0.5) * 6);
          const w = 1 + Math.floor(rand() * 3), h = 1 + Math.floor(rand() * 2);
          for (let q = -1; q <= 1; q++) g.fillRect(ox + q * px, oy, w, h);
        }
      }
      speck(34, 2, dark(0.11));

    } else if (name === 'water') {
      /* Standing water: a few long soft ripples, not a scratchy hatch. Drawn
         every other row it read as scored lines rather than a surface. */
      for (let i = 0; i < 9; i++) {
        const y = Math.floor(rand() * px);
        const w = px * (0.25 + rand() * 0.45);
        const x = rand() * px;
        wrapRect(Math.round(x), y, Math.round(w), 1,
                 rand() < 0.55 ? pale(0.07) : dark(0.05));
      }
      /* and the odd bright catch where it moves */
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        wrapRect(x, y, 1 + Math.floor(rand() * 3), 1, pale(0.16));
      }

    } else if (name === 'rubble') {
      /* Collapse: angular pieces at every size, piled without order. */
      for (let i = 0; i < 34; i++) {
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        const w = 2 + Math.floor(rand() * 5), h = 2 + Math.floor(rand() * 4);
        wrapRect(x, y, w, h, rand() < 0.5 ? dark(0.16) : pale(0.09));
        wrapRect(x, y + h, w, 1, dark(0.22));          /* its shadow */
      }

    } else if (name === 'bones') {
      /* Somebody else got this far: pale splinters on a dark floor. */
      speck(30, 2, dark(0.14));
      for (let i = 0; i < 16; i++) {
        const x = Math.floor(rand() * px), y = Math.floor(rand() * px);
        const len = 2 + Math.floor(rand() * 5);
        if (rand() < 0.5) wrapRect(x, y, len, 1, pale(0.30));
        else wrapRect(x, y, 1, len, pale(0.26));
        wrapRect(x, y + 1, len, 1, dark(0.12));
      }
    }

    this.mats[name] = c;
    return c;
  },

  matMasonry(px, rand) {
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

    return c;
  },

  /* A surface colour with its material baked into it, cached: one fill, not
     two. Filling every face twice -- once for the colour, once for an overlay
     on top -- cost eight milliseconds a frame, which was half the budget. The
     price of baking is that the lighting has to be stepped so the cache stays
     small; at this resolution the banding reads as paint. */
  matPattern(colour, name) {
    const key = 'm|' + name + '|' + colour;
    let pat = this.patCache[key];
    if (pat) return pat;
    const tile = this.matTile(name);
    const px = tile.width;
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    const g = c.getContext('2d');
    g.fillStyle = colour;
    g.fillRect(0, 0, px, px);
    g.globalAlpha = Math.max(0, Math.min(1, CFG.texStrength));
    g.drawImage(tile, 0, 0);
    g.globalAlpha = 1;
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
    const px = Math.max(8, Math.round(CFG.patternPx));
    const su = wM * px, sv = hM * px;
    /* ONE matrix, reused. Allocating a DOMMatrix per face costs more than the
       fill it configures -- there are about a thousand faces in a frame. */
    const dm = this._faceM || (this._faceM = new DOMMatrix());
    dm.a = (b.x - a.x) / su; dm.b = (b.y - a.y) / su;
    dm.c = (d.x - a.x) / sv; dm.d = (d.y - a.y) / sv;
    dm.e = a.x; dm.f = a.y;
    pat.setTransform(dm);
    /* kept as plain numbers so a test can check where the texture landed */
    pat._lastMatrix = [dm.a, dm.b, dm.c, dm.d, dm.e, dm.f];
    pat._pinned = '';          /* per face now: never reuse a stale transform */
    return pat;
  },

  /* Pin a material to the world so it does not swim as the view moves. Each
     pattern is moved at most once per frame per anchor. */
  pin(pat, ox, oy, stamp) {
    if (!pat || !pat.setTransform) return pat;
    if (pat._pinned === stamp) return pat;
    pat.setTransform(new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]));
    pat._pinned = stamp;
    return pat;
  },

  /* The finished fill for one surface: a plain colour unless the tile names a
     material, in which case the material pinned to the world.
     
     A material on the GROUND is pinned: one transform per pattern per frame.
     Anchoring it to each square instead cost 16ms a frame for 350 squares, and
     a floor is flat -- it has no direction to get wrong. A WALL does, which is
     why walls get faceFill() instead. */
  surface(colour, ox, oy, stamp, mat) {
    if (!mat || CFG.texStrength <= 0) return colour;
    return this.pin(this.matPattern(colour, mat), ox, oy, stamp);
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
    /* Stepped, not continuous: it keeps the pattern cache small and it reads as
       paint rather than as a gradient. */
    return Math.round(lit * 14) / 14;
  },

  /* One piece of the camp, as real geometry rather than a box.
   *
   * Same lathe as a crawler's parts -- the sheet columns are the same -- but a
   * part hangs at an offset from the SQUARE instead of off a bone, with its own
   * lean and spin, so a log can lie across a fire and a mat can lie flat.
   *
   * `frac` is how far the thing has been built. A part marked `grows` rises out
   * of the floor as the work goes on, which is how you can SEE how far a camp
   * has got; a part that does not grow (a flame, a lid, a blanket) simply is not
   * there until the job is done.
   */
  structure3d(s, site, def, gx, gy, ground, frac) {
    const parts = STRUCT_PARTS(site.structure);
    const out = [];
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    const done = frac >= 1;

    for (let i = 0; i < parts.length; i++) {
      const f = parts[i].part;
      if (!f.grows && !done) continue;
      const rise = f.grows && !done ? Math.max(0.08, frac) : 1;
      /* Lean tips the lathe over, spin turns it about the upright. */
      const bone = { p: [f.x, f.y, (f.z + ground) / 1], m: matMul(matRotZ(f.spin * DEG),
                                                                  matRotX(f.lean * DEG)) };
      const shrunk = { from_m: f.from_m * rise, to_m: f.to_m * rise,
                       w_top: f.w_top, w_bot: f.w_bot, d_top: f.d_top, d_bot: f.d_bot,
                       sides: f.sides, rings: f.rings, bulge: f.bulge,
                       cap_top: f.cap_top, cap_bot: f.cap_bot, ox: 0, oy: 0 };
      const mesh = partMesh({ p: [f.x, f.y, f.z * rise], m: bone.m }, shrunk, 1);
      const pts = mesh.verts, n8 = pts.length;
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
        if (this.towardCamera(s, nx, ny, nz) <= 0) continue;
        const poly = new Array(fa.length);
        for (let q = 0; q < fa.length; q++) poly[q] = scr[fa[q]];
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
      if (!faces.length && biggest) faces.push(biggest);
      if (!faces.length) continue;
      this.bounds(scr, box);
      out.push({ id: parts[i].id, colour: f.colour, glow: f.glow > 0, faces: faces,
                 depth: this.towardCamera(s, gx + cx / n8, gy + cy / n8,
                                          ground + cz / n8) });
    }
    out.sort(function (a, b) { return a.depth - b.depth; });
    return { parts: out, box: box };
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

  /* How much of the picture a face covers, for the tests that have to prove the
     buried walls really are gone rather than take it on trust. */
  area(pts) {
    let sum = 0;
    for (let c = 0; c < pts.length; c++) {
      const p = pts[c], q = pts[(c + 1) % pts.length];
      sum += p.x * q.y - q.x * p.y;
    }
    return Math.abs(sum) / 2;
  },

  /* Could any of a piece's ground reach the picture?
   *
   * The world the game HOLDS is a window of pieces (see 12-world.js), and the
   * window is far bigger than the screen -- a ring of ground kept ready either
   * side of it -- so asking 3136 squares of every live piece whether they show
   * is most of the work of a frame, and almost all of the answer is no.
   *
   * A piece is one box of ground seen through the same projection its squares
   * are, so its four corners at ground level and at the tallest a square can
   * stand fence it in: every square of the piece lies inside that shape, which
   * is what the camera can see pulled back through a straight-edged change of
   * coordinates. So it is eight points to ask about instead of 3136, and a piece
   * that misses the screen simply is not walked.
   *
   * This decides nothing about how anything LOOKS: a piece that is walked goes
   * through exactly the loop it always did, and a piece that is not walked had
   * every one of its squares culled a moment later anyway. */
  pieceOnScreen(s, p) {
    const tall = CFG.maxElev + CFG.rockHeight;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let c = 0; c < 4; c++) {
      const x = p.ox + CORNERS[c][0] * p.n, y = p.oy + CORNERS[c][1] * p.n;
      for (let k = 0; k < 2; k++) {
        const q = this.project(s, x, y, k ? tall : 0);
        if (q.x < minX) minX = q.x;
        if (q.y < minY) minY = q.y;
        if (q.x > maxX) maxX = q.x;
        if (q.y > maxY) maxY = q.y;
      }
    }
    return !(maxX < 0 || minX > this.w || maxY < 0 || minY > this.h);
  },

  /* Painter's order is back to front, which is ascending depth along whatever
     direction the camera is looking. With the view able to swing, that is no
     longer the order the cells are stored in, so everything visible goes into
     one list with its depth and the list is sorted. Crawlers and structures sit
     a hair in front of the ground they stand on, so they paint after it.

     The ground is walked a PIECE at a time rather than a square at a time, so
     the pieces nowhere near the screen are skipped without their squares ever
     being projected (see pieceOnScreen). Each square still carries the number
     of its place in the list of every live square, because that number is what
     the pointer reads back off the pick buffer. */
  build(s) {
    const w = s.world, b = this.batch;
    this.ensure();
    if (s.lightDirty) computeLight(s);
    b.length = 0;

    /* What is standing on which square, keyed by the square itself rather than
       by a number worked out from where it is -- which is also what keeps two
       pieces from ever colliding in the same key. */
    const standing = new Map(), sited = new Map();
    for (let i = 0; i < s.actors.length; i++) {
      const a = s.actors[i], cell = w.at(a.x, a.y);
      if (!cell) continue;
      const list = standing.get(cell);
      if (list) list.push(i); else standing.set(cell, [i]);
    }
    if (s.camp) {
      for (let i = 0; i < s.camp.sites.length; i++) {
        const st = s.camp.sites[i], cell = w.at(st.x, st.y);
        if (!cell) continue;
        const list = sited.get(cell);
        if (list) list.push(i); else sited.set(cell, [i]);
      }
    }

    const scale = CFG.actorHeight / CFG.figureNominal;

    for (let pi = 0; pi < w.live.length; pi++) {
      const piece = w.live[pi];
      if (!this.pieceOnScreen(s, piece)) continue;
      const first = piece.firstCell;
      const cells = piece.cells;
      for (let li = 0; li < cells.length; li++) {
        const cell = cells[li];
        const i = first + li;
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
        const light = lightAt(s, cell);

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
          /* The corner both faces hang from, and the far corner of each face, so
             the clip below can tell which of the four edges a face stands on.
             Then the wall cut down to the block in front: see clipFaces(). */
          near: near, cornerL: left, cornerR: right,
          nbrL: -1, nbrR: -1, cutL: null, cutR: null, cutML: 0, cutMR: 0,
          cutaway: cell.cutaway === true,
          minX: box[0], minY: box[1], maxX: box[2], maxY: box[3],
          cx: (top[0].x + top[2].x) / 2, cy: (top[0].y + top[2].y) / 2
        });

        const ground = surfaceHeight(cell);

        const here = sited.get(cell);
        if (here) {
          for (let q = 0; q < here.length; q++) {
            const site = s.camp.sites[here[q]];
            const def = STRUCT(site.structure);
            const frac = site.built ? 1 : site.progress / 100;
            const fig = this.structure3d(s, site, def, x + 0.5, y + 0.5, ground, frac);
            if (!fig.parts.length) continue;
            const sbox = fig.box;
            if (sbox[2] < 0 || sbox[0] > this.w || sbox[3] < 0 || sbox[1] > this.h) continue;
            b.push({
              kind: 'site', i: w.cells.length + s.actors.length + here[q],
              site: site, parts: fig.parts, solid: true, depth: depth + 0.01, light: light,
              minX: sbox[0], minY: sbox[1], maxX: sbox[2], maxY: sbox[3],
              cx: (sbox[0] + sbox[2]) / 2, cy: sbox[1] + (sbox[3] - sbox[1]) * 0.4
            });
          }
        }

        const people = standing.get(cell);
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
          /* HOW FAR BACK A WALKING CRAWLER PAINTS. Mid-stride the feet are
             already inside the square ahead and already outside the square
             behind, so ordering by the feet alone hands the step to whichever of
             those two squares is the nearer one, and it paints over their legs
             for half of every stride. A crawler therefore paints after the whole
             of the ground their step covers -- the square they left, the square
             they are arriving at, and the feet in between. Rock genuinely
             standing in front is nearer than all three and still covers them.
             Standing still, the feet are back on the middle of one square and
             this changes nothing at all. */
          let stride = this.depth(s, at.gx, at.gy);
          if (this.stepGround && actor.moveT < 1) {
            stride = Math.max(stride,
                              this.depth(s, actor.fromX + 0.5, actor.fromY + 0.5),
                              this.depth(s, actor.x + 0.5, actor.y + 0.5));
          }
          b.push({
            kind: 'actor', i: w.cells.length + people[q],
            actor: actor, parts: fig.parts, solid: true,
            gx: at.gx, gy: at.gy, gh: at.h,
            depth: stride + 0.02, light: light, light: light,
            minX: abox[0], minY: abox[1], maxX: abox[2], maxY: abox[3],
            cx: (abox[0] + abox[2]) / 2, cy: abox[1] + (abox[3] - abox[1]) * 0.35
          });
        }
      }
    }

    b.sort(function (p, q) { return p.depth - q.depth; });

    /* Where each square ended up. A wall may only be cut down when the block it
       faces is painted after it, and that is not known until the whole list is
       in painter's order. */
    let at = this.cellAt;
    if (!at) at = this.cellAt = new Map();
    at.clear();
    for (let k = 0; k < b.length; k++) if (b[k].kind === 'cell') at.set(b[k].cell, k);
    for (let k = 0; k < b.length - 1; k++) {
      const it = b[k];
      if (it.kind !== 'cell' || !it.solid) continue;
      /* A block with a ramp in it is drawn from its two lowest corners, which
         are not always the two faces it shows, so a ramp keeps its whole wall. */
      if (it.cell.slope !== SLOPE_FLAT) continue;
      this.clipFaces(w, it, k, at);
    }

    s.geomDirty = false;
    this.pickStale = true;     /* the pick buffer is now a frame behind */
    return b;
  },

  /* Cut a block's two side walls down to where the square standing in front of
     it reaches.
     *
     * A face stands on the edge it shares with that square. Where the square is
     * a block at least as tall as this one -- which rock is, and rock is most
     * of what is on screen -- the whole face is inside it: that block's own top
     * and its two near sides are painted over the same edge a moment later, so
     * not one of those pixels can be seen. What does show is cut down to where
     * the two blocks meet, and a face cut away to nothing is not painted at
     * all.
     *
     * Only a FLAT, full-height neighbour qualifies. A flat block is a plain box
     * whose top and two near sides are exactly what it shows, so it certainly
     * covers everything it hides. A ramp is drawn from its two lowest corners,
     * which are not always the two faces it shows; a floor or a pit is too low
     * to hide anything.
     *
     * The cut is only allowed while that block PAINTS SOLID, and that is not
     * known until draw() -- fade it, because you are inspecting something
     * behind it, and the whole face has to come back or the fade would open a
     * hole. So both shapes are worked out here and draw() picks between them. */
  clipFaces(w, it, k, at) {
    const cell = it.cell, x = cell.x, y = cell.y;
    for (let f = 0; f < 2; f++) {
      const other = f === 0 ? it.cornerL : it.cornerR;
      /* Which of the four edges the face stands on, named by the corner it runs
         from: one of the two corners it hangs between is the near corner. */
      const e = other === (it.near + 1) % 4 ? it.near : other;
      const nbr = w.at(x + EDGE_STEP[e][0], y + EDGE_STEP[e][1]);
      if (!nbr) continue;      /* nothing there: no piece, so no block in front */
      const nk = at.get(nbr);
      /* Not on screen, or painted before this face: either way there is nothing
         standing in front of it to hide it. */
      if (nk === undefined || nk <= k) continue;
      if (nbr.slope !== SLOPE_FLAT || nbr.h <= 0) continue;
      /* Where the two blocks meet, and never longer than our own wall: a cut
         that ended up above it would paint outside the block. */
      const meet = Math.min(cell.h, nbr.h);
      if (f === 0) {
        it.nbrL = nk;
        it.cutML = cell.h - meet;
        it.cutL = meet < cell.h ? this.cutWall(it.left, it.top[it.near], it.top[other], meet) : null;
      } else {
        it.nbrR = nk;
        it.cutMR = cell.h - meet;
        it.cutR = meet < cell.h ? this.cutWall(it.right, it.top[it.near], it.top[other], meet) : null;
      }
    }
  },

  /* The same wall, cut off at `meet` metres. Screen x does not depend on height
     and screen y moves render.rise pixels per metre, so the cut-off foot is the
     wall's own foot, raised -- no need to project anything again. */
  cutWall(quad, topNear, topOther, meet) {
    return [topNear, topOther,
            { x: quad[2].x, y: quad[2].y - meet * CFG.rise },
            { x: quad[3].x, y: quad[3].y - meet * CFG.rise }];
  },

  /* One path, one fill. */
  poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  },

  /* Every polygon a thing is made of, so it can be haloed as one shape. */
  shapeOf(item) {
    /* A crawler and a piece of the camp are both made of parts now, so one
       path rings either of them. */
    if (item.parts) {
      const out = [];
      for (let i = 0; i < item.parts.length; i++) {
        const fs = item.parts[i].faces;
        for (let g = 0; g < fs.length; g++) out.push(fs[g].pts);
      }
      return out;
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

  /* How strong every item paints this frame, worked out in one place.
   *
   * Two things make something see-through: the fourth wall of a room -- rock
   * standing between you and the floor behind it -- and whatever stands between
   * you and the thing you are inspecting. That second one is why the walls cut
   * down in clipFaces() are chosen between HERE and not in build(): selection
   * and hover are decided after the shapes are worked out and do not dirty them,
   * so a wall would be cut out of a picture that no longer fades the block
   * hiding it.
   *
   * The list is reused between frames: one picture, one allocation. */
  alphas(s, b) {
    const plan = this.alphaPlan || (this.alphaPlan =
      { list: [], focus: null, focusPos: -1, focusIdx: -1, faded: 0, cutaway: 0 });
    const list = plan.list;
    /* A pinned selection outranks whatever the pointer happens to be over, so
       the crawler you picked stays ringed while they walk away. */
    const focusIdx = s.selected >= 0 ? s.selected : s.hover;
    let focus = null, focusPos = -1;
    if (focusIdx >= 0) {
      for (let k = 0; k < b.length; k++) {
        if (b[k].i === focusIdx) { focus = b[k]; focusPos = k; break; }
      }
    }
    let faded = 0, cutaway = 0;
    list.length = b.length;
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
      /* The highlighted thing is never faded -- it is the one you are looking at. */
      if (focus && k === focusPos) alpha = 1;
      list[k] = alpha;
    }
    plan.focus = focus; plan.focusPos = focusPos; plan.focusIdx = focusIdx;
    plan.faded = faded; plan.cutaway = cutaway;
    return plan;
  },

  draw(s) {
    this.ensure();
    const ctx = this.bctx, b = this.batch;
    const kinds = {};
    let drawn = 0, people = 0, structures = 0;
    let walls = 0, wallPx = 0, buried = 0;
    const wornDrawn = [];

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#06080b';
    ctx.fillRect(0, 0, this.w, this.h);
    /* changes whenever the view does, which is when the anchors must be redone */
    this._frameStamp = s.cam.ox + ',' + s.cam.oy + ',' + s.cam.yaw + ',' + s.cam.tileH;

    /* How strong everything paints this frame, worked out in one place: the
       wall cut down in build() is only safe while the block hiding it paints
       solid, and two copies of that rule would disagree the first time either
       changed. */
    const plan = this.alphas(s, b);
    const alphaOf = plan.list, focus = plan.focus, focusPos = plan.focusPos;
    const focusIdx = plan.focusIdx, faded = plan.faded, cutaway = plan.cutaway;

    const items = this.recordItems ? [] : null;
    let outlined = false;

    const outlineColour = N('ui.colour_outline');
    const worldStamp = 'w' + s.cam.ox + ',' + s.cam.oy;

    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      const alpha = alphaOf[k];

      /* The highlighted thing is never faded -- it is the one you are looking
         at -- and its halo goes down first, at full strength. */
      if (focus && k === focusPos) {
        ctx.globalAlpha = 1;
        this.halo(ctx, this.shapeOf(it), outlineColour, CFG.outlineWidth);
        outlined = true;
      }
      ctx.globalAlpha = alpha;

      if (it.kind === 'actor') {
        for (let r = 0; r < it.parts.length; r++) {
          const pt = it.parts[r];
          /* A flame is not darkened by the room it is lighting. */
          const pl = pt.glow ? 1 : it.light;
          for (let g = 0; g < pt.faces.length; g++) {
            this.poly(ctx, pt.faces[g].pts, litShade(pt.colour, pt.faces[g].lit, pl));
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
        const done = it.site.built;
        /* A fire lights itself once it is burning. */
        const lit = STRUCT(it.site.structure).light > 0 && done ? 1 : it.light;
        for (let k = 0; k < it.parts.length; k++) {
          const pt = it.parts[k];
          /* Unfinished work is drawn dim: the shape is there, the thing is not
             yet. A flame is never dimmed -- it IS the light. */
          const col = pt.glow || done ? pt.colour : shade(pt.colour, 0.55);
          const pl = pt.glow ? 1 : lit;
          for (let g = 0; g < pt.faces.length; g++) {
            this.poly(ctx, pt.faces[g].pts, litShade(col, pt.faces[g].lit, pl));
          }
        }
        structures++; drawn++;
        if (items) {
          items.push({ i: it.i, kind: 'site', structure: it.site.structure,
                       x: it.site.x, y: it.site.y, built: done,
                       progress: it.site.progress, cleared: it.site.cleared,
                       parts: it.parts.map(function (q) { return q.id; }),
                       alpha: alpha, sx: it.cx, sy: it.cy });
        }
        continue;
      }

      const def = TILE(it.cell.tile);
      const lift = Math.round((1 + it.cell.h * CFG.heightTint) * 100) / 100;
      /* Every tile may name its own material; blank is plain colour.
       *
       * Only a DIRECTIONAL material is mapped onto the vertical faces, and
       * masonry is the only one: courses have to run along the wall. Fracture,
       * dirt and moss have no direction to get wrong, so they take the cheap
       * pinned path on the top and leave the sides flat -- which is what this
       * project already decided about rock, for the same reason.
       *
       * Measured: mapping a material onto a face costs about 50 microseconds.
       * Giving raw rock a mapped material meant 686 of them a frame and took
       * drawing from 8.7ms to 43ms. Masonry walls are ~100 cells, and cheap. */
      const mat = def.pattern;
      const laid = mat === 'masonry' && it.wallM > 0;
      if (it.solid) {
        /* Raw rock keeps its flat sides: they are in shadow and edge-on, so a
           texture there reads as almost nothing and costs a third of the frame.
           A wall somebody BUILT is the exception: its whole point is that you
           can see it was laid by hand,
           so a tile carrying a pattern pays for its faces, and the stonework is
           mapped ONTO each face rather than pasted over it. */
        const lf = litShade(def.side, CFG.shadeLeft * lift, it.light);
        const rf = litShade(def.side, CFG.shadeRight * lift, it.light);
        /* A wall cut down where the block in front hides it -- but only while
           that block really does paint solid. Fade it and the whole wall has to
           come back, or the fade would open a hole, so the choice is made here
           rather than in build(). */
        const hideL = this.clipWalls && it.nbrL >= 0 && alphaOf[it.nbrL] === 1;
        const hideR = this.clipWalls && it.nbrR >= 0 && alphaOf[it.nbrR] === 1;
        const qL = hideL ? it.cutL : it.left;
        const qR = hideR ? it.cutR : it.right;
        /* The wall is only as tall as the cut left it, or the stonework would
           stretch and the courses would not line up with the block's own. */
        const mL = hideL ? it.cutML : it.wallM;
        const mR = hideR ? it.cutMR : it.wallM;
        /* flat sides for everything that is not laid masonry */
        if (qL) {
          this.poly(ctx, qL, laid
            ? this.faceFill(this.matPattern(lf, mat), qL[0], qL[1], qL[3], 1, mL)
            : lf);
          walls++; wallPx += this.area(qL);
        } else buried++;
        if (qR) {
          this.poly(ctx, qR, laid
            ? this.faceFill(this.matPattern(rf, mat), qR[0], qR[1], qR[3], 1, mR)
            : rf);
          walls++; wallPx += this.area(qR);
        } else buried++;
      }
      const tf = litShade(def.top, lift, it.light);
      this.poly(ctx, it.top,
        this.surface(tf, -s.cam.ox, -s.cam.oy, worldStamp, mat));

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
      /* Side walls only: how many were painted, how much picture they covered,
         and how many were buried in the block in front and not painted at all. */
      walls: walls, wallPx: Math.round(wallPx), buried: buried,
      lights: s.lit ? lightSourcesIn(s).length : 0,
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
        for (let r = 0; r < it.parts.length; r++) {
          const fs = it.parts[r].faces;
          for (let g = 0; g < fs.length; g++) this.poly(ctx, fs[g].pts, col);
        }
        continue;
      }
      if (it.solid) {
        /* Nothing is faded in this picture, so a wall cut down for a block that
           is painted solid here can always be left out: the block's own faces
           paint that part of the buffer instead, and the last thing to paint a
           pixel is the block you are pointing at (rule 8). */
        const qL = it.nbrL >= 0 ? it.cutL : it.left;
        const qR = it.nbrR >= 0 ? it.cutR : it.right;
        if (qL) this.poly(ctx, qL, col);
        if (qR) this.poly(ctx, qR, col);
      }
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
