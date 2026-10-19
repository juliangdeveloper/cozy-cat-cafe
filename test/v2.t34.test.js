// v2.24.7 — debris ×4 from 10 inclusive, skill bar frozen at starting price,
// restart is a white flag, header icon buttons share one size.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let G;
test.before(async () => { G = await import('../js/game.js'); });
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const open = (coins = 1e9, seed = 1) => G.openRun(G.createGame({ progress: { coins, cafeLevel: 1, totalGames: 0 } }), rng(seed));

const START_ORDER = [
  ['destroyPile', 40],
  ['swapPiles', 40],
  ['refreshPool', 40],
  ['tables', 40],
  ['tips', 40],
  ['undoMove', 40],
  ['color', 1000],
  ['unlockLocks', 10000],
  ['clearBoard', 10000],
  ['rotateBoard', 0],
];

test('a destroyed run of 10 pays 4x and a run of 9 does not', () => {
  assert.equal(G.CONFIG.DEBRIS_BIG_OVER, 10);
  assert.equal(G.debrisPay(9), 25 * 9);
  assert.equal(G.debrisPay(10), 25 * 10 * 4);
  assert.equal(G.debrisPay(11), 25 * 11 * 4);
  const s = open();
  const spot = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  s.run.board.forEach((c, i) => { if (c && i !== spot) c.stack = []; });
  s.run.board[spot].stack = Array.from({ length: 10 }, () => 2);
  for (const o of s.run.activeClients) o.served = true;
  for (const o of s.run.orders) o.served = true;
  const coins = s.progress.coins;
  const swept = G.resolveCascade(s);
  assert.equal(swept.state.run.board[spot].stack.length, 0);
  assert.equal(swept.state.progress.coins, coins + 1000);
});

test('the skill bar is sorted once by starting price and stays put', () => {
  assert.deepEqual(G.SKILL_BAR_ORDER.map((id) => [id, G.skillStartPrice(id)]), START_ORDER);
  let s = open();
  assert.equal(G.skillUsePrice(s, 'destroyPile'), 40);
  assert.equal(G.colorPrice(s), 1000);
  s = G.buyColor(s);
  s = G.buyMultiplier(s);
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant && (!c.stack || !c.stack.length));
  s.run.board[cell].stack = [1];
  s = G.useDestroyPile(s, cell);
  assert.equal(s.error, undefined);
  assert.equal(G.skillUsePrice(s, 'destroyPile'), 64);
  assert.equal(G.colorPrice(s), 1600);
  assert.equal(G.tipPrice(s), 64);
  assert.deepEqual(G.SKILL_BAR_ORDER.map((id) => [id, G.skillStartPrice(id)]), START_ORDER);
  const powers = html.slice(html.indexOf('function renderPowers'), html.indexOf('function refreshFlow'));
  assert.match(powers, /SKILL_BAR_ORDER\.map/);
  assert.doesNotMatch(powers, /\.sort\(/);
  assert.doesNotMatch(html, /a\.rank-b\.rank/);
});

test('restart is a white flag with a hold label, and header buttons match', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.17'/);
  assert.match(html, /aria-label="Hold 3s to restart"/);
  assert.match(html, /class="flag-ico"/);
  assert.match(html, /fill="#fff"/);
  assert.match(html, /id="btnClose"[^>]*aria-label="Hold 3s to restart"/);
  assert.doesNotMatch(html, /hold-label">Hold 3s</);
  assert.match(html, /class="iconbtn chrome-hold hdr-ico" id="btnClose"/);
  assert.match(html, /bindCloseHold\(\)/);
  assert.match(html, /CLOSE_HOLD_MS/);
  for (const id of ['btnMute', 'btnHelp', 'btnSave', 'btnClose']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*hdr-ico|hdr-ico[^>]*id="${id}"|class="[^"]*hdr-ico[^"]*" id="${id}"`));
  }
  assert.match(css, /\.topbar \.hdr-ico\{[^}]*width:40px;height:40px;min-width:40px;min-height:40px/);
  assert.match(css, /\.chrome-hold\{[^}]*min-height:\s*40px/);
  assert.match(css, /\.chrome-hold\{[^}]*width:40px;height:40px/);
  assert.doesNotMatch(css, /min-width:\s*56px/);
  assert.doesNotMatch(css, /width:34px/);
});
