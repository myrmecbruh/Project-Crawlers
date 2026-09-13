/* Everything tunable, inlined from docs/crawlers.xlsx at build time.
   The spreadsheet is the authority; src/defaults.json is what a fresh checkout
   falls back to. build.py refuses to build if the two disagree. */
const DATA = {{DATA}};

/* A missing knob is an ERROR, loudly. (A missing *asset* is silence -- that is a
   different rule. A dial nothing reads is a bug in the sheet.) */
function K(key) {
  if (!(key in DATA.knobs)) throw new Error('unknown knob: ' + key);
  return DATA.knobs[key];
}
function G(key) {
  if (!(key in DATA.geometry)) throw new Error('unknown geometry: ' + key);
  return DATA.geometry[key];
}
function N(key) {
  if (!(key in DATA.names)) throw new Error('unknown name: ' + key);
  return DATA.names[key];
}
function TILE(id) {
  const t = DATA.tiles[id];
  if (!t) throw new Error('unknown tile: ' + id);
  return t;
}
function TAG(id) { return DATA.tags[id] || { name: id, note: '' }; }

/* Named locals for everything read every frame. A stride is a name, never a
   literal, and a knob fetched by string in a hot loop is a typo waiting to
   happen as well as being slow. */
const CFG = {
  lowW:        K('render.low_width'),
  lowH:        K('render.low_height'),
  tileW:       K('render.tile_w'),
  tileH:       K('render.tile_h'),
  rise:        K('render.rise'),
  occluderFade: K('render.occluder_fade'),
  shadeLeft:   K('render.side_shade_left'),
  shadeRight:  K('render.side_shade_right'),
  heightTint:  K('render.height_tint'),
  zoomStart:   K('camera.zoom_start'),
  zoomMin:     K('camera.zoom_min'),
  zoomMax:     K('camera.zoom_max'),
  keyPan:      K('camera.key_pan_speed'),
  chunkTiles:  K('world.chunk_tiles'),
  maxElev:     K('world.max_elevation'),
  terrainScale: K('world.terrain_scale'),
  rampChance:  K('world.ramp_chance'),
  dampLevel:   K('world.damp_level'),
  metresPerTile: G('world.metres_per_tile'),
  isoRatio:    G('render.iso_ratio')
};

/* One metre of elevation is one metre. Rule 7 holds everywhere or nowhere. */
const TILE_METRES = CFG.metresPerTile;

/* One fixed simulation step. Not a knob: changing it changes what a tick MEANS,
   and every rate in the game is quoted per tick. */
const TICK_MS = 1000 / 60;

function shade(hex, f) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return 'rgb(' + c((n >> 16) & 255) + ',' + c((n >> 8) & 255) + ',' + c(n & 255) + ')';
}
