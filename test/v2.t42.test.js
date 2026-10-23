// v2.24.29 — a revealed hidden pile merges with its neighbors, and the
// color-unlock announcement names the guest who actually orders that color.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  activateTile, buyColor, colorPrice, colorRunCap, createGame, guestForColor,
  isActivateEligible, mulberry32, openRun, resolveCascade, ROSTER, runFaceColor,
  useUndoMove, useUnlockLocks,
} from '../js/game.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const rng = (seed) => mulberry32(seed);
const open = (seed) => openRun(createGame({ progress: { coins: 200000 } }), rng(seed));

const TILE = {
  1: '--tile-mint', 2: '--tile-blue', 3: '--tile-pink', 4: '--tile-blush',
  5: '--tile-lavender', 6: '--tile-cream', 7: '--tile-denim', 8: '--tile-teal',
  9: '--tile-pine', 10: '--tile-orchid',
};

function park(s) {
  const quiet = (o) => { if (o) { o.color = 10; o.qty = 99; } };
  (s.run.orders || []).forEach(quiet);
  (s.run.activeClients || []).forEach(quiet);
  return s;
}

function neighbors(board, i) {
  const c = board[i];
  const out = [];
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
    const j = board.findIndex((x) => x && x.q === c.q + dq && x.r === c.r + dr);
    if (j >= 0) out.push(j);
  }
  return out;
}

function clearPiles(board) {
  board.forEach((c) => {
    c.stack = [];
    delete c.hiddenStack;
  });
}

test('unlocking a hidden pile merges it, and undo puts the lock back', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.37'/);
  assert.match(html, /async function cascadeAfterReveal/);
  const unlock = html.slice(html.indexOf('async function unlockFlow'), html.indexOf('function destroyFlow'));
  const activate = html.slice(html.indexOf('async function activateFlow'), html.indexOf('async function unlockFlow'));
  assert.match(unlock, /cascadeAfterReveal\(res\)/);
  assert.match(activate, /cascadeAfterReveal\(res\)/);

  const s = park(open(1));
  const B = s.run.board;
  clearPiles(B);
  let a = -1;
  let b = -1;
  for (let i = 0; i < B.length && a < 0; i++) {
    if (B[i].dormant) continue;
    for (const j of neighbors(B, i)) {
      if (!B[j].dormant && !B[j].blocked) { a = i; b = j; break; }
    }
  }
  assert.ok(a >= 0 && b >= 0);
  B[a].blocked = true;
  B[a].hiddenStack = [1, 1];
  B[b].stack = [1];
  const beforeCoins = s.progress.coins;
  const unlocked = useUnlockLocks(s, a);
  assert.equal(unlocked.error, undefined);
  assert.deepEqual(unlocked.run.board[a].stack, [1, 1]);
  const fin = resolveCascade(unlocked);
  assert.ok(fin.steps >= 1);
  const left = fin.state.run.board[a].stack;
  const right = fin.state.run.board[b].stack;
  assert.equal(left.length + right.length, 3);
  assert.ok(left.every((c) => c === 1) && right.every((c) => c === 1));
  assert.ok(left.length === 0 || right.length === 0);

  const undone = useUndoMove(fin.state);
  assert.equal(undone.error, undefined);
  assert.equal(undone.run.board[a].blocked, true);
  assert.deepEqual(undone.run.board[a].hiddenStack, [1, 1]);
  assert.deepEqual(undone.run.board[a].stack, []);
  assert.deepEqual(undone.run.board[b].stack, [1]);
  assert.equal(undone.progress.coins, beforeCoins - 40);
});

