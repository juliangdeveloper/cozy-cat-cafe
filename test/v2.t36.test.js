import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const manifest = JSON.parse(readFileSync(join(root, 'assets/pixel/manifest.json'), 'utf8'));

let G;
test.before(async () => { G = await import('../js/game.js'); });

function pngSize(buf) {
  assert.equal(buf.toString('ascii', 12, 16), 'IHDR');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test('version footer is v2.24.43', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.43'/);
  assert.match(html, /☕ Cozy Cat Café \$\{GAME_VERSION\}/);
});

test('order cards use the creature for that color, with idle frames', () => {
  const orders = html.slice(html.indexOf('function renderOrders'), html.indexOf('function colorName'));
  assert.match(orders, /customerAvatar\(src\.color/);
  assert.doesNotMatch(orders, /cat_client_'\+\(\s*\(i%3\)\+1\s*\)/);
  assert.match(html, /function customerAvatar/);
  assert.match(html, /px-idle/);
  assert.match(html, /durations|840ms/);
  assert.match(css, /image-rendering:\s*pixelated/);
  assert.match(css, /\.px-avatar\{[^}]*width:32px/);
  assert.match(css, /\.px-avatar\{[^}]*height:32px/);
  assert.doesNotMatch(orders, /class="oname"/);
  assert.match(css, /\.order-card \.px-avatar\{[^}]*height:100%/);
  assert.match(css, /\.order-card \.px-avatar\{[^}]*aspect-ratio:1/);
  assert.match(css, /\.order-card \.px-avatar \.px32\{[^}]*width:100%!important/);
  assert.match(css, /\.order-card \.px-avatar \.px32\{[^}]*background-size:400% 100%!important/);
  assert.match(css, /\.order-card \.px-avatar \.px32\{[^}]*animation-name:px-idle-fill/);
  assert.doesNotMatch(css, /\.order-card \.px-avatar \.px32\{[^}]*--fw:100%/);
  const fill = css.slice(css.indexOf('@keyframes px-idle-fill'), css.indexOf('@keyframes px-idle-fill') + 400);
  assert.match(fill, /background-position-x:0%/);
  assert.match(fill, /background-position-x:calc\(100% \/ 3\)/);
  assert.match(fill, /background-position-x:calc\(200% \/ 3\)/);
  assert.match(fill, /background-position-x:100%/);
  assert.match(css, /\.order-card \.px-avatar \.px28\{display:none!important\}/);
  assert.match(css, /\.order-card\{flex:0 0 calc\(\(100% - 8px\)\/3\);width:calc\(\(100% - 8px\)\/3\);aspect-ratio:1/);
});

test('each roster color draws the approved 19×19 food on the tile face', () => {
  assert.match(html, /function foodMarkup/);
  const stack = html.slice(html.indexOf('function stackBodyHTML'), html.indexOf('function stackBadgeHTML'));
  const pool = html.slice(html.indexOf('function renderPool'), html.indexOf('function renderPoolSel'));
  const markup = html.slice(html.indexOf('function foodMarkup'), html.indexOf('function stackBodyHTML'));
  assert.match(stack, /foodMarkup\(layer\.color\)/);
  assert.match(pool, /foodMarkup\(c\)/);
  assert.match(markup, /class="ttex"/);
  assert.match(markup, /class="tfood"/);
  assert.match(css, /\.tfood\{[^}]*width:19px/);
  assert.match(css, /\.tfood\{[^}]*image-rendering:\s*pixelated/);
  assert.match(css, /\.ttex\{[^}]*image-rendering:\s*pixelated/);
  assert.match(css, /\.board\.food-lg \.tile \.tfood\{[^}]*width:38px/);
  assert.match(css, /\.board\.food-lg \.tile \.tfood\{[^}]*background-size:38px 38px/);
  assert.match(css, /\.ttile \.tfood\{[^}]*width:19px/);
  for (let i = 1; i <= 10; i++) {
    assert.match(css, new RegExp(`\\.tfood\\[data-food="${i}"\\]\\{background-image:url\\('\\./assets/pixel/foods/${i}\\.png'\\)\\}`));
    assert.match(css, new RegExp(`\\.ttex\\[data-food="${i}"\\]\\{background-image:url\\('\\./assets/pixel/foods/t${i}\\.png'\\)\\}`));
    const buf = readFileSync(join(root, 'assets/pixel/foods', `${i}.png`));
    assert.deepEqual(pngSize(buf), { w: 19, h: 19 });
    const tex = readFileSync(join(root, 'assets/pixel/foods', `t${i}.png`));
    assert.deepEqual(pngSize(tex), { w: 28, h: 32 });
  }
});

test('win and lose use the 96px host cat; skill icons are 26px', () => {
  const run = html.slice(html.indexOf('function renderRun'), html.indexOf('function renderCalamity'));
  const defeat = html.slice(html.indexOf('async function playDefeat'), html.indexOf('async function restartCafe'));
  assert.match(run, /hostCat\(\)/);
  assert.match(defeat, /hostCat\(\)/);
  assert.doesNotMatch(run, /spr\('cat_client_1', 96\)/);
  assert.doesNotMatch(defeat, /spr\('cat_client_1', 96\)/);
  assert.match(css, /\.px-host\{[^}]*width:96px/);
  assert.match(css, /\.px-host\{[^}]*height:96px/);
  assert.match(css, /\.pow \.px-skill\{[^}]*width:26px/);
  assert.match(css, /\.pow \.px-skill\{[^}]*height:26px/);
  const powers = html.slice(html.indexOf('function renderPowers'), html.indexOf('function refreshFlow'));
  assert.match(powers, /skillPixel\(d\.skill\)/);
  assert.doesNotMatch(powers, /skill:'previewPool'|skill:'queueSkip'/);
  assert.match(powers, /skill:'rotateBoard'/);
});

test('manifest maps every roster creature and the skill keys', () => {
  assert.equal(manifest.format, 'cozy-cat-cafe-sprites');
  assert.equal(manifest.version, 1);
  assert.equal(manifest.customers.length, G.ROSTER.length);
  for (const c of manifest.customers) {
    assert.equal(c.rosterName, G.ROSTER[c.rosterIndex]);
    assert.equal(c.colorIndex, c.rosterIndex + 1);
    for (const size of ['32', '28']) {
      const spec = c.sizes[size];
      const still = pngSize(readFileSync(join(root, 'assets/pixel', spec.static)));
      const idle = pngSize(readFileSync(join(root, 'assets/pixel', spec.idle.sheet)));
      const n = Number(size);
      assert.deepEqual(still, { w: n, h: n });
      assert.deepEqual(idle, { w: n * 4, h: n });
      assert.deepEqual(spec.idle.durationsMs, [250, 170, 250, 170]);
      assert.equal(spec.idle.frames, 4);
    }
  }
  const host = manifest.winLose.sizes['96'];
  assert.deepEqual(pngSize(readFileSync(join(root, 'assets/pixel', host.static))), { w: 96, h: 96 });
  assert.deepEqual(pngSize(readFileSync(join(root, 'assets/pixel', host.idle.sheet))), { w: 384, h: 96 });
  const bar = manifest.skills.filter((s) => s.inPowerbar).map((s) => s.skillKey);
  assert.deepEqual(bar, [
    'destroyPile', 'swapPiles', 'refreshPool', 'tables', 'unlockLocks',
    'color', 'tips', 'clearBoard', 'undoMove',
  ]);
  const extra = manifest.skills.filter((s) => !s.inPowerbar).map((s) => s.skillKey);
  assert.deepEqual(extra, ['previewPool', 'queueSkip']);
  for (const s of manifest.skills) {
    const spec = s.sizes['26'];
    assert.deepEqual(pngSize(readFileSync(join(root, 'assets/pixel', spec.static))), { w: 26, h: 26 });
    if (spec.idle) {
      assert.deepEqual(pngSize(readFileSync(join(root, 'assets/pixel', spec.idle.sheet))), { w: 104, h: 26 });
    }
  }
});
