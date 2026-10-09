// v2.24.0 — Clear board (10000 × 1.6^n) and one-level Undo (40 × 1.6^n).
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

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

const stacks = (state) => state.run.board.map((c) => (c && c.stack ? [...c.stack] : c && c.stack));

test('clear board uses a 10000 base, not the shared 40', () => {
  assert.equal(G.CONFIG.CLEAR_BOARD_BASE, 10000);
  assert.equal(G.CONFIG.SKILL_USE_BASE, 40);
  assert.equal(G.CONFIG.SKILL_USE_RATIO, 1.6);
  const s = open();
  assert.equal(G.skillUseCount(s, 'clearBoard'), 0);
  assert.equal(G.skillUsePrice(s, 'clearBoard'), 10000);
  assert.equal(G.skillUsePrice(s, 'undoMove'), 40);
  assert.equal(G.skillUsePrice(s, 'destroyPile'), 40);
  for (let n = 0; n < 6; n++) {
    s.run.skillUses.clearBoard = n;
    assert.equal(G.skillUsePrice(s, 'clearBoard'), 10000 * (1.6 ** n), 'n=' + n);
  }
});

test('clear board wipes every free pile and leaves locks, dormant piles, and flags', () => {
  let s = open();
  assert.equal(s.run.undoSnap, undefined);
  assert.equal(s.run.palette.length, 8);
  const free = [];
  let locked = -1;
  let dormant = -1;
  s.run.board.forEach((c, i) => {
    if (!c) return;
    if (c.dormant && dormant < 0) dormant = i;
    else if (!c.blocked && !c.dormant && free.length < 2) free.push(i);
    else if (!c.dormant && locked < 0 && !free.includes(i)) locked = i;
  });
  assert.equal(free.length, 2);
  assert.ok(locked >= 0 && dormant >= 0);
  s.run.board[free[0]].stack = [1];
  s.run.board[free[1]].stack = [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2];
  s.run.board[free[1]].calamity = true;
  s.run.board[free[1]].calamityStack = true;
  s.run.board[locked].blocked = true;
  s.run.board[locked].stack = [9, 9];
  s.run.board[locked].hiddenStack = [8];
  s.run.board[locked].calamity = true;
  s.run.board[dormant].stack = [3, 3];
  s.run.board[dormant].hiddenStack = [4, 4];
  s.run.board[dormant].calamity = true;
  const palette = s.run.palette.slice();
  const coins = s.progress.coins;
  const cleared = G.useClearBoard(s);
  assert.equal(cleared.error, undefined);
  assert.deepEqual(cleared.run.board[free[0]].stack, []);
  assert.deepEqual(cleared.run.board[free[1]].stack, []);
  assert.equal(cleared.run.board[free[1]].calamity, true);
  assert.equal(cleared.run.board[free[1]].calamityStack, true);
  assert.equal(cleared.run.board[locked].blocked, true);
  assert.deepEqual(cleared.run.board[locked].stack, [9, 9]);
  assert.deepEqual(cleared.run.board[locked].hiddenStack, [8]);
  assert.equal(cleared.run.board[dormant].dormant, true);
  assert.deepEqual(cleared.run.board[dormant].stack, []);
  assert.deepEqual(cleared.run.board[dormant].hiddenStack, [4, 4]);
  assert.equal(cleared.run.board[dormant].calamity, true);
  assert.equal(cleared.progress.coins, coins - 10000);
  assert.equal(cleared.run.skillUses.clearBoard, 1);
  assert.equal(G.skillUsePrice(cleared, 'clearBoard'), 16000);
  assert.deepEqual(cleared.run.palette, palette);
  assert.deepEqual(s.run.board[free[0]].stack, [1], 'input stays put');

  const again = G.useClearBoard(cleared);
  assert.equal(again.error, 'empty');
  assert.equal(cleared.run.skillUses.clearBoard, 1);
  assert.equal(cleared.progress.coins, coins - 10000);
});

