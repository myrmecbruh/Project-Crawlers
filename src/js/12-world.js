/* A piece of the labyrinth: rooms cut into solid rock, and halls dug between
 * them. Every cell is one square metre (rule 7). A cell is the SURFACE of a
 * column: its height in metres, what it is made of, and, if it is a ramp,
 * which way it climbs.
 *
 * Rooms sit at different levels and the halls between them step up and down a
 * metre at a time, with a ramp at every step, so the whole place is walkable
 * without anything ever climbing more than a metre.
 *
 * The maze is a plain of these pieces, addressed and made on demand: see
 * makeWorld() and makePiece() below.
 */

const SLOPE_FLAT = '';
const SLOPE_XUP = 'x+';   /* climbs toward increasing x  (screen: down-right) */
const SLOPE_XDN = 'x-';
const SLOPE_YUP = 'y+';   /* climbs toward increasing y  (screen: down-left)  */
const SLOPE_YDN = 'y-';

/* The four corners of a cell, in the order the renderer walks them:
   A = north (top of the diamond), B = east, C = south, D = west. */
const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]];

/* For each slope, which of those four corners sit one metre higher. */
const SLOPE_HIGH = {};
SLOPE_HIGH[SLOPE_FLAT] = [0, 0, 0, 0];
SLOPE_HIGH[SLOPE_XUP] = [0, 1, 1, 0];   /* B and C */
SLOPE_HIGH[SLOPE_XDN] = [1, 0, 0, 1];   /* A and D */
SLOPE_HIGH[SLOPE_YUP] = [0, 0, 1, 1];   /* C and D */
SLOPE_HIGH[SLOPE_YDN] = [1, 1, 0, 0];   /* A and B */

/* The four EDGES of a cell, named by the corner they run from going
   A -> B -> C -> D: edge 0 is A-B (north), 1 is B-C (east), 2 is C-D (south),
   3 is D-A (west). EDGE_STEP says which way to step to the square that shares
   that edge; ACROSS[edge][c] is which of THAT square's corners is the same
   point of the grid as our corner c (A=0, B=1, C=2, D=3), or -1 when c is not
   on that edge at all. */
const EDGE_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ACROSS = [
  [3, 2, -1, -1],   /* north of us: our A is its D, our B its C */
  [-1, 0, 3, -1],   /* east:  our B is its A, our C its D */
  [-1, -1, 1, 0],   /* south: our C is its B, our D its A */
  [1, -1, -1, 2]    /* west:  our D is its C, our A its B */
];

function slopeFor(dx, dy) {
  if (dx > 0) return SLOPE_XUP;
  if (dx < 0) return SLOPE_XDN;
  if (dy > 0) return SLOPE_YUP;
  return SLOPE_YDN;
}

/* What a room is floored with. Two stretches of labyrinth should not look
   alike (rule 5), so a room picks a main material and is speckled with a
   second one. */
const ROOM_FLOORS = ['stone_floor', 'packed_earth', 'moss_stone', 'stone_floor',
                     'bone_litter', 'rubble', 'shallow_water', 'packed_earth'];
const ROOM_SPECKLE = ['rubble', 'bone_litter', 'moss_stone', 'shallow_water'];
const HALL_FLOORS = ['stone_floor', 'packed_earth'];

/* ---- where a piece is worked out from -----------------------------------
 * A piece has an ADDRESS: which column and which row of the plane it sits in.
 * Its contents come from the match seed and that address alone, so the same
 * address always gives the same piece -- throw one away and make it again and
 * nobody can tell (rule 5, "the labyrinth goes on forever").
 *
 * The untangling is what makes the address matter: without it every piece
 * would be the same piece.
 */
