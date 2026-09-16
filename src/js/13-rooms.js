/* A room is not a rectangle of floor. It is a PLACE, and the place is built out
 * of words.
 *
 * One `function` word says what it was built to be -- a cistern, an arena, a
 * slave market. Up to two `condition` words say what has happened to it since --
 * flooded, collapsed, haunted. An optional `people` word says whose it was. So
 * "Haunted Abandoned Goblin Slave Market" is four rows of the `words` tab found
 * together, and there are about a quarter of a million of it.
 *
 * The point is that a word carries BOTH halves of itself on one line of the
 * sheet: what it means (its tags) and what it does to the ground (its shape
 * moves, its floor). "Flooded" is not a label somebody remembered to apply after
 * filling the low ground with water -- filling the low ground with water IS what
 * the word does. The name and the place cannot drift apart, for the same reason
 * a piece of gear carries its look and its effect on one row.
 *
 * WHAT IS GUARANTEED, and how:
 *   - the border ring of a room is never touched, because that is where halls
 *     arrive. Nothing about hall digging has to know rooms have shape now.
 *   - heights only ever step by one metre, and every pair of touching levels
 *     gets ramps, so the levels are connected BY CONSTRUCTION.
 *   - a block (a pillar, a fallen slab) is placed only if the room is still
 *     whole with it there. That is checked per block, not hoped for.
 */

/* The moves a word may ask for. The build refuses a word naming anything else,
   so this list and the sheet cannot disagree. */
const ROOM_SHAPES = ['pit', 'platform', 'terrace', 'pillars', 'rubble', 'water', 'ring'];

function wordsInSlot(slot) {
  const out = [];
  for (let i = 0; i < WORD_IDS.length; i++) {
    if (WORD(WORD_IDS[i]).slot === slot) out.push(WORD_IDS[i]);
  }
  return out;
}

