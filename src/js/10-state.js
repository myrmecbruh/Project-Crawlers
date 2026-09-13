/* One match. Everything the game is, at one moment. */
function newState(seed) {
  const world = generateChunk(seed);
  const s = {
    seed: seed >>> 0,
    rand: makeRand(seed),
    tick: 0,
    world: world,
    cam: { x: 0, y: 0, zoom: CFG.zoomStart },
    /* Latched input. The simulation never learns which device it came from. */
    input: { panUp: false, panDown: false, panLeft: false, panRight: false },
    /* Where the pointer is, in low-resolution buffer pixels. */
    pointer: { over: false, bx: 0, by: 0, clientX: 0, clientY: 0 },
    hover: -1,      /* index of the cell under the pointer, or -1 */
    selected: -1,   /* index of the cell last tapped, or -1 */
    geomDirty: true,
    viewDirty: true
  };
  centreCamera(s);
  return s;
}

/* Put the middle of the chunk in the middle of the screen. */
function centreCamera(s) {
  const mid = (s.world.n - 1) / 2;
  s.cam.x = 0;
  s.cam.y = (mid + mid) * (CFG.tileH / 2) * s.cam.zoom
          - (CFG.maxElev / 2) * CFG.rise * s.cam.zoom;
  s.geomDirty = true;
  s.viewDirty = true;
}

function setZoom(s, z, anchorBx, anchorBy) {
  const next = Math.max(CFG.zoomMin, Math.min(CFG.zoomMax, Math.round(z)));
  if (next === s.cam.zoom) return false;
  /* Keep whatever is under the pointer under the pointer. */
  const ax = anchorBx === undefined ? CFG.lowW / 2 : anchorBx;
  const ay = anchorBy === undefined ? CFG.lowH / 2 : anchorBy;
  const worldX = (s.cam.x + ax - CFG.lowW / 2) / s.cam.zoom;
  const worldY = (s.cam.y + ay - CFG.lowH / 2) / s.cam.zoom;
  s.cam.zoom = next;
  s.cam.x = worldX * next - ax + CFG.lowW / 2;
  s.cam.y = worldY * next - ay + CFG.lowH / 2;
  s.geomDirty = true;
  s.viewDirty = true;
  return true;
}

function panCamera(s, dx, dy) {
  if (!dx && !dy) return;
  s.cam.x += dx;
  s.cam.y += dy;
  s.geomDirty = true;
  s.viewDirty = true;
}
