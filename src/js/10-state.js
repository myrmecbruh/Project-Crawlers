/* One match, and the camera that looks at it.
 *
 * THE CAMERA holds a focus -- a point on the ground it keeps in the middle of
 * the picture -- plus a yaw it can swing through four quarter turns, and a tilt
 * between the normal angle and a raised one. Rotating and tilting keep the
 * focus still, so the world turns around whatever you were looking at rather
 * than sliding out from under you.
 *
 * The tilt raises the angle by opening the ground out (tile_h) and leaves wall
 * heights alone, so the locked 32 pixels to the metre of rule 10 holds at both
 * angles.
 */
const QUARTER = Math.PI / 2;

/* The grid direction that goes AWAY from the camera, for each quarter turn.
   Used by the cutaway: "the cell behind this one" depends on where you stand. */
const BEHIND = [[-1, -1], [-1, 1], [1, 1], [1, -1]];

function newState(seed) {
  const world = makeWorld(seed);
  const s = {
    seed: seed >>> 0,
    rand: makeRand(seed),
    tick: 0,
    world: world,
    actors: [],
    camp: null,
    rolls: 0,
    lit: null,           /* the squares the last light touched */
    lightDirty: true,
    /* The player's own clock. Paused stops the world; speed multiplies it.
       Neither touches the camera, which always moves on real time. */
    paused: false,
    speed: 0,
    cam: {
      fx: world.home.x, fy: world.home.y, fh: 0,   /* what stays in the middle */
      yaw: 0, yawTarget: 0, quarter: 0,
      pitch: 0, pitchTarget: 0,                  /* 0 normal angle, 1 raised  */
      zoom: CFG.zoomStart,
      follow: -1,                                /* a crawler the view rides */
      ox: 0, oy: 0, cos: 1, sin: 0, tileH: CFG.tileHLow
    },
    input: { panUp: false, panDown: false, panLeft: false, panRight: false },
    /* `quiet` means the pointer has not moved since the last click, so
       whatever is under it slid there rather than being aimed at. */
    pointer: { over: false, bx: 0, by: 0, clientX: 0, clientY: 0, quiet: false },
    hover: -1,
    selected: -1,
    geomDirty: true,
    viewDirty: true
  };
  s.actors = populate(s);
  s.camp = makeCamp(s);
  computeLight(s);
  centreCamera(s);
  markCutaway(s);
  return s;
}

/* How fast the world is running, as a multiplier. Paused is nothing at all. */
function speedOf(s) { return s.paused ? 0 : SPEED(s.speed).multiplier; }
function speedName(s) { return s.paused ? N('ui.label_paused') : SPEED(s.speed).name; }

function setPaused(s, on) {
  const want = on === undefined ? !s.paused : !!on;
  if (want === s.paused) return false;
  s.paused = want;
  s.viewDirty = true;
  return true;
}

function setSpeed(s, i) {
  const want = Math.max(0, Math.min(SPEED_IDS.length - 1, i));
  if (want === s.speed) return false;
  s.speed = want;
  s.viewDirty = true;
  return true;
}

function tileHeightPx(s) {
  return CFG.tileHLow + (CFG.tileHHigh - CFG.tileHLow) * s.cam.pitch;
}

/* Recompute everything the projection needs. Called whenever the camera moves,
   turns or tilts. The pixel offsets are whole numbers, which is what keeps the
   picture from shimmering (rule 10). */
function camRefresh(s) {
  const cam = s.cam;
  cam.cos = Math.cos(cam.yaw);
  cam.sin = Math.sin(cam.yaw);
  cam.tileH = tileHeightPx(s);
  const u = cam.fx * cam.cos - cam.fy * cam.sin;
  const v = cam.fx * cam.sin + cam.fy * cam.cos;
  cam.ox = Math.round((u - v) * (CFG.tileW / 2));
  cam.oy = Math.round((u + v) * (cam.tileH / 2) - cam.fh * CFG.rise);
  s.geomDirty = true;
  s.viewDirty = true;
}

function centreCamera(s) {
  const room = s.camp ? s.camp.room : null;
  s.cam.fx = room ? room.x + room.w / 2 : s.world.home.x;
  s.cam.fy = room ? room.y + room.h / 2 : s.world.home.y;
  s.cam.fh = room ? room.elev : 0;
  camRefresh(s);
}

/* Which way is "behind", in grid terms, for the quarter turn now showing. */
function behindDir(s) { return BEHIND[((s.cam.quarter % 4) + 4) % 4]; }