/* Pick one word from a slot, by weight. */
function pickWord(rand, slot, exclude) {
  const ids = wordsInSlot(slot);
  let total = 0;
  for (let i = 0; i < ids.length; i++) {
    if (exclude && exclude.indexOf(ids[i]) >= 0) continue;
    total += WORD(ids[i]).weight;
  }
  if (total <= 0) return null;
  let roll = rand() * total;
  for (let i = 0; i < ids.length; i++) {
    if (exclude && exclude.indexOf(ids[i]) >= 0) continue;
    roll -= WORD(ids[i]).weight;
    if (roll <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

/* Name a room: conditions first, then whose it was, then what it was. That
   order is what makes the phrase read as English rather than as a list. */
function nameRoom(rand) {
  const fn = pickWord(rand, 'function');
  if (!fn) return null;
  const conditions = [];
  for (let i = 0; i < 2; i++) {
    if (rand() >= CFG.roomConditionChance) break;
    const c = pickWord(rand, 'condition', conditions);
    if (c) conditions.push(c);
  }
  const people = rand() < CFG.roomPeopleChance ? pickWord(rand, 'people') : null;

  /* Conditions read most recent first, which is how a person would say it:
     the haunting happened after the abandoning. */
  const order = conditions.slice().reverse();
  if (people) order.push(people);
  order.push(fn);

  const tags = [];
  for (let i = 0; i < order.length; i++) {
    const w = WORD(order[i]);
    for (let t = 0; t < w.tags.length; t++) {
      if (tags.indexOf(w.tags[t]) < 0) tags.push(w.tags[t]);
    }
  }
  if (tags.indexOf('room') < 0) tags.push('room');

  const title = order.map(function (id) { return WORD(id).name; }).join(' ');
  return { words: order, title: title, tags: tags,
           fn: fn, conditions: conditions, people: people };
}

/* ---- shaping the ground ------------------------------------------------- */

/* Everything below works on the INTERIOR of a room -- one metre in from every
   wall -- and clamps to the elevation range, so a room's floor can never climb
   past the rock it was cut out of. */
function roomInterior(r) {
  return { x0: r.x + 1, x1: r.x + r.w - 2, y0: r.y + 1, y1: r.y + r.h - 2 };
}

function shapeRoom(world, r, rand, place) {
  const at = function (x, y) { return world.at(x, y); };
  const box = roomInterior(r);
  const iw = box.x1 - box.x0 + 1, ih = box.y1 - box.y0 + 1;
  if (iw < CFG.roomShapeMinSide || ih < CFG.roomShapeMinSide) return false;

  const base = r.elev;
  const clamp = function (h) { return Math.max(0, Math.min(CFG.maxElev, h)); };
  const inside = function (x, y) {
    return x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1;
  };

  /* Every move a word asked for, in the order the words were read. */
  const moves = [];
  for (let i = 0; i < place.words.length; i++) {
    const w = WORD(place.words[i]);
    for (let m = 0; m < w.shape.length; m++) moves.push(w.shape[m]);
  }

  /* An inset rectangle of the interior, at least one cell in, so whatever is
     done to it is surrounded by ground that was not. */
  const insetRect = function (pad) {
    const x0 = box.x0 + pad, x1 = box.x1 - pad;
    const y0 = box.y0 + pad, y1 = box.y1 - pad;
    if (x1 < x0 || y1 < y0) return null;
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  };

  const stepRect = function (pad, by, times) {
    /* A stepped bowl or dais: each metre is one rectangle further in, so
       neighbouring cells never differ by more than a metre and a ramp can
       always join them. */
    let moved = false;
    for (let k = 0; k < times; k++) {
      const rect = insetRect(pad + k);
      if (!rect) break;
      for (let y = rect.y0; y <= rect.y1; y++) {
        for (let x = rect.x0; x <= rect.x1; x++) {
          const c = at(x, y);
          if (!c) continue;
          const want = clamp(c.h + by);
          if (want !== c.h) { c.h = want; moved = true; }
        }
      }
    }
    return moved;
  };

  let shaped = false;
  const blockMoves = [];

  for (let i = 0; i < moves.length; i++) {
    const op = moves[i][0], amt = moves[i][1];

    if (op === 'pit') {
      shaped = stepRect(1, -1, amt) || shaped;

    } else if (op === 'platform') {
      /* Against one wall rather than dead centre, so a room has a front and a
         back instead of being symmetrical about its middle. */
      const side = Math.floor(rand() * 4);
      const halfW = Math.max(1, Math.floor(iw / 2)), halfH = Math.max(1, Math.floor(ih / 2));
      let rect;
      if (side === 0) rect = { x0: box.x0, x1: box.x0 + halfW - 1, y0: box.y0, y1: box.y1 };
      else if (side === 1) rect = { x0: box.x1 - halfW + 1, x1: box.x1, y0: box.y0, y1: box.y1 };
      else if (side === 2) rect = { x0: box.x0, x1: box.x1, y0: box.y0, y1: box.y0 + halfH - 1 };
      else rect = { x0: box.x0, x1: box.x1, y0: box.y1 - halfH + 1, y1: box.y1 };
      for (let k = 0; k < amt; k++) {
        for (let y = rect.y0; y <= rect.y1; y++) {
          for (let x = rect.x0; x <= rect.x1; x++) {
            const c = at(x, y);
            if (!c) continue;
            const want = clamp(c.h + 1);
            if (want !== c.h) { c.h = want; shaped = true; }
          }
        }
        /* Each further metre is a smaller shelf on top of the last. */
        rect = { x0: rect.x0 + 1, x1: rect.x1 - 1, y0: rect.y0 + 1, y1: rect.y1 - 1 };
        if (rect.x1 < rect.x0 || rect.y1 < rect.y0) break;
      }

    } else if (op === 'terrace') {
      const alongX = rand() < 0.5;
      const len = alongX ? iw : ih;
      const bands = Math.max(2, Math.min(amt + 1, len));
      const width = Math.max(1, Math.floor(len / bands));
      for (let b = 1; b < bands; b++) {
        const from = b * width;
        for (let y = box.y0; y <= box.y1; y++) {
          for (let x = box.x0; x <= box.x1; x++) {
            const along = alongX ? x - box.x0 : y - box.y0;
            if (along < from) continue;
            const c = at(x, y);
            if (!c) continue;
            const want = clamp(c.h + 1);
            if (want !== c.h) { c.h = want; shaped = true; }
          }
        }
      }

    } else if (op === 'ring') {
      /* A raised lip around a lower middle: stalls round a market, seating
         round a pit. The lip is inside the interior, so the walkway by the
         wall stays at the room's own level. */
      const thick = Math.max(1, amt);
      for (let y = box.y0; y <= box.y1; y++) {
        for (let x = box.x0; x <= box.x1; x++) {
          const d = Math.min(x - box.x0, box.x1 - x, y - box.y0, box.y1 - y);
          if (d < 1 || d >= 1 + thick) continue;
          const c = at(x, y);
          if (!c) continue;
          const want = clamp(c.h + 1);
          if (want !== c.h) { c.h = want; shaped = true; }
        }
      }

    } else if (op === 'pillars' || op === 'rubble') {
      blockMoves.push([op, amt]);      /* blocks go in last, once heights settle */

    } else if (op === 'water') {
      /* Water finds the bottom. Whatever the shaping left lowest is what
         floods, so "flooded cistern" fills its tank and "flooded chapel" only
         wets the nave. */
      let low = Infinity;
      for (let y = box.y0; y <= box.y1; y++) {
        for (let x = box.x0; x <= box.x1; x++) {
          const c = at(x, y);
          if (c) low = Math.min(low, c.h);
        }
      }
      if (low !== Infinity) {
        for (let y = box.y0; y <= box.y1; y++) {
          for (let x = box.x0; x <= box.x1; x++) {
            const c = at(x, y);
            if (c && c.h < low + amt && !c.slope) {
              c.tile = 'shallow_water';
              shaped = true;
            }
          }
        }
      }
    }
  }

  /* ---- ramps, so every level can be reached from the one below ---------- */
  if (shaped) {
    /* Two moves can stack into a step no ramp can climb -- a pit inside a ring
       left a two-metre drop, and twenty-one squares of a flooded orcish arena
       were stranded behind it. Pull every cell down until nothing is more than
       a metre above its lowest neighbour, so a ramp can always bridge it. */
    smoothRoom(world, box);
    rampRoom(world, r, box, rand);
  }

  /* ---- and only now, the things that stand in the way ------------------- */
  for (let i = 0; i < blockMoves.length; i++) {
    shaped = blockRoom(world, r, box, rand, blockMoves[i][0], blockMoves[i][1]) || shaped;
  }

  /* ---- dressing: the floor a word lays -------------------------------- */
  for (let i = 0; i < place.words.length; i++) {
    const w = WORD(place.words[i]);
    if (!w.floor && !w.speckle) continue;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const c = at(x, y);
        if (!c || c.slope) continue;                 /* a ramp stays a ramp */
        if (TILE(c.tile).footing === 'block') continue;
        if (c.tile === 'shallow_water') continue;    /* water was laid on purpose */
        if (w.floor) c.tile = w.floor;
        if (w.speckle && rand() < 0.16) c.tile = w.speckle;
      }
    }
    shaped = true;
  }

  return shaped;
}

/* Join the levels. Every cell that is a metre below a neighbour is a candidate
   ramp; a few of each boundary are taken, spread along it, so you have to walk
   round a ledge to get up rather than stepping up anywhere. */
function rampRoom(world, r, box, rand) {
  const at = function (x, y) { return world.at(x, y); };

  /* Label the shelves: each connected run of equal-height floor is one region.
     Ramps are then placed per PAIR of touching regions, which is the only way
     to be sure every shelf can be reached -- grouping by row put a ramp in
     every row and turned each ledge into an open slope. */
  const region = new Map();        /* square -> which shelf it belongs to */
  let next = 0;
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const c = at(x, y);
      if (!c || region.has(c)) continue;
      if (TILE(c.tile).footing === 'block') continue;
      const id = next++;
      const queue = [c];
      region.set(c, id);
      let head = 0;
      while (head < queue.length) {
        const q = queue[head++];
        for (let s = 0; s < STEPS.length; s++) {
          const nx = q.x + STEPS[s][0], ny = q.y + STEPS[s][1];
          if (nx < box.x0 || nx > box.x1 || ny < box.y0 || ny > box.y1) continue;
          const nb = at(nx, ny);
          if (!nb || nb.h !== c.h || region.has(nb)) continue;
          if (TILE(nb.tile).footing === 'block') continue;
          region.set(nb, id);
          queue.push(nb);
        }
      }
    }
  }

  /* Every candidate is a cell one metre BELOW a neighbour: stand there, slope
     toward it, and the two levels meet. The border ring counts as a region of
     its own, so a shelf can also be reached from the walkway by the wall. */
  const pairs = {};
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const c = at(x, y);
      if (!c || c.slope || TILE(c.tile).footing === 'block') continue;
      for (let s = 0; s < STEPS.length; s++) {
        const dx = STEPS[s][0], dy = STEPS[s][1];
        const nb = at(x + dx, y + dy);
        if (!nb || nb.h !== c.h + 1 || TILE(nb.tile).footing === 'block') continue;
        const hi = region.has(nb) ? region.get(nb) : 'edge';
        const id = (region.has(c) ? region.get(c) : 'edge') + '>' + hi;
        (pairs[id] || (pairs[id] = [])).push([x, y, dx, dy]);
      }
    }
  }

  const taken = new Set();         /* squares that are already a way up */
  const ids = Object.keys(pairs);
  for (let k = 0; k < ids.length; k++) {
    const list = pairs[ids[k]];
    const want = Math.max(1, Math.min(CFG.roomShapeRamps, list.length));
    let made = 0;
    for (let w = 0; w < list.length && made < want; w++) {
      /* Spread the ways up along the boundary rather than bunching them. */
      const pick = list[Math.floor((made + 0.5) * list.length / want)] || list[w];
      const x = pick[0], y = pick[1];
      const c = at(x, y);
      if (!c || c.slope || taken.has(c)) continue;
      c.slope = slopeFor(pick[2], pick[3]);
      c.tile = 'stone_ramp';
      taken.add(c);
      made++;
    }
    /* If the spread picks all landed on cells already used as ramps for another
       boundary, fall back to taking the first free one -- a shelf with no way
       up is the one thing this pass may not leave behind. */
    if (!made) {
      for (let w = 0; w < list.length; w++) {
        const x = list[w][0], y = list[w][1];
        const c = at(x, y);
        if (!c || c.slope || taken.has(c)) continue;
        c.slope = slopeFor(list[w][2], list[w][3]);
        c.tile = 'stone_ramp';
        taken.add(c);
        break;
      }
    }
  }
}

