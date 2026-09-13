/* A piece of the labyrinth, generated from a seed.
 *
 * This is PLACEHOLDER terrain, not the labyrinth generator. It exists so the
 * view, the picking and the tooltips have varied ground to work against. The
 * real generator -- ever-shifting, branching, wildly varied (rule 5) -- is its
 * own conversation and its own rules.
 *
 * Every cell is one square metre (rule 7). A cell is the SURFACE of a column:
 * its ground height in metres, the material it is made of, and, if it is a
 * ramp, which way it climbs.
 */

/* Which way a ramp ascends, in grid terms. Named, never a bare number. */
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

function smoothstep(t) { return t * t * (3 - 2 * t); }

/* Value noise on a coarse lattice, smoothly interpolated. Two octaves is enough
   to stop the ground looking like a chessboard without looking like soup. */
function noiseField(rand, n, scale) {
  const build = (cells) => {
    const side = Math.max(2, Math.ceil(n / cells) + 2);
    const g = new Float32Array(side * side);
    for (let i = 0; i < g.length; i++) g[i] = rand();
    return { side: side, g: g, cells: cells };
  };
  const sample = (o, x, y) => {
    const fx = x / o.cells, fy = y / o.cells;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smoothstep(fx - x0), ty = smoothstep(fy - y0);
    const at = (a, b) => o.g[Math.min(o.side - 1, b) * o.side + Math.min(o.side - 1, a)];
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bot = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bot * ty;
  };
  const coarse = build(scale), fine = build(Math.max(2, scale / 2.5));
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      out[y * n + x] = sample(coarse, x, y) * 0.7 + sample(fine, x, y) * 0.3;
    }
  }
  return out;
}

function generateChunk(seed) {
  const n = CFG.chunkTiles;
  const rand = makeRand(seed);
  const ground = noiseField(rand, n, CFG.terrainScale);
  const wet = noiseField(rand, n, CFG.terrainScale * 0.8);
  const grit = noiseField(rand, n, 3);

  const cells = new Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const h = Math.max(0, Math.min(CFG.maxElev, Math.round(ground[i] * CFG.maxElev)));
      const m = wet[i], g = grit[i];
      let tile;
      if (h <= CFG.dampLevel && m > 0.58) tile = 'shallow_water';
      else if (h <= CFG.dampLevel || m > 0.66) tile = 'moss_stone';
      else if (g > 0.84) tile = 'stone_block';
      else if (g > 0.76) tile = 'rubble';
      else if (g < 0.08) tile = 'bone_litter';
      else if (m < 0.34) tile = 'packed_earth';
      else tile = 'stone_floor';
      cells[i] = { x: x, y: y, h: h, tile: tile, slope: SLOPE_FLAT };
    }
  }

  /* Ramps last, because a ramp is a relationship between two cells, not a
     property of one. A step of exactly one metre can become climbable. */
  const at = (x, y) => (x < 0 || y < 0 || x >= n || y >= n) ? null : cells[y * n + x];
  const dirs = [[1, 0, SLOPE_XUP], [-1, 0, SLOPE_XDN], [0, 1, SLOPE_YUP], [0, -1, SLOPE_YDN]];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (TILE(c.tile).footing !== 'walk') continue;
    const up = [];
    for (const d of dirs) {
      const nb = at(c.x + d[0], c.y + d[1]);
      if (nb && nb.h === c.h + 1 && TILE(nb.tile).footing !== 'block') up.push(d[2]);
    }
    if (up.length === 1 && rand() < CFG.rampChance) {
      c.tile = 'stone_ramp';
      c.slope = up[0];
    }
  }

  return { seed: seed, n: n, cells: cells,
           at: function (x, y) { return at(x, y); } };
}

/* The height of one named corner of a cell, in metres. */
function cornerHeight(cell, corner) {
  return cell.h + SLOPE_HIGH[cell.slope][corner];
}
