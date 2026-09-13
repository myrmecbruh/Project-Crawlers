/* One fixed step. Deterministic: same seed and same inputs, same result.
   Nothing in here reads the clock or Math.random.

   Note what is NOT here: the camera. Panning is what makes time run, so if the
   simulation moved the camera, time would wind itself forward for ever. */
function step(state) {
  for (let i = 0; i < state.actors.length; i++) actorStep(state, state.actors[i]);
  state.tick++;
}