test('opening a dark table merges its hidden pile, and several reveals merge together', () => {
  const s = park(open(2));
  const B = s.run.board;
  clearPiles(B);
  const d = B.findIndex((c) => c.dormant && isActivateEligible(s, c));
  assert.ok(d >= 0);
  const n = neighbors(B, d).find((j) => !B[j].dormant);
  assert.ok(n >= 0);
  B[d].hiddenStack = [3, 3];
  B[n].stack = [3];
  const beforeCoins = s.progress.coins;
  const opened = activateTile(s, d, () => 0.99);
  assert.equal(opened.error, undefined);
  assert.equal(opened.run.board[d].dormant, false);
  assert.deepEqual(opened.run.board[d].stack, [3, 3]);
  const fin = resolveCascade(opened);
  assert.ok(fin.steps >= 1);
  const pile = fin.state.run.board[d].stack.concat(fin.state.run.board[n].stack);
  assert.deepEqual(pile.filter((c) => c === 3), [3, 3, 3]);
  assert.ok(fin.state.run.board[d].stack.length === 0 || fin.state.run.board[n].stack.length === 0);
  const undone = useUndoMove(fin.state);
  assert.equal(undone.run.board[d].dormant, true);
  assert.deepEqual(undone.run.board[d].hiddenStack, [3, 3]);
  assert.deepEqual(undone.run.board[d].stack, []);
  assert.deepEqual(undone.run.board[n].stack, [3]);
  assert.equal(undone.progress.coins, beforeCoins - 40);

  const many = park(open(3));
  const board = many.run.board;
  clearPiles(board);
  const pairs = [];
  const used = new Set();
  for (let i = 0; i < board.length && pairs.length < 2; i++) {
    if (board[i].dormant || used.has(i)) continue;
    const j = neighbors(board, i).find((k) => !board[k].dormant && !used.has(k) && k !== i);
    if (j == null) continue;
    pairs.push([i, j]);
    used.add(i);
    used.add(j);
  }
  assert.equal(pairs.length, 2);
  const colors = [4, 5];
  pairs.forEach(([lock, nb], k) => {
    board[lock].blocked = true;
    board[lock].hiddenStack = [colors[k], colors[k]];
    board[nb].stack = [colors[k]];
  });
  let revealed = useUnlockLocks(many, pairs[0][0]);
  revealed = useUnlockLocks(revealed, pairs[1][0]);
  const both = resolveCascade(revealed);
  assert.ok(both.steps >= 2);
  pairs.forEach(([lock, nb], k) => {
    const color = colors[k];
    const got = both.state.run.board[lock].stack.concat(both.state.run.board[nb].stack);
    assert.deepEqual(got.filter((c) => c === color), [color, color, color]);
    assert.ok(both.state.run.board[lock].stack.length === 0 || both.state.run.board[nb].stack.length === 0);
  });
});

test('every unlocked color announces the guest and hex that guest orders', () => {
  const orders = html.slice(html.indexOf('function renderOrders'), html.indexOf('function colorName'));
  const powers = html.slice(html.indexOf('function renderPowers'), html.indexOf('function refreshFlow'));
  assert.match(orders, /guestForColor\(state, src\.color/);
  assert.match(orders, /faceToken\(guest\.face\)/);
  assert.match(powers, /guestForColor\(state, n\)/);
  assert.match(powers, /toast\('Unlocked: '\+guest\.name\+' \(color '\+n\+'\)', guest\.face\)/);
  assert.match(html, /function faceToken\(face\)\{ return TILE_CSS\[face\]/);
  assert.doesNotMatch(html, /tileVar\(colorId\)/);
  assert.doesNotMatch(powers, /faceColor\(n\)/);

  // Logical 8 is Delivery bot (face 7, denim blue). Feeding that face back
  // through the palette lands on Dragonling (face 4, blush orange).
  const s = open(4);
  s.run.palette = [1, 2, 3, 5, 6, 8, 4, 7];
  s.progress.colorsOwned = 7;
  s.progress.coins += colorPrice(s);
  const bought = buyColor(s);
  assert.equal(bought.error, undefined);
  assert.equal(bought.progress.colorsOwned, 8);
  const announced = guestForColor(bought, bought.progress.colorsOwned);
  assert.equal(announced.name, 'Delivery bot');
  assert.equal(announced.face, 7);
  assert.equal(TILE[announced.face], '--tile-denim');
  assert.equal(ROSTER[announced.face - 1], 'Delivery bot');
  const remapped = runFaceColor(bought, announced.face);
  assert.equal(remapped, 4);
  assert.equal(TILE[remapped], '--tile-blush');
  assert.notEqual(TILE[announced.face], TILE[remapped]);

  for (let seed = 1; seed <= 8; seed++) {
    let run = open(seed);
    const cap = colorRunCap(run);
    const check = (logical) => {
      const guest = guestForColor(run, logical);
      const face = runFaceColor(run, logical);
      assert.equal(guest.face, face);
      assert.equal(guest.name, ROSTER[face - 1]);
      assert.equal(TILE[guest.face], TILE[face]);
      const order = { color: logical };
      const ordered = guestForColor(run, order.color);
      assert.equal(guest.name, ordered.name);
      assert.equal(guest.face, ordered.face);
      assert.equal(TILE[guest.face], TILE[ordered.face]);
    };
    for (let logical = 1; logical <= run.progress.colorsOwned; logical++) check(logical);
    while (run.progress.colorsOwned < cap) {
      run.progress.coins += colorPrice(run);
      run = buyColor(run);
      assert.equal(run.error, undefined);
      check(run.progress.colorsOwned);
    }
  }
});