/* No cell may sit more than a metre above its lowest walkable neighbour, or a
   ramp cannot bridge them and whatever is beyond is stranded. Pulling the high
   side down preserves the shape -- a two-metre dais becomes a one-metre dais --
   where refusing the move would have thrown the whole room away. */
function smoothRoom(world, box) {
  const at = function (x, y) { return world.at(x, y); };
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (let y = box.y0; y <= box.y1; y++) {
      for (let x = box.x0; x <= box.x1; x++) {
        const c = at(x, y);
        if (!c) continue;
        let low = Infinity;
        for (let s = 0; s < STEPS.length; s++) {
          const nb = at(x + STEPS[s][0], y + STEPS[s][1]);
          if (nb) low = Math.min(low, nb.h);
        }
        if (low !== Infinity && c.h > low + 1) { c.h = low + 1; changed = true; }
      }
    }
    if (!changed) return;
  }
}

/* Pillars and fallen slabs. A block goes in ONLY if the room is still whole
   with it there -- checked, one block at a time, rather than scattered and
   hoped for. A colonnade that seals off the apse is not a colonnade. */
function blockRoom(world, r, box, rand, kind, amt) {
  const at = function (x, y) { return world.at(x, y); };
  const spots = [];
  if (kind === 'pillars') {
    const gap = Math.max(2, 5 - amt);
    for (let y = box.y0 + 1; y <= box.y1 - 1; y += gap) {
      for (let x = box.x0 + 1; x <= box.x1 - 1; x += gap) spots.push([x, y]);
    }
  } else {
    const n = Math.min(Math.floor(((box.x1 - box.x0 + 1) * (box.y1 - box.y0 + 1)) * 0.04 * amt),
                       60);
    for (let i = 0; i < n; i++) {
      spots.push([box.x0 + Math.floor(rand() * (box.x1 - box.x0 + 1)),
                  box.y0 + Math.floor(rand() * (box.y1 - box.y0 + 1))]);
    }
  }

  let placed = 0;
  for (let i = 0; i < spots.length; i++) {
    const x = spots[i][0], y = spots[i][1];
    /* Never the middle. The generator uses a room's centre square as the room
       itself -- it is where a hall is aimed, and it is the square the final
       reachability sweep tests -- so a pillar standing there does not block one
       square, it deletes the whole room. That cost twenty-five tests. */
    if (x === r.cx && y === r.cy) continue;
    const c = at(x, y);
    if (!c || c.slope || TILE(c.tile).footing === 'block') continue;
    /* A block MAY land on the square a ramp climbs into, and it stays there.
       That was guarded against for one version (v0.33.0) and the guard was
       thrown away in v0.33.2 -- a slope that fetches up against rock is a cave,
       not a defect, and keeping the guard cost the room its shape. See the
       long note over repairSlopes() in 12-world.js. */
    const wasTile = c.tile, wasH = c.h;
    if (kind === 'rubble' && rand() < 0.5) {
      c.tile = 'rubble';                 /* walkable, just hard going */
      placed++;
      continue;
    }
    c.tile = 'stone_block';
    c.h = Math.max(c.h + 1, r.elev + 1);
    if (roomWhole(world, r, box)) { placed++; }
    else { c.tile = wasTile; c.h = wasH; }
  }
  return placed > 0;
}

