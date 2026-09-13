/* Crawlers: the people in the labyrinth.
 *
 * RULE 2, and it governs everything that will ever be added here:
 *   every action roll comes from a SKILL, and every skill is derived from the
 *   SIX NATURAL ATTRIBUTES -- Might, Agility, Endurance, Presence, Intellect,
 *   Willpower. There is one framework. A new ability is a new row in the skills
 *   tab naming which attributes feed it, never a new system beside this one.
 *
 * RULE 1, and it is the whole shape of progression:
 *   a character learns by FAILING. Success teaches very little; failing teaches
 *   a lot, and failing only just teaches most of all. Nothing here contains a
 *   curve that slows progress down -- the slowdown is what HAPPENS, because a
 *   more practised crawler fails less often and so is taught less often.
 *   That is rule 1's "therefore", and it falls out rather than being imposed.
 */

/* What a crawler is, in the shared vocabulary. Creatures proper -- generated,
   tagged, rule 6 -- will describe themselves the same way. */
const CRAWLER_TAGS = ['person', 'crawler'];

/* ---- the roll ----------------------------------------------------------- */

/* What the six attributes are worth to one skill, as a weighted average. */
function attributeBase(actor, skillId) {
  const derives = SKILL(skillId).derives;
  let total = 0, weight = 0;
  for (let i = 0; i < derives.length; i++) {
    total += actor.attr[derives[i][0]] * derives[i][1];
    weight += derives[i][1];
  }
  return weight ? total / weight : 0;
}

function skillLevel(actor, skillId) {
  return actor.skills[skillId] || 0;
}

/* Talent plus practice. Practice eventually outweighs talent, which is the
   point of a game about people who come and go. */
function ability(actor, skillId) {
  return attributeBase(actor, skillId) * CFG.attrWeight
       + skillLevel(actor, skillId) * CFG.skillWeight;
}

/* Triangular luck: two draws added, so results cluster near the middle and a
   wild swing is rare. Seeded, like everything else. */
function luck(rand) {
  return (rand() + rand() - 1) * CFG.noiseSpread;
}

function learn(actor, skillId, ok, margin) {
  const current = skillLevel(actor, skillId);
  if (current >= CFG.skillCap) return 0;
  let gain;
  if (ok) {
    gain = CFG.gainWin;
  } else {
    gain = CFG.gainFail;
    if (-margin <= CFG.nearMissMargin) gain += CFG.nearMissBonus;
  }
  actor.skills[skillId] = Math.min(CFG.skillCap, current + gain);
  return gain;
}

/* One attempt at one thing. This is the ONLY way anything is ever resolved. */
function attempt(state, actor, skillId, difficulty) {
  const able = ability(actor, skillId);
  const margin = able + luck(state.rand) - difficulty;
  const ok = margin >= 0;
  const gain = learn(actor, skillId, ok, margin);
  state.rolls++;
  actor.lastRoll = {
    skill: skillId, difficulty: difficulty, ability: able,
    margin: margin, ok: ok, gain: gain, tick: state.tick
  };
  return actor.lastRoll;
}

/* ---- making a crawler ---------------------------------------------------- */

function rollAttribute(rand) {
  /* Three draws averaged: most people are ordinary, a few are not. */
  const span = CFG.attrMax - CFG.attrMin;
  return Math.round(CFG.attrMin + (rand() + rand() + rand()) / 3 * span);
}

function makeActor(rand, index, name) {
  const attr = {};
  for (let i = 0; i < ATTRIBUTE_IDS.length; i++) {
    attr[ATTRIBUTE_IDS[i]] = rollAttribute(rand);
  }
  return {
    index: index,
    name: name,
    attr: attr,
    skills: {},
    /* Rule 4: what they are wearing is on them, not in a panel. */
    worn: rand() < CFG.hatChance ? { hat: 'hat' } : {},
    x: 0, y: 0,
    cooldown: Math.floor(rand() * CFG.stepTicks),
    lastRoll: null,
    steps: 0, stumbles: 0
  };
}

function namePool() {
  return N('character.name_pool').split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length; });
}

function populate(state) {
  const w = state.world, rand = state.rand, pool = namePool();
  const open = [];
  for (let i = 0; i < w.cells.length; i++) {
    if (TILE(w.cells[i].tile).footing !== 'block') open.push(i);
  }
  const actors = [];
  for (let i = 0; i < CFG.actorCount && open.length; i++) {
    const a = makeActor(rand, i, pool[Math.floor(rand() * pool.length)] || ('Crawler ' + (i + 1)));
    const pick = open.splice(Math.floor(rand() * open.length), 1)[0];
    a.x = w.cells[pick].x;
    a.y = w.cells[pick].y;
    actors.push(a);
  }
  return actors;
}

/* ---- moving through the labyrinth ---------------------------------------- */

/* The elevation at which a cell meets its neighbour in a given direction. A
   ramp meets one neighbour a metre higher than it meets the others; everything
   else meets all four at its own height. */
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

/* A crawler's own initiative. The player is a head coach, not a hand: nothing
   here waits to be told. For now that initiative is "wander", and every step
   onto difficult ground is a Clambering roll -- which is how the framework
   above is reachable in a real match rather than only in a test. */
function actorStep(state, actor) {
  if (actor.cooldown > 0) { actor.cooldown--; return null; }
  actor.cooldown = CFG.stepTicks;

  const w = state.world;
  const here = w.at(actor.x, actor.y);
  const options = [];
  for (let i = 0; i < STEPS.length; i++) {
    const d = STEPS[i];
    const to = w.at(actor.x + d[0], actor.y + d[1]);
    if (to && canStep(here, to, d[0], d[1])) options.push({ d: d, to: to });
  }
  if (!options.length) return null;

  const choice = options[Math.floor(state.rand() * options.length)];
  const roll = attempt(state, actor, 'clambering', TILE(choice.to.tile).cross);
  if (roll.ok) {
    actor.x = choice.to.x;
    actor.y = choice.to.y;
    actor.steps++;
  } else {
    actor.stumbles++;
  }
  state.viewDirty = true;
  return roll;
}

/* ---- describing one, for the inspector ----------------------------------- */

function describeActor(actor) {
  const attrs = ATTRIBUTE_IDS.map(function (id) {
    return { id: id, abbrev: ATTR(id).abbrev, name: ATTR(id).name, value: actor.attr[id] };
  });
  const skills = SKILL_IDS.filter(function (id) { return actor.skills[id]; })
    .map(function (id) {
      return { id: id, name: SKILL(id).name,
               level: Math.round(skillLevel(actor, id) * 10) / 10,
               from: SKILL(id).derives.map(function (p) { return ATTR(p[0]).abbrev; }).join('+') };
    });
  const worn = Object.keys(actor.worn).map(function (slot) {
    return DATA.figure[actor.worn[slot]].name;
  });
  return {
    kind: 'crawler',
    name: actor.name,
    at: actor.x + ', ' + actor.y,
    attributes: attrs,
    skills: skills,
    worn: worn,
    steps: actor.steps,
    stumbles: actor.stumbles,
    tags: CRAWLER_TAGS.map(function (t) { return TAG(t).name; })
  };
}
