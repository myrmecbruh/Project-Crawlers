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
    /* Move the arm and the hand must move with it. */
    const a = window.__test.state.actors[found.index];
    const was = window.__test.pose(found.index).bones.hand_r.slice();
    a.doing = a.doing === 'walking' ? 'building' : 'walking';
    window.__test.state.geomDirty = true;
    const now = window.__test.pose(found.index).bones.hand_r.slice();
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
    `boots took clambering from ${r.bare.climb.ability} to ${r.booted.ability}`);

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
      /* pick something and check we get it back */
      let hit = -1, want = -1;
      for (let k = drew.items.length - 1; k >= 0; k--) {
        const it = drew.items[k];
        if (it.kind !== 'cell') continue;
        if (it.sx < 20 || it.sx > window.__test.buffer().w - 20) continue;
        if (it.sy < 20 || it.sy > window.__test.buffer().h - 20) continue;
        want = it.i; hit = window.__test.point(it.sx, it.sy); break;
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
    assert(q.cutaway > 0, `at quarter ${q.q} no wall faded, so rooms hide again`);
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
    const sig = () => window.__test.state.world.cells.map((c) => c.h + c.tile).join('|');
    const before = { world: sig(), camp: window.__test.camp().summary, tick: window.__test.state.tick };
    window.__test.rotate(1); window.__test.tilt(true);
    window.__test.rotate(2); window.__test.tilt(false);
    window.__test.rotate(1);
    return { before, after: { world: sig(), camp: window.__test.camp().summary,
                              tick: window.__test.state.tick } };
  });
  assert(r.before.world === r.after.world, 'turning the view changed the labyrinth');
  assert(r.before.camp.progress === r.after.camp.progress, 'turning the view built the camp');
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

await test('the grain actually reaches the screen (and can be switched off)', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    for (let i = 0; i < 20; i++) window.__test.frame(60);
    const rows = [Math.round(Render.h * 0.3), Math.round(Render.h * 0.5),
                  Math.round(Render.h * 0.7)];

    const on = window.__test.setTexture(window.__test.data.knobs['texture.strength']);
    window.__test.redraw();
    const textured = rows.map((y) => window.__test.colourSpread(y));

    const off = window.__test.setTexture(0);
    window.__test.redraw();
    const flat = rows.map((y) => window.__test.colourSpread(y));

    window.__test.setTexture(window.__test.data.knobs['texture.strength']);
    return { on, off, textured, flat,
             floorPx: window.__test.cfg.floorPx, finePx: window.__test.cfg.finePx };
  });
  assert(r.on.on === true && r.off.on === false, 'the texture switch does nothing');
  assert(r.on.coarse === r.floorPx && r.on.fine === r.finePx,
    `grain tiles came out ${r.on.coarse} and ${r.on.fine}, the sheet says ${r.floorPx} and ${r.finePx}`);
  assert(r.on.fine < r.on.coarse,
    'the grain on crawlers is not finer than the grain on the floor');
  for (let i = 0; i < r.textured.length; i++) {
    assert(r.textured[i] > r.flat[i],
      `row ${i}: ${r.textured[i]} colours with grain against ${r.flat[i]} without -- the grain never reached the screen`);
  }
  assert(r.textured.reduce((a, b) => a + b) > r.flat.reduce((a, b) => a + b) * 1.5,
    'the grain is there but barely changes anything');
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
    return { bare, candle, candleReach, torchReach,
             gear: window.__test.data.gear };
  });
  assert(r.bare < 0.2, `a crawler with nothing stood in ${r.bare} light`);
  assert(r.candle > 0.9, `a lit candle gave their own square only ${r.candle}`);
  assert(r.torchReach.r > r.candleReach.r,
    `a torch reaches ${r.torchReach.r}m and a candle ${r.candleReach.r}m`);
  assert(r.gear.torch.light > 0 && r.gear.candle.light > 0 && r.gear.lantern.light > 0,
    'one of the three lights throws none');
  assert(r.gear.jerkin.light === 0, 'a leather jerkin is giving off light');
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

await test('the pick pass is painted only when something reads it', async () => {
  const n = await page.evaluate(() => new Promise((res) => {
    const s = Game.state;
    s.selected = Render.actorBase(s) + 0;      /* follow someone, so the view */
    s.cam.follow = 0;                          /* moves every single frame    */
    s.pointer.over = false;                    /* but nobody is pointing      */
    let painted = 0;
    const orig = Render.drawPick.bind(Render);
    Render.drawPick = (st) => { painted++; return orig(st); };
    setTimeout(() => { Render.drawPick = orig; res(painted); }, 1000);
  }));
  assert(n <= 2,
    `the scene was painted a second time into the pick buffer ${n} times in a `
    + 'second with no pointer on the canvas');
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
      const idx = room.y * s.world.n + room.x;   /* a square of that room */
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