function pieceSeed(seed, cx, cy) {
  /* The piece the match starts in keeps the plain seed, so a seed still names
     the labyrinth it always named -- a test that quotes "seed 23" or "seed 777"
     goes on meaning the same world, and the ground under the camp is the ground
     it would have been before there was more than one piece. */
  if (cx === 0 && cy === 0) return seed >>> 0;
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (cx | 0), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h ^ (cy | 0), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/* Which piece lives at an address, or nothing. Pieces are filed by column and
   then by row -- two plain numbers, so finding one costs no more than filing it
   did, and the plane never runs out of addresses however far it is walked. */
function pieceAt(world, cx, cy) {
  const column = world.pieces.get(cx);
  return column ? (column.get(cy) || null) : null;
}

function fileIn(world, piece) {
  let column = world.pieces.get(piece.cx);
  if (!column) { column = new Map(); world.pieces.set(piece.cx, column); }
  column.set(piece.cy, piece);
}

/* ---- and where the pieces join up ---------------------------------------
 * A piece on its own is a sealed box, and a labyrinth that stops at the edge of
 * a piece is not one that goes on forever. Every join between two pieces has a
 * handful of DOORWAYS: squares on the rim of each piece, at an agreed height,
 * with a corridor dug inward to a room.
 *
 * A join belongs to the piece with the smaller column (for the joins that run
 * along a column of pieces) or the smaller row (for those that run along a row),
 * so both pieces either side name the join the same way and read the same
 * stream. That is the whole trick: two pieces that rolled their own doorway
 * would put them in different places and the two sides would not meet.
 */
const JOIN_ALONG_X = 0;   /* the pieces stand side by side in x */
const JOIN_ALONG_Y = 1;

function joinSeed(seed, ownerCx, ownerCy, axis) {
  let h = (seed >>> 0) ^ (axis ? 0x7feb352d : 0x846ca68b);
  h = Math.imul(h ^ (ownerCx | 0), 0x9e3779b1) >>> 0;
  h = (h ^ (h >>> 15)) >>> 0;
  h = Math.imul(h ^ (ownerCy | 0), 0x85ebca77) >>> 0;
  return (h ^ (h >>> 13)) >>> 0;
}

/* The doorways of one join, from the join's own stream: how many, where along
   the rim, and how high. `along` counts up the shared coordinate -- the row
   number for a join that runs up a column of pieces, the column number for one
   that runs along a row -- and both pieces count the same squares, so a doorway
   here is the same doorway there. */
function joinOpenings(seed, ownerCx, ownerCy, axis) {
  const n = CFG.chunkTiles;
  const rand = makeRand(joinSeed(seed, ownerCx, ownerCy, axis));
  const lo = CFG.joinMargin, hi = n - 1 - CFG.joinMargin;
  let count = CFG.joinMin
            + Math.floor(rand() * (Math.max(0, CFG.joinMax - CFG.joinMin) + 1));
  count = Math.max(1, Math.min(count, hi - lo + 1));
  const out = [];
  const share = (hi - lo + 1) / count;
  for (let i = 0; i < count; i++) {
    /* Each doorway owns an equal share of the join and lands somewhere inside
       its own share, so two of them never crowd into the same corner. */
    const along = Math.min(hi, lo + Math.floor(i * share + rand() * share));
    const elev = Math.floor(rand() * (CFG.maxElev + 1));
    out.push({ along: along, elev: elev });
  }
  return out;
}

/* This piece's four joins, each giving its doorways as LOCAL squares with the
   direction the doorway faces (the way the corridor leaves the rim, inward).
   Naming: east is the neighbour at cx+1, north the neighbour at cy-1, so the
   square x=0 is the piece's west rim and y=n-1 its south rim. */
function joinMouths(seed, cx, cy) {
  const n = CFG.chunkTiles;
  const out = [];
  /* East and west doorways slide up the rim, north and south ones slide along
     it, because the shared coordinate is the row for one pair and the column for
     the other. */
  for (const o of joinOpenings(seed, cx, cy, JOIN_ALONG_X))
    out.push({ x: n - 1, y: o.along, elev: o.elev, dx: -1, dy: 0, join: 'east' });
  for (const o of joinOpenings(seed, cx - 1, cy, JOIN_ALONG_X))
    out.push({ x: 0, y: o.along, elev: o.elev, dx: 1, dy: 0, join: 'west' });
  for (const o of joinOpenings(seed, cx, cy, JOIN_ALONG_Y))
    out.push({ x: o.along, y: n - 1, elev: o.elev, dx: 0, dy: -1, join: 'south' });
  for (const o of joinOpenings(seed, cx, cy - 1, JOIN_ALONG_Y))
    out.push({ x: o.along, y: 0, elev: o.elev, dx: 0, dy: 1, join: 'north' });
  for (const m of out) m.open = false;
  return out;
}

/* ---- the world, which is made of pieces ---------------------------------
 * This is the front door to the ground. `at()` hands back the square that is
 * THERE, and makes nothing: a lookup can never quietly change the world, which
 * is what stops a stray call from generating an endless maze. `makePiece()` is
 * the one place a piece is made, and `ensure()` is the impatient version of it:
 * make the piece, then hand the square over.
 *
 * `hot` is the piece the last lookup landed in. Squares get asked for in
 * bursts -- this one, then the one beside it -- so remembering the last piece
 * turns almost every lookup into two subtractions and a compare, and the
 * picture does not pay for the addresses at all.
 */
function makeWorld(seed) {
  const n = CFG.chunkTiles;
  const world = {
    seed: seed >>> 0,
    n: n,
    /* Where the view looks when there is no camp to sit on. */
    home: { x: n / 2, y: n / 2 },
    pieces: new Map(),        /* column -> row -> piece */
    live: [],                 /* the pieces that are made, in the order made */
    cells: [],                /* every square of every live piece */
    rooms: [],                /* every room of every live piece */
    hot: null,                /* the piece the last lookup landed in */

    at(x, y) {
      const p = this.hot;
      if (p) {
        const lx = x - p.ox, ly = y - p.oy;
        if (lx >= 0 && ly >= 0 && lx < n && ly < n) return p.cells[ly * n + lx];
      }
      return this.atAddress(Math.floor(x / n), Math.floor(y / n), x, y);
    },

    /* The slower half of at(), kept out of the way so the common case above
       stays three lines. It works out the address, remembers what lives there
       and hands the square back -- and if no piece lives there, that is the
       answer: nothing. */
    atAddress(cx, cy, x, y) {
      const p = pieceAt(this, cx, cy);
      this.hot = p;
      return p ? p.cells[(y - p.oy) * n + (x - p.ox)] : null;
    },

    ensure(x, y) {
      const p = makePiece(this, Math.floor(x / n), Math.floor(y / n));
      return p.cells[(y - p.oy) * n + (x - p.ox)];
    }
  };
  addPiece(world, generatePiece(world.seed, 0, 0));
  return world;
}

/* Take a piece into the world: its squares join the list the picture is drawn
   from, its rooms join the list everything looks rooms up in, and the squares
   are told which room of THAT list they belong to -- room numbers run across
   the whole live world, so a square's number always names a room that exists. */
function addPiece(world, piece) {
  if (piece.live) return piece;
  piece.live = true;
  fileIn(world, piece);
  world.live.push(piece);
  world.hot = piece;        /* the square just asked for is in this piece now */
  for (const r of piece.rooms) {
    r.piece = piece;
    r.local = r.index;
    r.index = world.rooms.length;
    world.rooms.push(r);
  }
  piece.firstCell = world.cells.length;    /* where its squares start */
  for (const c of piece.cells) {
    if (c.room >= 0) c.room = piece.rooms[c.room].index;
    world.cells.push(c);
  }
  return piece;
}

/* Make the piece at an address, or hand back the one already there. This is the
   one place ground is made: nothing else in the game calls generatePiece, so
   "how often does the game build?" has a single answer to read. */
function makePiece(world, cx, cy) {
  const p = pieceAt(world, cx, cy);
  return p || addPiece(world, generatePiece(world.seed, cx, cy));
}

/* ---- the live window -----------------------------------------------------
 * The labyrinth goes on forever; the ground the game HOLDS cannot. Every live
 * piece is a piece's worth of rooms to keep in memory and a piece's worth of
 * squares for the picture to walk over, so a match keeps a WINDOW of them: the
 * ground the picture can reach, a ring of pieces beyond that, and a ring round
 * every crawler and every camp site.
 *
 * This decides WHEN a piece is made, never WHAT it is. A piece comes from the
 * match seed and its address alone, so one that appears at the edge of the
 * window is exactly the piece it would have been had it been made at the start
 * (rule 5: throw one away and make it again and nobody can tell).
 *
 * Making one is real work -- rooms, halls, ramps, doorways -- so they arrive a
 * few at a time, nearest the middle of the picture first. The pieces the
 * camera, the crawlers and the camp are standing IN are the exception: those
 * are made at once, because whatever else is late, the ground underfoot is not.
 */

/* How far the picture can reach from the middle of the screen, in squares. The
   screen is a rectangle seen at an angle, so this is asked in the two
   directions the picture is drawn in: across it (u - v in project()) and down
   it (u + v). Ground inside this distance is on the screen whichever way the
   view is turned, which is what makes the answer survive a quarter-turn.

   Height counts as well as width: ground seven metres up is drawn that much
   higher, so a square low on the screen can be taller than the screen is deep
   and still show. tile_h_high is the taller of the two camera angles, so
   building the sum on it cannot come up short. */
function screenReach(viewW, viewH) {
  const tall = (CFG.maxElev + CFG.rockHeight + 1) * CFG.rise;
  const across = (viewW / 2) / (CFG.tileW / 2);
  const down = (viewH / 2 + tall) / (CFG.tileHHigh / 2);
  return (across + down) / 2;
}

/* Every address the window wants. `urgent` ones are made this very frame, the
   rest wait their turn. The picture and whatever crawler is standing in it ask
   for the same piece, so the answers are de-duplicated: the ground under
   everybody's feet is one piece, made once. */
function wantedPieces(state, reach, ring) {
  const world = state.world, n = world.n, cam = state.cam;
  const want = new Map();
  const ask = function (x, y, box, urgent) {
    const ownX = Math.floor(x / n), ownY = Math.floor(y / n);
    const cx0 = Math.floor((x - box) / n), cx1 = Math.floor((x + box) / n);
    const cy0 = Math.floor((y - box) / n), cy1 = Math.floor((y + box) / n);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        /* The piece this asker is standing in is wanted NOW however it got on
           the list: the camera's box is the wider one, so it can reach a piece
           a crawler is standing in before that crawler ever asks, and the
           answer must still be "make it this frame". Somebody standing in a
           hole for even one frame is what this whole rule exists to stop. */
        const mine = urgent && cx === ownX && cy === ownY;
        const key = cx + ':' + cy;
        const had = want.get(key);
        if (had) { if (mine) had.urgent = true; continue; }
        want.set(key, {
          cx: cx, cy: cy,
          d: Math.hypot((cx + 0.5) * n - cam.fx, (cy + 0.5) * n - cam.fy),
          urgent: mine
        });
      }
    }
  };
  /* The picture first, so its piece is the one that is never missing. */
  ask(cam.fx, cam.fy, reach + ring * n, true);
  for (const a of state.actors) ask(a.x, a.y, ring * n, true);
  if (state.camp) for (const site of state.camp.sites) ask(site.x, site.y, ring * n, true);

  const out = [];
  for (const p of want.values()) if (!pieceAt(world, p.cx, p.cy)) out.push(p);
  return out;
}

