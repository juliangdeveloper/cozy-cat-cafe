import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const rng = (seed) => G.mulberry32(seed);
const open = (seed, coins = 500) => G.openRun(G.createGame({ progress: { coins } }), rng(seed));

function carry(cell) {
  return JSON.stringify({
    stack: cell.stack || [],
    blocked: !!cell.blocked,
    dormant: !!cell.dormant,
    calamity: !!cell.calamity,
    calamityStack: !!cell.calamityStack,
    hiddenStack: cell.hiddenStack || null,
  });
}

function slot(cell) {
  return `${cell.id}:${cell.q},${cell.r}`;
}

test('the 100k shuffle fires once and stays fired after reload', () => {
  const s = open(1, 1000);
  s.progress.coins = 99999;
  const quiet = G.maybeBoardShuffle(s, 99999, rng(2));
  assert.equal(quiet.run.boardShuffleApplied, false);
  assert.deepEqual(quiet.run.board.map(carry), s.run.board.map(carry));

  s.progress.coins = 100000;
  const once = G.maybeBoardShuffle(s, 99999, rng(3));
  assert.equal(once.run.boardShuffleApplied, true);
  assert.equal(once.run.calamities, (s.run.calamities || 0) + 1);
  const layout = once.run.board.map(carry);

  const again = G.maybeBoardShuffle(once, 0, rng(4));
  assert.equal(again.run.boardShuffleApplied, true);
  assert.deepEqual(again.run.board.map(carry), layout);
  assert.equal(again.run.calamities, once.run.calamities);

  const loaded = G.deserializeState(G.serializeState(once));
  assert.equal(loaded.run.boardShuffleApplied, true);
  assert.equal(loaded.run.boardShuffleFrom, undefined);
  assert.deepEqual(loaded.run.board.map(carry), layout);
  const after = G.maybeBoardShuffle(loaded, 0, rng(5));
  assert.deepEqual(after.run.board.map(carry), layout);
  assert.equal(after.run.boardShuffleApplied, true);

  const served = open(6, 500);
  const vis = served.run.activeClients[0];
  const ci = served.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  served.run.board[ci].stack = Array.from({ length: vis.qty }, () => vis.color);
  const before = served.run.board.map(carry);
  const gain = G.pay(vis, G.tipLevel(served));
  served.progress.coins = G.CONFIG.BOARD_SHUFFLE_COINS - gain;
  const crossed = G.serveOrder(served, vis.id, ci);
  assert.ok(crossed.progress.coins >= G.CONFIG.BOARD_SHUFFLE_COINS);
  assert.equal(crossed.run.boardShuffleApplied, true);
  const undone = G.useUndoMove(crossed);
  assert.equal(undone.error, undefined);
  assert.equal(undone.run.boardShuffleApplied, false);
  assert.deepEqual(undone.run.board.map(carry), before);
});

test('shuffle is a permutation that keeps every stack and lock with its tile', () => {
  const s = open(8, 1000);
  const board = s.run.board;
  assert.equal(board.length, 36);
  board[0].stack = [1, 2, 3];
  board[0].blocked = true;
  board[0].dormant = false;
  board[0].hiddenStack = [4];
  board[1].stack = [5, 5, 6];
  board[1].blocked = false;
  board[1].dormant = true;
  board[1].calamity = true;
  board[2].stack = [7];
  board[2].blocked = true;
  board[2].dormant = false;
  board[2].calamityStack = true;
  board[3].stack = [8, 9, 8, 1];
  board[3].blocked = false;
  board[3].dormant = false;

  const slots = board.map(slot);
  const payloads = board.map(carry).sort();
  const a = G.applyBoardShuffle(s, rng(9));
  const b = G.applyBoardShuffle(s, rng(9));
  assert.deepEqual(a.run.board.map(slot), slots);
  assert.deepEqual(b.run.board.map(slot), slots);
  assert.deepEqual(a.run.board.map(carry).sort(), payloads);
  assert.deepEqual(b.run.board.map(carry), a.run.board.map(carry));
  assert.ok(a.run.boardShuffleFrom.some((src, i) => src !== i));

  const locked = a.run.board.find((c) => JSON.stringify(c.stack) === JSON.stringify([1, 2, 3]));
  assert.equal(locked.blocked, true);
  assert.deepEqual(locked.hiddenStack, [4]);
  assert.equal(locked.dormant, false);
  const asleep = a.run.board.find((c) => JSON.stringify(c.stack) === JSON.stringify([5, 5, 6]));
  assert.equal(asleep.dormant, true);
  assert.equal(asleep.blocked, false);
  assert.equal(asleep.calamity, true);
  const otherLock = a.run.board.find((c) => JSON.stringify(c.stack) === JSON.stringify([7]));
  assert.equal(otherLock.blocked, true);
  assert.equal(otherLock.calamityStack, true);

  const twice = G.applyBoardShuffle(a, rng(10));
  assert.deepEqual(twice.run.board.map(carry), a.run.board.map(carry));
  assert.equal(twice.run.boardShuffleApplied, true);
});
