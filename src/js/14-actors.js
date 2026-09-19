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

/* ---- gear, which is twelve parts and does three things --------------------
   Gear SHIFTS an attribute (a pack makes you stronger-backed and slower), it
   BONUSES a skill (boots help you keep your feet), and some work REQUIRES it
   (you cannot build with your hands). All three go through ability() below, so
   there is still exactly one place anything is resolved (rule 2). */

function wornList(actor) {
  const out = [];
  for (let i = 0; i < SLOT_IDS.length; i++) {
    const item = actor.worn[SLOT_IDS[i]];
    if (item) out.push(item);
  }
  return out;
}

function gearAttrShift(actor, attrId) {
  let sum = 0;
  const worn = wornList(actor);
  for (let i = 0; i < worn.length; i++) {
    const pairs = GEAR(worn[i]).attr;
    for (let k = 0; k < pairs.length; k++) {
      if (pairs[k][0] === attrId) sum += pairs[k][1];
    }
  }
  return sum;
}

/* What an attribute is actually worth right now, gear included. */
function effAttr(actor, attrId) {
  return actor.attr[attrId] + gearAttrShift(actor, attrId);
}

function gearBonus(actor, skillId) {
  let sum = 0;
  const worn = wornList(actor);
  for (let i = 0; i < worn.length; i++) {
    const pairs = GEAR(worn[i]).bonus;
    for (let k = 0; k < pairs.length; k++) {
      if (pairs[k][0] === skillId) sum += pairs[k][1];
    }
  }
  return sum;
}

function carriesTag(actor, tag) {
  const worn = wornList(actor);
  for (let i = 0; i < worn.length; i++) {
    if (GEAR(worn[i]).tags.indexOf(tag) >= 0) return true;
  }
  return false;
}

/* Some work needs a tool at all. Going without is not forbidden -- it is just
   very hard, which keeps one rule instead of two. */
function toolPenalty(actor, skillId) {
  const sk = SKILL(skillId);
  if (!sk.needs_tag) return 0;
  return carriesTag(actor, sk.needs_tag) ? 0 : sk.without;
}

/* What the six attributes are worth to one skill, as a weighted average. */
function attributeBase(actor, skillId) {
  const derives = SKILL(skillId).derives;
  let total = 0, weight = 0;
  for (let i = 0; i < derives.length; i++) {
    total += effAttr(actor, derives[i][0]) * derives[i][1];
    weight += derives[i][1];
  }
  return weight ? total / weight : 0;
}

/* What is banked, fractions and all. Learning adds to this. */
function skillLevel(actor, skillId) {
  return actor.skills[skillId] || 0;
}

/* What COUNTS. Rule 10: whole pips only, so every roll is whole numbers you
   could read off a table. Practice accumulates in between and buys the next
   pip; it does not dribble into the result. */
function skillPips(actor, skillId) {
  return Math.floor(skillLevel(actor, skillId));
}

/* Talent plus practice. Practice eventually outweighs talent, which is the
   point of a game about people who come and go. */
function ability(actor, skillId) {
  return Math.round(attributeBase(actor, skillId)) * CFG.attrWeight
       + skillPips(actor, skillId) * CFG.skillWeight
       + gearBonus(actor, skillId)
       + toolPenalty(actor, skillId);
}

/* Dice. Two six-sided ones by default, which is the whole reason the numbers
   are small: 2d6 is a shape anybody already knows. Seeded, like everything. */
function roll(rand) {
  let total = 0;
  for (let i = 0; i < CFG.dice; i++) total += 1 + Math.floor(rand() * CFG.dieFaces);
  return total;
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
  const dice = roll(state.rand);
  const total = able + dice;
  const margin = total - difficulty;
  const ok = margin >= 0;
  const gain = learn(actor, skillId, ok, margin);
  state.rolls++;
  /* Everything the roll was made of is kept, so the panel can show the sum the
     way a person at a table would read it: 4 and 2, threw 7, needed 15. */
  actor.lastRoll = {
    skill: skillId, skillName: SKILL(skillId).name,
    difficulty: difficulty, ability: able, dice: dice, total: total,
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
  /* Rule 4: what they are wearing is on them, not in a panel. Twelve slots,
     and what turns up in each is down to the seed. */
  const worn = {};
  for (let i = 0; i < SLOT_IDS.length; i++) {
    const slot = SLOT_IDS[i];
    const choices = GEAR_IDS.filter(function (g) { return GEAR(g).slot === slot; });
    if (!choices.length) continue;
    if (rand() < CFG.gearChance) worn[slot] = choices[Math.floor(rand() * choices.length)];
  }
  return {
    index: index,
    name: name,
    attr: attr,
    skills: {},
    worn: worn,
    x: 0, y: 0,
    /* Where they are actually drawn, which lags where they ARE: a crawler walks
       from square to square rather than appearing on the next one. */
    fromX: 0, fromY: 0, moveT: 1,
    face: 0, faceTarget: 0,
    gait: Math.floor(rand() * 120),   /* so six crawlers do not march in step */
    cooldown: Math.floor(rand() * CFG.stepTicks),
    lastRoll: null, lastWork: null,
    site: -1, doing: 'idle',
    steps: 0, stumbles: 0
  };
}

function namePool() {
  return N('character.name_pool').split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s.length; });
}