/* Make the ground the window wants and say how many pieces were made, so the
   caller knows whether the picture has to be built again. This runs on every
   frame of the picture rather than every step of the game, so dragging the view
   by hand fetches ground exactly as walking does. */
function updateLiveWorld(state, viewW, viewH) {
  const world = state.world;
  const want = wantedPieces(state,
      screenReach(viewW > 0 ? viewW : CFG.maxBufW,
                  viewH > 0 ? viewH : CFG.maxBufH),
      CFG.liveRing);
  if (!want.length) return 0;

  want.sort(function (p, q) { return p.d - q.d; });
  const cellsBefore = world.cells.length;
  let made = 0;
  for (const p of want) {
    if (p.urgent) { makePiece(world, p.cx, p.cy); made++; }
  }
  let left = CFG.chunksPerFrame;
  for (const p of want) {
    if (left <= 0) break;
    if (p.urgent) continue;
    makePiece(world, p.cx, p.cy);
    left--; made++;
  }
  /* Pick numbers run cells, then crawlers, then camp sites, so new ground at
     the end of the cell list slides every crawler's and every site's number
     along. Whatever is pinned or hovered has to slide with them, or the panel
     and the outline would start pointing at somebody else. (A match that walks
     for hours would eventually run the cell numbers past what a colour can
     carry; see the pick table note in ROADMAP.) */
  const grew = world.cells.length - cellsBefore;
  if (grew > 0) {
    if (state.selected >= cellsBefore) state.selected += grew;
    if (state.hover >= cellsBefore) state.hover += grew;
  }
  return made;
}

