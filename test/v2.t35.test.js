// v2.24.9 — calamity is a moving icon on a thin track, rotate is the last
// free skill, and the header icons sit on the right.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let G;
test.before(async () => { G = await import('../js/game.js'); });
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('v2.24.9 puts a moving calamity icon on a thin track above the clients', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.15'/);
  const run = html.slice(html.indexOf('function renderRun'), html.indexOf('function renderCalamity'));
  const top = run.indexOf('class="topbar"');
  const cal = run.indexOf('class="cal-row"');
  const orders = run.indexOf('id="orders"');
  assert.ok(top >= 0 && cal > top && orders > cal);
  const topbar = run.slice(top, cal);
  const track = run.slice(cal, orders);
  assert.equal(topbar.includes('id="calStrip"'), false);
  assert.equal(topbar.includes('id="btnRotate"'), false);
  assert.match(track, /class="cal-track"/);
  assert.match(track, /class="cal-line"/);
  assert.match(track, /id="calIco"/);
  assert.equal(track.includes('Tables'), false);
  assert.equal(track.includes('cal-row-label'), false);
  const paint = html.slice(html.indexOf('function renderCalamity'), html.indexOf('function bindCalamity'));
  assert.match(paint, /ico\.style\.left/);
  assert.match(paint, /\(100% - 22px\)/);
  assert.doesNotMatch(paint, /calRowLabel/);
  assert.match(css, /\.cal-line\{[^}]*height:3px/);
  assert.match(css, /\.cal-mark\{[^}]*color-mix\(in srgb, var\(--danger\)/);
});

test('v2.24.15 fills the phone width with a short tray and smaller skills', () => {
  assert.match(html, /Turn the board 180°/);
  assert.doesNotMatch(html, /Turn the board 90°/);
  assert.match(html, /state\.settings\.boardRot = cur===180 \? 0 : 180/);
  assert.doesNotMatch(html, /poolEl\.style\.flex='1 1 auto'/);
  assert.match(html, /\.poolslot\{height:38px;min-height:38px;max-height:38px\}/);
  assert.match(html, /\.pool\{gap:3px;padding:1px 2px;margin-top:0;flex:0 0 auto/);
  assert.match(html, /\.order-card\{flex:0 0 78px;width:78px;aspect-ratio:1/);
  assert.match(html, /\.pow\{min-height:32px/);
  assert.match(html, /function trayStep\(\)\{ return Math\.max\(3,Math\.round\(rootHx\(\)\*0\.1\)\); \}/);
});

test('header icons sit on the right and rotate is the last free skill', () => {
  assert.match(css, /\.hdr-tools\{[^}]*margin-left:\s*auto/);
  assert.equal(G.SKILL_BAR_ORDER.at(-1), 'rotateBoard');
  assert.equal(G.SKILL_BAR_ORDER.length, 10);
  assert.equal(G.skillStartPrice('rotateBoard'), 0);
  assert.equal(G.skillUsePrice({ run: { skillUses: { rotateBoard: 6 } } }, 'rotateBoard'), 0);
  const powers = html.slice(html.indexOf('function renderPowers'), html.indexOf('function refreshFlow'));
  assert.match(powers, /skill:'rotateBoard'/);
  assert.match(powers, /mode==='rotate'/);
  assert.match(powers, /rotateBoard\(\)/);
  assert.doesNotMatch(html, /id="btnRotate"/);
  assert.doesNotMatch(html, /id="btnPause"/);
});
