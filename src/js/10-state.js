/* ---- Geometry (read-only: not balance, never tuned) ---------------------- */
const FIELD = { w: 960, h: 600 };          /* simulation units, not pixels */
const TICK_MS = 1000 / 60;                 /* one fixed simulation step     */

/* ---- Placeholder numbers -------------------------------------------------
   These belong to the placeholder mover below and will be deleted with it.
   Real numbers move to docs/balance.xlsx the first time one matters to more
   than one thing. Nothing here is tuned; nothing here is measured.          */
const PLACEHOLDER = {
  moverRadius: 18,
  moverAccel: 0.55,     /* units per tick^2 */
  moverDrag: 0.90,      /* velocity retained per tick */
  moverMaxSpeed: 7.5
};

function newState(seed) {
  return {
    seed: seed >>> 0,
    rand: makeRand(seed),
    tick: 0,
    /* The one placeholder object on the field. It exists to prove the loop,
       the input and the renderer are connected. It is not a design decision. */
    mover: {
      x: FIELD.w / 2,
      y: FIELD.h / 2,
      vx: 0,
      vy: 0,
      r: PLACEHOLDER.moverRadius
    },
    /* Latched so a held key survives between frames. */
    input: { up: false, down: false, left: false, right: false, aimX: null, aimY: null }
  };
}
