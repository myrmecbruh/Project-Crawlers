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
/* Tags are vocabulary, and rule 2 says the vocabulary is agreed, not invented.
   An unknown tag is a mistake, so it is loud rather than quietly plausible. */
function TAG(id) {
  const t = DATA.tags[id];
  if (!t) throw new Error('unknown tag: ' + id);
  return t;
}
function ATTR(id) {
  const a = DATA.attributes[id];
  if (!a) throw new Error('unknown attribute: ' + id);
  return a;
}
function SKILL(id) {
  const s = DATA.skills[id];
  if (!s) throw new Error('unknown skill: ' + id);
  return s;
}
/* The six, in the order they are always shown. Rule 2: there are six, and every
   skill in the game is derived from them. */
const ATTRIBUTE_IDS = Object.keys(DATA.attributes);
const SKILL_IDS = Object.keys(DATA.skills);
const FIGURE_IDS = Object.keys(DATA.figure);
const STRUCTURE_IDS = Object.keys(DATA.structures);
function STRUCT(id) {
  const s = DATA.structures[id];
  if (!s) throw new Error('unknown structure: ' + id);
  return s;
}

/* Named locals for everything read every frame. A stride is a name, never a
   literal, and a knob fetched by string in a hot loop is a typo waiting to
   happen as well as being slow. */
const CFG = {
  tileW:       K('render.tile_w'),
  tileHLow:    K('render.tile_h_low'),
  tileHHigh:   K('render.tile_h_high'),
  rise:        K('render.rise'),
  occluderFade: K('render.occluder_fade'),
  shadeLeft:   K('render.side_shade_left'),
  shadeRight:  K('render.side_shade_right'),
  heightTint:  K('render.height_tint'),
  zoomStart:   K('render.zoom_start'),
  zoomMin:     K('render.zoom_min'),
  zoomMax:     K('render.zoom_max'),
  maxBufW:     K('render.max_buffer_w'),
  maxBufH:     K('render.max_buffer_h'),
  cutawayFade: K('render.cutaway_fade'),
  cutawayDepth: K('render.cutaway_depth'),
  swingMs:     K('camera.swing_ms'),
  tiltMs:      K('camera.tilt_ms'),
  coastTicks:  K('time.coast_ticks'),
  keyPan:      K('camera.key_pan_speed'),
  chunkTiles:  K('world.chunk_tiles'),
  maxElev:     K('world.max_elevation'),
  rooms:       K('world.rooms'),
  roomMin:     K('world.room_min'),
  roomMax:     K('world.room_max'),
  hallWidth:   K('world.hall_width'),
  rockHeight:  K('world.rock_height'),
  campBedrolls: K('camp.bedrolls'),
  campStores:  K('camp.stores'),
  campWindbreaks: K('camp.windbreaks'),
  campSpread:  K('camp.site_spread'),
  campProgress: K('camp.progress_per_success'),
  campWorkTicks: K('camp.work_ticks'),
  attrWeight:  K('roll.attribute_weight'),
  skillWeight: K('roll.skill_weight'),
  noiseSpread: K('roll.noise_spread'),
  skillCap:    K('skill.cap'),
  gainFail:    K('learn.gain_on_failure'),
  gainWin:     K('learn.gain_on_success'),
  nearMissBonus: K('learn.near_miss_bonus'),
  nearMissMargin: K('learn.near_miss_margin'),
  actorCount:  K('actor.count'),
  attrMin:     K('actor.attribute_min'),
  attrMax:     K('actor.attribute_max'),
  hatChance:   K('actor.hat_chance'),
  stepTicks:   K('actor.step_ticks'),
  actorHeight: K('actor.height_m'),
  figureNominal: G('figure.nominal_height_m'),
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
