// v2.24.8 — calamity sits above the clients, the header fits one row,
// skill art fills the button, and the tray paints over the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const mobile = css.slice(css.indexOf('@media(max-width:560px)'));

test('v2.24.8 moves calamity above the clients and drops the rotate degree', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.8'/);
  const run = html.slice(html.indexOf('function renderRun'), html.indexOf('function renderCalamity'));
  const top = run.indexOf('class="topbar"');
  const cal = run.indexOf('class="cal-row"');
  const orders = run.indexOf('id="orders"');
  const board = run.indexOf('class="board-wrap"');
  const pool = run.indexOf('id="pool"');
  assert.ok(top >= 0 && cal > top && orders > cal && board > orders && pool > board);
  const topbar = run.slice(top, cal);
  assert.equal(topbar.includes('id="calStrip"'), false);
  assert.equal(topbar.includes('>90°<'), false);
  assert.equal(topbar.includes('rot-deg'), false);
  assert.match(topbar, /aria-label="Rotate board 90°"/);
  assert.match(run, /id="calRowLabel"/);
  assert.match(html, /rowLabel\.textContent = meta/);
});

test('skill sprites crop to the artwork and match the emoji box', () => {
  assert.match(html, /const SKILL_ART = \{/);
  for (const id of ['power_destroy', 'power_swap', 'power_refresh', 'furniture_table']) {
    assert.match(html, new RegExp(id + ': \\{x:\\d+, y:\\d+, w:\\d+, h:\\d+\\}'));
  }
  assert.match(html, /function skillArt\(id\)/);
  const powers = html.slice(html.indexOf('function renderPowers'), html.indexOf('function refreshFlow'));
  assert.match(powers, /skillArt\(d\.icon\)/);
  assert.match(css, /\.pow-emoji\{[^}]*font-size:26px/);
  assert.match(css, /\.pow \.skill-art\{[^}]*display:block/);
});

test('the tray stacks above the board and the phone layout spends the gap on the board', () => {
  assert.match(css, /\.board-wrap\{[^}]*z-index:1/);
  assert.match(css, /\.pool\{[^}]*z-index:12/);
  assert.match(css, /\.pool\{[^}]*overflow:visible/);
  assert.match(mobile, /\.powerbar\{[^}]*z-index:15/);
  assert.match(mobile, /#app\{padding:0 0 calc\(2px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(mobile, /\.board-wrap\{[^}]*align-items:flex-start/);
  assert.match(mobile, /\.topbar \.hdr-ico\{[^}]*width:36px;height:36px/);
  assert.match(mobile, /\.cal-row\{margin:1px 2px 0\}/);
  assert.doesNotMatch(mobile, /\.powerbar\{[^}]*safe-area-inset-bottom/);
});
