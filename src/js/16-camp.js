/* The camp.
 *
 * The crawlers pick the biggest room they can all reach, walk to it, and put up
 * a camp: a fire first, then bedrolls, a store and windbreaks around it. Every
 * effort goes through attempt() like everything else -- clearing the ground is a
 * Labouring roll against how hard that floor is to clear, and raising a
 * structure is a Building roll against how hard the structure is. Failing at
 * either is how they get better at it.
 *
 * Nobody is told to do this. The player is a head coach; this is the crawlers'
 * own initiative.
 */

const CLEAR_SKILL = 'labouring';

/* Where things go: the fire in the middle, everything else spiralling out from
   it, so a camp reads as a camp rather than a scatter. */
function campPlan(world, room) {
  const wanted = [['campfire', 1]];
  wanted.push(['bedroll', CFG.campBedrolls]);
  wanted.push(['store', CFG.campStores]);
  wanted.push(['windbreak', CFG.campWindbreaks]);

  const taken = {};
  const sites = [];
  const cx = room.x + (room.w >> 1), cy = room.y + (room.h >> 1);

  /* Rings out from the fire, in a fixed order, so the same room always lays
     out the same camp. */
  const spots = [];
  for (let r = 0; r <= CFG.campSpread; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        spots.push([cx + dx, cy + dy]);
      }
    }
  }

  let next = 0;
  for (const [id, count] of wanted) {
    for (let k = 0; k < count; k++) {
      while (next < spots.length) {
        const [x, y] = spots[next++];
        const cell = world.at(x, y);
        if (!cell || taken[x + ',' + y]) continue;
        if (cell.room !== room.index) continue;
        if (TILE(cell.tile).footing !== 'walk') continue;
        taken[x + ',' + y] = true;
        sites.push({
          index: sites.length, structure: id, x: x, y: y,
          cleared: false, progress: 0, built: false,
          workers: 0, efforts: 0, field: null
        });
        break;
      }
    }
  }
  return sites;
}

/* Choose the room to camp in: the biggest one everybody can actually walk to.
   "Reachable" is not an assumption anywhere in this game -- it is measured. */
function chooseCampRoom(world, actors) {
  const fields = actors.map(function (a) { return reachableFrom(world, a.x, a.y); });
  const n = world.n;
  let best = null;
  for (const room of world.rooms) {
    const cx = room.x + (room.w >> 1), cy = room.y + (room.h >> 1);
    const i = cy * n + cx;
    if (TILE(world.cells[i].tile).footing === 'block') continue;
    let everyone = true;
    for (const f of fields) if (f[i] < 0) { everyone = false; break; }
    if (!everyone) continue;
    if (!best || room.area > best.area) best = room;
  }
  return best;
}

function makeCamp(state) {
  const room = chooseCampRoom(state.world, state.actors);
  if (!room) return null;
  const sites = campPlan(state.world, room);
  for (const s of sites) s.field = reachableFrom(state.world, s.x, s.y);
  return { room: room, sites: sites, founded: false };
}

function campSummary(camp) {
  if (!camp) return { sites: 0, built: 0, cleared: 0, progress: 0 };
  let built = 0, cleared = 0, total = 0;
  for (const s of camp.sites) {
    if (s.built) built++;
    if (s.cleared) cleared++;
    total += s.built ? 100 : s.progress;
  }
  return {
    sites: camp.sites.length, built: built, cleared: cleared,
    progress: camp.sites.length ? Math.round(total / camp.sites.length) : 0,
    done: built === camp.sites.length && camp.sites.length > 0
  };
}

/* A crawler takes the nearest unfinished site that is not already crowded. */
function claimSite(state, actor) {
  const camp = state.camp;
  if (!camp) return -1;
  const n = state.world.n;
  let best = -1, bestD = Infinity;
  for (const s of camp.sites) {
    if (s.built) continue;
    if (s.workers >= 2 && s.index !== actor.site) continue;
    const d = s.field[actor.y * n + actor.x];
    if (d < 0 || d >= bestD) continue;
    bestD = d; best = s.index;
  }
  return best;
}

/* One effort at one site: clear the ground, then raise the thing. */
function workSite(state, actor, site) {
  const cell = state.world.at(site.x, site.y);
  site.efforts++;
  if (!site.cleared) {
    const roll = attempt(state, actor, CLEAR_SKILL, TILE(cell.tile).clear);
    if (roll.ok) site.cleared = true;
    actor.lastWork = { site: site.index, what: 'clearing', ok: roll.ok };
    return roll;
  }
  const def = STRUCT(site.structure);
  const roll = attempt(state, actor, def.skill, def.difficulty);
  if (roll.ok) {
    site.progress = Math.min(100, site.progress + CFG.campProgress);
    if (site.progress >= 100) { site.built = true; state.viewDirty = true; }
    state.geomDirty = true;
  }
  actor.lastWork = { site: site.index, what: 'building', ok: roll.ok };
  return roll;
}