test('clear board does not charge an empty board or a purse that is short', () => {
  const bare = open();
  bare.run.board.forEach((c) => { if (c) c.stack = []; });
  const coins = bare.progress.coins;
  const empty = G.useClearBoard(bare);
  assert.equal(empty.error, 'empty');
  assert.equal(bare.progress.coins, coins);
  assert.equal(bare.run.undoSnap, undefined);

  const broke = open(9999);
  const cell = broke.run.board.findIndex((c) => c && !c.blocked);
  broke.run.board[cell].stack = [5, 5, 5];
  const snap = stacks(broke);
  const res = G.useClearBoard(broke);
  assert.equal(res.error, 'noFunds');
  assert.deepEqual(stacks(broke), snap);
  assert.equal(broke.progress.coins, 9999);
  assert.equal(broke.run.skillUses.clearBoard || 0, 0);
});

test('clear board has no cap', () => {
  let s = open();
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  for (let n = 0; n < 6; n++) {
    s.run.board[cell].stack = [1, 1];
    s = G.useClearBoard(s);
    assert.equal(s.error, undefined);
    assert.equal(s.run.skillUses.clearBoard, n + 1);
    assert.deepEqual(s.run.board[cell].stack, []);
  }
  assert.equal(G.skillUsePrice(s, 'clearBoard'), 10000 * (1.6 ** 6));
});

test('undo restores the last destroy, then keeps its own fee', () => {
  let s = open(1000);
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  s.run.board[cell].stack = [1, 1, 1];
  const before = stacks(s);
  s = G.useDestroyPile(s, cell);
  assert.deepEqual(s.run.board[cell].stack, []);
  assert.equal(s.progress.coins, 960);
  assert.equal(s.run.skillUses.destroyPile, 1);
  const back = G.useUndoMove(s);
  assert.equal(back.error, undefined);
  assert.deepEqual(stacks(back), before);
  assert.equal(back.progress.coins, 960);
  assert.equal(back.run.skillUses.destroyPile || 0, 0);
  assert.equal(back.run.skillUses.undoMove, 1);
  assert.equal(back.run.undoSnap, undefined);
  assert.equal(G.skillUsePrice(back, 'undoMove'), 40 * 1.6);
  assert.equal(G.skillUsePrice(back, 'destroyPile'), 40);
  const second = G.useUndoMove(back);
  assert.equal(second.error, 'nothingToUndo');
  assert.equal(back.progress.coins, 960);
  assert.equal(back.run.skillUses.undoMove, 1);
});

test('undo of a place rewinds the cascade and does not refund the undo fee', () => {
  const s = open();
  const beforeStacks = stacks(s);
  const beforePool = s.run.pool.map((p) => [...p]);
  const beforeCoins = s.progress.coins;
  const beforeClients = s.run.activeClients.map((o) => o.id);
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant && (!c.stack || !c.stack.length));
  const slot = s.run.pool.findIndex((p) => p && p.length);
  assert.ok(cell >= 0 && slot >= 0);
  const placed = G.placeStack(s, cell, slot, rng(4));
  assert.equal(placed.error, undefined);
  const fin = G.resolveCascade(placed);
  assert.ok(fin.state.run.undoSnap);
  assert.equal(fin.state.run.undoSnap.run.undoSnap, undefined);
  const undone = G.useUndoMove(fin.state);
  assert.deepEqual(stacks(undone), beforeStacks);
  assert.deepEqual(undone.run.pool, beforePool);
  assert.deepEqual(undone.run.activeClients.map((o) => o.id), beforeClients);
  assert.equal(undone.progress.coins, beforeCoins - 40);
  assert.equal(undone.run.skillUses.undoMove, 1);
  assert.equal(undone.run.undoSnap, undefined);
  const again = G.useUndoMove(undone);
  assert.equal(again.error, 'nothingToUndo');
  assert.equal(undone.progress.coins, beforeCoins - 40);
});