/* Can every walkable square of this room still be reached from the doorway
   ring around its edge? This is the check that lets blocks be placed at all. */
function roomWhole(world, r, box) {
  const at = function (x, y) { return world.at(x, y); };
  let start = null;
  for (let x = r.x; x < r.x + r.w && !start; x++) {
    const c = at(x, r.y);
    if (c && TILE(c.tile).footing !== 'block') start = c;
  }
  if (!start) return false;

  const seen = new Set([start]);
  const queue = [start];
  let head = 0;
  while (head < queue.length) {
    const c = queue[head++];
    for (let s = 0; s < STEPS.length; s++) {
      const dx = STEPS[s][0], dy = STEPS[s][1];
      const n = at(c.x + dx, c.y + dy);
      if (!n || n.room !== r.index) continue;
      if (seen.has(n)) continue;
      if (!canStep(c, n, dx, dy)) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = at(x, y);
      if (!c || TILE(c.tile).footing === 'block') continue;
      if (!seen.has(c)) return false;
    }
  }
  return true;
}

/* ---- the walls of a built place ----------------------------------------- */

/* Rock that was DUG stays raw rock. Rock that closes in a room somebody made --
 * a chapel, a cistern, a gaol -- is faced with the blocks they laid, so you can
 * see at a glance which of these spaces was built and which was only found.
 *
 * Run last, after the halls are cut, so a doorway punched through the ring is
 * left as a doorway rather than being walled up again.
 */
function lineRoomWalls(world) {
  const at = function (x, y) { return world.at(x, y); };
  const faced = [];
  for (let i = 0; i < world.rooms.length; i++) {
    const r = world.rooms[i];
    /* Only places that were MADE. A mine or a quarry is a hole, not a room, and
       its walls should stay the rock they were hacked out of. */
    if (!r.place || r.place.tags.indexOf('worked') < 0) continue;
    for (let y = r.y - 1; y <= r.y + r.h; y++) {
      for (let x = r.x - 1; x <= r.x + r.w; x++) {
        const c = at(x, y);
        if (!c || c.room >= 0) continue;
        if (TILE(c.tile).footing !== 'block') continue;   /* a doorway stays open */
        /* Only the rock actually facing the room: the ring one metre out. */
        let touches = false;
        for (let s = 0; s < STEPS.length; s++) {
          const n = at(x + STEPS[s][0], y + STEPS[s][1]);
          if (n && n.room === r.index) { touches = true; break; }
        }
        if (!touches) continue;
        c.tile = 'stone_wall';
        faced.push(c);
      }
    }
  }
  return faced.length;
}