function populate(state) {
  const w = state.world, rand = state.rand, pool = namePool();
  /* Scattered through the rooms, not heaped in one -- gathering is something
     the player should be able to watch happen. */
  const open = [];
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i];
    if (c.room >= 0 && TILE(c.tile).footing === 'walk') open.push(i);
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

const MOVE_SKILL = 'clambering';

/* Try to move one metre. Every step onto difficult ground is a Focusing roll
   against how hard that floor is to cross -- water and rubble are genuinely
   worth failing at. */
function tryStep(state, actor, to, dx, dy) {
  actor.faceTarget = facingFor(dx, dy);
  const roll = attempt(state, actor, MOVE_SKILL, TILE(to.tile).cross);
  if (roll.ok) {
    actor.fromX = actor.x;
    actor.fromY = actor.y;
    actor.moveT = 0;              /* start the walk; the tick loop finishes it */
    actor.x = to.x;
    actor.y = to.y;
    actor.steps++;
    state.lightDirty = true;      /* whatever they are carrying moved with them */
    actor.doing = 'walking';
  } else {
    actor.stumbles++;
  }
  state.viewDirty = true;
  state.geomDirty = true;
  return roll;
}

function wander(state, actor) {
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
  return tryStep(state, actor, choice.to, choice.d[0], choice.d[1]);
}

/* A crawler's own initiative. The player is a head coach, not a hand: nothing
   here waits to be told. They pick the nearest bit of the camp that still needs
   doing, walk to it, and work at it. */
/* Where a crawler is DRAWN: part way between the square they left and the one
   they are heading for, and part way up the step if it was a ramp. */
function actorPos(state, actor) {
  const w = state.world;
  const to = w.at(actor.x, actor.y);
  const hTo = to ? surfaceHeight(to) : 0;
  if (actor.moveT >= 1) {
    return { gx: actor.x + 0.5, gy: actor.y + 0.5, h: hTo };
  }
  const from = w.at(actor.fromX, actor.fromY) || to;
  const hFrom = from ? surfaceHeight(from) : hTo;
  const t = actor.moveT;
  const e = t * t * (3 - 2 * t);        /* ease in and out of the step */
  return {
    gx: actor.fromX + (actor.x - actor.fromX) * e + 0.5,
    gy: actor.fromY + (actor.y - actor.fromY) * e + 0.5,
    h: hFrom + (hTo - hFrom) * e
  };
}

function actorStep(state, actor) {
  /* The walk plays out over several ticks, whether or not they are due to try
     another step. */
  if (actor.moveT < 1) {
    actor.moveT = Math.min(1, actor.moveT + 1 / Math.max(1, CFG.stepWalkTicks));
    state.viewDirty = true;
    state.geomDirty = true;
  }

  /* Turning happens every tick, not only on the tick they move, so a crawler
     swings round to face where they are going rather than snapping. */
  if (actor.face !== actor.faceTarget) {
    actor.face = turnToward(actor.face, actor.faceTarget,
                            (Math.PI / Math.max(1, CFG.turnTicks)));
    state.viewDirty = true;
    state.geomDirty = true;
  }
  if (actor.cooldown > 0) { actor.cooldown--; return null; }

  const camp = state.camp;
  if (!camp) { actor.cooldown = CFG.stepTicks; return wander(state, actor); }

  let site = actor.site >= 0 ? camp.sites[actor.site] : null;
  if (!site || site.built) {
    if (site) site.workers = Math.max(0, site.workers - 1);
    const next = claimSite(state, actor);
    if (next < 0) { actor.cooldown = CFG.stepTicks; actor.site = -1; return wander(state, actor); }
    actor.site = next;
    site = camp.sites[next];
    site.workers++;
  }

  /* Work from ALONGSIDE the site, not on top of it. Nobody builds a fire while
     standing in it, and a crawler drawn on the same square as a half-built
     store looks like they are standing on a crate. */
  const here = state.world.at(actor.x, actor.y);
  const away = site.field.at(here);
  if (away >= 0 && away <= 1) {
    actor.cooldown = CFG.campWorkTicks;
    actor.doing = site.cleared ? 'building' : 'clearing';
    actor.faceTarget = facingFor(site.x - actor.x, site.y - actor.y);
    return workSite(state, actor, site);
  }

  /* On the way, a crawler will stop and try to read a room they do not know.
     Nobody tells them to -- the player is a head coach. It is a Studying roll
     like any other, so failing at it teaches them (rule 1) and a place that
     will not give up its name is a place they get better at reading. */
  const study = studyHere(state, actor);
  if (study) return study;

  actor.cooldown = CFG.stepTicks;
  actor.doing = 'walking';
  const move = stepToward(state.world, here, site.field);
  if (!move) return wander(state, actor);
  return tryStep(state, actor, move.cell, move.dx, move.dy);
}

