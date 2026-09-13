/* A piece of the labyrinth: rooms cut into solid rock, and halls dug between
 * them. Every cell is one square metre (rule 7). A cell is the SURFACE of a
 * column: its height in metres, what it is made of, and, if it is a ramp,
 * which way it climbs.
 *
 * Rooms sit at different levels and the halls between them step up and down a
 * metre at a time, with a ramp at every step, so the whole place is walkable
 * without anything ever climbing more than a metre.
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

function generateChunk(seed) {
  const n = CFG.chunkTiles;
  const rand = makeRand(seed);
  const rockTop = CFG.maxElev + CFG.rockHeight;

  const cells = new Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      cells[y * n + x] = { x: x, y: y, h: rockTop, tile: 'stone_block',
                           slope: SLOPE_FLAT, room: -1 };
    }
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n) ? null : cells[y * n + x];
  const rooms = [];
  const world = { seed: seed, n: n, cells: cells, rooms: rooms, rockTop: rockTop,
                  at: at };

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

  /* ---- halls ------------------------------------------------------------ */
  function pathBetween(a, b) {
    const pts = [];
    let x = a.cx, y = a.cy;
    const horizFirst = rand() < 0.5;
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
     room without cutting it in half: the room is an anchor, not an obstacle. */
  function digHall(a, b) {
    const pts = pathBetween(a, b);
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
      for (let wdt = 0; wdt < CFG.hallWidth; wdt++) {
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
  const centreIndex = (r) => r.cy * n + r.cx;
  for (let pass = 0; pass < 24; pass++) {
    const main = reachableFrom(world, chain[0].cx, chain[0].cy);
    const orphans = rooms.filter(function (r) { return main[centreIndex(r)] < 0; });
    if (!orphans.length) break;
    const joined = rooms.filter(function (r) { return main[centreIndex(r)] >= 0; });
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
     "every room is reachable" a hope instead of a fact. */
  const finalField = reachableFrom(world, chain[0].cx, chain[0].cy);
  const kept = [];
  for (const r of rooms) {
    if (finalField[r.cy * n + r.cx] >= 0) { kept.push(r); continue; }
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = at(x, y);
        c.h = rockTop; c.tile = 'stone_block'; c.slope = SLOPE_FLAT; c.room = -1;
      }
    }
  }
  if (kept.length !== rooms.length) {
    /* Renumber, so a cell's room number always points at a room that exists. */
    const remap = {};
    for (let i = 0; i < kept.length; i++) { remap[kept[i].index] = i; }
    for (const c of cells) if (c.room >= 0) c.room = remap[c.room];
    for (let i = 0; i < kept.length; i++) kept[i].index = i;
    rooms.length = 0;
    for (const r of kept) rooms.push(r);
  }

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

/* Does this column of rock stand between the camera and a floor behind it?
 *
 * Straight out of the projection: a column of height H covers the cell k steps
 * further back when H >= h + k * (tile_h / rise). `back` is which way "further
 * back" points, which depends on which quarter turn you are looking from, and
 * `tileH` on how steeply you are looking down. That is the whole fourth-wall
 * problem, answered in a handful of steps per column rather than by comparing
 * every block with every other.
 */
function hidesFloorBehind(world, cell, back, tileH) {
  if (TILE(cell.tile).footing !== 'block') return false;
  const perStep = tileH / CFG.rise;
  /* Only the near wall. Rock that hides a room from further back than this is
     left solid -- fading all of it turns the whole labyrinth into a haze. */
  const reach = Math.min(CFG.cutawayDepth,
                         Math.ceil(cell.h / Math.max(perStep, 0.001)));
  for (let k = 1; k <= reach; k++) {
    const far = world.at(cell.x + back[0] * k, cell.y + back[1] * k);
    if (!far) break;
    if (TILE(far.tile).footing === 'block') continue;
    if (cell.h >= far.h + k * perStep) return true;
  }
  return false;
}

/* Breadth-first over the connection rule above. Used by crawlers to get
   somewhere, and by the tests to prove the whole labyrinth is walkable. */
function reachableFrom(world, sx, sy) {
  const n = world.n;
  const seen = new Int32Array(n * n).fill(-1);
  const start = world.at(sx, sy);
  if (!start || TILE(start.tile).footing === 'block') return seen;
  const queue = [sy * n + sx];
  seen[sy * n + sx] = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const c = world.cells[i];
    for (let s = 0; s < STEPS.length; s++) {
      const d = STEPS[s];
      const to = world.at(c.x + d[0], c.y + d[1]);
      if (!to) continue;
      const j = to.y * n + to.x;
      if (seen[j] >= 0) continue;
      if (!canStep(c, to, d[0], d[1])) continue;
      seen[j] = seen[i] + 1;
      queue.push(j);
    }
  }
  return seen;
}

/* One step of the walk toward a target, using the distances from a flood fill
   rooted at that target. Returns the neighbour that gets closer, or null. */
function stepToward(world, from, field) {
  const n = world.n;
  let best = null, bestD = field[from.y * n + from.x];
  if (bestD < 0) return null;
  for (let s = 0; s < STEPS.length; s++) {
    const d = STEPS[s];
    const to = world.at(from.x + d[0], from.y + d[1]);
    if (!to) continue;
    const j = to.y * n + to.x;
    if (field[j] < 0 || field[j] >= bestD) continue;
    if (!canStep(from, to, d[0], d[1])) continue;
    bestD = field[j];
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
 */
function lightSourcesIn(state) {
  const out = [];
  for (let i = 0; i < state.actors.length; i++) {
    const a = state.actors[i];
    let best = 0;
    for (let k = 0; k < SLOT_IDS.length; k++) {
      const item = a.worn[SLOT_IDS[k]];
      if (item && GEAR(item).light > best) best = GEAR(item).light;
    }
    if (best > 0) out.push({ x: a.x, y: a.y, r: best });
  }
  if (state.camp) {
    for (let i = 0; i < state.camp.sites.length; i++) {
      const site = state.camp.sites[i];
      const def = STRUCT(site.structure);
      if (site.built && def.light > 0) out.push({ x: site.x, y: site.y, r: def.light });
    }
  }
  return out;
}

function computeLight(state) {
  const w = state.world, n = w.n;
  if (!state.light || state.light.length !== n * n) state.light = new Float32Array(n * n);
  state.light.fill(0);

  const sources = lightSourcesIn(state);
  const dist = new Int16Array(n * n);
  for (let si = 0; si < sources.length; si++) {
    const src = sources[si];
    const reach = Math.ceil(src.r);
    dist.fill(-1);
    const start = src.y * n + src.x;
    if (start < 0 || start >= dist.length) continue;
    dist[start] = 0;
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      const c = w.cells[i];
      const d = dist[i];
      const fall = Math.max(0, 1 - Math.pow(d / src.r, CFG.falloff));
      if (fall > state.light[i]) state.light[i] = fall;
      if (d >= reach) continue;
      /* Rock catches the light but does not pass it on. */
      if (TILE(c.tile).tags.indexOf('blocks-sight') >= 0 && d > 0) continue;
      for (let k = 0; k < STEPS.length; k++) {
        const to = w.at(c.x + STEPS[k][0], c.y + STEPS[k][1]);
        if (!to) continue;
        const j = to.y * n + to.x;
        if (dist[j] >= 0) continue;
        dist[j] = d + 1;
        queue.push(j);
      }
    }
  }
  state.lightDirty = false;
  state.viewDirty = true;
  state.geomDirty = true;
  return sources.length;
}

/* Stepped, so the picture reads as painted pools rather than a smooth gradient
   -- and so the pattern cache underneath it stays small. */
function lightAt(state, index) {
  if (!state.light) return 1;
  const raw = state.light[index] || 0;
  return Math.round(raw * CFG.lightSteps) / CFG.lightSteps;
}
