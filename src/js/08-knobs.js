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
const BONE_IDS = Object.keys(DATA.bones);
const SLOT_IDS = Object.keys(DATA.slots);
const SPEED_IDS = Object.keys(DATA.speeds);
function SPEED(i) {
  const id = SPEED_IDS[Math.max(0, Math.min(SPEED_IDS.length - 1, i))];
  return DATA.speeds[id];
}
const GEAR_IDS = Object.keys(DATA.gear);
function GEAR(id) {
  const g = DATA.gear[id];
  if (!g) throw new Error('unknown gear: ' + id);
  return g;
}
function SLOT(id) {
  const s = DATA.slots[id];
  if (!s) throw new Error('unknown slot: ' + id);
  return s;
}
/* The room vocabulary (rule 9: the words are the sheet's, not the code's). */
const WORD_IDS = Object.keys(DATA.words);
function WORD(id) {
  const w = DATA.words[id];
  if (!w) throw new Error('unknown word: ' + id);
  return w;
}

const STRUCTURE_IDS = Object.keys(DATA.structures);
const SPART_IDS = Object.keys(DATA.structure_parts);
/* The parts of one structure, in sheet order (ground up, like a figure). */
function STRUCT_PARTS(id) {
  const out = [];
  for (let i = 0; i < SPART_IDS.length; i++) {
    const pr = DATA.structure_parts[SPART_IDS[i]];
    if (pr.structure === id) out.push({ id: SPART_IDS[i], part: pr });
  }
  return out;
}
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
  shadeLeft:   K('render.side_shade_left'),
  shadeRight:  K('render.side_shade_right'),
  heightTint:  K('render.height_tint'),
  zoomStart:   K('render.zoom_start'),
  zoomMin:     K('render.zoom_min'),
  zoomMax:     K('render.zoom_max'),
  maxBufW:     K('render.max_buffer_w'),
  maxBufH:     K('render.max_buffer_h'),
  cutSolid:    K('render.cut_solid'),
  cutawayDepth: K('render.cutaway_depth'),
  wallFadeM:   K('render.wall_fade_m'),
  cutStumpM:   K('render.cut_stump_m'),
  swingMs:     K('camera.swing_ms'),
  tiltMs:      K('camera.tilt_ms'),
  keyPan:      K('camera.key_pan_speed'),
  chunkTiles:  K('world.chunk_tiles'),
  maxElev:     K('world.max_elevation'),
  roomNamedChance:     K('world.room_named_chance'),
  roomConditionChance: K('world.room_condition_chance'),
  roomPeopleChance:    K('world.room_people_chance'),
  roomShapeRamps:      K('world.room_shape_ramps'),
  roomShapeMinSide:    K('world.room_shape_min_side'),
  studyDifficulty:     K('room.study_difficulty'),
  studyTicks:          K('room.study_ticks'),
  rooms:       K('world.rooms'),
  roomMin:     K('world.room_min'),
  roomMax:     K('world.room_max'),
  hallWidth:   K('world.hall_width'),
  rockHeight:  K('world.rock_height'),
  joinMin:     K('world.join_min'),
  joinMax:     K('world.join_max'),
  joinMargin:  K('world.join_margin'),
  chunksPerFrame: K('world.chunks_per_frame'),
  liveRing:    K('world.live_ring'),
  campBedrolls: K('camp.bedrolls'),
  campStores:  K('camp.stores'),
  campWindbreaks: K('camp.windbreaks'),
  campSpread:  K('camp.site_spread'),
  campProgress: K('camp.progress_per_success'),
  campWorkTicks: K('camp.work_ticks'),
  attrWeight:  K('roll.attribute_weight'),
  skillWeight: K('roll.skill_weight'),
  dice:        K('roll.dice'),
  dieFaces:    K('roll.die_faces'),
  skillCap:    K('skill.cap'),
  gainFail:    K('learn.gain_on_failure'),
  gainWin:     K('learn.gain_on_success'),
  nearMissBonus: K('learn.near_miss_bonus'),
  nearMissMargin: K('learn.near_miss_margin'),
  actorCount:  K('actor.count'),
  attrMin:     K('actor.attribute_min'),
  attrMax:     K('actor.attribute_max'),
  stepTicks:   K('actor.step_ticks'),
  actorHeight: K('actor.height_m'),
  gearChance:  K('actor.gear_chance'),
  walkTicks:   K('anim.walk_ticks'),
  walkLegSwing: K('anim.walk_leg_swing'),
  walkKneeBend: K('anim.walk_knee_bend'),
  walkArmSwing: K('anim.walk_arm_swing'),
  walkBob:     K('anim.walk_bob'),
  workTicks:   K('anim.work_ticks'),
  workArmLift: K('anim.work_arm_lift'),
  workLean:    K('anim.work_lean'),
  idleTicks:   K('anim.idle_ticks'),
  idleSway:    K('anim.idle_sway'),
  turnTicks:   K('anim.turn_ticks'),
  stepWalkTicks: K('anim.step_ticks'),
  followOn:    K('camera.follow'),
  maxSteps:    K('time.max_steps_per_frame'),
  outlineWidth: K('render.outline_width'),
  minFacePx:   K('render.min_face_px'),
  texStrength: K('texture.strength'),
  texSeed:     K('texture.seed'),
  patternPx:        K('texture.pattern_px'),
  hueShift:         K('texture.hue_shift'),
  masonryMortar:    K('texture.masonry_mortar'),
  masonryVariation: K('texture.masonry_variation'),
  masonryCourseMin: K('texture.masonry_course_min'),
  masonryCourseMax: K('texture.masonry_course_max'),
  masonryStoneMin:  K('texture.masonry_stone_min'),
  masonryStoneMax:  K('texture.masonry_stone_max'),
  lightAmbient: K('render.light_ambient'),
  lightDiffuse: K('render.light_diffuse'),
  darkAmbient: K('light.ambient'),
  warmth:      K('light.warmth'),
  lightSteps:  K('light.steps'),
  falloff:     K('light.falloff'),
  lampHeight:  K('light.lamp_height'),
  fireHeight:  K('light.fire_height'),
  heightFalloff: K('light.height_falloff'),
  lightSmooth: K('light.smooth'),
  acrossMin:   K('light.across_min'),
  wrapBlend:   K('render.wrap_blend'),
  shadeStrength: K('light.shade_strength'),
  shadeGive:   K('light.shade_give'),
  shadeReach:  K('light.shade_reach'),
  shadeGirth:  K('light.shade_girth'),
  figureNominal: G('figure.nominal_height_m'),
  metresPerTile: G('world.metres_per_tile'),
  isoRatio:    G('render.iso_ratio')
};

