/* One fixed step. Deterministic: same seed and same inputs, same result.
   Nothing in here reads the clock or Math.random.

   There is no life in the labyrinth yet -- characters and creatures wait on the
   six attributes, and rule 2 says ask before inventing them. For now a step is
   the view sliding under the arrow keys. */
function step(state) {
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
