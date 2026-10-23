// v2.24.24 — a finished run remembers how many times each skill was used.
// Undo puts that count back, including the free 180° rotate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const open = (coins = 1e9, seed = 1) => {
  const s = G.createGame({ progress: { coins, cafeLevel: 1, totalGames: 0 } });
  return G.openRun(s, rng(seed));
};

// Same turn the page applies after useRotateBoard counts the free skill.
function turn(s) {
  const next = G.useRotateBoard(s);
  assert.ok(!next.error);
  if (!next.settings) next.settings = { boardRot: 0 };
  const cur = ((next.settings.boardRot | 0) % 360 + 360) % 360;
  next.settings.boardRot = cur === 180 ? 0 : 180;
  return next;
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const game = readFileSync(join(root, 'js', 'game.js'), 'utf8');

test('finished runs store a count for every skill, and undo removes that use', () => {
  let s = open(5000);
  const before = s.progress.colorsOwned;
  s = G.buyColor(s);
  assert.equal(s.progress.colorsOwned, before + 1);
  s = G.buyMultiplier(s);
  assert.equal(G.skillUseCount(s, 'color'), 1);
  assert.equal(G.skillUseCount(s, 'tips'), 1);

  s = turn(s);
  assert.equal(s.settings.boardRot, 180);
  assert.equal(G.skillUseCount(s, 'rotateBoard'), 1);
  s = turn(s);
  assert.equal(s.settings.boardRot, 0);
  assert.equal(G.skillUseCount(s, 'rotateBoard'), 2);
  s = G.useUndoMove(s);
  assert.equal(s.settings.boardRot, 180);
  assert.equal(G.skillUseCount(s, 'rotateBoard'), 1);
  assert.equal(G.skillUseCount(s, 'undoMove'), 1);

  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  assert.ok(cell >= 0);
  s.run.board[cell].stack = [1, 1, 1];
  s = G.useDestroyPile(s, cell);
  assert.equal(s.run.board[cell].stack.length, 0);
  assert.equal(G.skillUseCount(s, 'destroyPile'), 1);
  s = G.useUndoMove(s);
  assert.deepEqual(s.run.board[cell].stack, [1, 1, 1]);
  assert.equal(G.skillUseCount(s, 'destroyPile'), 0);
  assert.equal(G.skillUseCount(s, 'rotateBoard'), 1);
  assert.equal(G.skillUseCount(s, 'undoMove'), 2);

  const dormant = s.run.board.findIndex((c) => G.isActivateEligible(s, c));
  assert.ok(dormant >= 0);
  const tiles = s.run.runTilesActivated || 0;
  const opened = G.activateTile(s, dormant);
  assert.ok(!opened.error);
  assert.equal(G.skillUseCount(opened, 'tables'), tiles + 1);
  const closed = G.useUndoMove(opened);
  assert.equal(G.skillUseCount(closed, 'tables'), tiles);
  assert.equal(closed.run.board[dormant].dormant, true);
  s = closed;

  s.run.clientsServed = 4;
  s.run.moneyStacks = 2;
  s.run.pilesDealt = 6;
  const rec = G.finishedRunRecord(s);
  assert.deepEqual(Object.keys(rec.skillUses), [...G.SKILL_BAR_ORDER]);
  assert.equal(rec.skillUses.color, 1);
  assert.equal(rec.skillUses.tips, 1);
  assert.equal(rec.skillUses.rotateBoard, 1);
  assert.equal(rec.skillUses.destroyPile, 0);
  assert.equal(rec.skillUses.undoMove, G.skillUseCount(s, 'undoMove'));
  assert.equal(rec.skillUses.tables, 0);
  assert.equal(rec.clientsServed, 4);
  assert.equal(rec.coins, Math.max(0, Math.floor(s.progress.coins)));

  const ranked = G.topRuns([
    { clientsServed: 2, moneyStacks: 0, pilesDealt: 1, skillUses: { destroyPile: 40 } },
    { clientsServed: 2, moneyStacks: 1, pilesDealt: 0, skillUses: { destroyPile: 0 } },
  ]);
  assert.equal(ranked[0].moneyStacks, 1);
  assert.equal(ranked[0].skillUses.destroyPile, 0);
});

test('history rows use icons, and a run without skill counts shows a dash', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.36'/);
  assert.match(html, /useRotateBoard\(state\)/);
  assert.match(game, /skillUses: snapshotSkillUses\(state\)/);
  assert.match(html, /Skill uses unknown/);
  assert.match(html, /\.rh-guest\{background-image:url\(\.\/assets\/pixel\/customers\/host_cat\/32\.png\)\}/);
  assert.match(html, /\.rh-stacks\{background-image:url\(\.\/assets\/pixel\/history\/stacks\.png\)\}/);
  assert.match(html, /\.rh-tray\{background-image:url\(\.\/assets\/pixel\/history\/tray\.png\)\}/);
  assert.match(html, /\.rh-coin\{background-image:url\(\.\/assets\/pixel\/history\/coin\.png\)\}/);
  assert.match(html, /\.rh-win\{background-image:url\(\.\/assets\/pixel\/history\/win\.png\)\}/);
  assert.match(html, /\.rh-sk-destroyPile\{background-image:url\(\.\/assets\/pixel\/skills\/destroyPile\/26\.png\)\}/);
  assert.match(html, /\.rh-sk-rotateBoard\{background-image:url\(\.\/assets\/pixel\/history\/rotate\.png\)\}/);
  assert.match(html, /\.rh-sk\{width:26px;height:26px/);
  assert.match(html, /overflow-x:hidden/);
  assert.doesNotMatch(html, /guests · /);
});