/* One metre of elevation is one metre. Rule 7 holds everywhere or nowhere. */
const TILE_METRES = CFG.metresPerTile;

/* One fixed simulation step. Not a knob: changing it changes what a tick MEANS,
   and every rate in the game is quoted per tick. */
const TICK_MS = 1000 / 60;

function shade(hex, f) { return litShade(hex, f, 1); }

/* A surface colour, shaded for its own facing AND for how much light is
   reaching it. The labyrinth is dark; `light` is what a fire or a carried lamp
   has managed to put on this square. Lit things also go warm, because what is
   doing the lighting is a flame. */
function litShade(hex, f, light) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  const lvl = CFG.darkAmbient + (1 - CFG.darkAmbient) * light;
  const w = CFG.warmth * light;
  /* A face turned away from the light goes COLD as well as dark. Hue-shifted
     shadows are what keep a dark picture from reading as grey mud; a flat
     multiply takes every material to the same sludge. */
  const cold = (1 - f) * CFG.hueShift;
  const c = (v, k) => Math.max(0, Math.min(255, Math.round(v * f * lvl * k)));
  return 'rgb(' + c((n >> 16) & 255, (1 + w * 0.30) * (1 - cold * 0.55))
       + ',' + c((n >> 8) & 255, (1 + w * 0.10) * (1 - cold * 0.18))
       + ',' + c(n & 255, (1 - w * 0.30) * (1 + cold * 0.65)) + ')';
}

/* The SHADING alone, with no colour of its own: what a surface is multiplied by
   at this facing and this much light. It is the same function with white in it,
   rather than a second copy of the arithmetic, so the two cannot drift apart.

   A material the game GENERATES is drawn as an overlay on the tile's colour and
   never needs this. A material somebody DREW is the colour, and the picture has
   to be multiplied by the light on its own: multiplied by the tile's colour as
   well it would come out nearly black -- a picture's own mid-brown against
   packed earth's brown is about a tenth as bright as either. */
function lightShade(f, light) { return litShade('#ffffff', f, light); }

/* WHAT TO MULTIPLY ONE BRIGHTNESS BY TO TURN IT INTO ANOTHER -- a colour a
   `multiply` fill can wear, worked out from two light levels and nothing else.

   It does not depend on the surface, and that is the whole of why this is
   possible: the ratio between two finishes of `litShade()` is the same for every
   colour and every facing, because the colour and the facing are multiplied
   through both of them and cancel. So it is worked out ONCE, at a facing of a
   half -- which is also the only facing that does not clip a channel against 255
   on the way in, and a channel that clipped would take the ratio with it.

   `ref` must be the brighter of the two or the answer would be a brightening,
   which multiplying cannot do; the caller paints the surface at `ref` first and
   multiplies it back down. */
const RATIO = Object.create(null);
function shadeRatio(ref, e) {
  if (!(e < ref)) return '#ffffff';
  const key = Math.round(ref * 256) * 65536 + Math.round(e * 256);
  const had = RATIO[key];
  if (had) return had;
  const a = litShade('#ffffff', 0.5, ref), b = litShade('#ffffff', 0.5, e);
  const na = a.slice(4, -1).split(','), nb = b.slice(4, -1).split(',');
  const ch = (i) => {
    const d = Number(na[i]);
    if (!(d > 0)) return 255;      /* nothing to take away from */
    return Math.max(0, Math.min(255, Math.round(255 * Number(nb[i]) / d)));
  };
  const out = 'rgb(' + ch(0) + ',' + ch(1) + ',' + ch(2) + ')';
  /* A memo and not a table: the ladder the light is stepped to keeps this to a
     hundred or so entries, and a face whose light ramps as well asks at whatever
     heights it reaches. Told to forget rather than allowed to grow for ever --
     it costs one `litShade` to ask again. */
  if (Object.keys(RATIO).length > 4096) for (const k in RATIO) delete RATIO[k];
  RATIO[key] = out;
  return out;
}
