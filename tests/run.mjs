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

/* Running a few tests by name, for the loop of changing a test and running it:
 *
 *     node tests/run.mjs --only=ground,ramp
 *
 * A test runs when its name contains any of the comma-separated words. The
 * spreadsheet reconciler is skipped too, because it cannot be affected by which
 * test is being run. So a run with --only in it is **never the run that ships**:
 * run without it before committing. */
const ONLY = (process.argv.slice(2).find((a) => a.startsWith('--only=')) || '')
  .slice('--only='.length).split(',').map((w) => w.trim()).filter(Boolean);

/* The short everyday check, for the work between changes:
 *
 *     node tests/run.mjs --quick
 *
 * A dozen tests in about a minute, and every one of them guards something a
 * large number of the other tests assume and would fail on without saying so:
 * that the file on disk is the version the sources say, that a number in the
 * spreadsheet reaches the picture, that the labyrinth is walkable at all, that
 * the picture never paints through the thing in front of it, that the ground
 * arrives underfoot as the view travels, that the pointing and the harness's own
 * doors still work, that materials and light still reach the screen, and that
 * the page raised no errors doing it. It is a smoke alarm, not a survey: a
 * change that reaches into shared machinery still wants the whole suite.
 *
 * --only may be given as well, and the two are run together. */
const QUICK_WORDS = [
  'built file reports the version',
  'hovering a block outlines it',
  'the labyrinth is rooms and halls',
  'rock in the way is cut away',
  'materials reach the screen',
  'the labyrinth is dark',
  'the box says how lit it is',
  'the pointer finds the frontmost shape',
  'nothing the picture left out can be picked',
  'crawlers reach the screen',
  'ground appears as the view travels',
  'the page raised no errors'
];
const QUICK = process.argv.slice(2).includes('--quick');
const WORDS = QUICK ? QUICK_WORDS.concat(ONLY) : ONLY;
const PICKED = WORDS.length > 0;

/* Every test is printed as it STARTS, on stderr, because the results are all
 * held back until the end and a full run takes minutes -- a run that is working
 * and a run that is wedged look exactly alike from the outside, and both have
 * been killed for it. The line names the test that is running NOW, so the last
 * line before a stop says where it stopped. */
async function test(name, fn) {
  if (PICKED && !WORDS.some((w) => name.includes(w))) return;
  const n = results.length + 1;
  process.stderr.write(`  ... ${n} running: ${name}\n`);
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, why: e.message }); }
}

/* ---- 1. the spreadsheet reconciler checks itself ------------------------- */
console.log('\nspreadsheet reconciler');
try {
  if (ONLY.length && !QUICK) {
    console.log(`  skipped -- --only=${ONLY.join(',')} is a test-picking run`);
  } else {
    console.log(execFileSync('python3', [path.join(ROOT, 'build.py'), '--check'],
      { encoding: 'utf8' }).trimEnd().split('\n').slice(1).join('\n'));
  }
} catch (e) {
  console.error((e.stdout || '') + (e.stderr || ''));
  console.error('the spreadsheet reconciler failed its own self-check');
  process.exit(1);
}

if (QUICK) {
  console.log(`\nSHORT CHECK -- ${QUICK_WORDS.length} tests picked by name out of the suite`
    + `${ONLY.length ? ', plus --only=' + ONLY.join(',') : ''}. Not a full run; the whole`
    + ' suite is what goes out.\n');
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
/* The pictures dropped into textures/ decode in their own time. Wait for them
   before anything is measured, or a test that asks about a picture reads a game
   with none in it -- and passes. A build with no pictures is ready at once. */
await page.waitForFunction(() => window.__test.texturesReady().ready);
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
  assert(r.world.cells === r.world.pieces * 56 * 56,
    `the world holds ${r.world.cells} squares in ${r.world.pieces} pieces, `
    + 'which is not a whole number of pieces');
  assert(r.world.pieces >= 1, 'the world is holding no ground at all');
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

await test('ramps climb exactly one metre, toward ground exactly one metre higher (v0.33.2)', async () => {
  const r = await page.evaluate(() => {
    const step = { 'x+': [1, 0], 'x-': [-1, 0], 'y+': [0, 1], 'y-': [0, -1] };
    let ramps = 0, up1 = 0, rock = 0, wrong = 0, edge = 0, seeds = 0;
    for (const seed of [1, 2, 3, 7, 8, 777]) {
      window.__test.seed(seed);
      seeds++;
      const w = window.__test.state.world;
      for (const c of w.cells) {
        if (TILE(c.tile).footing !== 'ramp') continue;
        ramps++;
        const d = step[c.slope];
        const up = w.at(c.x + d[0], c.y + d[1]);
        if (!up) { edge++; continue; }
        /* A slope that fetches up against rock is a cave, not a defect: that is
           their rule (v0.33.2). What may not happen is a slope leaning at open
           ground that is not a metre up -- a wedge the map refuses to let you
           walk off. */
        if (TILE(up.tile).footing === 'block') { rock++; continue; }
        if (up.h === c.h + 1) { up1++; continue; }
        wrong++;
      }
    }
    return { ramps, up1, rock, wrong, edge, seeds };
  });
  assert(r.ramps > 0, 'the labyrinth generated no ramps at all');
  assert(r.edge === 0, `${r.edge} ramps lean at the edge of the piece, where nothing can say what is there`);
  assert(r.wrong === 0,
         `${r.wrong} of ${r.ramps} ramps lean at open ground that is not a metre up, over ${r.seeds} seeds`);
  assert(r.up1 + r.rock === r.ramps,
         `${r.up1} ramps climb a metre and ${r.rock} lean at rock, out of ${r.ramps}`);
});

/* A ramp is the only place two levels meet. It may end against ROCK -- a bank of
   rubble fetching up against a face, which is what a cave looks like and what
   they asked for (v0.33.2: "I don't mind slopes leading up to walls"). It may
   not end over OPEN ground that is not a metre up: there is nothing there to
   explain the refusal, so the picture shows a slope and the map says no. Three
   rules applied after the ramps are dug (a block placed in the room, a hall dug
   over the square, a doorway corridor leaning on "the next square is higher")
   used to leave 145 of them in 270 pieces -- 118 leaning at rock, which is now
   left alone, and 27 leaning at open ground, which is repaired.
   This runs the repair OFF and ON in one build: the OFF run has to find the
   wedges, the ON run has to find none, and the rock-leaning ramps have to be
   untouched by it, or the rule they asked for is not in the game. See lesson 21
   (prove a change against the same build with it switched off) and lesson 22
   (run the range, not the sample). */
await test('a slope may end at rock, but never over a drop (v0.33.2)', async () => {
  const r = await page.evaluate(() => window.__test.slopeAudit([1, 2, 3, 7, 8, 777]));
  assert(r.worlds === 2 * r.cases,
         `the audit made ${r.worlds} pieces of world for ${r.cases} cases (expected ${2 * r.cases})`);
  assert(r.pieces >= 40, `the audit only reached ${r.pieces} pieces, so it measured next to nothing`);
  assert(r.wedgesOld > 0,
         `the old way had no wedges to repair (${r.wedgesOld} of ${r.rampsOld} ramps), so this test proves nothing`);
  assert(r.wedgesNew === 0,
         `${r.wedgesNew} of ${r.rampsNew} ramps still lean at open ground: ${JSON.stringify(r.causes)}`);
  assert(r.left === 0, `${r.left} ramps were still wedges when the repair gave up`);
  assert(r.lost === 0, `the repair took ${r.lost} steps away (gained ${r.gained})`);
  assert(r.aimed + r.flatted > 0, 'nothing was repaired at all');
  assert(r.atRockNew > 0,
         'no ramp leans at rock any more, so the rule they asked for is not in the game');
  assert(r.atRockNew === r.atRockOld,
         `the repair touched ${r.atRockOld - r.atRockNew} of the ${r.atRockOld} ramps that lean at rock, which they told us to leave alone`);
});

await test('hovering a block outlines it and names it on screen (rule 8)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const drew = window.__test.frame(1);
    /* The last block painted is in front of everything, so nothing hides it --
       and the pixel is the one the renderer records as certainly its own paint
       (`aim`: inside its near face, above whatever covers it), NOT the middle of
       its square. Since v0.42.0 a wall paints no top face, so the centre of a
       block is painted by whatever the deleted lid was hiding, and pointing
       there asks the picker about somebody else's pixel. The in-page self-check
       in src/js/99-test.js has pointed at `aim` for the same reason since the
       look changed. */
    let target = null;
    for (let k = drew.items.length - 1; k >= 0; k--) {
      const it = drew.items[k];
      if (!it.aim) continue;
      if (it.aim.x > 8 && it.aim.x < window.__test.buffer().w - 8
        && it.aim.y > 8 && it.aim.y < window.__test.buffer().h - 8) { target = it; break; }
    }
    const hovered = window.__test.point(target.aim.x, target.aim.y);
    return {
      target, hovered,
      consumed: window.__test.consumed(),
      tooltip: window.__test.tooltipOnScreen(),
      panel: window.__test.panelOnScreen(),
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
  assert(r.tooltip.text.includes(r.described.footingText),
    `the tooltip says "${r.tooltip.text}" but never mentions the footing`);
  assert(r.panel === null, 'a panel appeared without anything being clicked');
});

await test('pointing at nothing at all names nothing, and there is no edge to walk off (v0.21.0)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    /* There used to be an edge of the world: slide off the batch and there was
       nothing to point at. The world now lays ground wherever the view goes,
       six thousand squares out as much as at the camp, so "nothing at all" is
       the space outside the picture -- and what the world does out there is
       what this test is really about. */
    window.__test.pan(6000, 6000);
    window.__test.frame(2);
    const s = window.__test.state;
    const here = Math.floor(s.cam.fx), up = Math.floor(s.cam.fy);
    const ground = s.world.at(here, up);
    const off = window.__test.point(-5, -5);
    const a = { off, tip: window.__test.tooltipOnScreen(),
                outlined: window.__test.consumed().outlined };
    window.__test.unpoint();
    return { ground: !!ground, a, b: window.__test.tooltipOnScreen(),
             outlined: window.__test.consumed().outlined,
             drew: window.__test.consumed().count };
  });
  assert(r.ground, 'six thousand squares from the camp there was no ground at all');
  assert(r.drew > 0, 'the ground out there was never painted');
  assert(r.a.off === -1, `found block ${r.a.off} in empty space`);
  assert(r.a.tip === null, 'the panel stayed up over empty space');
  assert(r.b === null && !r.outlined, 'the highlight stayed after the pointer left');
});

/* THE REPORTED BUG, v0.34.0: "when mousing over the campfire, the tiles to the
 * lower left and lower right of it go transparent."
 *
 * The old rule worked out what stood in front of a thing from the BOX the thing
 * was drawn in, and a structure's box reaches out over the squares either side
 * of it -- so pointing at the campfire knocked the two tiles beside it into
 * see-through. A box is not a silhouette, and there is no answer to "is this
 * behind that" that a box can give.
 *
 * So the pointer is walked over every pixel of a box round the fire -- the
 * report is answered by asking the question the report is about, everywhere it
 * could be true -- and what is counted is what the picture drew at less than
 * full strength. The arm with the haze switched back on is the negative
 * control: it is the same counter, and it has to be able to fail. */
await test('the campfire never makes the tiles beside it see-through (v0.34.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.pause(); t.unpoint();
    const was = t.cfg.cutSolid;
    const arm = (solid) => {
      t.cfg.cutSolid = solid;
      const rows = [];
      for (const seed of [1, 3, 5, 7, 23, 777]) {
        /* Run the match on until the crawlers have raised the camp themselves,
           so the fire is the game's own and not a test's arrangement of it. */
        t.seed(seed);
        t.step(3001);
        t.record(true);
        t.redraw();
        const s = Game.state;
        for (let k = 0; k < 8; k++) {      /* settle the world first (lesson 24) */
          const n = s.world.cells.length;
          s.geomDirty = true; s.viewDirty = true; Game.render();
          if (s.world.cells.length === n) break;
        }
        t.repaint();
        const fire = (t.consumed().items || [])
          .find((q) => q.kind === 'site' && q.structure === 'campfire');
        if (!fire) { rows.push({ seed, none: true, tick: s.tick }); continue; }
        let samples = 0, onFire = 0, stained = 0;
        const what = new Set();
        const FX = Math.round(fire.sx), FY = Math.round(fire.sy);
        /* An adjacent square is about 16 px away in x and 8 in y at 32 px to the
           metre, so this box takes in every neighbour of the fire. */
        for (let y = FY - 16; y <= FY + 16; y++) {
          for (let x = FX - 16; x <= FX + 16; x++) {
            if (x < 0 || y < 0 || x >= Render.w || y >= Render.h) continue;
            samples++;
            if (t.point(x, y) === fire.i) onFire++;
            for (const q of (t.consumed().items || [])) {
              if (q.alpha >= 1) continue;
              stained++;
              what.add(q.kind + ' ' + (q.structure || q.name || q.tile));
            }
          }
        }
        t.unpoint();
        /* Is anything beside the fire cut away at all, and is any of it ground a
           crawler could stand on? The cut mark is hover-independent by
           construction, and the census below proves the pointer cannot move it. */
        let cut = 0, walkCut = 0;
        for (const it of Render.batch) {
          if (it.kind !== 'cell' || !it.cutaway) continue;
          cut++;
          if (it.cell && TILE(it.cell.tile).footing === 'walk') walkCut++;
        }
        rows.push({ seed, fire: [fire.x, fire.y], samples, onFire, stained,
                    cut, walkCut, what: [...what].slice(0, 6) });
      }
      t.unpoint(); t.record(false);
      return rows;
    };
    const shipped = arm(was);
    const hazy = arm(0.5);
    t.cfg.cutSolid = was;
    t.seed(1); t.redraw();
    return { was, shipped, hazy, back: t.cfg.cutSolid };
  });
  const sum = (a, k) => a.reduce((n, q) => n + (q.none ? 0 : q[k]), 0);
  const seen = r.shipped.filter((q) => !q.none);
  const haz = r.hazy.filter((q) => !q.none);
  assert(r.was === 1 && r.back === 1,
    `the rock in the way is not drawn solid in the spreadsheet (cut_solid`
    + ` ${r.was}), so there is no gap left to see through`);
  assert(seen.length === 6 && haz.length === 6,
    `${seen.length} of six seeds had a campfire to look at`);
  assert(sum(seen, 'samples') > 5000 && sum(seen, 'onFire') >= 400,
    `the pointer was put on ${sum(seen, 'samples')} pixels round the fire and`
    + ` answered with the fire ${sum(seen, 'onFire')} times, so it did not really`
    + ' walk over the fire at all');
  assert(sum(seen, 'cut') > 0,
    'no square stood in front of the fire in any of the six worlds, so there is'
    + ' nothing here for the see-through dial to be about');
  assert(sum(seen, 'walkCut') === 0 && sum(haz, 'walkCut') === 0,
    `${sum(seen, 'walkCut')} squares a crawler could stand on were cut away round`
    + ' the fire');
  assert(sum(seen, 'stained') === 0,
    `pointing at the campfire drew ${sum(seen, 'stained')} things at less than`
    + ` full strength: ${[...new Set(seen.flatMap((q) => q.what))].join(', ')}`);
  assert(sum(haz, 'stained') > 0,
    'with the haze switched back on not one thing was drawn see-through, so the'
    + ' count above cannot fail');
  assert(sum(seen, 'stained') * 20 < sum(haz, 'stained'),
    `the shipped dial stained ${sum(seen, 'stained')} samples and the haze`
    + ` ${sum(haz, 'stained')}, which is not the difference the dial claims`);
});

await test('panning moves the view, and picking follows it', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    window.__test.frame(1);
    const before = window.__test.project(5, 5, 0);
    window.__test.pan(40, 24);
    const after = window.__test.project(5, 5, 0);
    /* Point at the same screen spot: it must now be a different block. */
    const at = { x: window.__test.buffer().w / 2, y: window.__test.buffer().h / 2 };
    const hit = window.__test.point(at.x, at.y);
    window.__test.pan(-40, -25);
    const back = window.__test.point(at.x, at.y);
    return { before, after, hit, back };
  });
  assert(Math.abs((r.before.x - r.after.x) - 40) <= 1
      && Math.abs((r.before.y - r.after.y) - 24) <= 1,
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
    const z = window.__test.zoom(window.__test.buffer().zoom + 1);
    const after = window.__test.point(at.x, at.y);
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
      out.push({ z: cam.zoom, camX: cam.ox, camY: cam.oy, w: buf.w, h: buf.h });
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

await test('nothing you point at or select is ever drawn see-through (v0.34.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    const arm = (solid) => {
      t.cfg.cutSolid = solid;
      let shots = 0, stained = 0, floors = 0, stains = 0, worlds = 0;
      for (const seed of [1, 3, 5, 7, 23, 777]) {
        t.seed(seed);
        t.record(true);
        t.frame(2);
        worlds++;
        /* Settle the world before looking at it, or a square's number slides
           under the test the moment more ground is fetched (lessons 24, 25). */
        const s = Game.state;
        for (let k = 0; k < 8; k++) {
          const n = s.world.cells.length;
          s.geomDirty = true; s.viewDirty = true; Game.render();
          if (s.world.cells.length === n) break;
        }
        const b = Render.batch, spots = [];
        for (let k = 0; k < b.length; k += 8) {
          const it = b[k];
          if (it.kind !== 'cell' || !it.cell || it.cutaway) continue;
          if (TILE(it.cell.tile).footing !== 'walk') continue;
          spots.push([it.cell.x, it.cell.y]);
        }
        for (const spot of spots) {
          let focus = null;
          for (const it of Render.batch) {
            if (it.kind === 'cell' && it.cell
                && it.cell.x === spot[0] && it.cell.y === spot[1]) { focus = it; break; }
          }
          if (!focus) continue;
          t.select(focus.i);
          const c = t.consumed();
          if (c.focus !== focus.i) continue;
          /* What the picture drew at less than full strength with this floor
             pinned. Nothing may, ever -- the haze is what the report was about. */
          let n = 0;
          for (const q of (c.items || [])) {
            if (q.alpha >= 1) continue;
            n++;
            if (q.kind === 'cell' && q.cell
                && TILE(q.cell.tile).footing === 'walk') stains++;
          }
          shots++; if (n > 0) stained++; floors += n;
        }
      }
      t.select(-1); t.repaint();
      return { shots, stained, floors, stains, worlds };
    };
    t.pause();
    const wasCut = t.cfg.cutSolid;
    const exact = arm(wasCut);
    const hazy = arm(0.5);
    t.cfg.cutSolid = wasCut;
    t.select(-1); t.record(false); t.repaint();
    return { exact, hazy, wasCut, back: t.cfg.cutSolid };
  });
  assert(r.exact.worlds === 6 && r.hazy.worlds === 6,
    `${r.exact.worlds} and ${r.hazy.worlds} of six seeds were looked at`);
  assert(r.exact.shots > 60, `only ${r.exact.shots} floors were pointed at`);
  assert(r.wasCut === 1 && r.back === 1,
    `the rock in the way is not drawn solid in the spreadsheet (cut_solid`
    + ` ${r.wasCut}), so there is no gap left to see through`);
  assert(r.exact.floors === 0 && r.exact.stains === 0,
    `selecting ${r.exact.shots} floors drew ${r.exact.floors} things at less than`
    + ` full strength (${r.exact.stains} of them ground a crawler could stand on,`
    + ` in ${r.exact.stained} of the pictures)`);
  /* The negative control: the same counter, with the haze switched back on. */
  assert(r.hazy.floors > 0,
    'with the haze switched back on not one thing was drawn see-through, so the'
    + ' count above cannot fail');
});

await test('a camp structure does not make the ground beside it see-through (v0.34.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.pause(); t.record(true);
    const wasCut = t.cfg.cutSolid;

    /* Is this the thing the picture ended up pinned on? The batch is built again
       for every picture, so a thing is found by where it stands. */
    const same = (it, w) => {
      if (!it) return false;
      if (w.kind === 'actor') return it.kind === 'actor' && it.actor === w.actor;
      return it.kind === 'site' && it.site
        && it.site.x === w.x && it.site.y === w.y && it.site.structure === w.what;
    };
    const find = (w) => {
      for (const it of Render.batch) if (same(it, w)) return it;
      return null;
    };

    /* Point at each thing in turn and count what the picture drew at less than
       full strength while it was pinned. */
    const blank = () => ({ shots: 0, sites: 0, people: 0, things: 0, floors: 0, stained: 0 });
    const at = (asked) => {
      const got = blank();
      for (const w of asked) {
        const here = find(w);
        if (!here) continue;
        t.select(here.i);
        const c = t.consumed();
        if (c.focus !== here.i) continue;
        /* What reached the canvas at less than full strength, with this thing
           pinned. Nothing may, ever -- the haze is what the report was about. */
        let n = 0;
        for (const q of (c.items || [])) {
          if (q.alpha >= 1) continue;
          n++;
          if (q.kind === 'cell' && q.cell
              && TILE(q.cell.tile).footing === 'walk') got.floors++;
        }
        got.shots++;
        if (w.kind === 'site') got.sites++; else got.people++;
        got.things += n;
        if (n > 0) got.stained++;
      }
      return got;
    };
    const add = (into, got) => { for (const k in got) into[k] += got[k]; };

    /* Everything of one kind the picture is holding that has parts to be a
       silhouette of: a site with no parts is not drawn at all. */
    const collect = (kind) => {
      const asked = [];
      for (const it of Render.batch) {
        if (it.kind !== kind || !it.parts || !it.parts.length) continue;
        if (kind === 'actor') asked.push({ kind: 'actor', actor: it.actor });
        else asked.push({ kind: 'site', x: it.site.x, y: it.site.y, what: it.site.structure });
      }
      return asked;
    };

    const faces = blank();
    const hazy = blank();
    let worlds = 0, stood = 0, raised = 0;

    for (const seed of [1, 3, 5, 7, 23, 777]) {
      t.seed(seed);
      t.frame(2);
      const s = Game.state;
      if (!s.actors || !s.actors.length) continue;

      /* Settle the world before looking at it: keep painting until no more
         ground is made, or the numbers slide under the test (lesson 24). */
      const settle = () => {
        for (let k = 0; k < 8; k++) {
          const was = s.world.cells.length;
          s.geomDirty = true; s.viewDirty = true; Game.render();
          if (s.world.cells.length === was) break;
        }
      };
      settle();

      /* The crawlers, standing where the match began. SETTLED, not merely
         repainted: `repaint()` only marks the view dirty and reuses the
         geometry already built, while `cutSolid` is read once, in build() --
         so the haze arm used to be handed the same picture as the solid arm and
         counted nothing (`hazy.things === 0`). `settle()` sets `geomDirty`, so
         the knob is actually connected to the picture. */
      const people = collect('actor');
      stood += people.length;
      t.cfg.cutSolid = wasCut; settle();
      add(faces, at(people));
      t.cfg.cutSolid = 0.5; settle();
      add(hazy, at(people));
      t.cfg.cutSolid = wasCut;

      /* The camp, by the game's own rule, with everything in it raised -- the
         fire among them, which is the thing that was reported. */
      if (!s.camp) { const made = makeCamp(s); if (made) s.camp = made; }
      if (!s.camp || !s.camp.sites.length) continue;
      for (const q of s.camp.sites) { q.cleared = true; q.built = true; q.progress = 100; }
      const q0 = s.camp.sites[0];
      const p = Render.project(s, q0.x + 0.5, q0.y + 0.5, surfaceHeight(s.world.at(q0.x, q0.y)));
      panCamera(s, p.x - Render.w / 2, p.y - Render.h / 2);
      settle();

      const built = collect('site');
      raised += built.length;
      t.cfg.cutSolid = wasCut; settle();
      add(faces, at(built));
      t.cfg.cutSolid = 0.5; settle();
      add(hazy, at(built));
      t.cfg.cutSolid = wasCut;
      worlds++;
    }

    t.select(-1);
    t.cfg.cutSolid = wasCut;
    t.repaint();
    t.record(false);
    return { faces, hazy, worlds, stood, raised, wasCut, back: t.cfg.cutSolid };
  });
  assert(r.worlds === 6 && r.faces.shots === r.hazy.shots,
    `${r.worlds} worlds were looked at, and the two rules were shown ${r.faces.shots}`
    + ` and ${r.hazy.shots} things -- they have to be the same worlds and the`
    + ` same things, or the comparison means nothing`);
  assert(r.raised >= 24 && r.stood >= 4,
    `${r.raised} camp structures and ${r.stood} crawlers were pointed at, so this`
    + ` test is not catching the behaviour it is about`);
  assert(r.wasCut === 1 && r.back === 1,
    `the rock in the way is not drawn solid in the spreadsheet (cut_solid`
    + ` ${r.wasCut}), so there is no gap left to see through`);
  assert(r.faces.things === 0 && r.faces.floors === 0,
    `pointing at ${r.faces.shots} camp structures and crawlers drew`
    + ` ${r.faces.things} things at less than full strength`
    + ` (${r.faces.floors} of them ground a crawler could stand on, in`
    + ` ${r.faces.stained} of the pictures) -- ${r.faces.sites} structures and`
    + ` ${r.faces.people} crawlers in ${r.worlds} worlds`);
  /* The negative control: the same counter, with the haze switched back on. */
  assert(r.hazy.things > 0,
    'with the haze switched back on not one thing was drawn see-through, so the'
    + ' count above cannot fail');
});

/* The rule the whole cutaway rests on, asserted as a CENSUS rather than a
 * sample (lesson 15): nothing in the picture is ever drawn at part strength.
 * A square is either painted solidly or not painted at all, and the only thing
 * allowed to be in the second group is rock that is standing in front of what
 * you are looking at -- never a square a crawler could stand on.
 *
 * The third arm is the pointer: 8 asks a picture over 112 pictures, with the
 * count of part-strength items taken again after each ask, because the pointer
 * is what the reported bug was made by. And the dial is checked last, so that
 * `render.cut_solid` has to be connected to something (rule 9).
 *
 * AS OF v0.44.0 THE SHEET SHIPS `render.cut_solid` AT 1 -- the rock standing in
 * front of what you are looking at is painted like any other rock -- so the
 * shipped picture leaves NOTHING out and the counters that measure cutting all
 * read zero for the trivial reason that there is nothing to count. The claim on
 * the 112 shipped pictures is therefore the confinement, in full: nothing cut,
 * nothing keeping a foot of rock, no wall brought back and none left as a hole,
 * with `cutCells` proving there were squares marked as standing in the way all
 * the same. The same build one knob apart is where those counters can fail --
 * that is the small battery, and the two readings of the dial. */
await test('rock in the way is cut away, and nothing is ever drawn see-through (v0.34.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.pause(); t.unpoint();
    const wasCut = t.cfg.cutSolid;
    const wasStump = t.cutStump();
    const wasZoom = t.buffer().zoom;

    /* Settle the world before looking at it: keep painting until no more ground
       is made, or the numbers slide under the test (lesson 24). */
    const settle = (s) => {
      for (let k = 0; k < 8; k++) {
        const n = s.world.cells.length;
        s.geomDirty = true; s.viewDirty = true; Game.render();
        if (s.world.cells.length === n) break;
      }
    };
    const census = () => {
      const c = t.consumed();
      const list = c.items || [];
      let zero = 0, zeroBad = 0, part = 0, partWalk = 0;
      for (const q of list) {
        if (q.alpha === 0) {
          zero++;
          /* The only thing allowed to be missing: rock being cut out of the way. */
          const rock = q.kind === 'cell' && q.cutaway === true
            && TILE(q.tile).footing !== 'walk';
          if (!rock) zeroBad++;
        } else if (q.alpha < 1) {
          part++;
          if (q.kind === 'cell' && q.cell
              && TILE(q.cell.tile).footing === 'walk') partWalk++;
        }
      }
      return { built: Render.batch.length, painted: c.count, cut: c.cut,
               cutaway: c.cutaway, kept: c.kept, lost: c.lost, walls: c.walls,
               stumps: c.stumps, zero, zeroBad, part, partWalk };
    };

    const o = { cases: 0, worlds: new Set(), built: 0, painted: 0, cut: 0,
                cutaway: 0, stumps: 0, zero: 0, zeroBad: 0, part: 0,
                partWalk: 0, kept: 0, lost: 0, wallsOn: 0, wallsOff: 0,
                asks: 0, askPart: 0, askPartWalk: 0, cutCells: 0, walkCutCells: 0 };

    for (const seed of [1, 2, 3, 5, 7, 23, 777]) {
      for (const up of [false, true]) {
        for (const zoom of [1, 2]) {
          t.seed(seed);
          t.step(3001);
          t.tilt(up);
          t.zoom(zoom);
          t.record(true);
          t.unpoint();
          settle(Game.state);
          for (let q = 0; q < 4; q++) {
            t.rotate(q ? 1 : 0);
            /* The clip is switched off for one picture so the walls it takes
               away can be counted, which is what makes `kept` mean something. */
            t.clipWalls(false); t.redraw();
            o.wallsOff += t.consumed().walls;
            t.clipWalls(true); t.redraw();
            const c = census();
            o.cases++;
            o.worlds.add(seed + ':' + (up ? 'up' : 'flat') + ':' + zoom
              + ':' + t.camera().quarter);
            for (const k of ['built', 'painted', 'cut', 'cutaway', 'zero',
                             'zeroBad', 'part', 'partWalk', 'kept', 'lost']) o[k] += c[k];
            o.wallsOn += c.walls;
            o.stumps += c.stumps;
            /* How many squares this picture holds that are cut away at all --
               the check that the census is not vacuously passing -- and how many
               of those a crawler could stand on, which must never be any. */
            for (const it of Render.batch) {
              if (it.kind !== 'cell' || !it.cutaway) continue;
              o.cutCells++;
              if (TILE(it.cell ? it.cell.tile : it.tile).footing === 'walk') o.walkCutCells++;
            }
            for (let k = 0; k < 8; k++) {
              const x = 4 + ((k * 137) % (Render.w - 8));
              const y = 4 + ((k * 91) % (Render.h - 8));
              t.point(x, y);
              o.asks++;
              const h = census();
              o.askPart += h.part;
              o.askPartWalk += h.partWalk;
            }
            t.unpoint();
          }
        }
      }
    }
    /* THE CUT IS PROVED LIVE ONE KNOB APART, IN THE SAME BUILD.
       As of v0.44.0 the sheet ships `render.cut_solid` at 1, so the main
       battery above paints nothing but solid rock and every counter it keeps
       reads zero for the trivial reason that there is nothing to count. The
       same build with the dial back at 0 is where they can fail, and it is also
       the negative control this look is proved against: the rock in front goes,
       every hidden square keeps its foot of rock, no wall is left as a hole,
       and the squares `cut` counts come back. 2 seeds x 2 angles x 2 quarter
       turns. */
    const small = { cases: 0, worlds: new Set(), built: 0, painted: 0, cut: 0,
                    stumps: 0, kept: 0, lost: 0, part: 0, zeroBad: 0,
                    cutCells: 0, walkCutCells: 0 };
    t.cfg.cutSolid = 0;
    for (const seed of [1, 7]) {
      for (const up of [false, true]) {
        t.seed(seed);
        t.step(3001);
        t.tilt(up);
        t.zoom(wasZoom);
        t.record(true);
        t.unpoint();
        settle(Game.state);
        for (let q = 0; q < 2; q++) {
          if (q) t.rotate(1);
          t.clipWalls(true); t.redraw();
          const c = census();
          small.cases++;
          small.worlds.add(seed + ':' + (up ? 'up' : 'flat') + ':'
            + t.camera().quarter);
          for (const k of ['built', 'painted', 'cut', 'stumps', 'kept', 'lost',
                           'part', 'zeroBad']) small[k] += c[k];
          for (const it of Render.batch) {
            if (it.kind !== 'cell' || !it.cutaway) continue;
            small.cutCells++;
            if (TILE(it.cell ? it.cell.tile : it.tile).footing === 'walk') small.walkCutCells++;
          }
        }
      }
    }
    /* Is `render.cut_solid` connected to anything? At 1 nothing may be cut --
       read off the world the small battery left behind, which is one knob apart
       from the reading underneath it. */
    t.cfg.cutSolid = 1; t.step(1); t.redraw();
    const dial = census();
    /* And the other half of the same dial: at 0 the rock in front goes. */
    t.cfg.cutSolid = 0; t.redraw();
    const off = census();
    t.cfg.cutSolid = wasCut;
    /* Is `render.cut_stump_m` connected to anything? At 0 a hidden block is left
       out of the picture whole instead of keeping a foot of rock standing, so
       the squares `cut` counts come back and the squares `stumps` counts go to
       nothing. That is the only way either counter is ever anything: nothing is
       ever both. Read at the dial's 0 as well -- at the shipped 1 there is no
       hidden block for the foot of rock to be about, and the reading would say
       nothing. */
    t.cfg.cutSolid = 0; t.cutStump(0); t.redraw();
    const bare = census();
    t.cutStump(wasStump);
    t.cfg.cutSolid = wasCut;
    t.zoom(wasZoom); t.tilt(false); t.unpoint(); t.record(false);
    t.seed(1); t.redraw();
    return { ...o, worlds: o.worlds.size,
             small: { ...small, worlds: small.worlds.size },
             dialCut: dial.cut, dialPart: dial.part,
             offCut: off.cut, offStumps: off.stumps, offPart: off.part,
             offBad: off.zeroBad,
             bare: { cut: bare.cut, stumps: bare.stumps, zeroBad: bare.zeroBad,
                     kept: bare.kept, lost: bare.lost },
             wasCut, wasStump, wasZoom, back: t.cfg.cutSolid,
             backStump: t.cutStump() };
  });
  assert(r.cases === 112 && r.worlds > 100,
    `${r.cases} pictures were looked at and they reached ${r.worlds} different`
    + ' ones, so the seeds, angles, zooms and turns are doing something');
  assert(r.built === r.painted + r.cut,
    `${r.built} shapes were built but ${r.painted} painted and ${r.cut} cut away`);
  assert(r.wasCut === 1 && r.back === 1,
    `the rock in the way is not drawn solid in the spreadsheet (cut_solid`
    + ` ${r.wasCut}), so there is no gap left to see through`);
  /* The shipped look, on 112 pictures: nothing is left out of them at all. Not
     one square cut away, not one keeping a foot of rock, no wall brought back to
     close a hole and none left as one. */
  assert(r.cut === 0 && r.stumps === 0 && r.kept === 0 && r.lost === 0,
    `cut_solid is ${r.wasCut} and the picture still left ${r.cut} squares out of`
    + ` it whole, ${r.stumps} keeping a foot of rock, ${r.kept} walls brought`
    + ` back and ${r.lost} left as a hole`);
  /* And that claim is not passing for want of anything to cut: `cutCells` counts
     the squares in the batch the cutaway has marked as rock standing in the way
     of a floor behind them, and every one of them is painted. */
  assert(r.cutCells > 0,
    'not one square in any of the 112 pictures was marked as rock standing in the'
    + ' way, so this test is not catching the behaviour it is about');
  assert(r.walkCutCells === 0,
    `${r.walkCutCells} squares a crawler could stand on were cut out of the`
    + ' picture, which must never happen');
  assert(r.part === 0 && r.partWalk === 0,
    `${r.part} shapes were drawn at less than full strength`
    + ` (${r.partWalk} of them ground a crawler could stand on)`);
  assert(r.zeroBad === 0,
    `${r.zeroBad} things were left out of the picture that were not rock being`
    + ' cut out of the way');
  /* The guard, and the trade it makes, on the pictures that have a hidden square
     in them at all. With a foot of rock left standing in every hidden square, the
     block in front IS painted, so nothing is ever cut away behind nothing: no
     wall has to be brought back (`kept`) and none is left as a hole (`lost`).
     This is a change from v0.37.0, where a hidden square painted nothing and the
     walls beside it came back whole -- and the arm that proves the guard is still
     live is the foot switched off, further down. */
  assert(r.wallsOn < r.wallsOff,
    `the clip painted ${r.wallsOn} wall faces and ${r.wallsOff} with it switched`
    + ' off, so it is no longer taking any of them away');
  assert(r.asks > 500 && r.askPart === 0 && r.askPartWalk === 0,
    `${r.asks} pointer asks were made and ${r.askPart} of them left something`
    + ` drawn see-through (${r.askPartWalk} of it ground)`);
  /* Is `render.cut_solid` connected to anything? Read BOTH ways off the world
     the small battery left behind, so the only thing that differs between the
     two readings is the knob. */
  assert(r.dialCut === 0 && r.dialPart === 0,
    `${r.dialCut} shapes were cut away with cut_solid turned up to 1, so the dial`
    + ' in the spreadsheet is not connected to the cutaway');
  assert(r.offCut + r.offStumps > 0 && r.offPart === 0 && r.offBad === 0,
    'with the rock in the way switched off (cut_solid 0) nothing was left out of'
    + ` the picture at all (${r.offCut} squares cut away, ${r.offStumps} keeping`
    + ` a foot of rock), so the dial in the spreadsheet is not connected to the`
    + ' cutaway');
  /* And the whole of the top of this test again, on the dial's own 0 -- where
     leaving rock out is what SHOULD happen and the counters can therefore fail.
     This is the battery that keeps `cut`, `stumps`, `kept` and `lost` honest now
     that the shipped look leaves nothing out and they read zero by arithmetic. */
  assert(r.small.cases === 8 && r.small.worlds > 6,
    `${r.small.cases} pictures were looked at with the dial turned down and they`
    + ` reached ${r.small.worlds} different ones`);
  assert(r.small.cut + r.small.stumps > 0 && r.small.cutCells > 0,
    `with cut_solid at 0 the picture still left nothing out (${r.small.cut}`
    + ` squares cut away, ${r.small.stumps} keeping a foot of rock,`
    + ` ${r.small.cutCells} cut-away squares in the batch), so the counters this`
    + ' test is about are measuring nothing');
  assert(r.small.kept === 0 && r.small.lost === 0,
    `${r.small.kept} walls were brought back behind a cut block and`
    + ` ${r.small.lost} were left as a hole, with the foot of rock standing in`
    + ' every hidden square the picture left out');
  assert(r.small.built === r.small.painted + r.small.cut,
    `${r.small.built} shapes were built but ${r.small.painted} painted and`
    + ` ${r.small.cut} cut away, with the dial turned down`);
  assert(r.small.part === 0 && r.small.zeroBad === 0,
    `${r.small.part} shapes were drawn at less than full strength and`
    + ` ${r.small.zeroBad} things were left out that were not rock being cut out`
    + ' of the way, with the dial turned down');
  assert(r.small.walkCutCells === 0,
    `${r.small.walkCutCells} squares a crawler could stand on were cut out of a`
    + ' picture with the dial turned down, which must never happen');
  /* And the other half of the same mechanism: with the foot of rock switched
     off the square is left out of the picture whole instead, which is the look
     v0.37.0 shipped and the negative control this one is proved against. */
  assert(r.backStump === r.wasStump,
    `cut_stump_m came back as ${r.backStump} where the sheet has ${r.wasStump}`);
  assert(r.bare.cut > 0 && r.bare.stumps === 0 && r.bare.zeroBad === 0,
    `${r.bare.cut} squares were left out of the picture whole and ${r.bare.stumps}`
    + ` kept a foot of rock with cut_stump_m at 0 (${r.bare.zeroBad} of them were`
    + ' not rock being cut out of the way), so the foot of rock in the sheet is'
    + ' not connected to the picture');
  assert(r.bare.lost === 0,
    `${r.bare.lost} wall faces stayed cut away behind a square that is painted`
    + ' not at all, with the foot of rock switched off -- that is the hole this'
    + ' look exists to close, and it is open');
});

/* ---- putting the wall faces away -----------------------------------------
 *
 * A rock column's side faces are painted from the top of the block down to the
 * floor of the world, and most of that is inside the block standing next to it.
 * v0.18.0 leaves that part out: a face only drops as far as the block in front
 * of it reaches, and a face that is buried entirely is not painted at all.
 *
 * The pixels are the assertion, not the shape list. Two rectangles that share
 * an edge always disagree in the last pixel along that edge -- the shape on top
 * covers it only part way -- so the picture CANNOT be byte for byte identical,
 * and a test claiming that would be a lie that passes by luck on one seed. What
 * is asserted instead is where the difference is allowed to be and how big:
 * thousands of pixels may shift by a shade or two at soft edges, and NOTHING
 * may move as much as a surface would if it were missing. Removing the
 * see-through guard fails all three of these, measured at 14% of the picture
 * and 184/255, so the bounds below are load-bearing rather than decorative. */
/* How MANY wall faces the clip takes away is a different claim, and it is a
 * claim about the five cameras together rather than each one alone.
 *
 * The bounds that used to be here -- each camera down to under half of its own
 * faces and its own pixels -- were a proxy for "the clip is doing its job",
 * measured when every wall face was opaque and every block was painted to its
 * own height. v0.42.0's look settled that: a block is painted from the top of
 * its rock down, so whether the block in front reaches past the face it hides
 * is a fact about the camera, not about the clip. On seed 3, standing in open
 * floor, there is no buried wall at all and the two frames are the same
 * picture; on seed 777 only 25 of 406 faces are buried. A bound per camera
 * cannot tell "the clip has nothing to do here" from "the clip stopped
 * working", so the claims are split in two:
 *
 *  - per camera, the ones about the SHAPE of it, which hold everywhere: nothing
 *    is counted buried with the clip switched off, the clip never paints MORE
 *    than the full picture, and no face is left cut away behind a block that
 *    was not painted;
 *  - across the five cameras, the ones with teeth: the clip must bury over 500
 *    faces, and must leave the painted pixels at under half of what the full
 *    picture covered. Three of the five cameras are then held to a floor of
 *    their own, so that turning the clip off for the cameras that carry the
 *    claim cannot pass on the quiet ones.
 *
 * Measured on v0.43.0, one camera per state, the two frames A/B-ed inside one
 * page, buffer 624x368 -- and that is the look in which the rock in the way was
 * CUT AWAY, which is what shipped up to v0.43.0:
 *
 *   seed      faces off -> on      pixels off -> on               buried
 *      1       790 -> 511 (65%)    3,982,336 -> 1,356,800          279
 *      2       674 -> 322 (48%)    1,210,368 ->   613,376          352
 *      3       336 -> 336 (100%)     614,400 ->   614,400            0
 *      7       682 -> 356 (52%)    2,539,520 ->   898,048          326
 *    777       406 -> 381 (94%)    1,136,640 ->   801,792           25
 *    all     2,888 -> 1,906 (66%)  9,482,624 -> 4,284,416 (45.2%)   982
 *
 * THE CLIP IS ABOUT A DIFFERENT-LOOKING PICTURE SINCE v0.44.0, and the same
 * instrument with the dial both ways inside one build (`files/probe-cutclip.mjs`,
 * the suite's own nine cases, page 1160x780) says the clip has MORE to do, not
 * less -- the rock drawn solid is rock that can stand in front of other rock:
 *
 *   rock in the way cut away   5,690 -> 3,686 faces (64.8%),
 *                             24,108,032 -> 8,939,520 px (37.1%), 2,004 buried
 *   rock in the way solid      5,876 -> 3,820 faces (65.0%),
 *                             26,917,888 -> 9,287,680 px (34.5%), 2,056 buried
 *
 * So the bounds below are the ones they always were and they hold on both looks
 * with room to spare (under half the pixels, under three quarters of the faces,
 * over 500 faces buried, over 200 buried on each of the three cameras that carry
 * the claim). Seed 3 is the open-floor camera on both looks: 0 faces buried.
 *
 * The floor of 200 per camera is well under the three measured numbers rather
 * than on top of them: this test runs in the same page as eighty-six other
 * tests, and a count read there is a few percent off the count read on a fresh
 * page (seed 1 came out 490 in a full run against 511 here, with the clip-off
 * count 790 in both), so a bound on the exact number would be a bound on the
 * order the tests ran in. */
await test('a wall buried in the rock next door is not painted (seeds 1, 2, 3, 7, 777)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, out = [];
    t.pause();
    for (const seed of [1, 2, 3, 7, 777]) {
      t.seed(seed);
      t.clipWalls(false); t.repaint();
      const off = t.consumed();
      const was = { walls: off.walls, px: off.wallPx, buried: off.buried };
      t.clipWalls(true); t.repaint();
      const on = t.consumed();
      out.push({ seed, was, walls: on.walls, px: on.wallPx, buried: on.buried,
                 kept: on.kept, lost: on.lost });
    }
    return out;
  });
  const all = { wallsOff: 0, wallsOn: 0, pxOff: 0, pxOn: 0, buried: 0 };
  for (const q of r) {
    assert(q.was.buried === 0,
      `seed ${q.seed}: ${q.was.buried} walls counted as buried with the clip switched off`);
    assert(q.was.walls > 0 && q.was.px > 0,
      `seed ${q.seed}: the full picture has ${q.was.walls} wall faces and ${q.was.px} pixels`
      + ' of them in it, so there is nothing here for the clip to be measured against');
    assert(q.walls <= q.was.walls && q.px <= q.was.px,
      `seed ${q.seed}: the clip painted ${q.walls} wall faces and ${q.px} pixels where the`
      + ` full picture paints ${q.was.walls} and ${q.was.px} -- it is painting MORE than`
      + ' there is, so these two frames are not the same world');
    assert(q.kept === 0 && q.lost === 0,
      `seed ${q.seed}: ${q.lost} wall faces stayed cut away behind a block the clip did not`
      + ` paint and ${q.kept} were cut away and then kept, so hiding a block left a hole`
      + ' in the wall beside it (that is what the block-cut-away test is about)');
    all.wallsOff += q.was.walls; all.wallsOn += q.walls;
    all.pxOff += q.was.px; all.pxOn += q.px; all.buried += q.buried;
  }
  assert(all.buried > 500,
    `across the five cameras only ${all.buried} wall faces were found buried in the rock`
    + ' next door (982 are buried on v0.43.0), so the clip is hiding almost nothing');
  assert(all.pxOn < all.pxOff * 0.5,
    `across the five cameras the clip left ${all.pxOn} of the ${all.pxOff} pixels the full`
    + ` picture covered (${(100 * all.pxOn / all.pxOff).toFixed(1)}%, where 45.2% is what`
    + ' v0.43.0 measures), so it is not taking the buried walls away');
  assert(all.wallsOn < all.wallsOff * 0.75,
    `across the five cameras the clip left ${all.wallsOn} of the ${all.wallsOff} wall faces`
    + ` the full picture painted (${(100 * all.wallsOn / all.wallsOff).toFixed(1)}%, where`
    + ' 66% is what v0.43.0 measures), so it is not taking the buried walls away');
  /* And the three cameras that stand among buried walls must carry the claim:
     a clip that only worked where there was nothing to do would otherwise pass
     everything above. Seeds 3 and 777 are left out on purpose -- measured at 0
     and 25 buried faces, they are cameras where the blocks in front are open
     floor and the clip has little or nothing to cut. */
  for (const seed of [1, 2, 7]) {
    const q = r.find((x) => x.seed === seed);
    assert(q.buried > 200,
      `seed ${seed}: only ${q.buried} wall faces were found buried in the rock next door`
      + ' (279, 352 and 326 are what the three cameras around buried walls measure), so'
      + ' this camera is not one of the ones carrying the claim');
  }
});

await test('the same frame painted twice is the same picture, pixel for pixel', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, out = [];
    t.pause();
    for (const seed of [1, 2, 3, 7, 777]) {
      t.seed(seed);
      for (const clip of [false, true]) {
        t.clipWalls(clip); t.repaint(); t.repaint();
        t.keep();
        t.repaint();
        const d = t.diff();
        out.push({ seed, clip, differ: d.differ, worst: d.worst, x: d.x, y: d.y });
      }
    }
    t.clipWalls(true);
    return out;
  });
  for (const q of r) {
    assert(q.differ === 0,
      `seed ${q.seed} with the clip ${q.clip ? 'on' : 'off'}: ${q.differ} pixels moved `
      + `on a repaint that changed nothing (worst ${q.worst} at ${q.x},${q.y})`);
  }
});

/* The clip takes the walls of the blocks that stand inside the rock away, and
 * it is only allowed to move a hairline. That claim used to be asserted with a
 * bound on HOW MANY pixels moved -- 6% of the picture -- which was a proxy for
 * it, measured when every wall face was opaque. As of v0.36.0 the top metre of
 * a wall fades out, so a buried wall is VISIBLE THROUGH the face standing in
 * front of it, and hiding it now moves a shade on a twentieth of the picture
 * while nothing moves that a person could see. So what is asserted is the claim
 * itself: the clip opens no window, paints nothing it was not already painting,
 * and what does move, moves by a hair.
 *
 * WHAT A HOLE IS, and this took a while to get right. It is a pixel still
 * showing the backdrop with the world all round it, so the flood out from the
 * border cannot reach it -- the definition `files/mark-holes.mjs` counted the
 * black notches with (2,950 bare pixels before the fix, 211 after), so the test
 * and the instrument that found the fault count the same thing. The colour is
 * the game's own backdrop and the match is exact, because the wall look fades
 * the top of a wall THROUGH the backdrop and a fade is a blend, so a faded face
 * never lands exactly on the colour it is fading towards.
 *
 *  1. THE LOOK THAT SHIPS. All nine cases, and the hole census runs on every
 *     one of them.
 *  2. THE PROMISE THE CLIP WAS MADE UNDER (`wallFade(0)`, every face opaque),
 *     same nine cases, held to the bounds it has always been held to: under 6%
 *     of the picture moved, no surface moved. This is the control, and it can
 *     fail -- it does fail with the fade left on.
 *  3. THE CENSUS ITSELF IS ALIVE, three times over. Every case asks the census
 *     about its own frame with a 20x20 square of backdrop painted into the
 *     middle of it (400 pixels, and every one of them has bare backdrop all
 *     round it in a 3x3 square), and it has to find both; the shape census has
 *     to ask a few thousand pixels and to have asked every case that moved one
 *     deeply (lesson 27); and the shape census is run once more on a camera of
 *     its own with the view turned a quarter, where it MUST find differences --
 *     a turned view shows a different thing, so a census that cannot see that
 *     cannot be trusted to say nothing moved (lesson 19). It used to be the
 *     PICKER that was asked what was under a pixel, on the theory that
 *     `pickAt()` answers -1 where nothing was painted -- and over six cameras, 0
 *     of 14,352 samples of the frame answer -1 at all (`files/probe-sky.mjs`):
 *     the world covers the whole picture now, so that census could never have
 *     failed and guarded nothing.
 *  4. WHAT IS ON TOP OF THE PIXELS THAT MOVED, which as of v0.49.0 is the real
 *     claim and the one the two bounds below are only a proxy for. `pickAt()`
 *     answers with the SHAPE under a pixel, so asking it on both arms at a pixel
 *     the clip moved deeply and getting the same answer means that pixel still
 *     shows the same thing: the wall did not move and nothing was lost, the
 *     difference is that a dissolving band no longer covers it. See the light
 *     note below for why the bounds could not carry this alone any more.
 *
 * WHAT COUNTS AS A WINDOW, and why the counting had to get more careful. The
 * leftover bare backdrop is NOT all one-pixel hairlines, which is what this test
 * first assumed: measuring it three ways at once (`files/probe-holekinds.mjs`)
 * finds patches containing a 2x2 block of bare backdrop (76 pixels at seed 1,
 * 317 at seed 7) and, in a fresh world at seed 7, one patch 3 pixels across.
 * Counting the leftovers 8-connected as well as 4-connected does not reduce the
 * count, so they are not diagonal chains leaking anywhere -- they end against
 * paint. So the criterion is no longer "how big is the biggest patch" with a
 * guessed bound on it: a patch is called a WINDOW only if it holds a 3x3 square
 * of bare backdrop, i.e. if there is something to look through. A one- or
 * two-pixel gap between two faces has nothing to see through, and the claim this
 * test makes is that after the cut there is no window anywhere.
 *
 * WHY THE WORLD IS GIVEN 2,000 FRAMES FIRST. Some of the leftover is ground
 * that has not been fetched yet: the same camera at seed 1 has 142 bare pixels
 * in a fresh world, 142 through 480 frames, then 65 from about 2,000 frames on,
 * and 0 in any patch 2 pixels thick (`files/probe-seamframes.mjs`). Seed 7 goes
 * 517 -> 394. A person plays in the settled world, so the settled world is what
 * is tested, and reaching it costs almost nothing: `frame(2000)` takes 40
 * seconds per camera because it PAINTS 2,000 frames, whereas stepping the game
 * 2,000 times and then fetching the ground in four fat passes takes about a
 * tenth of a second and comes out pixel for pixel identical
 * (`files/probe-settlefast.mjs`). That is `t.advance()`.
 *
 * AND THE PART THAT IS NOT MINE: the remainder is inherited clip geometry, not
 * anything this version did. The SAME eleven cameras measured on the build
 * before this one and on this one give identical numbers, control values and
 * all (`files/probe-seams.mjs`), and the leftovers are thin, near-black, and in
 * places already dark (the brightest thing the cut removes is 13/255 to 73/255
 * across those cameras, and on settled worlds 0 to 14 pixels per camera sit
 * beside paint more than 40/255 apart, worst gap 93). The change this version
 * made is measured elsewhere: 2,730 bare pixels gone across a 48-view swept,
 * tilted, dragged sweep (`files/hole-diff.mjs`), and the notches at the wall
 * corners -- 248 pixels in the view they kept pointing at, biggest notch 124 --
 * down to nothing.
 *
 * WHY THE BOUNDS PAID OUT IN v0.49.0, and what replaced the lost margin. The
 * light arrived, and the top metre of a wall is now a RAMP between the wall's
 * own shade and the ground behind it rather than two flat shades, so every
 * pixel in that band that changes its mind about which of the two it is changes
 * it by much more than 8/255. The deep count went 3,737 (1.6%) to 9,155 (3.99%)
 * on one camera, and the bound -- 3.5% -- started failing on a picture that
 * shows exactly what it should. Two probes said which way to move rather than
 * letting a bound be widened on a hunch (`files/probe-4.mjs`, `files/probe-5.mjs`):
 * over all nine cameras, 81,057 pixels moved, 14,988 of them deeply, worst 84,
 * and of the 10,411 deep pixels asked both ways **all 10,411 still show the same
 * shape, 0 show a different one and 0 show nothing**. So the count was widened
 * to where the mechanism says it should be -- and THE COUNT IS NO LONGER THE
 * CLAIM. What is asserted, per case, is that not one deeply-moved pixel shows a
 * different thing on top; the percentage is a smoke alarm under it (lesson 15:
 * presence and confinement are different claims).
 *
 * WHERE THE EXTRA COMES FROM, exactly. `paintSide()` refuses to fade a face cut
 * to no taller than `wallFadeM` (1 m): `fadeDepth` returns 0 and the face is
 * painted WHOLE and opaque, where the other arm dissolves its top metre. So a
 * band of pixels legitimately shows ground and rock behind in one arm and the
 * wall's ghost in the other -- a SEE-THROUGH difference on ground that is still
 * there, not a moved surface. Measured on the failing camera (seed 1, quarter
 * 3): the clip's own arm paints 462 banded faces and **12 whole** (12,288 square
 * pixels of opaque stub), where the unclipped arm paints 736 and none whole; and
 * `altGrid` -- the whole-metre stop grid added while hunting this -- changes no
 * pixel at all on any of the nine cameras, so it is not what the difference is.
 *
 * Measured across all nine cases, settled worlds, buffer 624x368, both arms
 * A/B-ed inside one build. SHIPPED (clip off -> on): bare backdrop 65, 0, 0,
 * 394, 0, 80, 55, 118, 25 pixels, biggest patch 11, 0, 0, 19, 0, 13, 6, 12, 1 --
 * and NOT ONE pixel of it in a patch 3 pixels across; 476 to 17,766 pixels moved
 * (0.2% to 7.7% of the picture), at most 9,155 of them (3.99%) by more than
 * 8/255, worst single pixel 84/255 -- and every one of those deep pixels, where
 * it was asked, showing the same shape it showed before. Wall faces painted
 * 790->511, 674->322, 336->336, 682->356, 406->381, 722->457, 714->443,
 * 1542->1145, 412->200: never more than the full picture paints, and at seed 3
 * exactly the same, because that camera stands in open floor with no block in
 * front of anything to cut against. WITH EVERY FACE OPAQUE (the control):
 * 45,368 pixels moved in all, 2,305 of them deeply, worst 23/255, and the clip
 * still cutting wall faces in all nine cases (790->485, 674->295, 336->301,
 * 682->353, 406->357, 722->449, 714->441, 1542->1114, 412->194 -- at seed 3, 35
 * faces, where the picture does not move at all because what is taken away is
 * exactly what the block in front covers). */
await test('cutting the buried walls opens no hole and moves a hairline only', async () => {
  const cases = [{ seed: 1 }, { seed: 2 }, { seed: 3 }, { seed: 7 }, { seed: 777 },
                 { seed: 1, quarter: 1 }, { seed: 1, quarter: 3 },
                 { seed: 1, zoom: 1 }, { seed: 1, zoom: 3 }];
  const r = await page.evaluate((cases) => {
    const t = window.__test, out = [];
    t.pause();
    t.unpoint();
    /* THE ROCK SKIN IS PINNED OFF FOR THIS TEST (v0.47.0), and this is one of
       only two tests that needs it. Its subject is the CUT, and every number
       below was taken on the picture as it stood before the skin existed -- a
       picture in which a pixel of bare backdrop could only ever be a hole. The
       shipped look opens black on purpose ("one tile of wall, black behind it"),
       so "no enclosed bare backdrop" has stopped being a claim about this look
       at all and is now a claim about the cut, which is what is measured here.
       The skin's own black is measured against what it took away, by `only the
       rock that touches open space is painted (v0.47.0)`. */
    const wasSkin = t.wallSkin();
    t.wallSkin(false);
    /* AND THE ROCK-SIDE RULE IS PINNED BACK TOO (v0.48.0), one version on and
       for the same reason. Since v0.48.0 a side with rock in front of it is not
       painted at all, and a bare-backdrop census on THAT look is counting the
       x-ray itself: the black behind a wall, which the person asked for, arrives
       in patches far too big to be called seams (up to 75 pixels across here,
       where the bound below is 48). The subject of this test is the cut -- a face
       cut against the neighbour in front of it -- and at the shipped rule there
       is no such face left to cut. So the look these numbers were taken on is
       stated rather than assumed: `rockSides(0)` is v0.47.0's rule, the whole
       stored side painted, which is the picture every bound below comes from
       (lesson 21 -- never say "this only adds", state the arm the change is
       side. `rockSides(0)` is v0.47.0's rule, the whole stored side painted, which
       is the picture every number above was taken on. The shipped rule has its own
       census, `only the sides of a wall facing open ground are shown (v0.48.0)`. */
    const wasSides = t.rockSides();
    t.rockSides(0);
    const wasZoom = t.buffer().zoom;
    /* AND THE WALL SMOOTHING IS PINNED OFF WITH THEM (v0.51.0), the third pin and
       for the third time the same reason. Since v0.51.0 the light is carried
       ACROSS a wall face, so a face's whole colour is decided by the squares at
       the two ends of its run -- and taking a wall away changes which faces are
       corrected at all and repaints faces that are still standing. Measured on
       this test's own nine cameras: 0.2% to 7.7% of the picture moves with the
       smoothing off, and 34.7% on seed 1 with it on, which is a number about the
       smoothing and not about the cut. The subject here is the CUT, and every
       bound below was taken on the picture as it stood before there was a
       smoothing. The smoothing's own claim is its own test. */
    const wasAcross = t.acrossLight();
    t.acrossLight(false);
    /* The BUFFER, never the page: pickAt() answers in buffer pixels, so a census
       read off the scaled page would ask about the wrong squares at zoom 3. And
       read LIVE, never kept -- `t.zoom()` resizes the buffer, so a width taken
       once before the cases is the width of whichever case happened to come
       first, and the census would then read a rectangle the frame never painted
       (it came out 69,140 pixels where diff() saw 30,078). */
    const grab = () => Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
    const wasFade = t.cfg.wallFadeM;
    /* Which pixels the clip moved, and WHAT A HOLE IS -- and a hole is the only
       definition this version was ever about: a pixel still showing the backdrop
       with the world all round it, so the flood out from the border cannot reach
       it. That is the definition `files/mark-holes.mjs` counted the black notches
       with (2,950 bare pixels before the fix, 211 after), so the test and the
       instrument that found the fault are counting the same thing.
       The colour is the game's own backdrop (`40-render.js` line 24, and the
       first thing `draw()` paints) read out of the running page rather than
       written down twice: exact equality is what makes this a test of "nothing
       was painted here", because the wall look fades the top of a wall through
       the backdrop, and a fade is a blend, so a faded face never lands exactly
       on the colour it is fading towards.
       The picker CANNOT be the detector any more, and that is measured rather
       than assumed: over six cameras, 0 of 14,352 samples of the frame come back
       "nothing painted" (`files/probe-sky.mjs`). The world covers the whole
       picture now, so `pickAt() < 0` is unreachable and the census that used to
       be built on it could never fail -- it was a sentence about a detector that
       cannot count. So the detector is asked instead to find a square of the
       backdrop painted into the middle of the frame, and must. */
    const BACK = [parseInt(BACKDROP.slice(1, 3), 16),
                  parseInt(BACKDROP.slice(3, 5), 16),
                  parseInt(BACKDROP.slice(5, 7), 16)];
    const hole = function (px, w, h, back) {
      const isVoid = new Uint8Array(w * h);
      for (let i = 0, k = 0; i < w * h; i++, k += 4) {
        if (px[k] === back[0] && px[k + 1] === back[1] && px[k + 2] === back[2]) isVoid[i] = 1;
      }
      const seen = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) {
        for (const y of [0, h - 1]) {
          const i = y * w + x;
          if (isVoid[i] && !seen[i]) { seen[i] = 1; stack.push(i); }
        }
      }
      for (let y = 0; y < h; y++) {
        for (const x of [0, w - 1]) {
          const i = y * w + x;
          if (isVoid[i] && !seen[i]) { seen[i] = 1; stack.push(i); }
        }
      }
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i / w) | 0;
        if (x > 0 && isVoid[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < w - 1 && isVoid[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (y > 0 && isVoid[i - w] && !seen[i - w]) { seen[i - w] = 1; stack.push(i - w); }
        if (y < h - 1 && isVoid[i + w] && !seen[i + w]) { seen[i + w] = 1; stack.push(i + w); }
      }
      let n = 0, biggest = 0;
      /* The patches are counted separately: a hole worth the name is a PATCH,
         and the size of the biggest one is the number this version was about
         (the notch they kept pointing at was 124 pixels). */
      const mark = new Uint8Array(w * h);
      /* And a patch is only called a WINDOW if it is 3 pixels across somewhere:
         a bare pixel may only count as a hole you could look through if it has
         bare pixels all round it in a 3x3 square. A one- or two-pixel seam
         between two faces of rock cannot pass that, and one cannot be seen
         through at all -- see the census note above. */
      const in3 = function (x, y) {
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
            if (!isVoid[ny * w + nx]) return false;
          }
        }
        return true;
      };
      let thick = 0, worstThick = 0;
      for (let i = 0; i < w * h; i++) {
        if (!isVoid[i] || seen[i] || mark[i]) continue;
        let size = 0, wide = false;
        const q = [i];
        mark[i] = 1;
        while (q.length) {
          const j = q.pop(); size++;
          const x = j % w, y = (j / w) | 0;
          if (!wide && in3(x, y)) wide = true;
          if (x > 0 && isVoid[j - 1] && !seen[j - 1] && !mark[j - 1]) { mark[j - 1] = 1; q.push(j - 1); }
          if (x < w - 1 && isVoid[j + 1] && !seen[j + 1] && !mark[j + 1]) { mark[j + 1] = 1; q.push(j + 1); }
          if (y > 0 && isVoid[j - w] && !seen[j - w] && !mark[j - w]) { mark[j - w] = 1; q.push(j - w); }
          if (y < h - 1 && isVoid[j + w] && !seen[j + w] && !mark[j + w]) { mark[j + w] = 1; q.push(j + w); }
        }
        n += size;
        if (size > biggest) biggest = size;
        if (wide) { thick += size; if (size > worstThick) worstThick = size; }
      }
      return { count: n, biggest: biggest, thick: thick, worstThick: worstThick };
    };
    const census = function (offPx, onPx) {
      const w = Render.w, h = Render.h;
      const moved = [];
      /* THE PIXELS THAT MOVED BY MORE THAN 8/255 ARE KEPT, not just counted.
         `diff()` counts them too (its NOTICEABLE is 8), but a count cannot say
         WHERE the difference is or WHAT changed; the list can be asked, and the
         census below asks it. */
      const deep = [];
      for (let y = 0, k = 0; y < h; y++) {
        for (let x = 0; x < w; x++, k += 4) {
          const dr = Math.abs(offPx[k] - onPx[k]);
          const dg = Math.abs(offPx[k + 1] - onPx[k + 1]);
          const db = Math.abs(offPx[k + 2] - onPx[k + 2]);
          const d = Math.max(dr, dg, db);
          if (!d) continue;
          moved.push(y * w + x);
          if (d > 8) deep.push(y * w + x);
        }
      }
      const back = BACK;
      const offHoles = hole(offPx, w, h, back);
      const onHoles = hole(onPx, w, h, back);
      /* The control: the same frame with a 20x20 square of backdrop painted into
         the middle of it, which the flood cannot reach and the census must find
         -- all 400 pixels of it, and all 400 of them 3 pixels across, so the
         census proves it can see both what it counts and what it calls a
         window. */
      const punched = Uint8ClampedArray.from(onPx);
      const cx = (w / 2) | 0, cy = (h / 2) | 0;
      for (let y = cy; y < cy + 20; y++) {
        for (let x = cx; x < cx + 20; x++) {
          const k = (y * w + x) * 4;
          punched[k] = back[0]; punched[k + 1] = back[1]; punched[k + 2] = back[2];
        }
      }
      const ctl = hole(punched, w, h, back);
      return { moved: moved.length, deep: deep, deepN: deep.length,
               holesOff: offHoles.count, holesOn: onHoles.count,
               bigOff: offHoles.biggest, bigOn: onHoles.biggest,
               thickOff: offHoles.thick, thickOn: onHoles.thick,
               worstThickOn: onHoles.worstThick,
               control: ctl.count, controlThick: ctl.thick, back: back.join(',') };
    };
    /* DOES THE PICTURE STILL SHOW THE SAME THING, where the clip moved a pixel
       by more than 8/255?
     *
     * This is the claim the bounds below are standing in for, and until v0.49.0
     * they were standing in for it alone. "Few pixels moved deeply" is a proxy
     * for "no surface moved", and the proxy broke the moment the light arrived:
     * moving a wall's top metre moves a LOT of pixels by a lot when the ground
     * behind it and the ghost of the wall differ by the whole light ramp, so the
     * bound started failing on a picture that shows exactly what it should. A
     * count cannot tell a moved surface from a band that now lets ground show
     * through, and the pointer can: `pickAt()` answers with WHAT IS ON TOP of a
     * pixel, so asking it on both arms at the same pixel and getting the same
     * answer is that pixel still showing the same thing.
     *
     * THE LIST IS SAMPLED, NOT TRUNCATED, when it is long. At the failing case
     * there are 9,155 deep pixels and the cap is 8,000, so every second one is
     * asked -- 4,578 of them, spread over the whole set rather than the first
     * 8,000 of it. `stride` and `asked` go back to the assertions so the test can
     * say how much of the list it looked at and fail if a case asks nothing.
     *
     * `turn` is for the census's OWN control: the same list asked again with the
     * view turned a quarter, which is a picture that really does show something
     * else. The control has to find a difference, or the census is a ruler that
     * cannot fail (lesson 19). The camera is turned back afterwards. */
    const SHAPE_CAP = 8000;
    const sameShape = function (deepList, turn) {
      const w = Render.w, h = Render.h;
      const stride = deepList.length > SHAPE_CAP
        ? Math.ceil(deepList.length / SHAPE_CAP) : 1;
      const list = [];
      for (let k = 0; k < deepList.length; k += stride) list.push(deepList[k]);
      const r = new Int32Array(w * h).fill(-2);
      /* `alphas()` is rebuilt for the batch on every call, and this asks
         thousands of times without the batch changing, so it is memoised on the
         batch it was given. Nothing else here is cached: the picture, the batch
         and the answers are all the renderer's own. */
      const alphas = Render.alphas;
      let memoB = null, memoP = null;
      Render.alphas = function (s, b) {
        if (b === memoB) return memoP;
        memoB = b; memoP = alphas.call(this, s, b);
        return memoP;
      };
      const walk = function () {
        for (let k = 0; k < list.length; k++) {
          const p = list[k];
          r[p] = Render.pickAt(Game.state, p % w, (p / w) | 0);
        }
      };
      /* Arm 1 is the look that ships -- the same arm the bound above is about. */
      t.clipWalls(true); t.repaint(); walk();
      const on = Int32Array.from(r);
      t.clipWalls(false); t.repaint(); walk();
      /* The control asks the SAME look twice and only turns the view between,
         so the turn is the only thing that differs. */
      if (turn) {
        t.rotate(turn); t.clipWalls(true); t.repaint(); walk();
        t.rotate(-turn);
      }
      Render.alphas = alphas;
      let same = 0, other = 0;
      const first = [];
      for (let k = 0; k < list.length; k++) {
        const p = list[k];
        if (on[p] === r[p]) same++;
        else {
          other++;
          if (first.length < 4) first.push((p % w) + ',' + ((p / w) | 0));
        }
      }
      return { deep: deepList.length, asked: list.length, stride: stride,
               same: same, other: other, first: first };
    };
    /* How long the world is given before it is looked at. `advance` costs about
       a tenth of a second per camera, so this is affordable; see its comment. */
    const GROWN = 2000;
    for (const c of cases) {
      t.seed(c.seed);
      /* THE WORLD IS GIVEN A WHILE FIRST, because that is the world a crawler
         spends its time in -- and because the first seconds of a fresh world are
         a world whose ground has not been fetched yet: the very same camera at
         seed 7 has 517 bare pixels in a fresh world and 394 once the ground is
         there, and one patch 3 pixels across that is not there afterwards. Those
         early pixels are the ground still arriving, not the cut. */
      t.advance(GROWN);
      if (c.quarter) t.rotate(c.quarter);
      if (c.zoom) t.zoom(c.zoom);
      /* ARM 1: the look that ships. The picture with the clip off is KEPT, or
         diff() reports the distance from whatever the last test left behind --
         which is how this test silently measured nothing once. */
      t.clipWalls(false); t.repaint();
      const off = t.consumed();
      const offPx = grab();
      t.keep();
      t.clipWalls(true); t.repaint();
      const d = t.diff();
      const on = t.consumed();
      const onPx = grab();
      const cens = census(offPx, onPx);
      /* And the same picture asked rather than counted: what is on top of each
         pixel that moved deeply, on both arms. */
      const shape = sameShape(cens.deep, 0);
      /* ARM 2: the promise the clip was made under -- every face opaque. The
         WORK is read out of this arm as well as the picture, because with the
         fade off the two pictures are allowed to come out identical: where the
         block in front covers exactly what the cut took away, the cut is
         invisible, and that is the best outcome rather than a failure -- so
         "nothing moved" would be a guard on the wrong thing. See the guard
         below. */
      t.wallFade(0);
      t.clipWalls(false); t.repaint();
      const fOff = t.consumed();
      const workOff = { walls: fOff.walls, px: fOff.wallPx };
      t.keep();
      t.clipWalls(true); t.repaint();
      const f = t.diff();
      const fOn = t.consumed();
      const workOn = { walls: fOn.walls, px: fOn.wallPx };
      t.wallFade(wasFade);
      out.push({ c: c, pixels: d.pixels, differ: d.differ, worst: d.worst,
                 deep: d.deep, x: d.x, y: d.y, moved: cens.moved,
                 shape: shape,
                 holesOff: cens.holesOff, holesOn: cens.holesOn,
                 bigOff: cens.bigOff, bigOn: cens.bigOn,
                 thickOff: cens.thickOff, thickOn: cens.thickOn,
                 worstThickOn: cens.worstThickOn,
                 control: cens.control, controlThick: cens.controlThick,
                 backNow: cens.back,
                 walls: [off.walls, on.walls], px: [off.wallPx, on.wallPx],
                 flatWork: { off: workOff, on: workOn },
                 flat: { pixels: f.pixels, differ: f.differ, deep: f.deep,
                         worst: f.worst, x: f.x, y: f.y } });
    }
    t.zoom(wasZoom);
    /* THE CENSUS'S OWN CONTROL, on a camera of its own: the same list of deep
       pixels, asked on the arm that ships and then again with the view turned a
       quarter. The turned view is a picture that shows something else, so the
       census MUST find differences there -- if it does not, it is a ruler that
       cannot fail and the `other === 0` assertion above proves nothing. The turn
       is undone again before the arm is handed back. */
    t.seed(1);
    t.advance(GROWN);
    t.clipWalls(false); t.repaint();
    const ctlOff = grab();
    t.clipWalls(true); t.repaint();
    const ctlCens = census(ctlOff, grab());
    const ctl = sameShape(ctlCens.deep, 1);
    t.zoom(wasZoom);
    t.clipWalls(true);
    t.wallSkin(wasSkin);
    t.rockSides(wasSides);
    t.acrossLight(wasAcross);
    return { cases: out, shapeCtl: ctl, wasSkin: wasSkin, backSkin: t.wallSkin(),
             wasSides: wasSides, backSides: t.rockSides(),
             wasAcross: wasAcross, backAcross: t.acrossLight() };
  }, cases);
  assert(r.backSkin === r.wasSkin,
    `the rock skin came back as ${r.backSkin} where it started at ${r.wasSkin}`
    + ' -- this test pins it off, and every test after it wants the look that'
    + ' shipped');
  assert(r.backAcross === r.wasAcross,
    `the wall smoothing came back as ${r.backAcross} where it started at`
    + ` ${r.wasAcross} -- this test pins it off, and every test after it wants`
    + ' the look that ships');
  assert(r.backSides === r.wasSides && r.wasSides === 2,
    `the rock-side rule came back as ${r.backSides} where it started at`
    + ` ${r.wasSides} -- this test pins it to the old look, and every test after`
    + ' it wants the rule that ships (2)');
  for (const q of r.cases) {
    const at = `seed ${q.c.seed}${q.c.quarter ? ' turned ' + q.c.quarter : ''}`
      + `${q.c.zoom ? ' at zoom ' + q.c.zoom : ''}`;
    /* Per case: the clip may never paint MORE than the full picture -- it is
       taking wall away, not adding it, and if the two frames disagree about the
       world these numbers are not comparable at all. It is allowed to take
       NOTHING away, and on seed 3 it does take nothing (336 faces and 614,400
       pixels in both frames, and the two pictures came out identical): that
       camera stands in open floor, so there is no block in front of anything to
       cut against. So "the clip is taking wall away" is asserted once for the
       arm as a whole, after the loop, where the cameras that carry it cannot be
       averaged away by the two that have almost nothing to cut. */
    assert(q.walls[1] <= q.walls[0] && q.px[1] <= q.px[0],
      `${at}: the clip painted ${q.walls[1]} wall faces and ${q.px[1]} pixels where the`
      + ` full picture paints ${q.walls[0]} and ${q.px[0]} -- it is painting MORE than`
      + ' there is, so these two frames are not the same world');
    /* The clip may legitimately leave the picture IDENTICAL -- where the block in
       front covers exactly what was taken away, removing it is invisible, and
       that is the best outcome there is rather than a failure. So the guard is
       that it did the WORK (above), not that the picture moved. The two rulers
       must still agree: `differ` is the kept picture against the new one, and
       `moved` is the same two pictures read straight off the buffer. */
    assert(q.moved === q.differ,
      `${at}: the kept picture moved ${q.differ} pixels and the census found`
      + ` ${q.moved}, so one of the two is reading the wrong canvas`);
    /* And the list the shape census walks is the same set the ruler above
       counted -- if the two disagree, the census is answering about pixels that
       are not the ones that moved. */
    assert(q.shape.deep === q.deep,
      `${at}: the ruler found ${q.deep} pixels moved by more than 8/255 and the`
      + ` census kept a list of ${q.shape.deep}, so the shape census is asked`
      + ' about pixels that are not the ones that moved');
    /* THE HOLE, which is what the whole version was about: bare backdrop with the
       world all round it. What the cut may not do is open a WINDOW, and a window
       is a patch you could look through -- which takes at least three bare
       pixels both ways. A one- or two-pixel gap between two faces of rock is not
       one: there is nothing to see through. So the claim is that after the cut
       there is NO patch of bare backdrop 3 pixels across anywhere, and the
       control proves this census can tell the difference -- the same frame with
       a 20x20 square of backdrop painted into the middle of it comes back as
       400 pixels, all of them 3 pixels across. */
    assert(q.control >= 380 && q.controlThick >= 380,
      `${at}: a 20x20 square of backdrop painted into the middle of the picture`
      + ` came back as ${q.control} pixels of hole, ${q.controlThick} of them`);
    assert(q.thickOn === 0,
      `${at}: the cut left ${q.thickOn} pixels of bare backdrop in patches 3 pixels`
      + ` across or wider (biggest such patch ${q.worstThickOn} pixels) where the`
      + ` full picture holds ${q.thickOff} -- that is a window you could see through`);
    /* Wide on purpose, and they are a smoke alarm rather than the claim: seams
       between faces are inherited from the clip's own geometry and are in the
       build before this one with exactly these numbers (`files/probe-seams.txt`),
       so what they catch is a change that makes them much worse. The sweep in
       `files/mark-holes.mjs` is where the total is really held. Measured here
       after the world has had its 2,000 frames, buffer 624x368: 0 to 394 bare
       pixels, biggest patch 1 to 19 pixels. */
    assert(q.holesOn <= 1024 && q.bigOn <= 48,
      `${at}: the cut left ${q.holesOn} pixels of bare backdrop in seams up to`
      + ` ${q.bigOn} pixels across where the full picture's biggest was ${q.bigOff}`
      + ` (${q.holesOff} pixels) -- far more bare rock than a hairline`);
    /* Wide on purpose: with the wall's top metre dissolving, the wall behind it
       shows through, so hiding one moves a shade on a twentieth of the picture.
       These catch gross breakage; the census above is the real claim. Measured
       on settled worlds: 0.2% to 7.7% moved, up to 3.99% of the picture by more
       than 8/255 (the ramp the light puts across the fade band widened this --
       see the note above), worst single pixel 84/255. */
    assert(q.differ < q.pixels * 0.12,
      `${at}: ${q.differ} of ${q.pixels} pixels moved (${(100 * q.differ / q.pixels).toFixed(1)}%)`);
    assert(q.deep < q.pixels * 0.06,
      `${at}: ${q.deep} pixels moved by more than 8/255, which is a surface and not a soft edge`
      + ` (first at ${q.x},${q.y})`);
    assert(q.worst <= 96,
      `${at}: one pixel moved by ${q.worst}/255, which is a surface and not a soft edge`
      + ` (at ${q.x},${q.y})`);
    /* THE REAL CLAIM, and the one the two numbers above are only a proxy for:
       every pixel the clip moved deeply still shows the SAME THING on top, on
       both arms. A wall that had moved would answer with a different shape --
       or with nothing where there had been something. The count is the census's
       own, and `stride` says how much of the list it asked: where a case has
       fewer deep pixels than the cap, all of them. */
    assert(q.shape.other === 0,
      `${at}: ${q.shape.other} of the ${q.shape.asked} pixels the clip moved by`
      + ` more than 8/255 (of ${q.shape.deep}, 1 in ${q.shape.stride}) now show a`
      + ` DIFFERENT THING on top where they showed something (first at`
      + ` ${q.shape.first.join(' ')}) -- so the clip moved a surface rather than`
      + ' letting the ground behind a dissolving band show through');
    /* The control: the same nine cases with every face opaque, held to the
       bounds the clip has always been held to. It fails if the fade stops
       being what makes the difference. The guard is the WORK and not the
       picture -- with the fade off the clip is often invisible because what it
       takes away is exactly what the block in front covers, so asking the
       picture to move would fail on a case where the clip is doing its job
       perfectly. Measured here: 7 of the 9 cases move pixels, seeds 3 and 777
       do not, and the clip still cuts 35 wall faces at seed 3 with the fade off
       -- so the arm is connected, and the liveness of the whole arm is asserted
       after the loop.
       WHAT COUNTS AS WORK IS FACES *OR* PIXELS, and since v0.44.0 those two
       part company: with the rock in the way drawn solid, seed 3 keeps all 286
       of its wall faces with the fade off and still paints 227,328 fewer pixels
       of them (585,728 -> 358,400), because the clip shortens those faces
       without dropping one whole. The clip is plainly at work there, and a
       guard that asked for a face count would call the case idle and its bounds
       worthless. What may not happen is a case where NEITHER moved, and that is
       what the guard below says. */
    assert(q.flatWork.off.walls > q.flatWork.on.walls
        || q.flatWork.off.px > q.flatWork.on.px,
      `${at} with the fade off: the clip painted ${q.flatWork.on.walls} wall faces`
      + ` and ${q.flatWork.on.px} pixels where the clip off paints`
      + ` ${q.flatWork.off.walls} and ${q.flatWork.off.px}, so with every face`
      + ' opaque the clip is taking nothing away and this control is measuring'
      + ' nothing');
    assert(q.flat.differ < q.flat.pixels * 0.06,
      `${at} with the fade off: ${q.flat.differ} of ${q.flat.pixels} pixels moved`
      + ` (${(100 * q.flat.differ / q.flat.pixels).toFixed(1)}%)`);
    assert(q.flat.deep < q.flat.pixels * 0.015,
      `${at} with the fade off: ${q.flat.deep} pixels moved by more than 8/255, which is a`
      + ` surface and not a soft edge (first at ${q.flat.x},${q.flat.y})`);
    assert(q.flat.worst <= 32,
      `${at} with the fade off: one pixel moved by ${q.flat.worst}/255, which is a surface,`
      + ` not the shade an edge moves by (at ${q.flat.x},${q.flat.y})`);
  }
  /* And the arm as a whole is live: one case coming out pixel for pixel
     identical is the clip being invisible where the block in front covers what
     it took (expected, see above) -- every one of them would mean the arm is
     not connected to the picture at all.
     Measured in ONE build with the dial both ways, nine cases, clip off -> on
     (`files/probe-cutclip.mjs`), and the two looks part company on exactly one
     case:

       rock in the way CUT AWAY (v0.37.0 to v0.43.0): 5,690 -> 3,686 faces
       (64.8%), 24,108,032 -> 8,939,520 pixels (37.1%), 2,004 faces buried;
       rock in the way SOLID (what ships as of v0.44.0): 5,876 -> 3,820 faces
       (65.0%), 26,917,888 -> 9,287,680 pixels (34.5%), 2,056 faces buried.

     Eight of the nine take wall away; seed 3 is the one that does not, on
     EITHER look, because that camera stands in open floor with no block in
     front of anything to cut against (0 faces buried, the picture pixel for
     pixel identical). So the guard is `tookPx`, which is allowed to include a
     case where only the pixels moved, and the two totals underneath it, which
     say the work was done in bulk rather than case by case. */
  const tookPx = r.cases.filter((q) => q.px[0] > q.px[1]).length;
  const cutFaces = r.cases.reduce((n, q) => n + Math.max(0, q.walls[0] - q.walls[1]), 0);
  const cutPx = r.cases.reduce((n, q) => n + Math.max(0, q.px[0] - q.px[1]), 0);
  assert(tookPx >= 8 && cutFaces > 500 && cutPx > 4000000,
    `the clip took wall away in only ${tookPx} of the ${r.cases.length} cases`
    + ` (8 do, seed 3 standing in open floor having nothing to cut), ${cutFaces}`
    + ` wall faces and ${cutPx} pixels in all (2,056 faces and 17,630,208 pixels`
    + ' are what it finds with the rock in the way drawn solid), so the bounds'
    + ' above are about a clip that is not doing anything and they prove nothing');
  assert(r.cases.some((q) => q.flat.differ > 0),
    `with the fade off the clip changed not one pixel in any of the`
    + ` ${r.cases.length} cases, so the control arm is not connected to the`
    + ' picture and its bounds prove nothing');

  /* THE CENSUS IS LIVE, and the numbers say how much of it happened. Every case
     whose list is empty would pass `other === 0` without asking anything, so the
     asks are counted rather than assumed (lesson 27). Measured when the light
     arrived: 10,411 of the 14,988 deeply-moved pixels asked, and every case with
     a deep pixel among them. */
  const askedN = r.cases.reduce((n, q) => n + q.shape.asked, 0);
  const deepN = r.cases.reduce((n, q) => n + q.shape.deep, 0);
  const withDeep = r.cases.filter((q) => q.shape.deep > 0);
  const skipped = withDeep.filter((q) => q.shape.asked === 0);
  assert(askedN > 6000 && skipped.length === 0,
    `the shape census asked ${askedN} pixels out of ${deepN} that the clip moved by`
    + ` more than 8/255, and ${skipped.length} of the ${withDeep.length} cases with`
    + ' deep pixels asked none -- so it either did nothing or skipped a case');

  /* AND IT CAN FAIL. The control: one camera's list asked again with the view
     turned a quarter. A quarter turn is a different picture, so a working census
     MUST come back with differences; one that cannot is a ruler that cannot fail,
     and `other === 0` on the cases above would then be worth nothing. */
  assert(r.shapeCtl.asked > 200 && r.shapeCtl.other > 20,
    `the shape census found only ${r.shapeCtl.other} difference${r.shapeCtl.other === 1 ? '' : 's'}`
    + ` in the ${r.shapeCtl.asked} pixels it asked between two quarter turns of one`
    + ' camera -- a turned view shows a different thing, so a census that cannot'
    + ' see that cannot be trusted to say nothing moved');
});

/* THE ROCK ALONG A WALL'S FAR EDGES IS PAINTED ONLY WHERE THE CUT OPENS A GAP.
 *
 * A block paints its own two far faces as a strip of rock up each far edge, cut
 * down to the height the square behind it reaches -- and only while the square
 * behind is drawn short. Since v0.44.0 the game ships with the rock in front
 * drawn SOLID (`render.cut_solid` 1): every square its own full height, nothing
 * hidden and nothing left out, so there is no gap for a strip to fill and the
 * strip can only paint over what is already there. From v0.45.0 they are refused
 * at that setting (`Render.backBandsSolid`), and this is the proof that refusing
 * them cannot open anything -- what the strips cover is measured, not argued
 * (lesson 23).
 *
 * Four arms inside ONE build (lesson 21), a census rather than an argument, with
 * the same detector and the same 20x20 punched control as the hole census above:
 * the look that ships with the strips refused, the look that ships with them
 * painted anyway (v0.44.0, `backBandsSolid`), the cut-away with them, and the
 * cut-away without them.
 *
 * MEASURED, and the test's own case set first -- 24 views (three seeds, both
 * angles, all four quarter turns, half of them dragged), the world given 2,000
 * frames first, buffer 624x368, which is 5,511,168 pixels looked at twice:
 *
 *   shipped, strips painted (v0.44.0)  1,086 strips (1,955,840 px -- a third of
 *                                      the frame), bare 11 px, in patches 3 across
 *                                      or wider 0, biggest patch 0
 *   shipped, strips refused (v0.45.0)  0 strips, bare 11 px, in patches 3 across
 *                                      or wider 0, biggest patch 0
 *
 * -- the SAME SEE-THROUGH PIXELS, all 5,511,168 of them, in every one of the 24
 * views, while 782,936 pixels (14.2%) changed colour, in all 24 views. Every
 * pixel that moved is accounted for by a strip: the moved count is at most 31.5%
 * of the cap the strips' own area sets, on the worst view of the 24.
 *
 * ...and the same measurement over a wider sweep, files/probe-backcull.mjs, 120
 * views (three seeds, five dragged camera positions, both angles, all four
 * quarters, buffer 534x348): strips painted, bare 18 px, 15 of them in holes, in
 * 6 views, biggest hole 3; strips refused, bare 18 px, 15 in holes, in 6 views,
 * biggest 3 -- identical to the last pixel, while a sixth of the frame stopped
 * being repainted.
 *
 * ONE VIEW OF IT, in detail (files/probe-bbvis.mjs, seed 1, 534x348, 47 strips
 * covering 87,040 px): refusing them moves 32,719 of 185,832 pixels (17.6%),
 * worst single pixel 123/255, and NOT ONE PIXEL BECOMES SEE-THROUGH and not one
 * stops being see-through. What moves is a flat near-black slab (#0a0a0a to
 * #0e0f0e -- the block's own back face, which a camera looking down can never
 * legitimately see) replaced by the rock behind it at the same shade or warmer
 * (#1e1712, #261d16).
 *
 * THE CUT-AWAY IS WHERE THE STRIPS ARE WANTED, and it is the other half of the
 * proof: at `cut_solid` 0 the squares in front ARE drawn short, so the place a
 * strip fills is a place with nothing in it. Refusing them there adds 1,891
 * pixels of bare backdrop, 1,839 of them enclosed by rock, over 16 of the 24
 * views (the 120-view sweep: 969 pixels of bare added in 494 separate places, 944
 * enclosed, the worst view 82 -> 161); it turns three more views into views with
 * a window in them (1 -> 4), and grows the enclosed pixels more than half again
 * (2,134 -> 3,973). So the gate is a GATE and not a deletion, and this test
 * asserts the strips are still painted there.
 *
 * AND THAT IS WHAT MAKES THE IDENTITY MEAN ANYTHING. Without an arm where the
 * strips do something, "refusing them changes no see-through pixel" would pass
 * on a build that never painted a strip in its life (lesson 19), so both halves
 * are asserted: the control arm really paints them, the cut-away really loses
 * ground when they go, and only then does the identity say anything.
 *
 * THE CHANGE IS PAINT AND NOT COVER, and the picture really does move -- an
 * "unchanged" claim over a change that never happens is a sentence about nothing
 * (lesson 27), so `moved > 0` is asserted too. What moved is bounded by what was
 * painted: the strips go on first for each block, so a pixel can only have moved
 * if a strip was the last thing on it. The bound is twice the strips' own area,
 * with 64 pixels of slack for the antialiased seam on top (lesson 17), and where
 * a view painted no strip at all the bound is zero, exactly. It is loose by
 * three times rather than tight on purpose: a bound nobody can fall through says
 * nothing, and this one is only ever meant to catch movement where no strip was. */
await test('the rock along a wall\'s far edges is painted only where the cut opens a gap (v0.45.0)', async () => {
  const cases = [];
  for (const seed of [1, 2, 7]) {
    for (const up of [false, true]) {
      for (let q = 0; q < 4; q++) {
        cases.push({ seed: seed, up: up, quarter: q, drag: q % 2 ? [180, -140] : null });
      }
    }
  }
  const r = await page.evaluate((cases) => {
    const t = window.__test;
    t.pause();
    t.unpoint();
    /* THE ROCK SKIN IS PINNED OFF FOR THIS TEST (v0.47.0) -- the second and last
       test that needs it, for the same reason as the hole census above: what
       this test asks is whether refusing the far-edge strips moves a pixel of
       bare backdrop, and on the shipped look a bare pixel is not evidence of
       anything. The skin opens black where the rock behind a wall was, which is
       the whole point of it, so "refusing the strips opens no window" has become
       a claim about the strips rather than about the look. Its numbers were
       taken with the full-rock picture; they are taken that way again. */
    const wasSkin = t.wallSkin();
    t.wallSkin(false);
    /* AND THE ROCK-SIDE RULE IS PINNED BACK TOO (v0.48.0) -- again for the same
       reason, and here it is the strips' whole subject. A far-edge strip is only
       ever painted where a face is cut SHORT against the rock in front of it, and
       since v0.48.0 a face with rock in front of it is not painted at all, so the
       strips this test is about have nowhere to go and the two arms stop
       differing in a way the census can see (refusing them moved which pixels are
       see-through in 126,965 places, which is the x-ray, not a strip).
       `rockSides(0)` is v0.47.0's rule -- the whole stored side painted -- which
       is the picture every number above was taken on. */
    const wasSides = t.rockSides();
    t.rockSides(0);
    const wasCut = t.cfg.cutSolid;
    const wasBB = t.backBands();
    const wasBBS = t.backBandsSolid();
    const wasZoom = t.buffer().zoom;
    /* The BUFFER, never the page: the census has to read the rectangle the frame
       painted, and pickAt() answers in buffer pixels. Read LIVE too, because
       `t.zoom()` resizes the buffer and a width taken once before the cases would
       be the width of whichever case came first (see the hole census above). */
    const grab = () => Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
    const BACK = [parseInt(BACKDROP.slice(1, 3), 16),
                  parseInt(BACKDROP.slice(3, 5), 16),
                  parseInt(BACKDROP.slice(5, 7), 16)];
    /* Every pixel that IS the backdrop exactly, the flood from the border that
       says which of them you could see through, and how many of the rest are in a
       patch you could LOOK through (bare all round in a 3x3 square) -- the same
       definitions, and the same reason for them, as the hole census above. A bare
       pixel open to the edge of the picture is sky; one the flood cannot reach is
       a hole. `full` off is the cheap half, which is all the cut-away's own arm
       needs: its bare pixels and WHICH they are. */
    const census = (px, full) => {
      const w = Render.w, h = Render.h, n = w * h;
      const isVoid = new Uint8Array(n);
      let bare = 0;
      for (let i = 0, k = 0; i < n; i++, k += 4) {
        if (px[k] === BACK[0] && px[k + 1] === BACK[1] && px[k + 2] === BACK[2]) {
          isVoid[i] = 1; bare++;
        }
      }
      if (!full) return { bare: bare, isVoid: isVoid };
      const seen = new Uint8Array(n);
      const q = [];
      const step = (i) => { if (isVoid[i] && !seen[i]) { seen[i] = 1; q.push(i); } };
      for (let x = 0; x < w; x++) { step(x); step((h - 1) * w + x); }
      for (let y = 0; y < h; y++) { step(y * w); step(y * w + w - 1); }
      while (q.length) {
        const i = q.pop(), x = i % w, y = (i / w) | 0;
        if (x > 0) step(i - 1);
        if (x < w - 1) step(i + 1);
        if (y > 0) step(i - w);
        if (y < h - 1) step(i + w);
      }
      const mark = new Uint8Array(n);
      const in3 = (x, y) => {
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h) return false;
            if (!isVoid[ny * w + nx]) return false;
          }
        }
        return true;
      };
      let sealed = 0, thick = 0, worst = 0;
      for (let i = 0; i < n; i++) {
        if (!isVoid[i] || seen[i] || mark[i]) continue;
        let size = 0, wide = false;
        const p = [i];
        mark[i] = 1;
        while (p.length) {
          const j = p.pop(); size++;
          const x = j % w, y = (j / w) | 0;
          if (!wide && in3(x, y)) wide = true;
          if (x > 0 && isVoid[j - 1] && !seen[j - 1] && !mark[j - 1]) { mark[j - 1] = 1; p.push(j - 1); }
          if (x < w - 1 && isVoid[j + 1] && !seen[j + 1] && !mark[j + 1]) { mark[j + 1] = 1; p.push(j + 1); }
          if (y > 0 && isVoid[j - w] && !seen[j - w] && !mark[j - w]) { mark[j - w] = 1; p.push(j - w); }
          if (y < h - 1 && isVoid[j + w] && !seen[j + w] && !mark[j + w]) { mark[j + w] = 1; p.push(j + w); }
        }
        sealed += size;
        if (wide) { thick += size; if (size > worst) worst = size; }
      }
      return { bare: bare, isVoid: isVoid, seen: seen, sealed: sealed,
               thick: thick, worst: worst };
    };
    /* How many DIFFERENT pictures the sweep reached, over all three channels: a
       probe that cannot say it looked at more than one world is not measuring
       anything (lesson 27). */
    const hash = (px) => {
      let hv = 2166136261;
      for (let i = 0; i < px.length; i += 4) {
        hv ^= px[i]; hv = Math.imul(hv, 16777619);
        hv ^= px[i + 1]; hv = Math.imul(hv, 16777619);
        hv ^= px[i + 2]; hv = Math.imul(hv, 16777619);
      }
      return hv >>> 0;
    };
    /* Paint the same instant four ways. `cut_solid` is read again while the
       shapes are built, so this asks for them again, and it is Game.render() and
       never Game.frame() -- a frame steps the world, which would put the four
       arms in four different instants and make the comparison meaningless. */
    const paint = (cut, bb, bbs) => {
      t.cfg.cutSolid = cut;
      t.backBands(bb);
      t.backBandsSolid(bbs);
      const s = Game.state;
      s.geomDirty = true;
      s.viewDirty = true;
      Game.render();
      return Render.consumed;
    };
    /* Settle the world before looking at it: keep painting until no more ground
       is made. `Game.render()` is what FETCHES ground, so a view that has just
       been dragged or turned is a view with pieces still arriving, and the four
       arms have to be painted on one world (lesson 24). */
    const settle = () => {
      const s = Game.state;
      for (let k = 0; k < 12; k++) {
        const n = s.world.cells.length;
        s.geomDirty = true;
        s.viewDirty = true;
        Game.render();
        if (s.world.cells.length === n) break;
      }
    };
    const GROWN = 2000;
    const out = [];
    const pics = new Set();
    const tot = {
      cases: 0, moved: 0, movedViews: 0, deep: 0, worst: 0, worstAt: null,
      voidDiff: 0,
      solidViews: 0, solidBacks: [0, 0], solidBackPx: [0, 0],
      solidBare: [0, 0], solidSealed: 0, solidThick: 0, solidWorst: 0,
      solidSealedA: 0, solidThickA: 0, solidWorstA: 0,
      cutViews: 0, cutBacks: [0, 0], cutBackPx: [0, 0],
      cutBare: [0, 0], cutSealed: 0, cutThick: 0, cutWorst: 0,
      cutSealedC: 0, cutThickC: 0,
      cutOpen: 0, add: 0, addSealed: 0, addBiggest: 0, sub: 0,
      controls: 0, control: 0, controlThick: 0
    };
    for (const c of cases) {
      t.seed(c.seed);
      t.advance(GROWN);
      t.tilt(c.up);
      if (c.quarter) t.rotate(c.quarter);
      t.settle();
      if (c.drag) t.pan(c.drag[0], c.drag[1]);
      settle();
      /* ARM 1: the look that ships with the strips painted anyway -- v0.44.0, and
         the liveness half of the proof. ARM 2: the look that ships with them
         refused, which is what ships from v0.45.0. */
      const a = paint(1, true, true);
      const pxA = grab();
      const b = paint(1, true, false);
      const pxB = grab();
      /* ARM 3 and 4: the cut-away look, which is where the strips are wanted. */
      const cc = paint(0, true, false);
      const pxC = grab();
      const d = paint(0, false, false);
      const pxD = grab();
      const w = Render.w, h = Render.h, n = w * h;
      let moved = 0, deep = 0, worst = 0;
      for (let i = 0, k = 0; i < n; i++, k += 4) {
        const dr = Math.abs(pxA[k] - pxB[k]);
        const dg = Math.abs(pxA[k + 1] - pxB[k + 1]);
        const db = Math.abs(pxA[k + 2] - pxB[k + 2]);
        const m = dr > dg ? (dr > db ? dr : db) : (dg > db ? dg : db);
        if (m) {
          moved++;
          if (m > worst) worst = m;
          if (m > 8) deep++;
        }
      }
      const cA = census(pxA, true);
      const cB = census(pxB, true);
      const cD = census(pxD, true);
      const cC = census(pxC, true);
      /* THE CLAIM, in one count: pixels that are see-through in one of the two
         shipped arms and not in the other. Refusing the strips may stop them
         painting; it may not stop them COVERING. */
      let voidDiff = 0;
      for (let i = 0; i < n; i++) if (cA.isVoid[i] !== cB.isVoid[i]) voidDiff++;
      /* What refusing the strips in the CUT-AWAY adds: pixels bare in the arm
         without them that the arm with them had covered, and how many of those
         are enclosed -- the only way a bare pixel costs anything, because one
         open to the border is sky. `sub` is the other way round, and it must be
         nothing: a strip may only ever cover ground, never take it away. */
      let add = 0, addSealed = 0, sub = 0, addBiggest = 0;
      for (let i = 0; i < n; i++) {
        if (cD.isVoid[i] && !cC.isVoid[i]) { add++; if (!cD.seen[i]) addSealed++; }
        else if (!cD.isVoid[i] && cC.isVoid[i]) sub++;
      }
      if (addSealed > addBiggest) addBiggest = addSealed;
      /* The control, on one view per seed: the shipped picture with a 20x20 square
         of backdrop painted into the middle of it, which the flood cannot reach
         and this census must find -- all 400 pixels of it, 400 of them in a patch
         you could look through. */
      let ctl = null;
      if (!c.up && !c.quarter) {
        const punched = Uint8ClampedArray.from(pxB);
        const cx = (w / 2) | 0, cy = (h / 2) | 0;
        for (let y = cy; y < cy + 20; y++) {
          for (let x = cx; x < cx + 20; x++) {
            const k = (y * w + x) * 4;
            punched[k] = BACK[0]; punched[k + 1] = BACK[1]; punched[k + 2] = BACK[2];
          }
        }
        ctl = census(punched, true);
      }
      pics.add(hash(pxB));
      const rec = {
        seed: c.seed, up: c.up, quarter: c.quarter, drag: !!c.drag,
        moved: moved, worst: worst, deep: deep, voidDiff: voidDiff,
        solid: { backs: [a.backs, b.backs], backPx: [a.backPx, b.backPx],
                 bare: [cA.bare, cB.bare],
                 sealed: cB.sealed, thick: cB.thick, worst: cB.worst,
                 sealedA: cA.sealed, thickA: cA.thick, worstA: cA.worst },
        cut: { backs: [cc.backs, d.backs], backPx: [cc.backPx, d.backPx],
               bare: [cC.bare, cD.bare], sealed: cD.sealed,
               thick: cD.thick, worst: cD.worst,
               sealedC: cC.sealed, thickC: cC.thick, worstC: cC.worst },
        add: add, addSealed: addSealed, sub: sub,
        control: ctl ? ctl.sealed : -1, controlThick: ctl ? ctl.thick : -1
      };
      out.push(rec);
      tot.cases++;
      tot.moved += moved;
      if (moved > 0) tot.movedViews++;
      tot.voidDiff += voidDiff;
      tot.deep += deep;
      if (worst > tot.worst) {
        tot.worst = worst;
        tot.worstAt = `${c.seed}${c.up ? '/raised' : ''}${c.quarter ? '/turn' + c.quarter : ''}`;
      }
      if (a.backs > 0) tot.solidViews++;
      if (cc.backs > 0) tot.cutViews++;
      tot.solidBacks[0] += a.backs; tot.solidBacks[1] += b.backs;
      tot.solidBackPx[0] += a.backPx; tot.solidBackPx[1] += b.backPx;
      tot.solidBare[0] += rec.solid.bare[0]; tot.solidBare[1] += cB.bare;
      tot.solidSealed += cB.sealed;
      tot.solidThick += cB.thick;
      if (cB.worst > tot.solidWorst) tot.solidWorst = cB.worst;
      tot.solidSealedA += cA.sealed;
      tot.solidThickA += cA.thick;
      if (cA.worst > tot.solidWorstA) tot.solidWorstA = cA.worst;
      tot.cutBacks[0] += cc.backs; tot.cutBacks[1] += d.backs;
      tot.cutBackPx[0] += cc.backPx; tot.cutBackPx[1] += d.backPx;
      tot.cutBare[0] += cC.bare; tot.cutBare[1] += cD.bare;
      tot.cutSealed += cD.sealed;
      tot.cutThick += cD.thick;
      if (cD.worst > tot.cutWorst) tot.cutWorst = cD.worst;
      tot.cutSealedC += cC.sealed;
      tot.cutThickC += cC.thick;
      if (add > 0) tot.cutOpen++;
      tot.add += add; tot.addSealed += addSealed; tot.sub += sub;
      if (addSealed > tot.addBiggest) tot.addBiggest = addSealed;
      if (ctl) {
        tot.controls++;
        tot.control += ctl.sealed;
        tot.controlThick += ctl.thick;
      }
    }
    /* Put everything back the way it was found, so no test after this one is
       looking at a cut-away world with the strips switched off. */
    t.cfg.cutSolid = wasCut;
    t.backBands(wasBB);
    t.backBandsSolid(wasBBS);
    t.wallSkin(wasSkin);
    t.rockSides(wasSides);
    t.zoom(wasZoom);
    t.tilt(false);
    t.unpoint();
    t.seed(1);
    t.redraw();
    return { out: out, tot: tot, pics: pics.size, wasCut: wasCut, wasBB: wasBB,
             wasBBS: wasBBS, backCut: t.cfg.cutSolid, backBB: t.backBands(),
             backBBS: t.backBandsSolid(), wasSkin: wasSkin,
             backSkin: t.wallSkin(), wasSides: wasSides,
             backSides: t.rockSides() };
  }, cases);
  const tot = r.tot;
  /* The dials went back where they were found: this test paints the world
     four different ways, and leaving it in one of them would hand every test
     after it a look nobody asked for. */
  assert(r.backCut === r.wasCut && r.backBB === r.wasBB && r.backBBS === r.wasBBS
      && r.backSkin === r.wasSkin,
    `the dials came back as ${r.backCut}/${r.backBB}/${r.backBBS}/${r.backSkin}`
    + ` where they started at ${r.wasCut}/${r.wasBB}/${r.wasBBS}/${r.wasSkin}`);
  assert(r.backSides === r.wasSides && r.wasSides === 2,
    `the rock-side rule came back as ${r.backSides} where it started at`
    + ` ${r.wasSides} -- this test pins it to the old look, and every test after`
    + ' it wants the rule that ships (2)');
  assert(tot.cases === 24 && r.pics > 20,
    `${tot.cases} views were looked at and they reached ${r.pics} different`
    + ' pictures, so the seeds, angles, turns and drags are doing something');
  /* THE CONTROL ARM MUST REALLY BE PAINTING THE STRIPS, or "refusing them changes
     nothing" is a sentence about a build with nothing to refuse. */
  assert(tot.solidBacks[0] > 100 && tot.solidViews > 4,
    `the v0.44.0 arm painted ${tot.solidBacks[0]} strips (${tot.solidBackPx[0]} pixels)`
    + ` over ${tot.cases} views, ${tot.solidViews} of which had any, so the identity`
    + ' below is being asked of a picture that has strips in it');
  /* ...and the look that ships must refuse every one of them, because nothing is
     ever drawn short there and there is no gap for a strip to fill. */
  assert(tot.solidBacks[1] === 0 && tot.solidBackPx[1] === 0,
    `the look the game ships painted ${tot.solidBacks[1]} strips and`
    + ` ${tot.solidBackPx[1]} pixels of them where nothing is drawn short`);
  /* THE CLAIM, in total: refusing the strips takes no cover away. The see-through
     pixels are the same pixels they always were -- and the same patches, counted
     both as "enclosed by rock" and as "3 across or wider". What moves is paint. */
  assert(tot.voidDiff === 0 && tot.solidSealed === tot.solidSealedA
      && tot.solidThick === tot.solidThickA && tot.solidWorst === tot.solidWorstA,
    `refusing the strips changed which pixels are see-through in ${tot.voidDiff}`
    + ` places where the two pictures are meant to be see-through in exactly the`
    + ` same ones (enclosed ${tot.solidSealedA} -> ${tot.solidSealed}, in patches 3`
    + ` pixels across or wider ${tot.solidThickA} -> ${tot.solidThick}, biggest`
    + ` patch ${tot.solidWorstA} -> ${tot.solidWorst})`);
  /* AND THE PICTURE REALLY DID MOVE, so the identity above is being asked of two
     different pictures rather than of a change that never happened. What moved is
     bounded by what was painted: a strip goes on first for its block, so a pixel
     can only have moved if a strip was the last thing on it. The allowance on top
     is twice the strips' own area -- a strip is a few pixels wide, and its
     antialiased outline is thicker than its middle (lesson 17). */
  assert(tot.moved > 0 && tot.moved <= tot.solidBackPx[0] * 2 + 64 * tot.cases,
    `refusing the strips moved ${tot.moved} pixels over ${tot.movedViews} of the`
    + ` ${tot.cases} views (${tot.deep} of them by more than 8/255, worst`
    + ` ${tot.worst}/255 on ${tot.worstAt}), where the ${tot.solidBackPx[0]} pixels`
    + ` of strip painted can account for at most`
    + ` ${tot.solidBackPx[0] * 2 + 64 * tot.cases} -- so either nothing moved at`
    + ' all, or something moved that no strip was ever on');
  /* AND THE HALF THAT MAKES THAT MEAN SOMETHING: in the cut-away look, where the
     strips ARE wanted, the same change opens the ground. */
  assert(tot.add > 0 && tot.addSealed > 0 && tot.cutOpen > 0,
    `refusing the strips in the cut-away added ${tot.add} pixels of bare backdrop,`
    + ` ${tot.addSealed} of them enclosed by rock, over ${tot.cutOpen} of the`
    + ` ${tot.cases} views -- so this census cannot see the difference the strips`
    + ' make in the look that needs them, and the identity above proves nothing');
  /* The cull is a GATE, not a deletion: the cut-away keeps them, and the detector
     can see the difference -- refusing them there turns three more of the 24 views
     into views with a window in them (1 -> 4) and grows the enclosed pixels more
     than half again (2,134 -> 3,973, in patches 3 across or wider 236 -> 382). */
  assert(tot.cutBacks[0] > 100 && tot.cutViews > 4 && tot.cutBacks[1] === 0
      && tot.cutSealed > tot.cutSealedC && tot.cutThick > tot.cutThickC,
    `the cut-away look painted ${tot.cutBacks[0]} strips over ${tot.cutViews} of`
    + ` the ${tot.cases} views with them and ${tot.cutBacks[1]} without, where`
    + ` ${tot.addSealed} pixels of ground are behind nothing at all once they go;`
    + ` enclosed pixels ${tot.cutSealedC} -> ${tot.cutSealed} and pixels in patches`
    + ` 3 across or wider ${tot.cutThickC} -> ${tot.cutThick}, so refusing the`
    + ' strips there has to make the holes BIGGER and it did not');
  /* A strip may only ever cover ground: painting one may not make a pixel bare. */
  assert(tot.sub === 0,
    `painting the strips made ${tot.sub} pixels of bare backdrop where the same`
    + ' picture without them had none, so a strip is taking ground away instead'
    + ' of covering it');
  /* And the look that ships, view by view: no window you could see through, and
     the 20x20 punched control on the same view says the detector can see one. */
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}`
      + `${q.quarter ? ' turned ' + q.quarter : ''}${q.drag ? ' dragged' : ''}`;
    /* Refusing the strips may not change WHICH pixels are see-through, and every
       pixel that moved must lie inside what the strips painted -- which is a cap
       of zero on a view that painted none of them. */
    assert(q.voidDiff === 0,
      `${at}: refusing the strips made ${q.voidDiff} pixels see-through that were`
      + ' not, or hid that many that were');
    const cap = q.solid.backPx[0] ? q.solid.backPx[0] * 2 + 64 : 0;
    assert(q.moved <= cap,
      `${at}: refusing the strips moved ${q.moved} pixels (worst ${q.worst}/255,`
      + ` ${q.deep} by more than 8/255) where ${q.solid.backPx[0]} pixels of strip`
      + ` were painted and ${cap} pixels can be accounted for`);
    assert(q.solid.backs[1] === 0 && q.cut.backs[1] === 0,
      `${at}: the arm with the strips refused still painted ${q.solid.backs[1]}`
      + ` in the look that ships and ${q.cut.backs[1]} in the cut-away`);
    assert(q.solid.thick === 0,
      `${at}: the look that ships left ${q.solid.thick} pixels of bare backdrop in`
      + ` patches 3 pixels across or wider (biggest patch ${q.solid.worst} pixels,`
      + ` ${q.solid.sealed} pixels of it enclosed in all) -- that is a window you`
      + ' could see through');
    if (q.control >= 0) {
      assert(q.control >= 380 && q.controlThick >= 380,
        `${at}: a 20x20 square of backdrop painted into the middle of the picture`
        + ` came back as ${q.control} pixels of hole, ${q.controlThick} of them`);
    }
  }
});

/* The range the three v0.46.0 tests are run over: five seeds, both camera
 * angles, all four turns. Each world is walked on 2,000 steps before anything is
 * looked at, so the match has grown the ground it holds first (lesson 24 -- when
 * the thing a test measures acquires a history, the setup becomes a claim about
 * that history), and the camera is settled before the census so the view cannot
 * drift between the census and the repaint it is held against. */
const VOXEL_CASES = [];
for (const seed of [1, 2, 3, 7, 777]) {
  for (const up of [0, 1]) for (let q = 0; q < 4; q++) VOXEL_CASES.push({ seed, up, q });
}

/* Every wall the picture paints stands a whole number of metres (v0.46.0).
 *
 * The picture is built out of metre blocks -- a square of rock is a column of
 * them -- so a wall face that stops partway up one has a foot that belongs to no
 * block. The foot used to stop wherever the neighbour's block left off, which at
 * the raised angle is one depth step of the view further down (1.6875 m, `stepM`)
 * plus a metre when the neighbour fades (`render.wall_fade_m`); the LOOK of that
 * was 0.6875 of a metre of wall standing on nothing in particular, along every
 * corner where a block met a block shorter than itself.
 *
 * v0.46.0 floors the foot. This is the test that says so: a census of every face
 * that REACHED THE CANVAS, asked through the renderer's own `wallsPainted`
 * against the frame's own alpha plan -- exactly the way `draw()` asks it -- and a
 * count of how many of them are not a whole number of metres.
 *
 * FOUR IDENTITIES hold the census against numbers the game was already keeping,
 * so this is not a new ruler measuring a new thing:
 *     faces    === consumed.walls   (the same faces)
 *     cut      === consumed.cut     (the same squares left out of the picture whole)
 *     taller   === consumed.faded   (the same faces the fade band is painted on)
 *     paintPx  === consumed.wallPx  (the same area, added up the same way)
 *
 * THE CONTROL IS THE SAME BUILD with `Render.voxelBlocks` off, which is v0.45.0
 * to the pixel: the arm that should be whole and the arm that should not are one
 * flag apart and no rebuild apart (lesson 21).
 *
 * Measured over these 40 cases, in the suite's own window (624x368, so 229,632
 * pixels a view): 10,975 faces painted -- 3,375 of them at the raised angle and
 * 7,600 at the low one -- and 1,545 of them standing a part of a metre before,
 * 0 now. All 1,545 stood the SAME fraction, 0.6875 = frac(stepM + fade), which is
 * one number, the raised angle's own step, and every one of them was at the
 * raised angle: not one of the low angle's 7,600 faces was ever odd, because
 * `stepM` is exactly 1.0 there. So the low angle is in the range as the case
 * where the flag may change nothing at all, and it changed nothing. 9,430 faces
 * were whole either way, over 8,858 blocks, and 3,129 blocks went on showing no
 * face at all -- the rock inside the rock next door. The 40 cases reached 40
 * different pictures of their own.
 *
 * AND THE CASE THIS CENSUS HAD TO BE TAUGHT: a square with NO HEIGHT of its own
 * is not skipped. A ramp whose low end reaches the floor of the world has `wallM`
 * 0 and still lays two cheek faces, so `walls++` counts them, and a census
 * filtering on `wallM > 0` came out 2 faces short on seed 2 and 2 short on seed
 * 777 -- the same 2 faces in each, found by
 * walking such a square once with the drawing's rule and the census's rule side
 * by side. ZERO METRES IS A HEIGHT TOO, and it is a whole number of metres. */
await test('every wall the picture paints stands a whole number of metres (v0.46.0)', async () => {
  const r = await page.evaluate((CASES) => {
    const t = window.__test, out = [], worlds = new Set();
    t.pause(); t.unpoint();
    const wasFlag = t.voxelBlocks();
    /* THE ROCK-SIDE RULE IS PINNED BACK TO v0.47.0 (v0.48.0). This census counts
       faces that REACH THE CANVAS, and the faces it was written for -- a foot
       landing partway up a block at the raised angle, where one depth step of the
       view is 1.6875 m -- are exactly the faces that stand against rock, which
       since v0.48.0 are not painted at all: with the shipped rule the control arm
       paints 0 part-metre faces out of 1,806, so the arm that is supposed to be
       not-whole is empty and the identity is asked of nothing (lesson 19).
       `rockSides(0)` is v0.47.0's rule, the whole stored side painted, which is
       the picture every number above was taken on, and the two metre-block arms
       are one flag apart on top of it (lesson 21). The shipped rule has its own
       census, `only the sides of a wall facing open ground are shown (v0.48.0)`. */
    const wasSides = t.rockSides();
    t.rockSides(0);
    /* AND THE ROCK SKIN IS PINNED OFF AS WELL (v0.47.0), because the numbers
       quoted above were taken before there was one. With the skin on, half the
       rock never reaches the batch at all, so the census counts 5,160 faces where
       the record says 10,975 -- and a run that prints a different number from the
       one written next to it is two numbers, not a measurement. The claim is
       about a foot landing partway up a block, and a block buried in the hill
       behind the picture is exactly where such a foot is found. */
    const wasSkin = t.wallSkin();
    t.wallSkin(false);
    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.q);
      t.settle();
      t.unpoint();
      t.voxelBlocks(false);
      const off = t.wallMetres();
      t.repaint();
      const offC = t.consumed();
      t.voxelBlocks(true);
      const on = t.wallMetres();
      t.repaint();
      const onC = t.consumed();
      worlds.add(`${off.faces}/${off.blocks}/${off.buried}`);
      out.push({ seed: c.seed, up: c.up, q: c.q,
                 stepM: off.stepM, fade: off.fade,
                 offFaces: off.faces, onFaces: on.faces,
                 offOdd: off.odd, onOdd: on.odd, offFrac: off.frac,
                 offWhole: off.whole, onWhole: on.whole,
                 offShort: off.shortest, onShort: on.shortest, onTall: on.tallest,
                 offBlocks: off.blocks, onBlocks: on.blocks,
                 offBuried: off.buried, onBuried: on.buried,
                 offCensus: off.faces, offWalls: offC.walls,
                 onCensus: on.faces, onWalls: onC.walls,
                 offCensusCut: off.cut, onCensusCut: on.cut,
                 offCut: offC.cut, onCut: onC.cut,
                 offTaller: off.taller, offFaded: offC.faded,
                 onTaller: on.taller, onFaded: onC.faded,
                 offPaintPx: off.paintPx, offWallPx: offC.wallPx,
                 onPaintPx: on.paintPx, onWallPx: onC.wallPx });
    }
    t.voxelBlocks(wasFlag);
    t.rockSides(wasSides);
    t.wallSkin(wasSkin);
    return { out: out, worlds: worlds.size, wasFlag: wasFlag,
             backFlag: t.voxelBlocks(), wasSides: wasSides,
             backSides: t.rockSides(), wasSkin: wasSkin, backSkin: t.wallSkin() };
  }, VOXEL_CASES);
  const tot = { offOdd: 0, onOdd: 0, offFaces: 0, onFaces: 0, raisedOdd: 0,
                raisedFaces: 0, lowOdd: 0, lowFaces: 0, offBuried: 0, onBuried: 0,
                offWhole: 0, offBlocks: 0 };
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}`
      + `${q.q ? ' turned ' + q.q : ''}`;
    /* THE CLAIM: not one painted face stands partway up a block. */
    assert(q.onOdd === 0 && q.onWhole === q.onFaces && q.onFaces > 0,
      `${at}: ${q.onOdd} of the ${q.onFaces} faces the picture painted stand a`
      + ` part of a metre (${q.onWhole} of them whole)`);
    /* A whole number of metres INCLUDES ZERO, and the picture paints such faces:
       a ramp whose low end is the floor of the world has two cheeks with nothing
       above them. If the census skips them, `faces` comes up short against
       `consumed.walls` on exactly the seeds that have one. */
    assert(q.onShort >= 0 && q.onShort === Math.round(q.onShort)
        && q.onTall === Math.round(q.onTall),
      `${at}: the shortest face the picture painted stands ${q.onShort} m and the`
      + ` tallest ${q.onTall} m, and neither is a whole number of metres`);
    /* FOUR IDENTITIES: this census is counting the same things the drawing
       counts, in the same breath. */
    assert(q.offCensus === q.offWalls && q.onCensus === q.onWalls,
      `${at}: the census found ${q.offCensus} -> ${q.onCensus} faces where the`
      + ` drawing painted ${q.offWalls} -> ${q.onWalls}`);
    assert(q.offCensusCut === q.offCut && q.onCensusCut === q.onCut,
      `${at}: the census counted ${q.offCensusCut} -> ${q.onCensusCut} squares`
      + ` left out of the picture whole where the drawing counted`
      + ` ${q.offCut} -> ${q.onCut}`);
    assert(q.offFaded === q.offTaller && q.onFaded === q.onTaller,
      `${at}: the census found ${q.offTaller} -> ${q.onTaller} faces standing`
      + ` more than the fade band where the drawing faded`
      + ` ${q.offFaded} -> ${q.onFaded}`);
    assert(q.offPaintPx === q.offWallPx && q.onPaintPx === q.onWallPx,
      `${at}: the census added the faces up to ${q.offPaintPx} -> ${q.onPaintPx}`
      + ` pixels where the drawing counted ${q.offWallPx} -> ${q.onWallPx}`);
    /* AND THE PICTURE IS THE SAME PICTURE: the flag moves a foot, it does not add
       a face or take one away, and it does not change which blocks show nothing
       at all -- the ones inside the rock next door. */
    assert(q.onFaces === q.offFaces && q.onBlocks === q.offBlocks
        && q.onBuried === q.offBuried,
      `${at}: snapping the feet changed the picture from ${q.offFaces} faces over`
      + ` ${q.offBlocks} blocks to ${q.onFaces} over ${q.onBlocks}, with`
      + ` ${q.offBuried} -> ${q.onBuried} blocks showing no face at all`);
    /* AND THE ARM THAT IS NOT WHOLE IS NOT WHOLE IN ONE WAY: the same fraction on
       every face. A second fraction would mean a foot landing somewhere the step
       does not explain, which is a different bug wearing the same symptom. */
    if (q.offOdd) {
      const want = q.stepM + q.fade;
      const frac = (Math.round((want - Math.floor(want)) * 1000) / 1000).toFixed(3);
      const keys = Object.keys(q.offFrac);
      assert(keys.length === 1 && keys[0] === frac,
        `${at}: ${q.offOdd} faces stood a part of a metre in ${keys.length}`
        + ` different fractions (${keys.join() || 'none'}) where the view's own`
        + ` step plus the fade band is ${want} m, so a foot is landing somewhere`
        + ' the step does not explain');
    }
    tot.offOdd += q.offOdd; tot.onOdd += q.onOdd;
    tot.offFaces += q.offFaces; tot.onFaces += q.onFaces;
    tot.offWhole += q.offWhole; tot.offBlocks += q.offBlocks;
    tot.offBuried += q.offBuried; tot.onBuried += q.onBuried;
    if (q.up) { tot.raisedOdd += q.offOdd; tot.raisedFaces += q.offFaces; }
    else { tot.lowOdd += q.offOdd; tot.lowFaces += q.offFaces; }
  }
  /* The flag went back where it was found: this test paints the world both ways,
     and leaving it in one of them would hand every test after it a look nobody
     asked for. */
  assert(r.wasFlag === true && r.backFlag === true,
    `the metre blocks came back as ${r.backFlag} where they started at`
    + ` ${r.wasFlag} -- the look that ships is the whole-metre one`);
  assert(r.backSides === r.wasSides && r.wasSides === 2,
    `the rock-side rule came back as ${r.backSides} where it started at`
    + ` ${r.wasSides} -- this test pins it to the old look, and every test after`
    + ' it wants the rule that ships (2)');
  assert(r.backSkin === r.wasSkin && r.wasSkin === true,
    `the rock skin came back as ${r.backSkin} where it started at ${r.wasSkin}`
    + ' -- this test pins it off, and every test after it wants the look that'
    + ' ships');
  assert(r.out.length === 40 && r.worlds >= 30,
    `${r.out.length} views were looked at and they reached ${r.worlds} different`
    + ' pictures of their own, so the seeds, angles and turns are doing something');
  /* The arm that should not be whole is not whole, and not by a hair: this is the
     control the identity above is asked of, and a control with nothing in it
     proves nothing (lesson 19). */
  assert(tot.offOdd > 300 && tot.offFaces === tot.onFaces && tot.onOdd === 0,
    `the arm with the snap off painted ${tot.offOdd} faces standing a part of a`
    + ` metre out of ${tot.offFaces} (the arm with it on painted ${tot.onOdd} out`
    + ` of ${tot.onFaces}, and the two arms painted the same number of faces)`);
  /* AND THE RANGE IS THE REASON: all of the part-metre faces were at the raised
     angle, where one depth step of the view is not a whole number of metres, and
     none were at the low angle, where the step is exactly one metre -- so the
     low angle is in the list as the case where snapping may change nothing at
     all, and it changed nothing. */
  assert(tot.raisedOdd === tot.offOdd && tot.raisedOdd > 300 && tot.lowOdd === 0
      && tot.lowFaces > 2000,
    `the raised angle carried ${tot.raisedOdd} of the ${tot.offOdd} part-metre`
    + ` faces over ${tot.raisedFaces} faces and the low angle carried`
    + ` ${tot.lowOdd} over ${tot.lowFaces}, so the fraction being fixed is the`
    + ' raised angle\'s own step rather than a rounding error everywhere');
  console.log(`  ... ${r.out.length} views, ${tot.offFaces} faces painted:`
    + ` part-metre faces ${tot.offOdd} -> ${tot.onOdd},`
    + ` every one of them ${JSON.stringify(r.out.find((q) => q.offOdd).offFrac)}`
    + ` of a metre, all at the raised angle (${tot.raisedOdd}),`
    + ` ${tot.offBuried} -> ${tot.onBuried} blocks showing no face`
    + ` [raised ${tot.raisedFaces} faces, low ${tot.lowFaces},`
    + ` ${tot.offWhole} whole, ${tot.offBlocks} blocks]`);
});

/* Snapping every foot to a whole metre only ever paints MORE wall (v0.46.0).
 *
 * This is the shape lesson 21 asks for when a change may only add: never say "it
 * only adds", say what the old build could not do, and let the numbers fit inside
 * it. It is true by construction -- the cut is floored and the cut is never
 * allowed above the block's own height, so `floor(meet) <= meet`, a face's
 * painted height is `mine - meet`, and flooring therefore makes faces TALLER.
 * Whether a face is painted at all turns on `meet < mine` where `mine` is a whole
 * number of metres, and `floor(meet) < mine` exactly when `meet < mine`, so a face
 * can be neither switched on nor switched off. That is the argument. Below is the
 * measurement, taken A/B inside ONE build, which is what lesson 21 says to do
 * with the argument.
 *
 * Measured over the same 40 cases, in the suite's own window (624x368, so 229,632
 * pixels a view; 9,185,280 pixels looked at twice): 10,975 walls and 26,293,952
 * pixels of wall either way, never one fewer of either and never a pixel less;
 * 1,347 of the 9,185,280 pixels moved (0.0147%), the worst of them by 16/255 and
 * 60 in all by more than 8/255; 28 of the 40 views came out byte for byte
 * identical, so 12 moved at all, and the worst of those moved 0.083% of its
 * picture -- the 1,545 part-metre faces stood on 3,682,496 painted pixels, which
 * is where those pixels are. No view came near even a tenth of a percent of the
 * picture.
 *
 * Two bounds, because they answer two different questions. The LOOSE one is
 * derived: a pixel can only have moved if it lies under a strip one of the
 * part-metre faces gained at its foot, so twice the area those faces painted --
 * twice, because a moved foot line has an antialiased outline thicker than its
 * middle (lesson 17) -- plus 64 pixels a view to allow that outline to extend a
 * pixel past the face. The TIGHT one is the measurement with headroom written
 * next to it: 0.15% of the picture, where the worst view used 0.083%. A bound that
 * cannot fail is worth less than no ruler (lesson 19), which is why both are
 * here: the loose one says nothing moved anywhere the feet could not reach, and
 * the tight one would catch a change that moved a corner of the picture. */
await test('snapping a foot to a whole metre only ever paints more wall (v0.46.0)', async () => {
  const r = await page.evaluate((CASES) => {
    const t = window.__test, out = [];
    t.pause(); t.unpoint();
    const wasFlag = t.voxelBlocks();
    /* THE ROCK-SIDE RULE IS PINNED BACK TO v0.47.0 (v0.48.0), and this is the
       test that needs it most plainly. What it watches for is MOVEMENT: a foot
       snapped from 1.6875 m up to a whole metre moves a line of pixels along
       every face that stands against rock. Since v0.48.0 those faces are not
       painted at all, so the two arms came out identical in all 40 views and the
       9,185,280-pixel identity below was asked of a change that never happened
       (lesson 27 -- an "unchanged" claim over a change that does not occur is a
       sentence about nothing). `rockSides(0)` is v0.47.0's rule, the whole stored
       side painted, which is the picture every number above was taken on, with
       the two metre-block arms one flag apart on top of it (lesson 21). */
    const wasSides = t.rockSides();
    t.rockSides(0);
    /* AND THE ROCK SKIN OFF WITH IT (v0.47.0), for the same reason as the whole-
       metre census above: the numbers quoted here were taken before there was
       one, and with the skin on half the rock never reaches the batch, so the
       same 40 views paint 5,160 faces and 13.1 M pixels where the record says
       10,975 and 26.3 M. The claim -- a snapped foot only ever paints MORE wall --
       is asked of the faces the feet are on. */
    const wasSkin = t.wallSkin();
    t.wallSkin(false);
    /* AND THE WALL SMOOTHING OFF (v0.51.0), because it is the one thing in this
       test's subject that now MOVES. Since v0.51.0 a face's colour is decided
       from the squares at the two ends of its run and from the altitude its fill
       is normalised at (`acrossFor`'s ref, which is the face's own FOOT), so
       snapping a foot to a whole metre moves the level the entire face is
       repainted at: this test's own pair of pictures goes from 1,347 of 9,185,280
       pixels to 22,938 of 229,632 on one raised camera. That is a number about
       the smoothing. The claim here -- a snapped foot only ever paints MORE wall,
       never one fewer -- is about which faces exist and how tall they are, and
       every bound below was taken on the picture as it stood before there was a
       smoothing. */
    const wasAcross = t.acrossLight();
    t.acrossLight(false);
    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.q);
      t.settle();
      t.unpoint();
      t.voxelBlocks(false);
      const off = t.wallMetres();
      t.repaint();
      const offC = t.consumed();
      t.keep();
      t.voxelBlocks(true);
      const on = t.wallMetres();
      t.repaint();
      const onC = t.consumed();
      const d = t.diff();
      out.push({ seed: c.seed, up: c.up, q: c.q,
                 offFaces: off.faces, onFaces: on.faces,
                 offWalls: offC.walls, onWalls: onC.walls,
                 offPx: offC.wallPx, onPx: onC.wallPx,
                 offFaded: offC.faded, onFaded: onC.faded,
                 oddPx: off.oddPx, odd: off.odd,
                 differ: d.differ, pixels: d.pixels, worst: d.worst, deep: d.deep });
    }
    t.voxelBlocks(wasFlag);
    t.rockSides(wasSides);
    t.wallSkin(wasSkin);
    t.acrossLight(wasAcross);
    return { out: out, wasFlag: wasFlag, backFlag: t.voxelBlocks(),
             wasSides: wasSides, backSides: t.rockSides(),
             wasSkin: wasSkin, backSkin: t.wallSkin(),
             wasAcross: wasAcross, backAcross: t.acrossLight() };
  }, VOXEL_CASES);
  const tot = { walls: 0, px: 0, faded: 0, moved: 0, deep: 0, worst: 0,
                identical: 0, movedViews: 0, oddPx: 0, odd: 0, pixels: 0,
                worstView: 0 };
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}`
      + `${q.q ? ' turned ' + q.q : ''}`;
    /* THE CLAIM, at its plainest: turning the snap on never takes a wall, a pixel
       of wall, or a faded face away, and never changes how many faces there are. */
    assert(q.onFaces === q.offFaces && q.onWalls >= q.offWalls
        && q.onPx >= q.offPx && q.onFaded >= q.offFaded,
      `${at}: snapping the feet took the picture from ${q.offFaces} faces /`
      + ` ${q.offWalls} walls / ${q.offPx} pixels of wall / ${q.offFaded} faded`
      + ` to ${q.onFaces} / ${q.onWalls} / ${q.onPx} / ${q.onFaded}`);
    /* The derived cap (lesson 21/17): everything that moved has to fit inside the
       strips the part-metre faces gained, with room for their outlines. */
    const cap = 2 * q.oddPx + 64;
    assert(q.differ <= cap,
      `${at}: snapping the feet moved ${q.differ} pixels (worst ${q.worst}/255,`
      + ` ${q.deep} of them by more than 8/255) where the ${q.odd} faces that`
      + ` stood a part of a metre painted ${q.oddPx} pixels and ${cap} pixels can`
      + ' be accounted for -- so something moved that no foot could reach');
    /* The tight bound: the measurement, with the headroom written next to it. */
    assert(q.differ <= q.pixels * 0.0015,
      `${at}: snapping the feet moved ${q.differ} of ${q.pixels} pixels, more`
      + ` than the 0.15% of the picture this change is allowed (the worst view`
      + ' measured used 0.083%)');
    assert(q.worst <= 24,
      `${at}: a pixel moved by ${q.worst}/255 where the worst measured is 16/255`
      + ' and the palette steps the lighting in far larger jumps than that');
    tot.walls += q.offWalls; tot.px += q.offPx; tot.faded += q.offFaded;
    tot.moved += q.differ; tot.deep += q.deep; tot.pixels += q.pixels;
    tot.oddPx += q.oddPx; tot.odd += q.odd;
    if (q.differ > 0) tot.worst = Math.max(tot.worst, q.worst);
    if (q.differ > 0) tot.worstView = Math.max(tot.worstView, q.differ / q.pixels);
    if (q.differ === 0) tot.identical++;
    if (q.differ > 0) tot.movedViews++;
  }
  assert(r.wasFlag === true && r.backFlag === true,
    `the metre blocks came back as ${r.backFlag} where they started at`
    + ` ${r.wasFlag}`);
  assert(r.backSides === r.wasSides && r.wasSides === 2,
    `the rock-side rule came back as ${r.backSides} where it started at`
    + ` ${r.wasSides} -- this test pins it to the old look, and every test after`
    + ' it wants the rule that ships (2)');
  assert(r.backSkin === r.wasSkin && r.wasSkin === true,
    `the rock skin came back as ${r.backSkin} where it started at ${r.wasSkin}`
    + ' -- this test pins it off, and every test after it wants the look that'
    + ' ships');
  assert(r.backAcross === r.wasAcross && r.wasAcross === true,
    `the wall smoothing came back as ${r.backAcross} where it started at`
    + ` ${r.wasAcross} -- this test pins it off, and every test after it wants`
    + ' the look that ships');
  assert(r.out.length === 40, `${r.out.length} views were looked at`);
  assert(tot.movedViews >= 4 && tot.moved > 0,
    `the picture did not move at all in ${r.out.length - tot.movedViews} of the`
    + ` ${r.out.length} views and moved ${tot.moved} pixels in all, so the`
    + ' identities above are being asked of a change that never happened');
  /* AND MOST OF THE PICTURE IS PROVABLY UNTOUCHED: two thirds of these views come
     out byte for byte identical, which is what a change that only moves a foot
     below a block's own shadow should do. */
  assert(tot.identical >= 24,
    `only ${tot.identical} of the ${r.out.length} views came out byte-identical,`
  + ' where 28 of them did when this was measured');
  assert(tot.deep <= 80,
  `${tot.deep} pixels moved by more than 8/255 in all, where 60 did when this`
    + ' was measured');
  console.log(`  ... ${r.out.length} views, ${tot.odd} part-metre faces standing`
    + ` on ${tot.oddPx} painted pixels: ${tot.moved} of ${tot.pixels} pixels`
    + ` moved (${(100 * tot.moved / tot.pixels).toFixed(4)}%), worst shade`
    + ` ${tot.worst}/255, ${tot.deep} of them by more than 8/255,`
    + ` ${tot.identical} views byte-identical, none taking a wall away`
    + ` [${tot.walls} walls / ${tot.px} pixels of wall, either way,`
    + ` ${tot.faded} faded faces, worst view`
    + ` ${(100 * tot.worstView).toFixed(3)}%]`);
});

/* The top metre of a wall still fades away (v0.46.0).
 *
 * This is the half of v0.46.0 that was asked for in as many words: metre blocks
 * for the walls, and the fade at the top of a wall left alone. It is the half
 * that is easy to lose, because the fade and the snap are two answers about the
 * same foot -- the fade is why a foot lands a whole metre lower near a block that
 * is going to fade, and snapping floors what is left. A version that snapped the
 * wrong end of the face, or that rounded the fade band away with the fraction,
 * would pass every test above and quietly delete the fade.
 *
 * So this asks the question the player can see: does the picture still fade, and
 * is the fade band still carrying the wall's own material rather than a flat
 * colour? `consumed.faded` counts exactly the faces painted through the fade
 * band and `consumed.banded` exactly the faces whose band carried the material,
 * both as `paintSide` paints them, so neither number is a new opinion.
 *
 * Measured over the same 40 cases: 10,318 faded faces with the snap off and
 * 10,318 with it on -- the same faces, to the face -- and all 10,318 of them
 * carrying the material, in both arms, out of 10,975 faces painted. Every one of
 * the 40 views had a faded face in it, which is the control that matters: a fade
 * test on views with no walls taller than the band in them would pass on a build
 * with no fade at all. The census agrees with the drawing in both arms, face for
 * face. */
await test('the top metre of a wall still fades away (v0.46.0)', async () => {
  const r = await page.evaluate((CASES) => {
    const t = window.__test, out = [];
    t.pause(); t.unpoint();
    const wasFlag = t.voxelBlocks();
    const wasFade = t.wallFade();
    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.q);
      t.settle();
      t.unpoint();
      t.voxelBlocks(false);
      const off = t.wallMetres();
      t.repaint();
      const offC = t.consumed();
      t.voxelBlocks(true);
      const on = t.wallMetres();
      t.repaint();
      const onC = t.consumed();
      out.push({ seed: c.seed, up: c.up, q: c.q, fade: off.fade,
                 offFaded: offC.faded, onFaded: onC.faded,
                 offBanded: offC.banded, onBanded: onC.banded,
                 offTaller: off.taller, onTaller: on.taller,
                 offFaces: off.faces, onFaces: on.faces,
                 offBuried: off.buried, onBuried: on.buried,
                 offBlocks: off.blocks, onBlocks: on.blocks });
    }
    t.voxelBlocks(wasFlag);
    return { out: out, wasFlag: wasFlag, backFlag: t.voxelBlocks(),
             wasFade: wasFade, backFade: t.wallFade() };
  }, VOXEL_CASES);
  const tot = { offFaded: 0, onFaded: 0, offBanded: 0, onBanded: 0,
                views: 0, offFaces: 0, onFaces: 0 };
  assert(r.wasFade > 0 && r.backFade === r.wasFade,
    `the fade band came back as ${r.backFade} m where the sheet has`
    + ` ${r.wasFade} m, and a fade of nothing is not a fade`);
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}`
      + `${q.q ? ' turned ' + q.q : ''}`;
    assert(q.fade === r.wasFade,
      `${at}: the census was run against a fade band of ${q.fade} m where the`
      + ` sheet has ${r.wasFade} m`);
    /* THE CLAIM: the picture still fades, and snapping the feet changed not one
       face of it. */
    assert(q.offFaded > 0 && q.onFaded === q.offFaded,
      `${at}: the picture faded ${q.offFaded} faces with the feet as they were`
      + ` and ${q.onFaded} with them snapped, where every view measured has walls`
      + ' taller than the fade band in it');
    /* AND THE BAND IS THE WALL'S OWN MATERIAL, not a flat colour: every face that
       went through the fade band carried the material to it. */
    assert(q.onBanded === q.onFaded && q.offBanded === q.offFaded,
      `${at}: ${q.onFaded} faces were painted through the fade band and`
      + ` ${q.onBanded} of them carried the wall's own material (${q.offFaded}`
      + ` / ${q.offBanded} with the feet as they were)`);
    /* AND THE CENSUS SEES THE SAME FACES THE DRAWING PAINTED, in both arms --
       otherwise "the fade is unchanged" is a claim about a list of faces nothing
       checked. */
    assert(q.offTaller === q.offFaded && q.onTaller === q.onFaded,
      `${at}: the census found ${q.offTaller} -> ${q.onTaller} faces taller than`
      + ` the fade band where the drawing faded ${q.offFaded} -> ${q.onFaded}`);
    tot.offFaded += q.offFaded; tot.onFaded += q.onFaded;
    tot.offBanded += q.offBanded; tot.onBanded += q.onBanded;
    tot.offFaces += q.offFaces; tot.onFaces += q.onFaces;
    if (q.offFaded > 0) tot.views++;
  }
  assert(r.wasFlag === true && r.backFlag === true,
    `the metre blocks came back as ${r.backFlag} where they started at`
    + ` ${r.wasFlag}`);
  assert(tot.views === r.out.length && tot.offFaded > 1000,
    `only ${tot.views} of the ${r.out.length} views had a wall taller than the`
    + ` fade band in them (${tot.offFaded} faded faces in all), so this test is`
    + ' not being asked of a picture with a fade in it');
  /* THE WHOLE POINT, in one line: the same faces, to the face, in both arms. */
  assert(tot.onFaded === tot.offFaded && tot.onBanded === tot.offBanded,
    `snapping the feet changed the faded faces from ${tot.offFaded} to`
    + ` ${tot.onFaded} and the material carried to the band from`
    + ` ${tot.offBanded} to ${tot.onBanded}`);
  console.log(`  ... ${r.out.length} views, a fade band of ${r.wasFade} m:`
    + ` faded faces ${tot.offFaded} -> ${tot.onFaded}, all of them carrying the`
    + ` wall's material (${tot.offBanded} / ${tot.onBanded}),`
    + ` ${tot.offFaces} -> ${tot.onFaces} faces painted`);
});

/* ---- one tile of wall, and black behind it (v0.47.0) ---------------------- *
 * Asked for in as many words -- "walls should only be one tile thick, simply
 * show black nothingness behind them" -- and settled by EFFECT before it was
 * built: only the rock that touches open space is drawn, everything behind it
 * is black even where ground stands higher, and every wall is exactly one tile.
 *
 * The rule is a property of the WORLD and not of the camera. A square of rock
 * with rock on all four sides of it is left out of the picture, whole, whatever
 * quarter the view is on and whatever height the rock beside it stands at.
 * Nothing else is looked at. A neighbour past the rim of the piece is read out
 * of the world, and a neighbour that is not there counts as OPEN -- so a square
 * on the edge of a piece is always drawn, and the same wall is drawn the same
 * way while the player walks toward it.
 *
 * A CULL has to be proved a superset rather than argued to be one (lesson 23),
 * and a count of nothing proves nothing without the same count made to be
 * something (lesson 19), so both arms run inside ONE build (lesson 21), four
 * seeds x both angles x two quarter turns:
 *
 *  1. THE RULE IS WHAT CULLED IT, worked out again here from the world rather
 *     than asked of the code that does the culling. Every rock square of every
 *     piece the frame looked at, sorted into buried and not by this test's own
 *     four-neighbour check, has to come out as exactly the two counters -- and
 *     NOT ONE square that was built is buried, with the arm that has the skin
 *     switched off holding thousands of them.
 *  2. NOTHING ELSE MOVED. Square for square: what the culled arm built is a
 *     subset of what the old arm built; every square that left is buried rock;
 *     not one square that stayed changed its tile, height or cut; and the
 *     crawlers and the camp sites are the same list on both sides.
 *  3. THE ONLY THING IT CAN DO IS TAKE ROCK AWAY, and it reaches the picture:
 *     fewer wall faces and fewer pixels of wall, never more; NOT ONE PIXEL of
 *     floor changes, which is lesson 21's promise -- no square a crawler could
 *     stand on moves -- said in pixels instead of in squares; and what goes is
 *     a few percent of the wall's paint, of which almost all turns to black,
 *     because most of what was culled was already covered, to the pixel, by
 *     rock that stays.
 *
 *     Measured by this test on its own battery -- 16 cases, buffer 624x368
 *     (229,632 pixels a frame): 70,863 squares of rock with rock on all four
 *     sides culled out of the 96,434 the frames looked at, 1,151 of them in the
 *     old picture and 0 in the new; wall faces 4,493 -> 2,200, 51.0% fewer; the
 *     wall's own pixels 1,534,395 -> 1,404,572, so 129,823 of them went -- 8.5%
 *     of the old wall and 3.5% of the battery; the black grew by 124,768, which
 *     is 96.1% of what was taken and never more than it. The floor is
 *     IDENTICAL to the pixel (1,872,551 both ways), and 31,247 answers were
 *     asked over the culled squares without one of them naming one. The
 *     instrument that planned the change (`files/probe-skin-cases.txt`) ran the
 *     same battery at 434x318 and found the same shape with the numbers its own
 *     canvas gives -- 44.7% fewer faces, 3.69% of the wall taken, 95.4% of it
 *     black. The numbers move with the canvas; the shape does not.
 *
 *     Which is the shape of the change: the rock you were never seeing stops
 *     being painted, and the rock you were seeing is exactly as it was.
 *  4. AND WHAT IS NOT IN THE PICTURE CANNOT BE POINTED AT (rule 8): the centre
 *     of every culled square, and a grid over the whole frame, answered by
 *     `pickAt` itself, never once name a square the cull took.
 *
 * TWO LOOKS ARE IN HERE, and the difference between them is v0.48.0's rule. The
 * battery numbers above were taken with the back of the rock painted and merely
 * CUT -- `rockSides` 0, which is v0.47.0's own look -- so the battery PINS that
 * look and puts the game back afterwards. The sides rule the game now ships
 * takes every face of a buried square out at source, and then this cull has
 * nothing left to take: the same toggle, at the shipped `rockSides` 2, leaves
 * 70,863 squares unbuilt over the battery (4,429 a frame) and paints NOT ONE
 * PIXEL differently in any of the 16 frames -- while the same comparison at the
 * look above moves millions. Both are asserted, the first as the count that
 * makes the second a measurement rather than a cull that never ran (lesson 19),
 * and the second because it is what the skin is for now: not a look of its own,
 * but not building the back of a hill nobody can see.
 */
const SKIN_CASES = [];
for (const seed of [1, 2, 3, 7]) {
  for (const up of [false, true]) {
    for (const turn of [0, 1]) SKIN_CASES.push({ seed: seed, up: up, turn: turn });
  }
}

await test('only the rock that touches open space is painted (v0.47.0)', async () => {
  const r = await page.evaluate((CASES) => {
    const t = window.__test;
    const isRock = (c) => !!c && c.h > 0 && TILE(c.tile).footing === 'block';
    /* The rule, worked out here from the world. A square with no piece beside it
       yet counts as OPEN, which is what `world.at()` says with an undefined. */
    const buried = (world, cell) => {
      const STEPS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let e = 0; e < 4; e++) {
        if (!isRock(world.at(cell.x + STEPS[e][0], cell.y + STEPS[e][1]))) return false;
      }
      return true;
    };
    /* What the picture built: the square's own number, and what was built there. */
    const squares = () => {
      const m = new Map();
      for (const it of Render.batch) {
        if (it.kind === 'cell') {
          m.set(it.i, it.cell.tile + ':' + it.cell.h + ':' + (it.cutaway ? 1 : 0));
        }
      }
      return m;
    };
    const standing = () => {
      let actors = 0, sites = 0;
      for (const it of Render.batch) {
        if (it.kind === 'actor') actors++;
        else if (it.kind === 'site') sites++;
      }
      return { actors: actors, sites: sites };
    };
    const out = [];
    t.pause(); t.unpoint();
    const wasSkin = t.wallSkin(), wasSides = t.rockSides();
    /* THE LOOK THESE NUMBERS WERE TAKEN ON (lesson 21). v0.47.0 recorded this
       battery with the back of the rock painted and merely CUT, and it is pinned
       there: the sides rule the game now ships takes every face of a buried
       square out at source, so at that look this cull has nothing left to take.
       What the skin does at the shipped look is measured in the same loop, and
       the answer is that it moves NO pixel at all -- it stops building a few
       thousand squares a frame and paints the identical picture. */
    t.rockSides(0);
    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.turn ? 1 : 0);
      t.settle();
      t.unpoint();
      const s = Game.state, world = s.world;
      let rockOn = 0, buriedOn = 0;
      for (const piece of world.live) {
        if (!Render.pieceOnScreen(s, piece)) continue;
        for (const cell of piece.cells) {
          if (!isRock(cell)) continue;
          rockOn++;
          if (buried(world, cell)) buriedOn++;
        }
      }
      t.wallSkin(false);
      t.redraw();
      const offC = t.consumed();
      const offRaw = Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
      const off = squares(), offWho = standing();
      let offBuried = 0;
      for (const it of Render.batch) {
        if (it.kind === 'cell' && buried(world, it.cell)) offBuried++;
      }
      const offMap = t.fillMap();
      t.redraw();
      t.wallSkin(true);
      t.redraw();
      const onC = t.consumed();
      const onRaw = Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
      const on = squares(), onWho = standing();
      let onBuried = 0;
      for (const it of Render.batch) {
        if (it.kind === 'cell' && buried(world, it.cell)) onBuried++;
      }
      const onMap = t.fillMap();
      t.redraw();
      /* 5. AND THE SAME TOGGLE AT THE LOOK THE GAME SHIPS MOVES NOTHING. Pinned
         back to `rockSides` 2, the skin leaves a few thousand squares a frame
         unbuilt and must paint the very same picture, because every face of a
         buried square already had rock in front of it and the sides rule had
         taken those faces out at source. The count on the left of the pair is
         what makes the zero on the right a measurement rather than a dead
         instrument (lesson 19): the same comparison, at the look of the battery
         above, moves 278,000-odd pixels. */
      let skinDiff = 0;
      for (let i = 0; i < offRaw.length; i += 4) {
        if (offRaw[i] !== onRaw[i] || offRaw[i + 1] !== onRaw[i + 1]
            || offRaw[i + 2] !== onRaw[i + 2]) skinDiff++;
      }
      t.rockSides(2);
      t.wallSkin(false);
      t.redraw();
      const shipOff = Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
      t.wallSkin(true);
      t.redraw();
      const shipC = t.consumed();
      const shipOn = Render.bctx.getImageData(0, 0, Render.w, Render.h).data;
      let shipDiff = 0;
      for (let i = 0; i < shipOff.length; i += 4) {
        if (shipOff[i] !== shipOn[i] || shipOff[i + 1] !== shipOn[i + 1]
            || shipOff[i + 2] !== shipOn[i + 2]) shipDiff++;
      }
      t.rockSides(0);
      /* What the cull took, whether anything came the other way, and whether a
         square that STAYED was built any differently. */
      const gone = new Set();
      let added = 0, moved = 0, removedBuried = 0;
      for (const i of off.keys()) if (!on.has(i)) gone.add(i);
      for (const [i, was] of off) {
        if (!on.has(i)) {
          if (buried(world, world.cells[i])) removedBuried++;
        } else if (on.get(i) !== was) moved++;
      }
      for (const i of on.keys()) if (!off.has(i)) added++;
      /* 4. Nothing left out can be pointed at. A dropped square is not in the
         batch at all, so this is `pickAt` answering about pixels where rock used
         to be -- at the centre of every culled square, and over the whole frame. */
      let asks = 0, onGone = 0;
      for (const i of gone) {
        const cell = world.cells[i];
        const p = Render.project(s, cell.x + 0.5, cell.y + 0.5, cell.h);
        const hit = Render.pickAt(s, p.x, p.y);
        asks++;
        if (gone.has(hit)) onGone++;
      }
      for (let y = 3; y < Render.h - 3; y += 11) {
        for (let x = 3; x < Render.w - 3; x += 11) {
          const hit = Render.pickAt(s, x, y);
          asks++;
          if (gone.has(hit)) onGone++;
        }
      }
      out.push({
        seed: c.seed, up: !!c.up, turn: c.turn,
        rockOn: rockOn, buriedOn: buriedOn,
        offDropped: offC.skinDropped, dropped: onC.skinDropped, kept: onC.skinKept,
        offBuried: offBuried, onBuried: onBuried,
        offCells: off.size, onCells: on.size,
        gone: gone.size, added: added, moved: moved, removedBuried: removedBuried,
        asks: asks, onGone: onGone,
        offActors: offWho.actors, onActors: onWho.actors,
        offSites: offWho.sites, onSites: onWho.sites,
        offWalls: offC.walls, onWalls: onC.walls,
        offWallPx: offC.wallPx, onWallPx: onC.wallPx,
        offCut: offC.cut, onCut: onC.cut,
        offDrawn: offC.count, onDrawn: onC.count,
        offGround: offMap.ground, onGround: onMap.ground,
        offBack: offMap.backdrop, onBack: onMap.backdrop,
        offWallMap: offMap.wall, onWallMap: onMap.wall,
        offOther: offMap.other, onOther: onMap.other,
        offFlat: offMap.flat, onFlat: onMap.flat,
        offMingled: offMap.mingled, onMingled: onMap.mingled,
        canvas: offMap.canvas,
        skinDiff: skinDiff, shipDiff: shipDiff, shipDropped: shipC.skinDropped
      });
    }
    t.wallSkin(wasSkin);
    t.rockSides(wasSides);
    t.unpoint();
    return { out: out, wasSkin: wasSkin, back: t.wallSkin(),
             wasSides: wasSides, backSides: t.rockSides(), cases: CASES.length };
  }, SKIN_CASES);
  const tot = { rockOn: 0, buriedOn: 0, offBuried: 0, onBuried: 0, dropped: 0, kept: 0,
                offDropped: 0, gone: 0, added: 0, moved: 0, removedBuried: 0,
                asks: 0, onGone: 0, offWalls: 0, onWalls: 0, offWallPx: 0, onWallPx: 0,
                offDrawn: 0, onDrawn: 0, offGround: 0, onGround: 0, offBack: 0,
                onBack: 0, offWallMap: 0, onWallMap: 0, offOther: 0, onOther: 0,
                offMingled: 0, onMingled: 0, offActors: 0, onActors: 0,
                offSites: 0, onSites: 0, canvas: 0, withGone: 0, movedViews: 0,
                skinDiff: 0, shipDiff: 0, shipDropped: 0 };
  assert(r.wasSkin === true && r.back === true,
    `the skin came back as ${r.back} where the game ships it at ${r.wasSkin}`);
  assert(r.backSides === r.wasSides,
    `the sides rule came back as ${r.backSides} where the battery found it at`
    + ` ${r.wasSides}, so a test that pins a look left the game on it`);
  assert(r.out.length === r.cases && r.out.length === 16,
    `${r.out.length} cases were run of ${r.cases} asked for`);
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}${q.turn ? ' turned' : ''}`;
    /* 1. THE RULE IS WHAT CULLED IT, and not one square that was built is buried.
       The arm with the skin off holds them in their thousands -- without that,
       nothing here can tell a cull from a build that never had any rock in it. */
    assert(q.buriedOn > 0 && q.rockOn > q.buriedOn,
      `${at}: the frame looked at ${q.rockOn} squares of rock of which ${q.buriedOn}`
      + ' have rock on all four sides, so there is nothing here to cull either way');
    assert(q.dropped === q.buriedOn && q.kept === q.rockOn - q.buriedOn,
      `${at}: the world holds ${q.rockOn} squares of rock in the pieces the frame`
      + ` looked at and ${q.buriedOn} of them are buried, where the frame counted`
      + ` ${q.dropped} dropped and ${q.kept} kept`);
    assert(q.offDropped === 0,
      `${at}: ${q.offDropped} squares were counted as dropped with the skin switched`
      + ' off, so the counters are counting something other than the skin');
    assert(q.offBuried > 0 && q.onBuried === 0,
      `${at}: ${q.offBuried} buried squares were in the picture with the skin off and`
      + ` ${q.onBuried} with it on`);
    /* 2. A SUBSET, and only ever a subset: nothing added, nothing that stayed
       built differently, and every square that left was buried rock. */
    assert(q.added === 0 && q.moved === 0,
      `${at}: the skin ADDED ${q.added} squares and built ${q.moved} of the squares`
      + ' it kept differently, where it is only allowed to leave rock out');
    assert(q.gone === q.removedBuried,
      `${at}: ${q.gone} squares left the picture and ${q.removedBuried} of them were`
      + ' buried rock');
    assert(q.offActors === q.onActors && q.offSites === q.onSites,
      `${at}: the picture holds ${q.offActors} -> ${q.onActors} crawlers and`
      + ` ${q.offSites} -> ${q.onSites} camp sites`);
    /* 3. THE ONLY THING IT CAN DO IS TAKE ROCK AWAY -- and it reached the
       picture rather than a counter. */
    assert(q.onWalls <= q.offWalls && q.onWallPx <= q.offWallPx
        && q.onDrawn <= q.offDrawn && q.onCut <= q.offCut,
      `${at}: the picture painted ${q.offWalls} -> ${q.onWalls} wall faces,`
      + ` ${q.offWallPx} -> ${q.onWallPx} pixels of wall and ${q.offDrawn} ->`
      + ` ${q.onDrawn} things, and left ${q.offCut} -> ${q.onCut} squares out whole`);
    assert(q.onWalls > 0 && q.onCells > 0,
      `${at}: the culled picture has ${q.onWalls} wall faces and ${q.onCells} squares`
      + ' in it -- a cull that leaves nothing has taken the world away, not the hill');
    /* NOT ONE PIXEL OF FLOOR MOVES. That is lesson 21's promise -- no square a
       crawler could stand on ever changes -- stated in pixels rather than in
       squares, and it is what would show if the cull were taking rock a hall
       runs through instead of rock behind rock. The fills that came through no
       door are a census of their own and are equally untouched, which is also
       what lets "the black is never more than the wall paint that went" be read
       as arithmetic: wall in, black out, nothing else in between. */
    assert(q.onGround === q.offGround && q.onFlat === q.offFlat,
      `${at}: the floor went ${q.offGround} -> ${q.onGround} pixels and the fills`
      + ` that came through no door went ${q.offFlat} -> ${q.onFlat}, where the`
      + ' cull is only allowed to take wall away');
    assert(q.onBack >= q.offBack,
      `${at}: the black behind the walls went ${q.offBack} -> ${q.onBack} pixels, so`
      + ' the rock that was taken away was not what was behind it');
    assert(q.onOther === 0 && q.offOther === 0,
      `${at}: ${q.offOther} -> ${q.onOther} pixels were covered by a material from`
      + ' somewhere that is neither the ground nor a wall');
    /* The census names every fill by the door it came through, so a pixel it
       cannot name is a blend or a pixel no fill ever touched: the antialiased
       hairline, which is 5-8% of a picture either way. What matters here is
       that the cull neither smears it nor fills it in -- and that number is why
       this bound is a tolerance and not a zero: a census that counted only the
       fills it owns would be a census of a picture nobody drew. */
    assert(Math.abs(q.onMingled - q.offMingled) <= q.canvas * 0.01,
      `${at}: ${q.offMingled} -> ${q.onMingled} pixels came out a colour the census`
      + ` does not know, more than the ${Math.round(q.canvas * 0.01)} a hairline may`
      + ' move, so the cull is smearing the picture rather than revealing it');
    /* 4. And nothing the picture left out can be pointed at. */
    assert(q.asks > 1000 && q.onGone === 0,
      `${at}: ${q.onGone} of ${q.asks} answers named a square the cull had taken out`
      + ' of the picture');
    /* 5. AND AT THE LOOK THE GAME SHIPS THE SAME TOGGLE MOVES NOT ONE PIXEL --
       while still leaving squares out of the build, which is what makes the zero
       about the picture and not about a cull that never ran. */
    assert(q.skinDiff > 0 && q.shipDiff === 0 && q.shipDropped > 0,
      `${at}: the skin moved ${q.skinDiff} pixels at the look of this battery and`
      + ` ${q.shipDiff} at the look the game ships, having left ${q.shipDropped}`
      + ' squares a frame unbuilt at both, where the shipped look already had those'
      + ' faces culled by the sides rule and must paint the same picture');
    tot.rockOn += q.rockOn; tot.buriedOn += q.buriedOn; tot.offBuried += q.offBuried;
    tot.onBuried += q.onBuried; tot.dropped += q.dropped; tot.kept += q.kept;
    tot.offDropped += q.offDropped;
    tot.gone += q.gone; tot.added += q.added; tot.moved += q.moved;
    tot.removedBuried += q.removedBuried;
    tot.asks += q.asks; tot.onGone += q.onGone;
    tot.offWalls += q.offWalls; tot.onWalls += q.onWalls;
    tot.offWallPx += q.offWallPx; tot.onWallPx += q.onWallPx;
    tot.offDrawn += q.offDrawn; tot.onDrawn += q.onDrawn;
    tot.offGround += q.offGround; tot.onGround += q.onGround;
    tot.offBack += q.offBack; tot.onBack += q.onBack;
    tot.offWallMap += q.offWallMap; tot.onWallMap += q.onWallMap;
    tot.offOther += q.offOther; tot.onOther += q.onOther;
    tot.offMingled += q.offMingled; tot.onMingled += q.onMingled;
    tot.offActors += q.offActors; tot.onActors += q.onActors;
    tot.offSites += q.offSites; tot.onSites += q.onSites;
    tot.canvas += q.canvas;
    tot.skinDiff += q.skinDiff; tot.shipDiff += q.shipDiff;
    tot.shipDropped += q.shipDropped;
    if (q.gone > 0) tot.withGone++;
    if (q.offWallPx !== q.onWallPx) tot.movedViews++;
  }
  /* AND THE WHOLE THING IS NOT A COUNTER THAT NEVER FIRED. */
  assert(tot.dropped > 0 && tot.gone > 0 && tot.offBuried > 0,
    `${tot.dropped} squares were culled over ${r.out.length} cases and ${tot.gone}`
    + ` squares left the picture, with ${tot.offBuried} buried squares in it before`
    + ' -- nothing here was culled at all');
  assert(tot.withGone === r.out.length && tot.movedViews === r.out.length,
    `only ${tot.withGone} of the ${r.out.length} cases had anything culled out of`
    + ` them and ${tot.movedViews} of them had fewer pixels of wall painted, so the`
    + ' range was not run');
  assert(tot.offActors > 0 && tot.offActors === tot.onActors
      && tot.offSites === tot.onSites,
    `${tot.offActors} -> ${tot.onActors} crawlers and ${tot.offSites} ->`
    + ` ${tot.onSites} camp sites were on the picture over the whole battery, so`
    + ' either there was nobody to lose or the cull lost them');
  assert(tot.offBack === 0,
    `${tot.offBack} pixels of backdrop are in the old picture over the whole`
    + ' battery, so "the black only ever grows" is not being asked of anything');
  assert(tot.onBack > 0,
    'not one pixel of black opened up anywhere in the battery');
  /* AND THE SAME TOGGLE AT THE LOOK THE GAME SHIPS IS INVISIBLE, over the whole
     battery: 70,863 squares left unbuilt over the 16 frames (4,429 a frame), and
     not one pixel different in any of them -- while the same comparison at the
     look above moves millions. That is what the skin is for now: not a look of
     its own, but not building the back of a hill nobody can see. */
  assert(tot.skinDiff > 0 && tot.shipDiff === 0 && tot.shipDropped > 0,
    `over ${r.out.length} cases the skin moved ${tot.skinDiff} pixels at the look`
    + ` of this battery but ${tot.shipDiff} at the look the game ships, having left`
    + ` ${tot.shipDropped} squares a frame unbuilt`);
  /* MOST OF WHAT WAS CULLED WAS ALREADY COVERED, to the pixel, by rock that
     stays -- which is what makes this a change to the SHAPE of the hill rather
     than a window into it. So the paint that leaves is under a tenth of the
     wall, and almost all of what leaves becomes black; and the floor does not
     move at all, over the whole battery and not merely in one picture. */
  const took = tot.offWallMap - tot.onWallMap, black = tot.onBack - tot.offBack;
  assert(tot.onWalls <= tot.offWalls * 0.75 && tot.onWallPx <= tot.offWallPx * 0.75,
    `the cull left ${tot.offWalls} -> ${tot.onWalls} wall faces and`
    + ` ${tot.offWallPx} -> ${tot.onWallPx} pixels of wall over the battery,`
    + ' which is not the hill losing the back quarter of itself');
  assert(took > 0 && took < tot.offWallMap * 0.1,
    `the cull took ${took} of the ${tot.offWallMap} pixels of wall in the old`
    + ` picture (${(100 * took / tot.offWallMap).toFixed(1)}%), where most of what`
    + ' it takes was already covered and the wall should not lose a tenth of'
    + ' itself');
  assert(black > took * 0.5 && black <= took,
    `the black grew by ${black} pixels where ${took} pixels of wall were taken`
    + ` away (${(100 * black / took).toFixed(1)}%), so what was culled was not rock`
    + ' standing behind other rock -- nearly all of what goes should come out'
    + ' black, and never more than went');
  assert(tot.onGround === tot.offGround && tot.onFlat === tot.offFlat,
    `over the whole battery the floor went ${tot.offGround} -> ${tot.onGround}`
    + ` pixels and the fills from no door went ${tot.offFlat} -> ${tot.onFlat},`
    + ' where taking the back of a hill away is allowed to take neither');
  console.log(`  ... ${r.out.length} cases of one tile of wall: `
    + `${tot.dropped} squares of rock with rock on all four sides culled out of`
    + ` ${tot.rockOn}, ${tot.offBuried} of them in the old picture and`
    + ` ${tot.onBuried} in the new; wall faces ${tot.offWalls} -> ${tot.onWalls}`
    + ` (${(100 * (1 - tot.onWalls / tot.offWalls)).toFixed(1)}% fewer), pixels of`
    + ` wall ${tot.offWallMap} -> ${tot.onWallMap}, black ${tot.offBack} ->`
    + ` ${tot.onBack} (${(100 * black / took).toFixed(1)}% of what was taken),`
    + ` ground ${tot.offGround} -> ${tot.onGround} to the pixel,`
    + ` ${tot.asks} answers asked over the culled squares and none of them naming`
    + ` one; and the same toggle at the shipped look moves ${tot.shipDiff} pixels`
    + ` where this look moves ${tot.skinDiff}, having left ${tot.shipDropped}`
    + ' squares a frame unbuilt');
});

/* ONLY THE SIDES OF A WALL THAT FACE OPEN GROUND ARE SHOWN (v0.48.0)
 *
 * A block paints the two of its four sides that face the camera. Where one of
 * those sides stands against ROCK it was painted anyway, cut down to whatever
 * the rock in front reached -- and v0.47.0 took that rock out of the picture, so
 * there was nothing left to cut the side down to and it was handed back whole:
 * eight metres of wall hanging over the black, and over whatever lay behind it.
 * That is the artifact this is about, and the rule that removes it is the one
 * the game ships: **a side with rock in front of it is not drawn at all, so a
 * wall seen from its rock side is see-through.**
 *
 * WHAT IT COSTS is rock that was genuinely visible. Where the block in front is
 * LOWER than we are, the strip of our side standing above it was rock anybody
 * could see; it goes with the rest, and you look over that block and out into
 * black. The setting that keeps those strips is `rockSides` 1 and the setting
 * that draws them the v0.47.0 way -- whole -- is 0, and both are one number
 * away, because a look is a setting and not a row of the sheet.
 *
 * WHAT IT BUYS is that the picture stops pretending to be solid where nothing
 * is, which is what was asked for in as many words.
 *
 * THREE THINGS ARE PROVED HERE, and none of them is argued:
 *
 *  1. THE COUNT IS A QUESTION ABOUT THE WORLD, and a second walk agrees with it.
 *     How many side faces had rock in front of them -- in the picture or not --
 *     is re-derived here from `Render.batch` and `world.at()`, with `clipFaces()`'s
 *     own edge arithmetic, and it must equal the counter the drawing kept, in
 *     BOTH arms. Without that, "nothing was shown" would pass just as well on a
 *     frame that never had a rock-facing side in it at all.
 *  2. THE SHIPPED ARM SHOWS NONE OF THEM, and the arm one number away shows
 *     thousands -- side by side in ONE build (lesson 21), so the zero is a
 *     measurement and not an empty world.
 *  3. NOTHING ELSE MOVED. The rock skin culls exactly as much either way; every
 *     rock-facing face that was shown becomes wall paint that is not there; the
 *     black only ever grows and the floor only ever gains, because a wall taken
 *     out of the picture reveals whatever it was covering -- floor, a further
 *     wall's own fading edge, or black -- and hides nothing; the crawlers and the
 *     camp sites are the same list; and over hundreds of thousands of answers
 *     from `pickAt`, NOT ONE point the old picture answered as ground, as a
 *     crawler or as a camp site answers differently. That last one is a theorem
 *     rather than luck, and worth saying why: `pickAt` answers the LAST shape
 *     containing the point, so taking shape `j` out of the list can only change
 *     the answer at a point where `j` was the answer -- and the only shapes this
 *     takes out are the side faces of rock-facing sides, so the only points that
 *     can change are points that answered ROCK.
 *
 * Printed by its own battery over 64 cases (4 seeds x 2 angles x 4 quarters x 2
 * zooms, and every one of them a frame of its own): 9,591 side faces stood
 * against rock and 8,288 of them were shown in the old picture -- 22,909 metres
 * of wall, 23,458,816 pixels of it -- and 0 were shown in the new one, 0 metres,
 * 0 pixels. Wall paint 12,684 -> 4,396 faces, the dark 2,991,701 -> 6,627,712
 * pixels and the floor 9,513,787 -> 11,630,904, so 2,117,117 pixels of floor came
 * back into view behind the walls that went. Of 196,608 answers from `pickAt`,
 * 49,112 changed and every one of them was rock in the old picture, 29,844 of
 * those now answering nothing at all -- and 3,452 answers named a crawler or a
 * camp site before where 3,476 do now, because 24 of the points a wall was
 * covering were people.
 *
 * THOSE FIGURES ARE THE ONES AFTER THE FLAP WAS FIXED, and 93 of the 9,591 are
 * the fix. v0.48.0's own clip loop stopped one short of the end of the list, on
 * the argument that nothing can be painted after the last thing -- true of the
 * picture, and false of this question, which also asks whether rock stands in
 * front of a face in the WORLD. So the frontmost block of each frame kept
 * `nbrL/nbrR` at -1 and was handed its sides WHOLE: two faces a frame hanging
 * over open floor, which is precisely the artifact this release exists to
 * remove. The counters read 9,498 / 8,195 with the flap there. Nothing else
 * about the battery moved by more than a rounding of the same faces -- and the
 * v0.47.0 skin battery above comes out identical to the pixel either way, which
 * is the check that the fix did not quietly repaint the look it was not about.
 */
const STONE_CASES = [];
for (const seed of [1, 2, 7, 777]) {
  for (const up of [false, true]) {
    for (const turn of [0, 1, 2, 3]) {
      for (const zoom of [1, 2]) {
        STONE_CASES.push({ seed: seed, up: up, turn: turn, zoom: zoom });
      }
    }
  }
}

await test('only the sides of a wall facing open ground are shown (v0.48.0)', async () => {
  const r = await page.evaluate((CASES) => {
    const t = window.__test;
    const isRock = (c) => !!c && c.h > 0 && TILE(c.tile).footing === 'block';
    const CODE = { nothing: 0, ground: 1, rock: 2, crawler: 3, camp: 4 };

    /* WHICH SIDES HAVE ROCK IN FRONT OF THEM, worked out here from the world
       rather than read off the flag the drawing set -- a test that reads the flag
       is asking the code whether it agrees with itself. This is `clipFaces()`
       exactly: the two faces a block shows, the edge each one stands on (named
       by the corner it runs from, whichever of the two is not the near one), the
       square one step off that edge, and whether that square is rock and paints
       after us. */
    const sidesFacingRock = (s, it, k, at) => {
      const cell = it.cell;
      let n = 0;
      for (let f = 0; f < 2; f++) {
        const other = f === 0 ? it.cornerL : it.cornerR;
        const e = other === (it.near + 1) % 4 ? it.near : other;
        const nx = cell.x + EDGE_STEP[e][0], ny = cell.y + EDGE_STEP[e][1];
        const nbr = s.world.at(nx, ny);
        if (!isRock(nbr)) continue;
        const nk = at.get(nbr);
        if (nk === undefined) {
          /* A square the picture has not got, and there is more than one reason
             for that: the skin dropped it, the screen cut it, its whole piece is
             off it. It answers "am I in front" the only way it can, by its own
             depth -- which is what the build asks it too. */
          if (!(Render.depth(s, nx + 0.5, ny + 0.5) > it.depth)) continue;
        } else {
          if (nk <= k) continue;                     /* painted before this face */
          if (nbr.slope !== SLOPE_FLAT || nbr.h <= 0) continue;
        }
        n++;
      }
      return n;
    };
    /* The whole frame's worth of them, under the same guards the build uses to
       decide which squares have their faces worked out at all. EVERY square in
       the list is asked about, the last one included: v0.48.0 found the build's
       own clip loop stopping one short of the end, on the argument that nothing
       can be painted after the last thing -- true of the PICTURE, and false of
       this question, because a side also asks whether rock stands in front of it
       in the WORLD, and the answer to that does not care where the rock sits in
       the list. Left unassigned, the frontmost block's sides were handed back
       whole, which is a flap of wall over open floor. Measured before the fix:
       the drawing counted 276 where this walk found 275. */
    const countSides = (s) => {
      const b = Render.batch, at = new Map();
      for (let k = 0; k < b.length; k++) if (b[k].kind === 'cell') at.set(b[k].cell, k);
      let n = 0;
      for (let k = 0; k < b.length; k++) {
        const it = b[k];
        if (it.kind !== 'cell' || !it.solid) continue;
        if (it.cell.slope !== SLOPE_FLAT) continue;
        n += sidesFacingRock(s, it, k, at);
      }
      return n;
    };
    /* WHAT THE POINTER ANSWERS, at the same points in both arms, in the four
       classes a person would use -- the three runs of numbers `pickAt` hands
       back, with the cells split into the ground you can stand on and the rock
       you cannot. */
    const walk = (s, pts) => {
      const world = s.world, nc = world.cells.length, na = s.actors.length;
      const tally = { nothing: 0, ground: 0, rock: 0, crawler: 0, camp: 0 };
      const codes = new Uint8Array(pts.length >> 1);
      for (let p = 0, q = 0; p < pts.length; p += 2, q++) {
        const hit = Render.pickAt(s, pts[p], pts[p + 1]);
        let k = 'nothing';
        if (hit >= 0) {
          if (hit < nc) k = isRock(world.cells[hit]) ? 'rock' : 'ground';
          else if (hit < nc + na) k = 'crawler';
          else k = 'camp';
        }
        tally[k]++;
        codes[q] = CODE[k];
      }
      return { tally: tally, codes: codes };
    };

    const out = [];
    const pics = new Set();
    t.pause(); t.unpoint();
    const was = t.rockSides();
    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.turn);
      t.settle();
      t.zoom(c.zoom);
      t.unpoint();
      const s = Game.state;
      /* The same points asked in both arms, and both arms are the same buffer --
         the setting does not touch the camera. A grid every 11 pixels lands on
         wall sides (which are tens of pixels across) rather than sampling them
         by luck. */
      const pts = [];
      for (let py = 3; py < Render.h - 3; py += 11) {
        for (let px = 3; px < Render.w - 3; px += 11) pts.push(px, py);
      }
      const row = { seed: c.seed, up: !!c.up, turn: c.turn, zoom: c.zoom, asks: 0, sides: 0 };
      const shot = [];
      for (const arm of [0, 2]) {
        t.rockSides(arm);
        t.redraw();
        const con = t.consumed();
        const sides = countSides(s);
        row.sides = sides;
        const asked = walk(s, pts);
        let actors = 0, sites = 0;
        for (const it of Render.batch) {
          if (it.kind === 'actor') actors++;
          else if (it.kind === 'site') sites++;
        }
        /* THE PICTURE ITSELF, kept before `fillMap()` repaints its colours over
           it -- this is what a person is looking at, and comparing the two arms'
           copies of it needs no agreement about what any colour means. */
        const raw = new Uint8Array(Render.bctx.getImageData(0, 0, Render.w, Render.h).data);
        const map = t.fillMap();
        /* AND THE SAME FRAME IN `fillMap()`'s OWN COLOURS, one ink per kind of
           paint, so a pixel says WHAT PAINTED IT. In that copy a colour can only
           be one of six by construction, so two arms can be compared pixel by
           pixel with no room for a shade of rock to be mistaken for the dark. */
        const kinds = new Uint8Array(Render.bctx.getImageData(0, 0, Render.w, Render.h).data);
        shot.push({ raw: raw, kinds: kinds, con: con, map: map, asked: asked,
                    sides: sides, actors: actors, sites: sites });
      }
      const offS = shot[0], onS = shot[1];
      /* WHAT THE CAMERA WAS ACTUALLY POINTED AT. Sixty-four cases must reach
         sixty-four different frames: a battery that re-measures one frozen
         picture is the failure lesson 27 writes down, and it reports as a result
         rather than as a mistake. So the old arm's own pixels are hashed and the
         distinct answers counted -- the seeds, tilts, turns and zooms must all be
         doing something. */
      let dig = 2166136261;
      for (let i = 0; i < offS.raw.length; i += 8) {
        dig = Math.imul(dig ^ offS.raw[i], 16777619) >>> 0;
      }
      pics.add(dig + ':' + Render.w + 'x' + Render.h);
      /* WHERE THE TWO PICTURES DIFFER. `moved` is how much of what a person sees
         the rule touched. Then, kind by kind: a pixel that was dark must still be
         dark, and a pixel that was floor must still be floor, because the shipped
         picture paints a SUBSET of the old one's shapes at the same places in the
         same order -- so it can only ever uncover, never cover. Counted here
         instead of argued. */
      const INK = new Map();
      const pack = (r, g, b) => (r << 16) | (g << 8) | b;
      const given = (hex) => pack(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16),
                                  parseInt(hex.slice(5, 7), 16));
      for (const [name, hex] of [['plain', '#fe00fe'], ['ground', '#00fe00'],
                                 ['wall', '#0000fe'], ['other', '#fefe00'],
                                 ['band', '#00fefe'], ['dark', BACKDROP]]) {
        INK.set(given(hex), name);
      }
      let moved = 0, darkToPaint = 0, paintToDark = 0, darkStays = 0;
      let groundToOther = 0, otherToGround = 0, offDark = 0, onDark = 0;
      const offInk = { plain: 0, ground: 0, wall: 0, other: 0, band: 0, dark: 0, mix: 0 };
      const onInk = { plain: 0, ground: 0, wall: 0, other: 0, band: 0, dark: 0, mix: 0 };
      for (let i = 0; i < offS.raw.length; i += 4) {
        if (offS.raw[i] !== onS.raw[i] || offS.raw[i + 1] !== onS.raw[i + 1]
            || offS.raw[i + 2] !== onS.raw[i + 2]) moved++;
        const c0 = INK.get(pack(offS.kinds[i], offS.kinds[i + 1], offS.kinds[i + 2]));
        const c1 = INK.get(pack(onS.kinds[i], onS.kinds[i + 1], onS.kinds[i + 2]));
        offInk[c0 === undefined ? 'mix' : c0]++;
        onInk[c1 === undefined ? 'mix' : c1]++;
        if (c0 === 'dark') offDark++;
        if (c1 === 'dark') onDark++;
        if (c0 === 'dark' && c1 === 'dark') { darkStays++; continue; }
        if (c0 === 'dark') darkToPaint++;
        else if (c1 === 'dark') paintToDark++;
        if (c0 === 'ground' && c1 !== 'ground') groundToOther++;
        else if (c0 !== 'ground' && c1 === 'ground') otherToGround++;
      }
      for (const arm of [0, 2]) {
        const q = arm === 0 ? offS : onS, con = q.con;
        row[arm === 0 ? 'off' : 'on'] = {
          sides: q.sides, stoneSides: con.stoneSides,
          shown: con.stoneShown, metres: con.stoneM, px: con.stonePx,
          walls: con.walls, wallPx: con.wallPx, drawn: con.count,
          dropped: con.skinDropped, skinKept: con.skinKept,
          backKept: con.kept, lost: con.lost, stumps: con.stumps,
          ground: q.map.ground, back: q.map.backdrop, flat: q.map.flat,
          plain: q.map.plain, wall: q.map.wall, other: q.map.other,
          band: q.map.band, mingled: q.map.mingled, canvas: q.map.canvas,
          actors: q.actors, sites: q.sites, tally: q.asked.tally, codes: q.asked.codes
        };
      }
      row.offInk = offInk; row.onInk = onInk;
      row.moved = moved; row.darkToPaint = darkToPaint;
      row.paintToDark = paintToDark; row.darkStays = darkStays;
      row.groundToOther = groundToOther; row.otherToGround = otherToGround;
      row.offDark = offDark; row.onDark = onDark;
      t.redraw();
      const off = row.off, on = row.on;
      /* 3. WHAT THE POINTER ANSWERS, POINT BY POINT. A point may change class,
         and it may only ever change FROM rock -- the theorem in the prose above,
         measured instead of asserted. */
      let changed = 0, wasRock = 0, toNothing = 0;
      for (let q = 0; q < off.codes.length; q++) {
        if (off.codes[q] === on.codes[q]) continue;
        changed++;
        if (off.codes[q] === CODE.rock) {
          wasRock++;
          if (on.codes[q] === CODE.nothing) toNothing++;
        }
      }
      row.asks = off.tally.nothing + off.tally.ground + off.tally.rock
               + off.tally.crawler + off.tally.camp;
      row.changed = changed; row.wasRock = wasRock; row.toNothing = toNothing;
      row.offGround = off.tally.ground; row.onGround = on.tally.ground;
      row.offRock = off.tally.rock; row.onRock = on.tally.rock;
      row.offPeople = off.tally.crawler + off.tally.camp;
      row.onPeople = on.tally.crawler + on.tally.camp;
      out.push(row);
    }
    t.rockSides(was);
    t.unpoint();
    return { out: out, was: was, back: t.rockSides(),
             cases: CASES.length, pics: pics.size };
  }, STONE_CASES);
  const tot = { sides: 0, offShown: 0, offM: 0, offPx: 0, onShown: 0, onM: 0, onPx: 0,
                offWalls: 0, onWalls: 0, offWallPx: 0, onWallPx: 0,
                offDrawn: 0, onDrawn: 0, offGround: 0, onGround: 0,
                offBack: 0, onBack: 0, offDark: 0, onDark: 0,
                offActors: 0, onActors: 0, offSites: 0, onSites: 0,
                asks: 0, changed: 0, wasRock: 0, toNothing: 0,
                offRock: 0, onRock: 0, offPeople: 0, onPeople: 0,
                moved: 0, darkToPaint: 0, paintToDark: 0, darkStays: 0,
                groundToOther: 0, otherToGround: 0,
                withShown: 0, withMoved: 0 };
  assert(r.was === 2 && r.back === 2,
    `the setting came back as ${r.back} where the game ships it at ${r.was}`);
  assert(r.out.length === r.cases && r.out.length === 64,
    `${r.out.length} cases were run of ${r.cases} asked for`);
  assert(r.pics === r.cases,
    `the ${r.cases} cases reached ${r.pics} different frames, so the seeds, tilts,` +
    ' turns and zooms are not all doing anything and the range was not run');
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''} quarter ${q.turn} zoom ${q.zoom}`;
    /* 0. THE RULER ITSELF. The walk below sorts every pixel by its COLOUR in the
       `fillMap()` pass; the census sorts the same frame by which DOOR each fill
       came out of. Seven ways for them to disagree, and if any did, every number
       after this one is about a picture neither of them painted. */
    const inks = [['plain', 'plain'], ['ground', 'ground'], ['wall', 'wall'],
                  ['other', 'other'], ['band', 'band'], ['dark', 'back'],
                  ['mix', 'mingled']];
    const offInk = q.offInk, onInk = q.onInk;
    const wrong = inks.filter(([m, th]) =>
      offInk[m] !== q.off[th] || onInk[m] !== q.on[th]);
    assert(wrong.length === 0,
      `${at}: a walk of the frame by colour and the census by the door each fill`
      + ` came out of disagree about ${wrong.length} of the seven kinds of paint`
      + ` (${wrong.map((w) => w[0]).join(', ')}), so these two are not measuring`
      + ' the same frame');
    /* 1. THE COUNT IS A QUESTION ABOUT THE WORLD, and the drawing's own counter
       is the number a second walk gives -- in both arms, because it is a fact
       about the world and the setting may not touch it. */
    assert(q.sides > 0 && q.off.sides === q.sides && q.on.sides === q.sides,
      `${at}: ${q.off.sides} side faces stood against rock in the old picture and`
      + ` ${q.on.sides} in the new one, where a second walk over the batch finds`
      + ` ${q.sides} -- either the arms disagree about the world or there is`
      + ' nothing here for the rule to be about');
    assert(q.off.stoneSides === q.off.sides && q.on.stoneSides === q.on.sides,
      `${at}: the drawing counted ${q.off.stoneSides} -> ${q.on.stoneSides} rock-facing`
      + ` faces where a walk of the world finds ${q.off.sides} -> ${q.on.sides}, so`
      + ' the counter is counting something other than the sides of the walls');
    /* 2. THE RULE. The arm one number away shows thousands of them, over the
       whole battery; the shipped arm shows not one, of any height or any width. */
    assert(q.off.shown > 0 && q.off.metres > 0 && q.off.px > 0,
      `${at}: the old picture showed ${q.off.shown} of those ${q.sides} faces`
      + ` (${q.off.metres} m, ${q.off.px} px), so this case cannot tell the rule`
      + ' from a frame with no rock-facing wall in it');
    assert(q.on.shown === 0 && q.on.metres === 0 && q.on.px === 0,
      `${at}: the shipped picture shows ${q.on.shown} faces standing against rock,`
      + ` ${q.on.metres} m of them and ${q.on.px} px, where the whole rule is that`
      + ' a side with rock behind it is not drawn at all');
    /* 3. AND NOTHING ELSE MOVED. The skin is the dial beside this one and culls
       exactly as much either way; the wall can only lose paint; the black can
       only grow; the floor keeps every pixel; the people are the same list. */
    assert(q.on.dropped === q.off.dropped && q.on.skinKept === q.off.skinKept,
      `${at}: the rock skin went ${q.off.dropped} -> ${q.on.dropped} squares culled`
      + ` and ${q.off.skinKept} -> ${q.on.skinKept} kept, where this setting is not`
      + ' the skin and may not touch it');
    assert(q.on.walls <= q.off.walls && q.on.wallPx <= q.off.wallPx
        && q.on.drawn <= q.off.drawn,
      `${at}: the picture painted ${q.off.walls} -> ${q.on.walls} wall faces,`
      + ` ${q.off.wallPx} -> ${q.on.wallPx} pixels of wall and ${q.off.drawn} ->`
      + ` ${q.on.drawn} things, where taking sides away can only take paint`);
    assert(q.on.back >= q.off.back,
      `${at}: the black went ${q.off.back} -> ${q.on.back} pixels, so what was`
      + ' removed was not wall standing over the backdrop');
    /* WHERE THE TWO PICTURES DIFFER, and the two facts that make the difference
       safe. The shipped picture paints a subset of the old one's shapes at the
       same places in the same order, so a pixel can only ever go from paint to
       dark, never the other way, and floor can only be uncovered, never covered. */
    assert(q.offDark === q.off.back && q.onDark === q.on.back,
      `${at}: the census found ${q.off.back} -> ${q.on.back} unpainted pixels and a`
      + ` walk of the same frame ${q.offDark} -> ${q.onDark}, so the two are`
      + ' measuring different things');
    assert(q.darkToPaint === 0,
      `${at}: ${q.darkToPaint} pixels that nothing painted in the old picture were`
      + ' painted in the new one, where the new picture draws a subset of the same'
      + ' shapes in the same order and so can only ever put dark IN');
    assert(q.onDark >= q.offDark,
      `${at}: the dark went ${q.offDark} -> ${q.onDark} pixels, so what was taken`
      + ' out of the picture was not wall standing over the dark');
    assert(q.groundToOther === 0,
      `${at}: ${q.groundToOther} pixels that were floor stopped being floor, where`
      + ' taking wall away can only ever uncover floor');
    assert(q.moved > 0,
      `${at}: the two pictures are identical, so this case is not evidence about`
      + ' the rule at all');
    assert(q.on.ground >= q.off.ground,
      `${at}: the floor went ${q.off.ground} -> ${q.on.ground} pixels, so removing`
      + ' wall hid floor that was visible, which nothing can do');
    assert(q.on.actors === q.off.actors && q.on.sites === q.off.sites,
      `${at}: the picture holds ${q.off.actors} -> ${q.on.actors} crawlers and`
      + ` ${q.off.sites} -> ${q.on.sites} camp sites`);
    assert(q.on.lost === 0 && q.on.backKept === q.off.backKept,
      `${at}: ${q.on.lost} faces were left cut away with nothing painted in front`
      + ` and ${q.off.backKept} -> ${q.on.backKept} faces were handed back whole,`
      + ' where this setting adds no holes and takes none away');
    /* 4. AND NO ANSWER CHANGED EXCEPT ONE THAT WAS ROCK. Counted, per case, over
       the whole frame: every point that answers differently is a point the old
       picture answered as ROCK, and most of those now answer nothing at all. */
    assert(q.asks > 1000 && q.changed === q.wasRock,
      `${at}: ${q.changed} of ${q.asks} points answer differently and ${q.wasRock}`
      + ' of those were rock in the old picture, where taking a shape out of the'
      + ' list may only change an answer that shape was giving');
    assert(q.offGround > 0 && q.onGround > 0 && q.offPeople > 0 && q.onPeople > 0,
      `${at}: ${q.offGround} -> ${q.onGround} points answered ground and`
      + ` ${q.offPeople} -> ${q.onPeople} answered a crawler or a camp site, so`
      + ' "none of those changed" is being asked of something that exists');
    tot.sides += q.sides; tot.offShown += q.off.shown; tot.offM += q.off.metres;
    tot.offPx += q.off.px; tot.onShown += q.on.shown; tot.onM += q.on.metres;
    tot.onPx += q.on.px;
    tot.offWalls += q.off.walls; tot.onWalls += q.on.walls;
    tot.offWallPx += q.off.wallPx; tot.onWallPx += q.on.wallPx;
    tot.offDrawn += q.off.drawn; tot.onDrawn += q.on.drawn;
    tot.offGround += q.off.ground; tot.onGround += q.on.ground;
    tot.offBack += q.off.back; tot.onBack += q.on.back;
    tot.offDark += q.offDark; tot.onDark += q.onDark;
    tot.moved += q.moved; tot.darkToPaint += q.darkToPaint;
    tot.paintToDark += q.paintToDark; tot.darkStays += q.darkStays;
    tot.groundToOther += q.groundToOther; tot.otherToGround += q.otherToGround;
    tot.offActors += q.off.actors; tot.onActors += q.on.actors;
    tot.offSites += q.off.sites; tot.onSites += q.on.sites;
    tot.asks += q.asks; tot.changed += q.changed; tot.wasRock += q.wasRock;
    tot.toNothing += q.toNothing;
    tot.offRock += q.offRock; tot.onRock += q.onRock;
    tot.offPeople += q.offPeople; tot.onPeople += q.onPeople;
    if (q.off.shown > 0) tot.withShown++;
    if (q.moved > 0) tot.withMoved++;
  }
  /* AND THE WHOLE THING IS NOT A COUNTER THAT NEVER FIRED. */
  assert(tot.offShown > 0 && tot.offM > 0 && tot.withShown === r.out.length,
    `${tot.offShown} faces of ${tot.sides} were shown over ${r.out.length} cases`
    + ` and ${tot.withShown} of them showed any, so the rule was not asked of the`
    + ' whole range');
  assert(tot.onShown === 0 && tot.onM === 0 && tot.onPx === 0,
    `the shipped picture shows ${tot.onShown} faces, ${tot.onM} m and ${tot.onPx} px`
    + ' of wall standing against rock over the whole battery');
  assert(tot.withMoved === r.out.length && tot.moved > 0,
    `only ${tot.withMoved} of the ${r.out.length} cases painted any differently,`
    + ` and ${tot.moved} pixels differ over the whole battery, so the range was`
    + ' not run');
  /* The dark may only ever GROW, and it may only grow by what the removed walls
     were standing over: not one pixel that nothing painted may come out painted,
     and every pixel newly dark is by definition one that moved. The floor can be
     uncovered; it can never be covered. */
  assert(tot.darkToPaint === 0,
    `${tot.darkToPaint} pixels that nothing painted were painted over by the new`
    + ' picture, where it paints a subset of the same shapes in the same order and'
    + ' so cannot cover anything the old one left showing');
  assert(tot.onDark - tot.offDark === tot.paintToDark - tot.darkToPaint,
    `the dark grew by ${tot.onDark - tot.offDark} pixels where ${tot.paintToDark}`
    + ` moved pixels came out dark and ${tot.darkToPaint} went the other way`);
  assert(tot.onDark > tot.offDark,
    `the dark went ${tot.offDark} -> ${tot.onDark} pixels over the whole battery,`
    + ' so the pictures differ somewhere other than the dark and this is not the'
    + ' change it claims to be');
  assert(tot.groundToOther === 0,
    `${tot.groundToOther} pixels that were floor stopped being floor over the`
    + ' whole battery, where taking wall out of the picture can only uncover'
    + ' floor, never cover it');
  assert(tot.otherToGround > 0 && tot.onGround > tot.offGround,
    `the floor went ${tot.offGround} -> ${tot.onGround} pixels and only`
    + ` ${tot.otherToGround} of them were uncovered behind a wall that went, where`
    + ' the point of the rule is that the room behind the wall is now in view');
  assert(tot.offActors > 0 && tot.offActors === tot.onActors
      && tot.offSites === tot.onSites && tot.onSites > 0,
    `${tot.offActors} -> ${tot.onActors} crawlers and ${tot.offSites} ->`
    + ` ${tot.onSites} camp sites were on the picture over the whole battery, so`
    + ' either there was nobody to lose or this lost them');
  assert(tot.changed === tot.wasRock && tot.wasRock > 0,
    `${tot.changed} answers changed over the battery and ${tot.wasRock} of them`
    + ' were rock in the old picture -- a change anywhere else would mean this'
    + ' took something that was not a wall standing against rock');
  assert(tot.toNothing > 0 && tot.toNothing <= tot.wasRock,
    `${tot.toNothing} of the ${tot.wasRock} rock answers that changed came out`
    + ' as nothing at all');
  /* WHAT IT COSTS AND WHAT IT BUYS, in pixels: the wall loses paint, the dark and
     the floor both gain, and the people are where they were. These are the
     numbers a session that wants the strips back (the setting at 1) has to move. */
  const floorGain = tot.onGround - tot.offGround;
  const darkGain = tot.onDark - tot.offDark;
  const darkShare = (100 * darkGain / Math.max(1, darkGain + floorGain)).toFixed(1);
  assert(tot.moved > 0 && darkGain > 0 && floorGain > 0,
    `${tot.moved} pixels differ, ${darkGain} of them newly dark and ${floorGain}`
    + ' the floor, so the change did not reach the picture');
  console.log(`  ... ${r.out.length} cases of only the sides facing open ground`
    + ` (${r.pics} frames of their own): ${tot.sides} side faces stood against rock,`
    + ` ${tot.offShown} of them shown in the old picture (${tot.offM} m,`
    + ` ${tot.offPx} px) and ${tot.onShown} in the new one; wall faces`
    + ` ${tot.offWalls} -> ${tot.onWalls}, ${tot.moved} pixels of the frame`
    + ` changed, of which ${darkGain} came out dark and ${floorGain} came out`
    + ` floor uncovered behind the walls that went (${darkShare}% of that newly`
    + ` opened ground is the dark itself); the dark shows ${tot.offDark} ->`
    + ` ${tot.onDark} pixels, the floor ${tot.offGround} -> ${tot.onGround}, and`
    + ` ${tot.asks} answers were asked, ${tot.changed} changed, every one of them`
    + ` rock (${tot.toNothing} now nothing), ${tot.offRock} -> ${tot.onRock}`
    + ` naming rock and ${tot.offPeople} -> ${tot.onPeople} naming a crawler or a`
    + ' camp site');
});

/* The wall behind a block you can see past is brought back whole. When a block
 * stops being painted at all, the wall of its neighbour that used to be covered
 * by it is painted to its full height instead -- so the hole the player would
 * otherwise look through into nothing is closed. `lost` counts the faces that
 * stayed cut away anyway, and it is a tripwire: a face is only ever cut where
 * the block in front of it is painted SOLID, so a block that is not painted at
 * all cannot leave a face cut. Proved inside one build, three knobs apart: the
 * look the sheet ships, the same look with the rock in the way switched off
 * (`render.cut_solid` 0), and that one with the foot of rock switched off too --
 * which is v0.37.0, where a hidden square is left out of the picture whole. */
await test('a block cut away never opens a hole in the wall beside it (v0.34.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, out = [];
    t.pause();
    const wasCut = t.cfg.cutSolid;
    const wasStump = t.cutStump();
    for (const seed of [1, 3, 777]) {
      t.seed(seed);
      for (const up of [false, true]) {
        t.tilt(up);
        for (let q = 0; q < 4; q++) {
          t.rotate(q ? 1 : 0);
          /* The clip off: every wall of every block is painted, so this is the
             wall count the clip, and the cut, are allowed to bring down. */
          t.clipWalls(false); t.redraw();
          const off = t.consumed();
          const buf = t.buffer();
          const hit = t.point(Math.round(buf.w / 2), Math.round(buf.h * 0.55));
          t.unpoint(); t.select(hit);
          const row = { seed, up, cam: t.camera().quarter, hit,
                        wallsOff: off.walls, pxOff: off.wallPx, arms: [] };
          /* THREE ARMS. As of v0.44.0 the sheet ships `render.cut_solid` at 1 --
             the rock in the way is drawn like any other rock -- so the shipped
             arm leaves NOTHING out of the picture and `cut`, `kept` and `lost`
             could read zero for the trivial reason that there is nothing to
             count. The arm that turns the dial back down to 0, with the foot of
             rock still standing in every hidden square, is where they can fail,
             and it is the negative control for the look that ships; the third
             arm switches the foot off as well, which is the picture v0.37.0
             shipped -- the square left out whole, and the walls behind it
             brought back. Only the FIRST arm is the game. */
          for (const arm of [{ solid: wasCut, stump: wasStump },
                             { solid: 0, stump: wasStump },
                             { solid: 0, stump: 0 }]) {
            t.cfg.cutSolid = arm.solid;
            t.cutStump(arm.stump);
            /* EACH ARM GETS ITS OWN CLIP-OFF FRAME, because the three arms are
               three different PICTURES and not just three sets of counters: with
               the foot of rock switched off the hidden squares are left out of
               the picture instead of painting a metre of themselves, and with
               the rock in the way drawn solid every hidden square paints its
               full height. So an arm that paints MORE than the picture at the
               top of this test is not necessarily the cut painting more than it
               takes away -- it can be a world with taller blocks in front of the
               camera -- and the only honest control for an arm is itself with
               the clip off. */
            t.clipWalls(false); t.repaint();
            const off = t.consumed();
            const offWalls = off.walls, offPx = off.wallPx;
            t.clipWalls(true); t.repaint();
            const on = t.consumed();
            row.arms.push({ solid: arm.solid, stump: arm.stump, cut: on.cut,
                            stumps: on.stumps, walls: on.walls, px: on.wallPx,
                            kept: on.kept, lost: on.lost,
                            wallsOff: offWalls, pxOff: offPx });
          }
          t.cfg.cutSolid = wasCut; t.cutStump(wasStump);
          t.clipWalls(true); t.unpoint();
          out.push(row);
        }
      }
    }
    t.select(-1); t.redraw();
    return { out, wasCut, wasStump, back: t.cfg.cutSolid,
             backStump: t.cutStump() };
  });
  const cams = new Set(r.out.map((q) => `${q.up ? 'up' : 'low'}:${q.cam}`));
  assert(r.out.length === 24 && cams.size === 8,
    `${r.out.length} cases over ${cams.size} camera settings: the range was not run`);
  assert(r.wasCut === 1 && r.back === 1,
    `the rock in the way is not drawn solid in the spreadsheet (cut_solid`
    + ` ${r.wasCut}), so there is no gap left to see through`);
  assert(r.backStump === r.wasStump,
    `cut_stump_m came back as ${r.backStump} where the sheet has ${r.wasStump}`);
  let cut = 0, stumps = 0, kept = 0, wallsOn = 0, wallsOff = 0;
  let gapCut = 0, gapStumps = 0;
  let bareCut = 0, bareKept = 0, bareStumps = 0;
  for (const q of r.out) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}, turned ${q.cam}`;
    const ship = q.arms[0], gap = q.arms[1], bare = q.arms[2];
    assert(q.hit >= 0, `${at}: nothing was picked in the middle of the picture`);
    assert(ship.cut === 0 && ship.stumps === 0,
      `${at}: ${ship.cut} squares were left out of the picture whole and`
      + ` ${ship.stumps} kept a foot of rock, with the sheet's own cut_solid`
      + ` (${r.wasCut}) -- the rock in the way is drawn like any other rock, so`
      + ' there is nothing here to leave out');
    /* The dial's own 0, with the foot of rock standing in every hidden square:
       this is where leaving rock out is what SHOULD happen, and so it is where
       the counters this test is about can fail. */
    assert(gap.cut === 0 && gap.stumps > 0,
      `${at}: with the rock in the way switched off (cut_solid 0, cut_stump_m`
      + ` ${r.wasStump}) ${gap.cut} squares were left out of the picture whole`
      + ` and ${gap.stumps} kept a foot of rock, so the trade this whole look`
      + ' rests on is no longer being made');
    /* The guard, counted rather than argued: a face left cut away behind a block
       that is not painted is the hole the player sees through into nothing. It
       holds for every arm, including the one that leaves the squares out. */
    for (const a of q.arms) {
      assert(a.lost === 0,
        `${at}: ${a.lost} wall faces stayed cut away behind a block that is not`
        + ` painted (stump ${a.stump} m, cut_solid ${a.solid}) -- a hole is open`);
      assert(a.walls <= a.wallsOff && a.px <= a.pxOff,
        `${at}: ${a.walls} wall faces and ${a.px} pixels were painted where the`
        + ` same picture with the clip off paints ${a.wallsOff} and ${a.pxOff}`
        + ` (stump ${a.stump} m, cut_solid ${a.solid}), so the cut is painting`
        + ' more than it takes away');
    }
    cut += ship.cut; stumps += ship.stumps; kept += ship.kept;
    gapCut += gap.cut; gapStumps += gap.stumps;
    bareCut += bare.cut; bareKept += bare.kept; bareStumps += bare.stumps;
    wallsOn += ship.walls; wallsOff += q.wallsOff;
  }
  /* And the counters are not vacuous. The look that ships leaves nothing out at
     all; the same build with the dial turned down leaves the rock in the way out
     of the picture and keeps a foot of rock standing in every hidden square; and
     that one with the foot switched off -- v0.37.0, the negative control in one
     build -- leaves the squares out whole and has to bring the walls behind them
     back. */
  assert(cut === 0 && stumps === 0 && kept === 0,
    `cut_solid is ${r.wasCut} and across the ${r.out.length} cases the picture`
    + ` still left ${cut} squares out whole, ${stumps} keeping a foot of rock and`
    + ` ${kept} walls brought back`);
  assert(gapCut === 0 && gapStumps > 0,
    `with the rock in the way switched off: ${gapCut} squares were left out`
    + ` whole and ${gapStumps} kept a foot of rock, so the foot of rock in the`
    + ' sheet is not connected to the picture');
  assert(bareCut > 0 && bareStumps === 0 && bareKept > 0,
    `with the foot of rock switched off: ${bareCut} squares were left out whole,`
    + ` ${bareStumps} kept a foot and ${bareKept} walls were brought back whole,`
    + ' so the mechanism this test guards was never exercised');
  assert(wallsOn < wallsOff,
    `the cut and the clip together painted ${wallsOn} wall faces against`
    + ` ${wallsOff} with the clip off, so they are no longer taking any away`);
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
    for (const must of ['head', 'torso', 'pelvis', 'thigh_l', 'thigh_r',
                        'upperarm_l', 'upperarm_r', 'foot_l', 'foot_r']) {
      assert(d.parts.includes(must),
        `${d.name} reached the screen without a ${must}: ${d.parts.join('+')}`);
    }
  }
});

await test('every one of the twelve slots shows on the crawler (rule 4)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const found = window.__test.pointAtAnyActor();
    const idx = found.index, who = found.pick;

    window.__test.strip(idx);
    const bare = window.__test.redraw().items.find((i) => i.i === who);

    const slots = Object.keys(window.__test.data.slots);
    const gear = window.__test.data.gear;
    const results = [];
    for (const slot of slots) {
      const item = slots.indexOf(slot) >= 0
        ? Object.keys(gear).find((g) => gear[g].slot === slot) : null;
      window.__test.strip(idx);
      window.__test.wear(idx, slot, item);
      const drawn = window.__test.redraw().items.find((i) => i.i === who);
      results.push({ slot, item, worn: drawn ? drawn.worn : [],
                     parts: drawn ? drawn.parts.length : 0 });
    }
    window.__test.strip(idx);
    return { found, bare: { worn: bare.worn, parts: bare.parts.length }, results,
             slots: slots.length };
  });
  assert(r.found.found, `could not get at a crawler: ${r.found.why}`);
  assert(r.slots === 12, `there are ${r.slots} slots, not twelve`);
  assert(r.bare.worn.length === 0, `a stripped crawler still showed ${r.bare.worn}`);
  assert(r.bare.parts > 10, `a stripped crawler is only ${r.bare.parts} parts`);
  for (const q of r.results) {
    assert(q.item, `nothing can be worn in ${q.slot}`);
    assert(q.worn.includes(q.item),
      `wore ${q.item} in ${q.slot} and the screen showed ${q.worn.join(',') || 'nothing'}`);
    assert(q.parts > r.bare.parts,
      `wearing ${q.item} added no parts to the figure`);
  }
});

await test('a figure is real geometry: posed, lit, and with its back faces dropped', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const found = window.__test.pointAtAnyActor();
    const drawn = window.__test.redraw().items.find((i) => i.i === found.pick);
    const pose = window.__test.pose(found.index);
    /* Move the arm and the hand must move with it. A walk pose is a crawler
       MID-STEP -- standing still, they breathe -- so the walk is asked for over
       a few ticks and the widest difference counts: a stride is a sine, and one
       tick on its own can land on the moment the arm passes its rest. */
    const see = window.__test.state.tick;
    let was = null, now = null, best = -1;
    for (let k = 0; k < 6; k++) {
      const at = see + k * 6;
      const stand = window.__test.pose(found.index, 'idle', 1, at).bones.hand_r;
      const walk = window.__test.pose(found.index, 'walking', 0.5, at).bones.hand_r;
      const d = Math.abs(stand[0] - walk[0]) + Math.abs(stand[1] - walk[1])
              + Math.abs(stand[2] - walk[2]);
      if (d > best) { best = d; was = stand.slice(); now = walk.slice(); }
    }
    return { found, drawn, pose, was, now,
             bones: Object.keys(window.__test.data.bones).length };
  });
  assert(r.found.found, 'no crawler in view');
  assert(r.bones >= 15, `the skeleton is only ${r.bones} bones`);
  assert(r.drawn.faces > 0, 'a crawler reached the screen with no faces at all');
  const nParts = r.drawn.parts.length;
  /* Parts are lathed now, not boxes: a six-sided limb has fourteen-odd faces and
     roughly half of them face the camera. What must hold is that culling really
     happens and that no part is drawn with nothing at all. */
  assert(r.drawn.faces >= nParts,
    `${r.drawn.faces} faces for ${nParts} parts -- some part reached the screen empty`);
  assert(r.drawn.faces < nParts * 9,
    `${r.drawn.faces} faces for ${nParts} parts -- back faces are not being dropped`);
  assert(r.drawn.faces > nParts * 2,
    `${r.drawn.faces} faces for ${nParts} parts -- these are not rounded shapes`);
  const moved = Math.abs(r.was[0] - r.now[0]) + Math.abs(r.was[1] - r.now[1])
              + Math.abs(r.was[2] - r.now[2]);
  assert(moved > 0.02, `changing what they are doing moved the hand ${moved.toFixed(3)}m`);
  assert(Math.abs(r.pose.bones.head[2] - 1.3) < 0.4,
    `the head is at ${r.pose.bones.head[2]}m, which is not where a head goes`);
});

await test('a crawler turns to face where they are going', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(3);
    const faces = new Set();
    let turned = 0, last = null;
    for (let i = 0; i < 600; i++) {
      window.__test.frame(1);
      for (const a of window.__test.actors()) {
        faces.add(Math.round(a.face * 100) / 100);
        if (a.index === 0) {
          if (last !== null && Math.abs(a.face - last) > 1e-6) turned++;
          last = a.face;
        }
      }
    }
    return { distinct: faces.size, turned };
  });
  assert(r.distinct > 2, `every crawler faced the same way all match (${r.distinct} angles)`);
  assert(r.turned > 3, `the first crawler changed facing only ${r.turned} times`);
});

await test('gear does all three things it is supposed to (hybrid)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const i = 0;
    window.__test.strip(i);
    const bare = { build: window.__test.ability(i, 'building'),
                   climb: window.__test.ability(i, 'clambering'),
                   attrs: window.__test.describe(window.__test.actors()[i].pick).attributes };

    /* 1. a tool is REQUIRED: without one, building is brutal */
    window.__test.wear(i, 'mainhand', 'spade');
    const tooled = window.__test.ability(i, 'building');

    /* 2. gear makes a roll EASIER */
    window.__test.strip(i);
    window.__test.wear(i, 'feet', 'boots');
    const booted = window.__test.ability(i, 'clambering');

    /* 3. gear CHANGES WHO YOU ARE, with a cost */
    window.__test.strip(i);
    window.__test.wear(i, 'back', 'pack');
    const packed = window.__test.describe(window.__test.actors()[i].pick).attributes;
    window.__test.strip(i);
    return { bare, tooled, booted, packed,
             packGear: window.__test.data.gear.pack };
  });

  assert(r.bare.build.tool < 0,
    `building with bare hands cost nothing (${r.bare.build.tool})`);
  assert(r.tooled.tool === 0 && r.tooled.ability > r.bare.build.ability + 5,
    `a spade took building from ${r.bare.build.ability} to ${r.tooled.ability}`);

  assert(r.booted.bonus > 0 && r.booted.ability > r.bare.climb.ability,
    `boots took focusing from ${r.bare.climb.ability} to ${r.booted.ability}`);

  const find = (list, id) => list.find((a) => a.id === id);
  assert(find(r.packed, 'might').value > find(r.bare.attrs, 'might').value,
    'a pack did not make them stronger');
  assert(find(r.packed, 'agility').value < find(r.bare.attrs, 'agility').value,
    'a pack cost them nothing in agility -- the trade-off is the point');
});

await test('the inspector shows all twelve slots, full or empty', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const i = 0;
    window.__test.strip(i);
    window.__test.wear(i, 'feet', 'boots');
    const found = window.__test.pointAtAnyActor();
    const d = window.__test.describe(window.__test.actors()[i].pick);
    return { d, tip: window.__test.tooltipOnScreen(), found };
  });
  assert(r.d.gear.length === 12, `the inspector lists ${r.d.gear.length} slots`);
  const boots = r.d.gear.find((g) => g.slot === 'feet');
  assert(boots && !boots.empty && boots.name === 'Boots', 'the boots are not listed');
  assert(boots.effects.length > 0, 'the boots list no effect');
  assert(r.d.gear.filter((g) => g.empty).length === 11, 'the empty slots are not shown');
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

await test('hovering names a crawler; clicking opens the panel on them', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    const found = window.__test.pointAtAnyActor();
    const hovered = found.found ? found.pick : -1;
    const tip = window.__test.tooltipOnScreen();
    const beforeClick = window.__test.panelOnScreen();
    window.__test.select(hovered);                 /* as a click or a tap does */
    return { found, hovered, tip, beforeClick,
             panel: window.__test.panelOnScreen(),
             described: window.__test.describe(hovered),
             consumed: window.__test.consumed() };
  });
  assert(r.found.found, `could not get at a crawler: ${r.found.why}`);
  assert(r.described.kind === 'crawler', 'the inspector did not recognise a crawler');
  assert(r.consumed.outlined, 'a hovered crawler was not outlined');
  assert(r.tip, 'no tooltip appeared over a crawler');
  assert(r.tip.text.includes(r.described.name), 'the tooltip does not name them');
  assert(r.tip.lines <= 3, `the hover tooltip is ${r.tip.lines} lines; it should be brief`);
  assert(r.beforeClick === null, 'the panel was open before anything was clicked');
  assert(r.panel, 'clicking a crawler opened no panel');
  assert(r.panel.pinned === r.hovered, 'the panel is pinned to something else');
  assert(r.panel.text.includes(r.described.name), 'the panel does not name them');
});

await test('the panel starts folded, and the folds open when clicked', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    window.__test.select(window.__test.pointAtAnyActor().pick);
    const shut = window.__test.panelOnScreen();
    const openGear = window.__test.clickFold('gear');
    const shutAgain = window.__test.clickFold('gear');
    const closed = window.__test.closePanel();
    return { shut, openGear, shutAgain, closed,
             slots: Object.keys(window.__test.data.slots).length };
  });
  const fold = (p, id) => p.folds.find((f) => f.id === id);
  assert(r.shut.folds.length === 3,
    `the panel has ${r.shut.folds.length} folds, expected attributes, skills and gear`);
  assert(fold(r.shut, 'gear').open === false && fold(r.shut, 'skills').open === false,
    'the long lists are open by default, which is what made the popup too big');
  assert(fold(r.shut, 'attributes').open === true, 'the attributes are hidden by default');
  assert(r.shut.rows === 0, `${r.shut.rows} gear rows show while gear is folded`);
  assert(fold(r.openGear, 'gear').open === true, 'clicking the gear fold did not open it');
  assert(r.openGear.rows === r.slots,
    `opened gear shows ${r.openGear.rows} rows, not all ${r.slots} slots`);
  assert(r.openGear.height > r.shut.height, 'opening a fold did not make the panel taller');
  assert(fold(r.shutAgain, 'gear').open === false, 'clicking again did not fold it back');
  assert(r.closed === null, 'the close button did not close the panel');
});

await test('folded, the panel is small; opened, it is the whole story', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 30; i++) window.__test.frame(60);
    const found = window.__test.pointAtAnyActor();
    window.__test.select(found.pick);
    const shut = window.__test.panelOnScreen();
    window.__test.clickFold('gear');
    window.__test.clickFold('skills');
    return { shut, all: window.__test.panelOnScreen(),
             d: window.__test.describe(found.pick), viewport: innerHeight };
  });
  assert(r.shut.height < r.viewport * 0.45,
    `folded, the panel is ${r.shut.height}px of a ${r.viewport}px window`);
  assert(r.shut.attrs === 6, `${r.shut.attrs} attributes show while folded`);
  for (const a of r.d.attributes) {
    assert(r.shut.text.includes(a.abbrev), `the panel never shows ${a.abbrev}`);
  }
  assert(r.all.rows === 12, `opened right up, the panel shows ${r.all.rows} gear rows`);
  assert(r.all.skills === r.d.skills.length,
    `the panel shows ${r.all.skills} skills, they have ${r.d.skills.length}`);
  assert(r.all.tags.includes('crawler'), `panel tags: ${r.all.tags}`);
});

await test('a selected thing is ringed by its silhouette, not boxed', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    /* Whichever crawler happens to be pointable first may be half behind a
       rock, which says nothing about how a ring is drawn. Take the clearest
       one: the claim is about the SHAPE of the highlight, not about occlusion. */
    let best = null;
    for (let i = 0; i < Game.state.actors.length; i++) {
      const got = window.__test.pointAtActor(i);
      if (!got.found) continue;
      window.__test.select(got.pick);
      const drew = window.__test.redraw();
      const me = drew.items.find((q) => q.i === got.pick);
      if (!me) continue;
      const px = Render.buf.getContext('2d').getImageData(0, 0, Render.w, Render.h).data;
      let ring = 0;
      const cols = {};
      for (let p = 0; p < px.length; p += 4) {
        if (px[p] > 235 && px[p + 1] > 218 && px[p + 1] < 248
          && px[p + 2] > 145 && px[p + 2] < 190) {
          ring++;
          cols[(p / 4) % Render.w] = 1;
        }
      }
      const row = { ring: ring, outlined: drew.outlined,
                    spread: Object.keys(cols).length,
                    boxW: Math.round(me.maxX - me.minX),
                    boxH: Math.round(me.maxY - me.minY) };
      if (!best || row.ring > best.ring) best = row;
    }
    return best || { ring: 0, outlined: false, spread: 0, boxW: 0, boxH: 0 };
  });
  assert(r.outlined, 'nothing was outlined at all');
  assert(r.ring > 30, `only ${r.ring} highlight pixels reached the buffer`);
  /* A box would light up every column across its width, edge to edge. A figure
     is narrow at the head and wide at the feet, so far fewer columns are lit. */
  assert(r.spread > 3, `the highlight covers only ${r.spread} columns`);
});

await test('a selected block is ringed by what was painted, not by the rock under it', async () => {
  /* THE RING IS COUNTED BY DIFFERENCE, and the reason is that every other way of
     counting it is a lie. The highlight is a two-pixel stroke down the edge of a
     shape, so nearly all of it is blended with whatever stands behind it: a
     window drawn round the shipped cream colour sees 174 of the ring's ~1,400
     pixels over the fifty selections below, which is how this test came to be
     passing by 26 pixels and then failing. So instead the SAME selection is
     painted twice and only the colour of the highlight is changed -- cream and
     then magenta. Everything the highlight covers and the thing then paints over
     is identical in the two pictures, so every pixel that differs is a pixel the
     ring survived on, however faintly. Nothing is compared against a colour at
     all, which is the point: a colour-window threshold is a number nobody can
     keep honest.

     The same battery is then run a second time with `ringStored`, which hands the
     halo the sides the block has STORED -- the quads that run all the way down to
     the floor of the world -- instead of the sides as far as the clip really lets
     them stand. That is the rule this test exists to keep out, and it is the
     test's own control: it MUST escape the shape that was painted, or the test
     cannot fail and is worth nothing. Measured: 37 of the 50 selections escape,
     by as much as 220px, against 0 of 50 with the shipped rule. */
  const r = await page.evaluate(() => {
    const out = { worlds: 0, cases: 0, judged: 0, seen: 0, floors: 0, blocks: 0,
                  wrong: 0, ring: 0, most: 0, outside: 0, worst: 0, tall: 0, past: 0,
                  ctrlCases: 0, ctrlRing: 0, ctrlOutside: 0, ctrlWorst: 0, ctrlMost: 0,
                  escaped: 0, shipped: N('ui.colour_outline') };
    const grab = () => Render.buf.getContext('2d').getImageData(0, 0, Render.w, Render.h).data;
    /* Every pixel that changed when the highlight changed colour, split into the
       ones inside the shapes that were painted (the ring) and the ones past them
       (which is the bug, and must be none). */
    const count = (one, two, box, slack) => {
      let ring = 0, outside = 0, worst = 0;
      for (let y = 0; y < Render.h; y++) {
        for (let x = 0; x < Render.w; x++) {
          const q = (y * Render.w + x) * 4;
          if (one[q] === two[q] && one[q + 1] === two[q + 1]
              && one[q + 2] === two[q + 2]) continue;
          ring++;
          const over = Math.max(box[0] - slack - x, x - (box[2] + slack),
                                box[1] - slack - y, y - (box[3] + slack));
          if (over > 0) { outside++; if (over > worst) worst = Math.round(over); }
        }
      }
      return { ring, outside, worst };
    };
    for (const seed of [1, 3, 5, 7, 23, 777]) {
      const t = window.__test;
      t.seed(seed);
      for (let i = 0; i < 8; i++) t.frame(10);
      out.worlds++;
      const s = Game.state;
      /* A handful of squares near the middle of the picture: floors and blocks
         both, all of them well inside the screen so the ring is never cut off
         by the edge of the buffer. */
      const picks = [];
      for (const it of Render.batch) {
        if (it.kind !== 'cell' || !it.solid) continue;
        if (it.minX < 6 || it.minY < 6) continue;
        if (it.maxX > Render.w - 6 || it.maxY > Render.h - 6) continue;
        picks.push(it.i);
        if (picks.length >= 10) break;
      }
      for (const pick of picks) {
        const slack = CFG.outlineWidth + 2;
        let box = null, it = null, ctrl = null;
        for (const stored of [false, true]) {
          t.ringStored(stored);
          t.select(pick);
          /* The selection has to have LANDED, or this test measures whichever
             square the game felt like ringing instead of the one it asked for. */
          const plan = Render.alphas(s, Render.batch);
          if (!plan.focus || plan.focus.kind !== 'cell' || plan.focus.i !== pick) {
            out.wrong++;
            break;
          }
          if (box === null) {
            it = plan.focus;
            /* WHAT THE DRAWING USED, read off the item rather than from the
               halo: the cap, and each side as far as the clip left it. */
            const cut = Render.wallsPainted(it, plan.list);
            const faces = [it.top];
            if (cut.l) faces.push(cut.l);
            if (cut.r) faces.push(cut.r);
            box = [Infinity, Infinity, -Infinity, -Infinity];
            for (const f of faces) {
              for (const p of f) {
                if (p.x < box[0]) box[0] = p.x;
                if (p.y < box[1]) box[1] = p.y;
                if (p.x > box[2]) box[2] = p.x;
                if (p.y > box[3]) box[3] = p.y;
              }
            }
            /* The sides the OLD rule handed the halo: the whole column, all the
               way down to the floor of the world, however much of it is hidden.
               How far below the painted shape that reaches is what makes this
               test about the bug rather than about a square that had no hidden
               shape at all -- and it is the same 37 selections that escape. */
            let deep = -Infinity;
            for (const f of [it.left, it.right]) {
              if (!f) continue;
              for (const p of f) if (p.y > deep) deep = p.y;
            }
            if (deep - box[3] > 8) out.tall++;
            if (deep - box[3] > out.past) out.past = Math.round(deep - box[3]);
          }
          DATA.names['ui.colour_outline'] = '#ffe9a8';
          t.redraw();
          const one = grab();
          DATA.names['ui.colour_outline'] = '#ff00ff';
          t.redraw();
          const two = grab();
          const got = count(one, two, box, slack);
          if (!stored) {
            out.ring += got.ring; out.outside += got.outside;
            if (got.ring > out.most) out.most = got.ring;
            if (got.ring > 0) out.seen++;
            if (got.worst > out.worst) out.worst = got.worst;
          } else {
            out.ctrlCases++; out.ctrlRing += got.ring; out.ctrlOutside += got.outside;
            if (got.ring > out.ctrlMost) out.ctrlMost = got.ring;
            if (got.worst > out.ctrlWorst) out.ctrlWorst = got.worst;
            if (got.outside > 0) out.escaped = (out.escaped || 0) + 1;
          }
        }
        t.ringStored(false);
        if (box === null) continue;
        out.cases++; out.judged++;
        if (TILE(it.cell.tile).footing === 'block') out.blocks++; else out.floors++;
      }
    }
    DATA.names['ui.colour_outline'] = out.shipped;
    return out;
  });
  assert(r.worlds === 6, `${r.worlds} worlds were looked at`);
  assert(r.wrong === 0,
    `${r.wrong} selections rang something other than the square that was asked for,`
    + ` so what this test measured was not what it selected`);
  assert(r.cases >= 24 && r.floors >= 6 && r.blocks >= 6,
    `${r.cases} selections were measured: ${r.floors} walkable squares and`
    + ` ${r.blocks} solid ones`);
  assert(r.seen >= 24,
    `only ${r.seen} of ${r.cases} selections put any highlight on the picture at all`);
  assert(r.ring > 400,
    `only ${r.ring} highlight pixels reached the picture over ${r.cases}`
    + ` selections -- the best of them was ${r.most}px`);
  assert(r.tall >= 6,
    `only ${r.tall} of ${r.cases} selections were on a square whose stored sides`
    + ` reach measurably below what is painted (worst ${r.past}px), so this test is`
    + ` not looking at the bug it is about`);
  assert(r.outside === 0,
    `${r.outside} highlight pixels sat past the shapes that were painted, as much`
    + ` as ${r.worst}px past them -- the stored sides reach ${r.past}px below the`
    + ` block, and the ring must not follow them there`);
  /* The control. The stored-side rule must escape the painted shape, or this
     test is passing on a build where it cannot fail. */
  assert(r.ctrlCases === r.cases,
    `the control ran over ${r.ctrlCases} of ${r.cases} selections`);
  assert((r.escaped || 0) >= 8 && r.ctrlOutside > 2000 && r.ctrlWorst >= 40,
    `the old stored-side rule only escaped the painted shape in ${r.escaped || 0} of`
    + ` ${r.ctrlCases} selections, by ${r.ctrlOutside}px in all and ${r.ctrlWorst}px`
    + ` at worst -- this test is no longer able to tell the two rules apart, which is`
    + ` what it exists to do`);
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
    'all that walking about taught nobody any Focusing');
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

await test('progress slows as a crawler gets better (rule 1, seed 12, difficulty 12)', async () => {
  const r = await page.evaluate(() => window.__test.practice({
    seed: 12, skill: 'clambering', difficulty: 12, per: 25, blocks: 4,
    attr: { agility: 3, endurance: 3, might: 3 }
  }));
  const g = r.blocks.map((b) => b.gain);
  const w = r.blocks.map((b) => b.wins);
  const per = r.blocks[0].attempts;
  assert(r.cap > 0, 'the bench did not report the practice ceiling');
  const last = r.blocks[3].after;

  /* Whole pips (rule 10) make progress steppy: a crawler gains nothing for a
     while and then a whole point at once, so block-by-block it can wobble. The
     TREND is what rule 1 claims, so the trend is what is asserted. */
  const firstHalf = g[0] + g[1], lastHalf = g[2] + g[3];
  assert(lastHalf < firstHalf,
    `practice per block went ${g.join(' -> ')}; the second half is not slower than the first`);
  assert(w[w.length - 1] > w[0],
    `successes per block went ${w.join(' -> ')}, and did not improve`);
  assert(g[0] > g[3] * 2,
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
      seed: 12, skill: 'clambering', difficulty: 99, per: 10, blocks: 4,
      attr: { agility: 3, endurance: 3, might: 3 }
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
    const opts = { seed: 31, skill: 'clambering', difficulty: 12, per: 40, blocks: 1 };
    const poor = window.__test.practice(Object.assign({}, opts,
      { attr: { agility: 1, might: 1 } }));
    const fine = window.__test.practice(Object.assign({}, opts,
      { attr: { agility: 6, might: 6 } }));
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
      seed: 4, skill: 'clambering', difficulty: -20, per: 40, blocks: 3,
      attr: { agility: 3, might: 3 }
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
  /* Somebody must be taught SOMETHING by building a camp -- but which skill,
     on one seed, is a coin toss. The baseline passed this with a single failed
     Labouring roll in the whole match (0.1 of a pip, twice), and one luckier
     roll would have failed it. Rule 1 is proved properly on the bench test;
     here the honest claim is that camp work teaches, across a few worlds. */
  assert(r.actors.some((a) => (a.skills.labouring || 0) + (a.skills.building || 0) > 0),
    'building a whole camp taught nobody anything');
  assert(r.structures > 0, 'not one piece of the camp reached the screen');
  assert(r.drawn.some((d) => d.built), 'no finished structure reached the screen');
});

await test('clearing ground teaches Labouring, over a few worlds', async () => {
  const r = await page.evaluate(() => {
    const rows = [];
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      window.__test.seed(seed);
      for (let i = 0; i < 80; i++) window.__test.frame(60);
      const s = Game.state;
      if (!s.camp) { rows.push({ seed, taught: 0, cleared: 0 }); continue; }
      rows.push({ seed,
        taught: s.actors.reduce((n, a) => n + (a.skills.labouring || 0), 0),
        cleared: campSummary(s.camp).cleared });
    }
    return rows;
  });
  const cleared = r.reduce((n, x) => n + x.cleared, 0);
  const taught = r.filter((x) => x.taught > 0).length;
  assert(cleared > 0, 'no ground was cleared on any of the six seeds');
  assert(taught > 0,
    'clearing ground taught nobody any Labouring on any of six seeds: '
    + r.map((x) => `${x.seed}:${x.taught.toFixed(2)}`).join(' '));
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

await test('time runs on its own, without anyone touching the view', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(2);
    window.__test.resume(); window.__test.pause();      /* reset the clock */
    const a = window.__test.loopOnce(60);
    const b = window.__test.loopOnce(60);
    const c = window.__test.loopOnce(600);
    const camBefore = window.__test.camera();
    const long = window.__test.loopOnce(600);
    const camAfter = window.__test.camera();
    return { a, b, c, long, camBefore, camAfter, tick: window.__test.state.tick };
  });
  assert(r.a.ticks > 0 && r.b.ticks > 0,
    `the world ran ${r.a.ticks}/${r.b.ticks} ticks with nobody moving the view`);
  assert(r.c.ticks > r.a.ticks,
    `a longer frame ran ${r.c.ticks} ticks against ${r.a.ticks} for a short one`);
  assert(r.camBefore.ox === r.camAfter.ox && r.camBefore.oy === r.camAfter.oy,
    'time only ran because the camera drifted');
  assert(r.tick > 10, `only ${r.tick} ticks passed in total`);
});

await test('the labyrinth gets on with it while you sit still', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    window.__test.resume(); window.__test.pause();
    const before = { camp: window.__test.camp().summary,
                     rolls: window.__test.rolls(),
                     cam: window.__test.camera() };
    for (let i = 0; i < 300; i++) window.__test.loopOnce(200);
    const after = { camp: window.__test.camp().summary,
                    rolls: window.__test.rolls(),
                    cam: window.__test.camera() };
    return { before, after };
  });
  assert(r.after.rolls > r.before.rolls + 20,
    `only ${r.after.rolls - r.before.rolls} rolls happened while sitting still`);
  assert(r.after.camp.progress > r.before.camp.progress,
    'the camp made no progress at all while nobody touched anything');
  assert(r.before.cam.ox === r.after.cam.ox && r.before.cam.oy === r.after.cam.oy,
    'the view moved by itself');
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


await test('the view swings a quarter turn and keeps its footing', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    const middle = { x: window.__test.buffer().w / 2, y: window.__test.buffer().h / 2 };
    const before = { cam: window.__test.camera(), at: window.__test.project(10, 10, 0) };
    window.__test.rotate(1);
    const mid = window.__test.camera();
    const after = window.__test.project(10, 10, 0);

    window.__test.rotate(-1);                  /* square on again */
    const quarters = [];
    for (let q = 0; q < 4; q++) {
      quarters.push({ q: window.__test.camera().quarter,
                      behind: window.__test.behind(),
                      at: window.__test.project(10, 10, 0) });
      window.__test.rotate(1);
    }
    return { before, mid, after, quarters, back: window.__test.camera() };
  });
  assert(r.mid.quarter === 1, `a quarter turn landed on ${r.mid.quarter}`);
  assert(r.mid.yaw === r.mid.yawTarget, 'the swing never finished');
  assert(Math.abs(r.after.x - r.before.at.x) > 4 || Math.abs(r.after.y - r.before.at.y) > 4,
    'turning the view did not move anything on screen');
  const seen = new Set(r.quarters.map((q) => q.behind.join(',')));
  assert(seen.size === 4, `only ${seen.size} of four directions were distinct`);
  assert(r.back.quarter === 0, `four quarter turns landed on ${r.back.quarter}`);
  const home = r.quarters[0].at;
  assert(Math.abs(home.x - r.before.at.x) < 1 && Math.abs(home.y - r.before.at.y) < 1,
    'a full turn did not come back to where it started');
});

await test('the swing is animated, not a jump', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    window.__test.rotate(0);
    const frames = [];
    rotateCamera(window.__test.state, 1);
    for (let i = 0; i < 40; i++) {
      const moved = window.__test.camStep(16);
      frames.push(window.__test.camera().yaw);
      if (!moved) break;
    }
    return { frames, swingMs: window.__test.cfg.swingMs,
             target: window.__test.camera().yawTarget };
  });
  assert(r.frames.length > 3,
    `the swing took ${r.frames.length} frames, which is a jump not a swing`);
  const strictlyGrowing = r.frames.every((v, i) => i === 0 || v > r.frames[i - 1] - 1e-9);
  assert(strictlyGrowing, `the swing went backwards: ${r.frames.join(',')}`);
  assert(Math.abs(r.frames[r.frames.length - 1] - r.target) < 1e-9,
    'the swing did not land on the quarter');
});

await test('everything keeps working after the view is turned', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const out = [];
    for (let q = 0; q < 4; q++) {
      const drew = window.__test.frame(1);
      /* painted back to front, at this quarter */
      let ordered = true;
      for (let k = 1; k < drew.items.length; k++) {
        if (drew.items[k].depth !== undefined
          && drew.items[k].depth < drew.items[k - 1].depth - 1e-9) ordered = false;
      }
      /* pick something and check we get it back -- at the pixel the renderer
         records as its own paint (`aim`), because the middle of a square is no
         longer painted by the square itself (no top face since v0.42.0) */
      let hit = -1, want = -1;
      for (let k = drew.items.length - 1; k >= 0; k--) {
        const it = drew.items[k];
        if (it.kind !== 'cell' || !it.aim) continue;
        if (it.aim.x < 20 || it.aim.x > window.__test.buffer().w - 20) continue;
        if (it.aim.y < 20 || it.aim.y > window.__test.buffer().h - 20) continue;
        want = it.i; hit = window.__test.point(it.aim.x, it.aim.y); break;
      }
      out.push({ q: window.__test.camera().quarter, ordered, hit, want,
                 count: drew.count, cutaway: drew.cutaway });
      window.__test.rotate(1);
    }
    return out;
  });
  for (const q of r) {
    assert(q.count > 50, `at quarter ${q.q} only ${q.count} things were drawn`);
    assert(q.ordered, `at quarter ${q.q} the painting was not back to front`);
    assert(q.hit === q.want, `at quarter ${q.q} pointing at ${q.want} picked ${q.hit}`);
    assert(q.cutaway > 0,
      `at quarter ${q.q} no rock in front was cut away, so rooms hide behind`
      + ' their walls again');
  }
});

await test('the raised angle opens the ground out and leaves heights alone', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    const low = { tileH: window.__test.camera().tileH,
                  metre: window.__test.project(4, 4, 0).y - window.__test.project(4, 4, 1).y,
                  span: window.__test.project(4, 5, 0).y - window.__test.project(4, 4, 0).y };
    window.__test.tilt(true);
    window.__test.frame(1);
    const high = { tileH: window.__test.camera().tileH,
                   metre: window.__test.project(4, 4, 0).y - window.__test.project(4, 4, 1).y,
                   span: window.__test.project(4, 5, 0).y - window.__test.project(4, 4, 0).y };
    window.__test.tilt(false);
    const back = window.__test.camera();
    return { low, high, back, rise: window.__test.cfg.rise,
             lowKnob: window.__test.data.knobs['render.tile_h_low'],
             highKnob: window.__test.data.knobs['render.tile_h_high'] };
  });
  assert(r.low.tileH === r.lowKnob && r.high.tileH === r.highKnob,
    `the angles came out ${r.low.tileH} and ${r.high.tileH}`);
  assert(r.high.span > r.low.span,
    `a metre of ground was ${r.low.span}px then ${r.high.span}px -- the angle did not rise`);
  assert(r.low.metre === r.rise && r.high.metre === r.rise,
    `a metre of HEIGHT changed from ${r.low.metre} to ${r.high.metre}; rule 10 says it must not`);
  assert(r.back.pitchTarget === 0, 'the angle did not come back down');
});

await test('turning the view does not disturb the labyrinth or the camp', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    /* Eight frames of looking, so the window of ground is full before anything
       is compared. A fresh match opens holding the one piece the camp stands
       in and fetches the rest as it paints, and that first fetch is not the
       view turning -- it is the view opening. */
    window.__test.frame(8);
    const squares = () => {
      const w = window.__test.state.world, m = new Map();
      /* Keyed by the WORLD square -- the address the ground sits at -- and not
         by the square's place in the list of live squares. A piece made later
         or made again pushes everything along, so its numbers would be new
         numbers for ground that never moved, and the comparison would report a
         change that is nothing but bookkeeping. The address is the thing rule 5
         promises about. */
      for (const p of w.live) {
        for (const c of p.cells) m.set(c.x + ',' + c.y, c.h + ':' + c.tile);
      }
      return m;
    };
    const piecesOf = () => window.__test.world().pieces;
    const before = squares();
    const wasPieces = piecesOf();
    const camp = window.__test.camp().summary.progress;
    window.__test.rotate(1); window.__test.tilt(true);
    window.__test.rotate(2); window.__test.tilt(false);
    window.__test.rotate(1);
    const after = squares();
    let changed = 0, gone = 0;
    for (const [key, was] of before) {
      const now = after.get(key);
      if (now === undefined) gone++;
      else if (now !== was) changed++;
    }
    return { changed, gone, wasPieces, nowPieces: piecesOf(),
             camp, campNow: window.__test.camp().summary.progress };
  });
  assert(r.changed === 0 && r.gone === 0,
    `turning the view moved ${r.changed} squares of ground and lost ${r.gone}`);
  assert(r.wasPieces === r.nowPieces,
    `turning the view made ${r.nowPieces - r.wasPieces} pieces of new ground -- a turn ` +
    'does not need ground the view could not already see');
  assert(r.camp === r.campNow, 'turning the view built the camp');
});


await test('pause stops the world, and the world starts again after it', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    window.__test.resume(); window.__test.pause();       /* reset the clock */
    window.__test.setSpeed(0); window.__test.setPaused(false);

    const runningA = window.__test.loopOnce(120).ticks;
    const campBefore = window.__test.camp().summary.progress;
    const rollsBefore = window.__test.rolls();

    window.__test.setPaused(true);
    let paused = 0;
    for (let i = 0; i < 20; i++) paused += window.__test.loopOnce(200).ticks;
    const campPaused = window.__test.camp().summary.progress;
    const rollsPaused = window.__test.rolls();

    window.__test.setPaused(false);
    const runningB = window.__test.loopOnce(120).ticks;
    return { runningA, paused, runningB, campBefore, campPaused,
             rollsBefore, rollsPaused, clock: window.__test.clock() };
  });
  assert(r.runningA > 0, 'the world was not running to begin with');
  assert(r.paused === 0, `the world ran ${r.paused} ticks while paused`);
  assert(r.campPaused === r.campBefore,
    `the camp went from ${r.campBefore}% to ${r.campPaused}% while paused`);
  assert(r.rollsPaused === r.rollsBefore,
    `${r.rollsPaused - r.rollsBefore} rolls happened while paused`);
  assert(r.runningB > 0, 'the world did not start again after unpausing');
  assert(r.clock.paused === false && r.clock.multiplier > 0, 'the clock is confused');
});

await test('each speed runs the world that many times faster', async () => {
  const r = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < window.__test.clock().steps; i++) {
      window.__test.seed(5);
      window.__test.resume(); window.__test.pause();
      window.__test.setPaused(false);
      const clock = window.__test.setSpeed(i);
      let ticks = 0;
      for (let k = 0; k < 10; k++) ticks += window.__test.loopOnce(100).ticks;
      out.push({ i, name: clock.name, mult: clock.multiplier, ticks });
    }
    return out;
  });
  assert(r.length >= 3, `only ${r.length} speeds exist`);
  assert(r[0].mult === 1, `the first speed is ${r[0].mult}x, not normal`);
  const base = r[0].ticks;
  assert(base > 20, `normal speed only ran ${base} ticks in a second of frames`);
  for (const q of r) {
    const want = base * q.mult;
    assert(Math.abs(q.ticks - want) <= want * 0.2 + 2,
      `${q.name} ran ${q.ticks} ticks where ${q.mult}x of ${base} is about ${want}`);
  }
  for (let i = 1; i < r.length; i++) {
    assert(r[i].ticks > r[i - 1].ticks,
      `${r[i].name} was no faster than ${r[i - 1].name}`);
  }
});

await test('the view still moves while the world is paused', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    window.__test.setPaused(true);
    const before = { cam: window.__test.camera(), tick: window.__test.state.tick };
    /* A swing is real time, not game time, so it must finish while paused. */
    rotateCamera(window.__test.state, 1);
    let frames = 0;
    while (window.__test.camStep(16) && frames++ < 200) { /* swing it out */ }
    const after = { cam: window.__test.camera(), tick: window.__test.state.tick };
    window.__test.setPaused(false);
    return { before, after, frames };
  });
  assert(r.frames > 3, `the swing finished in ${r.frames} frames while paused`);
  assert(r.after.cam.quarter === 1, `the view ended on quarter ${r.after.cam.quarter}`);
  assert(r.after.tick === r.before.tick,
    `${r.after.tick - r.before.tick} ticks passed while paused`);
});

await test('the controls say what the clock is doing', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    window.__test.setPaused(false);
    window.__test.setSpeed(0);
    const slowest = window.__test.controlsOnScreen();
    window.__test.setSpeed(99);
    const fastest = window.__test.controlsOnScreen();
    const name = window.__test.clock().name;
    window.__test.setPaused(true);
    const paused = window.__test.controlsOnScreen();
    window.__test.setPaused(false);
    const running = window.__test.controlsOnScreen();
    return { slowest, fastest, paused, running, name };
  });
  assert(r.slowest.slowerOff === true && r.slowest.fasterOff === false,
    'at normal speed the slower button is not switched off');
  assert(r.fastest.fasterOff === true && r.fastest.slowerOff === false,
    'at top speed the faster button is not switched off');
  assert(r.fastest.speed === r.name,
    `the screen says ${r.fastest.speed}, the game says ${r.name}`);
  assert(r.paused.pressed === 'true' && r.running.pressed === 'false',
    'the pause button does not show whether it is on');
  assert(r.paused.pause !== r.running.pause,
    'the pause button looks the same paused as running');
});

await test('materials reach the screen, and nothing else is textured', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    const rows = [Math.round(Render.h * 0.3), Math.round(Render.h * 0.5),
                  Math.round(Render.h * 0.7)];

    const full = window.__test.data.knobs['texture.strength'];
    const on = window.__test.setTexture(full);
    window.__test.redraw();
    const textured = rows.map((y) => window.__test.colourSpread(y));
    const kindsOn = window.__test.fillKinds();

    /* The census has to be able to see a texture somewhere it should not be: one
       pattern painted straight onto the picture, from neither door, must land in
       `other` and nowhere else. */
    const fouled = window.__test.fillKinds(true);
    window.__test.redraw();

    /* The same census in pixels, and the same self-check for it. */
    const mapOn = window.__test.fillMap();
    window.__test.redraw();
    const mapFoul = window.__test.fillMap(true);
    window.__test.redraw();

    const off = window.__test.setTexture(0);
    window.__test.redraw();
    const flat = rows.map((y) => window.__test.colourSpread(y));
    const kindsOff = window.__test.fillKinds();
    const mapOff = window.__test.fillMap();
    window.__test.redraw();

    window.__test.setTexture(full);
    window.__test.redraw();
    return { on, off, textured, flat, kindsOn, kindsOff, fouled, mapOn, mapOff, mapFoul };
  });
  assert(r.on.on === true && r.off.on === false, 'the texture switch does nothing');
  assert(r.on.materials > 0, 'no material was ever generated');
  let better = 0;
  for (let i = 0; i < r.textured.length; i++) if (r.textured[i] > r.flat[i]) better++;
  assert(better >= 2,
    `materials changed only ${better} of 3 lines across the picture: ` +
    `${r.textured.join('/')} with against ${r.flat.join('/')} without`);

  /* A material goes on the GROUND and on a laid WALL, and nowhere else -- and
     that is a CENSUS of the frame rather than a sample of somewhere a texture is
     expected. Every patterned fill is put to the door it came through: `ground`,
     `wall`, or `other`, and `other` is a crawler or a piece of the camp wearing a
     surface. (Counting patterns against ground squares used to stand in for
     this, and stopped meaning anything in v0.24.0 when the sides of every block
     got a material too -- the count legitimately rose above the ground's.) */
  assert(r.kindsOff.pattern === 0,
    `${r.kindsOff.pattern} faces are still filled with a texture when texture is off`);
  assert(r.kindsOn.pattern > 0, 'the materials never reached a fill');
  assert(r.kindsOn.ground > 0 && r.kindsOn.wall > 0,
    `textures reached ${r.kindsOn.ground} ground faces and ${r.kindsOn.wall} wall faces --`
    + ` one of the two places they are allowed never got one, so this is not a clean frame`);
  assert(r.kindsOn.other === 0,
    `${r.kindsOn.other} textured fills came from somewhere that is neither the ground nor`
    + ` a wall -- something with a surface that should be a flat lit face`);
  assert(r.kindsOn.ground + r.kindsOn.wall + r.kindsOn.other === r.kindsOn.pattern,
    `the census lost track of ${r.kindsOn.pattern - r.kindsOn.ground - r.kindsOn.wall
      - r.kindsOn.other} of ${r.kindsOn.pattern} textured fills`);
  assert(r.fouled.other === 1 && r.fouled.pattern === r.fouled.ground + r.fouled.wall + 1,
    `a texture painted from neither door was counted as ${r.fouled.other}, not 1`
    + ` -- the census cannot see what it is looking for`);

  /* AND HOW MUCH OF THE PICTURE WEARS ONE -- asked in pixels, because a count of
     fills cannot answer it and the line that used to stand here tried to:
     `kindsOn.plain > kindsOn.pattern` was read as "most of the picture should be
     flat colour now", which was true of the look of v0.24.0, when the ground wore
     a material and the walls were bare stone. v0.42.0 put the material on every
     wall side as well, and the walls and the ground between them ARE the picture:
     measured in the frame this test looks at, the material covers 93.4% of the
     canvas against 2.0% painted in a flat colour, and not one pixel of backdrop
     shows between them, so the old line could only ever have gone on being true
     by measuring the wrong thing.
     What is still worth holding, and is now held in pixels: the material is on
     the ground and on the walls and nowhere else; the things that are meant to
     read as shapes rather than as surface still reach the screen at all; and with
     the dial off there is no material in the picture, only flat colour and the
     wall's own fade. */
  const m = r.mapOn, c = m.canvas;
  assert(r.mapFoul.other > 1000,
    `a texture painted from neither door covered ${r.mapFoul.other} pixels of the `
    + 'map, so the pixel count cannot see what it is looking for');
  assert(m.other === 0,
    `${m.other} pixels are covered by a material that came from somewhere that is `
    + 'neither the ground nor a wall -- something with a surface that should be a '
    + 'flat lit face');
  assert(m.surface > c * 0.5,
    `the materials cover ${m.surface} of ${c} pixels (${(100 * m.surface / c).toFixed(1)}%)`
    + ` -- the ground wears ${m.ground} and the walls wear ${m.wall}, so this is`
    + ' not a picture whose surfaces are wearing anything');
  assert(m.plain > 0,
    'not one pixel of the picture is a flat fill: the crawlers, the camp and the'
    + ' ramps have gone, and a thing that is not drawn as a flat shape cannot read'
    + ' as a shape');
  assert(r.mapOff.surface === 0,
    `${r.mapOff.surface} pixels are still covered by a material with the texture`
    + ` dial off (${r.mapOff.ground} of the ground, ${r.mapOff.wall} of a wall,`
    + ` ${r.mapOff.other} from neither)`);
  assert(r.mapOff.band > 0,
    'not one wall side faded through its own colour with the material switched'
    + ' off, so the flat band this look is the fallback for has gone');
});

/* ---- the pictures dropped in by hand -------------------------------------- *
 * Every material can be either GENERATED or DRAWN, and a folder with pictures
 * in it makes that material drawn. Three tests say the whole pipeline is real:
 * the first that ONE SQUARE METRE WEARS ONE PICTURE (not a block of them), the
 * second that they are scattered over the ground rather than laid out in a
 * lattice, the third -- the worst-looking question -- that any of it reached the
 * screen, answered by pixels rather than by a flag.
 *
 * The first nearly shipped as a claim that could not fail. v0.30.0 composed the
 * nine pictures of dirt into one three-metre tile -- a 3x3 block of them -- and a
 * test that asked "are the pictures' colours in the tile" is answered YES by a
 * block, because a block of them holds all of them. What a block is not is ONE
 * PICTURE PER SQUARE, and that is what is asserted here. The second half of the
 * same lesson: measuring how far the tile sits from a picture does NOT catch a
 * block either (a block's colours are all of the pictures' colours, so it sits at
 * distance 0 from every one of them) -- it catches only what it was written for,
 * that the ground wears the dropped-in picture and not the generated one. Each
 * claim is named for the thing it can catch. */

await test('the pictures dropped into textures/ become the material', async () => {
  const r = await page.evaluate(() => {
    const px = Math.max(8, Math.round(CFG.patternPx));
    const pal = (c) => {
      const g = c.getContext('2d');
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const set = new Set();
      let h = 2166136261;
      for (let i = 0; i < d.length; i += 4) {
        set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        h = Math.imul(h ^ d[i], 16777619) ^ Math.imul(h ^ d[i + 1], 2246822519)
          ^ Math.imul(h ^ d[i + 2], 3266489917);
      }
      return { hash: (h >>> 0), colours: Array.from(set).map((s) => s.split(',').map(Number)) };
    };
    /* An Image has to be painted down before its pixels can be read. */
    const asCanvas = (img) => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c;
    };
    /* How far a palette sits from another, in RGB levels: the mean and the worst
       distance from a colour in the first to the NEAREST colour in the second. */
    const dist = (a, b) => {
      if (!a.length || !b.length) return { mean: -1, worst: -1 };
      let sum = 0, worst = 0;
      for (const q of a) {
        let best = 1e9;
        for (const s of b) {
          const d = (q[0] - s[0]) ** 2 + (q[1] - s[1]) ** 2 + (q[2] - s[2]) ** 2;
          if (d < best) best = d;
        }
        best = Math.sqrt(best);
        sum += best;
        if (best > worst) worst = best;
      }
      return { mean: +(sum / a.length).toFixed(1), worst: +worst.toFixed(1) };
    };

    const t = window.__test.textures();
    const known = Object.keys(t.files).sort().filter((k) => t.files[k]);
    const rows = known.map((name) => {
      const tiles = Render.matPictures(name).map(pal);
      const srcs = (Textures.imgs[name] || []).filter(Boolean)
        .map((img) => pal(asCanvas(img)).colours);
      return {
        name,
        files: t.files[name], decoded: t.decoded[name],
        tiles: tiles.length,
        kinds: Render.matPictures(name).map((c) => c.width + 'x' + c.height),
        distinct: new Set(tiles.map((c) => c.hash)).size,
        /* Each tile against ITS OWN picture, and against the next one round --
           printed so a failure says which way the tiles went wrong. */
        own: tiles.map((c, i) => dist(c.colours, srcs[i] || []).mean),
        ownWorst: Math.max(...tiles.map((c, i) => dist(c.colours, srcs[i] || []).worst)),
        other: tiles.map((c, i) => dist(c.colours, srcs[(i + 1) % srcs.length] || []).mean),
      };
    });

    /* The control: the tile the GENERATOR makes for the same material, while the
       pictures are switched off, against the same picture. What the ground would
       wear if nothing had been dropped in -- so a "the picture is the surface"
       measure has something it must be able to tell it from. */
    window.__test.pictures(false);
    const gen = known.map((name) => ({
      name,
      tiles: Render.matPictures(name).length,
      drawn: Render.drawn(name),
      dist: dist(pal(Render.matTile(name)).colours, pal(asCanvas(
        (Textures.imgs[name] || []).filter(Boolean)[0])).colours),
    }));
    window.__test.pictures(true);

    /* And a material nobody has dropped a picture into: nothing composed, and the
       game does not believe it is drawn. */
    const bare = Object.keys(t.files).sort().filter((k) => !t.files[k]);
    const bareRow = bare.length ? {
      name: bare[0],
      files: t.files[bare[0]], decoded: t.decoded[bare[0]],
      tiles: Render.matPictures(bare[0]).length,
      drawn: Render.drawn(bare[0]),
    } : null;

    return { ready: t.ready, on: t.on, done: t.done, wants: t.wants,
             materials: t.materials, px, rows, gen, bareRow };
  });

  assert(r.ready === true, `the pictures never finished decoding: ${r.done} of ${r.wants}`);
  assert(r.materials.length > 0,
    'no material has a single picture in it -- there is nothing to check, which is not the'
    + ' same as it working');
  assert(r.done === r.wants, `${r.done} of ${r.wants} pictures decoded`);
  assert(r.on === true, 'the pictures switch came back off');

  for (const m of r.rows) {
    const tag = m.name + ': ' + m.decoded + ' of ' + m.files + ' pictures decoded';
    assert(m.decoded === m.files, tag + ' -- and ' + (m.files - m.decoded) + ' did not');
    /* ONE PICTURE PER SQUARE METRE. A block of them is one tile a block wide,
       which is what v0.30.0 shipped and what the person rejected. */
    assert(m.tiles === m.decoded,
      `${m.name} has ${m.decoded} pictures and the renderer made ${m.tiles} tile(s) out of` +
      ' them -- a square metre may not wear a BLOCK of pictures');
    assert(m.kinds.every((k) => k === r.px + 'x' + r.px),
      `${m.name}'s tiles are ${m.kinds.join(', ')} for a pattern of ${r.px}x${r.px}` +
      ' -- a tile bigger than one square metre is several pictures in a block');
    assert(m.own.every((d) => d <= 1) && m.ownWorst <= 2,
      `${m.name}'s tiles are not its own pictures: mean distance ${m.own.join('/')},` +
      ` worst ${m.ownWorst} -- each tile must BE its picture, not a blend of them`);
    if (m.tiles > 1) {
      assert(m.distinct === m.tiles,
        `${m.name} has ${m.decoded} pictures and only ${m.distinct} different tiles --` +
        ' some pictures are being ignored');
    }
  }

  /* The control. If the generated tile were anywhere near the picture, everything
     above would be satisfied by a game that had never used the picture at all. */
  for (const g of r.gen) {
    assert(g.tiles === 0 && g.drawn === false,
      `${g.name} still composes ${g.tiles} picture tile(s) with the pictures switched off`);
    assert(g.dist.mean >= 25 && g.dist.worst >= 80,
      `the generated ${g.name} tile sits ${g.dist.mean} levels from the picture (worst` +
      ` ${g.dist.worst}) -- it is too close for "what reached the ground was the picture"` +
      ' to mean anything');
  }

  assert(r.bareRow && r.bareRow.files === 0,
    `every material has pictures in it, so "a material nobody drew" was never tested`);
  assert(r.bareRow.tiles === 0 && r.bareRow.drawn === false,
    `a material with no pictures in its folder composed ${r.bareRow.tiles} tile(s)`);
});

/* The other half of what the person asked for -- "use them randomly" -- which no
 * single tile can show. v0.30.0 laid the pictures out in a block; v0.31.0's fix is
 * that a square metre wears the picture its OWN COORDINATES pick, so the thing to
 * prove is that the picks are not a lattice. A lattice repeats at a fixed step,
 * and that is a measurement rather than an impression: walk a patch of ground and
 * ask what a square agrees with the square `step` away. Laid out in a block, the
 * answer is 1.0 the moment the step reaches the block's width -- or at step
 * (1,0) if the tile were a single column. Scattered, it sits near 1/n, which is
 * what the same patch looks like if the picks were thrown at random.
 *
 * Only the materials with more than one picture can be asked: with one picture
 * every square agrees with every other by arithmetic, and the answer would be a
 * tautology dressed as a pass. */
await test('the ground wears the pictures scattered, not laid out in a block', async () => {
  const r = await page.evaluate(() => {
    const n24 = 24;
    const mats = (window.__test.textures().materials || [])
      .filter((k) => Render.matPictures(k).length > 1);
    const rows = mats.map((name) => {
      const n = Render.matPictures(name).length;
      const sc = window.__test.scatter(name, n24, n24);
      const w = sc.w, h = sc.h, picks = sc.picks;
      const tally = new Array(n).fill(0);
      for (const v of picks) tally[v]++;
      /* The best a LATTICE could do: for every step and direction up to twelve
         squares, how often a square and the one that far away wear the same
         picture. The worst-behaved lattice scores 1.0; a scatter scores ~1/n. */
      let bestStep = null, bestAgree = 0;
      for (let d = 1; d <= 12; d++) {
        for (const dir of [[d, 0], [0, d], [d, d]]) {
          let same = 0, tot = 0;
          for (let y = 0; y + dir[1] < h; y++) {
            for (let x = 0; x + dir[0] < w; x++) {
              tot++;
              if (picks[y * w + x] === picks[(y + dir[1]) * w + (x + dir[0])]) same++;
            }
          }
          const agree = same / tot;
          if (agree > bestAgree) { bestAgree = agree; bestStep = dir.join(','); }
        }
      }
      /* Neighbours, which is where a block is most obvious: side by side inside a
         block, every square agrees with the one next to it. */
      let neigh = 0, tot = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (x + 1 < w) { tot++; if (picks[y * w + x] === picks[y * w + x + 1]) neigh++; }
          if (y + 1 < h) { tot++; if (picks[y * w + x] === picks[(y + 1) * w + x]) neigh++; }
        }
      }
      /* And whole rows or columns of one picture, which is what a picker that has
         stopped picking looks like. */
      let monoRow = 0, monoCol = 0;
      for (let y = 0; y < h; y++) {
        if (new Set(Array.from({ length: w }, (_, x) => picks[y * w + x])).size === 1) monoRow++;
      }
      for (let x = 0; x < w; x++) {
        if (new Set(Array.from({ length: h }, (_, y) => picks[y * w + x])).size === 1) monoCol++;
      }
      return { name, n, distinct: new Set(picks).size,
               tally, min: Math.min(...tally), max: Math.max(...tally),
               want: (w * h) / n,
               neighAgree: +(neigh / tot).toFixed(3), chance: +(1 / n).toFixed(3),
               bestStep, bestAgree: +bestAgree.toFixed(3), monoRow, monoCol,
               squares: w * h };
    });
    return { rows, squares: n24 * n24 };
  });

  assert(r.rows.length > 0,
    'no material has more than one picture, so a scatter cannot even be asked about');
  for (const m of r.rows) {
    assert(m.distinct === m.n,
      `${m.name}: ${m.distinct} of ${m.n} pictures are used anywhere on ${m.squares}` +
      ' squares of ground');
    /* A lattice is what this replaced: 1.0 at its own step. The margin between
       that and what a scatter scores is the whole test. */
    assert(m.bestAgree <= 0.5,
      `${m.name}: squares ${m.bestStep} apart wear the same picture ${m.bestAgree} of the` +
      ` time (chance is ${m.chance}) -- the ground is laid out in a pattern, not scattered`);
    assert(m.neighAgree < 0.75,
      `${m.name}: a square agrees with the one beside it ${m.neighAgree} of the time --` +
      ' that is a block of pictures, which is exactly what was rejected');
    assert(m.monoRow === 0 && m.monoCol === 0,
      `${m.name}: ${m.monoRow} whole rows and ${m.monoCol} whole columns wear one picture`);
    assert(m.min > m.want * 0.25 && m.max < m.want * 4,
      `${m.name}: the pictures are used ${m.min}..${m.max} times on ${m.squares} squares,` +
      ` against ${m.want} each if they were even -- the picker favours some pictures`);
  }
});

await test('the pictures are what you see on the ground', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    /* Which materials in this frame came from a dropped-in picture rather than
       from the generator, and how many ground faces wore one. */
    const drawn = (window.__test.textures().materials || []).filter((k) => Render.drawn(k));
    const on = window.__test.pictures(true);
    window.__test.redraw();
    const kindsDrawn = window.__test.fillKinds();
    const picksDrawn = Render.consumed.picks;
    window.__test.keep();
    window.__test.pictures(false);
    window.__test.redraw();
    const kindsGen = window.__test.fillKinds();
    const picksGen = Render.consumed.picks;
    const diff = window.__test.diff();
    window.__test.pictures(true);
    window.__test.redraw();
    return { on, drawn, kindsDrawn, picksDrawn, kindsGen, picksGen, diff,
             pixels: Render.w * Render.h };
  });

  assert(r.drawn.length > 0,
    'no material in this frame is drawn from a dropped-in picture -- switch the frame on'
    + ' first, or there is nothing here to measure');
  assert(r.on === true, 'the pictures switch came back off');

  /* Pixels, not a flag: the same frozen moment painted both ways. The ground is
     most of a frame, and most of the ground wears a material, so a picture that
     reached the screen moves a large part of the picture -- and one that was
     decoded and then ignored moves none of it. */
  assert(!r.diff.error, r.diff.error || 'nothing was kept');
  assert(r.diff.differ > r.pixels * 0.05,
    `only ${r.diff.differ} of ${r.pixels} pixels differ (${r.diff.deep} of them by more` +
    ` than 8 levels, worst ${r.diff.worst}) -- the dropped-in pictures are claimed to be` +
    ' on the ground and the picture barely notices');
  assert(r.diff.worst > 8,
    `the worst a pixel moved is ${r.diff.worst} levels -- that is a hairline, not a surface`);

  /* And the amount of picture should be about the amount of ground: a census of
     the frame rather than a sample of some corner of it. */
  assert(r.kindsDrawn.pattern > 0 && r.kindsGen.pattern > 0,
    `patterned fills: ${r.kindsDrawn.pattern} with pictures, ${r.kindsGen.pattern} without`);

  /* HOW MANY DIFFERENT PICTURES actually reached the ground while that frame was
     painted. One picture per material would be a game wearing a single picture
     over the whole floor -- which is what the rejected block was made of -- and it
     would pass every other assertion here. */
  assert(r.picksGen === 0,
    `${r.picksGen} picture picks were counted with the pictures switched off`);
  assert(r.picksDrawn > 1,
    `only ${r.picksDrawn} distinct picture(s) reached the ground in this frame -- the` +
    ' pictures are all there and the floor is wearing one of them');
});

await test('a crawler is built from rounded parts, not boxes', async () => {
  const r = await page.evaluate(() => {
    const fig = window.__test.data.figure;
    const sides = Object.keys(fig).map((k) => fig[k].sides);
    const rings = Object.keys(fig).map((k) => fig[k].rings);
    const capped = Object.keys(fig).filter((k) => fig[k].cap_top > 0 || fig[k].cap_bot > 0);
    const body = ['head', 'torso', 'thigh_l', 'upperarm_l'].map((k) => fig[k]);
    return { sides, rings, capped: capped.length, body,
             tooFewRings: capped.filter((k) => fig[k].rings < 3) };
  });
  assert(Math.min(...r.sides) >= 4, `some part has only ${Math.min(...r.sides)} sides`);
  assert(r.sides.filter((n) => n >= 6).length > r.sides.length * 0.6,
    'most parts are still four-sided boxes');
  assert(r.capped > 6, `only ${r.capped} parts have rounded ends`);
  assert(r.tooFewRings.length === 0,
    `${r.tooFewRings.join(', ')} round their ends with fewer than 3 rings, which collapses them`);
  for (const b of r.body) {
    assert(b.sides >= 6 && b.rings >= 3,
      `a main body part is ${b.sides} sides by ${b.rings} rings`);
  }
  assert(r.body[1].bulge > 0, 'the torso does not swell between its ends');
});

await test('the labyrinth is dark, and light is carried into it', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const atStart = window.__test.litCells();
    const sources = window.__test.lightSources();
    for (let i = 0; i < 45; i++) window.__test.frame(60);     /* let the camp go up */
    const afterCamp = window.__test.litCells();
    const camp = window.__test.camp();
    const fire = camp.sites.find((q) => q.structure === 'campfire');
    return { atStart, afterCamp, sources, fire,
             atFire: window.__test.lightAt(fire.x, fire.y),
             ambient: window.__test.data.knobs['light.ambient'],
             built: camp.summary.built };
  });
  assert(r.ambient < 0.3, `the dark is ${r.ambient}, which is not dark`);
  assert(r.atStart.dark > r.atStart.total * 0.9,
    `${r.atStart.lit} of ${r.atStart.total} squares were lit before anything was built`);
  assert(r.sources.length > 0, 'nobody carries any light at all');
  assert(r.fire.built, 'the campfire never got built, so this proves nothing');
  assert(r.atFire > 0.9, `the square the fire is on is only at ${r.atFire} light`);
  assert(r.afterCamp.lit > r.atStart.lit,
    `lighting a fire changed nothing: ${r.atStart.lit} lit before, ${r.afterCamp.lit} after`);
  assert(r.afterCamp.dark > r.afterCamp.total * 0.5,
    'building one fire lit more than half the labyrinth');
});

await test('light does not go through rock', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    for (let i = 0; i < 45; i++) window.__test.frame(60);
    const w = window.__test.state.world;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
    let tested = 0, leaked = 0, litOpen = 0;
    for (const src of window.__test.lightSources()) {
      for (const d of dirs) {
        /* Walk out from the light until rock is hit, then look just past it. */
        for (let k = 1; k <= Math.ceil(src.r); k++) {
          const c = w.at(src.x + d[0] * k, src.y + d[1] * k);
          if (!c) break;
          if (TILE(c.tile).tags.indexOf('blocks-sight') < 0) {
            if (window.__test.lightAt(c.x, c.y) > 0.2) litOpen++;
            continue;
          }
          const beyond = w.at(src.x + d[0] * (k + 1), src.y + d[1] * (k + 1));
          if (beyond && k + 1 < src.r - 1) {
            tested++;
            if (window.__test.lightAt(beyond.x, beyond.y) > 0.25) leaked++;
          }
          break;
        }
      }
    }
    return { tested, leaked, litOpen };
  });
  assert(r.litOpen > 10, `only ${r.litOpen} open squares were lit at all`);
  assert(r.tested > 0, 'no light was ever shining at a wall, so nothing was proved');
  assert(r.leaked === 0,
    `light reached ${r.leaked} of ${r.tested} squares that sit behind rock`);
});

await test('what a crawler carries is what lights their way', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(4);
    const i = 0;
    window.__test.strip(i);
    const a = window.__test.actors()[i];
    window.__test.state.lightDirty = true; computeLight(window.__test.state);
    const bare = window.__test.lightAt(a.x, a.y);

    window.__test.wear(i, 'offhand', 'candle');
    window.__test.state.lightDirty = true; computeLight(window.__test.state);
    const candle = window.__test.lightAt(a.x, a.y);
    const candleReach = window.__test.lightSources().find((q) => q.x === a.x && q.y === a.y);

    window.__test.wear(i, 'offhand', 'torch');
    window.__test.state.lightDirty = true; computeLight(window.__test.state);
    const torchReach = window.__test.lightSources().find((q) => q.x === a.x && q.y === a.y);

    window.__test.strip(i);
    window.__test.state.lightDirty = true; computeLight(window.__test.state);

    /* WHAT THEIR OWN SQUARE ACTUALLY GETS, worked out from the sheet rather than
       chosen. Since v0.49.0 a carried light hangs at its real height
       (`light.lamp_height`), so the square a crawler stands on sits that far
       BELOW the flame and is dimmer for it -- which is the whole point of the
       change, and it is why this bound is not 1.0. Light is also stored in steps
       (`light.steps`), so half a step of slack is allowed. */
    const c = window.__test.cfg;
    const own = 1 - Math.pow(c.lampHeight / candleReach.r, c.falloff);
    return { bare, candle, candleReach, torchReach, own, half: 0.5 / c.lightSteps,
             gear: window.__test.data.gear };
  });
  assert(r.bare < 0.2, `a crawler with nothing stood in ${r.bare} light`);
  assert(r.candle > 0.75, `a lit candle gave their own square only ${r.candle}`);
  assert(Math.abs(r.candle - r.own) <= r.half + 1e-6,
    `a lit candle gave their own square ${r.candle}, but the sheet's own falloff`
    + ` -- a candle reaching ${r.candleReach.r}m, hung ${r.candleReach.z} up --`
    + ` says ${r.own}, give or take half a step (${r.half})`);
  assert(r.torchReach.r > r.candleReach.r,
    `a torch reaches ${r.torchReach.r}m and a candle ${r.candleReach.r}m`);
  assert(r.gear.torch.light > 0 && r.gear.candle.light > 0 && r.gear.lantern.light > 0,
    'one of the three lights throws none');
  assert(r.gear.jerkin.light === 0, 'a leather jerkin is giving off light');
});

/* ---- v0.49.0: light with a height to it, and the shade it leaves -------- */

await test('a light hangs in the air, at the height the sheet gives it', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    const s = Game.state;
    /* The world's OWN list of sources. Anything built by a second call to
       lightSourcesIn() is a different set of objects, so the square's
       lightSrc -- an index into this list -- is the only thing they share. */
    const ss = s.sources || [];

    /* Every source, and how far above its OWN ground it hangs. Read off the
       world's own list rather than argued about, so a light that was silently
       pinned to the floor would show up here. */
    let lamp = 0, fire = 0;
    const odd = [];
    for (const q of ss) {
      const g = surfaceHeight(s.world.at(q.x, q.y));
      const up = q.z - g;
      const should = q.site !== undefined ? CFG.fireHeight : CFG.lampHeight;
      if (Math.abs(up - should) < 1e-9) { if (q.site !== undefined) fire++; else lamp++; }
      else odd.push({ x: q.x, y: q.y, up: up, r: q.r });
    }

    /* The square a FIRE is standing on: distance zero from it, so the light
       there is the fire's own falloff with nothing in the way. A crawler can
       legitimately own a square they are standing on instead, so the square is
       found by asking which lit square the fire below it owns. */
    let own = null;
    for (const c of s.world.cells) {
      if (!(c.light > 0) || c.lightD !== 0) continue;
      const q = ss[c.lightSrc];
      if (!q || q.site === undefined) continue;
      if (!own || c.light > own.c.light) own = { c: c, q: q };
    }
    const fc = own ? own.c : null, fq = own ? own.q : null;
    const foot = fc ? surfaceHeight(fc) : 0;
    /* Climbing away from the flame, starting AT it, so the walk is monotone
       whatever the fire is standing next to. */
    const steps = [0, 0.25, 0.5, 1, 2].map((z) => lightValueAt(s, fc, fq.z + z));
    return {
      n: ss.length, lamp: lamp, fire: fire, odd: odd,
      lh: CFG.lampHeight, fh: CFG.fireHeight, hasOwn: !!own,
      r: fq ? fq.r : 0, up: fq ? fq.z - foot : 0,
      own: fq ? 1 - Math.pow((fq.z - foot) / fq.r, CFG.falloff) : -1,
      floor: fq ? lightValueAt(s, fc, foot) : -1,
      flame: fq ? lightValueAt(s, fc, fq.z) : -1,
      steps: steps
    };
  });
  assert(r.odd.length === 0,
    `${r.odd.length} lights hang at a height the sheet knows nothing about: `
    + JSON.stringify(r.odd));
  assert(r.lamp >= 1 && r.fire >= 1,
    `${r.lamp} carried lights and ${r.fire} fires hang in the air out of ${r.n} `
    + `sources, but both kinds are supposed to`);
  assert(r.lh > r.fh,
    `the sheet hangs a lamp at ${r.lh}m and a fire at ${r.fh}m`);
  assert(r.hasOwn, 'no fire in the camp owns the square it is standing on');
  assert(Math.abs(r.up - r.fh) < 1e-9,
    `the fire's flame sits ${r.up}m over its own ground; the sheet says ${r.fh}m`);
  /* A light at a height means the square it stands over is NOT the brightest
     thing it touches -- the brightest is the flame's own height. */
  assert(Math.abs(r.floor - r.own) < 1e-9,
    `the fire's own square reads ${r.floor}; its height and reach say ${r.own}`);
  assert(r.flame === 1, `at the flame's own height the light reads ${r.flame}, not 1`);
  assert(r.floor < r.flame,
    `a square UNDER the flame reads ${r.floor} and the flame itself ${r.flame}`);
  for (let i = 1; i < r.steps.length; i++) {
    assert(r.steps[i] < r.steps[i - 1],
      `climbing away from the flame the light went ${r.steps[i - 1]} then `
      + `${r.steps[i]}: ${JSON.stringify(r.steps)}`);
  }
});

await test('a light lights the foot of a wall and leaves the top of it dark', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;

    /* Seven seeds, because the camp has to be finished before there is a fire
       at all, and because one seed's answer is one seed's answer (lesson 22).
       Every rock face any source can reach: half a metre up it against three
       metres up it. A light pinned to the floor reads the same at both. */
    const drops = [], close = [];
    for (let sd = 1; sd <= 7; sd++) {
      t.seed(sd);
      for (let i = 0; i < 45; i++) t.frame(60);
      const s = Game.state;                 /* read AFTER seeding, lesson 27 */
      for (const c of s.world.cells) {
        if (!(c.light > 0)) continue;
        if (TILE(c.tile).tags.indexOf('blocks-sight') < 0) continue;
        const q = s.sources[c.lightSrc];
        if (!q) continue;
        /* Measured from the FACE's own ground, not the fire's: the rock beside
           a fire three metres above it starts its measurement three metres up.
           And the source is the one that WON this square -- the rock round the
           camp is lit by the crawlers' lamps, not by the flame. */
        const h = surfaceHeight(c);
        const rec = { sd: sd, x: c.x, y: c.y, walked: c.lightD,
                      far: Math.hypot(q.x - c.x, q.y - c.y),
                      d: lightValueAt(s, c, h + 0.5) - lightValueAt(s, c, h + 3) };
        drops.push(rec);
        if (c.lightD >= 1 && c.lightD <= 3 && rec.far <= 3.5) close.push(rec);
      }
    }
    drops.sort((a, b) => a.d - b.d);
    close.sort((a, b) => a.d - b.d);

    /* The negative control: with the height taken out of the falloff a sample
       half a metre up a face and a sample three metres up it are the same
       distance from the light, so every face must read the same at both. The
       same faces of the same world -- nothing is re-flooded -- so the only
       thing that changed is the height. */
    const s7 = Game.state;
    const faces = s7.world.cells.filter((c) =>
      c.light > 0 && TILE(c.tile).tags.indexOf('blocks-sight') >= 0 &&
      s7.sources[c.lightSrc]);
    const was = CFG.heightFalloff;
    let ctrl = 0;
    try {
      CFG.heightFalloff = 0;
      for (const c of faces) {
        const h = surfaceHeight(c);
        if (lightValueAt(s7, c, h + 0.5) - lightValueAt(s7, c, h + 3) > 1e-9) ctrl++;
      }
    } finally {
      CFG.heightFalloff = was;
    }

    /* And those faces reaching the PICTURE as a fade rather than one flat fill.
       Each face's own foot is handed to faceBase(), which is what the renderer
       works out for it, so this census asks the question the wall asks. */
    const quad = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 96 }, { x: 0, y: 96 }];
    let rock = 0, faded = 0, unlitFlat = 0;
    for (const c of s7.world.cells) {
      if (TILE(c.tile).tags.indexOf('blocks-sight') < 0) continue;
      rock++;
      const got = Render.faceBase(s7, c, TILE(c.tile).side, CFG.shadeLeft, quad, 0,
                                  surfaceHeight(c));
      if (got !== null && typeof got === 'object') faded++;
      else if (!(c.light > 0)) unlitFlat++;
    }

    const mid = (a) => (a.length ? a[Math.floor(a.length / 2)].d : 0);
    return {
      n: drops.length, median: mid(drops),
      best: drops.length ? drops[drops.length - 1] : null,
      thinnest: drops.length ? drops[0].d : 0,
      over05: drops.filter((q) => q.d > 0.05).length,
      zero: drops.filter((q) => q.d <= 1e-9).length,
      closeN: close.length, closeMedian: mid(close),
      closeZero: close.filter((q) => q.d <= 1e-9).length,
      closeOver05: close.filter((q) => q.d > 0.05).length,
      ctrl: ctrl, ctrlN: faces.length,
      rock: rock, faded: faded, unlitFlat: unlitFlat,
      rise: CFG.rise, fh: CFG.fireHeight };
  });
  const cm = (c) => (c ? `(${c.x},${c.y}) seed ${c.sd}` : 'nowhere');
  assert(r.n >= 300,
    `only ${r.n} rock faces across seven seeds are lit by any source`);
  /* A light pinned to the floor -- the way it was before this version -- reads
     the same at 0.5m up a face and at 3m up it, so every one of these drops
     would be exactly 0. Measured over seeds 1-7: 463 faces, the median face
     falling 0.165 over 2.5m of height and the steepest 0.465. */
  assert(r.median > 0.08,
    `halfway down ${r.n} lit rock faces the light falls only ${r.median} over `
    + `2.5m of height (steepest ${r.best && r.best.d} at ${cm(r.best)}, `
    + `thinnest ${r.thinnest}, and ${r.zero} faces showing no drop at all)`);
  assert(r.best && r.best.d > 0.2,
    `the steepest of ${r.n} lit rock faces falls only ${r.best && r.best.d} over `
    + `2.5m of height, at ${cm(r.best)}`);
  assert(r.over05 * 10 >= r.n * 7,
    `${r.n - r.over05} of ${r.n} lit rock faces fall less than 0.05 over 2.5m of `
    + `height, so most of them are not showing the height at all`);
  assert(r.zero * 20 <= r.n * 3,
    `${r.zero} of ${r.n} lit rock faces show no drop at all over 2.5m of height`);
  /* The faces the light is fully on, rather than the dim rim of its pool. */
  assert(r.closeN >= 20,
    `only ${r.closeN} lit rock faces are within 3.5m of the source that lit them`);
  assert(r.closeMedian > 0.15 && r.closeOver05 === r.closeN && r.closeZero === 0,
    `of ${r.closeN} rock faces within 3.5m of their own light only `
    + `${r.closeOver05} fall more than 0.05 over 2.5m of height (median `
    + `${r.closeMedian}, ${r.closeZero} showing no drop)`);
  /* The knob that turns the height off turns every one of these drops off. */
  assert(r.ctrl === 0,
    `${r.ctrl} of ${r.ctrlN} rock faces still fall off with height with `
    + `height_falloff set to 0, so the drop is not coming from the height`);
  assert(r.faded >= 1,
    `no rock face in the world reaches the picture as a fade (${r.rock} faces)`);
  assert(r.rock >= r.faded * 4,
    `${r.faded} of ${r.rock} rock faces are faded; the fade is meant to be on `
    + `the faces a light can reach, not on the rock`);
  assert(r.unlitFlat >= 1,
    'every rock face in the world is faded, so none of them is dark');
});

/* Rule 8 says anything visible can be hovered and says what it is, and the one
   fact every kind of thing in the box can be asked is how lit it is where it
   stands. The world has kept that number on the square since v0.49.0 --
   `lightAt` is the game's own answer, and the picture and the light map are both
   drawn from it -- but until v0.50.0 nothing told the player.

   Both halves of the split the inspector is built on are checked: that the
   DESCRIPTION carries the world's own answer for that square, and that the words
   reached the screen. The description is read for all three kinds of thing --
   ground, a crawler, and the camp's own structures -- because one number is only
   useful if it means the same thing everywhere it is shown. The screen is read
   through the harness's own door and never the real mouse, so nothing here can
   be about where a previous test left the pointer (lesson 28), and every screen
   case names the square it landed in and refuses the ones something was standing
   over.

   The floors are sampled across the WHOLE piece rather than around the fire, so
   a box that always said "100%" -- the value a description with no light in it
   would have to fake -- shows up as one level and fails. */
await test('the box says how lit it is where the thing stands', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    const pct = (cell) => Math.round(lightAt(Game.state, cell) * 100) + '%';
    const wrong = [];
    const levels = {};
    let floors = 0, actors = 0, sites = 0, dark = 0, fire = 0;

    for (const sd of [1, 5, 9]) {
      t.seed(sd);
      for (let i = 0; i < 45; i++) t.frame(60);   /* the camp has to be built */
      const s = Game.state;                       /* read AFTER seeding */

      for (let k = 0; k < s.world.cells.length; k += 13) {
        const c = s.world.cells[k];
        if (!c) continue;
        const d = t.describe(k);
        if (!d || d.kind !== 'ground') continue;
        const want = pct(c);
        floors++;
        if (d.light !== want) {
          wrong.push({ sd: sd, kind: 'ground', at: d.at, said: d.light, want: want });
        }
        levels[d.light] = 1;
        if (d.light === '0%') dark++;
      }

      /* A crawler: the light of the square they are standing in, read back
         through the pick table rather than through the actor. */
      for (let i = 0; i < s.actors.length; i++) {
        const a = s.actors[i];
        const d = t.describe(Render.actorBase(s) + i);
        const cell = s.world.at(a.x, a.y);
        if (!d || d.kind !== 'crawler' || !cell) continue;
        const want = pct(cell);
        actors++;
        if (d.light !== want) {
          wrong.push({ sd: sd, kind: 'crawler', at: a.x + ', ' + a.y, said: d.light, want: want });
        }
        levels[d.light] = 1;
        if (d.light === '0%') dark++;
      }

      /* And the camp's own buildings, the fire first among them: the square a
         fire is burning on has to read full, or the number is not the light. */
      for (let i = 0; i < s.camp.sites.length; i++) {
        const site = s.camp.sites[i];
        const d = t.describe(Render.siteBase(s) + i);
        const cell = s.world.at(site.x, site.y);
        if (!d || d.kind !== 'site' || !cell) continue;
        const want = pct(cell);
        sites++;
        if (d.light !== want) {
          wrong.push({ sd: sd, kind: 'site', at: d.at, said: d.light, want: want });
        }
        levels[d.light] = 1;
        if (site.built && STRUCT(site.structure).light > 0 && d.light === '100%') fire++;
      }
    }

    /* ---- and the same number reaches the picture's two surfaces ---------- */
    t.seed(7);
    for (let i = 0; i < 45; i++) t.frame(60);
    let s = Game.state;
    const shown = [], levelsShown = {}, seen = {};
    let first = -1, tried = 0;
    /* Ask the picture the way a player does: put the pointer on a pixel and read
       the words. A grid of pixels, not a list of squares -- the match holds many
       pieces and only what is on the picture can be pointed at, so projecting a
       square says nothing about whether a pointer could reach it. */
    const bufW = Render.bctx.canvas.width, bufH = Render.bctx.canvas.height;
    for (let by = 8; by < bufH && shown.length < 12; by += 16) {
      for (let bx = 8; bx < bufW && shown.length < 12; bx += 16) {
        tried++;
        const hv = t.point(bx, by);
        s = Game.state;                      /* the paint can lay ground */
        if (hv < 0 || hv >= s.world.cells.length) continue;  /* not a square */
        if (seen[hv]) continue;              /* the same square, another pixel */
        const d = t.describe(hv);
        const tip = t.tooltipOnScreen();
        if (!d || d.kind !== 'ground' || !tip) continue;
        seen[hv] = 1;
        shown.push({ at: bx + ',' + by, said: d.light,
                     ok: tip.text.indexOf(N('ui.label_light') + ' ' + d.light) >= 0,
                     text: tip.text });
        levelsShown[d.light] = 1;
        if (first < 0) first = hv;
      }
    }

    /* A crawler through the pointer, and the pinned panel over a square. */
    const found = t.pointAtAnyActor();
    const crawled = t.tooltipOnScreen();
    const dc = found.found ? t.describe(found.pick) : null;

    let panel = null, panelSaid = null;
    if (first >= 0) {
      t.select(first);
      panel = t.panelOnScreen();
      panelSaid = t.describe(first).light;
    }
    return {
      word: N('ui.label_light'),
      floors: floors, actors: actors, sites: sites, wrong: wrong,
      levels: Object.keys(levels).length, dark: dark, fire: fire,
      shown: shown, shownLevels: Object.keys(levelsShown).length, tried: tried,
      crawled: found.found ? { said: dc.light, text: crawled ? crawled.text : null } : null,
      panel: panel ? { said: panelSaid, text: panel.text } : null
    };
  });
  console.log('  ... the box carries the light on ' + (r.floors + r.actors + r.sites)
    + ' things (' + r.floors + ' squares, ' + r.actors + ' crawlers, ' + r.sites
    + ' camp sites) over 3 seeds, ' + r.levels + ' different levels, '
    + r.dark + ' of them dark and ' + r.fire + ' at full light');
  console.log('  ... ' + r.shown.length + ' squares pointed at on screen out of '
    + r.tried + ' pixels tried, ' + r.shownLevels
    + ' different levels, and the words agree with lightAt');

  if (r.wrong.length) {
    throw new Error(`${r.wrong.length} of ${r.floors + r.actors + r.sites} descriptions `
      + `are not the light the world keeps on that square, first: `
      + JSON.stringify(r.wrong.slice(0, 4)));
  }
  assert(r.floors >= 100,
    `only ${r.floors} squares of the world were described at all`);
  assert(r.actors >= 3, `only ${r.actors} crawlers were described`);
  assert(r.sites >= 3, `only ${r.sites} camp sites were described`);
  assert(r.levels >= 3,
    `the whole world only ever showed ${r.levels} different light levels, so the `
    + `number is not tracking the light: ${JSON.stringify(r.levelsSeen || [])}`);
  assert(r.dark >= 1,
    'no square in the world read as unlit, so a dark corner says it is bright');
  assert(r.fire >= 1,
    `${r.fire} burning fires read anything other than full light on their own square`);

  assert(r.shown.length >= 3,
    `only ${r.shown.length} of the squares pointed at (of ${r.tried} pixels tried) `
    + `were reached by the pointer`);
  for (const c of r.shown) {
    assert(c.ok, `the tooltip says "${c.text}" but the square's light is ${c.said}`);
  }
  assert(r.shownLevels >= 2,
    `every square the pointer reached read ${r.shown[0] && r.shown[0].said}, so the `
    + `tooltip is showing one number everywhere`);
  assert(r.crawled, 'the pointer could not reach a crawler to read their light');
  assert(r.crawled.text.indexOf(r.word + ' ' + r.crawled.said) >= 0,
    `hovering a crawler, the tooltip says "${r.crawled.text}" and their square's `
    + `light is ${r.crawled.said}`);
  assert(r.panel, 'nothing was pinned, so the panel never showed a light');
  assert(r.panel.text.indexOf(r.word) >= 0 && r.panel.text.indexOf(r.panel.said) >= 0,
    `the pinned panel says "${r.panel.text}" and never mentions the light (${r.panel.said})`);
});

/* THE TOP METRE OF A WALL IS THE SAME SURFACE AS THE METRE BENEATH IT, so it
   takes the same light -- which makes it the one place nobody thinks to look,
   because the picture is dissolving away there.

   A material somebody DREW arrives as a picture with the fade already baked into
   its own alpha, and the light reaches it as a second fill in multiply. Where the
   light is FLAT across the face nothing can go wrong: the colour comes with the
   picture. Where the light RAMPS -- every face standing beside a fire or a
   carried lamp -- the two fills have to agree about where the ramp LANDS. They
   did not: the multiply was painted over the solid part of the face only, so the
   top metre stood at the raw brightness of the picture whatever light reached
   it, and the brightest stripe of a wall was the part being dissolved.

   Measured where it cannot be argued with: the brightness of the band's own
   pixels against the brightness of the pixels just below it, each divided by the
   light the world keeps on that square at that height. Light that lands gives
   about 1; the raw picture above a lit foot gives about 1.8 on the shipped build.

   Only the RAMPS are judged. The flat arm of the same painting -- a band with no
   ramp in it -- is counted and reported rather than asserted on, and the pixels
   are only ones the pointer says the wall owns, so a crawler or a half-built camp
   standing in front of the face cannot be counted as wall. And every measured
   pixel has to be well short of full light, because at full light the picture and
   the light on it are the same number and this ruler could not fail. */
await test('the dissolving top of a wall takes the light that reaches it',
  async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.setTexture(1); t.smoothLight(1); t.lightShadows(false);

    const lum = (c) => {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(c);
      return m ? 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3] : -1;
    };
    const out = { seeds: 0, faces: 0, flats: 0, px: 0, dim: 0, full: 0,
                  band: 0, want: 0, worst: 0, ratios: [], median: 0, ratio: 0 };

    for (let sd = 1; sd <= 3; sd++) {
      t.seed(sd);
      for (let i = 0; i < 45; i++) t.frame(60);
      const s = Game.state;                 /* read AFTER seeding, lesson 27 */

      /* Every wall face the painter was handed a band for, and the quad it was
         given -- the face's own geometry, not a guess at it. */
      const recs = [];
      const orig = R.paintSide;
      R.paintSide = function (ctx, quad, metres, colour, fill, band, base, over) {
        if (band) {
          recs.push({ q: [{ x: quad[0].x, y: quad[0].y },
                          { x: quad[1].x, y: quad[1].y },
                          { x: quad[3].x, y: quad[3].y }],
                      m: metres, over: !!over });
        }
        return orig.apply(this, arguments);
      };
      t.redraw();
      R.paintSide = orig;

      for (const rec of recs) {
        if (!rec.over) { out.flats++; continue; }
        const q = rec.q, fd = R.fadeDepth(rec.m);
        if (!(fd > 0)) continue;
        const d = fd * CFG.rise;
        let fb = 0, fw = 0, n = 0;
        for (const fr of [0.35, 0.5, 0.65]) {
          const x = Math.round(q[0].x + (q[1].x - q[0].x) * fr);
          const yTop = q[0].y + (q[1].y - q[0].y) * fr;
          const yFoot = yTop + (q[2].y - q[0].y);
          const y0 = Math.round(yTop + d) - 2;
          if (!(y0 + 5 < yFoot - 1)) continue;    /* no room for BOTH arms */
          const L = t.line(x, y0, x, y0 + 5);
          if (L.n !== 5) continue;
          const owner = L.pick[0];
          let clean = owner >= 0;
          for (const p of L.pick) if (p !== owner) clean = false;
          if (!clean) continue;                   /* something else owns a row */
          const cell = s.world.cells[owner];
          if (!cell || TILE(cell.tile).tags.indexOf('blocks-sight') < 0) continue;
          const h = surfaceHeight(cell);
          const lift = Math.round((1 + cell.h * CFG.heightTint) * 100) / 100;
          const f = (CFG.shadeLeft + CFG.shadeRight) / 2 * lift;
          for (let k = 0; k < 3; k++) {
            const zB = h - (y0 + k - yTop) / CFG.rise;
            const zL = h - (y0 + 3 + k - yTop) / CFG.rise;
            const gb = lum(litShade('#ffffff', f, lightValueAt(s, cell, zB)));
            const gl = lum(litShade('#ffffff', f, lightValueAt(s, cell, zL)));
            if (!(gb > 0) || !(gl > 0)) continue;
            out.px++;
            if (gl > 0.7 * 255) { out.full++; continue; }
            out.dim++;
            out.band += L.lum[k];
            out.want += L.lum[3 + k] * (gb / gl);
            fb += L.lum[k]; fw += L.lum[3 + k] * (gb / gl); n++;
          }
        }
        if (n) {
          const ratio = fb / fw;
          out.faces++; out.ratios.push(ratio);
          if (ratio > out.worst) out.worst = ratio;
        }
      }
      out.seeds++;
    }
    out.ratios.sort((a, b) => a - b);
    if (out.ratios.length) {
      out.median = out.ratios[Math.floor(out.ratios.length / 2)];
    }
    out.ratio = out.want > 0 ? out.band / out.want : 0;
    return out;
  });
  assert(r.faces >= 12,
    `only ${r.faces} wall faces across ${r.seeds} seeds were both lit by a ramp `
    + `and clean enough to measure (${r.flats} more bands were lit flat, which is `
    + `the other arm rather than a failure to find one)`);
  assert(r.px >= 200,
    `${r.px} pixels were asked for across ${r.faces} faces, which is too few to `
    + `judge the band by`);
  assert(r.dim === r.px,
    `${r.full} of ${r.px} measured pixels were at 70% brightness or more, where `
    + `the picture and the light on it are the same number -- the ruler has to `
    + `stand somewhere it can fail, or it is measuring nothing`);
  assert(r.band > 0 && r.want > 0,
    `the band reads ${r.band} and what the light allows reads ${r.want}, so `
    + `there is nothing here to compare`);
  assert(r.ratio > 0.55 && r.ratio < 1.35,
    `the dissolving top of ${r.faces} lit wall faces reads ${r.ratio.toFixed(2)} `
    + `times what the light there allows (median face ${r.median.toFixed(2)}, `
    + `worst ${r.worst.toFixed(2)}, ${r.px} pixels over ${r.seeds} seeds) -- the `
    + `band of a wall is painting itself at the picture's own brightness instead `
    + `of at the light that reaches it`);
  assert(r.median < 1.35,
    `the middle face reads ${(r.median * 100).toFixed(0)}% of what the light `
    + `there allows (median over ${r.faces} faces), so the aggregate is being `
    + `carried by a few faces rather than the band following the light as a rule`);
  console.log(`  ... ${r.faces} lit wall faces over ${r.seeds} seeds, ${r.px} `
    + `pixels: the band reads ${(r.ratio * 100).toFixed(0)}% of what the light `
    + `allows (median face ${(r.median * 100).toFixed(0)}%, worst `
    + `${(r.worst * 100).toFixed(0)}%), with ${r.flats} more bands lit flat`);
});

await test('the light reaches the band, and the difference is the band', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.setTexture(1); t.smoothLight(1); t.lightShadows(false);
    const out = { seeds: 0, faces: 0, same: 0, differ: 0, inBand: 0, outBand: 0,
                  px: 0, q: [0, 0, 0, 0], delta: [0, 0, 0, 0],
                  mean: [0, 0, 0, 0], worstOut: 0 };
    for (let sd = 1; sd <= 2; sd++) {
      t.seed(sd);
      for (let i = 0; i < 45; i++) t.frame(60);
      out.seeds++;

      /* The faces the painter is handed a band for, in the order it paints them,
         captured while the frame is built -- which is where the band, and where
         the light lands on it, are decided. */
      let got = [];
      const orig = R.paintSide;
      R.paintSide = function (ctx, quad, metres, colour, fill, band, base, over) {
        if (band) {
          got.push({ q: [{ x: quad[0].x, y: quad[0].y },
                         { x: quad[1].x, y: quad[1].y }], m: metres, over: !!over });
        }
        return orig.apply(this, arguments);
      };
      t.bandLight(false);
      got = []; t.redraw();
      const offFaces = got.length;
      const off = R.bctx.getImageData(0, 0, R.w, R.h);
      t.bandLight(true);
      got = []; t.redraw();
      const onFaces = got.length;
      const on = R.bctx.getImageData(0, 0, R.w, R.h);
      R.paintSide = orig;
      out.faces += onFaces;
      if (offFaces === onFaces) out.same++;

      /* Every band, as the shape the painter covered -- so a pixel that moved can
         be placed: in one of these, or somewhere it has no business being. */
      const bands = [];
      for (const b of got) {
        if (!b.over) continue;                 /* only a ramped face is at issue */
        const fd = R.fadeDepth(b.m);
        if (!(fd > 0)) continue;
        const d = fd * CFG.rise;
        bands.push({ pts: R.bandQuad(b.q, d), d: d, span: b.q[1].x - b.q[0].x,
                     x0: b.q[0].x, y0: b.q[0].y, slope: b.q[1].y - b.q[0].y });
      }
      out.px += R.w * R.h;
      const a = off.data, c = on.data;
      for (let y = 0; y < R.h; y++) {
        for (let x = 0; x < R.w; x++) {
          const i = (y * R.w + x) * 4;
          const d0 = a[i] - c[i], d1 = a[i + 1] - c[i + 1], d2 = a[i + 2] - c[i + 2];
          if (!(d0 || d1 || d2)) continue;
          const dd = Math.max(Math.abs(d0), Math.abs(d1), Math.abs(d2));
          out.differ++;
          let hit = -1;
          for (let k = 0; k < bands.length; k++) {
            if (R.inShape(bands[k].pts, x + 0.5, y + 0.5)) { hit = k; break; }
          }
          if (hit < 0) {
            out.outBand++;
            if (dd > out.worstOut) out.worstOut = dd;
            continue;
          }
          const b = bands[hit];
          const fr = b.span ? (x + 0.5 - b.x0) / b.span : 0.5;
          const u = (y + 0.5 - (b.y0 + b.slope * fr)) / b.d;
          const k = u < 0.25 ? 0 : u < 0.5 ? 1 : u < 0.75 ? 2 : 3;
          out.inBand++; out.q[k]++; out.delta[k] += dd;
        }
      }
    }
    for (let k = 0; k < 4; k++) out.mean[k] = out.q[k] ? out.delta[k] / out.q[k] : 0;
    out.ships = t.bandLight();
    return out;
  });
  const pc = (n) => (100 * n / (r.px || 1)).toFixed(2) + '%';
  assert(r.faces >= 12,
    `only ${r.faces} wall faces across ${r.seeds} seeds carried a band, which is `
    + `too few to say anything about where the light lands`);
  assert(r.same === r.seeds,
    `the band was handed to a different set of faces with the light reaching it `
    + `(${r.same} of ${r.seeds} seeds agreed), so the flag is moving the faces `
    + `themselves rather than only the light on them`);
  assert(r.differ > 0,
    `the light reaching the band changed no pixel at all, so the flag is wired `
    + `to nothing`);
  assert(r.outBand === 0,
    `${r.outBand} pixels moved OUTSIDE every band (worst by ${r.worstOut} levels) `
    + `-- the change is supposed to be the top metre of a wall and nothing else, `
    + `and anything outside it is the ground, the figures or the rock behind`);
  assert(r.inBand > 200,
    `only ${r.inBand} pixels moved inside the bands, which is too few to be the `
    + `top metre of ${r.faces} wall faces`);
  assert(r.mean[0] < r.mean[3] / 2,
    `the band moved by ${r.mean[0].toFixed(1)} levels a pixel where it is `
    + `dissolving and ${r.mean[3].toFixed(1)} where it is solid -- the light has `
    + `to fade out WITH the band, not cut off at the top of it, or the wall `
    + `ends in a hard edge against the room beyond`);
  assert(r.ships === true,
    `the game ships with the band lit (bandLight() says ${r.ships}), which is `
    + `the way it is meant to be played and is the only way a test may measure `
    + `the shipped picture`);
  console.log(`  ... ${r.inBand} pixels moved inside bands (${pc(r.inBand)} of the`
    + ` picture) and ${r.outBand} outside them; levels a pixel by depth, top`
    + ` quarter down: ${r.mean.map((m) => m.toFixed(1)).join(', ')} over`
    + ` ${r.faces} faces on ${r.seeds} seeds`);
});

await test('the brightness of the floor is the light the world keeps on it', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    const s = Game.state, R = Render;
    const lum = (rgb) => {
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(rgb);
      return m ? 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3] : -1;
    };
    /* Where the crawlers are standing, and where the flames' shade falls, both
       read with the shade pass switched ON: a square with somebody standing on
       it shows their legs, and a square inside a shade shows the shade, and
       neither is a reading of the floor's own light. Both exclusions were
       earned -- the first run of this test blamed a square that had a crawler
       on it AND a shade across it, and read 11 levels dark for it. */
    const stand = new Set();
    for (const a of t.actors()) stand.add(a.x + ',' + a.y);
    t.lightShadows(true); t.smoothLight(0); t.redraw();
    const shades = [];
    for (const it of R.batch) if (it.kind === 'shadow') shades.push(it.poly);
    const shaded = (x, y) => {
      let n = 0;
      for (const q of shades) if (R.inShape(q, x + 0.5, y + 0.5)) n++;
      return n;
    };
    t.lightShadows(false);

    /* Every flat, lit floor square with nothing on it and no shade over it:
       what the picture actually painted at its middle, against what the world
       says the light there is. The pick tells us the floor square owns that
       pixel; the fade plan tells us the frame did not cut that square away. */
    const refused = { offBuffer: 0, offPick: 0, offCut: 0, shade: 0, stand: 0 };
    const shot = () => {
      const px = R.bctx.getImageData(0, 0, R.w, R.h).data;
      const alpha = R.alphas(s, R.batch).list;
      const alphaOf = new Map();
      for (let k = 0; k < R.batch.length; k++) {
        if (R.batch[k].kind === 'cell') alphaOf.set(R.batch[k].i, alpha[k]);
      }
      const cells = s.world.cells, rows = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.slope !== SLOPE_FLAT) continue;
        if (TILE(c.tile).tags.indexOf('blocks-sight') >= 0) continue;
        if (!(lightAt(s, c) > 0.3)) continue;
        const h = surfaceHeight(c);
        const p = R.project(s, c.x + 0.5, c.y + 0.5, h);
        const bx = Math.floor(p.x), by = Math.floor(p.y);
        if (bx < 2 || by < 2 || bx > R.w - 3 || by > R.h - 3) { refused.offBuffer++; continue; }
        if (R.pickAt(s, bx, by) !== i) { refused.offPick++; continue; }
        if (alphaOf.get(i) !== 1) { refused.offCut++; continue; }
        if (shaded(bx, by) > 0) { refused.shade++; continue; }
        if (stand.has(c.x + ',' + c.y)) { refused.stand++; continue; }
        const k = (by * R.w + bx) * 4;
        const lift = Math.round((1 + c.h * CFG.heightTint) * 100) / 100;
        const top = TILE(c.tile).top;
        rows.push({ i: i, x: c.x, y: c.y,
          got: 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2],
          smooth: lum(litShade(top, lift, lightValueAt(s, c, h))),
          stepped: lum(litShade(top, lift, lightAt(s, c))) });
      }
      return rows;
    };
    t.setTexture(0); t.lightShadows(false);
    t.smoothLight(1); t.redraw();
    const A = shot();
    t.smoothLight(0); t.redraw();
    const B = shot();
    t.smoothLight(1); t.setTexture(1); t.lightShadows(true);
    return { n: A.length, n2: B.length, refused: refused, A: A, B: B };
  });
  assert(r.n >= 30,
    `only ${r.n} lit floor squares were clean enough to measure, of which ` 
    + `${r.refused.offBuffer} fell outside the picture, ${r.refused.offPick} ` 
    + `were painted over by something, ${r.refused.offCut} were cut away, ` 
    + `${r.refused.shade} lay under a shade and ${r.refused.stand} had somebody ` 
    + `standing on them`);
  assert(r.n2 === r.n, `the two readings looked at ${r.n} and ${r.n2} squares`);
  assert(r.refused.shade >= 1,
    `no floor square in the picture lies under a shade, so nothing was excluded ` 
    + `for being shaded and this test cannot tell a shade from a light`);
  let ws = 0, med = [], wt = 0, wsAt = null, wtAt = null, differ = 0, span = 0;
  for (let i = 0; i < r.A.length; i++) {
    const d = Math.abs(r.A[i].got - r.A[i].smooth);
    med.push(d);
    if (d > ws) { ws = d; wsAt = r.A[i]; }
    const e = Math.abs(r.B[i].got - r.B[i].stepped);
    if (e > wt) { wt = e; wtAt = r.B[i]; }
    if (Math.abs(r.A[i].smooth - r.A[i].stepped) > 1) differ++;
    span = Math.max(span, Math.abs(r.A[i].smooth - r.B[i].stepped));
  }
  med.sort((a, b) => a - b);
  /* Measured on seed 1: 57 clean squares, every one of them within 1 level of
     the light the world keeps on it. The reading is the MIDDLE pixel of the
     square, so a square the light runs across is allowed a whole level of
     disagreement and no more. */
  assert(ws <= 1.05,
    `the floor is painted ${ws} levels away from the light the world keeps on it, ` 
    + `at (${wsAt && wsAt.x},${wsAt && wsAt.y}): picture ${wsAt && wsAt.got}, ` 
    + `world ${wsAt && wsAt.smooth}`);
  assert(med[Math.floor(med.length / 2)] <= 0.8,
    `halfway down ${r.n} clean floor squares the picture is ` 
    + `${med[Math.floor(med.length / 2)]} levels from the light`);
  /* With the smooth picture off, the floor is one flat fill of its own square's
     light, and the pixel reads that number exactly -- which is what makes the
     two arms comparable rather than two guesses. */
  assert(wt <= 1,
    `with the smooth picture off the floor is ${wt} levels away from its own ` 
    + `stepped light, at (${wtAt && wtAt.x},${wtAt && wtAt.y})`);
  assert(differ >= Math.max(10, r.n / 2),
    `the smooth picture and the stepped one agree on ${r.n - differ} of ${r.n} ` 
    + `squares, so this proves nothing about the change`);
  assert(span >= 4, `the smooth light never moves a floor pixel by more than ` 
    + `${span} levels, which is not a light with a slope to it`);
});

/* Two squares of floor that share an edge are two ramps meeting, and the light is
   one function over the world -- so they must claim the same number along that
   edge. Asked of the game's OWN ramp rather than of the picture: the boundary
   pixel of a picture is a blend of two squares, a material has joints of its own,
   and two neighbours may be different tiles. `rampEnds()` is a straight line
   between two published numbers and needs no picture at all.

   Three ways, in ONE build (lesson 21), over the SAME edges: what ships
   (field + conjugate), the field off, and the conjugate off. */
await test('two squares of floor sharing an edge agree about the light', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    const s = Game.state;

    const key = (x, y) => x + ',' + y;
    const map = new Map();
    for (const c of s.world.cells) map.set(key(c.x, c.y), c);
    const flat = (c) => !!c && c.slope === SLOPE_FLAT;

    /* The light a ramp claims at a point, exactly as a canvas linear gradient
       reads it: project onto the segment, and pad past the ends. */
    const onRamp = (e, px, py) => {
      const vx = e.far.x - e.near.x, vy = e.far.y - e.near.y;
      const n2 = vx * vx + vy * vy;
      let u = n2 > 0 ? ((px - e.near.x) * vx + (py - e.near.y) * vy) / n2 : 0.5;
      u = u < 0 ? 0 : (u > 1 ? 1 : u);
      return e.p1 + (e.p2 - e.p1) * u;
    };

    const ARMS = [['sown', true, true], ['noField', false, true],
                  ['noConjugate', true, false]];

    const pairAt = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y;
      const tx = -dy, ty = dx;                       /* along the shared edge */
      const h = surfaceHeight(a);
      const ax0 = a.x + 0.5, ay0 = a.y + 0.5, bx0 = b.x + 0.5, by0 = b.y + 0.5;
      /* A HAIR either side of the same edge, over the middle half of it. Both on
         the far side of their own squares is 1.94 m apart and measures two
         unrelated places on the floor -- which it did. */
      const pts = [];
      for (let k = 0; k < 9; k++) {
        const along = -0.25 + k * 0.0625;
        for (const into of [0.03, 0.15]) {
          const px = ax0 + dx * (0.5 - into) + tx * along;
          const py = ay0 + dy * (0.5 - into) + ty * along;
          const qx = bx0 - dx * (0.5 - into) + tx * along;
          const qy = by0 - dy * (0.5 - into) + ty * along;
          const pa = R.project(s, px, py, h), pb = R.project(s, qx, qy, h);
          pts.push({ ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y });
        }
      }
      const arms = {};
      let nRamp = 0;
      for (const arm of ARMS) {
        t.rampField(arm[1]); t.gradExact(arm[2]);
        const ea = R.rampEnds(s, a, h), eb = R.rampEnds(s, b, h);
        if (!ea || !eb) { arms[arm[0]] = null; continue; }
        nRamp++;
        let worst = 0, sum = 0;
        for (const p of pts) {
          const d = Math.abs(onRamp(ea, p.ax, p.ay) - onRamp(eb, p.bx, p.by));
          if (d > worst) worst = d;
          sum += d;
        }
        arms[arm[0]] = { worst: worst, mean: sum / pts.length };
      }
      return { arms: arms, nRamp: nRamp };
    };

    const pairs = [];
    for (const a of s.world.cells) {
      if (!flat(a) || !(lightAt(s, a) > 0.2)) continue;
      for (const dir of [[1, 0], [0, 1]]) {
        const b = map.get(key(a.x + dir[0], a.y + dir[1]));
        if (!flat(b) || b.h !== a.h || !(lightAt(s, b) > 0.2)) continue;
        pairs.push([a, b]);
      }
    }
    const raw = pairs.map((p) => pairAt(p[0], p[1]));
    /* Only the edges EVERY arm found a ramp on, so the three numbers are about
       the same floor and not about three different sets of edges. */
    const rows = raw.filter((x) => x.nRamp === ARMS.length);
    const q = (a, f) => (a.length ? a[Math.min(a.length - 1, (a.length * f) | 0)] : 0);
    const stat = (name) => {
      const w = rows.map((x) => x.arms[name].worst).sort((x, y) => x - y);
      const m = rows.map((x) => x.arms[name].mean);
      return { median: +q(w, 0.5).toFixed(5), p90: +q(w, 0.9).toFixed(5),
        worst: +(w[w.length - 1] || 0).toFixed(5),
        mean: +(m.reduce((x, y) => x + y, 0) / (m.length || 1)).toFixed(5),
        over005: w.filter((x) => x > 0.05).length };
    };

    /* IS THE RAMP INVENTING LIGHT? Its claim at a square's own middle is compared
       with the square's own light, which is a number the world already held --
       so this cannot pass by construction. */
    const fidelity = (field, exact) => {
      t.rampField(field); t.gradExact(exact);
      let asked = 0, nulls = 0, centreWorst = 0, agree = 0, bad = 0;
      for (const c of s.world.cells) {
        if (!flat(c) || !(lightAt(s, c) > 0.2)) continue;
        asked++;
        const h = surfaceHeight(c);
        const e = R.rampEnds(s, c, h);
        if (!e) { nulls++; continue; }
        const own = lightValueAt(s, c, h);
        const mid = R.project(s, c.x + 0.5, c.y + 0.5, h);
        const midErr = Math.abs(onRamp(e, mid.x, mid.y) - own);
        if (midErr > centreWorst) centreWorst = midErr;
        if (Math.abs((e.p1 + e.p2) / 2 - own) < 1e-9) agree++; else bad++;
      }
      return { asked: asked, noRamp: nulls, centreWorst: +centreWorst.toFixed(5),
        midAgree: agree, midBad: bad };
    };
    const fidSown = fidelity(true, true);
    const fidOld = fidelity(false, true);
    t.rampField(true); t.gradExact(true);

    return { pairs: pairs.length, kept: rows.length, sown: stat('sown'),
      noField: stat('noField'), noConjugate: stat('noConjugate'),
      fidSown: fidSown, fidOld: fidOld,
      missed: ARMS.map((a2) => [a2[0], raw.filter((x) => !x.arms[a2[0]]).length]) };
  });
  assert(r.kept >= 200,
    `only ${r.kept} of ${r.pairs} shared edges of lit floor are edges every arm ` 
    + `can paint (refused: ${JSON.stringify(r.missed)})`);
  assert(r.sown.median <= 0.05,
    `along the middle of ${r.kept} shared edges the two squares disagree by ` 
    + `${r.sown.median} of light (p90 ${r.sown.p90}, worst ${r.sown.worst})`);
  assert(r.sown.p90 <= 0.08,
    `9 in 10 of ${r.kept} shared edges agree to ${r.sown.p90} of light, not 0.08`);
  assert(r.sown.mean <= 0.032,
    `the average shared edge disagrees by ${r.sown.mean} of light`);
  assert(r.sown.worst <= 0.25,
    `the worst of ${r.kept} shared edges disagrees by ${r.sown.worst} of light`);
  /* The field is what pays, and the same build says so with it switched off. */
  assert(r.sown.median <= r.noField.median * 0.8,
    `with the field off the median edge agrees to ${r.noField.median} against ` 
    + `${r.sown.median} with it on, so the field is not doing the work`);
  assert(r.sown.mean <= r.noField.mean * 0.7,
    `with the field off the average edge agrees to ${r.noField.mean} against ` 
    + `${r.sown.mean} with it on`);
  assert(r.sown.over005 <= r.noField.over005 * 0.6,
    `${r.sown.over005} of ${r.kept} edges disagree by more than 0.05 of light ` 
    + `with the field on against ${r.noField.over005} with it off`);
  /* And the conjugate, which is about the direction the ramp runs in. */
  assert(r.sown.median < r.noConjugate.median && r.sown.p90 * 2 < r.noConjugate.p90,
    `with the ramp pointed the old way the median edge agrees to ` 
    + `${r.noConjugate.median} and the 9th decile to ${r.noConjugate.p90}, ` 
    + `against ${r.sown.median} and ${r.sown.p90} now`);
  /* A ramp may not invent light: at the square's own middle it lands on the
     square's own number exactly, and the old direction does not. */
  assert(r.fidSown.midBad === 0 && r.fidSown.midAgree >= 150,
    `${r.fidSown.midBad} of ${r.fidSown.midAgree + r.fidSown.midBad} ramps miss ` 
    + `their own square's light at its middle`);
  assert(r.fidSown.centreWorst < 0.005,
    `a ramp misses the middle of its own square by ${r.fidSown.centreWorst} of ` 
    + `light`);
  assert(r.fidOld.midBad > 0,
    'the old direction lands on its own square\u2019s light at the middle too, so ' 
    + 'the field is not what puts it there');
});

/* The person\u2019s words were "a crawler walking past a fire drags a shadow with
   them", and the shade is the only part of this that is aesthetics rather than
   the game\u2019s light. So it is counted on a flat-coloured picture, where nothing
   else is moving, and turned off in the same build to prove the count is about
   the shade. */
await test('a solid thing standing in the light lays a shadow on the ground', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    t.setTexture(0);
    t.smoothLight(1);

    const run = (frames) => {
      const acc = { made: 0, painted: 0, byActors: 0, casters: 0, short: 0 };
      for (let f = 0; f < frames; f++) {
        t.frame(4);
        const sh = t.shades();
        acc.made += sh.made; acc.painted += sh.painted;
        acc.byActors += sh.byActors;
        if (sh.casters > acc.casters) acc.casters = sh.casters;
        if (sh.painted !== sh.made) acc.short++;
      }
      return acc;
    };

    t.lightShadows(true);
    const on = run(30);
    t.redraw();
    t.keep();
    t.lightShadows(false);
    t.redraw();
    const d = t.diff();
    const off = run(30);
    t.lightShadows(true); t.smoothLight(1); t.setTexture(1); t.redraw();
    return { on: on, off: off, differ: d.differ, worst: d.worst, pix: d.pixels };
  });
  assert(r.on.made > 0,
    `no shade at all was worked out in 30 frames (${r.on.made} made)`);
  assert(r.on.painted === r.on.made,
    `${r.on.made - r.on.painted} of ${r.on.made} shades were worked out and ` 
    + `never reached the picture, across ${r.on.short} frames`);
  assert(r.on.casters >= 1,
    `nothing in the frame was counted as standing in the light (${r.on.casters})`);
  assert(r.on.byActors > 0,
    'no crawler ever laid a shade in 30 frames, so walking past a fire drags ' 
    + 'nothing');
  assert(r.off.made === 0 && r.off.painted === 0 && r.off.byActors === 0 &&
         r.off.casters === 0,
    `with the shade turned off it still made ${r.off.made} and painted ` 
    + `${r.off.painted} (${r.off.byActors} from crawlers)`);
  assert(r.differ > 0 && r.worst > 8,
    `turning the shade off changed ${r.differ} of ${r.pix} pixels, worst by ` 
    + `${r.worst} levels, so the shade is barely on the screen`);
});

/* A shade is paint, not a thing: it lies over the floor it darkens, and the
   pointer must go on naming the floor. `pickAt` walks the picture\u2019s own list
   backwards and skips the shades, which is the whole guard. */
await test('a shadow never answers the pointer', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    t.lightShadows(true);
    t.redraw();

    const grid = [];
    for (let y = 4; y < R.h - 4; y += 11) {
      for (let x = 4; x < R.w - 4; x += 11) grid.push([x, y]);
    }
    const ask = () => grid.map((p) => R.pickAt(Game.state, p[0], p[1]));

    const on = ask();
    let shades = 0;
    for (const it of R.batch) if (it.kind === 'shadow') shades++;

    t.lightShadows(false);
    t.redraw();
    const off = ask();
    t.lightShadows(true);
    t.redraw();

    let differ = 0, first = null, hits = 0;
    for (let i = 0; i < on.length; i++) {
      if (on[i] !== off[i]) { differ++; if (!first) first = grid[i]; }
      if (on[i] >= 0) hits++;
    }
    return { asks: on.length, differ: differ, first: first, hits: hits,
      shades: shades, w: R.w, h: R.h };
  });
  assert(r.asks >= 800,
    `only ${r.asks} places on a ${r.w}x${r.h} picture were asked about`);
  assert(r.shades > 0,
    'the frame laid no shade at all, so this test proves nothing');
  assert(r.hits > 0, 'every ask in the grid came back empty');
  assert(r.differ === 0,
    `${r.differ} of ${r.asks} pointer answers changed when the shade was turned ` 
    + `off, the first at ${r.first}`);
});

/* A square of floor used to be ONE FLAT COLOUR, so the light it was painted with
   was the light at its middle and nothing else: walking across it, the brightness
   did not move, and then it jumped at the next square's edge. The floor is a RAMP
   now -- a straight line of light across each square, aimed along the way the
   light itself is changing -- and this is the test that says so from the PICTURE
   rather than from the game's own arithmetic.

   It finds a row of floor squares across the view and walks the middle line of it
   one pixel at a time, twice. Two claims, and each is the other's control:

     * WITH the ramp: inside a square the brightness moves, and it agrees with the
       light the world keeps at every pixel of it;
     * WITHOUT it: inside a square the brightness does not move by so much as a
       level, and it disagrees with the world.

   The two pixels at each end of a square are left out of every reading. A boundary
   pixel is a blend of the two squares meeting there and of two materials, and
   counting it as the square's own light measures the seam rather than the light.

   The claim is worked out along the SAME line the samples were taken on, and that
   is only exact because the projection is flat: a world offset arrives on the
   picture as the same offset, so the point a sample landed on is the point on the
   world segment with the same fraction along it. No inverse is needed and nothing
   is guessed. */
await test('the floor of one square is a slope, not one flat colour', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    const s = Game.state;
    const refused = { offScreen: 0, standing: 0, short: 0, dark: 0, torn: 0 };

    const key = (x, y) => x + ',' + y;
    const map = new Map();
    s.world.cells.forEach((c, i) => map.set(key(c.x, c.y), i));
    const lum = (col) => {
      const m = col.match(/-?\d+/g);
      return +m[0] * 0.299 + +m[1] * 0.587 + +m[2] * 0.114;
    };

    /* The floor as the picture can show it: materials off, so a square is one
       colour per square and a ramp across it, and no shade lying over it. */
    t.setTexture(0);
    t.lightShadows(false);
    t.smoothLight(1);
    t.gradExact(true);
    t.rampField(true);
    t.redraw();

    /* A row of floor squares at one height, all lit, all on the screen, and well
       clear of anything standing. Found rather than chosen: the world is made
       from a seed, and a test that hard-codes a square is a test of one seed. */
    let best = null, found = 0;
    for (const c of s.world.cells) {
      if (c.slope !== SLOPE_FLAT) continue;
      let len = 1;
      while (len < 9) {
        const n = map.get(key(c.x + len, c.y));
        const cell = n === undefined ? null : s.world.cells[n];
        if (!cell || cell.slope !== SLOPE_FLAT || cell.h !== c.h) break;
        if (!(lightAt(s, cell) > 0.2)) { refused.dark++; break; }
        len++;
      }
      if (len < 4) { refused.short++; continue; }
      if (!(lightAt(s, c) > 0.2)) { refused.dark++; continue; }
      const p0 = R.project(s, c.x + 0.5, c.y + 0.5, c.h);
      const p1 = R.project(s, c.x + len - 0.5, c.y + 0.5, c.h);
      if (Math.min(p0.x, p1.x) < 30 || Math.min(p0.y, p1.y) < 30
        || Math.max(p0.x, p1.x) > R.w - 30 || Math.max(p0.y, p1.y) > R.h - 30) {
        refused.offScreen++; continue;
      }
      /* How far the nearest thing standing is from the middle of the row. */
      let clear = 99;
      for (let k = 0; k < len; k++) {
        const cx = c.x + k + 0.5, cy = c.y + 0.5;
        for (const q of ((s.camp && s.camp.sites) || [])) {
          clear = Math.min(clear, Math.hypot(q.x + 0.5 - cx, q.y + 0.5 - cy));
        }
        for (const a of s.actors) {
          clear = Math.min(clear, Math.hypot(a.x + 0.5 - cx, a.y + 0.5 - cy));
        }
      }
      if (clear < 1.5) { refused.standing++; continue; }
      found++;
      if (!best || len > best.len) {
        best = { x: c.x, y: c.y, h: c.h, len: len, clear: clear,
                 picks: [] };
        for (let k = 0; k < len; k++) best.picks.push(map.get(key(c.x + k, c.y)));
      }
    }

    const walk = (smooth) => {
      t.smoothLight(smooth);
      t.redraw();
      const a = R.project(s, best.x + 0.5, best.y + 0.5, best.h);
      const b = R.project(s, best.x + best.len - 0.5, best.y + 0.5, best.h);
      const L = t.line(a.x, a.y, b.x, b.y);
      const mine = new Set(best.picks);
      const groups = [];
      for (let i = 0; i < L.lum.length; i++) {
        if (L.lum[i] < 0) continue;
        const p = L.pick[i], last = groups[groups.length - 1];
        if (last && last.pick === p) { last.to = i; last.vals.push(L.lum[i]); }
        else groups.push({ pick: p, from: i, to: i, vals: [L.lum[i]] });
      }
      const G = groups.filter((g) => mine.has(g.pick) && g.vals.length > 5);
      refused.torn += groups.length - G.length;

      const out = { groups: G.length, ranges: [], flat: 0, slope: 0,
                    worst: 0, samples: 0, misses: 0, at: null };
      for (const g of G) {
        /* Two pixels inside each end, which is the control that beat the seam. */
        const inner = g.vals.slice(2, -2);
        const range = Math.max.apply(null, inner) - Math.min.apply(null, inner);
        out.ranges.push(+range.toFixed(2));
        if (range === 0) out.flat++;
        if (range > 1) out.slope++;
        if (range > out.worst) out.worst = range;

        /* What this square CLAIMS at each pixel: the straight line between the
           two ends `rampEnds()` publishes, read at the fraction along it the
           pixel sits at. That is exactly what a canvas gradient paints. */
        const cell = s.world.cells[g.pick];
        const e = R.rampEnds(s, cell, surfaceHeight(cell));
        if (!e) continue;
        const lift = Math.round((1 + cell.h * CFG.heightTint) * 100) / 100;
        const top = TILE(cell.tile).top;
        const c1 = lum(litShade(top, lift, e.p1));
        const c2 = lum(litShade(top, lift, e.p2));
        const vx = e.far.x - e.near.x, vy = e.far.y - e.near.y;
        const n2 = vx * vx + vy * vy;
        for (let i = g.from + 2; i <= g.to - 2; i++) {
          const u0 = i / L.n;
          const sx = Math.round(a.x + (b.x - a.x) * u0);
          const sy = Math.round(a.y + (b.y - a.y) * u0);
          let u = n2 > 0 ? ((sx - e.near.x) * vx + (sy - e.near.y) * vy) / n2 : 0.5;
          u = u < 0 ? 0 : (u > 1 ? 1 : u);
          const d = Math.abs(c1 + (c2 - c1) * u - L.lum[i]);
          out.samples++;
          if (d > 3) out.misses++;
          if (!out.at || d > out.at.d) out.at = { d: d, x: sx, y: sy };
        }
      }
      out.mean = out.ranges.length
        ? +(out.ranges.reduce((x, y) => x + y, 0) / out.ranges.length).toFixed(3)
        : 0;
      return out;
    };

    const ramp = best ? walk(1) : null;
    const step = best ? walk(0) : null;
    t.smoothLight(1); t.setTexture(1); t.lightShadows(true); t.redraw();
    return { best: best, found: found, refused: refused, ramp: ramp, step: step };
  });

  assert(r.best,
    `no row of four lit floor squares was found across a ${r.refused.offScreen} `
    + `off-screen / ${r.refused.standing} with-something-standing-on-it / `
    + `${r.refused.short} too-short / ${r.refused.dark} too-dark census`);
  const where = `(${r.best.x},${r.best.y}) over ${r.best.len} squares, the `
    + `nearest thing standing ${r.best.clear.toFixed(2)} m away`;
  assert(r.found >= 5,
    `only ${r.found} rows of floor were clean enough to measure, so a ruler `
    + `about one row is a ruler about that row`);
  assert(r.ramp.groups >= 4,
    `the row at ${where} came back in ${r.ramp.groups} pieces, so the line spent `
    + `most of its length somewhere else`);
  assert(r.refused.torn === 0,
    `${r.refused.torn} pieces of the two lines were not floor at all`);

  /* WITH the ramp: every square slopes. */
  assert(r.ramp.flat === 0,
    `${r.ramp.flat} of ${r.ramp.groups} squares of floor are still one flat `
    + `colour inside, so the ramp is not reaching the picture (ranges `
    + `${r.ramp.ranges.join(',')})`);
  assert(r.ramp.slope >= r.ramp.groups - 1,
    `only ${r.ramp.slope} of ${r.ramp.groups} squares move by more than a level `
    + `across themselves (ranges ${r.ramp.ranges.join(',')})`);
  assert(r.ramp.worst > 1.5 && r.ramp.mean > 0.6,
    `the steepest square of floor only moves ${r.ramp.worst} levels across `
    + `itself and the average is ${r.ramp.mean}, which is not a light that `
    + `changes over a metre`);

  /* WITHOUT it: one flat colour a square, which is what the ramp replaced. */
  assert(r.step.flat === r.step.groups,
    `${r.step.flat} of ${r.step.groups} squares are flat with the ramp off, so `
    + `this ruler cannot tell a slope from a step (ranges `
    + `${r.step.ranges.join(',')})`);

  /* And the ramp is pointed the way the WORLD says the light changes, not just
     any way that happens to slope. */
  assert(r.ramp.misses <= 2,
    `${r.ramp.misses} of ${r.ramp.samples} pixels of floor disagree with the `
    + `light the world keeps at that pixel by more than 3 levels, the worst at `
    + `${r.ramp.at ? r.ramp.at.x + ',' + r.ramp.at.y + ' by ' + r.ramp.at.d : ''}`);
  assert(r.step.misses >= 20,
    `with the ramp off only ${r.step.misses} of ${r.step.samples} pixels `
    + `disagree with the world, so the claim above cannot fail and is not a `
    + `ruler`);
});

/* The light is laid over a surface by filling the same shape AGAIN, in multiply.
   If that shape is handed over with corners between pixels, then the light it
   carries is a fraction of a pixel wider than the surface it belongs to, and the
   square next door takes a hairline of somebody else's light. `Render.snapOver`
   rounds those corners, and this is the ruler that watches the calls themselves:
   only the points the light overlay hands over, so what is counted is the overlay
   and nothing else.

   The overlay is marked by wrapping `Render.lightOver`, and NOT by asking the
   canvas whether it is in multiply: since v0.49.0 the cast shade is painted in
   that same composite (shadeMultiply), its shapes are silhouettes of anything
   solid and are handed over exactly as they were worked out, and so a filter that
   said "multiply" counted 246 shade corners as light and reported the light as
   broken on a camera that had stopped moving. What the shade does with a fraction
   of a pixel is its own business -- it is a picture of a shadow, not a surface,
   and no light spills anywhere -- so the flag is set for the one call that has
   the requirement and every assert below is left exactly as it was.

   Two camera states count as evidence -- mid-swing and mid-tilt, while the view
   is sliding -- because a settled camera has whole pixels to start with, and the
   test says so rather than assuming it. */
await test('the light laid over a surface lands on whole pixels', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    const s = Game.state;
    t.setTexture(1);
    t.smoothLight(1);
    t.lightShadows(true);

    const N = { pts: 0, frac: 0, worst: 0, over: 0 };
    let inOver = false;              /* true only inside the light overlay */
    const proto = CanvasRenderingContext2D.prototype;
    const om = proto.moveTo, ol = proto.lineTo;
    const watch = (raw) => function (x, y) {
      if (inOver) {
        N.pts++;
        const f = Math.max(Math.abs(x - Math.round(x)), Math.abs(y - Math.round(y)));
        if (f > 1e-9) N.frac++;
        if (f > N.worst) N.worst = f;
      }
      return raw.call(this, x, y);
    };
    proto.moveTo = watch(om);
    proto.lineTo = watch(ol);
    const overFn = R.lightOver;
    R.lightOver = function (ctx, pts, shade) {
      N.over++;
      inOver = true;
      try { return overFn.call(this, ctx, pts, shade); }
      finally { inOver = false; }
    };

    const snap = (on) => {
      R.snapOver = on;
      N.pts = 0; N.frac = 0; N.worst = 0; N.over = 0;
      t.redraw();
      return { over: N.over, pts: N.pts, frac: N.frac,
               worst: +N.worst.toFixed(3) };
    };
    const held = { yaw: s.cam.yaw, pitch: s.cam.pitch };
    const out = {};
    out.settled = { off: snap(false), on: snap(true) };
    s.cam.yaw = 2.0; camRefresh(s);
    out.swing = { off: snap(false), on: snap(true) };
    s.cam.yaw = Math.PI; s.cam.pitch = 0.55; camRefresh(s);
    out.tilt = { off: snap(false), on: snap(true) };

    /* Back to a still camera, and paint the SAME moment both ways: rounding
       corners that are already whole must not move a single pixel. */
    s.cam.yaw = held.yaw; s.cam.pitch = held.pitch; camRefresh(s);
    R.snapOver = false; t.redraw(); t.keep();
    R.snapOver = true; t.redraw();
    const d = t.diff();

    proto.moveTo = om;
    proto.lineTo = ol;
    R.lightOver = overFn;
    return { out: out, differ: d.differ, worst: d.worst, pix: d.pixels };
  });

  const st = r.out.settled, sw = r.out.swing, ti = r.out.tilt;
  assert(st.off.over > 0,
    'the light was laid over no surface at all in the whole frame, so this test '
    + 'never looked at the thing it is about');
  assert(st.off.over === st.on.over && sw.off.over === sw.on.over,
    `rounding the corners changed how many times the light was laid over a `
    + `surface (${st.off.over}/${st.on.over} still, ${sw.off.over}/${sw.on.over} `
    + `mid-swing), so the two arms are not the same painting`);
  assert(sw.off.pts > 200 && ti.off.pts > 200,
    `only ${sw.off.pts} points of light were handed over mid-swing and `
    + `${ti.off.pts} mid-tilt, which is too little to judge`);
  assert(st.off.frac === 0,
    `${st.off.frac} of ${st.off.pts} points of light are between pixels on a `
    + `camera that has stopped moving`);
  assert(sw.off.frac >= sw.off.pts * 0.9 && sw.off.worst > 0.2,
    `sliding the view left just ${sw.off.frac} of ${sw.off.pts} points of light `
    + `between pixels (${ti.off.frac} of ${ti.off.pts} mid-tilt), so this ruler `
    + `cannot fail`);
  assert(sw.on.frac === 0 && ti.on.frac === 0,
    `rounding the corners left ${sw.on.frac} of ${sw.on.pts} points of light `
    + `between pixels mid-swing and ${ti.on.frac} mid-tilt, worst `
    + `${sw.on.worst}`);
  assert(r.differ === 0,
    `painting a still picture both ways changed ${r.differ} of ${r.pix} pixels, `
    + `worst by ${r.worst} levels`);
});

/* A surface that wears a material is painted from a picture dropped into the
   sheet, and the light is laid over it as a second fill in multiply. That is the
   only road the smooth light has onto such a surface -- the colour is already
   spoken for -- and a road with no traffic looks exactly like a road that works.

   So this counts the overlay calls AND asks the picture: with no materials there
   is nothing to lay the light over and the count is nought, which is what makes
   the count the overlay's own rather than a number about the frame.

   THE WALL SMOOTHING IS PINNED OFF TO KEEP THAT TRUE (v0.51.0). Since v0.51.0
   there is a SECOND road the light takes onto a wall face -- the gradient that
   carries it across the face so two blocks meet (`acrossFace`) -- and it is laid
   with the same `lightOver` call whether or not the face wears a picture, 28
   times on this frame with the materials off. That is why the bare arm stopped
   reading nought: not because a picture surface was painted without a picture.
   Pinning the smoothing off leaves the count measuring the one road this test is
   about, and the other road has its own test directly below. */
await test('the light reaches a surface that wears a dropped-in picture', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    t.smoothLight(1);
    t.lightShadows(true);
    const wasAcross = t.acrossLight();
    t.acrossLight(false);

    const N = { over: 0, flat: 0 };
    const overFn = R.lightOver;
    R.lightOver = function (ctx, pts, shade) {
      N.over++;
      if (typeof shade === 'string') N.flat++;
      return overFn.call(this, ctx, pts, shade);
    };

    const look = (tex, smooth) => {
      t.setTexture(tex);
      t.smoothLight(smooth);
      t.redraw();
      N.over = 0; N.flat = 0;
      t.redraw();
      return { over: N.over, flat: N.flat };
    };

    const bare = look(0, 1);          /* no pictures to lay anything over */
    const on = look(1, 1);            /* the shipped look */
    const off = look(1, 0);           /* the ramp taken away */
    const back = look(1, 1);

    t.redraw(); t.keep();
    t.redraw();
    const d0 = t.diff();              /* nothing changed: the control */
    t.smoothLight(0); t.redraw();
    const d1 = t.diff();
    t.smoothLight(1); t.redraw();
    const d2 = t.diff();

    R.lightOver = overFn;
    t.setTexture(1); t.smoothLight(1); t.lightShadows(true);
    t.acrossLight(wasAcross); t.redraw();
    return { bare: bare, on: on, off: off, back: back, pix: d0.pixels,
             wasAcross: wasAcross, backAcross: t.acrossLight(),
             control: { differ: d0.differ, worst: d0.worst },
             gone: { differ: d1.differ, worst: d1.worst },
             again: { differ: d2.differ, worst: d2.worst } };
  });

  assert(r.wasAcross === true && r.backAcross === true,
    `the wall smoothing came back as ${r.backAcross} where it started at`
    + ` ${r.wasAcross} -- this test pins it off, and every test after it wants`
    + ' the look that ships');
  assert(r.on.over > 0,
    'the light was laid over no picture surface at all, so the smooth light '
    + 'never reaches a surface that wears a material');
  assert(r.on.flat === 0,
    `${r.on.flat} of ${r.on.over} of those were one flat colour rather than a `
    + `ramp, so they are not the smooth light`);
  assert(r.bare.over === 0,
    `with the materials off the light was still laid over a surface `
    + `${r.bare.over} times, so this count is not about picture surfaces`);
  assert(r.off.over > 0 && r.on.over > r.off.over,
    `turning the ramp away left the count at ${r.off.over} against `
    + `${r.on.over}, so the extra fills are not the ramp`);
  assert(r.on.over === r.back.over,
    `turning the ramp off and on again left a different number of fills `
    + `(${r.on.over} then ${r.back.over})`);
  assert(r.control.differ === 0,
    `painting the same moment twice changed ${r.control.differ} of ${r.pix} `
    + `pixels, so this picture is not the same picture twice and nothing below `
    + `can be blamed on the ramp`);
  assert(r.gone.differ > 1000 && r.gone.worst > 8,
    `taking the ramp away changed ${r.gone.differ} of ${r.pix} pixels, worst by `
    + `${r.gone.worst} levels, so the smooth light is barely on a textured `
    + `surface`);
  assert(r.again.differ === 0,
    `putting the ramp back did not put the picture back (${r.again.differ} `
    + `pixels, worst by ${r.again.worst} levels)`);
});

/* THE LIGHT RUNS ACROSS A WALL FACE, so the two blocks either side of a seam
   meet on one brightness instead of each quitting on its own number.

   Asked for in as many words: "the light isn't smooth BETWEEN wall blocks
   though. I see the vertical edges of each wall unit because the light stops
   and starts." `edges()` is the ruler: it walks the pixels the frame actually
   painted, keeps the ones inside ONE wall face, and calls a pair adjacent that
   is the same facet of two DIFFERENT blocks -- which is a seam and nothing
   else. A crease between two faces of one block is a fold in the rock and is
   lit differently on purpose, so it is not counted.

   Both ways round in ONE build with nothing between them but the flag, so the
   two numbers differ by the correction and by nothing else. The flag is turned
   off, read, put back, read again, and the second reading must MATCH the first:
   a ruler that cannot repeat itself is worth less than no ruler (lesson 2), and
   `steady` is the negative control that lets every claim below be able to fail.
   The distinct-world count is printed for the same reason a battery prints it
   (lesson 27): eight readings of one frozen picture would be a tidy nothing. */
await test('the light runs across a wall face, so two blocks of a wall can meet',
  async () => {
    const sc = await page.evaluate(() =>
      window.__test.edgesScan({ seeds: [1, 2, 3, 4], turns: 2, settle: 2700,
                                threshold: 16 }));
    assert(sc.cases === 8 && sc.worlds === sc.cases,
      `the ruler looked at ${sc.cases} moments but only reached ${sc.worlds} `
      + `different worlds, so it measured the same picture more than once ` +
      `(lesson 27)`);
    assert(sc.steady,
      'turning the correction off, on and off again did not come back to the ' +
      'same numbers, so this ruler cannot repeat itself and none of the below ' +
      'can be blamed on the correction');
    assert(sc.pairsOff > 1000 && sc.seams > 50,
      `only ${sc.pairsOff} side-by-side pairs of wall pixels in ${sc.seams} ` +
      `seams were found, so there is barely any wall in these views and ` +
      `nothing here is a measurement of one`);
    assert(sc.offAcrossed === 0 && sc.onAcrossed > 100,
      `with the correction off ${sc.offAcrossed} faces were still corrected ` +
      `and with it on ${sc.onAcrossed} were, so the switch is not the switch`);
    assert(sc.offHard > 20,
      `the uncorrected picture only stepped at ${sc.offHard} of ${sc.seams} ` +
      `seams, so there is nothing here for the correction to have fixed and ` +
      `this test cannot fail`);
    assert(sc.onHard * 2 <= sc.offHard,
      `the correction left ${sc.onHard} of ${sc.seams} seams stepping by a ` +
      `whole 16 levels or more against ${sc.offHard} before it, so the light ` +
      `still stops and starts between wall blocks`);
    assert(sc.offJump - sc.onJump >= 15,
      `the worst seam in the picture stepped by ${sc.offJump} levels before ` +
      `the correction and ${sc.onJump} after, so the correction barely moved ` +
      `the thing the complaint was about`);
    assert(sc.onCount < sc.offCount,
      `${sc.onCount} pixel rows step across a seam with the correction ` +
      `against ${sc.offCount} without it, so the correction made the stepping ` +
      `more common rather than less`);
    assert(sc.onHardBoth * 20 > sc.onHardNone && sc.onHardBoth > sc.onHardOne,
      `most of what still steps is on a face the correction never reached ` +
      `(${sc.onHardBoth} rows with both ends corrected, ${sc.onHardOne} with ` +
      `one, ${sc.onHardNone} with neither), so the correction is not where the ` +
      `remaining seams are`);
  });

/* AND NOTHING ELSE MOVED. The correction is an addition, and an addition is
   proved against the same build with it switched off, not against the one
   before (lesson 21). Three claims, all of them censuses:

     the picture is the same picture twice with nothing between the two,
     every pixel the correction changes lies inside a face it actually painted,
     and no pixel is moved by as much as a whole step of the light scale.

   The first alone would pass on a correction that drew nothing at all, so the
   second and third are what make it a measurement of the right thing: a pixel
   moved somewhere the correction never drew would fail the mask, and a wall
   that jumped a whole light step would fail the bound. The mask counts a pixel
   as covered if it is inside a corrected face's quad widened by one, because a
   canvas antialiases the edge of a fill. */
await test('the wall smoothing moves the picture only where it paints',
  async () => {
    const r = await page.evaluate(() => {
      const t = window.__test, R = Render;
      t.seed(1);
      t.advance(2700, 6);
      const W = R.w, H = R.h, n = W * H;
      const grab = () => R.bctx.getImageData(0, 0, W, H).data;
      /* One step of the light scale as a whole channel value: `lightSteps` 6
         turns 255 into 42.5, so the widest a single step can come out is 44.
         A pixel the correction moved by that much has been moved by as much as
         the light itself moves between two of its levels. */
      const step = Math.ceil(255 / CFG.lightSteps) + 1;

      /* Nothing between these two: the control that lets the rest mean
         something. */
      t.acrossLight(false); t.redraw();
      const c0 = grab();
      t.redraw();
      const c1 = grab();
      let control = 0;
      for (let i = 0; i < c0.length; i += 4) {
        if (c0[i] !== c1[i] || c0[i + 1] !== c1[i + 1] || c0[i + 2] !== c1[i + 2]) control++;
      }

      t.acrossLight(false); t.redraw();
      const off = grab();

      /* Ask the correction itself which faces it painted, rather than guessing
         from where the picture changed. */
      const real = R.acrossFor;
      const boxes = [];
      R.acrossFor = function (ctx, s, it, cA, cB, quad) {
        const out = real.apply(this, arguments);
        if (out) {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          for (const p of quad) {
            if (p.x < x0) x0 = p.x;
            if (p.x > x1) x1 = p.x;
            if (p.y < y0) y0 = p.y;
            if (p.y > y1) y1 = p.y;
          }
          boxes.push([x0, y0, x1, y1]);
        }
        return out;
      };
      t.acrossLight(true);
      t.redraw();
      const acrossed = R.consumed.acrossed;
      const on = grab();
      R.acrossFor = real;
      t.acrossLight(false); t.redraw();

      const mask = new Uint8Array(n);
      let maskPx = 0;
      for (const b of boxes) {
        for (let y = Math.max(0, Math.floor(b[1]) - 1);
             y <= Math.min(H - 1, Math.ceil(b[3]) + 1); y++) {
          for (let x = Math.max(0, Math.floor(b[0]) - 1);
               x <= Math.min(W - 1, Math.ceil(b[2]) + 1); x++) mask[y * W + x] = 1;
        }
      }
      for (let i = 0; i < n; i++) if (mask[i]) maskPx++;
      let differ = 0, outside = 0, worst = 0, atOrOver = 0;
      for (let i = 0, p = 0; i < on.length; i += 4, p++) {
        const d = Math.max(Math.abs(on[i] - off[i]),
                           Math.abs(on[i + 1] - off[i + 1]),
                           Math.abs(on[i + 2] - off[i + 2]));
        if (!d) continue;
        differ++;
        if (d > worst) worst = d;
        if (d >= step) atOrOver++;
        if (!mask[p]) outside++;
      }
      t.acrossLight(true); t.redraw();
      return { pixels: n, control: control, differ: differ, outside: outside,
               worst: worst, atOrOver: atOrOver, step: step, maskPx: maskPx,
               faces: boxes.length, acrossed: acrossed,
               wallPx: R.consumed.wallPx };
    });

    assert(r.control === 0,
      `painting the same moment twice with nothing between the two changed ` +
      `${r.control} of ${r.pixels} pixels, so this picture is not the same ` +
      `picture twice and nothing below can be blamed on the correction`);
    assert(r.faces === r.acrossed && r.faces > 10,
      `the correction reported ${r.acrossed} faces and painted a gradient on ` +
      `${r.faces} of them, so what it says it did is not what it did`);
    assert(r.differ > 1000,
      `switching the correction on changed only ${r.differ} of ${r.pixels} ` +
      `pixels, so it is barely reaching the picture`);
    assert(r.outside === 0,
      `${r.outside} of the ${r.differ} pixels the correction moved are outside ` +
      `every face it painted a gradient on, so it is changing the picture ` +
      `somewhere it never drew`);
    assert(r.maskPx < r.pixels * 0.9,
      `the faces the correction painted cover ${r.maskPx} of the picture's ` +
      `${r.pixels} pixels, so "every moved pixel is inside one of them" is a ` +
      `claim about the whole picture rather than about the correction`);
    assert(r.atOrOver === 0,
      `${r.atOrOver} pixels were moved by a whole step of the light scale ` +
      `(${r.step} levels, worst ${r.worst}), so the correction is not ` +
      `smoothing a seam, it is repainting a face`);
    assert(r.differ <= r.wallPx,
      `the correction moved ${r.differ} pixels, more than all ${r.wallPx} ` +
      `pixels of wall the frame painted, so it is changing something that is ` +
      `not a wall`);
  });

/* Every number the sheet grew for this job has to reach the picture, and the way
   to prove that is to move each one and see the picture move -- a knob wired to
   nothing is a knob pretending. The control that makes the ruler able to fail is
   the same comparison with NOTHING changed, which must come out at nought: if
   merely redrawing could move a pixel, every one of the eight would pass and
   none would mean anything.

   A dial is silent only if the light it moves cannot reach a DRAWN surface, and
   a light the camera is not pointed at reaches none. Measured on this seed: the
   camp is at (11,23) and the fire lights 167 of the 230 squares on the screen,
   while the two lamps are 18 and 34 squares away and off the screen entirely --
   so moving the lamp's height at the camp moves nothing, and that is the camera's
   doing, not the dial's. Each dial is therefore moved with the view where its
   light lands: the camp for the fire and the shadows, and the crawler carrying
   the lantern for the lamp.

   Which of those a view actually lights is measured and asserted too, because it
   is the framing that makes the rest of the test able to fail: if the lamp's
   light ever stopped reaching a painted square, the lamp's dial would go silent
   and this test would have no way of knowing. */
await test('every light knob the sheet carries reaches the picture', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, R = Render;
    t.seed(1);
    for (let i = 0; i < 45; i++) t.frame(60);
    t.setTexture(1);
    t.smoothLight(1);
    t.lightShadows(true);

    /* Which source lit each square of ground the frame actually paints. */
    const litBy = () => {
      const s = Game.state;
      s.lightDirty = true;
      t.redraw();
      const plan = R.alphas(s, R.batch);
      const seen = { lamp: 0, fire: 0, none: 0 };
      for (let k = 0; k < R.batch.length; k++) {
        const it = R.batch[k];
        if (it.kind !== 'cell' || !(plan.list[k] > 0)) continue;
        const src = it.cell.light > 0 ? s.sources[it.cell.lightSrc] : null;
        seen[src ? (src.site ? 'fire' : 'lamp') : 'none']++;
      }
      return seen;
    };

    /* Where everyone is, and what light they are carrying. */
    const who = Game.state.actors.map((a, i) => {
      let best = 0;
      for (const k in a.worn) { const g = GEAR(a.worn[k]); if (g.light > best) best = g.light; }
      return { i: i, x: a.x, y: a.y, light: best };
    });
    const carrier = who.filter((a) => a.light > 0).sort((a, b) => b.light - a.light)[0];
    const fire = Game.state.sources.filter((s) => s.site)[0];
    let anchor = null;
    if (fire) {
      let near = Infinity;
      for (const a of who) {
        const d = Math.hypot(a.x - fire.x, a.y - fire.y);
        if (d < near) { near = d; anchor = a; }
      }
    }

    /* The view the match opens with, and the view on the lamp. */
    const campView = litBy();
    if (carrier) t.centreOn(carrier.i);
    const lampView = litBy();

    /* Put the camera where a dial can show, and take the picture to compare. */
    const go = (where) => {
      if (where === 'lamp' && carrier) t.centreOn(carrier.i);
      else if (anchor) t.centreOn(anchor.i);
      t.redraw();
      t.keep();
    };

    const turn = (name, to, where) => {
      go(where);
      const was = CFG[name];
      const held = { name: name, was: was, to: to, where: where, known: name in CFG };
      CFG[name] = to;
      Game.state.lightDirty = true;
      t.setTexture(CFG.texStrength);
      t.redraw();
      const d = t.diff();
      CFG[name] = was;
      Game.state.lightDirty = true;
      t.setTexture(CFG.texStrength);
      t.redraw();
      held.pixels = d.differ;
      held.worst = d.worst;
      return held;
    };

    /* The same comparison with nothing changed, in both framings. */
    const still = (where) => { go(where); t.redraw(); const d = t.diff(); return d; };
    const c0 = still('camp');
    const c1 = still('lamp');

    /* Nine asks: the eight new dials, and one with nothing changed. */
    const flips = [['lampHeight', 1.6, 'lamp'], ['fireHeight', 1.2, 'camp'],
                   ['heightFalloff', 4, 'camp'], ['lightSmooth', 0, 'camp'],
                   ['shadeStrength', 0.9, 'camp'], ['shadeGive', 0.8, 'camp'],
                   ['shadeReach', 4.5, 'camp'], ['shadeGirth', 0.6, 'camp']];
    go('camp');
    t.redraw();
    const d0 = t.diff();
    const pix = d0.pixels;
    const done = [];
    for (const f of flips) done.push(turn(f[0], f[1], f[2]));
    go('camp');
    t.setTexture(1); t.smoothLight(1); t.lightShadows(true); t.redraw();
    return { control: { differ: d0.differ, worst: d0.worst }, pix: pix, done: done,
             carrier: carrier || null, anchor: anchor || null,
             campView: campView, lampView: lampView,
             stillCamp: { differ: c0.differ, worst: c0.worst },
             stillLamp: { differ: c1.differ, worst: c1.worst } };
  });

  assert(r.control.differ === 0 && r.control.worst === 0,
    `painting the same moment twice changed ${r.control.differ} of ${r.pix} `
    + `pixels, worst by ${r.control.worst} levels, so redrawing alone moves the `
    + `picture and nothing below can be blamed on a knob`);
  assert(r.stillCamp.differ === 0 && r.stillLamp.differ === 0,
    `the view moved ${r.stillCamp.differ} pixels settling at the camp and `
    + `${r.stillLamp.differ} on the lamplighter, so a dial measured there would `
    + `be measured against a picture that was moving on its own`);
  assert(r.campView.fire > 0,
    `the campfire lights nothing the frame paints from the view the match opens `
    + `with (${JSON.stringify(r.campView)}), so the knobs about the fire have `
    + `nowhere to show and this test would pass on a world with no fire in it`);
  assert(r.carrier,
    `no crawler in the match is carrying a light, so the height a carried light `
    + `hangs at has no surface to reach and nothing to prove`);
  assert(r.lampView.lamp > 0,
    `with the view on the crawler carrying the lamp, no square the frame paints `
    + `is lit by a lamp (${JSON.stringify(r.lampView)}), so the lamp's height `
    + `could not reach the picture and this test could not tell`);
  const silent = [];
  for (const k of r.done) {
    assert(k.known, `the sheet has no dial called ${k.name}, so the test is `
      + `polishing a name nothing uses`);
    if (k.pixels === 0) silent.push(k);
  }
  assert(silent.length === 0,
    `${silent.length} of ${r.done.length} dials changed the picture not at all `
    + `with the value moved from ${silent.map((k) => k.name + ' ' + k.was + ' to '
      + k.to + ' with the view ' + k.where).join(', ')}, so they are connected to `
    + `nothing (the rest moved ${r.done.length - silent.length}: `
    + `${r.done.map((k) => k.name + ' ' + k.pixels + 'px').join(', ')})`);
});

/* A SHADE IS A LIGHT LAYER, NOT A SURFACE (v0.49.0).
 *
 * A shadow takes brightness away from what is under it; it does not cover it up.
 * That is a claim about the ARITHMETIC, and the arithmetic says the two ways of
 * laying it down are the same picture: the shade's own colour is black, so
 * `multiply` gives (1 - a) x destination and painting it over the top gives the
 * same (1 - a) x destination. What is NOT the same is what a census of the frame
 * can see.
 *
 * `fillKinds()` counts what each fill was MADE of, and a shade laid over the top
 * is a gradient object, so it is counted as a `band` -- the same count a wall's
 * fade gets. A shade laid as light goes down in the same composite as the light
 * and is counted as neither, which is the only reason the census can go on
 * saying "this much of the picture is a surface wearing a material" now that
 * every lit square paints twice.
 *
 * So this test asks both halves: the picture is the same to within a rounding of
 * 255 (measured worst 2, and never more than NOTICEABLE), and the census tells
 * the two apart by EXACTLY the number of patches of shade that reached the
 * screen -- no more, so it is not counting something else as well, and no fewer,
 * so it is not skipping real work. The two are asked on separate frames,
 * because the census SKIPS a fill that is not `source-over` -- which is what a
 * shade laid as light is -- and a picture taken through it has the shade missing
 * in one arm and painted in the other. That mistake measured 40,368 pixels of
 * difference at 87/255 and would have said the two ways disagree completely.
 *
 * Measured on seeds 1, 4 and 7 at 229,632 pixels: 3.0-6.3% of the picture moves
 * by one or two levels between the two ways, 0 pixels by more than 8, and the
 * census band count differs by exactly the shade count in every case. */

await test('a shade is laid as light, not painted on (v0.49.0)', async () => {
  const CASES = [{ seed: 1, up: 0, q: 0 }, { seed: 4, up: 0, q: 0 },
                 { seed: 7, up: 1, q: 1 }];
  const r = await page.evaluate((CASES) => {
    const t = window.__test, rows = [];
    const wasShade = t.shadeMultiply();
    t.pause(); t.unpoint();
    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.q);
      t.settle();
      t.unpoint();
      /* THE PIXELS, from two REAL frames. The census cannot be in this loop:
         it skips a fill that is not `source-over`, which is exactly what a
         shade laid as light is, so a picture taken through the census is a
         picture with the shade MISSING in one arm and painted in the other --
         and it measures the shade's presence rather than the way it is laid
         (measured: 40,368 pixels and 87/255 that way, against 6.3% and 2/255
         on real frames). Census and pixels are two questions; ask them apart. */
      t.shadeMultiply(true);
      t.repaint();
      const on = t.shades();
      t.keep();
      t.shadeMultiply(false);
      t.repaint();
      const off = t.shades();
      const d = t.diff();
      /* AND THE CENSUS, on its own two frames. */
      t.shadeMultiply(true);
      const kOn = t.fillKinds();
      t.shadeMultiply(false);
      const kOff = t.fillKinds();
      rows.push({ seed: c.seed, up: c.up, q: c.q, kOn: kOn, kOff: kOff,
                  on: on, off: off, d: d });
    }
    t.shadeMultiply(wasShade);
    t.redraw();
    return { rows: rows, wasShade: wasShade, backShade: t.shadeMultiply() };
  }, CASES);

  const tot = { moved: 0, deep: 0, worst: 0, band: 0, shaded: 0, pixels: 0 };
  assert(r.wasShade === true,
    'the shade is laid over the top of the picture rather than as a light layer');
  for (const q of r.rows) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}`;
    /* The same patches of shade reach the screen either way, so the comparison
       below is about HOW they are laid and not about how many there are. */
    assert(q.on.painted > 0 && q.off.painted === q.on.painted,
      `${at}: ${q.on.painted} patches of shade reached the picture laid as light`
      + ` and ${q.off.painted} painted over the top, and the same patches have to`
      + ' be there either way');
    assert(!q.d.error, q.d.error || 'nothing was kept');
    /* THE ARITHMETIC: the two ways leave the same picture. */
    assert(q.d.deep === 0 && q.d.worst <= 2,
      `${at}: laying the shade as light instead of painting it over moved`
      + ` ${q.d.differ} pixels, worst by ${q.d.worst}/255 and ${q.d.deep} of them`
      + ' by more than 8 -- multiply by black and painting black are the same'
      + ' arithmetic, so this is a shade that is not black');
    assert(q.d.differ < q.d.pixels * 0.10,
      `${at}: ${q.d.differ} of ${q.d.pixels} pixels moved between the two ways of`
      + ` laying the shade, ${(100 * q.d.differ / q.d.pixels).toFixed(2)}% of the`
      + ' picture, where the worst measured is 6.3%');
    /* AND THE CENSUS CAN TELL THEM APART -- which is what the flag is for. */
    assert(q.kOn.plain === q.kOff.plain && q.kOn.pattern === q.kOff.pattern
        && q.kOn.ground === q.kOff.ground && q.kOn.wall === q.kOff.wall,
      `${at}: laying the shade as light changed the census of SURFACES (${q.kOn.plain}`
      + ` plain / ${q.kOn.pattern} patterned / ${q.kOn.ground} ground / ${q.kOn.wall}`
      + ` wall fills against ${q.kOff.plain} / ${q.kOff.pattern} / ${q.kOff.ground}`
      + ` / ${q.kOff.wall}), where only the light layer may move`);
    assert(q.kOff.band - q.kOn.band === q.on.painted,
      `${at}: the census counted ${q.kOff.band} gradient fills with the shade`
      + ` painted over and ${q.kOn.band} with it laid as light -- a difference of`
      + ` ${q.kOff.band - q.kOn.band} where exactly the ${q.on.painted} patches of`
      + ' shade that reached the picture have to account for it');
    assert(q.kOff.band > 0,
      `${at}: with the shade painted over the top the census counted no gradient`
      + ' fill at all, so it cannot be seeing the shade and the difference above'
      + ' is a difference of nothing');
    /* There is no assert that the flag ON leaves a gradient in the census: on a
       frame where no wall has been cut to a band, the shade is the ONLY gradient
       in the picture, and skipping it leaves `band` at zero -- which is the
       point. What is asserted above is that the difference is exactly the number
       of patches of shade, so a census that had stopped counting gradients
       cannot pass this by reporting zero either way. */
    tot.moved += q.d.differ; tot.deep += q.d.deep; tot.band += q.kOff.band - q.kOn.band;
    tot.shaded += q.on.painted; tot.pixels += q.d.pixels;
    tot.worst = Math.max(tot.worst, q.d.worst);
  }
  assert(r.backShade === true,
    'the shade came back painted over the top, where every later test wants the'
    + ' light layer that ships');
  assert(tot.shaded > 0 && tot.band === tot.shaded,
    `${tot.band} fills of gradient appeared when the shade was painted over`
    + ` against ${tot.shaded} patches of shade, so the census is not counting the`
    + ' shade and this test would pass on a frame with no shadow in it');
  console.log(`  ... ${r.rows.length} frames, ${tot.pixels} pixels: the shade laid`
    + ` as light moved ${tot.moved} of them (${(100 * tot.moved / tot.pixels).toFixed(2)}%),`
    + ` worst ${tot.worst}/255, none deep; the census counted`
    + ` ${tot.shaded} patches of shade as gradients with it painted over and none`
    + ' with it laid as light');
});

/* THE LIGHT UP A FACE IS SAMPLED ON THE WORLD'S OWN GRID (v0.49.0).
 *
 * Light fades with height, so a wall face is painted as a gradient -- a light
 * line up it. Where that line is SAMPLED matters as soon as the face does not
 * stand a whole number of metres, which is exactly what snapping a foot to a
 * metre is about: sample the fade at equal fractions of the face and a face
 * whose foot has moved is a different picture, sample it on the whole metres of
 * the world and the light you read is the light the world is holding.
 *
 * `Render.altGrid` is that choice, and this is the test that says it is
 * CONNECTED -- because a flag that changes nothing is worse than no flag (a
 * probe of the clip test's own nine cameras found it moved not one pixel there,
 * and the honest answer was not "it is dead": it was "those cameras have no
 * part-metre feet to sample").
 *
 * The measurement is the snapping test's own pair of pictures -- the feet as
 * they stand against the feet snapped -- with the flag on and off, on the
 * cameras where a foot is a part of a metre (the raised angle) and on the flat
 * angle as the control, where no foot is.
 *
 * Measured over seeds 1, 2 and 7 at the raised angle, 229,632 pixels a frame:
 * the light grid samples make the pair move 130-345 pixels a frame and equal
 * fractions 1,754-5,177 -- between 15 and 40 times as much -- while the flat
 * angle is byte-identical either way. The worst single move against the picture
 * is the 0.15% the snapping test already allows, and nothing here is deeper than
 * 13/255, so what the grid buys is a foot that moved by a fraction of a metre
 * leaving the light on the face where it was. */

await test('the light up a face is sampled on the world\'s own grid (v0.49.0)', async () => {
  const CASES = [{ seed: 1, up: 1, q: 0 }, { seed: 1, up: 1, q: 1 },
                 { seed: 2, up: 1, q: 0 }, { seed: 7, up: 1, q: 0 },
                 { seed: 1, up: 0, q: 0 }];
  const r = await page.evaluate((CASES) => {
    const t = window.__test, rows = [];
    const wasVox = t.voxelBlocks(), wasGrid = t.altGrid();
    const wasSides = t.rockSides(), wasSkin = t.wallSkin();
    t.pause(); t.unpoint();
    t.rockSides(0); t.wallSkin(false);
    /* AND THE WALL SMOOTHING OFF (v0.51.0). This test measures one thing: how far
       a pair of pictures moves when a foot is snapped, with the light sampled two
       ways. Since v0.51.0 the smoothing normalises a face's fill at an altitude
       derived from that face's own foot, so snapping the foot repaints whole
       faces at a different level and the movement being measured becomes mostly
       the smoothing's -- 22,938 pixels where the 0.15% bound at the foot of this
       file's sibling test allows 344. Pin it off, and what is left is the thing
       this test exists for: the two SAMPLINGS of the light, 130-345 pixels
       against 1,754-5,177. */
    const wasAcross = t.acrossLight();
    t.acrossLight(false);

    const grab = function () {
      return Render.bctx.getImageData(0, 0, Render.w, Render.h);
    };
    const cmp = function (a, b) {
      let moved = 0, deep = 0, worst = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const d = Math.max(Math.abs(a.data[i] - b.data[i]),
                           Math.max(Math.abs(a.data[i + 1] - b.data[i + 1]),
                                    Math.abs(a.data[i + 2] - b.data[i + 2])));
        if (d > 0) moved++;
        if (d > 8) deep++;
        if (d > worst) worst = d;
      }
      return { moved: moved, deep: deep, worst: worst, pixels: a.data.length / 4 };
    };
    /* The snapping test's own pair, in its own order, so what is measured here
       is the picture that test measures. */
    const pair = function () {
      t.voxelBlocks(false);
      const feet = t.wallMetres();
      t.repaint();
      const off = grab();
      t.voxelBlocks(true);
      t.repaint();
      return { d: cmp(off, grab()), odd: feet.odd, oddPx: feet.oddPx };
    };

    for (const c of CASES) {
      t.seed(c.seed);
      t.advance(2000);
      t.tilt(!!c.up);
      t.rotate(c.q);
      t.settle();
      t.unpoint();
      t.altGrid(true);
      const on = pair();
      t.altGrid(false);
      const off = pair();
      rows.push({ seed: c.seed, up: c.up, q: c.q, on: on, off: off });
    }
    t.altGrid(wasGrid); t.voxelBlocks(wasVox);
    t.rockSides(wasSides); t.wallSkin(wasSkin);
    t.acrossLight(wasAcross);
    t.redraw();
    return { rows: rows, wasGrid: wasGrid, backGrid: t.altGrid(),
             wasAcross: wasAcross, backAcross: t.acrossLight() };
  }, CASES);

  const tot = { on: 0, off: 0, raised: 0, flat: 0 };
  assert(r.wasAcross === true && r.backAcross === true,
    `the wall smoothing came back as ${r.backAcross} where it started at`
    + ` ${r.wasAcross} -- this test pins it off, and every test after it wants`
    + ' the look that ships');
  assert(r.wasGrid === true && r.backGrid === true,
    `the light came back sampled at equal fractions of the face (${r.backGrid})`
    + ' where the look that ships takes it from the world\'s own metres');
  for (const q of r.rows) {
    const at = `seed ${q.seed}${q.up ? ' raised' : ''}${q.q ? ' turned ' + q.q : ''}`;
    if (!q.up) {
      /* THE CONTROL: at the flat angle no face stands a part of a metre, so the
         two ways of sampling have nothing to disagree about. If they differed
         here, the difference above would be about the flag rather than about
         part-metre feet. */
      assert(q.on.odd === 0 && q.off.odd === 0,
        `${at}: ${q.on.odd} faces stand a part of a metre at the flat angle, so`
        + ' this is not the control it claims to be');
      assert(q.on.d.moved === 0 && q.off.d.moved === 0,
        `${at}: the flag moved ${q.on.d.moved}/${q.off.d.moved} pixels on a frame`
        + ' with no part-metre foot in it, where the two ways of sampling have to'
        + ' agree exactly');
      tot.flat++;
      continue;
    }
    assert(q.on.odd > 0,
      `${at}: no face in this frame stands a part of a metre, so there is nothing`
      + ' here for the flag to move and the numbers below mean nothing');
    assert(q.on.d.moved > 0 && q.on.d.moved <= q.on.d.pixels * 0.0015,
      `${at}: with the light sampled on the whole metres, snapping the feet moved`
      + ` ${q.on.d.moved} of ${q.on.d.pixels} pixels (worst ${q.on.d.worst}/255,`
      + ` ${q.on.d.deep} of them deep) where the snapping test allows 0.15%`);
    assert(q.off.d.moved >= q.on.d.moved * 8,
      `${at}: sampling the light at equal fractions of the face moved`
      + ` ${q.off.d.moved} pixels and sampling it on the world's own metres moved`
      + ` ${q.on.d.moved} -- not the 8 times the grid is worth, so either the flag`
      + ' is doing nothing or the picture has stopped carrying the light up a face');
    tot.on += q.on.d.moved; tot.off += q.off.d.moved; tot.raised++;
  }
  assert(r.rows.length === CASES.length, `${r.rows.length} frames were looked at`);
  assert(tot.raised > 0 && tot.flat > 0,
    `${tot.raised} raised and ${tot.flat} flat frames: both are needed, one to`
    + ' measure the flag and one to show it is about part-metre feet');
  assert(tot.on < tot.off / 8,
    `the light grid moved ${tot.on} pixels over ${tot.raised} frames against`
    + ` ${tot.off} for equal fractions -- a tenth of the movement, not the`
    + ` ${(tot.off / tot.on).toFixed(1)}th it was measured at`);
  console.log(`  ... ${tot.raised} raised frames, ${tot.flat} flat: snapping the`
    + ` feet moved ${tot.on} pixels with the light sampled on the world's metres`
    + ` and ${tot.off} with it sampled at equal fractions of the face, and the`
    + ' flat frames were byte-identical either way');
});

/* ---- v0.12.0: the crawler you are watching ------------------------------ */

await test('a crawler walks between squares instead of teleporting', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(9); window.__test.record(true);
    const drawn = [];                 /* where the figure REACHED THE BUFFER */
    let moved = 0, biggest = 0, last = null;
    for (let t = 0; t < 900; t++) {
      window.__test.step(1);
      const f = window.__test.frame(1);
      const me = f.items.find((q) => q.kind === 'actor' && q.name);
      if (!me) continue;
      if (last && last.i === me.i) {
        const jump = Math.abs(me.gx - last.gx) + Math.abs(me.gy - last.gy);
        if (jump > 0) { moved++; if (jump > biggest) biggest = jump; }
      }
      if (me.gx % 1 !== 0.5 || me.gy % 1 !== 0.5) drawn.push({ gx: me.gx, gy: me.gy });
      last = me;
    }
    return { moved, biggest, between: drawn.length, sample: drawn.slice(0, 3),
             ticks: window.__test.cfg.stepWalkTicks };
  });
  assert(r.moved > 20, `nobody moved on screen in 900 ticks (${r.moved} changes)`);
  assert(r.between > 0, 'every drawn position was dead on a square centre -- they teleport');
  assert(r.biggest < 0.5,
    `a crawler jumped ${r.biggest.toFixed(3)} m between two frames; a stride of `
    + `${r.ticks} ticks should never move more than about ${(1 / r.ticks).toFixed(3)} m`);
});

await test('a selected crawler stays ringed while they walk away', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    const found = window.__test.pointAtAnyActor();
    if (!found.found) return { found: false };
    window.__test.tap(found.pick);
    const at0 = window.__test.actors()[found.index];

    /* Run them along until they are standing somewhere else entirely. */
    let at1 = at0, drew = null;
    for (let t = 0; t < 900 && (at1.x === at0.x && at1.y === at0.y); t++) {
      window.__test.step(1);
      drew = window.__test.frame(1);
      at1 = window.__test.actors()[found.index];
    }
    /* And prove the pointer cannot steal the ring off them. */
    window.__test.point(4, 4);
    const stolen = window.__test.consumed();
    return { found: true, pick: found.pick,
             from: [at0.x, at0.y], to: [at1.x, at1.y],
             focus: drew && drew.focus, outlined: drew && drew.outlined,
             stillFocus: stolen.focus, stillOutlined: stolen.outlined };
  });
  assert(r.found, 'every crawler is out of sight');
  assert(r.from[0] !== r.to[0] || r.from[1] !== r.to[1], 'nobody moved, so nothing was proved');
  assert(r.focus === r.pick, `the ring left them: focus ${r.focus}, wanted ${r.pick}`);
  assert(r.outlined, 'the ring never reached the buffer after they moved');
  assert(r.stillFocus === r.pick, 'the pointer stole the ring off the selected crawler');
  assert(r.stillOutlined, 'the ring vanished when the pointer went elsewhere');
});

await test('the view rides the crawler you picked, and lets go when you pan', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    const found = window.__test.pointAtAnyActor();
    if (!found.found) return { found: false };
    const tapped = window.__test.tap(found.pick);
    const cam0 = window.__test.camera();
    const at0 = window.__test.actors()[found.index];

    /* Run until they have not only left the square but finished the stride, so
       the drawn position really is somewhere else. */
    let at1 = at0;
    for (let t = 0; t < 2000; t++) {
      window.__test.step(1);
      window.__test.frame(1);
      at1 = window.__test.actors()[found.index];
      if ((at1.x !== at0.x || at1.y !== at0.y) && at1.moveT >= 1) break;
    }
    const cam1 = window.__test.camera();

    window.__test.pan(40, 40);              /* a hand on the view lets go */
    const cam2 = window.__test.camera();

    /* Tapping the ground is not a crawler, so nothing is ridden. */
    window.__test.tap(0);
    const cam3 = window.__test.camera();
    return { found: true, index: found.index, tapped,
             cam0, cam1, cam2, cam3, at0, at1 };
  });
  assert(r.found, 'every crawler is out of sight');
  assert(r.tapped.follow === r.index,
    `tapping a crawler set follow to ${r.tapped.follow}, wanted ${r.index}`);
  assert(Math.abs(r.cam0.fx - r.at0.gx) < 1e-9 && Math.abs(r.cam0.fy - r.at0.gy) < 1e-9,
    `the view did not centre on them: ${r.cam0.fx},${r.cam0.fy} vs ${r.at0.gx},${r.at0.gy}`);
  assert(Math.abs(r.cam1.fx - r.at1.gx) < 1e-9 && Math.abs(r.cam1.fy - r.at1.gy) < 1e-9,
    'the view stayed behind when they walked off');
  assert(r.cam1.fx !== r.cam0.fx || r.cam1.fy !== r.cam0.fy, 'the view never moved at all');
  assert(r.cam2.follow === -1, 'panning by hand did not let go of the crawler');
  assert(r.cam3.follow === -1, 'tapping the ground still left the view riding someone');
});

/* ---- v0.12.1: the controls a walking crawler broke --------------------- */

/* Aim at a crawler through the real pick buffer, then return where to press
   in CLIENT pixels, so a test can use real mouse events rather than the
   harness's shortcut. The game is frozen while aiming so the figure holds
   still; the caller decides when to let it run. */
async function aimAtCrawler() {
  return page.evaluate(() => {
    Game.paused = true;
    Game.state.selected = -1; Game.state.cam.follow = -1;
    const got = window.__test.pointAtAnyActor();
    if (!got.found) { Game.paused = false; return null; }
    const c = document.getElementById('screen').getBoundingClientRect();
    return { want: got.pick, name: got.name,
             x: c.left + got.sx * (c.width / Render.w),
             y: c.top + got.sy * (c.width / Render.w) };
  });
}

await test('you select the crawler you pressed on, not the floor they walked off', async () => {
  let hits = 0, tries = 0, misses = [];
  for (let t = 0; t < 4; t++) {
    const aim = await aimAtCrawler();
    if (!aim) continue;
    tries++;
    await page.mouse.move(aim.x, aim.y);
    await page.mouse.down();
    /* Let them walk the whole time the button is held -- which is exactly what
       a real click does, and long enough for a crawler to leave the square. */
    await page.evaluate(() => { Game.paused = false; });
    await page.waitForTimeout(400);
    await page.mouse.up();
    await page.waitForTimeout(120);
    const got = await page.evaluate(() => Game.state.selected);
    if (got === aim.want) hits++; else misses.push(`pressed ${aim.want}, got ${got}`);
  }
  assert(tries >= 2, `only ${tries} crawlers could be aimed at`);
  assert(hits === tries,
    `${hits}/${tries} presses kept their crawler: ${misses.join('; ')}`);
});

await test('picking a crawler does not leave a second box naming something else', async () => {
  const aim = await aimAtCrawler();
  assert(aim, 'no crawler could be aimed at');
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down(); await page.mouse.up();
  await page.evaluate(() => { Game.paused = false; });
  await page.waitForTimeout(350);
  const r = await page.evaluate(() => ({
    selected: Game.state.selected,
    panel: document.getElementById('panel').hidden ? null
         : document.getElementById('panel').textContent.replace(/\s+/g, ' ').trim(),
    tip: document.getElementById('tooltip').hidden ? null
       : document.getElementById('tooltip').textContent.replace(/\s+/g, ' ').trim()
  }));
  assert(r.selected === aim.want, `the wrong thing got pinned: ${r.selected}`);
  assert(r.panel && r.panel.includes(aim.name), `the panel does not name ${aim.name}`);
  /* The view locks onto them, which slides the world under the pointer. The
     tooltip must not then announce whatever drifted beneath the cursor. */
  assert(r.tip === null,
    `a tooltip is up beside the panel saying "${r.tip}" while the panel says ${aim.name}`);
});

await test('the panel stops rebuilding itself, so its buttons can be pressed', async () => {
  const aim = await aimAtCrawler();
  assert(aim, 'no crawler could be aimed at');
  await page.mouse.move(aim.x, aim.y);
  await page.mouse.down(); await page.mouse.up();
  await page.evaluate(() => { Game.paused = false; });
  await page.waitForTimeout(200);

  /* Count how often the panel's children are replaced while a crawler walks.
     At 60 a second the close button is destroyed between a press and its
     release, and no click ever completes. */
  const churn = await page.evaluate(() => new Promise((res) => {
    let n = 0;
    const mo = new MutationObserver((ms) => { for (const m of ms) if (m.type === 'childList') n++; });
    mo.observe(document.getElementById('panel'), { childList: true, subtree: true });
    setTimeout(() => { mo.disconnect(); res(n); }, 1000);
  }));
  assert(churn < 15, `the panel rebuilt its own buttons ${churn} times in a second`);

  /* And prove it by pressing the close button for real. */
  const followed = await page.evaluate(() => Game.state.cam.follow);
  assert(followed >= 0, 'the view is not riding the crawler, so this proves nothing');
  await page.click('.pn-close', { timeout: 4000 });
  const after = await page.evaluate(() => ({
    selected: Game.state.selected, follow: Game.state.cam.follow,
    panel: document.getElementById('panel').hidden
  }));
  assert(after.selected === -1, 'the close button did not deselect');
  assert(after.panel, 'the panel is still on screen after closing it');
  assert(after.follow === -1, 'closing the panel left the view still riding them');
});

/* ---- v0.22.0: the pointer answers without a second picture -------------- */

/* Until v0.22.0 the answer to "what is under the pointer" was worked out by
   painting the whole scene again, flat, in colours that spell out the item
   numbers, and reading the pixel back. That second picture is gone, so this
   now asserts the strong thing: the buffer is never painted at all -- not with
   the pointer off the canvas, and not with the pointer sitting on a crawler,
   which is exactly when the old code would have painted it every frame. The
   guards underneath are what stop this from passing for the wrong reason:
   questions really were asked, and they were asked while the picture was out
   of date, so the old picker really would have repainted. */
await test('the scene is never painted a second time to answer the pointer', async () => {
  const r = await page.evaluate(() => new Promise((res) => {
    const s = Game.state;
    Game.paused = false;
    s.geomDirty = true; s.viewDirty = true;
    let painted = 0, asked = 0, stale = 0;
    const origPaint = Render.drawPick.bind(Render);
    const origAsk = Render.pickAt.bind(Render);
    Render.drawPick = (st) => { painted++; return origPaint(st); };
    Render.pickAt = (st, x, y) => {
      asked++;
      /* The exact condition the old picker repainted on: a question asked while
         the picture on the screen was out of date. */
      if (st.viewDirty) stale++;
      return origAsk(st, x, y);
    };
    /* Aim at a crawler through the real pick buffer, then keep the view riding
       them so the picture is rebuilt every frame -- which is when the old code
       repainted. Riding is by INDEX (cam.follow is an actor index); being
       pinned is by NUMBER, and the number slides as ground arrives. */
    const got = window.__test.pointAtAnyActor();
    const idx = got.found ? got.index : -1;
    const riding = idx >= 0 ? s.actors[idx] : null;
    let named = 0;
    const tick = setInterval(() => {
      if (!riding) return;
      s.selected = Render.actorBase(s) + idx;
      s.cam.follow = idx;
      s.viewDirty = true;
      /* Hold the pointer on them the way the rest of this file does, through
         the game's own door. The real mouse cannot be used for this: it sits
         wherever the last real click left it, and the panel can be lying over
         the picture at that spot, which turns `pointer.over` off through the
         canvas's own leave handler. That is the game working as asked, not a
         fault, so a test must not read its own meaning off it. */
      const overWhat = window.__test.point(got.sx, got.sy);
      if (Render.isActorPick(s, overWhat) && Render.actorFromPick(s, overWhat) === riding) {
        named++;
      }
    }, 20);
    setTimeout(() => {
      clearInterval(tick);
      Render.drawPick = origPaint;
      Render.pickAt = origAsk;
      res({ painted: painted, asked: asked, stale: stale, named: named,
            found: got.found });
    }, 1000);
  }));
  /* The whole point of the test only means something if a question was really
     being asked, every frame, with a moving picture to answer it in. */
  assert(r.found, 'no crawler could be reached by the pointer at all');
  /* A question is only asked while the game holds the pointer over the
     picture, so this many of them also says the pointer was really on it. */
  assert(r.asked >= 20,
    `the game only asked the pointer ${r.asked} times in a second, so there was `
    + 'nothing to make the old code repaint');
  /* And they were asked with the picture out of date, which is the only time
     the old picker repainted -- otherwise this could pass by asking about a
     picture that had already been drawn. */
  assert(r.stale >= 20,
    `the pointer was asked ${r.asked} times but only ${r.stale} of those came `
    + 'while the picture was out of date, so the old code would not have repainted');
  assert(r.painted === 0,
    `the scene was painted a second time into the pick buffer ${r.painted} times `
    + `in a second while the pointer sat on a crawler (naming them ${r.named} of `
    + 'those asks)');
});

/* The old answer was the pixel that ended up on top. The new answer is the
   first shape, walking the painted list front to back, that contains the
   point. Those are the same only if the list really is in painter's order and
   the bounding boxes it is culled by never hide a shape behind them -- so the
   two are compared here against a deliberately slow walk in the paint
   direction that ignores the boxes entirely and remembers the LAST shape
   containing the point. Nothing is painted: there are no pixels in this test,
   so it cannot pass by two mistakes cancelling out in a blend. */
await test('the pointer finds the frontmost shape all over the picture (v0.22.0)', async () => {
  const r = await page.evaluate(() => {
    const s = Game.state;
    Game.paused = true;
    s.selected = -1; s.cam.follow = -1;
    s.pointer.over = false; s.hover = -1;
    s.geomDirty = true; s.viewDirty = true;
    Render.build(s); Render.draw(s);
    const b = Render.batch;

    /* Is the point inside this shape? Crossing count, asked about the MIDDLE
       of the pixel, which is the point canvas itself tests when it decides
       whether to fill one. */
    const inside = (pts, px, py) => {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], d = pts[j];
        if ((a.y > py) !== (d.y > py) &&
            px < (d.x - a.x) * (py - a.y) / (d.y - a.y) + a.x) c = !c;
      }
      return c;
    };

    /* Which of a wall's two sides the picture paints is not the same question as
       whether the square has one, and this walk has to use the picture's answer
       or it is measuring its own blind spot: a side is cut down only where the
       block in front of it PAINTS, and where that block is cut away and paints
       nothing the whole side comes back (v0.42.0, `wallsPainted`). Read off the
       stored `cutL`/`cutR` instead, this walk called those walls not there, found
       the square behind them instead, and reported the pointer as wrong at six
       points along the top edge of the picture. */
    const alphaOf = Render.alphas(s, b).list;

    /* The long way: the order the picture is painted in, back to front, with
       the last shape containing the point winning. No bounding boxes, so a box
       drawn a hair too tight shows up as a disagreement instead of hiding. */
    const slow = (px, py) => {
      let last = -1;
      for (let k = 0; k < b.length; k++) {
        const it = b[k];
        /* A square the picture skipped is not an answer either. This is the same
           question pickAt() asks, and the only way the two can agree. */
        if (Render.cutOut(it)) continue;
        /* A patch of shade is not a thing anybody can point at -- pickAt()
           skips it and so does drawPick(), and this walk has to skip it too or
           the two answers cannot agree. Since v0.49.0 the picture lays shade on
           the ground, so a walk that did not know about it read `parts` off a
           shape that has none. */
        if (it.kind === 'shadow') continue;
        let yes = false;
        if (it.kind === 'cell') {
          if (it.solid) {
            const faced = Render.wallsPainted(it, alphaOf);
            const qL = faced.l, qR = faced.r;
            /* The strips of its own rock along the far edges are painted too, so
               they belong to this square here exactly as they do in the picture
               and in pickAt(). */
            if (faced.br && inside(faced.br, px, py)) yes = true;
            if (!yes && faced.bl && inside(faced.bl, px, py)) yes = true;
            if (!yes && qL && inside(qL, px, py)) yes = true;
            if (!yes && qR && inside(qR, px, py)) yes = true;
          }
          /* A wall block's top face is not painted at all now, so it cannot be
             an answer either -- the same gate pickAt() puts on it. */
          if (!yes && Render.capShown(it) && inside(it.top, px, py)) yes = true;
        } else {
          for (let r = 0; r < it.parts.length && !yes; r++) {
            const fs = it.parts[r].faces;
            for (let g = 0; g < fs.length && !yes; g++) {
              if (inside(fs[g].pts, px, py)) yes = true;
            }
          }
        }
        if (yes) last = it.i;
      }
      return last;
    };

    let points = 0, notEmpty = 0, answers = 0;
    const wrong = [];
    const check = (x, y) => {
      const px = x + 0.5, py = y + 0.5;
      const fast = Render.pickAt(s, px, py), deep = slow(px, py);
      points++;
      if (deep !== -1) notEmpty++;
      if (fast !== -1) answers++;
      if (fast !== deep && wrong.length < 6) {
        wrong.push(`at ${x},${y} the pointer says ${fast} and painting from the `
                 + `back says ${deep}`);
      }
    };
    /* A spread over the whole picture, so ground, walls and figures are all
       walked, and every pixel of a patch in the middle, which is fine enough
       to land on shape edges and slivers. */
    for (let y = 2; y + 2 < Render.h; y += 9) {
      for (let x = 2; x + 2 < Render.w; x += 9) check(x, y);
    }
    const mx = Math.floor(Render.w / 2), my = Math.floor(Render.h / 2);
    for (let y = my - 15; y < my + 15; y++) {
      for (let x = mx - 15; x < mx + 15; x++) check(x, y);
    }
    return { wrong, points, notEmpty, answers, items: b.length, w: Render.w, h: Render.h };
  });
  assert(r.notEmpty > r.points / 5,
    `only ${r.notEmpty} of ${r.points} points landed on anything at all, so this `
    + 'test did not look at much');
  assert(r.wrong.length === 0,
    `${r.wrong.length} of ${r.points} points answered differently from a walk in `
    + `the paint direction: ${r.wrong.join('; ')}`);
});

/* Nothing the picture left out can be named by the pointer. A square that is
 * cut out of the way is behind something solid -- it is not on the screen even
 * though it is in the list of shapes -- so answering with one would put the
 * outline and the tooltip on a thing nobody can see, and would put them there
 * in the middle of the picture rather than at its edge. This is the reported
 * bug's own direction of failure, measured: the pointer walked over a grid of
 * the whole picture, counting every ask that answered with a square the picture
 * did not paint.
 *
 * THREE LOOKS IN ONE BUILD, because as of v0.44.0 the look that ships leaves
 * NOTHING out of the picture at all -- the rock in the way is drawn like any
 * other rock -- so on its own it would be a claim about an empty set: `onLeft`
 * nought because there is no square there to answer with wrongly, which is
 * evidence about nothing. Each look is asked the same question over the same 24
 * pictures and keeps its own counters, so one look's healthy count cannot hide
 * another's:
 *
 *   shipped   the rock in the way is drawn like any other rock, so no square is
 *             left out of the picture at all: every square standing in the way
 *             is painted, and naming it is right;
 *   dial down the rock in the way is left out of the picture but keeps a metre
 *             of itself standing -- the square IS painted, as a foot of rock,
 *             and naming it is RIGHT (rule 8). This is the case that once made
 *             this test fail with the picture correct, so it is asked on its
 *             own;
 *   v0.37.0   the same with the foot switched off, where squares ARE left out
 *             whole: the claim this test is named for, and the only look of the
 *             three where `leftOut` is anything but nought.
 *
 * What counts as "left out" is the renderer's OWN rule for it -- `Render.cutOut`,
 * the predicate `pickAt()` skips and `draw()` refuses to paint -- rather than a
 * second copy of it here that could drift away from it. */
await test('nothing the picture left out can be picked (v0.34.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.pause(); t.unpoint();
    const wasCut = t.cfg.cutSolid;
    const wasStump = t.cutStump();
    const looks = [];
    for (const look of [{ name: 'shipped', solid: wasCut, stump: wasStump },
                        { name: 'dial down', solid: 0, stump: wasStump },
                        { name: 'v0.37.0', solid: 0, stump: 0 }]) {
      t.cfg.cutSolid = look.solid; t.cutStump(look.stump);
      const o = { name: look.name, solid: look.solid, stump: look.stump,
                  pictures: 0, asks: 0, onLeft: 0, onNamed: 0, onNothing: 0,
                  leftCells: 0, namedCells: 0, worlds: new Set() };
      for (const seed of [1, 3, 7]) {
        t.seed(seed);
        t.step(3001);
        t.record(true);
        for (const up of [false, true]) {
          t.tilt(up);
          for (let q = 0; q < 4; q++) {
            t.rotate(q ? 1 : 0); t.redraw();
            /* THE SQUARES THIS PICTURE LEFT OUT, and the ones standing in the way
               that it painted anyway. Both matter, and the second is why this test
               used to fail without the picture being wrong at all: a square cut
               out of the way is not painted, UNLESS it keeps a foot of itself
               standing -- v0.42.0's stump, which IS painted and IS a thing the
               player can see and click (rule 8). Those two sets are asked about
               separately. */
            const left = new Set(), named = new Set();
            for (const it of Render.batch) {
              if (it.kind !== 'cell' || !it.cutaway) continue;
              if (Render.cutOut(it)) left.add(it.i); else named.add(it.i);
            }
            o.leftCells += left.size;
            o.namedCells += named.size;
            o.pictures++;
            o.worlds.add(seed + ':' + (up ? 'up' : 'flat') + ':' + t.camera().quarter);
            for (let y = 4; y < Render.h - 4; y += 10) {
              for (let x = 4; x < Render.w - 4; x += 10) {
                const hit = t.point(x, y);
                o.asks++;
                if (hit < 0) o.onNothing++;
                else if (left.has(hit)) o.onLeft++;
                else if (named.has(hit)) o.onNamed++;
              }
            }
            t.unpoint();
          }
        }
      }
      t.record(false);
      looks.push({ ...o, worlds: o.worlds.size });
    }
    t.cfg.cutSolid = wasCut; t.cutStump(wasStump);
    t.tilt(false); t.unpoint();
    return { looks, wasCut, wasStump, back: t.cfg.cutSolid,
             backStump: t.cutStump() };
  });
  const ship = r.looks.find((L) => L.name === 'shipped');
  const gap = r.looks.find((L) => L.name === 'dial down');
  const bare = r.looks.find((L) => L.name === 'v0.37.0');
  for (const L of r.looks) {
    assert(L.pictures === 24 && L.worlds === 24,
      `${L.name}: ${L.pictures} pictures were asked, reaching ${L.worlds}`
      + ' different ones');
    assert(L.asks > 3000,
      `${L.name}: only ${L.asks} pixels were asked for an answer, which is not a`
      + ' walk over the picture');
    assert(L.onLeft === 0,
      `${L.name}: ${L.onLeft} answers were a square the picture did not paint, so`
      + ' the pointer can name something nobody can see');
  }
  assert(r.wasCut === 1 && r.back === 1,
    `the rock in the way is not drawn solid in the spreadsheet (cut_solid`
    + ` ${r.wasCut}), so there is no gap left to see through`);
  assert(r.backStump === r.wasStump,
    `cut_stump_m came back as ${r.backStump} where the sheet has ${r.wasStump}`);
  /* The look that ships leaves nothing out of the picture at all -- and that is
     not the walk passing for want of anything to answer with, because the same
     pictures under the last look DO contain swallowed squares and the walk still
     never names one. Nor is `onNamed` nought for want of squares standing in the
     way: they are there in numbers, painted, and the walk lands on them. */
  assert(ship.leftCells === 0,
    `with cut_solid ${ship.solid} the picture still left ${ship.leftCells} squares`
    + ' out of the twenty-four of them, so this look is not the one the sheet asks'
    + ' for');
  assert(ship.namedCells > 0 && ship.onNamed > 0,
    `with cut_solid ${ship.solid}, ${ship.namedCells} squares stood in the way over`
    + ` the twenty-four pictures and the walk landed on ${ship.onNamed} of them --`
    + ' if either is nought, this look proves nothing about squares in the way');
  /* And the other halves of the same fact, so that `onLeft` is not nought for the
     trivial reason that the ambiguous case never came up. The middle look is the
     square left out of the picture but painted anyway as a foot: naming THAT is
     right, and it has to be seen to happen. The last look is v0.37.0, where
     squares are left out whole and nothing may answer with one. */
  assert(gap.leftCells === 0 && gap.namedCells > 0,
    `with the rock in the way switched off and the foot of rock on, ${gap.leftCells}`
    + ` squares were left out whole and ${gap.namedCells} kept a foot, so the one`
    + ' case where a swallowed square IS painted was never looked at');
  assert(gap.onNamed > 0,
    `${gap.onNamed} points landed on a square that kept a foot of rock, out of`
    + ` ${gap.namedCells} feet over 24 pictures -- if none of them did, this test`
    + ' is not covering the picture it is about');
  assert(bare.leftCells > 0 && bare.namedCells === 0,
    `with the foot of rock off as well, ${bare.leftCells} squares were left out of`
    + ` the picture whole and ${bare.namedCells} were painted, so there was nothing`
    + ' to answer with wrongly and this test proves nothing');
});

/* ---- v0.13.0: rooms are places, built out of words --------------------- */

await test('rooms are named from the vocabulary, and no two are the same place', async () => {
  const r = await page.evaluate(() => {
    const titles = [], shapes = {};
    let rooms = 0, named = 0;
    for (let seed = 1; seed <= 25; seed++) {
      window.__test.seed(seed);
      for (const room of Game.state.world.rooms) {
        rooms++;
        if (!room.place) continue;
        named++;
        titles.push(room.place.title);
        for (const id of room.place.words) shapes[WORD(id).slot] = 1;
      }
    }
    return { rooms, named, titles, slots: Object.keys(shapes).sort(),
             distinct: new Set(titles).size,
             words: WORD_IDS.length,
             multi: titles.filter((t) => t.split(' ').length > 2).length };
  });
  assert(r.named > 0, 'not one room was a place');
  const share = r.named / r.rooms;
  assert(share > 0.3 && share < 0.7,
    `${Math.round(share * 100)}% of rooms were named; the sheet asks for about half`);
  /* The point of a vocabulary is that it does not repeat itself. */
  assert(r.distinct > r.named * 0.55,
    `only ${r.distinct} distinct names in ${r.named} rooms`);
  assert(r.multi > 0,
    'every name was a single word -- conditions and peoples never stacked');
  assert(r.slots.indexOf('function') >= 0, 'no room was named for what it WAS');
});

await test('every room can still be walked all the way round (rooms have shape now)', async () => {
  const r = await page.evaluate(() => {
    let rooms = 0, broken = 0, stranded = 0;
    const worst = [];
    for (let seed = 1; seed <= 30; seed++) {
      window.__test.seed(seed);
      const w = Game.state.world;
      for (const room of w.rooms) {
        rooms++;
        const box = { x0: room.x + 1, x1: room.x + room.w - 2,
                      y0: room.y + 1, y1: room.y + room.h - 2 };
        if (roomWhole(w, room, box)) continue;
        broken++;
        if (worst.length < 5) {
          worst.push(`seed ${seed} ${room.place ? room.place.title : 'plain hall'}`);
        }
      }
    }
    return { rooms, broken, stranded, worst };
  });
  assert(r.rooms > 100, `only ${r.rooms} rooms were generated`);
  assert(r.broken === 0,
    `${r.broken} of ${r.rooms} rooms had floor nobody could reach: ${r.worst.join('; ')}`);
});

await test('the ground inside a room is no longer one flat sheet', async () => {
  const r = await page.evaluate(() => {
    let named = 0, namedTiered = 0, plain = 0, plainTiered = 0;
    let floor = 0, ramp = 0;
    for (let seed = 1; seed <= 25; seed++) {
      window.__test.seed(seed);
      const w = Game.state.world;
      for (const room of w.rooms) {
        const hs = new Set();
        for (let y = room.y; y < room.y + room.h; y++) {
          for (let x = room.x; x < room.x + room.w; x++) {
            const c = w.at(x, y);
            if (!c || TILE(c.tile).footing === 'block') continue;
            hs.add(c.h);
            floor++;
            if (TILE(c.tile).footing === 'ramp') ramp++;
          }
        }
        if (room.place) { named++; if (hs.size > 1) namedTiered++; }
        else { plain++; if (hs.size > 1) plainTiered++; }
      }
    }
    return { named, namedTiered, plain, plainTiered, floor, ramp };
  });
  /* Before this, 90 of 90 rooms were a single flat sheet and the only height in
     the labyrinth was in the corridors -- one per cent of the ground. */
  assert(r.namedTiered > r.named * 0.5,
    `only ${r.namedTiered} of ${r.named} named rooms had more than one level`);
  assert(r.ramp > 0, 'not one ramp was cut inside a room');
});

await test('a word puts its meaning into the ground, not just into the name', async () => {
  const r = await page.evaluate(() => {
    /* Find a flooded place and check the water is actually there; find a
       pillared one and check something is standing in it. */
    let flooded = null, pillared = null;
    for (let seed = 1; seed <= 60 && (!flooded || !pillared); seed++) {
      window.__test.seed(seed);
      const w = Game.state.world;
      for (const room of w.rooms) {
        if (!room.place) continue;
        let water = 0, blocks = 0;
        for (let y = room.y + 1; y < room.y + room.h - 1; y++) {
          for (let x = room.x + 1; x < room.x + room.w - 1; x++) {
            const c = w.at(x, y);
            if (!c) continue;
            if (c.tile === 'shallow_water') water++;
            if (TILE(c.tile).footing === 'block') blocks++;
          }
        }
        const words = room.place.words;
        const wet = words.some((id) => WORD(id).shape.some((m) => m[0] === 'water'));
        const cols = words.some((id) => WORD(id).shape.some((m) => m[0] === 'pillars'));
        if (wet && !flooded) flooded = { title: room.place.title, water: water };
        if (cols && !pillared) pillared = { title: room.place.title, blocks: blocks };
      }
    }
    return { flooded, pillared };
  });
  assert(r.flooded, 'no flooded place turned up in sixty worlds');
  assert(r.flooded.water > 0,
    `"${r.flooded.title}" is called flooded and has no water in it`);
  assert(r.pillared, 'no pillared place turned up in sixty worlds');
  assert(r.pillared.blocks > 0,
    `"${r.pillared.title}" is called pillared and has nothing standing in it`);
});

await test('a place keeps its name secret until a crawler reads it', async () => {
  const r = await page.evaluate(() => {
    /* Seed until the crawlers' own camp room is a place they do not know. */
    for (let seed = 1; seed <= 40; seed++) {
      window.__test.seed(seed);
      const s = Game.state;
      if (!s.camp || !s.camp.room.place) continue;
      const room = s.camp.room;
      /* A square of that room, named the way the tooltip names squares. */
      const idx = s.world.cells.indexOf(s.world.at(room.x, room.y));
      const before = Tooltip.describe(s, idx);
      const studyBefore = s.actors.reduce((n, a) => n + (a.skills.studying || 0), 0);

      let ticks = 0;
      while (!room.known && ticks < 6000) { window.__test.step(1); ticks++; }
      if (!room.known) continue;

      const after = Tooltip.describe(s, idx);
      const studyAfter = s.actors.reduce((n, a) => n + (a.skills.studying || 0), 0);
      return { seed, title: room.place.title, ticks,
               nameBefore: before.name, nameAfter: after.name,
               placeBefore: before.place, placeKnown: after.placeKnown,
               tagsBefore: before.tags.length, tagsAfter: after.tags.length,
               studyBefore: studyBefore, studyAfter: studyAfter,
               studies: room.studies, readBy: room.readBy };
    }
    return null;
  });
  assert(r, 'no camp room in forty worlds was a place worth reading');
  assert(r.nameBefore !== r.title,
    `the room gave away that it was a ${r.title} before anyone read it`);
  assert(!/known|undefined/.test(String(r.placeBefore)) && r.placeBefore,
    'an unread place said nothing at all about being a place');
  assert(r.nameAfter === r.title, `after reading it, it is called ${r.nameAfter}`);
  assert(r.placeKnown, 'the room is read but does not say so');
  assert(r.tagsAfter > r.tagsBefore,
    'reading the place taught the square nothing it did not already say');
  assert(r.readBy, 'nobody is credited with having read it');
  /* Rule 1: it is a Studying roll like any other, so the failures on the way
     are what teach. A place read first time teaches nobody anything. */
  assert(r.studies >= 1, 'the room was known without anyone attempting it');
  if (r.studies > 1) {
    assert(r.studyAfter > r.studyBefore,
      `${r.studies} attempts to read the room taught nobody any Studying`);
  }
});

/* ---- v0.14.0: the figure, measured rather than admired ----------------- */

await test('a crawler is ONE figure, not a pile of floating parts', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    const s = Game.state;
    const got = window.__test.pointAtAnyActor();
    if (!got.found) return { found: false, why: got.why };
    const bad = [], seen = [];
    const kit = { head: 'hood', torso: 'jerkin', legs: 'breeches',
                  feet: 'boots', gloves: 'gloves' };
    for (const worn of [{}, kit]) {
      s.actors[got.index].worn = Object.assign({}, worn);
      for (const [doing, tick] of [['idle', 40], ['walking', 17], ['walking', 26],
                                   ['clearing', 25], ['clearing', 36]]) {
        for (let q = 0; q < 4; q++) {
          s.cam.quarter = q; s.cam.yaw = s.cam.yawTarget = q * Math.PI / 2;
          camRefresh(s);
          const m = window.__test.figureRows(got.index, doing, tick);
          if (!m) continue;
          /* Trim the crown and the soles. A skull (and a hood over it) rounds
             off at the top, and a foot tapers to a toe -- both SHOULD come to
             a point, and both did, which is why the first cut of this test
             failed 26 poses for the wrong reason. Everything between them is
             body, and body may not come apart. */
          const body = m.rows.slice(2, m.rows.length - 3);
          if (!body.length) continue;
          const holes = body.filter((n) => n === 0).length;
          const pinch = Math.min.apply(null, body);
          seen.push({ doing, q, worn: Object.keys(worn).length, pinch, holes,
                      tall: m.rows.length });
          if (holes > 0 || pinch < 2) bad.push(`${doing} t${tick} turn ${q}`
            + (Object.keys(worn).length ? ' dressed' : ' bare')
            + `: ${holes} empty rows, narrowest ${pinch}px`);
        }
      }
    }
    return { found: true, bad, seen };
  });
  assert(r.found, `no crawler could be looked at: ${r.why}`);
  assert(r.seen.length >= 30, `only ${r.seen.length} poses were measured`);
  /* A hole is a row of the body with nothing painted in it. A pinch is a row
     one pixel wide -- which is what a rounded end BURIED in the next limb does,
     and it is why the crawlers read as a head, a blob and two floating feet. */
  assert(r.bad.length === 0,
    `the figure comes apart in ${r.bad.length} of ${r.seen.length} poses:\n         `
    + r.bad.slice(0, 6).join('\n         '));
});

await test('every part of a crawler overlaps the part it hangs from', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    Game.state.actors[0].worn = {};
    Game.state.actors[0].doing = 'idle';
    const sp = window.__test.figureSpans(0);
    /* child part -> the part it must be joined to */
    const CHAIN = [['foot_l', 'shin_l'], ['shin_l', 'thigh_l'], ['thigh_l', 'pelvis'],
                   ['foot_r', 'shin_r'], ['shin_r', 'thigh_r'], ['thigh_r', 'pelvis'],
                   ['pelvis', 'torso'], ['torso', 'neck'], ['neck', 'head'],
                   ['hand_l', 'forearm_l'], ['forearm_l', 'upperarm_l'],
                   ['hand_r', 'forearm_r'], ['forearm_r', 'upperarm_r']];
    const out = [];
    for (const [lo, hi] of CHAIN) {
      if (!sp[lo] || !sp[hi]) { out.push({ lo, hi, overlap: null }); continue; }
      out.push({ lo, hi, overlap: +(sp[lo].hi - sp[hi].lo).toFixed(3) });
    }
    return { joints: out, height: Math.max.apply(null, Object.values(sp).map((q) => q.hi))
                             - Math.min.apply(null, Object.values(sp).map((q) => q.lo)),
             head: sp.head ? sp.head.hi - sp.head.lo : 0,
             shoulders: sp.torso ? sp.torso.w : 0,
             want: window.__test.cfg.actorHeight };
  });
  const thin = r.joints.filter((j) => j.overlap === null || j.overlap < 0.02);
  assert(thin.length === 0,
    'these joints meet instead of overlapping (lesson 7): '
    + thin.map((j) => `${j.lo}->${j.hi} ${j.overlap}m`).join(', '));

  /* And it must still be a HUMAN, not a totem. */
  const tall = r.height;
  assert(Math.abs(tall - r.want) < r.want * 0.06,
    `a crawler is ${tall.toFixed(2)}m; the sheet says ${r.want}m`);
  assert(r.head / tall > 0.11 && r.head / tall < 0.17,
    `the head is ${(r.head / tall * 100).toFixed(0)}% of height (a person is about 13%)`);
  assert(r.shoulders / tall > 0.17 && r.shoulders / tall < 0.27,
    `the shoulders are ${(r.shoulders / tall * 100).toFixed(0)}% of height `
    + '(a person is about 23%)');
});

/* ---- v0.15.0: walls somebody built ------------------------------------- */

await test('a stone block wall is stone, constructed, solid and opaque', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const t = window.__test.data.tiles.stone_wall;
    return { tile: t, tagNames: t.tags.map((q) => window.__test.data.tags[q].name) };
  });
  assert(r.tile, 'there is no stone_wall tile at all');
  for (const want of ['stone', 'constructed']) {
    assert(r.tile.tags.indexOf(want) >= 0, `a wall is not tagged "${want}"`);
  }
  /* These two are not decoration. Without them a wall would not fill its metre
     and firelight would pour straight through the masonry. */
  assert(r.tile.tags.indexOf('solid') >= 0, 'a wall does not fill its metre');
  assert(r.tile.tags.indexOf('blocks-sight') >= 0, 'you can see through the wall');
  assert(r.tile.footing === 'block', `a wall has footing ${r.tile.footing}`);
  assert(r.tile.pattern === 'masonry', 'the wall carries no masonry pattern');
});

await test('rooms somebody BUILT are faced with laid stone; holes are not', async () => {
  const r = await page.evaluate(() => {
    let faced = 0, rawWalled = 0, wallCells = 0, worked = 0, dug = 0;
    const missed = [];
    for (let seed = 1; seed <= 20; seed++) {
      window.__test.seed(seed);
      const w = Game.state.world;
      for (const room of w.rooms) {
        if (!room.place) continue;
        const built = room.place.tags.indexOf('worked') >= 0;
        let laid = 0, raw = 0;
        for (let y = room.y - 1; y <= room.y + room.h; y++) {
          for (let x = room.x - 1; x <= room.x + room.w; x++) {
            const c = w.at(x, y);
            if (!c || c.room >= 0 || TILE(c.tile).footing !== 'block') continue;
            let touches = false;
            for (const [dx, dy] of STEPS) {
              const n = w.at(x + dx, y + dy);
              if (n && n.room === room.index) { touches = true; break; }
            }
            if (!touches) continue;
            if (c.tile === 'stone_wall') laid++; else raw++;
          }
        }
        wallCells += laid;
        if (built) { worked++; if (laid > 0) faced++;
                     else if (missed.length < 4) missed.push(room.place.title); }
        else { dug++; if (laid > 0) rawWalled++; }
      }
    }
    return { worked, faced, dug, rawWalled, wallCells, missed };
  });
  assert(r.wallCells > 100, `only ${r.wallCells} wall cells in twenty worlds`);
  assert(r.faced > r.worked * 0.9,
    `${r.faced} of ${r.worked} built rooms were faced: ${r.missed.join(', ')}`);
  /* A mine is a hole. Its walls are the rock it was hacked out of. */
  assert(r.rawWalled === 0,
    `${r.rawWalled} of ${r.dug} dug-out places were given built walls`);
});

await test('the stonework is mapped ONTO the wall, not pasted across the screen',
  async () => {
    const r = await page.evaluate(() => {
      const out = [];
      window.__test.seed(1);
      const s = Game.state;
      /* Stand in a built room, or there may be no wall in shot to measure. */
      const room = s.world.rooms.find((q) => q.place
        && q.place.tags.indexOf('worked') >= 0);
      for (let q = 0; q < 4; q++) {
        s.cam.quarter = q; s.cam.yaw = s.cam.yawTarget = q * Math.PI / 2;
        if (room) {
          s.cam.fx = room.x + room.w / 2; s.cam.fy = room.y + room.h / 2;
          s.cam.fh = room.elev;
        }
        camRefresh(s);
        const m = window.__test.wallFaceMap();
        if (m) out.push(Object.assign({ turn: q }, m));
      }
      return out;
    });
    assert(r.length === 4, `only ${r.length} of 4 turns found a wall to measure`);
    for (const f of r) {
      /* One tile of texture must be exactly one metre along the wall, and the
         texture's own down-axis must run exactly down the face. If the pattern
         were pasted in screen space these would not line up at any turn, and at
         three of four turns they would be wildly out. */
      const dbx = Math.hypot(f.mappedB.x - f.b.x, f.mappedB.y - f.b.y);
      const ddx = Math.hypot(f.mappedD.x - f.d.x, f.mappedD.y - f.d.y);
      assert(dbx < 0.01,
        `turn ${f.turn}: a metre of stonework lands ${dbx.toFixed(2)}px from the `
        + 'far end of the wall it is on');
      assert(ddx < 0.01,
        `turn ${f.turn}: the courses run ${ddx.toFixed(2)}px off the face's own drop`);
    }
    /* And the map must differ between turns -- if it did not, it would be
       screen-space after all. */
    const same = r.every((f) => Math.abs(f.mappedB.x - r[0].mappedB.x) < 0.01
                             && Math.abs(f.mappedB.y - r[0].mappedB.y) < 0.01);
    assert(!same, 'the stonework lands identically at every camera turn');
  });

await test('every wall carries a material, not just the built ones', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const t = window.__test;
    const s = Game.state;
    for (let i = 0; i < 20; i++) t.frame(60);   /* settle on the camp */

    const shot = () => {
      s.geomDirty = true; s.viewDirty = true;
      Render.build(s); Render.draw(s);
      return Render.bctx.getImageData(0, 0, Render.w, Render.h).data.slice();
    };
    /* Which tiles in shot are blocks, and how many of each were drawn. */
    const blocks = {};
    const solid = Render.consumed.kinds;
    for (const k in solid) if (TILE(k).footing === 'block') blocks[k] = solid[k];

    const on = t.mappedWalls(true);
    const mapped = shot();
    const kindsOn = t.fillKinds();
    t.mappedWalls(false);
    const flat = shot();
    const kindsOff = t.fillKinds();
    t.mappedWalls(true);
    /* And the whole picture with the blocks' own material taken away, which is
       what it would look like if a wall had none at all. */
    const was = {};
    for (const k in blocks) { was[k] = TILE(k).pattern; window.__test.data.tiles[k].pattern = ''; }
    Render.patCache = {};
    const bare = shot();
    for (const k in was) window.__test.data.tiles[k].pattern = was[k];
    Render.patCache = {};

    let differ = 0;
    for (let i = 0; i < mapped.length; i += 4) {
      if (mapped[i] !== flat[i] || mapped[i + 1] !== flat[i + 1]
        || mapped[i + 2] !== flat[i + 2]) differ++;
    }
    let barePx = 0;
    for (let i = 0; i < mapped.length; i += 4) {
      if (mapped[i] !== bare[i] || mapped[i + 1] !== bare[i + 1]
        || mapped[i + 2] !== bare[i + 2]) barePx++;
    }
    return { on, kindsOn, kindsOff, differ, barePx, blocks,
             pixels: Render.w * Render.h };
  });

  assert(r.on === true, 'the eyes are not open');
  /* The wall sides are the difference: every block side the frame paints takes
     one more patterned fill with the walls done the new way than the old. */
  assert(r.kindsOn.walls > 50,
    `only ${r.kindsOn.walls} block sides in the picture -- nothing to test`);
  /* Every material fill in the picture is on something that wears one, and there
     is exactly one of each: a square of ground with a material on top, a wall's
     face, and the wall's own band where the material runs on up into the fade.
     The assertion that used to stand here (`pattern === cells + walls`) was a
     caption about the look of v0.24.0 and stopped being true twice over -- a
     block's top was a LID wearing the material until v0.37.0 made it rock, so
     one pattern per block went away (`body` counts them), and since v0.37.0 the
     material reaches the screen once more per wall side, in the band (`banded`).
     A caption is not a measurement, so this one is read off the frame.

     THREE THINGS WEAR A WALL'S MATERIAL NOW, not two: the two faces, the band
     above each of them, and the strip of bare rock the framed edge shows where
     the block behind is too low to cover it (`backs`, painted through the same
     `Render.wall` door as the faces since v0.42.0). The strips are why this
     identity read 1019 against 949 and failed: the count of patterned fills was
     right and the sentence beside it was out of date.

     Since v0.45.0 the third term is normally ZERO, because the strips are
     painted only where the cut-away opens a gap and this test paints the game as
     it ships. It stays in the identity rather than being dropped, so the sentence
     goes on being true of both looks -- `backs` 0 here is a measurement of the
     shipped look and not a term nothing reaches (rule: a builder with no
     consumer, lesson 3). The v0.45.0 test above is the one that makes it a real
     term, by painting the cut-away and requiring the strips there. */
  const k = r.kindsOn;
  assert(k.ground === k.cells - k.body - k.capsOff,
    `${k.ground} material fills on the ground against ${k.cells} squares drawn, `
    + `${k.body} of them painting the rock flat on top and ${k.capsOff} with `
    + 'nothing on top at all');
  assert(k.wall === k.walls + k.banded + k.backs,
    `${k.wall} material fills on walls against ${k.walls} painted wall sides, `
    + `${k.banded} of them carrying the material on up into the faded band and `
    + `${k.backs} strips of bare rock along a wall's far edge`);

  /* The old way, which is what `mappedWalls(false)` paints: no material on a wall
     at all, so every side fades through its own colour instead and the textured
     fills are the ground squares and nothing else. That arm is the control and it
     can fail -- it fails if a wall's material comes back by some other route. */
  assert(r.kindsOff.wall === 0,
    `${r.kindsOff.wall} material fills were on a wall with the wall's material `
    + 'switched off -- the old way was not the old way');
  assert(r.kindsOff.pattern === r.kindsOff.ground
         && r.kindsOff.ground <= r.kindsOff.cells,
    `${r.kindsOff.pattern} textured fills, ${r.kindsOff.ground} of them on the `
    + `ground, against ${r.kindsOff.cells} ground squares drawn, with the walls `
    + 'switched off -- the old way was not the old way');
  assert(r.kindsOff.band > 0,
    'not one wall side faded through its own colour with the material switched '
    + 'off, so the flat band this look is the fallback for has gone');
  assert(Object.keys(r.blocks).length > 0, 'no block in shot at all');

  /* And it reaches the screen: taking the blocks' material away repaints a lot
     of the picture, which it could not do if the sides were flat colour. */
  assert(r.barePx > r.pixels * 0.05,
    `taking the material off ${JSON.stringify(r.blocks)} changed only `
    + `${r.barePx} of ${r.pixels} pixels, so the walls were barely on the screen`);
  assert(r.differ > 1000,
    `doing the walls the old way changed only ${r.differ} pixels -- the flat `
    + 'picture and the mapped one are the same');
});

await test('the masonry actually reaches the screen', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const s = Game.state;
    /* Point the camera at a built room so its walls are in shot. */
    const room = s.world.rooms.find((q) => q.place
      && q.place.tags.indexOf('worked') >= 0);
    if (!room) return { found: false };
    s.cam.fx = room.x + room.w / 2; s.cam.fy = room.y + room.h / 2;
    s.cam.fh = room.elev; camRefresh(s);
    const shot = () => {
      s.geomDirty = true; s.viewDirty = true;
      Render.build(s); Render.draw(s);
      return Render.bctx.getImageData(0, 0, Render.w, Render.h).data.slice();
    };
    const laid = shot();
    window.__test.data.tiles.stone_wall.pattern = '';      /* take the stones off */
    Render.patCache = {};
    const plain = shot();
    window.__test.data.tiles.stone_wall.pattern = 'masonry';
    Render.patCache = {};
    let differ = 0, lit = 0;
    for (let i = 0; i < laid.length; i += 4) {
      if (laid[i] > 18 || laid[i + 1] > 18 || laid[i + 2] > 22) lit++;
      if (laid[i] !== plain[i] || laid[i + 1] !== plain[i + 1]
        || laid[i + 2] !== plain[i + 2]) differ++;
    }
    return { found: true, differ, lit, room: room.place.title };
  });
  assert(r.found, 'no built room to look at');
  assert(r.differ > 200,
    `taking the stonework off changed only ${r.differ} pixels, so it was never `
    + 'on the screen to begin with');
});

await test('the ground\'s material lies ON the ground, not across the screen',
  async () => {
    const r = await page.evaluate(() => {
      window.__test.seed(1);
      const t = window.__test;
      const s = Game.state;
      const turns = [], misses = [];
      for (let q = 0; q < 4; q++) {
        s.cam.quarter = q; s.cam.yaw = s.cam.yawTarget = q * Math.PI / 2;
        camRefresh(s);
        const m = t.groundFaceMap({ footing: 'walk', slope: SLOPE_FLAT });
        if (m) turns.push({ turn: q, m: m });
        else misses.push(`turn ${q}: ${t.mapMiss}`);
      }
      s.cam.quarter = 0; s.cam.yaw = s.cam.yawTarget = 0;
      camRefresh(s);
      /* The same square of floor painted the old way, for the size of the
         difference: pasted flat across the screen. */
      t.mappedGround(false);
      const flat = t.groundFaceMap({ footing: 'walk', slope: SLOPE_FLAT });
      t.mappedGround(true);
      return { turns: turns, flat: flat, ships: t.mappedGround(), misses: misses };
    });
    assert(r.ships, 'the game paints the ground flat across the screen');
    assert(r.turns.length === 4,
      `only ${r.turns.length} of 4 turns found a floor to measure -- `
      + r.misses.join('; '));
    for (const f of r.turns) {
      const m = f.m;
      /* One tile of material must be exactly one metre of floor -- along the
         floor's own two edges, so the joints run with the floor. Read as a
         vector: how far a metre of material went, against how long a metre of
         that floor really is. */
      const dbx = Math.hypot(m.mappedB.x - m.b.x, m.mappedB.y - m.b.y);
      const ddx = Math.hypot(m.mappedD.x - m.d.x, m.mappedD.y - m.d.y);
      assert(m.onGround,
        `turn ${f.turn}: the floor's material (${m.tile}) was not laid in the `
        + 'floor\'s own plane');
      assert(dbx < 0.01,
        `turn ${f.turn}: a metre of ${m.tile} lands ${dbx.toFixed(2)}px from the `
        + 'far edge of the floor it is on');
      assert(ddx < 0.01,
        `turn ${f.turn}: a metre of ${m.tile} lands ${ddx.toFixed(2)}px off the `
        + 'floor\'s other edge');
      const sb = Math.hypot(m.wentB.x, m.wentB.y) / Math.hypot(m.isB.x, m.isB.y);
      const sd = Math.hypot(m.wentD.x, m.wentD.y) / Math.hypot(m.isD.x, m.isD.y);
      assert(Math.abs(sb - 1) < 0.01 && Math.abs(sd - 1) < 0.01,
        `turn ${f.turn}: the material is stretched by ${sb.toFixed(2)} and `
        + `${sd.toFixed(2)} across the floor`);
    }
    /* The material's way across the floor must turn with the view. If it did
       not, it would be stuck to the screen after all. */
    const first = r.turns[0].m;
    const same = r.turns.every((f) => Math.abs(f.m.wentB.x - first.wentB.x) < 0.01
                                 && Math.abs(f.m.wentB.y - first.wentB.y) < 0.01);
    assert(!same, 'the floor\'s material points the same way at every camera turn');
    /* And the way it used to be painted must be plainly a different thing, or
       this test could not tell the difference. Pasted flat, the material's own
       two axes are the screen's: across, and straight down the picture. */
    assert(r.flat, 'no floor to compare against');
    assert(Math.abs(r.flat.wentB.y) < 0.01 && Math.abs(r.flat.wentD.x) < 0.01,
      'painted flat, the material did not run along the screen\'s own axes after all');
    assert(Math.abs(first.wentB.y) > 0.01,
      'the floor\'s own edge is not diagonal, so nothing here would catch a '
      + 'material facing the camera');
  });

await test('a ramp\'s material lies on the ramp itself', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(4);
    const t = window.__test;
    const s = Game.state;
    const turns = [];
    for (let q = 0; q < 4; q++) {
      s.cam.quarter = q; s.cam.yaw = s.cam.yawTarget = q * Math.PI / 2;
      camRefresh(s);
      const m = t.groundFaceMap({ footing: 'ramp' });
      if (m) turns.push({ turn: q, m: m });
    }
    return { turns: turns, flatSlope: SLOPE_FLAT };
  });
  /* A ramp is the one square of ground whose corners are not all at the same
     height, so it is mapped from its own corners rather than from the shared
     plane the flat squares share. That makes it the one that can go wrong on
     its own -- and the corners are the test. */
  assert(r.turns.length === 4,
    `only ${r.turns.length} of 4 turns found a ramp to measure`);
  for (const f of r.turns) {
    const m = f.m;
    const dbx = Math.hypot(m.mappedB.x - m.b.x, m.mappedB.y - m.b.y);
    const ddx = Math.hypot(m.mappedD.x - m.d.x, m.mappedD.y - m.d.y);
    assert(m.slope !== r.flatSlope, `turn ${f.turn}: the ramp is not a ramp`);
    assert(dbx < 0.01 && ddx < 0.01,
      `turn ${f.turn}: a metre of ${m.tile} lands ${dbx.toFixed(2)}px and `
      + `${ddx.toFixed(2)}px from the ramp's own corners`);
  }
});

await test('the ground, mapped, is a different picture from the ground pasted flat',
  async () => {
    const r = await page.evaluate(() => {
      window.__test.seed(1);
      const t = window.__test;
      const s = Game.state;
      const shot = () => {
        /* Fresh patterns each time: a pattern carries the last placement it was
           given, and a guard against laying it twice in one frame, and either
           of those left over would hide the difference this test is looking
           for. */
        Render.patCache = {};
        s.geomDirty = true; s.viewDirty = true;
        Render.build(s); Render.draw(s);
        return Render.bctx.getImageData(0, 0, Render.w, Render.h).data.slice();
      };
      t.mappedGround(true);
      const laid = shot();
      t.mappedGround(false);
      const flat = shot();
      t.mappedGround(true);
      let differ = 0, lit = 0;
      for (let i = 0; i < laid.length; i += 4) {
        if (laid[i] > 18 || laid[i + 1] > 18 || laid[i + 2] > 22) lit++;
        if (laid[i] !== flat[i] || laid[i + 1] !== flat[i + 1]
          || laid[i + 2] !== flat[i + 2]) differ++;
      }
      return { differ: differ, lit: lit, painted: laid.length / 4 };
    });
    assert(r.lit > 0, 'nothing was painted at all');
    assert(r.differ > 5000,
      `mapping the ground changed only ${r.differ} of ${r.painted} pixels, so it `
      + 'barely reached the screen');
  });

/* ---- v0.16.0: materials, and the camp as real geometry ------------------ */

await test('every surface in the labyrinth has a material, and it reaches the screen',
  async () => {
    const r = await page.evaluate(() => {
      window.__test.seed(1);
      const s = Game.state;
      const tiles = window.__test.data.tiles;
      const plain = Object.keys(tiles).filter((k) => !tiles[k].pattern);
      /* Paint a patch of every tile right where the camera is looking, so each
         material is certainly in shot. */
      const ids = Object.keys(tiles);
      const cx = Math.round(s.cam.fx), cy = Math.round(s.cam.fy);
      let n = 0;
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const c = s.world.at(cx + dx, cy + dy);
          if (!c) continue;
          c.tile = ids[n % ids.length]; c.h = 0; c.slope = ''; n++;
        }
      }
      s.lightDirty = true;
      const shot = () => {
        s.geomDirty = true; s.viewDirty = true;
        Render.build(s); Render.draw(s);
        return Render.bctx.getImageData(0, 0, Render.w, Render.h).data.slice();
      };
      const withMat = shot();
      const kept = {};
      for (const k of ids) { kept[k] = tiles[k].pattern; tiles[k].pattern = ''; }
      Render.patCache = {};
      const without = shot();
      for (const k of ids) tiles[k].pattern = kept[k];
      Render.patCache = {};
      let differ = 0;
      for (let i = 0; i < withMat.length; i += 4) {
        if (withMat[i] !== without[i] || withMat[i + 1] !== without[i + 1]
          || withMat[i + 2] !== without[i + 2]) differ++;
      }
      return { plain, differ, materials: [...new Set(Object.values(kept))].filter(Boolean) };
    });
    assert(r.plain.length === 0,
      `these tiles have no material at all: ${r.plain.join(', ')}`);
    assert(r.materials.length >= 6,
      `only ${r.materials.length} distinct materials across the whole tile set`);
    assert(r.differ > 2000,
      `switching every material off changed only ${r.differ} pixels, so they were `
      + 'never on the screen');
  });

await test('the camp is built from real parts, not a box', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 90; i++) window.__test.frame(60);
    const s = Game.state;
    const counts = {};
    for (const id of Object.keys(window.__test.data.structures)) {
      counts[id] = STRUCT_PARTS(id).length;
    }
    /* And what actually reached the buffer for each finished piece. */
    for (const site of s.camp.sites) { site.built = true; site.progress = 100; }
    s.geomDirty = true; s.viewDirty = true;
    const drew = window.__test.redraw();
    const drawn = {};
    for (const it of drew.items) {
      if (it.kind !== 'site' || !it.parts) continue;
      drawn[it.structure] = Math.max(drawn[it.structure] || 0, it.parts.length);
    }
    return { counts, drawn };
  });
  /* Two is not a box: a bedroll really is a mat and a rolled blanket. What
     would be a box is ONE part, and the whole camp being four of them. */
  for (const [id, n] of Object.entries(r.counts)) {
    assert(n >= 2, `"${id}" is made of ${n} part(s) -- that is still a box`);
  }
  const total = Object.values(r.counts).reduce((a, n) => a + n, 0);
  assert(total >= 14,
    `the whole camp is ${total} parts across ${Object.keys(r.counts).length} pieces`);
  const seen = Object.keys(r.drawn);
  assert(seen.length >= 3,
    `only ${seen.length} kinds of camp piece reached the screen`);
  for (const [id, n] of Object.entries(r.drawn)) {
    assert(n >= 2, `"${id}" reached the screen as ${n} part(s)`);
  }
});

await test('a fire only burns once it is finished, and the camp grows as it is built',
  async () => {
    const r = await page.evaluate(() => {
      window.__test.seed(1); window.__test.record(true);
      for (let i = 0; i < 90; i++) window.__test.frame(60);
      const s = Game.state;
      const fire = s.camp.sites.find((q) => q.structure === 'campfire');
      if (!fire) return { found: false };
      const look = () => {
        s.geomDirty = true; s.viewDirty = true;
        const drew = window.__test.redraw();
        const it = drew.items.find((q) => q.kind === 'site'
          && q.x === fire.x && q.y === fire.y);
        return it ? it.parts : [];
      };
      fire.built = false; fire.cleared = true; fire.progress = 40;
      const half = look();
      fire.built = true; fire.progress = 100;
      const done = look();
      /* how tall the thing stands, half-built against finished */
      const height = (built) => {
        fire.built = built; fire.progress = built ? 100 : 40;
        s.geomDirty = true; s.viewDirty = true;
        Render.build(s);
        const want = Render.siteBase(s) + s.camp.sites.indexOf(fire);
        const q = Render.batch.find((z) => z.i === want);
        return q ? q.maxY - q.minY : 0;
      };
      return { found: true, half, done,
               halfTall: height(false), doneTall: height(true) };
    });
    assert(r.found, 'no campfire in the camp');
    assert(r.done.indexOf('fire_flame') >= 0,
      'a finished fire is not burning: ' + r.done.join(', '));
    assert(r.half.indexOf('fire_flame') < 0,
      'a half-built fire is already alight: ' + r.half.join(', '));
    assert(r.half.length > 0, 'a half-built fire is nothing at all');
    assert(r.doneTall > r.halfTall,
      `a finished fire stands ${r.doneTall.toFixed(1)}px and a half-built one `
      + `${r.halfTall.toFixed(1)}px -- the camp does not visibly grow`);
  });

/* ---- ground a crawler is walking over -------------------------------------
 *
 * Part way through a step a crawler's feet are already inside the square ahead
 * and already outside the square behind, so ordering them by their feet alone
 * hands the step to whichever of those two squares is the nearer one. That
 * square then paints AFTER them and eats their legs -- the bug where a crawler
 * sinks into the ground they are walking on. v0.19.0 makes a walking crawler
 * paint after the whole of the ground their step covers: the square they left,
 * the square they are arriving at, and the feet in between. Rock genuinely
 * standing in front is nearer than all three and still covers them.
 *
 * actorOwnPixels() is the ruler: a crawler's silhouette counted from four
 * pictures of one instant, and how many of those pixels the picture actually
 * shows. A rock in front hides part of a crawler and is meant to, so a bare
 * number proves nothing and a step is judged only against its own two ends. A
 * step whose ends are BOTH clean -- nothing painted over the crawler while they
 * stood on either square -- must not lose pixels in between. That is why the
 * seeds below are a handful of them: a crawler with a boulder at their shoulder
 * is skipped, not measured. The other half of the test is the old way of
 * painting, which the same ruler measures by flipping Render.stepGround off; if
 * that stops hiding anything, the ruler has gone blind and the test says so
 * rather than passing.
 *
 * Measured on seeds 1-8: 161 steps taken, 41 of them clean, worst 208 (and 40
 * of the 41 over 20) pixels lost with the old way against 3 with the new, so all
 * three bounds below are load-bearing rather than decorative. */
await test('a crawler walking is never painted under the ground they walk on (seeds 1-8)', async () => {
  const r = await page.evaluate((moments) => {
    const t = window.__test, out = { shipped: null, ended: [], steps: [] };
    const wasZoom = t.buffer().zoom;
    t.pause();
    out.shipped = t.stepGround();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      t.seed(seed);
      t.zoom(4);
      t.pause();
      const actors = t.actors();
      for (let i = 0; i < actors.length; i++) {
        const fx = Math.floor(actors[i].gx), fy = Math.floor(actors[i].gy);
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          /* How many of them the picture leaves out, walking that one step by
             the given rule, that far into it. Null when the game would not
             take the step, so no test measures a step that cannot happen. */
          const look = function (rule, tt) {
            t.stepGround(rule);
            if (!t.midStep(i, fx, fy, fx + d[0], fy + d[1], tt).legal) return null;
            const p = t.actorOwnPixels(i);
            return p ? p.hidden : null;
          };
          const stand0 = look(true, 0), stand1 = look(true, 1);
          if (stand0 === null || stand1 === null) continue;
          out.ended.push(Math.max(stand0, stand1));
          if (Math.max(stand0, stand1) > 1) continue;    /* rock in the way */
          let worstOn = 0, worstOff = 0;
          for (const tt of moments) {
            const on = look(true, tt), off = look(false, tt);
            if (on === null || off === null) continue;
            worstOn = Math.max(worstOn, on);
            worstOff = Math.max(worstOff, off);
          }
          out.steps.push({ seed: seed, i: i, at: fx + ',' + fy, step: d.join(','),
                           on: worstOn, off: worstOff });
        }
      }
    }
    t.stepGround(true);
    t.zoom(wasZoom);
    return out;
  }, [0.15, 0.3, 0.5, 0.7, 0.85]);

  assert(r.shipped === true,
    'the shipped game sorts a walking crawler by where their feet are and nothing else, '
    + 'so the ground can paint over their legs');
  const clean = r.steps.length;
  assert(clean >= 25,
    `only ${clean} of the ${r.ended.length} steps taken had nothing at all painted over the crawler `
    + 'at either end, which is too few to judge the ground by');
  const sunk = r.steps.filter((q) => q.on > 8);
  assert(sunk.length === 0,
    `${sunk.length} of ${clean} steps walked with the shipping rule swallowed part of the crawler: `
    + sunk.slice(0, 4).map((q) => `seed ${q.seed} crawler ${q.i} at ${q.at} stepping ${q.step} `
      + `lost ${q.on}px`).join('; '));
  const blind = r.steps.filter((q) => q.off > 20).length;
  assert(blind >= clean * 3 / 4,
    `painting a walking crawler by their feet alone swallowed part of them in only ${blind} `
    + `of ${clean} clean steps, so this ruler can no longer tell the two ways apart`);
});

/* ---- v0.21.0: the world lays its own ground down as the view travels ---- */

await test('the game opens holding one piece of ground and nothing more (v0.21.0)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(4);
    return { world: window.__test.world(), books: window.__test.windowBooks() };
  });
  assert(r.world.pieces === 1,
    `the world opened holding ${r.world.pieces} pieces, and making ground costs about `
    + '1.4ms a piece, so booting should make exactly the one the camp stands on');
  assert(r.books.reach > 0 && r.books.reach < r.world.n,
    `the picture can reach ${r.books.reach} squares, so the window wants more than one `
    + 'piece and this test is measuring nothing');
});

await test('ground appears as the view travels, and is never missing underfoot (v0.21.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, n = t.cfg.chunkTiles;
    t.seed(2);
    t.frame(1);
    const start = t.world(), from = t.camera();
    let holes = 0;
    for (let i = 0; i < 60; i++) {
      t.pan(48, 32);
      const s = t.state;
      if (!s.world.at(Math.floor(s.cam.fx), Math.floor(s.cam.fy))) holes++;
    }
    const far = t.world(), at = t.camera();
    t.frame(4);                                  /* let the window catch up */
    return { start, far, holes, n, books: t.windowBooks(),
             moved: Math.hypot(at.fx - from.fx, at.fy - from.fy) };
  });
  assert(r.moved > r.n,
    `the view travelled only ${Math.round(r.moved)} squares, less than one piece `
    + `(${r.n}), so it never needed new ground`);
  assert(r.far.pieces > r.start.pieces,
    `the world held ${r.start.pieces} piece(s) and still holds ${r.far.pieces} after `
    + `travelling ${Math.round(r.moved)} squares`);
  assert(r.holes === 0,
    `the view was over ground that had never been made ${r.holes} times`);
  assert(r.far.cells === r.far.pieces * r.n * r.n,
    `${r.far.cells} squares do not add up to ${r.far.pieces} whole pieces`);
  assert(r.books.wanted === 0,
    `${r.books.wanted} pieces the window wanted were never made`);
});

await test('the same ground asked for later comes out the same (rule 5, v0.21.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test;
    t.seed(3);
    for (let i = 0; i < 30; i++) t.frame(1);     /* the window fills its own way */
    t.ensure(200, 120);                          /* then this piece is asked for */
    const late = t.pieceSignature(3, 2);
    t.seed(3);
    t.ensure(200, 120);                          /* the same piece, asked for FIRST */
    const early = t.pieceSignature(3, 2);
    return { late, early };
  });
  assert(r.early && r.early.length > 0, 'the piece was not there even when asked for first');
  assert(r.late && r.late === r.early,
    'the piece made at the edge of the window differed from the one made at the start');
  assert(r.late.split(';').length - 1 === 56 * 56,
    `the piece is ${r.late.split(';').length - 1} squares, not a whole piece`);
});

await test('the window holds only ground somebody is near (v0.21.0)', async () => {
  const r = await page.evaluate(() => {
    const t = window.__test, n = t.cfg.chunkTiles;
    const reach = t.windowBooks().reach, ring = t.cfg.liveRing;
    t.seed(6);
    t.frame(1);
    for (let i = 0; i < 40; i++) { t.pan(40, 26); t.frame(1); }
    const s = t.state;
    const near = (x, y, box) => Math.hypot(x - s.cam.fx, y - s.cam.fy) <= box;
    const slack = n / Math.SQRT2;                /* the far corner of a piece */
    let loose = 0, worst = 0;
    const ask = (x, y, box) => {
      const cx = (Math.floor(x / n) + 0.5) * n, cy = (Math.floor(y / n) + 0.5) * n;
      return Math.hypot(cx - s.cam.fx, cy - s.cam.fy) <= box;
    };
    for (const p of s.world.live) {
      const cx = (p.cx + 0.5) * n, cy = (p.cy + 0.5) * n;
      let allowed = ask(s.cam.fx, s.cam.fy, reach + ring * n + slack);
      for (const a of s.actors) if (ask(a.x, a.y, ring * n + slack)) allowed = true;
      for (const st of s.camp.sites) if (ask(st.x, st.y, ring * n + slack)) allowed = true;
      if (!allowed) { loose++; }
    }
    return { loose, pieces: s.world.live.length, near: near, n };
  });
  assert(r.pieces > 2, `only ${r.pieces} pieces were held, which is too few to judge`);
  assert(r.loose === 0,
    `${r.loose} of ${r.pieces} pieces were ground nobody was near -- the window is `
    + 'making ground further out than the ring it was asked for');
});

await test('no square of ground stands higher than the tallest the pieces may build (v0.21.0)', async () => {
  const r = await page.evaluate(() => {
    let most = -Infinity, hi = -Infinity, seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      window.__test.seed(seed);
      /* A fresh match opens holding only the piece the camp stands in, so look
         at several: the test is about pieces made side by side, and one piece
         on its own cannot show a seam. */
      window.__test.frame(4);
      for (const c of window.__test.state.world.cells) {
        seen++;
        if (c.h > most) most = c.h;
        if (TILE(c.tile).footing !== 'block' && c.h > hi) hi = c.h;
      }
    }
    const t = window.__test.cfg;
    return { most, hi, seen, tallest: t.maxElev + t.rockHeight,
             cliff: t.maxElev, rock: t.rockHeight };
  });
  assert(r.seen > 20 * 3136, `only ${r.seen} squares were looked at`);
  /* The bound the picture works out how far a piece can reach from -- and
     whether a piece is on the screen at all -- is built from max_elevation +
     rock_height. A square above it would leave a piece culled before it was
     drawn, which is a hole in the world, so the bound has to hold. */
  assert(r.most <= r.tallest,
    `the tallest square stood ${r.most} metres up, and the picture works out how far a `
    + `piece can reach on the assumption that ${r.tallest} is the most it can be`);
  /* And the ground itself is never above the cliff the world is built to. The
     rock is brought down to suit whatever floor it stands beside (v0.35.0), so
     the tallest rock is exactly two metres above the highest floor -- which is
     also the check that nothing walked the FLOORS up instead. */
  assert(r.hi <= r.cliff,
    `a square a crawler can stand on was ${r.hi} metres up, and the ground is not `
    + `meant to go higher than ${r.cliff}`);
  assert(r.most === Math.min(r.tallest, r.hi + r.rock),
    `the tallest rock stood ${r.most} m beside ground ${r.hi} m up, which calls for `
    + `${Math.min(r.tallest, r.hi + r.rock)} m`);
});

await test('bringing the rock down leaves every square a crawler can use alone (v0.35.0)', async () => {
  const r = await page.evaluate(() => window.__test.rockAudit([1, 7, 23]));
  assert(r.worlds === 2 * r.cases, `${r.worlds} worlds were built, not ${2 * r.cases}`);
  assert(r.pieces > 6 * r.cases, `only ${r.pieces} pieces were looked at`);
  assert(r.ground > 2000 * r.cases,
    `only ${r.ground} squares of ground were compared, which is too few to judge`);
  assert(r.moved === 0 && r.retiled === 0 && r.rerolled === 0 && r.reproomed === 0,
    `${r.moved} squares of ground moved, ${r.retiled} changed tile, `
    + `${r.reproomed} changed room and ${r.rerolled} changed the way they lean:\n`
    + '         ' + JSON.stringify(r.worst));
  assert(r.lowered > 1000,
    `only ${r.lowered} columns of rock came down, so nothing really happened`);
  /* The two bounds that say the change is the change that was wanted, measured
     against the same build with it switched off (lesson 21): the rock used to
     stand at the plateau almost everywhere, and now it stands two metres above
     whatever floor is nearest, so the plateau is the exception rather than the
     rule. */
  assert((r.topOld[7] || 0) > r.rockOld * 0.9,
    `only ${r.topOld[7] || 0} of ${r.rockOld} columns of rock were at the plateau `
    + 'with the change switched off, so the two runs are not the two ways of '
    + 'building the same world and this proves nothing');
  assert((r.topNew[7] || 0) < r.rockNew / 4,
    `${r.topNew[7] || 0} of ${r.rockNew} columns of rock are still up at the plateau`);
});

await test('the page raised no errors while all that happened', async () => {
  assert(errors.length === 0, errors.join(' | '));
});

await browser.close();

/* ---- 4. turning a dial in the spreadsheet really does change the game ----- */
await test('a number changed in the spreadsheet reaches the screen (rule 9)', async () => {
  if (ONLY.length) return;
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
/* A quick word that matches NO test is a check that has quietly gone missing --
   a ruler that reads short. It is reported and it fails, because a short check
   whose size nobody notices is worth less than the minutes it saves. */
const missing = QUICK
  ? QUICK_WORDS.filter((w) => !results.some((r) => r.name.includes(w))) : [];
if (PICKED) {
  console.log(`\n${results.length - failed}/${results.length} passed -- TESTS WERE PICKED OUT BY `
    + `NAME (${QUICK ? '--quick' : '--only'}${ONLY.length ? ' --only=' + ONLY.join(',') : ''}), `
    + 'so this is not a full run\n');
} else {
  console.log(`\n${results.length - failed}/${results.length} passed\n`);
}
if (missing.length) {
  console.log(`QUICK CHECK: ${missing.length} of ${QUICK_WORDS.length} parts of the short check `
    + `matched no test -- ${missing.join(', ')}\n`);
}
process.exit(failed || missing.length ? 1 : 0);
