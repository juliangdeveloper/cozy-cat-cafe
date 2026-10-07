// v2.22 — pay-per-use skills. Price = SKILL_USE_BASE * SKILL_USE_RATIO^n
// (40 × 1.6^n), same curve as tables. Every skill works from the start of
// a run. Grey/noFunds only when the next price is unaffordable.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

const priceAt = (n) => G.CONFIG.SKILL_USE_BASE * G.CONFIG.SKILL_USE_RATIO ** n;

test('CONFIG documents the shared 40 × 1.6 curve', () => {
  assert.equal(G.CONFIG.SKILL_USE_BASE, 40);
  assert.equal(G.CONFIG.SKILL_USE_RATIO, 1.6);
  assert.equal(G.CONFIG.SKILL_USE_BASE, G.CONFIG.RUN_TILE_BASE);
  assert.equal(G.CONFIG.SKILL_USE_RATIO, G.CONFIG.RUN_TILE_RATIO);
});

test('skill price climbs with uses this run and resets on restart', () => {
  let s = open();
  assert.equal(G.skillUsePrice(s, 'destroyPile'), priceAt(0));
  const cell = s.run.board.findIndex((c) => c && !c.blocked);
  s = G.useDestroyPile(s, cell);
  assert.equal(s.run.skillUses.destroyPile, 1);
  assert.equal(G.skillUsePrice(s, 'destroyPile'), priceAt(1));
  s = G.useDestroyPile(s, cell);
  assert.equal(G.skillUsePrice(s, 'destroyPile'), priceAt(2));
  assert.equal(s.run.skillUses.destroyPile, 2);
  const again = G.restartRun(s, rng(2));
  assert.equal(again.progress.coins, 0);
  assert.equal(G.skillUsePrice(again, 'destroyPile'), priceAt(0));
  assert.equal(again.run.skillUses.destroyPile || 0, 0);
});

test('a skill with no coins does not fire and does not mutate', () => {
  const s = open(0);
  const cell = s.run.board.findIndex((c) => c && !c.blocked);
  s.run.board[cell].stack = [3, 3];
  const snap = JSON.stringify(s.run.board[cell]);
  const coins = s.progress.coins;
  const res = G.useDestroyPile(s, cell);
  assert.equal(res.error, 'noFunds');
  assert.equal(JSON.stringify(s.run.board[cell]), snap);
  assert.equal(s.progress.coins, coins);
});

test('destroy, swap, refresh, unlock, queue, board, color, and tips work at run start', () => {
  let s = open();
  assert.equal(s.progress.cafeLevel, 1);
  assert.equal(s.skills.destroyPile.owned, false);
  assert.equal(s.skills.unlockLocks.unlockLevel, 5);

  const a = s.run.board.findIndex((c) => c && !c.blocked);
  const b = s.run.board.findIndex((c, i) => i !== a && c && !c.blocked);
  s.run.board[a].stack = [1, 1];
  s.run.board[b].stack = [2];
  s = G.useDestroyPile(s, a);
  assert.ok(!s.error);
  assert.deepEqual(s.run.board[a].stack, []);

  s = G.useSwapPiles(s, a, b);
  assert.ok(!s.error);
  assert.deepEqual(s.run.board[a].stack, [2]);

  s = G.useRefreshPool(s, rng(9));
  assert.ok(!s.error);
  assert.equal(s.run.pool.length, 3);

  const lk = s.run.board.findIndex((c) => c && !c.blocked);
  s.run.board[lk].blocked = true;
  s.run.board[lk].hiddenStack = [4];
  s.run.board[lk].stack = [];
  s = G.useUnlockLocks(s, lk);
  assert.ok(!s.error);
  assert.equal(s.run.board[lk].blocked, false);
  assert.deepEqual(s.run.board[lk].stack, [4]);

  s = G.useQueueSkip(s);
  assert.ok(!s.error);
  assert.equal(s.run.skillUses.queueSkip, 1);

  assert.equal(s.skills.serveManual, undefined);
  assert.equal(G.buySkill(s, 'serveManual').error, 'noSkill');

  s = G.buySkill(s, 'previewPool');
  assert.ok(!s.error);
  assert.equal(s.skills.previewPool.level, 1);

  const owned = s.progress.colorsOwned;
  s = G.buyColor(s);
  assert.ok(!s.error);
  assert.equal(s.progress.colorsOwned, owned + 1);

  s = G.buyMultiplier(s);
  assert.ok(!s.error);
  assert.equal(s.progress.econ.multLevel, 1);
  assert.equal(s.economy.multLevel, 1);
});

test('a current save drops a leftover Waiter skill on load', () => {
  const s = G.createGame();
  s.skills.serveManual = { owned: true, autoServe: false, price: 150 };
  const back = G.deserializeState(G.serializeState(s));
  assert.equal(back.settings.epoch, 21);
  assert.equal(back.skills.serveManual, undefined);
  assert.equal(back.skills.previewPool.level, 0);
});

test('color, tips, chalkboard, and tables share 40×1.6^n with no cap', () => {
  let s = open();
  assert.equal(G.colorPrice(s), priceAt(0));
  s = G.buyColor(s);
  assert.equal(G.colorPrice(s), priceAt(1));
  assert.equal(G.tipPrice(s), priceAt(0));
  s = G.buyMultiplier(s);
  assert.equal(G.tipPrice(s), priceAt(1));
  assert.equal(G.previewPrice(s), priceAt(0));
  s = G.buySkill(s, 'previewPool');
  assert.equal(G.previewPrice(s), priceAt(1));

  s.run.runTilesActivated = 4;
  s.run.skillUses = {
    destroyPile: 4, swapPiles: 4, refreshPool: 4, unlockLocks: 4, queueSkip: 4,
  };
  s.progress.colorsOwned = 8;
  s.progress.econ.multLevel = 4;
  s.economy.multLevel = 4;
  s.skills.previewPool.level = 4;
  const expect = priceAt(4);
  for (const id of ['destroyPile', 'swapPiles', 'refreshPool', 'unlockLocks', 'queueSkip', 'tables', 'color', 'tips', 'previewPool']) {
    assert.equal(G.skillUsePrice(s, id), expect, id);
  }
  assert.equal(G.runTilePrice(s), expect);
  assert.equal(G.colorPrice(s), expect);
  assert.equal(G.tipPrice(s), expect);
  assert.equal(G.previewPrice(s), expect);

  s.progress.colorsOwned = G.CONFIG.MAX_COLORS;
  const moreColor = G.buyColor(s);
  assert.equal(moreColor.error, undefined);
  assert.equal(moreColor.progress.colorsOwned, G.CONFIG.MAX_COLORS + 1);
  s.progress.econ.multLevel = G.CONFIG.MULT_MAX;
  s.economy.multLevel = G.CONFIG.MULT_MAX;
  const moreTips = G.buyMultiplier(s);
  assert.equal(moreTips.error, undefined);
  assert.equal(moreTips.progress.econ.multLevel, G.CONFIG.MULT_MAX + 1);
  s.skills.previewPool.level = 3;
  const moreBoard = G.buySkill(s, 'previewPool');
  assert.equal(moreBoard.error, undefined);
  assert.equal(moreBoard.skills.previewPool.level, 4);
});
