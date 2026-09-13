/* Keyboard, mouse and touch all write the same four flags plus an optional
   aim point, so the simulation never learns which device it came from. */
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right'
};

function bindInput(state, canvas, toField) {
  function key(e, down) {
    const slot = KEYMAP[e.code];
    if (!slot) return;
    state.input[slot] = down;
    e.preventDefault();
  }
  addEventListener('keydown', (e) => key(e, true));
  addEventListener('keyup', (e) => key(e, false));

  function aim(e) {
    const t = e.touches ? e.touches[0] : e;
    if (!t) return;
    const p = toField(t.clientX, t.clientY);
    state.input.aimX = p.x;
    state.input.aimY = p.y;
    e.preventDefault();
  }
  function release(e) {
    state.input.aimX = null;
    state.input.aimY = null;
    if (e) e.preventDefault();
  }
  canvas.addEventListener('pointerdown', aim);
  canvas.addEventListener('pointermove', (e) => { if (e.buttons) aim(e); });
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('touchstart', aim, { passive: false });
  canvas.addEventListener('touchmove', aim, { passive: false });
  canvas.addEventListener('touchend', release, { passive: false });
}