/* Is this crawler standing somewhere worth working out? A room only gives up
   what it was once somebody has read it -- the walls, the bones, what is left
   of the fittings. Three tries each and they let it lie, so a crawler with no
   head for it does not stand in a doorway forever. */
const STUDY_TRIES = 3;

function studyHere(state, actor) {
  const cell = state.world.at(actor.x, actor.y);
  if (!cell || cell.room < 0) return null;
  const room = state.world.rooms[cell.room];
  if (!room || !room.place || room.known) return null;
  if (!actor.studied) actor.studied = {};
  const tries = actor.studied[cell.room] || 0;
  if (tries >= STUDY_TRIES) return null;

  actor.studied[cell.room] = tries + 1;
  actor.cooldown = CFG.studyTicks;
  actor.doing = 'studying';
  const roll = attempt(state, actor, 'studying', CFG.studyDifficulty);
  room.studies++;
  if (roll.ok) {
    room.known = true;
    room.readBy = actor.name;
    state.viewDirty = true;
  }
  actor.lastWork = { what: 'studying', ok: roll.ok };
  return roll;
}

/* ---- describing one, for the inspector ----------------------------------- */

function describeActor(actor) {
  const attrs = ATTRIBUTE_IDS.map(function (id) {
    return { id: id, abbrev: ATTR(id).abbrev, name: ATTR(id).name,
             value: effAttr(actor, id), base: actor.attr[id],
             shift: gearAttrShift(actor, id) };
  });
  const skills = SKILL_IDS.filter(function (id) { return actor.skills[id]; })
    .map(function (id) {
      const raw = skillLevel(actor, id);
      return { id: id, name: SKILL(id).name,
               level: Math.floor(raw),
               progress: raw - Math.floor(raw),
               cap: CFG.skillCap,
               from: SKILL(id).derives.map(function (p) { return ATTR(p[0]).abbrev; }).join('+') };
    });
  const gear = SLOT_IDS.map(function (slot) {
    const item = actor.worn[slot];
    if (!item) return { slot: slot, slotName: SLOT(slot).name, empty: true };
    const g = GEAR(item);
    const effects = [];
    for (const pair of g.attr) {
      effects.push((pair[1] > 0 ? '+' : '') + pair[1] + ' ' + ATTR(pair[0]).abbrev);
    }
    for (const pair of g.bonus) {
      effects.push((pair[1] > 0 ? '+' : '') + pair[1] + ' ' + SKILL(pair[0]).name);
    }
    return { slot: slot, slotName: SLOT(slot).name, item: item, name: g.name,
             tags: g.tags.map(function (t) { return TAG(t).name; }),
             effects: effects, empty: false };
  });
  const worn = gear.filter(function (g) { return !g.empty; })
                   .map(function (g) { return g.name; });
  return {
    kind: 'crawler',
    name: actor.name,
    at: actor.x + ', ' + actor.y,
    attributes: attrs,
    skills: skills,
    worn: worn,
    gear: gear,
    lacksTool: !carriesTag(actor, 'tool'),
    lastRoll: actor.lastRoll,
    steps: actor.steps,
    stumbles: actor.stumbles,
    doing: actor.doing,
    lastWork: actor.lastWork,
    tags: CRAWLER_TAGS.map(function (t) { return TAG(t).name; })
  };
}