function generatePiece(seed, cx, cy) {
  const n = CFG.chunkTiles;
  const ox = cx * n, oy = cy * n;          /* where this piece belongs */
  const rand = makeRand(pieceSeed(seed, cx, cy));
  const rockTop = CFG.maxElev + CFG.rockHeight;

  const cells = new Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      cells[y * n + x] = { x: x, y: y, h: rockTop, tile: 'stone_block',
                           slope: SLOPE_FLAT, room: -1 };
    }
  }
  /* Everything below works in LOCAL squares, 0 .. n-1, exactly as the whole
     world used to. `at` is swapped for the world-square one at the end. */
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n) ? null : cells[y * n + x];
  const rooms = [];
  const world = { seed: seed, n: n, cells: cells, rooms: rooms, rockTop: rockTop,
                  at: at, cx: cx, cy: cy, ox: ox, oy: oy,
                  live: false };

  /* ---- rooms ----------------------------------------------------------- */
  const span = CFG.roomMax - CFG.roomMin;
  for (let tries = 0; tries < 600 && rooms.length < CFG.rooms; tries++) {
    const w = CFG.roomMin + Math.floor(rand() * (span + 1));
    const h = CFG.roomMin + Math.floor(rand() * (span + 1));
    const x = 2 + Math.floor(rand() * (n - w - 4));
    const y = 2 + Math.floor(rand() * (n - h - 4));
    let clash = false;
    for (const r of rooms) {
      if (x - 3 < r.x + r.w && x + w + 3 > r.x && y - 3 < r.y + r.h && y + h + 3 > r.y) {
        clash = true; break;
      }
    }
    if (clash) continue;
    rooms.push({ index: rooms.length, x: x, y: y, w: w, h: h, elev: 0,
                 floor: ROOM_FLOORS[Math.floor(rand() * ROOM_FLOORS.length)],
                 speckle: ROOM_SPECKLE[Math.floor(rand() * ROOM_SPECKLE.length)],
                 cx: x + (w >> 1), cy: y + (h >> 1), area: w * h });
  }

  /* Order the rooms nearest-first and walk the levels up and down by a metre
     at a time, so neighbouring rooms are never more than a step apart. */
  const chain = [rooms[0]];
  const left = rooms.slice(1);
  while (left.length) {
    const from = chain[chain.length - 1];
    let best = 0, bestD = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = Math.abs(left[i].cx - from.cx) + Math.abs(left[i].cy - from.cy);
      if (d < bestD) { bestD = d; best = i; }
    }
    chain.push(left.splice(best, 1)[0]);
  }
  let level = Math.floor(rand() * (CFG.maxElev + 1));
  for (const r of chain) {
    level = Math.max(0, Math.min(CFG.maxElev, level + Math.round(rand() * 2 - 1)));
    r.elev = level;
  }

  /* ---- room floors, laid FIRST and never dug through afterwards ---------- */
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = at(x, y);
        c.h = r.elev;
        c.slope = SLOPE_FLAT;
        c.tile = rand() < 0.12 ? r.speckle : r.floor;
        c.room = r.index;
      }
    }
  }

  /* ---- and then, for some of them, what the place WAS ------------------- */
  /* The border ring is deliberately left alone by shapeRoom(), because that is
     where halls arrive: a hall still meets a room at the room's own level and
     nothing about digging one had to learn that rooms have shape now. */
  for (const r of rooms) {
    r.known = false;          /* until a crawler works out what it was */
    r.studies = 0;
    if (rand() >= CFG.roomNamedChance) { r.place = null; continue; }
    r.place = nameRoom(rand);
    if (r.place) r.place.shaped = shapeRoom(world, r, rand, r.place);
  }

  /* ---- halls ------------------------------------------------------------ */
  function pathBetween(a, b, horiz) {
    const pts = [];
    let x = a.cx, y = a.cy;
    /* A hall dug from a doorway leaves the rim straight in and not sideways: it
       steps inward first. Without that, a corridor could run ALONG the rim it
       was dug from and flatten the ground under another doorway's square, whose
       height the piece next door has already agreed to. */
    const horizFirst = horiz === undefined ? rand() < 0.5 : horiz;
    const stepTo = (tx, ty) => {
      while (x !== tx) { x += Math.sign(tx - x); pts.push([x, y]); }
      while (y !== ty) { y += Math.sign(ty - y); pts.push([x, y]); }
    };
    pts.push([x, y]);
    if (horizFirst) { stepTo(b.cx, y); stepTo(b.cx, b.cy); }
    else { stepTo(x, b.cy); stepTo(b.cx, b.cy); }
    return pts;
  }

  /* A hall takes its level from every room it passes through, and does all its
     climbing in the rock between them. That is why a hall can cross a third
     room without cutting it in half: the room is an anchor, not an obstacle.
     `width` is only ever 1, for the narrow corridors behind a doorway. */
  function digHall(a, b, width) {
    const pts = pathBetween(a, b, a.mouth ? (a.dx !== 0) : undefined);
    if (pts.length < 3) return false;

    const anchor = new Array(pts.length).fill(-1);
    for (let i = 0; i < pts.length; i++) {
      const c = at(pts[i][0], pts[i][1]);
      if (c && c.room >= 0) anchor[i] = rooms[c.room].elev;
    }
    if (anchor[0] < 0) anchor[0] = a.elev;
    if (anchor[pts.length - 1] < 0) anchor[pts.length - 1] = b.elev;

    const elev = new Array(pts.length);
    let i = 0;
    while (i < pts.length) {
      if (anchor[i] >= 0) { elev[i] = anchor[i]; i++; continue; }
      let j = i;
      while (j < pts.length && anchor[j] < 0) j++;
      const prev = i > 0 ? elev[i - 1] : (j < pts.length ? anchor[j] : a.elev);
      const to = j < pts.length ? anchor[j] : prev;
      const gap = j - i + 1;
      if (Math.abs(to - prev) > gap) return false;   /* no room to step safely */
      for (let k = i; k < j; k++) {
        elev[k] = Math.round(prev + (to - prev) * ((k - i + 1) / gap));
      }
      i = j;
    }

    const floor = HALL_FLOORS[Math.floor(rand() * HALL_FLOORS.length)];
    const carve = (x, y, h, slope) => {
      const c = at(x, y);
      if (!c || c.room >= 0) return;      /* a room floor is never dug through */
      c.h = h;
      c.slope = slope;
      c.tile = slope ? 'stone_ramp' : floor;
    };

    for (let k = 0; k < pts.length; k++) {
      const x = pts[k][0], y = pts[k][1];
      let slope = SLOPE_FLAT;
      if (k + 1 < pts.length && elev[k + 1] === elev[k] + 1) {
        slope = slopeFor(pts[k + 1][0] - x, pts[k + 1][1] - y);
      } else if (k > 0 && elev[k - 1] === elev[k] + 1) {
        slope = slopeFor(pts[k - 1][0] - x, pts[k - 1][1] - y);
      }
      const dx = k + 1 < pts.length ? pts[k + 1][0] - x : (k > 0 ? x - pts[k - 1][0] : 1);
      const px = dx !== 0 ? 0 : 1, py = dx !== 0 ? 1 : 0;
      const wide = width || CFG.hallWidth;
      for (let wdt = 0; wdt < wide; wdt++) {
        carve(x + px * wdt, y + py * wdt, elev[k], slope);
      }
    }
    return true;
  }

  for (let k = 1; k < chain.length; k++) digHall(chain[k - 1], chain[k]);
  for (let k = 0; k + 2 < chain.length; k++) {
    if (rand() < 0.45) digHall(chain[k], chain[k + 2]);
  }

  /* ---- and then PROVE it is all walkable, and dig again until it is ------
     Halls cross each other and the last one dug wins, so a room can end up
     sealed off. Rather than hope, measure: flood the place, find what is cut
     off, and dig to it. */
  const centreCell = (r) => at(r.cx, r.cy);
  for (let pass = 0; pass < 24; pass++) {
    const main = reachableFrom(world, chain[0].cx, chain[0].cy);
    const orphans = rooms.filter(function (r) { return main.at(centreCell(r)) < 0; });
    if (!orphans.length) break;
    const joined = rooms.filter(function (r) { return main.at(centreCell(r)) >= 0; });
    const orphan = orphans[0];
    joined.sort(function (p, q) {
      return (Math.abs(p.cx - orphan.cx) + Math.abs(p.cy - orphan.cy))
           - (Math.abs(q.cx - orphan.cx) + Math.abs(q.cy - orphan.cy));
    });
    let dug = false;
    for (let t = 0; t < joined.length && !dug; t++) dug = digHall(joined[t], orphan);
    if (!dug) {
      /* Nothing could reach it at its own level. Move it to one that can. */
      orphan.elev = joined.length ? joined[0].elev : orphan.elev;
      for (let y = orphan.y; y < orphan.y + orphan.h; y++) {
        for (let x = orphan.x; x < orphan.x + orphan.w; x++) at(x, y).h = orphan.elev;
      }
      for (let t = 0; t < joined.length && !dug; t++) dug = digHall(joined[t], orphan);
      if (!dug) break;
    }
  }

  /* Whatever still cannot be reached is filled back in. A room nobody can walk
     to is not a room, it is a rumour -- and leaving one in the list would make
     "every room is reachable" a hope instead of a fact.
   *
   * Filling one back in takes its floor away, though, and that floor can be the
   * only way through to somewhere else -- so one measurement is not enough.
   * This measures, fills whatever the measurement found cut off, and measures
   * AGAIN, until a measurement turns up nothing new. It always ends: every
   * round that changes anything leaves one fewer room to measure.
   *
   * So there are two facts to rely on afterwards, not hopes. The last
   * measurement taken is the flood from the first room, and it saw every room
   * still in the list. */
  for (;;) {
    const field = reachableFrom(world, rooms[0].cx, rooms[0].cy);
    const kept = [];
    for (const r of rooms) {
      if (field.at(at(r.cx, r.cy)) >= 0) { kept.push(r); continue; }
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const c = at(x, y);
          c.h = rockTop; c.tile = 'stone_block'; c.slope = SLOPE_FLAT; c.room = -1;
        }
      }
    }
    if (kept.length === rooms.length) break;
    /* Renumber, so a cell's room number always points at a room that exists. A
       cell whose room was filled back in above has already been told it belongs
       to no room; one that was not covered by that fill loses its room here
       rather than keeping a number that leads nowhere. */
    const remap = {};
    for (let i = 0; i < kept.length; i++) { remap[kept[i].index] = i; }
    for (const c of cells) {
      if (c.room < 0) continue;
      const to = remap[c.room];
      c.room = (to === undefined) ? -1 : to;
    }
    for (let i = 0; i < kept.length; i++) kept[i].index = i;
    rooms.length = 0;
    for (const r of kept) rooms.push(r);
  }

  /* Last of all, once the halls are cut and the doorways with them, face the
     rock around every room somebody BUILT with the blocks they built it from. */
  lineRoomWalls(world);

  /* ---- and then the ways OUT ---------------------------------------------
   * A piece on its own is a sealed box, and a labyrinth that stops at the edge
   * of a piece is not one that goes on forever. Every join this piece shares
   * with a neighbour has a handful of DOORWAYS on the rim, at a height the two
   * pieces agreed on, with a corridor dug inward to ground this piece already
   * had.
   *
   * Everything here happens AFTER the halls and the walls, and it only ever
   * cuts ROCK. That is what keeps the promise that a seed names the labyrinth
   * you already know: the piece's own rooms and halls were all chosen before a
   * single doorway was dug, so nothing about them can have moved. A doorway can
   * only turn rock into corridor -- never corridor into rock, never one room
   * into another.
   */
  const mouths = joinMouths(seed, cx, cy);
  world.mouths = mouths;
  world.sealed = 0;
  const isRock = (x, y) => {
    const c = at(x, y);
    return !!c && TILE(c.tile).footing === 'block';
  };
  const isMouth = (x, y, me) => mouths.some(m => m !== me && m.x === x && m.y === y);

  /* Where the piece could be walked BEFORE any doorway was dug: every room,
     every hall, the lot. A corridor is only ever allowed to come out into this
     -- ground that was already reachable -- which is what makes "every doorway
     leads somewhere" true by construction rather than by hope. One flood for
     the whole piece rather than one per doorway: a flood costs a fifth of a
     millisecond and there are never more than a handful of doorways. */
  const inside = reachableFrom(world, rooms[0].cx, rooms[0].cy);
  const joined = new Set();          /* squares dug into by a doorway already */

  /* Dig one doorway. The rim square is opened at the agreed height and the
     corridor runs from it along the rim until it finds a row with room to
     climb, then straight in until it meets ground this piece already had.
     The square it meets is left exactly as it is: the corridor pulls up beside
     it, at whatever height that square meets its neighbour -- so a corridor can
     arrive at a hall, at a ramp or at a room and the joint is right either way.
     A doorway that cannot find such a row is not dug at all. */
  const digDoorway = (m) => {
    const n = CFG.chunkTiles;
    const px = -m.dy, py = m.dx;              /* sideways, along the rim */
    if (!isRock(m.x, m.y)) return false;
    for (let step = 0; step < n; step++) {
      const sides = step ? [1, -1] : [1];
      for (const side of sides) {
        const o = step * side;
        const pts = [[m.x, m.y]];
        let clear = true;
        for (let k = 1; k <= Math.abs(o); k++) {
          const x = m.x + px * k * side, y = m.y + py * k * side;
          if (!isRock(x, y) || isMouth(x, y, m)) { clear = false; break; }
          pts.push([x, y]);
        }
        if (!clear) continue;
        const tx = m.x + px * o, ty = m.y + py * o;    /* where it turns inward */
        /* Inward, until the ground runs out. */
        let end = null;
        for (let k = 1; k < n; k++) {
          const x = tx + m.dx * k, y = ty + m.dy * k;
          if (x < 0 || y < 0 || x >= n || y >= n) break;
          if (isRock(x, y)) { pts.push([x, y]); continue; }
          if (isMouth(x, y, m)) break;
          end = at(x, y);
          break;
        }
        if (!end) continue;
        /* Coming out into a pocket nobody can reach would be a doorway into
           nowhere. Ground the piece could already walk to is fine, and so is a
           corridor dug a moment ago -- that is not a pocket, that is this
           corridor joining one that brushed past it. */
        if (inside.at(end) < 0 && !joined.has(end)) continue;
        const target = meetHeight(end, -m.dx, -m.dy);
        const climb = target - m.elev;
        const room = pts.length - 1;           /* steps from the rim to the joint */
        if (Math.abs(climb) > room) continue;  /* cannot climb that fast */
        /* Now lay it. The rim square stays at the agreed height -- the piece
           next door is standing at that height too -- and the climb happens
           over the last squares of the corridor, in one unbroken ramp, so the
           corridor's flat stretch needs at least as many squares as the climb
           is metres. */
        const up = climb > 0 ? 1 : -1;
        const h = pts.map((p, j) => m.elev
          + up * Math.max(0, j - (room - Math.abs(climb))));
        const floor = HALL_FLOORS[Math.floor(rand() * HALL_FLOORS.length)];
        for (let j = 0; j < pts.length; j++) {
          const [x, y] = pts[j];
          const next = j + 1 < pts.length ? h[j + 1] : target;
          const prev = j > 0 ? h[j - 1] : null;
          /* Which way this square leans. It leans up to the NEXT square along
             the corridor -- or, there being none, to the ground it has come out
             at, which is inward. Leaning it inward on the strength of "the next
             square is higher" is wrong wherever the corridor's climb starts
             during its sideways stretch along the rim, and a rim ramp leaning
             inward there has a wall several metres taller than itself on the
             side it climbs toward. Lean it at the square that really is higher:
             that is the whole of what a ramp means. */
          const ahead = j + 1 < pts.length ? pts[j + 1] : [x + m.dx, y + m.dy];
          let slope = SLOPE_FLAT;
          if (next === h[j] + 1) {
            slope = slopeFor(ahead[0] - x, ahead[1] - y);
          } else if (prev === h[j] + 1) {
            const p = pts[j - 1];
            slope = slopeFor(p[0] - x, p[1] - y);
          }
          const c = at(x, y);
          c.h = h[j]; c.slope = slope;
          c.tile = slope ? 'stone_ramp' : floor;
          c.room = -1;
          joined.add(c);
        }
        m.open = true;
        return true;
      }
    }
    return false;
  };

  /* Then, with the whole piece standing, dig the doorways. Nothing here can
     take anything away from the piece: every square a corridor touches was
     solid rock when the piece was finished, and the square it comes out into is
     left exactly as it was. A doorway that cannot be dug is simply not dug --
     the rim goes on looking precisely as it would have without any of this --
     and the piece counts it as sealed. */
  for (const m of mouths) if (!digDoorway(m)) world.sealed++;

  /* Then the ramps are checked, once, now that nothing else can move -- see
     repairSlopes(). It is the last thing done in local squares because every
     rule that can break a ramp runs before it. */
  world.slopeFix = SLOPES_REPAIRED
    ? repairSlopes(world, rooms)
    : { aimed: 0, flatted: 0, passes: 0, left: 0, rock: 0 };

  /* And last of all, the rock comes down to a height that suits the ground it
     is standing in. Rock is never walkable, so nothing any rule above decided
     can depend on this -- see lowerRockTops(). */
  world.rockFix = ROCK_LOWERED
    ? lowerRockTops(world, rockTop)
    : { lowered: 0, raised: 0, tallest: rockTop };

  /* Every rule above has been applied in local squares, so the piece is now
     moved to where it belongs: its address times its size is added onto every
     square, every room, and every doorway. From here on `at()` speaks world
     squares. */
  for (const c of cells) { c.x += ox; c.y += oy; }
  for (const r of rooms) { r.x += ox; r.y += oy; r.cx += ox; r.cy += oy; }
  for (const m of mouths) { m.x += ox; m.y += oy; }
  world.at = function (x, y) {
    const lx = x - ox, ly = y - oy;
    return (lx < 0 || ly < 0 || lx >= n || ly >= n) ? null : cells[ly * n + lx];
  };

  return world;
}

