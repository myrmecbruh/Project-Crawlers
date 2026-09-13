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


await test('crawlers reach the screen, standing on the ground (rule 4)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
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
    /* Find a crawler who is actually in view, then take their hat off and on. */
    let who = -1;
    const drew0 = window.__test.frame(1);
    for (const it of drew0.items) if (it.kind === 'actor') { who = it.i; break; }
    const idx = who - window.__test.world().cells;

    const n = window.__test.actors().length;
    for (let i = 0; i < n; i++) window.__test.wearHat(i, false);
    const bare = window.__test.frame(1);
    const bareParts = bare.items.find((i) => i.i === who).parts;

    window.__test.wearHat(idx, true);
    const hatted = window.__test.frame(1);
    const hatParts = hatted.items.find((i) => i.i === who).parts;

    return { bareParts, hatParts, bareWorn: bare.worn, hatWorn: hatted.worn,
             described: window.__test.describe(who) };
  });
  assert(!r.bareParts.includes('hat'), 'a bare head was drawn wearing a hat');
  assert(r.hatParts.includes('hat'), 'a crawler wearing a hat was drawn without one');
  assert(r.hatWorn.includes('hat'), 'the hat never reached the canvas');
  assert(!r.bareWorn.includes('hat'), 'a hat reached the canvas with nobody wearing it');
  assert(r.described.worn.includes('Hat'), 'the inspector does not list the hat');
});

await test('a figure is painted from the ground up, so nothing worn is buried', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const n = window.__test.actors().length;
    for (let i = 0; i < n; i++) window.__test.wearHat(i, true);
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
    window.__test.seed(1); window.__test.record(true);
    const drew = window.__test.frame(1);
    const who = drew.items.find((i) => i.kind === 'actor').i;
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
    window.__test.frame(400);                 /* let them get some practice in */
    const drew = window.__test.frame(1);
    let target = null;
    for (const it of drew.items) {
      if (it.kind === 'actor' && it.sx > 8 && it.sx < window.__test.cfg.lowW - 8
        && it.sy > 8 && it.sy < window.__test.cfg.lowH - 8) { target = it; break; }
    }
    const hovered = window.__test.point(target.sx, target.sy);
    return { target, hovered, described: window.__test.describe(hovered),
             tooltip: window.__test.tooltipOnScreen(),
             consumed: window.__test.consumed() };
  });
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
  assert(r.described.skills.length > 0, 'after 400 ticks nobody has practised anything');
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
  assert(tried === 6, `only ${tried} of 6 crawlers ever tried to move`);
  assert(moved > 0, 'every crawler failed every single attempt to move');
  assert(r.actors.some((a) => a.stumbles > 0),
    'nobody ever stumbled, so failure is not reachable in a real match');
  assert(r.actors.every((a) => a.skills.clambering > 0),
    'moving about taught nobody anything');
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
