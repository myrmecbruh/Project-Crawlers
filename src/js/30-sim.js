/* One fixed step. Deterministic: same seed and same inputs, same result.
   Nothing in here reads the clock or Math.random.

   The player is a head coach: nothing below waits to be told what to do. */
function step(state) {
  for (let i = 0; i < state.actors.length; i++) actorStep(state, state.actors[i]);

  const i = state.input;
  let dx = 0, dy = 0;
  if (i.panLeft) dx -= 1;
  if (i.panRight) dx += 1;
  if (i.panUp) dy -= 1;
  if (i.panDown) dy += 1;
  if (dx || dy) {
    const d = Math.hypot(dx, dy);
    panCamera(state, dx / d * CFG.keyPan, dy / d * CFG.keyPan);
  }
  state.tick++;
}
