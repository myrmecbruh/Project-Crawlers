/* Headless tests against the BUILT file -- the thing that ships, not the sources.
 *
 *     node tests/run.mjs
 *
 * Every test drives the game through window.__test and asserts on what REACHED
 * THE SCREEN. A builder with no consumer looks exactly like working code, so
 * "the array was filled" is never the assertion.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({ chromium } = require(spec)); break; } catch { /* try the next one */ }
}
if (!chromium) {
  console.error('playwright not found. Run the start-up script.');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = readFileSync(path.join(ROOT, 'src/js/00-version.js'), 'utf8')
  .match(/^const VERSION = '([^']+)';/m)[1];
const built = path.join(ROOT, 'dist', `crawlers-v${VERSION}.html`);
if (!existsSync(built)) {
  console.error(`dist/crawlers-v${VERSION}.html is missing. Run: python3 build.py`);
  process.exit(1);
}

const results = [];
function assert(cond, why) { if (!cond) throw new Error(why); }
async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, why: e.message }); }
}

/* ---- 1. the spreadsheet reconciler checks itself ------------------------- */
console.log('\nspreadsheet reconciler');
try {
  console.log(execFileSync('python3', [path.join(ROOT, 'build.py'), '--check'],
    { encoding: 'utf8' }).trimEnd().split('\n').slice(1).join('\n'));
} catch (e) {
  console.error((e.stdout || '') + (e.stderr || ''));
  console.error('the spreadsheet reconciler failed its own self-check');
  process.exit(1);
}

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(pathToFileURL(built).href);
await page.waitForFunction(() => window.__test && window.__test.state);
await page.evaluate(() => window.__test.pause());

