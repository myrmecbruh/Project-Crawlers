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
/* Which of a material's pictures a surface wears is folded down from the
 * square's coordinates and one of these, so the same square always picks the
 * same picture and two surfaces standing on it need not agree: a block's left
 * side, its right side, and the ground it stands on are three different surfaces
 * and are salted apart. See Render.pickFor(). */
const PICK_GROUND = 1, PICK_LEFT = 2, PICK_RIGHT = 3;

/* What is behind everything the picture does not paint: the dark the labyrinth
 * is cut out of. One name for it because it is what the whole picture is laid
 * onto, and every wall that fades away at the top fades into it wherever there
 * is nothing else behind. */
const BACKDROP = '#06080b';

const Render = {
  w: 0, h: 0,                  /* the picture, in game pixels              */
  buf: null, bctx: null,
  /* The pick buffer: the scene painted flat in identity colours. The game no
     longer reads it -- pickAt() works the answer out arithmetically -- but the
     battery still paints it as the yardstick the arithmetic answer is proved
     against, so it is built and sized like any other buffer. */
  pick: null, pctx: null,
  batch: [],
  consumed: null,
  recordItems: false,
  /* Paint only the part of a side wall that stands above the block standing in
     front of it. Flipped off only by the test that paints one frame both ways
     and compares the two pictures pixel for pixel. */
  clipWalls: true,
  /* THE TOP OF A WALL IS NOT PAINTED. A block stone_block or stone_wall carries
     a cap exactly as a floor does, and that cap was how every wall in the
     labyrinth got a stone lid: rows and rows of them laid out across the top of
     the rock, reading as tiling and hiding the shape of the thing underneath.
     A wall's top is a surface nobody in the game ever stands on, so it comes out
     of the picture -- cap, material and all it cost.

     Gated on the tile's FOOTING, not on `solid`. A ramp is solid too (its square
     has height), and its top face is the slope a crawler climbs: deleting that
     would delete the route.

     This is the A/B control for the new look. True paints the old picture -- the
     yardstick the change is proved against, in one build, exactly as `clipWalls`
     and `stepGround` are. */
  wallCaps: false,
  /* WHAT IS PAINTED WHERE THE LID WAS: the rock itself, flat, with no material
     on it, lit by the same light the block's own faces are lit by. So the top of
     a wall is the rock the wall is cut out of rather than a stone lid, there is
     nothing laid across it that reads as tiling, and a wall's face dissolves into
     it at the top instead of into a cap.

     It has to be SOMETHING. A block inside a mass of rock has no faces of its
     own painted -- `clipFaces()` culls a face whose neighbour in front is at
     least as tall -- and what covered that square was the neighbour's own cap.
     Caps gone and nothing in their place left the mass a LATTICE OF HOLES: the
     campfire's neighbours going transparent, and the gaps at hidden corner
     blocks, were both this, and hiding the walls by taking their tops away is
     what made them. Flat rock closes it, without bringing the lid back.

     False is the picture v0.37.0 shipped -- caps gone and nothing in their place
     -- which is the negative control this is proved against, in one build. */
  wallBody: true,
  /* THE TOP METRE OF A WALL FADES AWAY TO NOTHING, which is what turns the edges
     the caps used to draw into soft steps instead of a staircase of hard lines.
     The band WEARS THE WALL'S OWN MATERIAL and dissolves it -- the stonework runs
     on up the wall and goes see-through, rather than the material stopping dead
     at the bottom of the band. See wallBand() and paintSide(). `fadeBand()` is
     the flat fallback, for a wall whose material is switched off or is not mapped
     onto faces at all. */
  wallFade: true,
  /* THE STRIP A DELETED LID USED TO COVER, painted back -- see `lipShown()`.
     True is the picture the game ships; false is the negative control that fills
     the same frame with the holes the strips were needed for. */
  wallLips: true,
  /* The fourth wall, and what became of it.

     Rock standing between the camera and a floor behind it is what stops a
     dungeon crawler from being a wall of rock with a room hidden behind it, and
     this game has opened that rock since it had rooms. It opened it by FADING
     it: the near wall was painted at `cutaway_fade` alpha so the room could be
     seen through a haze.

     The haze was the bug. Rock is not the only thing standing on a square -- a
     crawler, a bedroll, a store are things the ground is drawn around -- so a
     look that asked "what is in front of this" by comparing the BOX each thing
     is stored with made the tiles either side of the campfire go see-through the
     moment the pointer touched the fire.

     The rule now is that NOTHING is ever drawn see-through. Rock in the way is
     simply not painted: the room is seen through the gap it leaves, and every
     thing that IS painted is painted solid. `cut_solid` is how solid that rock
     stays -- 1 draws it like any other rock, so the room hides behind it; 0 is
     the gap; anything in between is the haze this replaced. A gap is not the
     whole story, though: what is seen through it is a room and not the ground at
     the foot of the column, so a hidden block keeps `cut_stump_m` of itself
     standing. See stumpOf() for why one metre is the number.

     Five other looks were built as real code, photographed, and put in front of
     somebody to choose from: a low wall left standing where the rock was (kerb),
     an outline with the middle left out (edge), a checkerboard (dither), slats
     (lattice), and rock that opens only where you point at it (ask). The gap was
     chosen. They are gone, with the machinery that could draw them -- and the
     lesson worth keeping is the one above: reading a stored BOX as "what covers
     this" is what made the ground beside the fire see-through, and no amount of
     alpha can be right for a thing the ground is drawn around. */
  /* Paint a crawler part way through a step after the whole of the ground that
     step covers, so the ground can never paint over their legs. Flipped off
     only by the test that walks one stride both ways and counts how many of the
     crawler's own pixels the ground covers. */
  stepGround: true,
  /* Lay each material ON the ground it lies on, in the ground's own plane,
     instead of pasting it flat across the screen. Flipped off only by the tests
     that paint one frame both ways: pasting it flat is how the picture used to
     be made, and the old way is kept as the yardstick the mapped way is proved
     against. See ground().

     Named for what is ON, not for what goes away, so that reading the flag and
     reading the code below it cannot disagree: on means mapped. */
  mappedGround: true,
  /* Lay each material on the SIDES of a block too, in the face's own plane,
     instead of leaving them flat colour. Flipped off only by the tests that
     paint one frame both ways: flat sides are how the picture used to be made,
     and the old way is kept as the yardstick the mapped way is proved against.
     See wall().

     Named for what is ON, like mappedGround. */
  mappedWalls: true,
  /* Compose each material out of the pictures somebody dropped into
     textures/<material>/ instead of generating it. On means a dropped-in
     picture IS the surface; off means the generated tile, which is the way the
     game looked before anybody dropped one in.
     
     Flipped off only by the test that paints one frame both ways and compares
     the two pictures -- a builder with no consumer looks exactly like working
     code, and so does a folder somebody has put pictures in. Named for what is
     ON, like mappedGround. */
  pictures: true,
  /* A square of ground may only skip its own placement while the pattern still
     carries THAT floor's plane. A ramp at the same height is mapped from its own
     sloped corners and shares the pattern, so it takes the plane away from every
     square laid after it -- which is what put a floor square's picture down
     3x taller along one edge, in a run, wherever a ramp was drawn first.
     Flipped off only by the test that paints one frame each way and counts:
     skipping on the stamp alone is how it was, and the skew it leaves is the
     yardstick this is proved against.

     Named for what is ON, like mappedGround. */
  ownPlane: true,
  _xformSeq: 0,                /* bumped by anything that sets a transform  */
  planes: {},                  /* floor height -> its ground plane, this frame */
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
      /* The picture's buffer is opaque, as it always was: nothing in it is ever
         half-erased. The top of a wall fades by being painted with its own
         colour half-transparent -- see fadeBand() -- so transparency is decided
         by the paint, not by a hole in the buffer. */
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
    if (!this.pics) this.pics = {};
  },

  /* Throw away every material baked so far: the generated tiles, the tiles
     composed from dropped-in pictures, and every shaded pattern of either.
     
     Called when the pictures finish decoding -- everything baked before them was
     baked without them -- and by the tests that paint one frame each way. */
  forgetMaterials() {
    this.mats = {};
    this.pics = {};
    this.patCache = {};
  },

  /* Will this material be a picture rather than a generated tile? Asked once per
     square of ground and twice per block in a frame, so it counts nothing and
     does no work. */
  drawn(name) {
    return !!(this.pictures && name && Textures.live[name]);
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
      /* Natural rock somebody hacked through -- the face you get when a hall is
         cut: no courses and no joints, just a mottled, gritty stone.
       *
       * It is built at THREE SCALES, and it needs all three. What stood here
       * was thirty wandering one-pixel cracks and nothing else, and at a metre
       * to the tile that is a fifth of the surface covered in hairlines: it
       * reads as hatching, a drawn shade, rather than as stone. Real rock has
       * no lines in it -- it has grain, lumps, and the odd split.
       *
       *   1. GRAIN -- a dense dust of single pixels both ways. This is what
       *      makes it read as stone rather than as a painted tone, and it is
       *      the part you notice when you are close to the wall.
       *   2. MOTTLING -- soft clumps of that grain, dark and light, so the
       *      surface has lumps and hollows instead of an even tone. Clumps
       *      again, never circles: a circle is the one shape stone does not
       *      make, and evenly spaced rounds read as polka dots.
       *   3. CREVICES -- a HANDFUL of short dark splits. Only a handful. The
       *      count is the whole difference between cracked stone and a hatch.
       *
       * All of it is isotropic on purpose: this material goes on the ground a
       * block stands on AND on the sides of the block, and unlike masonry it
       * has no grain direction that could be turned the wrong way on one of
       * them. */
      speck(96, 1, dark(0.06));
      speck(72, 1, pale(0.06));
      for (let i = 0; i < 16; i++) {
        const bx = rand() * px, by = rand() * px;
        const n = 5 + Math.floor(rand() * 12);
        const lit = rand() < 0.45;
        g.fillStyle = lit ? pale(0.11) : dark(0.12);
        for (let k = 0; k < n; k++) {
          const ox = Math.round(bx + (rand() - 0.5) * 11);
          const oy = Math.round(by + (rand() - 0.5) * 11);
          const w = 1 + Math.floor(rand() * 3), h = 1 + Math.floor(rand() * 3);
          for (let q = -1; q <= 1; q++) g.fillRect(ox + q * px, oy, w, h);
        }
      }
      for (let i = 0; i < 6; i++) {
        let x = rand() * px, y = rand() * px;
        const a = rand() * Math.PI * 2;
        let dx = Math.cos(a), dy = Math.sin(a);
        const steps = 3 + Math.floor(rand() * (px * 0.22));
        for (let k = 0; k < steps; k++) {
          g.fillStyle = dark(0.20 + rand() * 0.06);
          const sx = ((Math.round(x) % px) + px) % px, sy = ((Math.round(y) % px) + px) % px;
          for (let q = -1; q <= 1; q++) g.fillRect(sx + q * px, sy, 1, 1);
          /* the split wanders as it runs, the way a crack in stone does */
          if (rand() < 0.35) { const t = dx; dx = dy * (rand() < 0.5 ? 1 : -1); dy = t; }
          x += dx; y += dy;
        }
      }

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

  /* A material somebody DREW, rather than one the game generates: the pictures
     dropped into textures/<name>/, inlined into the page by build.py.

     ONE canvas per picture, each squared up to exactly one square metre -- and a
     square metre wears one of them, chosen from WHERE THE SQUARE IS (see
     pickFor) rather than by laying them out in a grid. Laid out in a grid, nine
     pictures of dirt made a three-metre tile, and what you saw was the tile: the
     same three by three arrangement repeating down the floor, so the ARRANGEMENT
     was the surface and the pictures were only its squares.

     An empty array when the material has no pictures, when the pictures are
     switched off, or before they have all decoded -- so everything downstream
     falls back to the generated tile without having to know this exists. */
  matPictures(name) {
    if (this.pics[name] !== undefined) return this.pics[name];
    const use = this.pictures ? Textures.live[name] : null;
    let list = [];
    if (use && use.length) {
      const px = Math.max(8, Math.round(CFG.patternPx));
      list = use.map((img) => {
        const c = document.createElement('canvas');
        c.width = px; c.height = px;
        /* Whatever size the picture was drawn at, it fills its square metre, so
           the pictures land on the grid rather than floating over it. */
        c.getContext('2d').drawImage(img, 0, 0, px, px);
        return c;
      });
    }
    this.pics[name] = list;
    return list;
  },

  /* Which of a material's pictures one square metre wears, folded down from the
     square's own two grid coordinates and a salt that tells one surface from
     another standing on the same square (a block's left side from its right, a
     side from the ground).

     A PURE function of where the square is, so the surface is the same every
     frame and does not change when the view turns -- and because it is the
     square's own coordinates, two squares a long way apart agree by
     construction rather than by being made in the same pass.

     Multiplying the coordinates by large primes and mixing the bits is what
     makes neighbours land all over the sequence. Walking the grid and adding one
     -- `(x + y) % n`, say -- lays the pictures out in diagonals, which is the
     mosaic again with extra steps. */
  pickIndex(x, y, n, salt) {
    let v = Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663)
          ^ Math.imul(salt | 0, 83492791);
    v = Math.imul(v ^ (v >>> 16), 2246822519);
    v = Math.imul(v ^ (v >>> 13), 3266489917);
    return ((v ^ (v >>> 16)) >>> 0) % n;
  },

  /* The pick for a named material, through the list it actually has -- so a
     material with no pictures, or one, costs nothing and wears 0. */
  pickFor(name, x, y, salt) {
    const list = this.matPictures(name);
    if (list.length < 2) return 0;
    return this.pickIndex(x, y, list.length, salt);
  },

  /* A surface colour with its material baked into it, cached: one fill, not
     two. Filling every face twice -- once for the colour, once for an overlay
     on top -- cost eight milliseconds a frame, which was half the budget. The
     price of baking is that the lighting has to be stepped so the cache stays
     small; at this resolution the banding reads as paint.

     A material somebody DREW does not come through here as an overlay at all --
     the picture is the colour, and it is multiplied by `lit`, which is the
     shading with no colour of its own. See matPictures().

     `tag` tells two of these apart when the same colour and material are laid
     in different places -- a canvas pattern carries its own placement with it,
     so one shared between the floor at one height and the floor at the next
     would hand the second the first's transform, a metre out. Only the ground
     uses it, and floor heights are whole numbers, so it costs a few tiles.

     `pick` names which of the material's pictures this pattern wears. It is part
     of the key because two pictures are two surfaces: the whole point is that the
     square next door may wear the other one.

     `rampM` asks for the material WITH A FADE ON IT, `rampM` metres deep: the
     tile's own alpha is taken off along a slope running the whole depth, nothing
     at its top and all of it at the bottom. That is how the top of a wall carries
     its material and dissolves at the same time -- see wallBand(). It is part of
     the key for the same reason `pick` is: a tile with a fade baked into it is
     another surface, and handing it to a wall face that wanted the whole material
     would fade a metre off the middle of that wall. */
  matPattern(colour, name, tag, lit, pick, rampM) {
    const list = this.matPictures(name);
    const which = list.length ? (pick || 0) % list.length : 0;
    const pic = list.length ? list[which] : null;
    const tile = pic ? null : this.matTile(name);
    const px = pic ? pic.width : tile.width;
    /* HOW DEEP A FADE IS, counted in whole tiles of material. The tile a fade is
       baked into is that many tiles TALL: the material repeated down it exactly
       as it always was, with the gradient laid over the whole of it, so ONE pass
       of the gradient covers the whole band -- otherwise a band more than a metre
       deep would fade in stripes, one per repeat. A metre of wall is a tile of
       material, so the band's own height in metres is the count, and it is a
       whole number in this world: the cached tiles a whole map of walls can ask
       for number one or two, not thousands. A face shorter than the band takes
       the top of the gradient and so fades only part of the way, which is as
       close as a repeating pattern comes and is what the top of a stub should
       do anyway. */
    const tiles = rampM > 0 ? Math.max(1, Math.round(rampM)) : 0;
    const rampH = tiles ? tiles * px : px;
    /* A dropped-in picture IS the surface, so only the light is baked over it --
       `lit` is the shading with no colour of its own, see lightShade(). A
       generated material is a transparent overlay ON the tile's colour instead,
       so the two are different surfaces and may not share a cache entry. */
    const key = 'm|' + name + '|' + (pic ? 'pic|' + which + '|' + lit : colour)
              + (tag === undefined ? '' : '|' + tag)
              + (tiles ? '|r' + tiles : '');
    let pat = this.patCache[key];
    if (pat) return pat;
    const c = document.createElement('canvas');
    c.width = px; c.height = rampH;
    const g = c.getContext('2d');
    const down = tiles || 1;
    if (pic) {
      for (let i = 0; i < down; i++) g.drawImage(pic, 0, i * px);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = lit || '#ffffff';
      g.fillRect(0, 0, px, rampH);
      g.globalCompositeOperation = 'source-over';
    } else {
      for (let i = 0; i < down; i++) {
        g.fillStyle = colour;
        g.fillRect(0, i * px, px, px);
        g.globalAlpha = Math.max(0, Math.min(1, CFG.texStrength));
        g.drawImage(tile, 0, i * px);
      }
      g.globalAlpha = 1;
    }
    /* THE FADE ITSELF. `destination-in` KEEPS what is already on the tile and
       multiplies its alpha by the gradient, so this is the material fading out
       rather than a flat colour laid over the top of it -- which is exactly what
       the band this replaced used to be, and what the eye read as the stonework
       stopping. The gradient's own colour is irrelevant; only its alpha is used.
       Past the last stop it clamps, so the rest of the tile stays whole. */
    if (tiles) {
      const ramp = g.createLinearGradient(0, 0, 0, rampH);
      ramp.addColorStop(0, 'rgba(0,0,0,0)');
      ramp.addColorStop(1, 'rgba(0,0,0,1)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = ramp;
      g.fillRect(0, 0, px, rampH);
      g.globalCompositeOperation = 'source-over';
    }
    pat = this.bctx.createPattern(c, 'repeat');
    pat._pinned = '';
    pat._pick = pic ? which : -1;
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
    /* Whatever this pattern was placed by, it is placed by THIS now. The count
       is how the ground tells a plane it laid from a plane a ramp has since
       taken away from it. See groundFill() and ownPlane. */
    this._xformSeq = (this._xformSeq || 0) + 1;
    pat._xformSeq = this._xformSeq;
    return pat;
  },

  /* The finished fill for ONE SIDE of a block, which is what a wall IS.

     `q` is the face's own four corners in the order build() makes them: the top
     corner, the far end of the top edge, the same end at the foot, and the foot
     under the first. So `q[0]` and `q[1]` are the top edge -- the direction the
     material has to run along -- and `q[3]` is straight down from `q[0]`.

     `hM` is how tall the face really stands, which the wall clip may have cut
     down. One metre of wall is one tile of material either way, so a cut wall
     shows whole courses from the foot up rather than a squashed course.

     `lit` is the light on this face with no colour of its own, and only a
     dropped-in picture has any use for it.

     `x`/`y` are the square the block stands in and `salt` tells this face from
     the other side of the same block, which are the two things a drawn material
     picks its picture from. See pickFor(). */
  wall(colour, mat, q, hM, lit, x, y, salt) {
    return this.faceFill(
      this.matPattern(colour, mat, undefined, lit, this.pickFor(mat, x, y, salt)),
      q[0], q[1], q[3], 1, hM);
  },

  /* THE SAME MATERIAL, DISSOLVING -- the top of a wall with its stonework still
     on it, going transparent as it goes up.

     `wall()` is the face below; this is the band above it, and the two are built
     from the SAME square and the same salt, so they always wear the same picture
     of the material and cannot drift apart. Handing the band an arbitrary picture
     -- or the material with no fade on it -- would show the stones of a wall not
     matching the stones fading off the top of it.

     `rampM` is how tall the band is in metres, and it is also what the fade is
     measured against: the band stretches one tile over its own height, so the
     fade always reaches nothing exactly at the bottom edge of the band whatever
     height the band turned out to be. Walls are whole metres tall, so the ordinary
     case is one tile over one metre -- the material below and the material fading
     above it at the same size, and no seam. */
  wallBand(colour, mat, lit, x, y, salt, rampM) {
    return this.matPattern(colour, mat, undefined, lit,
                           this.pickFor(mat, x, y, salt), rampM);
  },

  /* Pin a material to the world so it does not swim as the view moves: flat
     across the screen, which is the way the GROUND used to be painted. Each
     pattern is moved at most once per frame per anchor.
     
     Kept for two reasons. It is the cheap way and the whole ground is a big
     share of the picture, so it is the thing the mapped way has to be worth
     beating; and a test can paint one frame each way, which is how the bug this
     replaced -- stonework and moss facing the camera instead of lying on the
     floor -- is kept from creeping back. Only `mappedGround` being off reaches
     it now. */
  pin(pat, ox, oy, stamp) {
    if (!pat || !pat.setTransform) return pat;
    if (pat._pinned === stamp) return pat;
    const m = new DOMMatrix([1, 0, 0, 1, Math.round(ox), Math.round(oy)]);
    pat.setTransform(m);
    pat._lastMatrix = [m.a, m.b, m.c, m.d, m.e, m.f];
    pat._pinned = stamp;
    this._xformSeq = (this._xformSeq || 0) + 1;
    pat._xformSeq = this._xformSeq;
    return pat;
  },

  /* The finished fill for the roof of a square of the world: the ground
     underfoot, the cap of a stone block, or a ramp.
     
     A material here lies ON the square -- its two axes are the square's own two
     edges -- so it turns with the view, and on a floor it runs lengthways along
     the floor rather than facing the camera. Pasted flat across the screen a
     floor had no direction at all, which is what made it read as a pattern hung
     up behind the world instead of ground you are standing on.

     `texture.strength` 0 means NO material at all, a dropped-in picture
     included: the dial is what turns the materials off, and one material that
     ignored it would be a tile nothing could switch back to plain.

     `lit` is the light with no colour of its own, and only a dropped-in picture
     has any use for it. See matPictures(). */
  ground(colour, mat, it, s, worldStamp, lit) {
    if (!mat || CFG.texStrength <= 0) return colour;
    /* WHICH of the material's pictures this square metre wears, from the
       square's own coordinates -- so the pick is the same however the ground is
       reached, and two floors at two heights wear the same scatter. */
    const pat = this.matPattern(colour, mat, it.cell.h, lit,
      this.pickFor(mat, it.cell.x, it.cell.y, PICK_GROUND));
    if (!this.mappedGround) return this.pin(pat, -s.cam.ox, -s.cam.oy, worldStamp);
    /* A ramp is the one square tilted in its own plane -- its corners sit at two
       different heights -- so it is mapped from its own corners, the same as a
       wall face is. Every flat square, floor or block cap, is in the one plane
       for its height, and they share a transform. */
    if (it.cell.slope === SLOPE_FLAT) return this.groundFill(pat, s, it);
    return this.faceFill(pat, it.top[0], it.top[1], it.top[3], 1, 1);
  },

  /* Lay a material in the plane of the ground, from the shared plane rather
     than from the square's own corners.
     
     Every flat square at the same height is the same parallelogram of the same
     plane, so one transform places the material on all of them at once -- that
     is exactly what the square's own `top` corners say (north, east, west) --
     and a square a metre higher is that same map moved up the picture by one
     rise. One metre of ground is one tile of material, so the joints run along
     the edges of the squares on every square at once, whichever way the grid is
     turned.
     
     This is what makes mapping the ground affordable at all. Mapping a material
     onto one face costs about 50 microseconds, and the ground is most of the
     picture: 350 squares of it face by face took drawing from 8.7ms to 43ms
     when that was tried. Set once per material per height per frame it costs
     about what pasting it flat used to. */
  groundFill(pat, s, it) {
    if (!pat || !pat.setTransform) return pat;
    const stamp = this._frameStamp;
    const laid = pat._laid === stamp;
    /* Laid this frame -- and, when the rule that keeps a plane its own is on,
       nothing has written a transform onto this pattern since, so it is still
       carrying THIS floor's plane. Both halves are needed: a ramp at the same
       height wears the same pattern and is mapped from its own sloped corners
       (see ground()), so a square that skipped the placement on the stamp alone
       wore the ramp's stretch instead of its floor's plane. */
    const mine = laid && (!this.ownPlane || pat._laidSeq === this._xformSeq);
    if (laid && !mine && this.planeFaults) this._notePlaneFault(it, pat);
    if (mine) return pat;
    const h = it.cell.h;
    let pl = this.planes[h];
    if (!pl || pl.stamp !== stamp) pl = this.planes[h] = this.plane(s, it, stamp);
    this.faceFill(pat, pl.a, pl.b, pl.d, 1, 1);
    /* Its own record, kept apart from a face's: the same material may be a
       wall's face somewhere else in the same frame, and neither the placement
       nor what a test reads back may be the other's. */
    pat._lastLaid = pat._lastMatrix;
    pat._laidSeq = this._xformSeq;
    pat._laid = stamp;
    return pat;
  },

  /* Test only, and nothing in the game turns it on: write down every square of
     ground that got somebody else's plane, with the two answers side by side.
     What a rule against that is worth is the count going to nothing -- and the
     same count coming back with the rule switched off, in the same build, is
     what keeps it from passing on a picture with no ramp in it. */
  planeFaults: false,
  _faults: null,
  _notePlaneFault(it, pat) {
    const px = Math.round(CFG.patternPx);
    const pl = this.planes[it.cell.h];
    const m = pat._lastMatrix || [0, 0, 0, 0, 0, 0];
    const run = function (x0, y0, x1, y1) { return [x1 - x0, y1 - y0]; };
    (this._faults || (this._faults = [])).push({
      x: it.cell.x, y: it.cell.y, h: it.cell.h, tile: it.cell.tile,
      /* how far a metre of material went, both ways, as the square was painted
         (got) and as its own floor demands (want) */
      got: run(m[4], m[5], m[4] + m[0] * px, m[5] + m[1] * px)
        .concat(run(m[4], m[5], m[4] + m[2] * px, m[5] + m[3] * px)),
      want: pl ? run(pl.a.x, pl.a.y, pl.b.x, pl.b.y)
        .concat(run(pl.a.x, pl.a.y, pl.d.x, pl.d.y)) : null
    });
  },

  /* The ground plane at one floor's height: a metre either way from a whole
     grid corner, lifted to that floor.
     
     The corner is the first square of ground the frame drew, and it is a whole
     grid corner on purpose -- every square's own corners are then a whole
     number of tiles from it, which is what puts the joints on the edges of the
     squares. Which corner it is does not matter, because a repeating material
     looks the same a whole tile along; a small one keeps the numbers exact.
     Held for the frame because it is asked for once per material and it stops
     being true the moment the view moves. */
  plane(s, it, stamp) {
    const c = it.cell, h = c.h;
    return { stamp: stamp,
             a: this.project(s, c.x, c.y, h),
             b: this.project(s, c.x + 1, c.y, h),
             d: this.project(s, c.x, c.y + 1, h) };
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
     the pointer answers with (see pickAt). */
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
        /* What is LEFT of a block the picture is about to skip -- see
           stumpOf(). Worked out before the corners, because the corners ARE the
           answer: a stumped block is projected at its own foot height instead of
           its real one, and from there on it is an ordinary low block to every
           other line of this file -- its faces, its lid, its pick box and the
           clip against the block in front all come out of these four points. */
        const stub = this.stumpOf(cell);
        for (let c = 0; c < 4; c++) {
          const ch = cornerHeight(cell, c);
          top[c] = this.project(s, x + CORNERS[c][0], y + CORNERS[c][1],
                                stub > 0 ? Math.min(ch, stub) : ch);
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
          /* Whether the square's top face is a wall's lid rather than ground you
             can stand on -- see Render.capShown(). Read off the tile's FOOTING,
             because a ramp's square has height too and its top is the slope the
             crawler climbs. */
          block: TILE(cell.tile).footing === 'block',
          wallM: this.drawnM(cell),   /* how far the faces drop, in metres */
          /* The corner both faces hang from, and the far corner of each face, so
             the clip below can tell which of the four edges a face stands on.
             Then the wall cut down to the block in front: see clipFaces(). */
          near: near, cornerL: left, cornerR: right,
          nbrL: -1, nbrR: -1, cutL: null, cutR: null, cutML: 0, cutMR: 0,
          cutaway: cell.cutaway === true,
          /* A block that is hidden behind the wall in front but keeps a foot of
             itself standing -- see stumpOf(). It paints solid all the way down
             and is never faded: the fade's whole job is to let you see over a
             tall wall, and a one-metre foot is not in the way of anything. */
          stumped: stub > 0,
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
     * IT IS THE BLOCK'S TOP THAT DID THE COVERING, so once the tops are gone
     * (`wallCaps`) the head of that face comes back into view and has to be
     * painted -- the top metre of it, which is what `lipShown()` and `lip()` in
     * draw() are for. Left out, it is a hole through the middle of the rock.
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
         that ended up above it would paint outside the block. OUR OWN WALL is
         `wallM` and not `cell.h`, because a block that only keeps a foot of
         itself standing (`stumpOf`) is a one-metre block as far as this picture
         is concerned -- clipped against a metre of rock in front it would come
         out as a sliver of no height at all.

         AND SO IS THE BLOCK IN FRONT'S. `drawnM` is what it PAINTS, which is
         its real height unless it is itself a hidden block keeping a foot, and
         then a metre. `cell.h` there was the whole of the strip of bare rock
         along the backs of the walls: the neighbour promised six metres of cover
         from the world and then painted one, and the five it cleared were
         painted by nobody. */
      const mine = it.wallM;
      const meet = Math.min(mine, this.drawnM(nbr));
      if (f === 0) {
        it.nbrL = nk;
        it.cutML = mine - meet;
        it.cutL = meet < mine ? this.cutWall(it.left, it.top[it.near], it.top[other], meet) : null;
      } else {
        it.nbrR = nk;
        it.cutMR = mine - meet;
        it.cutR = meet < mine ? this.cutWall(it.right, it.top[it.near], it.top[other], meet) : null;
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
    this.path(ctx, pts);
    ctx.fillStyle = fill;
    ctx.fill();
  },

  /* IS THIS SQUARE'S TOP FACE PAINTED? A floor's always is -- that is the ground
     you walk on. A ramp's always is too. A block's is not a lid any more, but the
     rock is painted there instead (`wallBody`), so the answer is still yes for
     every square in the picture: asked in one place because four things have to
     agree about it -- the picture, the pick buffer, the pointer's own answer, and
     the halo round a selected thing -- and a halo that rings a surface nobody
     painted is a ring drawn round nothing.

     Only the two control arms take a block's top out of the answer: `wallCaps`
     (the old lit lid is painted, so the top is painted the old way) and
     `wallBody` off (v0.37.0's picture, where a block's top really is a hole). */
  capShown(it) { return this.wallCaps || !it.block || (this.wallBody && it.solid); },

  /* WHETHER A FACE THAT IS NOT PAINTED STILL SHOWS A STRIP OF ITSELF.

     A face is not painted at all where the block in front of it is at least as
     tall (`cutML` 0): that block's own LID used to cover every pixel of it, and
     with the lids gone (`wallCaps`) the top of the face comes back into view --
     the block in front stands one tile nearer, so its top edge sits half a metre
     lower down the screen, and the half metre between the two edges is this face
     seen over the front block's shoulder. Left unpainted it is a hole straight
     through the middle of the rock, which is what the picture had: measured at
     900 px from the camp, 42% of the picture unpainted in 216 separate holes.

     Only where the front block's top is a wall's LID: where it is a raised
     FLOOR, that floor's own surface is painted and covers the strip itself. */
  lipShown(nbr, b) {
    return this.wallLips && nbr >= 0 && nbr < b.length && !this.capShown(b[nbr]);
  },

  /* The strip itself: the top of the face, faded by the same rule as any other
     wall, and no more of the face than the fade reaches. With the fade off it is
     painted flat, because the strip is not a hole either way. */
  lip(ctx, quad, colour) {
    if (CFG.wallFadeM > 0) { this.fadeBand(ctx, quad, CFG.wallFadeM, colour); return 1; }
    this.poly(ctx, this.lipQuad(quad), colour);
    return 0;
  },

  /* The shape `lip()` paints, worked out in one place because the picture, the
     pointer's own answer and the yardstick it is checked against all have to
     agree about where the strip is. Half a metre is the least it can be, and
     that is not a taste: the block in front stands one tile nearer, which puts
     its top edge half a metre lower down the screen, and the strip between the
     two edges is exactly that. A band of a face is this same shape, so both come
     from `bandQuad()`. */
  lipQuad(quad) {
    return this.bandQuad(quad, Math.max(CFG.wallFadeM, 0.5) * CFG.rise);
  },

  /* A face's top edge with the same two sides `d` pixels further down: the shape
     a fade is painted into, whether the fade is a flat colour or the material's
     own. Worked out in one place for the same reason as `lipQuad()`. */
  bandQuad(quad, d) {
    const a = quad[0], c = quad[1];
    return [a, c, { x: c.x, y: c.y + d }, { x: a.x, y: a.y + d }];
  },

  /* THE TOP METRE OF A WALL, FADED AWAY.

     A face is a parallelogram with two vertical sides: screen x does not depend
     on height and screen y moves render.rise pixels per metre, so the top metre
     of a wall is its own top edge with the same two sides, `d` pixels further
     down. The band is that parallelogram, and the gradient runs ACROSS it --
     perpendicular to the slanted top edge, nothing at all on the edge itself and
     the face's own colour at the band's bottom -- so every point of the band
     fades by how far down from the top edge it is, and the two ends of a slanted
     edge match. A plain vertical gradient would fade the uphill end of a slanted
     top edge by half of what it faded the downhill end.

     THE BAND IS THE FACE'S OWN COLOUR, half-transparent, rather than an eraser.
     There is no erasing available: canvas paint OVERWRITES, so `destination-out`
     can only take the alpha off the top layer, and the layer it uncovers is not
     the picture behind the wall -- there is nothing behind it: the buffer was
     filled with one flat colour and the rock and floor that were painted earlier
     were then covered, not stored. An erase therefore fades a wall toward the
     backdrop, which stripes a rock face with dark bands. Only paint that can be
     seen through shows what is really behind: the far side of the room, the
     floor, a crawler standing at the base of the wall.

     THIS IS THE FLAT FALLBACK. A wall whose material is mapped onto its faces
     wears that material in the band instead and dissolves it -- see paintSide()
     and wallBand() -- which is what a person sees as the stonework continuing up
     the wall and going see-through. The flat band is what is left for a wall with
     no material on it at all (`texture.strength` 0, or a face no material is
     mapped onto), where there is no stonework to continue. */
  fadeBand(ctx, quad, metres, colour) {
    const d = Math.min(CFG.wallFadeM, metres) * CFG.rise;
    if (!(d > 1)) return 0;
    const a = quad[0], c = quad[1];          /* the face's top edge */
    const ex = c.x - a.x, ey = c.y - a.y;
    const len = Math.sqrt(ex * ex + ey * ey) || 1;
    let nx = -ey / len, ny = ex / len;
    if (ny < 0) { nx = -nx; ny = -ny; }      /* always downhill on the screen */
    const t = d * ny;                        /* where a drop of d lands along it */
    const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    const g = ctx.createLinearGradient(mx, my, mx + nx * t, my + ny * t);
    g.addColorStop(0, this.withAlpha(colour, 0));
    g.addColorStop(1, this.withAlpha(colour, 1));
    this.poly(ctx, this.bandQuad(quad, d), g);
    return d;
  },

  /* A wall face with its top metre gone: the same quad with the top edge dropped
     `d` pixels and the foot left where it was. */
  belowBand(quad, d) {
    const a = quad[0], c = quad[1];
    return [{ x: a.x, y: a.y + d }, { x: c.x, y: c.y + d }, quad[2], quad[3]];
  },

  /* One side of a block, whole: the material from the foot up to the faded band,
     then the band over the top of it. The band is painted LAST and a pixel down
     into the material, so the join between flat colour and material is covered
     by the band's opaque end rather than left as an antialiased hairline.

     `fill` is the whole face's fill -- a colour, or the material's pattern, which
     is registered to this face's own top corner -- so handing it the shorter
     quad fills that shorter quad with exactly the part of the material that
     belongs there. Nothing slides.

     `band` is the material WITH THE FADE BAKED INTO IT, for a wall that has a
     material mapped onto it (see wallBand()). It is anchored to the same corner
     the face's own material is anchored to, at the same scale -- one tile of
     material to one metre of wall -- so the stones in the band ARE the stones of
     the face below it, running straight through the join, and they dissolve as
     they rise rather than stopping. Without one -- a flat-coloured wall -- the
     band falls back to `fadeBand()`, which fades the face's own colour.

     Returns 0 when the face was painted whole, 1 for a flat band and 2 for a band
     carrying the material, so `consumed` can count them and a test can prove the
     material reached the fade rather than arguing that it did. */
  paintSide(ctx, quad, metres, colour, fill, band) {
    if (!this.wallFade || !(metres > 0)) { this.poly(ctx, quad, fill); return 0; }
    const m = Math.min(CFG.wallFadeM, metres);
    if (!(m > 0)) { this.poly(ctx, quad, fill); return 0; }
    const d = m * CFG.rise;
    this.poly(ctx, this.belowBand(quad, d - 1), fill);
    if (band) {
      const q = this.bandQuad(quad, d);
      /* THE BAND'S OWN HEIGHT, not the face's. One metre of wall is one tile of
         material, and the pattern's own v axis is laid over `m` -- so the stones
         in the band are the size of the stones in the face it sits on and the
         courses run straight through the join. Mapped over a face two metres
         tall while only one metre of it is band, the stones in the band would
         come out twice the height of the stones below them. */
      this.faceFill(band, q[0], q[1], q[3], 1, m);
      this.poly(ctx, q, band);
      return 2;
    }
    this.fadeBand(ctx, quad, metres, colour);
    return 1;
  },

  /* `rgb(r,g,b)` -- which is what every shade in this file hands back -- as the
     same colour at another strength. A hex is taken too, because the camp and
     the figures carry plain tile colours about. */
  withAlpha(colour, a) {
    const s = String(colour);
    if (s[0] === '#') {
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255)
           + ',' + a + ')';
    }
    return s.indexOf('rgb(') === 0 ? 'rgba(' + s.slice(4, -1) + ',' + a + ')' : s;
  },

  path(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
  },

  /* THE TWO WALLS OF A BLOCK AS THE DRAWING PAINTS THEM this frame: whole when
     nothing in front of them hides them, cut down to where the block in front
     reaches when one does, and gone when that block is as tall as they are.

     Note what this is NOT: it is not the shape of the block. A side stored here
     runs from the cap down to the floor of the world, and `hideL`/`hideR` are
     false whenever the block in front paints anything less than solid -- because
     a block that paints nothing leaves a hole in the wall unless the whole side
     is painted again. That is right for a PICTURE and wrong for an OUTLINE: the
     silhouette of a thing cannot change because something in front of it was cut
     away. `sideShown()` is the silhouette, and it is worked out from the world
     instead. */
  wallsPainted(it, alphaOf) {
    const hideL = this.clipWalls && it.nbrL >= 0 && alphaOf[it.nbrL] === 1;
    const hideR = this.clipWalls && it.nbrR >= 0 && alphaOf[it.nbrR] === 1;
    return { l: hideL ? it.cutL : it.left, r: hideR ? it.cutR : it.right,
             ml: hideL ? it.cutML : it.wallM, mr: hideR ? it.cutMR : it.wallM };
  },

  /* HOW FAR A SIDE OF A BLOCK STANDS, and no further: from that square's own cap
     down to the ground next door, because what is below the ground next door is
     inside the rock and nobody can see it.

     Worked out from the WORLD -- how far the neighbour square's own rock is
     PAINTED, which is its real height except for a hidden block keeping a foot
     of itself -- so it can never be stretched by the picture deciding to fade or
     skip something. How tall the side itself is comes from the item's `wallM`,
     which is its own height unless it is a hidden block keeping only a foot of
     itself (`stumpOf`). `f` is
     0 for the left side and 1 for the right, matching `it.left` / `it.right`; the
     edge index is the same one `clipFaces()` names, so the two agree about which
     neighbour a side faces. Null means that side is not part of the silhouette
     at all. */
  sideShown(w, item, f) {
    const quad = f === 0 ? item.left : item.right;
    const cell = item.cell;
    if (!this.clipWalls || cell.slope !== SLOPE_FLAT) return quad;
    const other = f === 0 ? item.cornerL : item.cornerR;
    const e = other === (item.near + 1) % 4 ? item.near : other;
    const nbr = w.at(cell.x + EDGE_STEP[e][0], cell.y + EDGE_STEP[e][1]);
    /* No square there, or ground that is not flat: the drawing keeps the whole
       side, so the outline keeps it too. */
    if (!nbr || nbr.slope !== SLOPE_FLAT) return quad;
    /* How far the side really stands, which is `wallM` -- the block's own height
       unless it is a hidden block keeping only a foot of itself, and then a
       metre. The block in front is asked the same way and with the same helper,
       so the outline, the pick list and the picture cannot disagree about a
       stumped block or about the block covering it. */
    const meet = Math.min(item.wallM, this.drawnM(nbr));
    return meet < item.wallM
      ? this.cutWall(quad, item.top[item.near], item.top[other], meet)
      : null;
  },

  /* Every polygon a thing's silhouette is made of, so it can be haloed as one
     shape -- and nothing else, because the halo is painted UNDER the thing and
     only what sticks out past it is ever seen. A crawler and a piece of the camp
     are made of parts, and every part's faces are painted, so one path rings
     either of them.
   *
     A BLOCK is the case that has to be worked out, and ringing its stored faces
     was the bug: a side is stored running from the block's cap all the way down
     to the floor of the world, so a selected floor tile was haloed for the whole
     height of the rock under it and the outline ran away down the screen as a
     long spike -- which is what "highlight lines zig-zagging all over the place"
     was, and it came and went with which blocks happened to be see-through. A block is
     ringed by its cap and by the two sides as far as they really stand. */
  shapeOf(w, item) {
    if (item.parts) {
      const out = [];
      for (let i = 0; i < item.parts.length; i++) {
        const fs = item.parts[i].faces;
        for (let g = 0; g < fs.length; g++) out.push(fs[g].pts);
      }
      return out;
    }
    if (!item.solid) return [item.top];
    /* A wall's lid is not painted, so it is not part of the silhouette either --
       a halo is the thing's own shapes drawn under it, and a ring round a
       surface that was never painted is a ring drawn round nothing. */
    const out = this.capShown(item) ? [item.top] : [];
    /* The A/B control the selection test is proved against: handing the halo the
       STORED sides -- the quads that run down to the floor of the world -- is the
       rule this was fixed from. Measured, it escapes the shapes that were painted
       in 37 of that test's 50 selections, by as much as 220px. */
    if (this.ringStored) return [item.top, item.left, item.right].filter(Boolean);
    const l = this.sideShown(w, item, 0), r = this.sideShown(w, item, 1);
    if (l) out.push(l);
    if (r) out.push(r);
    return out;
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

  /* HOW MUCH OF A BLOCK THE PICTURE LEAVES STANDING WHEN IT HIDES IT.

     Rock standing between you and a room is not painted, so you see the room
     through the gap -- and the gap is not quite covered by what is behind it.
     The floors behind a hidden column start half a step short of where the
     column's own foot was (their near corner projects half a metre further up
     the screen than the foot of the square in front), and the floors in FRONT of
     it only reach up the screen as far as their own near edge, so the band from
     a metre above the hidden block's base down to the top of its base diamond is
     covered by nothing at all unless the block itself covers it. Measured with
     `files/probe-voids.mjs --why` on the look that shipped without this (v0.37.0,
     buffer 534x348, seeds 1 and 3, 16 views): every pixel of every hole answered
     `pickAt -1`, and named the hidden square's own left face as the only shape
     whose box it was inside -- 13,119 px of it in 16 of 16 views.

     None of that is new. The holes were there before the wall tops were deleted
     (13,029 px with the lids back on, same views), which is why deleting the tops
     only looked like the cause: the LID is what used to cover it. A metre of rock
     covers it by construction -- a block's own two faces reach a metre above its
     base and its top face reaches half a metre above that, and the whole of the
     measured band lies inside those -- and the scale is why it is one metre and
     not more: at 32 pixels to the metre a crawler is 52 px tall, so a metre of
     low rock is something you see a room over, not a wall.

     It also has to be a block of rock, not a hole with the floor behind showing
     through it, which means the pick list has to answer for it (rule 8): a
     stumped square is built at its foot height, so the pointer's own shape test
     finds the low rock that is really painted and the absent rock above it stays
     unpickable.

     `cut_stump_m` is the dial: 0 is the whole square gone (the negative control
     in the probe and the picture v0.37.0 shipped), 1 is a low kerb of rock,
     anything at or above the block's own height leaves the block painted whole
     and is the same thing as `cut_solid` 1. */
  stumpOf(cell) {
    if (cell.cutaway !== true || CFG.cutSolid > 0) return 0;
    return Math.max(0, Math.min(CFG.cutStumpM, cell.h));
  },

  /* HOW FAR A SQUARE'S OWN ROCK IS PAINTED, in metres: its real height, unless
     it is a hidden block keeping a foot of itself standing (`stumpOf`), and then
     the foot -- or nothing at all, when `cut_stump_m` is 0 and the square is left
     out of the picture whole. ZERO IS A HEIGHT TOO: a square that paints nothing
     covers nothing, and the two clips ask this of the block in FRONT, so a
     square with the foot switched off must hand back 0 and let what is behind it
     come back whole. The item built for a square carries this as `wallM`; this is
     the same number asked of a SQUARE, which is what the two clips below need,
     because they ask it of the block in front rather than of the block itself.

     IT MUST BE THIS NUMBER AND NOT `cell.h`. A face may only be cut down to hide
     behind the block in front, so it may only be cut as far as that block
     PAINTS -- and a hidden block paints a metre whatever the world says its
     height is. Clipped against `cell.h` it swallowed a face whole and, painting
     only a foot itself, covered none of the band it had just cleared: that is
     the strip of bare rock that has been showing along the backs of walls since
     the cut was invented, and it is the same strip a stumped block used to trade
     for another one somewhere else. Painting MORE than we must is always safe,
     because the block in front is painted after this one and covers what it
     covers -- so the only way this can be wrong is by hiding too much, never by
     hiding too little. */
  drawnM(cell) {
    if (cell.cutaway !== true || CFG.cutSolid > 0) return cell.h;
    return this.stumpOf(cell);
  },

  /* How strong every item paints this frame, worked out in one place.
   *
   * ONE thing can be painted see-through, and it is the rock of the fourth wall:
   * rock standing between you and a floor behind it. `cut_solid` says how solid
   * that rock stays -- 0 meaning it is not painted at all and the room is seen
   * through the gap, 1 meaning it is drawn like any other rock. WHICH rock that
   * is was settled in markCutaway(), from the view alone, so this is only the
   * strength it is painted at. Everything else paints solid, always.
   *
   * It used to be two things. The other was a fade over whatever stood between
   * you and the thing you were inspecting, chosen by comparing the BOX each
   * thing is stored with against the box of what you had selected (the way the
   * game had done it since v0.25.0, and the way before that painted each thing
   * into a hidden buffer and read it back). A box is not a silhouette: a
   * crawler, a bedroll and a camp store are drawn by the ground around them, and
   * their boxes reach out over the squares either side -- so pointing at the
   * campfire put the two tiles beside it into see-through, and the town's own
   * rock was hazed over whenever you looked at a room. That whole branch, the
   * cover test behind it, and the `fadeBox` flag a test kept as its other arm
   * are gone. If one thing in the picture may be painted at half strength, the
   * next thing may be too, and there is no answer to "is this behind that" that
   * a stored box can give.
   *
   * The list is reused between frames: one picture, one allocation. */
  alphas(s, b) {
    const plan = this.alphaPlan || (this.alphaPlan =
      { list: [], focus: null, focusPos: -1, focusIdx: -1, cutaway: 0 });
    const list = plan.list;
    /* A pinned selection outranks whatever the pointer happens to be over, so
       the crawler you picked stays ringed while they walk away. The focus is
       needed for the halo, which goes under the shape -- not for an opacity. */
    const focusIdx = s.selected >= 0 ? s.selected : s.hover;
    let focus = null, focusPos = -1;
    if (focusIdx >= 0) {
      for (let k = 0; k < b.length; k++) {
        if (b[k].i === focusIdx) { focus = b[k]; focusPos = k; break; }
      }
    }
    let cutaway = 0;
    list.length = b.length;
    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      if (it.kind === 'cell' && it.cutaway) {
        /* A cut-away square that keeps a foot of rock (`stumped`) is painted
           like any other square, so it must not fade -- and it must not be
           skipped by the pointer either. See cutOut() and stumpOf(). */
        list[k] = it.stumped ? 1 : CFG.cutSolid;
        cutaway++;
      } else list[k] = 1;
    }
    plan.focus = focus; plan.focusPos = focusPos; plan.focusIdx = focusIdx;
    plan.cutaway = cutaway;
    return plan;
  },

  /* The one question the picture and the pointer have to answer the same way: is
     this square in the way, and so not painted at all? It is asked in exactly
     the two places that decide it, so an item that is not in the picture can
     never be picked and an item that is painted can never be unpickable --
     rule 8 holds in lockstep, with no exception for the thing you have selected
     (that is given a halo instead, and a halo with no shape under it is a ring
     around nothing).

     A square that keeps a foot of rock is NOT out of the picture: it paints, so
     the pointer has to find it -- but only where it paints, which is why the
     stump is built at its foot height rather than tested for here. */
  cutOut(it) {
    if (it.stumped) return false;
    return it.kind === 'cell' && it.cutaway === true && CFG.cutSolid <= 0;
  },

  draw(s) {
    this.ensure();
    const ctx = this.bctx, b = this.batch;
    const kinds = {};
    let drawn = 0, people = 0, structures = 0;
    let walls = 0, wallPx = 0, buried = 0, kept = 0, lost = 0, faded = 0, lips = 0;
    let banded = 0;
    /* How many top faces were painted, how many of those were the rock of a wall
       rather than a surface somebody laid, and how many were left out because
       `wallBody` is switched off. A test reads all three: with the look the game
       ships no block is a lid, every block is rock, and every square is counted
       by exactly one of them. */
    let caps = 0, capsOff = 0, body = 0;
    /* How many squares the picture did not paint because rock was standing in
       front of a room. `drawn + cut` is every square the batch holds, and a test
       reads exactly that: a square that is neither painted nor counted here is a
       square that fell through the floor of the renderer. */
    let cut = 0;
    /* How many squares paint a low foot of rock because the wall in front hides
       the rest of them -- see stumpOf(). Zero of these where the world has hidden
       blocks is the look v0.37.0 shipped, and it leaves a gap at the foot of each
       hidden column: a test reads this count rather than arguing the gap is shut. */
    let stumps = 0;
    /* The middle of the last block's own near face: a pixel that block REALLY
       painted. The middle of its square will not do any more, because the middle
       of a square's screen footprint is its TOP, and the tops are exactly what
       the wall look deletes -- so the honest answer there is whatever the
       deleted lid was covering. Recorded here because this is the one place the
       painted quads exist; `recordItems` only keeps a summary of each item. */
    let faceAim = null;
    const picks = new Set();
    const wornDrawn = [];

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BACKDROP;
    ctx.fillRect(0, 0, this.w, this.h);
    /* Changes whenever the view does, which is when the ground's own placement
       has to be worked out again. The size of the picture is part of it because
       the ground is projected through the middle of it, and zooming the view
       makes that size change. */
    this._frameStamp = s.cam.ox + ',' + s.cam.oy + ',' + s.cam.yaw + ','
      + s.cam.tileH + ',' + this.w + 'x' + this.h;

    /* How strong everything paints this frame, worked out in one place: a wall
       is only cut down in build() where the block in front of it paints solid,
       and two copies of that rule would disagree the first time either
       changed. */
    const plan = this.alphas(s, b);
    const alphaOf = plan.list, focus = plan.focus, focusPos = plan.focusPos;
    const focusIdx = plan.focusIdx, cutaway = plan.cutaway;

    const items = this.recordItems ? [] : null;
    let outlined = false;

    const outlineColour = N('ui.colour_outline');
    const worldStamp = 'w' + s.cam.ox + ',' + s.cam.oy;

    for (let k = 0; k < b.length; k++) {
      const it = b[k];
      const alpha = alphaOf[k];
      let myAim = null;

      /* Rock standing in the way is not painted at all while `cut_solid` is 0,
         and it is skipped BEFORE the halo: a column that is not in the picture
         cannot be ringed either, so what you can pick stays exactly what you can
         see. The panel still names a thing that is cut away -- see cutOut(). */
      if (alpha <= 0) { cut++; continue; }

      if (it.stumped) stumps++;

      /* The highlighted thing is never painted see-through -- it is the one you
         are looking at -- and its halo goes down first, at full strength. */
      if (focus && k === focusPos) {
        ctx.globalAlpha = 1;
        this.halo(ctx, this.shapeOf(s.world, it), outlineColour, CFG.outlineWidth);
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
       * A floor or a block cap carries its material mapped onto the ground it
       * lies on, so it runs lengthways along the corridor instead of facing the
       * camera. That is one transform per material per height for the whole
       * frame, so it costs about what pasting it flat did -- see groundFill().
       *
       * The SIDES of a block carry the material too, mapped onto each face, so
       * the courses run along the wall and turn with it. They used to be left as
       * flat colour, and only masonry was mapped -- the facing somebody had put
       * on a worked room. What was written here for that was that rock's sides
       * are in shadow and edge-on, so a material there reads as almost nothing
       * and costs a third of the frame, and that masonry was all anybody would
       * lay. The first half is true and the conclusion was still wrong: rock is
       * nearly every wall in the labyrinth, so the rule meant the walls a player
       * actually walks between were the one surface in the game with no material
       * on them at all. See wall().
       *
       * Measured, A/B-ed inside one build (v0.24.0, seed 1, 624x368, best of
       * three alternating passes of 30 frames each): 182 sides are painted at
       * the camp and 636 more are buried behind a neighbour and never painted
       * at all. The ones that are painted cover 987,000 pixels of surface --
       * 4.3 screenfuls -- of which only 29,457 are actually visible, the rest
       * lying inside rock standing in front of them. That costs +3.9ms of
       * drawing a frame, and it is the FILL rather than the transform: the 182
       * setTransform calls are about half a millisecond of the total. For
       * comparison the ground's own material costs the same +3.9ms for 72,691
       * visible pixels -- so a screenful of wall costs about two and a half
       * times a screenful of floor, and the 33x overdraw above is why.
       *
       * It does not grow with the size of the world: +3.89ms holding 2 pieces,
       * +4.01ms holding 28. It grows the pattern cache instead, 24 -> 45
       * patterns at the camp, which is the other reason the lighting is stepped
       * rather than smooth.
       *
       * The sides stayed flat for a long time on a measurement that said
       * mapping them took drawing from 8.7ms to 43ms. That was taken BEFORE the
       * walls were clipped against the rock next door (v0.18.0), which is what
       * cut the faces to the couple of hundred above; on a clipped world the
       * same change is +3.9ms. */
      const mat = def.pattern;
      if (it.solid) {
        /* A block's sides are where a material really belongs: they are the
           walls you walk between, and the material is mapped ONTO each face
           rather than pasted over it, so the courses run along the wall and
           turn with it. */
        const lf = litShade(def.side, CFG.shadeLeft * lift, it.light);
        const rf = litShade(def.side, CFG.shadeRight * lift, it.light);
        /* A wall cut down where the block in front hides it -- but only while
           that block really does paint solid. Fade it and the whole wall has to
           come back, or the fade would open a hole, so the choice is made here
           rather than in build(). A wall is only as tall as the cut left it
           (mL/mR), or the stonework would stretch and the courses would not line
           up with the block's own. At `cut_solid` 0 the block in front paints
           nothing at all and therefore counts as no cover, so a cut column's
           neighbours come back at their full height -- which is what stops a
           square that is not painted from leaving a hole in the rock beside it.

           The HALO above is NOT read off this. It is the silhouette, and a
           silhouette cannot grow because something in front of it was faded, so
           it is worked out from the world by `sideShown()` -- the same two sides
           of the same square, and never the stored wall running to the floor of
           the world. Here the choice is what to PAINT, and painting the whole
           side under a fade is what stops the fade opening a hole. */
        const faced = this.wallsPainted(it, alphaOf);
        const qL = faced.l, qR = faced.r, mL = faced.ml, mR = faced.mr;
        /* Both sides of a block, in the block's own material. */
        const sided = this.mappedWalls && mat && CFG.texStrength > 0;
        /* The same two shadings with no colour of their own, for a surface that
           IS a picture -- a picture carries its own colour, so multiplying it by
           the tile's as well would leave it nearly black. Worked out only for a
           material that has pictures, since these lines run for every block in
           the frame. */
        const pic = sided && this.drawn(mat);
        const lfPic = pic ? lightShade(CFG.shadeLeft * lift, it.light) : undefined;
        const rfPic = pic ? lightShade(CFG.shadeRight * lift, it.light) : undefined;
        if (qL) {
          const fill = sided ? this.wall(lf, mat, qL, mL, lfPic,
            it.cell.x, it.cell.y, PICK_LEFT) : lf;
          /* The band above the face wears the SAME picture of the material, from
             the same square and the same salt, and dissolves it -- which is the
             whole of what a person sees when they say the texture stops where the
             fade starts. A square that only keeps a FOOT of rock is never faded:
             the band is the top metre and would dissolve the entire foot, which
             is the hole this look exists to close. */
          const band = sided && CFG.wallFadeM > 0 && !it.stumped
            ? this.wallBand(lf, mat, lfPic, it.cell.x, it.cell.y, PICK_LEFT,
                            Math.min(CFG.wallFadeM, mL)) : null;
          const bit = this.paintSide(ctx, qL, mL, lf, fill, band);
          if (bit) faded++;
          if (bit === 2) banded++;
          walls++; wallPx += this.area(qL);
          /* A point the block certainly painted: below the faded top edge, on
             the diagonal of the face it just laid down. */
          myAim = { x: (qL[0].x + qL[2].x) / 2, y: qL[0].y + (qL[2].y - qL[0].y) * 0.6 };
        } else {
          buried++;
          if (this.lipShown(it.nbrL, b)) { lips++; faded += this.lip(ctx, it.left, lf); }
        }
        if (qR) {
          const fill = sided ? this.wall(rf, mat, qR, mR, rfPic,
            it.cell.x, it.cell.y, PICK_RIGHT) : rf;
          const band = sided && CFG.wallFadeM > 0 && !it.stumped
            ? this.wallBand(rf, mat, rfPic, it.cell.x, it.cell.y, PICK_RIGHT,
                            Math.min(CFG.wallFadeM, mR)) : null;
          const bit = this.paintSide(ctx, qR, mR, rf, fill, band);
          if (bit) faded++;
          if (bit === 2) banded++;
          walls++; wallPx += this.area(qR);
        } else {
          buried++;
          if (this.lipShown(it.nbrR, b)) { lips++; faded += this.lip(ctx, it.right, rf); }
        }
        /* THE TOP METRE OF A VISIBLE WALL FADES AWAY, right here rather than in
           a pass of its own, because the block in front of this one paints after
           it and must cover the fade where it covers the wall. A wall cut down
           to mL/mR metres is only faded as far down as it really stands, so a
           stub of wall behind a tall block never fades past its own height. That
           is what paintSide() above does, band and all. */
        /* A face may only be cut away where the block in front of it paints
           solid. Where that block is not painted the whole wall comes back, so
           a cut column can never open a hole -- and the two counts are what a
           test reads to prove the guard does the work rather than to argue it
           does. */
        if (it.nbrL >= 0 && alphaOf[it.nbrL] !== 1) { if (qL) kept++; else lost++; }
        if (it.nbrR >= 0 && alphaOf[it.nbrR] !== 1) { if (qR) kept++; else lost++; }
      }
      /* THE TOP OF A WALL IS THE ROCK, NOT A LID. Everything else is painted as
         it always was: the ground here is a floor's own surface, or a ramp's
         slope, and both carry their material. A block's cap -- the stone lid it
         laid across the top of the rock, material and all -- is not; what is
         painted in its place is the rock itself, flat and untextured, lit like
         the wall's own faces, so a wall's top is the stuff the wall is cut out of
         and the face below dissolves into it rather than into a cap. See
         `wallBody`.

         It is a flat fill and NOT the ground's own painter, on purpose: a
         material on a wall's top is a surface somebody laid, and laying one over
         every rock in the labyrinth is the tiling this is here to remove. */
      if (this.capShown(it)) {
        if (it.block && !this.wallCaps) {
          this.poly(ctx, it.top, litShade(def.side, CFG.shadeLeft * lift, it.light));
          body++;
        } else {
          const tf = litShade(def.top, lift, it.light);
          const gpat = this.ground(tf, mat, it, s, worldStamp,
            this.drawn(mat) ? lightShade(lift, it.light) : undefined);
          /* How many DIFFERENT pictures this frame's ground actually wore, so a
             test can say the scatter reached the screen rather than that the list
             it was picked from had more than one entry in it. */
          if (gpat && gpat._pick >= 0) picks.add(mat + '|' + gpat._pick);
          this.poly(ctx, it.top, gpat);
          caps++;
        }
      } else capsOff++;

      kinds[it.cell.tile] = (kinds[it.cell.tile] || 0) + 1;
      drawn++;
      if (items) {
        items.push({ i: it.i, kind: 'cell', x: it.cell.x, y: it.cell.y, h: it.cell.h,
                     tile: it.cell.tile, slope: it.cell.slope, cutaway: it.cutaway,
                     light: it.light, alpha: alpha, sx: it.cx, sy: it.cy, aim: myAim });
      }
    }

    ctx.globalAlpha = 1;

    this.consumed = {
      tick: s.tick, count: drawn, kinds: kinds,
      people: people, structures: structures, worn: wornDrawn,
      cutaway: cutaway, cut: cut, outlined: outlined,
      /* How many hidden blocks kept a foot of rock standing. See stumpOf(): a
         test reads it together with `cut`, because between them every square the
         batch holds has to be painted exactly once -- either whole, or as its own
         foot, or not at all. */
      stumps: stumps,
      /* Side walls only: how many were painted, how much picture they covered,
         and how many were buried in the block in front and not painted at all. */
      walls: walls, wallPx: Math.round(wallPx), buried: buried,
      /* The top faces of the picture: floors and ramps painted as surfaces
         somebody laid, and `body` of them painted as the plain rock of a wall.
         `capsOff` is what is left unpainted, which with the look the game ships
         is nothing. The three together are every square that got as far as being
         drawn. */
      caps: caps, capsOff: capsOff, body: body,
      /* How many wall faces painted a faded band across their top metre, and how
         many of those bands carried the face's own material rather than a flat
         colour. Zero bands with walls > 0 and the fade switched on is a fade that
         reached nothing; bands > 0 with banded 0 is a wall whose stonework still
         stops at the bottom of the band. */
      faded: faded, banded: banded,
      /* How many faces the block in front would have hidden came back as the
         strip its deleted lid used to cover -- see lipShown(). Zero of these
         with lids left off is rock with a hole through the middle of it. */
      lips: lips,
      /* How many faces came back in full because the block that would have
         hidden them is cut away, and how many stayed out anyway -- which must
         be none. */
      kept: kept, lost: lost,
      /* How many different dropped-in pictures the GROUND wore this frame: 1
         means every square metre picked the same one, which is a material with
         one picture or a picker that is doing nothing. */
      picks: picks.size,
      lights: s.lit ? lightSourcesIn(s).length : 0,
      focus: focusIdx, zoom: s.cam.zoom,
      bufW: this.w, bufH: this.h
    };
    if (items) this.consumed.items = items;
    s.viewDirty = false;
    return this.consumed;
  },

  /* The scene painted flat in identity colours: one pixel of it says what the
     player is pointing at, elevation and ramps and crawlers and half-built
     structures included.
     
     NOTHING IN THE GAME READS THIS ANY MORE. pickAt() works the same answer
     out arithmetically, and the mouse went from being the most expensive thing
     in a frame to almost free. This stays because it is the YARDSTICK: it is
     the answer the game gave for years, painted the straightforward way, and
     the battery that proves the new way agrees with the old way is a
     comparison against this. Keeping a correct but slow version of a thing
     beside a fast one, and proving them equal, is the whole reason the fast
     one is allowed to exist. (See "nothing is painted twice" in CLAUDE.md.) */
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
      /* A square the picture does not paint is not painted here either, so the
         yardstick stays the same question the game asks in both dial settings. */
      if (this.cutOut(it)) continue;
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
        /* WHICH two wall faces are painted is decided by the same call the
           picture makes, and it has to be. A wall is cut down only where the
           block in front of it paints SOLID, so with `cutSolid` 0 -- rock
           standing in for a left-out square -- the cut is refused and the whole
           wall comes back (`wallsPainted`). Reading the stored `cutL`/`cutR`
           here instead claimed those walls were not there, and the battery that
           compares this answer with the game's own was then measuring this
           function's blind spot rather than the two agreeing. */
        const faced = this.wallsPainted(it, this.alphas(s, b).list);
        const qL = faced.l, qR = faced.r;
        if (qL) this.poly(ctx, qL, col);
        if (qR) this.poly(ctx, qR, col);
        /* The strip of a culled face that still shows is painted, so it is
           painted here too -- otherwise the yardstick would deny a pixel the
           picture really did paint, and the battery would be measuring the
           yardstick's blind spot rather than the two answers agreeing. */
        if (!qL && this.lipShown(it.nbrL, b)) this.poly(ctx, this.lipQuad(it.left), col);
        if (!qR && this.lipShown(it.nbrR, b)) this.poly(ctx, this.lipQuad(it.right), col);
      }
      /* Whatever covers a square's top in the picture covers it here too: a
         wall's top is rock now rather than a lid, and it is in the picture, so it
         is in the answer. The two must not disagree about that in either
         direction, or the pointer would name a surface nobody can see. */
      if (this.capShown(it)) this.poly(ctx, it.top, col);
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

  /* Is this point inside this shape? Even-odd crossing count, which for a
     simple shape is the same as the winding rule canvas fills by.
     
     The point asked about is the MIDDLE of a pixel, because that is the point
     canvas itself tests when it decides whether to fill one -- so asking here
     gives the same answer the painted buffer gave. */
  inShape(pts, px, py) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > py) !== (b.y > py) &&
          px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
  },

  /* What is under the pointer?
   *
   * "Anything you can SEE" (rule 8) is the standing answer, and the way that
   * was honoured until now was to paint the whole scene a second time flat in
   * identity colours and read the pixel back. That is a second full pass over
   * every face in the frame -- the single most expensive thing left in a
   * frame, paid every frame the pointer was over the canvas, because the view
   * rides a walking crawler and so the picture is rebuilt every frame anyway.
   *
   * It is not needed. The list this reads is already in painter's order, back
   * to front, and the last thing to paint a pixel is what the player sees
   * there. Walking that list the OTHER way -- front to back -- and stopping at
   * the first shape that contains the point finds that exact same thing, with
   * no canvas, no colours and no pixels: just the shapes that were already
   * worked out for the picture.
   *
   * So what is compared is not "the same polygons" but the same polygons
   * tested at the same point in the same order, which is why the two answers
   * agree. Where they DO differ is a genuine improvement: a pixel on the edge
   * of a shape came back from the painted buffer as a BLEND of two identity
   * colours -- a number belonging to neither, sometimes a number belonging to
   * something else entirely, and sometimes nothing at all. There is no blend
   * here. A pixel belongs to the shape it is inside, and to nothing else.
   *
   * The bounding box each item already carries is a cheap no: that is the same
   * box the picture was culled by, widened by a pixel so that a box drawn a
   * hair too tight can never hide a shape behind it. */
  pickAt(s, bx, by) {
    const x = Math.floor(bx), y = Math.floor(by);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    const px = x + 0.5, py = y + 0.5;
    const b = this.batch;
    /* Whether a square is painted at all is part of the answer -- a wall is
       painted whole where the block in front of it is not painted at all -- so
       the plan the picture used is worked out here once, rather than per square. */
    const alphaOf = this.alphas(s, b).list;
    for (let k = b.length - 1; k >= 0; k--) {
      const it = b[k];
      if (px < it.minX - 1 || px > it.maxX + 1 ||
          py < it.minY - 1 || py > it.maxY + 1) continue;
      if (it.kind === 'cell') {
        /* Rock that is not in the picture is not an answer either: whatever is
           visible where the rock would have been is what the player meant. */
        if (this.cutOut(it)) continue;
        if (it.solid) {
          /* The same two choices drawPick() makes, and the same ones the picture
             makes -- see wallsPainted(). A wall is cut down where something flat
             and tall enough stands in front of it and is painted; where that
             something is not painted at all, the whole wall comes back, and a
             wall you can see is a wall you can point at (rule 8). Both faces
             belong to this one square, so their order does not matter here. */
          const faced = this.wallsPainted(it, alphaOf);
          const qL = faced.l, qR = faced.r;
          if (qL && this.inShape(qL, px, py)) return this.hit(s, it.i);
          if (qR && this.inShape(qR, px, py)) return this.hit(s, it.i);
          /* A culled face still shows a strip of itself over the front block's
             shoulder, and rule 8 has no exception for a strip: rock you can see
             is rock you can point at. */
          if (!qL && this.lipShown(it.nbrL, b) &&
              this.inShape(this.lipQuad(it.left), px, py)) return this.hit(s, it.i);
          if (!qR && this.lipShown(it.nbrR, b) &&
              this.inShape(this.lipQuad(it.right), px, py)) return this.hit(s, it.i);
        }
        if (this.capShown(it) && this.inShape(it.top, px, py)) return this.hit(s, it.i);
        continue;
      }
      const parts = it.parts;
      for (let r = 0; r < parts.length; r++) {
        const fs = parts[r].faces;
        for (let g = 0; g < fs.length; g++) {
          if (this.inShape(fs[g].pts, px, py)) return this.hit(s, it.i);
        }
      }
    }
    return -1;
  },

  /* One number identifies anything on screen, and the three runs of numbers
     are worked out from how much is in the world -- so a number left over from
     before a piece was fetched is refused rather than answered as somebody
     else. */
  hit(s, i) {
    const max = s.world.cells.length + s.actors.length
              + (s.camp ? s.camp.sites.length : 0);
    return (i < 0 || i >= max) ? -1 : i;
  }
};
