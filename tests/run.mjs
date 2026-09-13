/* Headless tests against the built file -- the real artifact, not the sources.
 *
 *     node tests/run.mjs
 *
 * Every test drives the game through window.__test and asserts on what
 * REACHED THE CANVAS. A builder with no consumer looks exactly like working
 * code, so "the array was filled" is never the assertion.
 */
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
let chromium;
for (const spec of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try { ({ chromium } = require(spec)); break; } catch { /* try the next one */ }
}
if (!chromium) {
  console.error('playwright not found. Install it, or run the session start-up script.');
  process.exit(1);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = readFileSync(path.join(ROOT, 'src/js/00-version.js'), 'utf8')
  .match(/^const VERSION = '([^']+)';/m)[1];

const built = path.join(ROOT, 'dist', `crawlers-v${VERSION}.html`);
if (!readdirSync(path.join(ROOT, 'dist')).includes(`crawlers-v${VERSION}.html`)) {
  console.error(`dist/crawlers-v${VERSION}.html is missing. Run: python3 build.py`);
  process.exit(1);
}

const results = [];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

async function test(name, fn) {
  try { await fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, why: e.message }); }
}
function assert(cond, why) { if (!cond) throw new Error(why); }

const browser = await chromium.launch({
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

await page.goto(pathToFileURL(built).href);
await page.waitForFunction(() => window.__test && window.__test.state);
await page.evaluate(() => window.__test.pause());

/* A broken ruler is worse than no ruler: the harness checks itself, every run,
   before a single game assertion is trusted. */
const self = await page.evaluate(() => window.__test.selfCheck());
console.log(`\nharness self-check (v${self.version}) ${self.ok ? 'PASS' : 'FAIL'}`);
for (const c of self.checks) console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${c.name} -- ${c.detail}`);
if (!self.ok) { await browser.close(); process.exit(1); }

await test('the built file reports the version it was built from', async () => {
  const shown = await page.textContent('#version');
  assert(shown === `v${VERSION}`, `screen says ${shown}, source says v${VERSION}`);
});

await test('the mover reaches the canvas, not just the batch', async () => {
  const drew = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    return window.__test.frame(1);
  });
  assert(drew, 'nothing was drawn at all');
  assert(drew.kinds.mover === 1, `drew ${JSON.stringify(drew.kinds)}`);
  const item = drew.items.find((i) => i.kind === 'mover');
  assert(item, 'the mover was built but never reached the canvas');
});

await test('holding right moves the mover right, and the canvas shows it', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1); window.__test.record(true);
    const before = window.__test.frame(1).items.find((i) => i.kind === 'mover').x;
    window.__test.press('right', true);
    const after = window.__test.frame(60).items.find((i) => i.kind === 'mover').x;
    window.__test.press('right', false);
    return { before, after, mover: window.__test.mover().x };
  });
  assert(r.after > r.before + 10, `x went ${r.before.toFixed(1)} -> ${r.after.toFixed(1)}`);
  assert(near(r.after, r.mover, 1e-6), 'the drawn position disagrees with the simulation');
});

await test('a drag steers the mover toward the touch point', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    const y0 = window.__test.mover().y;
    window.__test.aim(480, 560);
    window.__test.frame(60);
    window.__test.release();
    return { y0, y1: window.__test.mover().y };
  });
  assert(r.y1 > r.y0 + 10, `y went ${r.y0.toFixed(1)} -> ${r.y1.toFixed(1)}`);
});

await test('same seed and same inputs give the same match (seed 777)', async () => {
  const r = await page.evaluate(() => {
    const run = () => {
      window.__test.seed(777);
      window.__test.press('right', true); window.__test.press('down', true);
      window.__test.frame(120);
      window.__test.press('right', false); window.__test.press('down', false);
      return window.__test.mover();
    };
    return [run(), run()];
  });
  assert(r[0].x === r[1].x && r[0].y === r[1].y,
    `x ${r[0].x} vs ${r[1].x}, y ${r[0].y} vs ${r[1].y}`);
});

await test('the field has edges and the mover stays inside them', async () => {
  const r = await page.evaluate(() => {
    window.__test.seed(1);
    window.__test.press('right', true); window.__test.press('up', true);
    window.__test.frame(600);
    window.__test.press('right', false); window.__test.press('up', false);
    const m = window.__test.mover();
    return { m, field: window.__test.field };
  });
  assert(r.m.x <= r.field.w - r.m.r + 0.001 && r.m.y >= r.m.r - 0.001,
    `mover left the field at ${r.m.x.toFixed(1)},${r.m.y.toFixed(1)}`);
});

await test('the page raised no errors while all that happened', async () => {
  assert(consoleErrors.length === 0, consoleErrors.join(' | '));
});

await browser.close();

console.log('');
for (const r of results) console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.ok ? '' : ' -- ' + r.why}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
