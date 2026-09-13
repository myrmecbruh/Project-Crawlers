/* One match. Everything the game is, at one moment. */
function newState(seed) {
  const world = generateChunk(seed);
  markCutaway(world);
  const s = {
    seed: seed >>> 0,
    rand: makeRand(seed),
    tick: 0,
    world: world,
    actors: [],
    camp: null,
    rolls: 0,
    /* Time only runs while the view is moving. This counts down from every
       nudge of the camera; at zero, the labyrinth holds its breath. */
    motion: 0,
    cam: { x: 0, y: 0, zoom: CFG.zoomStart },
    input: { panUp: false, panDown: false, panLeft: false, panRight: false },
    pointer: { over: false, bx: 0, by: 0, clientX: 0, clientY: 0 },
    hover: -1,
    selected: -1,
    geomDirty: true,
    viewDirty: true
  };
  s.actors = populate(s);
  s.camp = makeCamp(s);
  centreCamera(s);
  return s;
}

/* Work out once, per chunk, which columns of rock stand between the camera and
   a floor behind them. It only changes when the rock changes, which it does
   not, so this is done at generation rather than every frame. */
function markCutaway(world) {
  for (let i = 0; i < world.cells.length; i++) {
    world.cells[i].cutaway = hidesFloorBehind(world, world.cells[i]);
  }
}

/* The camera holds the world point that sits in the middle of the picture. */
function centreCamera(s) {
  const room = s.camp ? s.camp.room : null;
  const gx = room ? room.x + room.w / 2 : s.world.n / 2;
  const gy = room ? room.y + room.h / 2 : s.world.n / 2;
  const elev = room ? room.elev : 0;
  s.cam.x = Math.round((gx - gy) * (CFG.tileW / 2));
  s.cam.y = Math.round((gx + gy) * (CFG.tileH / 2) - elev * CFG.rise);
  s.geomDirty = true;
  s.viewDirty = true;
}

/* Pixel perfect: the camera only ever sits on whole game pixels, so nothing
   shimmers along an edge as the view slides. */
function panCamera(s, dx, dy) {
  if (!dx && !dy) return false;
  const nx = Math.round(s.cam.x + dx), ny = Math.round(s.cam.y + dy);
  if (nx === s.cam.x && ny === s.cam.y) return false;
  s.cam.x = nx;
  s.cam.y = ny;
  s.geomDirty = true;
  s.viewDirty = true;
  s.motion = CFG.coastTicks + 1;
  return true;
}

/* Zoom changes how many real screen pixels one game pixel takes up. It never
   changes the size of the world, so the locked scale of render.rise pixels to
   the metre holds at every zoom. `anchorScreenX/Y` keep whatever is under the
   pointer under the pointer; leave them out to hold the middle still. */
function setZoom(s, z, anchorScreenX, anchorScreenY) {
  const next = Math.max(CFG.zoomMin, Math.min(CFG.zoomMax, Math.round(z)));
  if (next === s.cam.zoom) return false;

  const oldW = Render.w, oldH = Render.h, oldZoom = s.cam.zoom;
  const ax = anchorScreenX === undefined ? oldW * oldZoom / 2 : anchorScreenX;
  const ay = anchorScreenY === undefined ? oldH * oldZoom / 2 : anchorScreenY;
  const worldX = s.cam.x + (ax / oldZoom - oldW / 2);
  const worldY = s.cam.y + (ay / oldZoom - oldH / 2);

  s.cam.zoom = next;
  if (typeof Game !== 'undefined' && Game.fit) Game.fit();

  s.cam.x = Math.round(worldX - (ax / next - Render.w / 2));
  s.cam.y = Math.round(worldY - (ay / next - Render.h / 2));
  s.geomDirty = true;
  s.viewDirty = true;
  s.motion = CFG.coastTicks + 1;
  return true;
}