/* The height of one named corner of a cell, in metres. */
function cornerHeight(cell, corner) {
  return cell.h + SLOPE_HIGH[cell.slope][corner];
}

/* The elevation at which a cell meets its neighbour in a given direction. A
   ramp meets one neighbour a metre higher than it meets the others. */
function meetHeight(cell, dx, dy) {
  const s = cell.slope;
  if ((s === SLOPE_XUP && dx === 1) || (s === SLOPE_XDN && dx === -1)
   || (s === SLOPE_YUP && dy === 1) || (s === SLOPE_YDN && dy === -1)) {
    return cell.h + 1;
  }
  return cell.h;
}

/* Two cells connect when the height where they meet agrees. That one sentence
   is the whole movement rule: flat ground joins flat ground, and a ramp is the
   only thing that joins two levels. */
function canStep(from, to, dx, dy) {
  if (TILE(to.tile).footing === 'block') return false;
  return meetHeight(from, dx, dy) === meetHeight(to, -dx, -dy);
}

/* Where the top of a cell is, for standing on. A ramp is stood on halfway up. */
function surfaceHeight(cell) {
  return cell.h + (cell.slope ? 0.5 : 0);
}

const STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ---- a ramp is a promise, and the promise is checked ---------------------
 * A ramp is not a shallow slope. It is the ONLY place two levels meet, and the
 * whole of what it means is "the square I lean toward is one metre up". The
 * moment that square is not, the ramp is a WEDGE: the picture shows a slope and
 * the map refuses the step off the top of it.
 *
 * A slope ending in ROCK is not that, and is not a defect. THEIR WORDS, v0.33.2:
 * "I don't mind slopes leading up to walls. happens in caves and rubble all the
 * time." A bank of rubble that fetches up against a face is the labyrinth, and
 * the map is honest about it -- you walk up the ramp, and the rock does not let
 * you through. So a ramp whose square a metre up is SOLID is left exactly as it
 * is, and nothing is moved out of its way either: the block that landed there
 * was placed by blockRoom long after the ramp was dug, and a rule that keeps it
 * away reshapes the room around it (v0.33.0 tried that, and reverted it).
 *
 * What IS repaired is the other half -- a ramp leaning at OPEN ground that is
 * not a metre up: a drop into a corridor, a ledge, another ramp at the same
 * height. There is nothing there to explain the refusal; the ground is open and
 * the map says no. Two things are done to one of those, and only those:
 *
 *   re-aim   it at a FLAT square exactly one metre up, if it has one. Flat
 *            ground cannot move, so a re-aimed ramp cannot come undone.
 *   flatten  it to the floor it was cut from, if it has none.
 *
 * THE REPAIR MAY NEVER TAKE A STEP AWAY (lesson 21, the doorways). Both halves
 * can only remove an edge that was ALREADY impassable -- if the square the ramp
 * leaned at were a metre up and clear, the edge would be walkable and the ramp
 * would not have been touched -- and flattening leaves a square at its own
 * height, which can only ADD edges to the neighbours at that height.
 * __test.slopeAudit() counts every step a crawler can really take with the
 * repair off and then on IN ONE BUILD. The sweep throws no dice, so those two
 * runs are the same world and the difference between them is exactly the repair.
 *
 * Measured over 30 seeds, 90 worlds, 270 pieces, 10,244 ramps (2026-09-16): 145
 * of them no longer climbed -- 118 leaning into solid rock (left alone; that is
 * the case they asked for), 26 leaning at open ground below a metre up and 1 at
 * a ledge. The sweep repairs those 27 and leaves 0 wedges. */