/* Work out once, per view, which columns of rock stand between the camera and
   a floor behind them. It depends on which way you are looking and how steeply,
   so it is redone when either changes -- but not every frame.
 *
 * It is a MARK, not a picture: it says which rock is in the way, and what
 * happens to that rock is the renderer's business alone (see `cutOut()`). That
 * split is what made the ghosting bug impossible to write again -- the mark has
 * never depended on the pointer, so no amount of hovering can change which rock
 * is marked, only how it is drawn. */
function markCutaway(s) {
  const w = s.world, back = behindDir(s), th = s.cam.tileH;
  for (let i = 0; i < w.cells.length; i++) {
    const c = w.cells[i];
    c.cutaway = hidesFloorBehind(w, c, back, th);
  }
  s.geomDirty = true;
  s.viewDirty = true;
}

/* A drag is in screen pixels; the focus lives on the grid. Undo the projection
   and the rotation to find out how far the ground actually moved. */
function panCamera(s, dx, dy) {
  if (!dx && !dy) return false;
  const cam = s.cam;
  cam.follow = -1;                 /* moving the view by hand lets go of them */
  const drx = dx / (CFG.tileW / 2), dry = dy / (cam.tileH / 2);
  const du = (drx + dry) / 2, dv = (dry - drx) / 2;
  cam.fx += du * cam.cos + dv * cam.sin;
  cam.fy += -du * cam.sin + dv * cam.cos;
  camRefresh(s);
  return true;
}

/* Ride the crawler the player picked. The focus is moved rather than the
   offsets, so turning and tilting still pivot around them, and because the
   focus follows actorPos() the view glides with the walk instead of hopping a
   whole square at a time. */
function followCamera(s) {
  const cam = s.cam;
  if (cam.follow < 0) return false;
  const a = s.actors[cam.follow];
  if (!a) { cam.follow = -1; return false; }
  const at = actorPos(s, a);
  if (at.gx === cam.fx && at.gy === cam.fy && at.h === cam.fh) return false;
  cam.fx = at.gx; cam.fy = at.gy; cam.fh = at.h;
  camRefresh(s);
  return true;
}

/* Clicking a crawler locks the view onto them; clicking anything else, or
   nothing, lets go. */
function setFollow(s, pick) {
  if (!CFG.followOn) return;
  s.cam.follow = Render.isActorPick(s, pick) ? pick - Render.actorBase(s) : -1;
  followCamera(s);
}

/* Turn the view a quarter, the way Final Fantasy Tactics does: the swing is
   animated, and what you were looking at stays in the middle of it. */
function rotateCamera(s, quarters) {
  if (!quarters) return false;
  s.cam.quarter += quarters;
  s.cam.yawTarget = s.cam.quarter * QUARTER;
  return true;
}

function tiltCamera(s, up) {
  const want = up === undefined ? (s.cam.pitchTarget > 0.5 ? 0 : 1) : (up ? 1 : 0);
  if (want === s.cam.pitchTarget) return false;
  s.cam.pitchTarget = want;
  return true;
}

/* Advance the swing and the tilt on REAL time, not game time: the view should
   move smoothly whether or not the world is running. Returns true while either
   is still going. */
function camAnimate(s, dtMs) {
  const cam = s.cam;
  let moving = false;

  if (cam.yaw !== cam.yawTarget) {
    const stepBy = (dtMs / Math.max(1, CFG.swingMs)) * QUARTER;
    const gap = cam.yawTarget - cam.yaw;
    cam.yaw = Math.abs(gap) <= stepBy ? cam.yawTarget : cam.yaw + Math.sign(gap) * stepBy;
    moving = true;
  }
  if (cam.pitch !== cam.pitchTarget) {
    const stepBy = dtMs / Math.max(1, CFG.tiltMs);
    const gap = cam.pitchTarget - cam.pitch;
    cam.pitch = Math.abs(gap) <= stepBy ? cam.pitchTarget : cam.pitch + Math.sign(gap) * stepBy;
    moving = true;
  }
  if (!moving) return false;

  const settled = cam.yaw === cam.yawTarget && cam.pitch === cam.pitchTarget;
  camRefresh(s);
  /* The cutaway depends on where you are standing and how steeply you look, so
     it is redone once the view settles rather than on every frame of a swing. */
  if (settled) markCutaway(s);
  return true;
}

/* Zoom changes how many real screen pixels one game pixel covers. It never
   changes the size of the world, so the locked scale holds at every zoom. */
function setZoom(s, z) {
  const next = Math.max(CFG.zoomMin, Math.min(CFG.zoomMax, Math.round(z)));
  if (next === s.cam.zoom) return false;
  s.cam.zoom = next;
  if (typeof Game !== 'undefined' && Game.fit) Game.fit();
  camRefresh(s);
  return true;
}
