/* Keyboard, mouse and touch all write the same state, so the game never learns
   which device it came from. Drag pans, wheel or pinch zooms, hover or tap
   inspects. */
const KEYMAP = {
  ArrowUp: 'panUp', KeyW: 'panUp',
  ArrowDown: 'panDown', KeyS: 'panDown',
  ArrowLeft: 'panLeft', KeyA: 'panLeft',
  ArrowRight: 'panRight', KeyD: 'panRight'
};

const DRAG_SLOP = 4;   /* px of movement before a tap becomes a drag */

/* Turning and tilting are not panning, so they get their own keys. Q and E
   swing a quarter turn the way Final Fantasy Tactics does; R raises the angle. */
const VIEW_KEYS = {
  KeyQ: (s) => rotateCamera(s, -1),
  KeyE: (s) => rotateCamera(s, 1),
  KeyR: (s) => tiltCamera(s)
};

function bindInput(state, canvas, toBuffer) {
  const drag = { active: false, moved: 0, lastX: 0, lastY: 0, id: null };
  const pinch = { active: false, start: 0, zoom: 1 };

  function key(e, down) {
    if (down && VIEW_KEYS[e.code] && !e.repeat) {
      VIEW_KEYS[e.code](state);
      e.preventDefault();
      return;
    }
    const slot = KEYMAP[e.code];
    if (!slot) return;
    state.input[slot] = down;
    e.preventDefault();
  }
  addEventListener('keydown', (e) => key(e, true));
  addEventListener('keyup', (e) => key(e, false));

  function track(e) {
    const b = toBuffer(e.clientX, e.clientY);
    state.pointer.over = true;
    state.pointer.bx = b.x;
    state.pointer.by = b.y;
    state.pointer.clientX = e.clientX;
    state.pointer.clientY = e.clientY;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch' && pinch.active) return;
    drag.active = true; drag.moved = 0;
    drag.lastX = e.clientX; drag.lastY = e.clientY; drag.id = e.pointerId;
    track(e);
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    track(e);
    if (!drag.active || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.lastX, dy = e.clientY - drag.lastY;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > DRAG_SLOP) {
      const a = toBuffer(drag.lastX, drag.lastY);
      const b = toBuffer(e.clientX, e.clientY);
      panCamera(state, a.x - b.x, a.y - b.y);
    }
    drag.lastX = e.clientX; drag.lastY = e.clientY;
  });

  function endDrag(e) {
    if (!drag.active) return;
    /* A press that did not travel is a tap: inspect whatever is under it. */
    if (drag.moved <= DRAG_SLOP) {
      state.selected = state.hover;
      state.viewDirty = true;
    }
    drag.active = false; drag.id = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') {
      state.pointer.over = false;
      state.hover = -1;
      state.viewDirty = true;
    }
  });

  canvas.addEventListener('wheel', (e) => {
    const b = toBuffer(e.clientX, e.clientY);
    setZoom(state, state.cam.zoom + (e.deltaY < 0 ? 1 : -1), b.screenX, b.screenY);
    e.preventDefault();
  }, { passive: false });

  /* Two fingers zoom. One finger is already panning. */
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 2) return;
    pinch.active = true;
    drag.active = false;
    pinch.start = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);
    pinch.zoom = state.cam.zoom;
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    if (!pinch.active || e.touches.length !== 2) return;
    const d = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY);
    if (pinch.start > 0) setZoom(state, pinch.zoom * (d / pinch.start));
    e.preventDefault();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) pinch.active = false;
  });
}