let SLOPES_REPAIRED = true;      /* the sweep, at the end of every piece */

/* The rock comes down to suit the ground it stands in (lowerRockTops), so a
 * wall is two metres wherever it is rather than seven.
 *
 * Rock is not a square anybody can stand on, so the promise is easy to state
 * and worth stating exactly: NOTHING WALKABLE MOVES. Same height, same tile,
 * same room, same steps -- the world a crawler can use is identical, and only
 * the rock around them changes. Kept as a switch so that claim can be measured
 * against the same build with it turned off, which is the only way to prove a
 * change of this kind stayed inside its own box. */
let ROCK_LOWERED = true;         /* the rock tops, at the end of every piece */

/* Which way a ramp climbs, as one step of the grid. */
function slopeDir(slope) {
  if (slope === SLOPE_XUP) return [1, 0];
  if (slope === SLOPE_XDN) return [-1, 0];
  if (slope === SLOPE_YUP) return [0, 1];
  if (slope === SLOPE_YDN) return [0, -1];
  return null;
}

/* What a square is floored with when a ramp in it is taken out: the room's own
   floor, or failing that whatever the ground around it is made of. */
function floorNear(at, cell, rooms) {
  if (cell.room >= 0 && rooms && rooms[cell.room]) return rooms[cell.room].floor;
  const count = new Map();
  for (const s of STEPS) {
    const nb = at(cell.x + s[0], cell.y + s[1]);
    if (!nb || nb.slope || TILE(nb.tile).footing === 'block') continue;
    count.set(nb.tile, (count.get(nb.tile) || 0) + 1);
  }
  let best = 'stone_floor', bestN = 0;
  count.forEach(function (n, tile) { if (n > bestN) { bestN = n; best = tile; } });
  return best;
}

/* Repair every ramp of one piece that no longer climbs. Works in the piece's
   own local squares, before its address is added onto them. A ramp leaning at a
   square outside the piece is left alone: this pass cannot see next door, and
   guessing about ground it cannot read is how a step gets taken away. A ramp
   leaning at SOLID ROCK is left alone as well -- a slope that fetches up against
   a face is a cave, and they asked for it. */
function repairSlopes(world, rooms) {
  const at = world.at;
  const fix = { aimed: 0, flatted: 0, passes: 0, left: 0, rock: 0 };
  /* What the square this ramp leans at is: true when the step is really there,
     false when the ground is open and refuses it, 'rock' when it is solid, and
     'out' when it is outside this piece. */
  const climbs = function (c) {
    const d = slopeDir(c.slope);
    if (!d) return null;
    const nb = at(c.x + d[0], c.y + d[1]);
    if (!nb) return 'out';
    if (TILE(nb.tile).footing === 'block') return 'rock';
    return canStep(c, nb, d[0], d[1]);
  };
  for (let pass = 0; pass < 8; pass++) {
    let changed = 0;
    for (const c of world.cells) {
      if (!c.slope || TILE(c.tile).footing === 'block') continue;
      const good = climbs(c);
      if (good === null || good === 'out' || good === 'rock' || good) continue;
      const d = slopeDir(c.slope);
      let aimed = false;
      for (const s of STEPS) {
        if (s[0] === d[0] && s[1] === d[1]) continue;   /* the way that failed */
        const q = at(c.x + s[0], c.y + s[1]);
        if (!q || q.slope || TILE(q.tile).footing === 'block') continue;
        if (q.h !== c.h + 1) continue;
        c.slope = slopeFor(s[0], s[1]);
        c.tile = 'stone_ramp';
        fix.aimed++; changed++; aimed = true;
        break;
      }
      if (aimed) continue;
      c.slope = SLOPE_FLAT;
      c.tile = floorNear(at, c, rooms);
      fix.flatted++; changed++;
    }
    fix.passes = pass + 1;
    if (!changed) break;
  }
  for (const c of world.cells) {
    if (!c.slope || TILE(c.tile).footing === 'block') continue;
    const good = climbs(c);
    if (good === 'rock') { fix.rock++; continue; }
    if (good === null || good === 'out') continue;
    if (!good) fix.left++;
  }
  return fix;
}

/* How tall a column of rock stands: `world.rock_height` above the floor nearest
 * it, and never above the plateau it is born at.
 *
 * Every column used to be born at ONE height for the whole piece --
 * world.max_elevation plus world.rock_height -- which laid a single flat
 * plateau over the labyrinth at 7 m and left every wall the same afternoon's
 * worth of rock: the height you happened to be standing at, subtracted from 7.
 * Mostly three metres, sometimes seven, and always with its top on show. Their
 * words: "we should not see the top of wall blocks... make most walls 2m tall
 * instead of the current 3m". So a column of rock now takes its height from the
 * ground it is actually standing beside, found by one flood outwards from every
 * floor square at once, and the rock follows the rooms in and out instead of
 * roofing them all at one altitude. A room in a deep place has low rock round
 * it and keeps its view; a room up high stands under rock as tall as ever.
 *
 * It runs LAST, after the halls, the walls, the doorways and the ramps, and it
 * is safe there for one reason: a column of rock is not a square anybody can
 * stand on, so no rule above it can have depended on how tall it was. Nothing
 * walkable moves by a millimetre -- height, tile, room or otherwise -- which is
 * the promise the doorways are held to as well.
 *
 * Never TALLER than the plateau, either. Two bounds in the renderer are worked
 * out from max_elevation + rock_height -- how far the picture reaches, and
 * whether a piece is on the screen at all -- and a column that came out taller
 * than those would leave a piece culled before it was drawn: a hole in the
 * world. Clamping to the plateau means both bounds go on being over-estimates,
 * which is all they ever needed to be.
 */
