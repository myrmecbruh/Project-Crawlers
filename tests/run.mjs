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
  assert(r.world.cells === 28 * 28, `world is ${r.world.cells} cells`);
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
      if (c.tile !== 'stone_ramp') continue;
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
      if (it.sx > 8 && it.sx < window.__test.cfg.lowW - 8
        && it.sy > 8 && it.sy < window.__test.cfg.lowH - 8) { target = it; break; }
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
    window.__test.point(2, 2);          /* top-left corner: empty sky */
    const a = { hover: window.__test.state.hover, tip: window.__test.tooltipOnScreen() };
    window.__test.unpoint();
    return { a, b: window.__test.tooltipOnScreen(), outlined: window.__test.consumed().outlined };
  });
  assert(r.a.hover === -1, `found block ${r.a.hover} in empty sky`);
  assert(r.a.tip === null, 'the tooltip stayed up over empty sky');
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
      if (it.sx < 40 || it.sx > window.__test.cfg.lowW - 40) continue;
      if (it.sy < 40 || it.sy > window.__test.cfg.lowH - 40) continue;
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
    const at = { x: window.__test.cfg.lowW / 2, y: window.__test.cfg.lowH / 2 };
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

await test('zooming keeps whatever is under the pointer under the pointer', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.frame(1);
    const at = { x: 200, y: 150 };
    const before = window.__test.point(at.x, at.y);
    window.__test.state.cam.zoom;
    const z = (function () {
      const s = window.__test.state;
      setZoom(s, s.cam.zoom + 1, at.x, at.y);
      window.__test.pan(0, 0);
      return s.cam.zoom;
    })();
    const after = window.__test.point(at.x, at.y);
    return { before, after, z, max: window.__test.cfg.zoomMax };
  });
  assert(r.z === 2, `zoom went to ${r.z}`);
  assert(r.before === r.after,
    `block ${r.before} slid out from under the pointer, now ${r.after}`);
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
      sheet, 'knobs', 'render.low_width', 'value', '320'], { encoding: 'utf8' });
    const log = execFileSync('python3', [path.join(ROOT, 'build.py'),
      '--sheet', sheet, '--out', out], { encoding: 'utf8' });
    assert(/render\.low_width\s+480 -> 320/.test(log),
      'the build did not print a receipt for the change:\n' + log);

    const b2 = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
    const p2 = await b2.newPage();
    await p2.goto(pathToFileURL(out).href);
    await p2.waitForFunction(() => window.__test && window.__test.state);
    const r = await p2.evaluate(() => {
      window.__test.pause();
      return { cfg: window.__test.cfg.lowW, drew: window.__test.frame(1).bufW };
    });
    await b2.close();
    assert(r.cfg === 320, `the game read ${r.cfg}, the sheet said 320`);
    assert(r.drew === 320, `the picture was drawn ${r.drew} wide, the sheet said 320`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

console.log('');
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : '\n         ' + r.why}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