test('undo refuses when the restored purse cannot pay, and a fresh run has no stack', () => {
  const fresh = open(500);
  assert.equal(fresh.run.undoSnap, undefined);
  const none = G.useUndoMove(fresh);
  assert.equal(none.error, 'nothingToUndo');
  assert.equal(fresh.progress.coins, 500);

  const s = open(50);
  const cell = s.run.board.findIndex((c) => c && !c.blocked);
  s.run.board[cell].stack = [2];
  const destroyed = G.useDestroyPile(s, cell);
  assert.equal(destroyed.progress.coins, 10);
  destroyed.run.undoSnap.progress.coins = 10;
  const stuck = G.useUndoMove(destroyed);
  assert.equal(stuck.error, 'noFunds');
  assert.deepEqual(destroyed.run.board[cell].stack, []);
  assert.equal(destroyed.progress.coins, 10);
  assert.equal(destroyed.run.skillUses.destroyPile, 1);
  assert.ok(destroyed.run.undoSnap);
});

test('undo of clear board, refresh, and queue skip; restart and victory drop the stack', () => {
  let s = open(20000);
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  s.run.board[cell].stack = [7, 7, 7];
  const coins = s.progress.coins;
  s = G.useClearBoard(s);
  assert.deepEqual(s.run.board[cell].stack, []);
  s = G.useUndoMove(s);
  assert.deepEqual(s.run.board[cell].stack, [7, 7, 7]);
  assert.equal(s.run.skillUses.clearBoard || 0, 0);
  assert.equal(s.progress.coins, coins - 40);
  assert.equal(s.run.palette.length, 8);

  const pool = s.run.pool.map((p) => [...p]);
  const refreshed = G.useRefreshPool(s, rng(9));
  assert.notDeepEqual(refreshed.run.pool, pool);
  const poolBack = G.useUndoMove(refreshed);
  assert.deepEqual(poolBack.run.pool, pool);
  assert.equal(poolBack.run.skillUses.refreshPool || 0, 0);

  const ids = poolBack.run.activeClients.map((o) => o.id);
  const skipped = G.useQueueSkip(poolBack);
  assert.notDeepEqual(skipped.run.activeClients.map((o) => o.id), ids);
  const skipBack = G.useUndoMove(skipped);
  assert.deepEqual(skipBack.run.activeClients.map((o) => o.id), ids);
  assert.equal(skipBack.run.skillUses.queueSkip || 0, 0);
  assert.equal(skipBack.run.skillUses.undoMove, 3);

  skipBack.run.undoSnap = { progress: { coins: 1 }, run: { board: [] } };
  const restarted = G.restartRun(skipBack, rng(3));
  assert.equal(restarted.run.undoSnap, undefined);
  assert.equal(G.skillUsePrice(restarted, 'clearBoard'), 10000);
  assert.equal(G.skillUsePrice(restarted, 'undoMove'), 40);
  assert.equal(restarted.progress.coins, 0);

  let won = open(100);
  won.run.clientsServed = 100;
  won.run.undoSnap = { progress: { coins: 5 }, run: { board: [] } };
  won = G.beginVictory(won);
  assert.equal(won.run.phase, 'victory');
  assert.equal(won.run.undoSnap, undefined);
  assert.equal(G.useUndoMove(won).error, 'nothingToUndo');
});

test('the power bar ships both skills in English at v2.24.0', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.4'/);
  assert.match(html, /useClearBoard/);
  assert.match(html, /useUndoMove/);
  assert.match(html, /skill:'clearBoard'/);
  assert.match(html, /skill:'undoMove'/);
  assert.match(html, /Clear every pile off the whole board\./);
  assert.match(html, /Undo your last move\./);
  assert.match(html, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(html, /position:sticky/);
  assert.match(html, /SKILL_HELP_MS = 500/);
  assert.match(html, /Nothing to undo\./);
  assert.match(html, /The board is already clear\./);
  assert.doesNotMatch(html, /serveManual/);
  assert.doesNotMatch(html, /Modo mesero/);
  assert.doesNotMatch(html, /Waiter/);
});