function lowerRockTops(world, rockTop) {
  const n = CFG.chunkTiles, cells = world.cells;
  const floor = new Int16Array(n * n).fill(-1);
  const queue = new Int32Array(n * n);
  let head = 0, tail = 0;
  const block = (c) => TILE(c.tile).footing === 'block';
  /* The HIGHEST floor goes first, so that a column of rock standing between two
     floors of different heights belongs to the taller of them. Order matters
     here and nowhere else: a cell one step from a room at 5 m and one step from
     a room at 0 m must come out at 7 m, or the 5 m room is left standing in a
     trench with two metres of rock beside it. Seeding tallest-first means the
     7 m answer is always the one that arrives first. */
  for (let h = CFG.maxElev; h >= 0; h--) {
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].h !== h || block(cells[i])) continue;
      floor[i] = h; queue[tail++] = i;
    }
  }
  /* Anything walkable whose height is not a whole metre in range still has to
     feed the flood -- it simply does not get a say about a tie. */
  for (let i = 0; i < cells.length; i++) {
    if (floor[i] >= 0 || block(cells[i])) continue;
    floor[i] = Math.max(0, Math.round(cells[i].h));
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++], lvl = floor[i];
    const x = i % n;
    if (x > 0 && floor[i - 1] < 0) { floor[i - 1] = lvl; queue[tail++] = i - 1; }
    if (x < n - 1 && floor[i + 1] < 0) { floor[i + 1] = lvl; queue[tail++] = i + 1; }
    if (i >= n && floor[i - n] < 0) { floor[i - n] = lvl; queue[tail++] = i - n; }
    if (i + n < n * n && floor[i + n] < 0) { floor[i + n] = lvl; queue[tail++] = i + n; }
  }
  const fix = { lowered: 0, raised: 0, tallest: 0 };
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    /* ROCK only. A floor's height is the whole world's business -- rooms, halls,
       ramps and every promise made above this call depend on it -- so the one
       thing this must never do is touch a square somebody can stand on. */
    if (floor[i] < 0 || !block(c)) continue;
    const want = Math.min(rockTop, floor[i] + CFG.rockHeight);
    if (want < c.h) { fix.lowered++; c.h = want; } else if (want > c.h) { fix.raised++; c.h = want; }
    if (c.h > fix.tallest) fix.tallest = c.h;
  }
  return fix;
}

/* Does this column of rock stand between the camera and a floor behind it?
 *
 * Straight out of the projection: a column of height H covers the cell k steps
 * further back when H >= h + k * (tile_h / rise). `back` is which way "further
 * back" points, which depends on which quarter turn you are looking from, and
 * `tileH` on how steeply you are looking down. That is the whole fourth-wall
 * problem, answered in a handful of steps per column rather than by comparing
 * every block with every other.
 *
 * The rule is the projection and nothing else; what happens to the rock that
 * answers yes is a matter of taste and lives in the renderer. It hands back a
 * yes or a no. It used to hand back the HEIGHT of the floor it hides, for a look
 * that wanted to leave a low wall standing where the rock had been -- that look
 * was not taken, so the height, the `margin` that went with it and the `lifeAt`
 * that narrowed the question are all gone. A number nothing reads is a builder
 * with no consumer, and it is how a dial drifts away from its meaning. */
function hidesFloorBehind(world, cell, back, tileH) {
  if (TILE(cell.tile).footing !== 'block') return false;
  const perStep = tileH / CFG.rise;
  /* Only the near wall. Rock that hides a room from further back than this is
     left solid -- opening all of it turns the whole labyrinth into a haze. */
  const reach = Math.min(CFG.cutawayDepth,
                         Math.ceil(cell.h / Math.max(perStep, 0.001)));
  for (let k = 1; k <= reach; k++) {
    const far = world.at(cell.x + back[0] * k, cell.y + back[1] * k);
    if (!far) break;
    /* A block hides nothing, and the search runs PAST one rather than stopping
       at it -- so the room beyond a wall of rock is still seen. */
    if (TILE(far.tile).footing === 'block') continue;
    if (cell.h >= far.h + k * perStep) return true;
  }
  return false;
}

/* Breadth-first over the connection rule above. Used by crawlers to get
   somewhere, and by the tests to prove the whole labyrinth is walkable.
 *
 * The answer is a FIELD: something you can ask "how many steps from the start
 * to this square?" -- and it is keyed by the square itself rather than by a
 * number worked out from its position. That is what lets a flood grow across
 * pieces, and what stops it from having to know the size of the world. */
function reachableFrom(world, sx, sy) {
  const dist = new Map();
  const start = world.at(sx, sy);
  const field = {
    start: start,
    dist: dist,
    /* Steps from the start, or -1 for a square that cannot be got to. */
    at: function (cell) { return (cell && dist.has(cell)) ? dist.get(cell) : -1; }
  };
  if (!start || TILE(start.tile).footing === 'block') return field;
  dist.set(start, 0);
  const queue = [start];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head], d = dist.get(c);
    for (let s = 0; s < STEPS.length; s++) {
      const step = STEPS[s];
      const to = world.at(c.x + step[0], c.y + step[1]);
      if (!to || dist.has(to)) continue;
      if (!canStep(c, to, step[0], step[1])) continue;
      dist.set(to, d + 1);
      queue.push(to);
    }
  }
  return field;
}

/* One step of the walk toward a target, using the distances from a flood fill
   rooted at that target. Returns the neighbour that gets closer, or null. */
function stepToward(world, from, field) {
  let best = null, bestD = field.at(from);
  if (bestD < 0) return null;
  for (let s = 0; s < STEPS.length; s++) {
    const d = STEPS[s];
    const to = world.at(from.x + d[0], from.y + d[1]);
    if (!to) continue;
    const j = field.at(to);
    if (j < 0 || j >= bestD) continue;
    if (!canStep(from, to, d[0], d[1])) continue;
    bestD = j;
    best = { cell: to, dx: d[0], dy: d[1] };
  }
  return best;
}

/* ---- light ---------------------------------------------------------------
 * The labyrinth is dark. Light is something you carry into it, or build.
 *
 * Worked out per SQUARE rather than as a glow on the screen, and spread by
 * flooding outwards from each source through whatever does not block sight --
 * so a fire lights its room and the hall leading out of it, and not the room on
 * the other side of the wall. Blocked squares still catch the light on their
 * near face; they just do not pass it on.
 *
 * And every source hangs at a HEIGHT: a fire at knee level, a carried lamp at
 * the height of a hand. What a square gets is worked out from the true distance
 * to the flame (lightFall), and the picture can ask the same source again,
 * higher up a wall (lightValueAt), so the light has somewhere to be other than
 * the floor it was measured on.
 */
/* A step of the flood is one square across, and the shortest a square-wide step
   could ever be is the diagonal of that square -- so every square of walking the
   light does is worth at least this much of a metre. Not a knob: it is what a
   step IS, like TICK_MS. */
