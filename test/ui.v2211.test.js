// v2.22 UI contract: one header row, shop gone, skills in a 2-row grid,
// next price inside the button, speaker mute, order glow.
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

test('version footer stays and reads v2.22.0', () => {
  assert.match(html, /GAME_VERSION = 'v2\.22\.0'/);
  assert.match(html, /☕ Cozy Cat Café \$\{GAME_VERSION\}/);
  assert.match(html, /Hold 3s to restart/);
});

test('money, calamity, and guests share one header row', () => {
  const run = sliceFn('renderRun', 'renderCalamity');
  const top = run.indexOf('class="topbar"');
  const orders = run.indexOf('id="orders"');
  const header = run.slice(top, orders);
  assert.ok(header.includes('id="coinNum"'));
  assert.ok(header.includes('id="calStrip"'));
  assert.ok(header.includes('id="queueCount"'));
  assert.ok(header.includes('id="btnSave"'));
  assert.ok(header.includes('muteBtnMarkup()'));
  assert.equal(header.includes('id="btnShop"'), false);
  assert.equal(header.includes('class="queuebar"'), false);
  const strip = header.indexOf('id="calStrip"');
  const count = header.indexOf('id="queueCount"');
  assert.ok(strip >= 0 && count > strip);
  assert.match(css, /\.topbar\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.cal-strip\{[^}]*flex:\s*1\s+1\s+auto/);
});

test('shop panel is gone and former café buys sit in the skill grid', () => {
  assert.equal(html.includes('id="shopModal"'), false);
  assert.equal(html.includes('id="btnShop"'), false);
  assert.equal(html.includes('function showShop'), false);
  assert.equal(html.includes('This café only'), false);
  const powers = sliceFn('renderPowers', 'refreshFlow');
  for (const label of ['Destroy', 'Swap', 'Refresh', 'Tables', 'Unlock', 'Queue', 'Waiter', 'Board', 'Color', 'Tips']) {
    assert.match(powers, new RegExp(`label:'${label}'`));
  }
  assert.match(powers, /mode:'waiter'/);
  assert.match(powers, /mode:'preview'/);
  assert.match(powers, /mode:'color'/);
  assert.match(powers, /mode:'tips'/);
  assert.doesNotMatch(powers, /queueSkip\.owned\)\s*\n\s*arr\.push/);
  assert.match(powers, /class="pow-cost"/);
  assert.doesNotMatch(powers, /class="uses"/);
});

test('skills are two rows, prices stay inside the button', () => {
  assert.match(css, /\.powerbar\{[^}]*display:grid/);
  assert.match(css, /\.powerbar\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /grid-template-columns:repeat\(3/);
  assert.doesNotMatch(css, /\.powerbar\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /\.powerbar\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.pow\{[^}]*min-height:44px/);
  assert.match(css, /\.pow-cost\{[^}]*position:static/);
  assert.doesNotMatch(css, /\.pow \.uses\{[^}]*top:\s*-/);
  const powers = sliceFn('renderPowers', 'refreshFlow');
  assert.match(powers, /title=/);
  assert.match(powers, /aria-label=/);
  assert.match(powers, /broke/);
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
