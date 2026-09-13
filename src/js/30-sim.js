/* One fixed step. Deterministic: same seed and same inputs, same result.
   Nothing in here reads the clock or Math.random. */
function step(state) {
  const m = state.mover;
  const i = state.input;
  let ax = 0, ay = 0;

  if (i.left) ax -= 1;
  if (i.right) ax += 1;
  if (i.up) ay -= 1;
  if (i.down) ay += 1;

  /* A held pointer overrides the keys and steers toward the touch. */
  if (i.aimX !== null) {
    const dx = i.aimX - m.x, dy = i.aimY - m.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) { ax = dx / d; ay = dy / d; }
  } else if (ax || ay) {
    const d = Math.hypot(ax, ay);
    ax /= d; ay /= d;
  }

  m.vx = (m.vx + ax * PLACEHOLDER.moverAccel) * PLACEHOLDER.moverDrag;
  m.vy = (m.vy + ay * PLACEHOLDER.moverAccel) * PLACEHOLDER.moverDrag;

  const sp = Math.hypot(m.vx, m.vy);
  if (sp > PLACEHOLDER.moverMaxSpeed) {
    m.vx = m.vx / sp * PLACEHOLDER.moverMaxSpeed;
    m.vy = m.vy / sp * PLACEHOLDER.moverMaxSpeed;
  }

  m.x += m.vx;
  m.y += m.vy;

  /* The field has edges. Bounce rather than stop so a stuck mover is obvious. */
  if (m.x < m.r) { m.x = m.r; m.vx = Math.abs(m.vx) * 0.4; }
  if (m.x > FIELD.w - m.r) { m.x = FIELD.w - m.r; m.vx = -Math.abs(m.vx) * 0.4; }
  if (m.y < m.r) { m.y = m.r; m.vy = Math.abs(m.vy) * 0.4; }
  if (m.y > FIELD.h - m.r) { m.y = FIELD.h - m.r; m.vy = -Math.abs(m.vy) * 0.4; }

  state.tick++;
}