/* ---- 2. the in-game harness checks itself -------------------------------- */
const self = await page.evaluate(() => window.__test.selfCheck());
console.log(`\nharness self-check (v${self.version}) ${self.ok ? 'PASS' : 'FAIL'}`);
for (const c of self.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name} -- ${c.detail}`);
if (!self.ok) { await browser.close(); process.exit(1); }

console.log('');

/* ---- 3. the game ---------------------------------------------------------- */

await test('the built file reports the version it was built from', async () => {
  const shown = await page.textContent('#version');
  assert(shown === `v${VERSION}`, `screen says ${shown}, source says v${VERSION}`);
});

await test('the labyrinth reaches the screen, not just the batch', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const drew = window.__test.frame(1);
    return { count: drew.count, kinds: drew.kinds, world: window.__test.world() };
  });
  assert(r.world.cells === 56 * 56, `the world is ${r.world.cells} cells`);
  assert(r.count > 100, `only ${r.count} blocks reached the buffer`);
  assert(Object.keys(r.kinds).length >= 3,
    `only one kind of ground drawn: ${JSON.stringify(r.kinds)}`);
});

await test('varied ground: several materials and several elevations appear', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const w = window.__test.state.world;
    const h = new Set(), t = new Set();
    for (const c of w.cells) { h.add(c.h); t.add(c.tile); }
    return { heights: [...h].sort((a, b) => a - b), tiles: [...t].sort() };
  });
  assert(r.heights.length >= 4, `only ${r.heights.length} elevations: ${r.heights}`);
  assert(r.tiles.length >= 4, `only ${r.tiles.length} materials: ${r.tiles}`);
});

await test('ramps climb exactly one metre, toward ground exactly one metre higher', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const w = window.__test.state.world;
    const step = { 'x+': [1, 0], 'x-': [-1, 0], 'y+': [0, 1], 'y-': [0, -1] };
    let ramps = 0, wrong = 0;
    for (const c of w.cells) {
      if (TILE(c.tile).footing !== 'ramp') continue;
      ramps++;
      const d = step[c.slope];
      const up = w.at(c.x + d[0], c.y + d[1]);
      if (!up || up.h !== c.h + 1) wrong++;
    }
    return { ramps, wrong };
  });
  assert(r.ramps > 0, 'the labyrinth generated no ramps at all on seed 1');
  assert(r.wrong === 0, `${r.wrong} of ${r.ramps} ramps climb to nowhere`);
});

await test('hovering a block outlines it and names it on screen (rule 8)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const drew = window.__test.frame(1);
    /* The last block painted is in front of everything, so nothing hides it. */
    let target = null;
    for (let k = drew.items.length - 1; k >= 0; k--) {
      const it = drew.items[k];
      if (it.sx > 8 && it.sx < window.__test.buffer().w - 8
        && it.sy > 8 && it.sy < window.__test.buffer().h - 8) { target = it; break; }
    }
    const hovered = window.__test.point(target.sx, target.sy);
    return {
      target, hovered,
      consumed: window.__test.consumed(),
      tooltip: window.__test.tooltipOnScreen(),
      described: window.__test.describe(hovered)
    };
  });
  assert(r.hovered === r.target.i,
    `pointed at block ${r.target.i}, picked ${r.hovered}`);
  assert(r.consumed.outlined, 'the highlight outline never reached the buffer');
  assert(r.consumed.focus === r.target.i, 'the outline is on the wrong block');
  assert(r.tooltip, 'the tooltip is not on the page');
  assert(r.tooltip.showing === r.hovered, 'the tooltip is describing a different block');
  assert(r.tooltip.text.includes(r.described.name),
    `tooltip says "${r.tooltip.text}", block is "${r.described.name}"`);
  assert(r.tooltip.text.includes(`${r.described.elevation} m`),
    `tooltip does not show the elevation (${r.described.elevation} m)`);
  assert(r.tooltip.tags.length > 0 &&
    r.tooltip.tags.join(',') === r.described.tags.join(','),
    `tooltip tags ${r.tooltip.tags} vs ${r.described.tags}`);
});

await test('pointing away from the labyrinth shows nothing', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    /* The chunk has edges. Slide right off it and there is nothing to point at. */
    window.__test.pan(6000, 6000);
    const buf = window.__test.buffer();
    window.__test.frame(1);
    const hover = window.__test.point(buf.w / 2, buf.h / 2);
    const a = { hover, tip: window.__test.tooltipOnScreen() };
    window.__test.unpoint();
    return { a, b: window.__test.tooltipOnScreen(),
             outlined: window.__test.consumed().outlined,
             drew: window.__test.consumed().count };
  });
  assert(r.drew === 0, `${r.drew} blocks were still in view off the edge of the world`);
  assert(r.a.hover === -1, `found block ${r.a.hover} in empty space`);
  assert(r.a.tip === null, 'the panel stayed up over empty space');
  assert(r.b === null && !r.outlined, 'the highlight stayed after the pointer left');
});

await test('a block in the way fades so you can see what you are inspecting', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(3); window.__test.record(true);
    const drew = window.__test.frame(1);
    /* Find a block with something painted after it that covers it. */
    let best = null;
    for (let k = 0; k < drew.items.length - 40; k++) {
      const it = drew.items[k];
      if (it.sx < 40 || it.sx > window.__test.buffer().w - 40) continue;
      if (it.sy < 40 || it.sy > window.__test.buffer().h - 40) continue;
      best = it; break;
    }
    window.__test.select(best.i);
    const c = window.__test.consumed();
    return { faded: c.faded, focus: c.focus, want: best.i, fade: window.__test.cfg.occluderFade };
  });
  assert(r.focus === r.want, 'the wrong block was selected');
  assert(r.faded > 0, 'nothing in front of the selected block faded at all');
  assert(r.fade < 1, 'the fade knob is set to never fade');
});

await test('panning moves the view, and picking follows it', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    window.__test.frame(1);
    const before = window.__test.project(5, 5, 0);
    window.__test.pan(40, 25);
    const after = window.__test.project(5, 5, 0);
    /* Point at the same screen spot: it must now be a different block. */
    const at = { x: window.__test.buffer().w / 2, y: window.__test.buffer().h / 2 };
    const hit = window.__test.point(at.x, at.y);
    window.__test.pan(-40, -25);
    const back = window.__test.point(at.x, at.y);
    return { before, after, hit, back };
  });
  assert(Math.round(r.before.x - r.after.x) === 40 && Math.round(r.before.y - r.after.y) === 25,
    `pan moved the view by ${r.before.x - r.after.x},${r.before.y - r.after.y}`);
  assert(r.hit >= 0 && r.back >= 0, 'picking stopped working after a pan');
  assert(r.hit !== r.back, 'the same block was picked before and after panning');
});

await test('zooming changes the pixels, never the size of the world', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    const at = { x: 120, y: 90 };
    const before = window.__test.point(at.x, at.y);
    const oneMetreBefore = window.__test.project(4, 4, 0).y - window.__test.project(4, 4, 1).y;
    const z = window.__test.zoomAt(at.x, at.y, window.__test.buffer().zoom + 1);
    const after = window.__test.point(at.x * 0 + at.x, at.y);
    const oneMetreAfter = window.__test.project(4, 4, 0).y - window.__test.project(4, 4, 1).y;
    return { before, after, z, oneMetreBefore, oneMetreAfter,
             rise: window.__test.cfg.rise, buf: window.__test.buffer() };
  });
  assert(r.z === 3, `zoom went to ${r.z}`);
  assert(r.oneMetreBefore === r.rise && r.oneMetreAfter === r.rise,
    `a metre was ${r.oneMetreBefore}px then ${r.oneMetreAfter}px; the scale is locked at ${r.rise}`);
  assert(r.buf.w === Math.round(r.buf.w) && r.buf.h === Math.round(r.buf.h),
    'the picture is not a whole number of pixels');
});

await test('everything lands on whole pixels, at every zoom', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const out = [];
    for (let z = window.__test.cfg.zoomMin; z <= window.__test.cfg.zoomMax; z++) {
      window.__test.zoom(z);
      window.__test.frame(1);
      window.__test.pan(7, 3);
      const cam = window.__test.camera(), buf = window.__test.buffer();
      out.push({ z: cam.zoom, camX: cam.x, camY: cam.y, w: buf.w, h: buf.h });
    }
    return out;
  });
  for (const q of r) {
    assert(q.camX === Math.round(q.camX) && q.camY === Math.round(q.camY),
      `at zoom ${q.z} the camera sat at ${q.camX},${q.camY}`);
    assert(q.w === Math.round(q.w) && q.h === Math.round(q.h) && q.w > 0 && q.h > 0,
      `at zoom ${q.z} the picture was ${q.w}x${q.h}`);
    assert(q.z === Math.round(q.z), `zoom was ${q.z}, not a whole number`);
  }
});

await test('the labyrinth is rooms and halls, and every room can be reached', async () => {
  const r = await page.evaluate(() => {
    const out = [];
    for (const seed of [1, 5, 23, 101, 777]) {
      window.__test.seed(seed);
      const rooms = window.__test.rooms();
      const conn = window.__test.connectivity();
      const levels = new Set(rooms.map((q) => q.elev));
      out.push({ seed, rooms: rooms.length, levels: levels.size,
                 cut: conn.filter((c) => c.steps < 0).length,
                 furthest: Math.max(...conn.map((c) => c.steps)),
                 floors: new Set(rooms.map((q) => q.floor)).size });
    }
    return out;
  });
  for (const q of r) {
    assert(q.rooms >= 5, `seed ${q.seed} made only ${q.rooms} rooms`);
    assert(q.cut === 0, `seed ${q.seed} left ${q.cut} rooms walled off`);
    assert(q.levels >= 2, `seed ${q.seed} put every room on one level`);
    assert(q.furthest > 10, `seed ${q.seed} is only ${q.furthest} steps across`);
    assert(q.floors >= 2, `seed ${q.seed} floored every room the same way`);
  }
});

await test('rock between you and a room fades, so no room hides behind its wall', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const drew = window.__test.frame(1);
    const rock = drew.items.filter((i) => i.kind === 'cell' && i.tile === 'stone_block');
    return { cutaway: drew.cutaway, rock: rock.length,
             fadedRock: rock.filter((i) => i.alpha < 1).length,
             fade: window.__test.cfg.cutawayFade };
  });
  assert(r.fade < 1, 'the cutaway is switched off in the spreadsheet');
  assert(r.rock > 0, 'no rock was drawn at all');
  assert(r.fadedRock > 0, 'not one wall faded, so rooms hide behind their own walls');
  assert(r.fadedRock < r.rock, 'every single wall faded, which is not a cutaway');
});

await test('same seed and same inputs give the same labyrinth (seed 777)', async () => {
  const r = await page.evaluate(() => {
    const run = () => {
      window.__test.seed(777);
      window.__test.press('panRight', true);
      window.__test.frame(60);
      window.__test.press('panRight', false);
      const s = window.__test.state;
      return { cam: s.cam.x, sig: s.world.cells.map((c) => c.h + c.tile).join('|') };
    };
    return [run(), run()];
  });
  assert(r[0].sig === r[1].sig, 'the labyrinth differed between two runs of seed 777');
  assert(r[0].cam === r[1].cam, `camera ended at ${r[0].cam} vs ${r[1].cam}`);
});


await test('crawlers reach the screen, standing on the ground (rule 4)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    window.__test.centreOn(0);
    const drew = window.__test.frame(1);
    return { people: drew.people, actors: window.__test.actors(),
             drawn: drew.items.filter((i) => i.kind === 'actor') };
  });
  assert(r.actors.length === 6, `${r.actors.length} crawlers were made`);
  assert(r.people > 0, 'not one crawler reached the screen');
  for (const d of r.drawn) {
    assert(d.parts.includes('legs') && d.parts.includes('torso') && d.parts.includes('head'),
      `${d.name} reached the screen as ${d.parts.join('+')}`);
  }
});

await test('a hat on a crawler is a hat on the screen (rule 4)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    /* Go and find a crawler, then take their hat off and on. */
    const found = window.__test.pointAtAnyActor();
    const idx = found.index;
    const who = found.pick;

    const n = window.__test.actors().length;
    for (let i = 0; i < n; i++) window.__test.wearHat(i, false);
    const bare = window.__test.redraw();          /* same moment, no time passes */
    const bareParts = bare.items.find((i) => i.i === who).parts;

    window.__test.wearHat(idx, true);
    const hatted = window.__test.redraw();
    const hatParts = hatted.items.find((i) => i.i === who).parts;

    return { bareParts, hatParts, bareWorn: bare.worn, hatWorn: hatted.worn,
             found, described: window.__test.describe(who) };
  });
  assert(!r.bareParts.includes('hat'), 'a bare head was drawn wearing a hat');
  assert(r.hatParts.includes('hat'), 'a crawler wearing a hat was drawn without one');
  assert(r.hatWorn.includes('hat'), 'the hat never reached the canvas');
  assert(!r.bareWorn.includes('hat'), 'a hat reached the canvas with nobody wearing it');
  assert(r.described.worn.includes('Hat'), 'the inspector does not list the hat');
  assert(r.found.found, `could not get the pointer onto a crawler: ${r.found.why}`);
});

await test('a figure is painted from the ground up, so nothing worn is buried', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const n = window.__test.actors().length;
    for (let i = 0; i < n; i++) window.__test.wearHat(i, true);
    window.__test.centreOn(0);
    const drew = window.__test.frame(1);
    const people = drew.items.filter((i) => i.kind === 'actor');
    return { people: people.map((p) => p.parts), figure: window.__test.data.figure };
  });
  assert(r.people.length > 0, 'no crawler was drawn');
  for (const parts of r.people) {
    const heights = parts.map((id) => r.figure[id].from_m);
    for (let i = 1; i < heights.length; i++) {
      assert(heights[i] >= heights[i - 1],
        `painted ${parts.join(' -> ')}, which puts ${parts[i]} underneath ${parts[i - 1]}`);
    }
    assert(parts[parts.length - 1] === 'hat',
      `the hat was not the last thing painted: ${parts.join(' -> ')}`);
  }
});

await test('the six attributes are shown in the order the spreadsheet lists them', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const who = window.__test.actors()[0].pick;
    return { shown: window.__test.describe(who).attributes.map((a) => a.id),
             sheet: Object.keys(window.__test.data.attributes) };
  });
  assert(r.shown.join(',') === r.sheet.join(','),
    `shown as ${r.shown.join(',')}, spreadsheet says ${r.sheet.join(',')}`);
  assert(r.sheet[0] === 'might' && r.sheet.length === 6,
    `the spreadsheet order is ${r.sheet.join(',')}`);
});

await test('hovering a crawler shows their six attributes and their skills', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);   /* let them get to work */
    window.__test.centreOn(0);
    const drew = window.__test.frame(1);
    const found = window.__test.pointAtAnyActor();
    const target = found.found ? { i: found.pick } : null;
    const hovered = found.found ? found.pick : -1;
    return { target, hovered, described: window.__test.describe(hovered),
             tooltip: window.__test.tooltipOnScreen(),
             consumed: window.__test.consumed() };
  });
  assert(r.target, 'no crawler was anywhere in view');
  assert(r.hovered === r.target.i, `pointed at crawler ${r.target.i}, picked ${r.hovered}`);
  assert(r.described.kind === 'crawler', 'the inspector did not recognise a crawler');
  assert(r.described.attributes.length === 6,
    `${r.described.attributes.length} attributes, not six`);
  assert(r.consumed.outlined, 'a hovered crawler was not outlined');
  assert(r.tooltip, 'no panel appeared for a crawler');
  assert(r.tooltip.text.includes(r.described.name), 'the panel does not name them');
  for (const a of r.described.attributes) {
    assert(r.tooltip.text.includes(a.abbrev),
      `the panel never shows ${a.abbrev}`);
  }
  assert(r.described.skills.length > 0, 'after 1200 ticks nobody has practised anything');
  assert(r.tooltip.text.includes(r.described.skills[0].name),
    'the panel does not show the skill they have been practising');
  assert(r.tooltip.tags.includes('crawler'), `crawler tags: ${r.tooltip.tags}`);
});

await test('rolls really happen in a real match, not only on the bench', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(4);
    const before = window.__test.rolls();
    window.__test.frame(600);
    const actors = window.__test.actors();
    return { before, after: window.__test.rolls(), actors };
  });
  assert(r.before === 0 && r.after > 20,
    `${r.after} rolls happened in 600 ticks`);
  const moved = r.actors.filter((a) => a.steps > 0).length;
  const tried = r.actors.filter((a) => a.steps + a.stumbles > 0).length;
  assert(tried >= 5, `only ${tried} of 6 crawlers ever tried to move`);
  assert(moved > 0, 'every crawler failed every single attempt to move');
  assert(r.actors.some((a) => a.stumbles > 0),
    'nobody ever stumbled, so failure is not reachable in a real match');
  assert(r.actors.every((a) => Object.keys(a.skills).length > 0),
    'some crawler went 600 ticks without practising anything at all');
  assert(r.actors.some((a) => a.skills.clambering > 0),
    'all that walking about taught nobody any Clambering');
});

await test('crawlers only ever step where the ground actually connects', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(9);
    const w = window.__test.state.world;
    let last = window.__test.actors().map((a) => ({ x: a.x, y: a.y }));
    const bad = [];
    for (let f = 0; f < 900; f++) {
      window.__test.frame(1);
      const now = window.__test.actors().map((a) => ({ x: a.x, y: a.y }));
      for (let i = 0; i < now.length; i++) {
        const p = last[i], q = now[i];
        const d = Math.abs(p.x - q.x) + Math.abs(p.y - q.y);
        if (d === 0) continue;
        if (d !== 1) { bad.push(`jumped ${d} tiles`); continue; }
        const from = w.at(p.x, p.y), to = w.at(q.x, q.y);
        if (TILE(to.tile).footing === 'block') bad.push('stepped into solid rock');
        else if (!canStep(from, to, q.x - p.x, q.y - p.y)) {
          bad.push(`stepped from ${from.h}m to ${to.h}m with no ramp`);
        }
      }
      last = now;
    }
    return { bad, moves: window.__test.actors().reduce((n, a) => n + a.steps, 0) };
  });
  assert(r.moves > 10, `only ${r.moves} steps were taken in 900 ticks`);
  assert(r.bad.length === 0, `${r.bad.length} illegal steps, e.g. ${r.bad[0]}`);
});

await test('progress slows as a crawler gets better (rule 1, seed 12, difficulty 55)', async () => {
  const r = await page.evaluate(() => window.__test.practice({
    seed: 12, skill: 'clambering', difficulty: 55, per: 15, blocks: 4,
    attr: { agility: 10, endurance: 10 }
  }));
  const g = r.blocks.map((b) => b.gain);
  const w = r.blocks.map((b) => b.wins);
  const per = r.blocks[0].attempts;
  assert(r.cap > 0, 'the bench did not report the practice ceiling');
  const last = r.blocks[3].after;

  for (let i = 1; i < g.length; i++) {
    assert(g[i] <= g[i - 1],
      `practice per block went ${g.join(' -> ')}, and rose instead of slowing`);
    assert(w[i] >= w[i - 1],
      `successes per block went ${w.join(' -> ')}, and fell instead of improving`);
  }
  assert(g[1] < g[0] && w[1] > w[0],
    `while they were still improving, progress did not slow: ${g.join(' -> ')}`);
  assert(g[0] > g[3] * 3,
    `first block gained ${g[0]}, last gained ${g[3]} -- barely a slowdown`);
  assert(w[0] < per / 2, `they began by succeeding ${w[0]} of ${per}`);
  assert(w[3] > per / 2, `they ended succeeding only ${w[3]} of ${per}`);
  /* The ceiling must not be what produced the slowdown. */
  assert(last < r.cap,
    `they hit the practice ceiling (${last}), so the ceiling did the slowing`);
});

await test('the slowdown comes from succeeding more, not from a hidden curve', async () => {
  const r = await page.evaluate(() => {
    /* Hold the success rate at zero by making the task impossible. If a curve
       were baked into learning, progress would tail off anyway. It must not. */
    const hard = window.__test.practice({
      seed: 12, skill: 'clambering', difficulty: 900, per: 10, blocks: 4,
      attr: { agility: 10, endurance: 10 }
    });
    return { gains: hard.blocks.map((b) => b.gain),
             wins: hard.blocks.map((b) => b.wins),
             last: hard.blocks[3].after, cap: hard.cap };
  });
  assert(r.wins.every((w) => w === 0), `they somehow succeeded: ${r.wins}`);
  assert(r.last < r.cap, `the bench ran into the ceiling at ${r.last}`);
  assert(r.gains.every((g) => g === r.gains[0]),
    `steady failure gave uneven progress ${r.gains.join(' -> ')}`);
});

await test('better natural attributes really do make a better crawler (rule 2)', async () => {
  const r = await page.evaluate(() => {
    const opts = { seed: 31, skill: 'clambering', difficulty: 75, per: 40, blocks: 1 };
    const poor = window.__test.practice(Object.assign({}, opts,
      { attr: { agility: 5, endurance: 5 } }));
    const fine = window.__test.practice(Object.assign({}, opts,
      { attr: { agility: 16, endurance: 16 } }));
    return { poor: poor.blocks[0].wins, fine: fine.blocks[0].wins,
             poorBase: poor.base, fineBase: fine.base };
  });
  assert(r.fineBase > r.poorBase, `${r.fineBase} vs ${r.poorBase}`);
  assert(r.fine > r.poor,
    `the agile crawler succeeded ${r.fine}/40 and the clumsy one ${r.poor}/40`);
});


await test('nothing at all is learned from succeeding (rule 1)', async () => {
  const r = await page.evaluate(() => {
    /* Make it far too easy: they succeed every time, and so must never improve. */
    const easy = window.__test.practice({
      seed: 4, skill: 'clambering', difficulty: -200, per: 40, blocks: 3,
      attr: { agility: 10, might: 10 }
    });
    return { gains: easy.blocks.map((b) => b.gain), wins: easy.blocks.map((b) => b.wins),
             knob: window.__test.data.knobs['learn.gain_on_success'] };
  });
  assert(r.knob === 0, `learn.gain_on_success is ${r.knob}, not 0`);
  assert(r.wins.every((w) => w === 40), `they failed sometimes: ${r.wins}`);
  assert(r.gains.every((g) => g === 0),
    `succeeding taught them ${r.gains.join(' -> ')} when it should teach nothing`);
});

await test('the crawlers gather in one room and build a camp there', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const camp0 = window.__test.camp();
    const start = window.__test.actors().map((a) => ({ x: a.x, y: a.y }));
    const startInRoom = start.filter((a) =>
      window.__test.state.world.at(a.x, a.y).room === camp0.room.index).length;

    const marks = [];
    for (let i = 0; i < 40; i++) {
      window.__test.frame(120);
      marks.push(window.__test.camp().summary.progress);
    }
    const camp = window.__test.camp();
    const actors = window.__test.actors();
    const inRoom = actors.filter((a) =>
      window.__test.state.world.at(a.x, a.y).room === camp.room.index).length;
    const drew = window.__test.frame(1);
    return { camp0, camp, marks, startInRoom, inRoom, actors,
             structures: drew.structures,
             drawn: drew.items.filter((i) => i.kind === 'site') };
  });

  assert(r.camp0.sites.length === 8,
    `the camp was planned as ${r.camp0.sites.length} pieces`);
  assert(r.camp0.sites.every((s) => s.room === r.camp0.room.index),
    'part of the camp was laid out outside the chosen room');
  assert(r.camp0.sites[0].structure === 'campfire', 'the fire is not the first thing sited');

  assert(r.marks[r.marks.length - 1] > 0, 'after 4800 ticks the camp had not started');
  assert(r.camp.summary.built > 0,
    `nothing was finished: ${r.camp.summary.built}/${r.camp.summary.sites}`);
  assert(r.camp.summary.cleared > 0, 'no ground was ever cleared');
  for (let i = 1; i < r.marks.length; i++) {
    assert(r.marks[i] >= r.marks[i - 1],
      `the camp went backwards: ${r.marks.join(',')}`);
  }
  assert(r.inRoom > r.startInRoom,
    `${r.startInRoom} crawlers began in the camp room and ${r.inRoom} ended there`);
  assert(r.actors.some((a) => a.skills.labouring > 0), 'nobody learned any Labouring');
  assert(r.actors.some((a) => a.skills.building > 0), 'nobody learned any Building');
  assert(r.structures > 0, 'not one piece of the camp reached the screen');
  assert(r.drawn.some((d) => d.built), 'no finished structure reached the screen');
});

await test('a half-built structure is half a structure on screen (rule 4)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const before = window.__test.frame(1).items.filter((i) => i.kind === 'site');
    for (let i = 0; i < 25; i++) window.__test.frame(120);
    const after = window.__test.frame(1).items.filter((i) => i.kind === 'site');
    const camp = window.__test.camp();
    const site = camp.sites.find((s) => s.progress > 0 && !s.built) || camp.sites[0];
    const shown = window.__test.describe(site.pick);
    return { before, after, site, shown, tip: (window.__test.point(
      after.find((d) => d.i === site.pick).sx,
      after.find((d) => d.i === site.pick).sy), window.__test.tooltipOnScreen()) };
  });
  assert(r.before.every((d) => !d.built), 'something was already built at tick zero');
  assert(r.after.some((d) => d.built || d.progress > 0), 'nothing ever went up');
  assert(r.shown.name && r.shown.progress === (r.site.built ? 100 : r.site.progress),
    `the inspector says ${r.shown.progress}%, the camp says ${r.site.progress}%`);
  assert(r.shown.tags.length > 0, 'a structure carries no tags (rule 8)');
});

await test('time only runs while the view is moving', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(2);
    window.__test.resume(); window.__test.pause();      /* reset the clock */
    const still1 = window.__test.loopOnce(60);
    const still2 = window.__test.loopOnce(60);
    window.__test.pan(12, 0);
    const moved = window.__test.loopOnce(60);
    const afterMoving = window.__test.loopOnce(60);
    return { still1, still2, moved, afterMoving, coast: window.__test.cfg.coastTicks };
  });
  assert(r.still1.ticks === 0 && r.still2.ticks === 0,
    `the world ran ${r.still1.ticks}/${r.still2.ticks} ticks while nothing moved`);
  assert(r.moved.ticks > 0, 'moving the view did not start time');
  assert(r.afterMoving.ticks === 0,
    `time kept running ${r.afterMoving.ticks} ticks after the view stopped`);
});

await test('a crawler tells you what they are doing', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const doings = {};
    for (let i = 0; i < 30; i++) {
      window.__test.frame(60);
      for (const a of window.__test.actors()) doings[a.doing] = (doings[a.doing] || 0) + 1;
    }
    const who = window.__test.pointAtAnyActor();
    return { doings, who, tip: window.__test.tooltipOnScreen(),
             described: who.found ? window.__test.describe(who.pick) : null };
  });
  assert(r.doings.walking > 0, `nobody ever walked anywhere: ${JSON.stringify(r.doings)}`);
  assert(r.doings.clearing > 0 || r.doings.building > 0, 'nobody ever did any work');
  assert(r.who.found, `no crawler could be pointed at: ${r.who.why}`);
  assert(r.described.doing, 'a crawler has no answer for what they are doing');
  assert(r.tip && r.tip.text.length > 0, 'the panel is empty for a crawler');
});

await test('the page raised no errors while all that happened', async () => {
  assert(errors.length === 0, errors.join(' | '));
});

await browser.close();

/* ---- 4. turning a dial in the spreadsheet really does change the game ----- */
await test('a number changed in the spreadsheet reaches the screen (rule 9)', async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), 'crawlers-'));
  try {
    const sheet = path.join(tmp, 'tweaked.xlsx');
    const out = path.join(tmp, 'tweaked.html');
    execFileSync('python3', [path.join(ROOT, 'tools/tweak_sheet.py'),
      sheet, 'knobs', 'render.rise', 'value', '48'], { encoding: 'utf8' });
    const log = execFileSync('python3', [path.join(ROOT, 'build.py'),
      '--sheet', sheet, '--out', out], { encoding: 'utf8' });
    assert(/render\.rise\s+32 -> 48/.test(log),
      'the build did not print a receipt for the change:\n' + log);

    const b2 = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const p2 = await b2.newPage();
    await p2.goto(pathToFileURL(out).href);
    await p2.waitForFunction(() => window.__test && window.__test.state);
    const r = await p2.evaluate(() => {
      window.__test.pause();
      window.__test.frame(1);
      return { cfg: window.__test.cfg.rise,
               metre: window.__test.project(4, 4, 0).y - window.__test.project(4, 4, 1).y };
    });
    await b2.close();
    assert(r.cfg === 48, `the game read ${r.cfg}, the sheet said 48`);
    assert(r.metre === 48, `a metre came out ${r.metre}px on screen, the sheet said 48`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

console.log('');
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : '\n         ' + r.why}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
