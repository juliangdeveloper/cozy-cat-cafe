// v2.24.6 — big debris ×4, Color from 1000, unlimited Undo, price-sorted bar,
// help button, abbreviated money, client colors = owned + next.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let G;
test.before(async () => { G = await import('../js/game.js'); });
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
const rng = (seed) => { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const open = (coins = 1e9, seed = 1) => G.openRun(G.createGame({ progress: { coins, cafeLevel: 1, totalGames: 0 } }), rng(seed));

test('debris below 10 pays as before, 10 or more pays 4x', () => {
  assert.equal(G.debrisPay(9), 225);
  assert.equal(G.debrisPay(10), 25 * 10 * 4);
  assert.equal(G.debrisPay(11), 25 * 11 * 4);
  const board = [{ stack: Array(9).fill(1) }, { stack: Array(10).fill(3) }, { stack: Array(12).fill(2) }];
  const p = { coins: 0 };
  G.sweepDebrisRuns(board, p);
  assert.equal(board[0].stack.length, 9);
  assert.equal(p.coins, 1000 + 1200);
});

test('Color starts at 1000 and grows 1.6x', () => {
  const s = open();
  assert.equal(G.colorPrice(s), 1000);
  assert.equal(G.colorPrice(G.buyColor(s)), 1600);
});

test('undo walks back many moves and never refunds an undo fee', () => {
  let s = open(1e6);
  const cells = s.run.board.map((c, i) => (c && !c.blocked && !c.dormant ? i : -1)).filter((i) => i >= 0);
  const states = [];
  for (let k = 0; k < 3; k++) {
    s.run.board[cells[k]].stack = [k + 1];
    states.push(s);
    s = G.useDestroyPile(s, cells[k]);
    assert.equal(s.error, undefined);
  }
  assert.equal(s.run.undoStack.length, 3);
  const paid = 40 + 40 * 1.6 + 40 * 1.6 ** 2;
  for (let k = 2; k >= 0; k--) {
    s = G.useUndoMove(s);
    assert.equal(s.error, undefined);
    assert.deepEqual(s.run.board[cells[k]].stack, [k + 1]);
  }
  assert.equal(s.run.undoStack.length, 0);
  assert.equal(s.run.skillUses.undoMove, 3);
  assert.equal(s.progress.coins, states[0].progress.coins - paid);
  assert.equal(G.useUndoMove(s).error, 'nothingToUndo');
});

test('a v2.24.5 save with a single undoSnap still undoes', () => {
  const s = open(1000);
  const snap = JSON.parse(JSON.stringify(s));
  const cur = JSON.parse(JSON.stringify(s));
  cur.run.undoSnap = snap;
  const back = G.useUndoMove(cur);
  assert.equal(back.error, undefined);
  assert.equal(back.progress.coins, 960);
  assert.equal(back.run.undoSnap, undefined);
});

test('clients only ask for owned colors plus the next one', () => {
  for (let seed = 1; seed < 30; seed++) {
    let s = open(1e9, seed);
    for (let i = 0; i < 6; i++) {
      for (let d = 0; d < 20; d++) s = G.drawClient(s, rng(seed * 100 + d));
      const cap = Math.min(s.progress.colorsOwned + 1, s.run.palette.length);
      for (const o of s.run.orders) assert.ok(o.color >= 1 && o.color <= cap, `seed ${seed} color ${o.color} cap ${cap}`);
      const b = G.buyColor(s);
      if (!b.error) s = b;
    }
  }
});

test('page: v2.24.7, help button, fixed skill bar, abbreviated money', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.9'/);
  assert.match(html, /id="btnHelp"/);
  assert.match(html, /startTutorial\(\); \};/);
  assert.match(html, /SKILL_BAR_ORDER\.map\(id=>meta\.find/);
  assert.doesNotMatch(html, /a\.rank-b\.rank/);
  const src = html.match(/const fmt = n => \{[\s\S]*?\n\};/)[0];
  const fmt = new Function(src + '; return fmt;')();
  assert.equal(fmt(999), '999');
  assert.equal(fmt(1000), '1K');
  assert.equal(fmt(1500), '1.5K');
  assert.equal(fmt(1999), '1.9K');
  assert.equal(fmt(10000), '10K');
  assert.equal(fmt(262144), '262K');
  assert.equal(fmt(999999), '999K');
  assert.equal(fmt(1e6), '1M');
  assert.equal(fmt(2.5e9), '2.5B');
});