const STEP_METRES = 1 / Math.SQRT2;

/* How much of a source's light arrives at a point, where the source is a thing
   standing in the air at a real height.
 *
 * TWO DISTANCES, AND THE LIGHT PAYS THE LONGER.
 *
 * The first is the straight line to the point -- across the floor and up to the
 * lamp, together (`height_falloff` says how much the climb counts). A point at
 * the foot of a wall and a point three metres up that wall are not the same
 * distance from a fire on the floor, which is why a fire lights the bottom of a
 * room and leaves the top of it dark.
 *
 * The second is the way the light actually had to WALK, because light does not
 * go through rock: round the corner of a hall it has come further than the
 * straight line says. So where the walk is longer, the walk is what is paid --
 * and a pool of light dims coming out of a passage instead of restarting in the
 * next room.
 *
 * In the open the line is longer and the pool comes out round; the two are equal
 * along the straight axes, so there is no seam between them. */
function lightFall(src, px, py, pz, walked) {
  const line = Math.hypot(src.x + 0.5 - px, src.y + 0.5 - py);
  const dz = (pz - src.z) * CFG.heightFalloff;
  const rho = Math.hypot(line, dz);
  const detour = (walked || 0) * STEP_METRES;
  const eff = detour > rho ? detour : rho;
  return Math.max(0, 1 - Math.pow(eff / src.r, CFG.falloff));
}

/* Ground level under a square, for a light that hangs above it. */
function sourceGround(state, x, y) {
  const cell = state.world.at(x, y);
  return cell ? surfaceHeight(cell) : 0;
}

function lightSourcesIn(state) {
  const out = [];
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    let best = 0;
    for (let k = 0; k < SLOT_IDS.length; k++) {
      const item = a.worn[SLOT_IDS[k]];
      if (item && GEAR(item).light > best) best = GEAR(item).light;
    }
    if (best > 0) {
      /* What a crawler carries is in their hand, at the height of a hand --
         which is what makes a wall bright at the height they walk past it. */
      out.push({ x: a.x, y: a.y, r: best, actor: a,
                 z: sourceGround(state, a.x, a.y) + CFG.lampHeight });
    }
  }
  if (state.camp) {
    for (let i = 0; i < state.camp.sites.length; i++) {
      const site = state.camp.sites[i];
      const def = STRUCT(site.structure);
      if (site.built && def.light > 0) {
        /* A fire burns at knee height, not on the floor and not at the top of
           the pile of logs it is built out of. */
        out.push({ x: site.x, y: site.y, r: def.light, site: site,
                   z: sourceGround(state, site.x, site.y) + CFG.fireHeight });
      }
    }
  }
  return out;
}

function computeLight(state) {
  const w = state.world;
  /* What the last pass lit, so this one can put it out again without walking
     the whole world. Only ever touches squares that were lit, which keeps a
     recompute as cheap as the pool of light is small. */
  if (!state.lit) state.lit = [];
  for (const c of state.lit) { c.light = 0; c.lightD = 0; c.lightSrc = -1; }
  state.lit.length = 0;

  const sources = lightSourcesIn(state);
  /* The picture and the shadow pass read the sources back out of the match, and
     they must read the same list this pass lit the world from -- a list rebuilt
     somewhere else could put a flame an inch from where it was measured. */
  state.sources = sources;
  const dist = new Map();
  for (let si = 0; si < sources.length; si++) {
    const src = sources[si];
    /* The flood walks squares, and a square of walking is worth at least
       1/sqrt(2) of a metre (STEP_METRES), so the farthest a square can carry
       light is sqrt(2) times the radius. Walked further and every square beyond
       is dark -- which is what keeps this a bounded walk rather than a sweep of
       the world, and what stops the pool having a hard edge along the axes. */
    const reach = Math.ceil(src.r * Math.SQRT2);
    dist.clear();
    const start = w.at(src.x, src.y);
    if (!start) continue;
    dist.set(start, 0);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const c = queue[head];
      const d = dist.get(c);
      const fall = lightFall(src, c.x + 0.5, c.y + 0.5, surfaceHeight(c), d);
      /* Which source is lighting this square is kept, because the picture has to
         be able to ask that source again -- at a different height, for the top
         of a wall. */
      if (fall > (c.light || 0)) {
        if (!(c.light > 0)) state.lit.push(c);
        c.light = fall; c.lightD = d; c.lightSrc = si;
      }
      if (d >= reach) continue;
      /* Rock catches the light but does not pass it on. */
      if (TILE(c.tile).tags.indexOf('blocks-sight') >= 0 && d > 0) continue;
      for (let k = 0; k < STEPS.length; k++) {
        const to = w.at(c.x + STEPS[k][0], c.y + STEPS[k][1]);
        if (!to || dist.has(to)) continue;
        dist.set(to, d + 1);
        queue.push(to);
      }
    }
  }
  state.lightDirty = false;
  state.viewDirty = true;
  state.geomDirty = true;
  return sources.length;
}

/* Stepped, so the picture reads as painted pools rather than a smooth gradient
   -- and so the pattern cache underneath it stays small.
   The light of a square is kept ON the square, so nothing here needs to know
   where in the world that square happens to be. */
function lightAt(state, cell) {
  if (!state.lit) return 1;        /* nothing worked out yet: daylight */
  if (!cell) return 0;
  const raw = cell.light || 0;
  return Math.round(raw * CFG.lightSteps) / CFG.lightSteps;
}

/* The same light, at a height you choose, WITHOUT the flat steps: how bright a
   particular face of a thing is, rather than how bright the square is.
 *
 * A square has one level -- that is the game's own answer, and the panel and the
 * tests read it -- but a wall is three metres of face standing in the light, and
 * painting the whole of it at the level of its own floor is what made a fire
 * read as a puddle of colour rather than as a light in a room. So the picture
 * asks the source that lit the square again, at the height it is drawing.
 *
 * At the floor it gives back exactly what the square gives (bar the stepping),
 * so nothing about the world's own light has moved; only what the picture does
 * with it. */
function lightValueAt(state, cell, z) {
  if (!cell || !state.sources) return lightAt(state, cell);
  const src = state.sources[cell.lightSrc];
  if (!src) return lightAt(state, cell);
  const hz = z === undefined ? surfaceHeight(cell) : z;
  return lightFall(src, cell.x + 0.5, cell.y + 0.5, hz, cell.lightD);
}

/* The same, at a point that is not the middle of the square -- the picture
   ramps a face from its foot to its top, and one floor square to its next, so it
   has to be able to ask about a point INSIDE the square it is painting.
 *
 * THE SOURCE IS STILL THE ONE THAT LIT THE SQUARE, and the way the light walked
 * to the square is still the square's. Half a metre to one side of a square's
 * centre is not reached by a different source through a different doorway in any
 * way the picture could act on, and a flood per corner of every face would be a
 * flood per pixel.
 *
 * dx and dy are metres from that centre. */
function lightPoint(state, cell, z, dx, dy) {
  if (!cell || !state.sources) return lightAt(state, cell);
  const src = state.sources[cell.lightSrc];
  if (!src) return lightAt(state, cell);
  return lightFall(src, cell.x + 0.5 + (dx || 0), cell.y + 0.5 + (dy || 0),
                   z === undefined ? surfaceHeight(cell) : z, cell.lightD);
}
