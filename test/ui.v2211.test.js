// v2.21.1 UI contract: compact header, in-button prices, 3+3 powers,
// speaker mute, order glow. Queue stays on the bar when it has no uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function sliceFn(name, next) {
  const start = html.indexOf(`function ${name}`);
  const end = html.indexOf(`function ${next}`, start + 1);
  assert.ok(start >= 0 && end > start, name);
  return html.slice(start, end);
}

test('version footer stays and reads v2.21.1', () => {
  assert.match(html, /GAME_VERSION = 'v2\.21\.1'/);
  assert.match(html, /☕ Cozy Cat Café \$\{GAME_VERSION\}/);
  assert.match(html, /Hold 3s to restart/);
});

test('guest counter sits in the calamity strip', () => {
  const run = sliceFn('renderRun', 'renderCalamity');
  const strip = run.indexOf('id="calStrip"');
  const count = run.indexOf('id="queueCount"');
  const orders = run.indexOf('id="orders"');
  assert.ok(strip >= 0 && count > strip && count < orders);
  assert.equal(run.includes('class="queuebar"'), false);
  assert.match(css, /\.cal-strip \.queuecount\{/);
});

test('power prices stay inside the button and the bar is a 3-column grid', () => {
  assert.match(css, /\.powerbar\{[^}]*display:grid/);
  assert.match(css, /\.powerbar\{[^}]*grid-template-columns:repeat\(3,minmax\(44px,1fr\)\)/);
  assert.match(css, /\.pow\{[^}]*min-height:44px/);
  assert.match(css, /\.pow\{[^}]*min-width:44px/);
  assert.match(css, /\.pow-cost\{[^}]*position:static/);
  assert.doesNotMatch(css, /\.pow \.uses\{[^}]*top:\s*-/);
  assert.doesNotMatch(css, /\.powerbar\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /\.powerbar\{[^}]*flex-wrap:\s*nowrap/);
  const powers = sliceFn('renderPowers', 'destroyFlow');
  assert.match(powers, /class="pow-cost"/);
  assert.match(powers, /class="uses"/);
  assert.doesNotMatch(powers, /class="uses">🪙/);
  assert.match(powers, /label:'Queue'/);
  assert.match(powers, /queueSkip\.owned\)\s*\n\s*arr\.push/);
  assert.match(powers, /depleted\?'depleted'/);
});

test('mute is a speaker icon and still names Mute music', () => {
  const mute = sliceFn('speakerMarkup', 'renderIdle');
  assert.match(mute, /class="mute-ico"/);
  assert.match(mute, /Mute music/);
  assert.match(mute, /Unmute music/);
  assert.equal(mute.includes('textContent'), false);
  assert.match(mute, /innerHTML = speakerMarkup/);
  assert.match(html, /cozy-cat-cafe\.audio\.mute|toggleCafeAudio/);
});

test('a selected order glows only cells the rules already accept', () => {
  const glow = sliceFn('orderGlowKind', 'hx');
  assert.match(glow, /orderReadyOn\(state, o\.id, idx\)/);
  assert.match(glow, /topGroup\(pile\)\.color===o\.color/);
  assert.match(glow, /cell\.blocked \|\| cell\.dormant/);
  assert.match(glow, /return toward \? 'place' : ''/);
  assert.match(html, /order-glow/);
  assert.match(html, /data-order-glow/);
  const cell = sliceFn('cellHTML', 'renderBoard');
  assert.equal(/servingOrder!==null && !cell\.blocked && !cell\.dormant\) cls\+=' serve-target'/.test(cell), false);
});
