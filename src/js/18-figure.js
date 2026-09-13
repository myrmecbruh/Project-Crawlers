/* The crawler as a real, posed, three-dimensional figure.
 *
 * Bones hang off one another; every visible part is a tapered box fixed to a
 * bone; the whole thing is turned to face where the crawler is going and posed
 * by a walk, a work swing or a slow idle breath. It is then projected into the
 * same small buffer as everything else, which is what makes 3D read as sprite
 * work -- the geometry is real, the resolution is not.
 *
 * Rule 4 lives here: a part is drawn if it is body, or if the item it belongs
 * to is the one worn in its slot. There is no other path to the screen, and the
 * build refuses any piece of gear that no part draws.
 */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/* ---- just enough matrix maths ------------------------------------------ */
function matId() { return [1, 0, 0, 0, 1, 0, 0, 0, 1]; }

function matMul(a, b) {
  const o = new Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c];
    }
  }
  return o;
}

function matVec(m, x, y, z) {
  return [m[0] * x + m[1] * y + m[2] * z,
          m[3] * x + m[4] * y + m[5] * z,
          m[6] * x + m[7] * y + m[8] * z];
}

/* X swings a limb forward and back, Y rolls it out to the side, Z turns the
   whole crawler to face somewhere. */
function matRotX(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
function matRotY(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
function matRotZ(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }

function poseMat(r) {
  if (!r) return matId();
  let m = matId();
  if (r[2]) m = matMul(m, matRotZ(r[2]));
  if (r[0]) m = matMul(m, matRotX(r[0]));
  if (r[1]) m = matMul(m, matRotY(r[1]));
  return m;
}

/* ---- the pose ----------------------------------------------------------- */

/* Which way a crawler faces, as an angle. Facing 0 is along +y. */
function facingFor(dx, dy) { return Math.atan2(dx, dy); }

/* Shortest way round, so a crawler turning from nearly-north to nearly-west
   does not spin the long way. */
function turnToward(from, to, by) {
  let gap = to - from;
  while (gap > Math.PI) gap -= TAU;
  while (gap < -Math.PI) gap += TAU;
  if (Math.abs(gap) <= by) return to;
  return from + Math.sign(gap) * by;
}

/* The whole animation system: three procedural clips. The SHAPE of each is
   here in code because it is logic; every AMOUNT is a knob in the spreadsheet,
   so the walk can be widened or the work slowed without touching this. */
function poseFor(actor, tick) {
  const pose = { root: [0, 0, actor.face] };
  let bob = 0;

  if (actor.doing === 'walking') {
    const t = ((tick + actor.gait) % CFG.walkTicks) / CFG.walkTicks * TAU;
    const swing = Math.sin(t) * CFG.walkLegSwing * DEG;
    const arm = Math.sin(t) * CFG.walkArmSwing * DEG;
    pose.thigh_l = [swing, 0, 0];
    pose.thigh_r = [-swing, 0, 0];
    /* A knee only ever folds one way. */
    pose.knee_l = [-Math.max(0, Math.sin(t - 0.7)) * CFG.walkKneeBend * DEG, 0, 0];
    pose.knee_r = [-Math.max(0, Math.sin(t + Math.PI - 0.7)) * CFG.walkKneeBend * DEG, 0, 0];
    pose.shoulder_l = [-arm, 0, 0];
    pose.shoulder_r = [arm, 0, 0];
    pose.elbow_l = [-Math.abs(arm) * 0.6, 0, 0];
    pose.elbow_r = [-Math.abs(arm) * 0.6, 0, 0];
    bob = Math.abs(Math.sin(t)) * CFG.walkBob;

  } else if (actor.doing === 'clearing' || actor.doing === 'building') {
    const t = ((tick + actor.gait) % CFG.workTicks) / CFG.workTicks * TAU;
    /* Up slowly, down fast: a swing, not a wave. */
    const lift = (Math.cos(t) * 0.5 + 0.5);
    const raise = -lift * CFG.workArmLift * DEG;
    pose.shoulder_l = [raise, 0, 0];
    pose.shoulder_r = [raise, 0, 0];
    pose.elbow_l = [-lift * 0.5, 0, 0];
    pose.elbow_r = [-lift * 0.5, 0, 0];
    pose.chest = [(1 - lift) * CFG.workLean * DEG, 0, 0];
    pose.thigh_l = [-6 * DEG, 0, 0];
    pose.thigh_r = [6 * DEG, 0, 0];
    pose.knee_l = [-4 * DEG, 0, 0];
    pose.knee_r = [-10 * DEG, 0, 0];
    bob = -lift * 0.02;

  } else {
    const t = ((tick + actor.gait) % CFG.idleTicks) / CFG.idleTicks * TAU;
    const sway = Math.sin(t) * CFG.idleSway * DEG;
    pose.chest = [sway * 0.4, sway, 0];
    pose.head = [-sway * 0.3, -sway * 0.5, 0];
    pose.shoulder_l = [0, -sway, 0];
    pose.shoulder_r = [0, -sway, 0];
    bob = Math.sin(t * 2) * 0.006;
  }

  return { rot: pose, bob: bob };
}

/* ---- the skeleton ------------------------------------------------------- */

/* Every bone's place and facing in the crawler's own space, root at the feet.
   Parents first, which the spreadsheet guarantees by ordering and the build
   guarantees by refusing a loop. */
function buildSkeleton(pose) {
  const out = {};
  for (let i = 0; i < BONE_IDS.length; i++) {
    const id = BONE_IDS[i], b = DATA.bones[id];
    const local = poseMat(pose.rot[id]);
    if (!b.parent) {
      out[id] = { m: local, p: [b.x, b.y, b.z + pose.bob] };
      continue;
    }
    const up = out[b.parent];
    if (!up) { out[id] = { m: local, p: [b.x, b.y, b.z] }; continue; }
    const off = matVec(up.m, b.x, b.y, b.z);
    out[id] = { m: matMul(up.m, local),
                p: [up.p[0] + off[0], up.p[1] + off[1], up.p[2] + off[2]] };
  }
  return out;
}

/* Which parts are on this crawler right now. */
function figureParts(actor) {
  const out = [];
  for (let i = 0; i < FIGURE_IDS.length; i++) {
    const id = FIGURE_IDS[i], f = DATA.figure[id];
    if (f.slot === 'body' || actor.worn[f.slot] === f.item) out.push({ id: id, part: f });
  }
  return out;
}

/* ---- one part, as a lathed shape --------------------------------------- *
 * A part is a stack of rings. Each ring is a `sides`-sided loop; the stack runs
 * from from_m to to_m along the bone. Between the ends the width and depth
 * interpolate, `bulge` swells the middle, and cap_top / cap_bot round the last
 * fraction off along a circle so a head domes and a hand is not a brick.
 *
 * Four sides and two rings is exactly the tapered box this replaced, so nothing
 * was lost -- there is just somewhere to go now.
 */
function partMesh(bone, f, scale) {
  const sides = f.sides, rings = f.rings;
  const verts = new Array(rings * sides);
  const radius = new Array(rings);

  for (let r = 0; r < rings; r++) {
    const t = rings === 1 ? 0 : r / (rings - 1);
    const z = (f.from_m + (f.to_m - f.from_m) * t) * scale;
    let w = (f.w_bot + (f.w_top - f.w_bot) * t) * scale;
    let dd = (f.d_bot + (f.d_top - f.d_bot) * t) * scale;

    /* A body is not a cone: it swells between its ends. */
    const swell = 1 + f.bulge * Math.sin(Math.PI * t);
    w *= swell; dd *= swell;

    /* Round the ends off along a circle rather than cutting them flat. */
    if (f.cap_bot > 0 && t < f.cap_bot) {
      const u = 1 - t / f.cap_bot;
      const k = Math.sqrt(Math.max(0, 1 - u * u));
      w *= k; dd *= k;
    }
    if (f.cap_top > 0 && t > 1 - f.cap_top) {
      const u = (t - (1 - f.cap_top)) / f.cap_top;
      const k = Math.sqrt(Math.max(0, 1 - u * u));
      w *= k; dd *= k;
    }
    radius[r] = Math.max(w, dd);

    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * TAU;
      const v = matVec(bone.m,
                       Math.cos(a) * w + f.ox * scale,
                       Math.sin(a) * dd + f.oy * scale,
                       z);
      verts[r * sides + i] = [bone.p[0] * scale + v[0],
                              bone.p[1] * scale + v[1],
                              bone.p[2] * scale + v[2]];
    }
  }

  /* Faces, wound so the cross product points outwards. */
  const faces = [];
  for (let r = 0; r < rings - 1; r++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      faces.push([r * sides + i, r * sides + j,
                  (r + 1) * sides + j, (r + 1) * sides + i]);
    }
  }
  /* Only cap an end that is actually open. A rounded end closes itself. */
  const EPS = 1e-4;
  if (radius[rings - 1] > EPS) {
    const top = [];
    for (let i = 0; i < sides; i++) top.push((rings - 1) * sides + i);
    faces.push(top);
  }
  if (radius[0] > EPS) {
    const bot = [];
    for (let i = sides - 1; i >= 0; i--) bot.push(i);
    faces.push(bot);
  }
  return { verts: verts, faces: faces };
}
