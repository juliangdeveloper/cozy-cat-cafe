// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.17 (node:test, no deps).
// Block T23 — delayed 10+ debris after chain; 2-neighbor unlock; hold-Tables batch.
// Run: node --test test/v2.t23.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 1000000, permTiles: 30 } });
  const run = unwind(G.openRun(s, rng(seed)), s);
  run.skills.tables = { owned: true, uses: 10, usesBought: 10 };
  run.skills.serveManual = run.skills.serveManual || { owned: false, autoServe: true };
  run.skills.serveManual.autoServe = false; // isolate debris / unlock tests
  return run;
};

const eligibleDormant = (s) =>
  s.run.board.find(c => c.dormant && !c.blocked && G.isActivateEligible(s, c));
const ineligibleDormant = (s) =>
  s.run.board.find(c => c.dormant && !c.blocked && !G.isActivateEligible(s, c));

// ---------------------------------------------------------------------------
// T23a — debris 10+ survives mid-chain, destroyed only after settle [R12.3]
// ---------------------------------------------------------------------------
test('T23a [R12.3 v2.17] pile ≥10 survives merge steps; destroyed only after chain settles', () => {
  need('resolveCascade'); need('sweepDebrisRuns'); need('placeStack');
  assert.equal(G.CONFIG.DEBRIS_THRESHOLD, 10);
  const s = mkGame(2);
  // Build a chain that merges into a 10+ pile across steps, then keep a
  // neighbor that can still merge INTO that 10+ before settle.
  // Board core indices: use adjacent cells 0 and a neighbor.
  const board = s.run.board;
  // Find two adjacent unlocked cells
  let a = -1, b = -1;
  for (let i = 0; i < board.length; i++) {
    if (board[i].dormant || board[i].blocked) continue;
    for (let j = i + 1; j < board.length; j++) {
      if (board[j].dormant || board[j].blocked) continue;
      if (G.isHexAdjacent(board[i], board[j])) { a = i; b = j; break; }
    }
    if (a >= 0) break;
  }
  assert.ok(a >= 0 && b >= 0, 'need two adjacent unlocked cells');

  // A starts with 9 of color 4; B has 1 of color 4 → merge creates 10.
  // Also place a third adjacent unlocked with color 4 so AFTER the first merge
  // to 10, another merge can still pull into the 10+ pile (proving it survived).
  let c = -1;
  for (let k = 0; k < board.length; k++) {
    if (k === a || k === b) continue;
    if (board[k].dormant || board[k].blocked) continue;
    if (G.isHexAdjacent(board[a], board[k]) || G.isHexAdjacent(board[b], board[k])) {
      c = k; break;
    }
  }
  assert.ok(c >= 0, 'need a third adjacent unlocked cell');

  board[a].stack = Array.from({ length: 9 }, () => 4);
  board[b].stack = [4];
  board[c].stack = [4];

  const coins0 = s.progress.coins;
  const res = G.resolveCascade(s);
  const st = unwind(res, s);

  // After full cascade: all three runs should have merged into one pile of 11,
  // then sweepDebris destroys the ≥10 run → empty (or remnant if mixed — here pure).
  const lens = [a, b, c].map(i => st.run.board[i].stack.length);
  const totalLeft = lens.reduce((x, y) => x + y, 0);
  assert.equal(totalLeft, 0, `RED: after settle, 11-of-color-4 must be destroyed; left ${lens}`);
  assert.equal(st.progress.coins, coins0 + 25 * 11,
    'RED: bonus = 25 * 11 for the final ≥10 run destroyed after chain');
  assert.ok(res.steps >= 1, 'RED: cascade must report steps including debris sweep');
});

test('T23a2 [R12.3 v2.17] isolated 10-stack destroys on settle (steps>=1) without mid-link destroy needed', () => {
  need('resolveCascade');
  const s = mkGame(3);
  s.run.board[0].stack = Array.from({ length: 10 }, () => 1);
  const coins0 = s.progress.coins;
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.equal(st.run.board[0].stack.length, 0);
  assert.equal(st.progress.coins, coins0 + 250);
  assert.ok(res.steps >= 1);
});

test('T23a3 [R12.3 v2.17] during chain a 10+ pile can still receive merges (not destroyed mid-link)', () => {
  need('resolveCascade'); need('bfsMergeGroups');
  const s = mkGame(4);
  const board = s.run.board;
  // Pick three mutually-chainable unlocked cells in a line/cluster
  const unlocked = board.map((c, i) => ({ c, i })).filter(x => !x.c.dormant && !x.c.blocked);
  assert.ok(unlocked.length >= 3);
  // Place: cell0 = 10 of color 5 (would have been destroyed instantly under old rules),
  // neighbor = 2 of color 5. If mid-destroy happened, neighbor couldn't merge into 10.
  // After settle: 12 destroyed together.
  let i0 = unlocked[0].i;
  let i1 = -1;
  for (const u of unlocked) {
    if (u.i === i0) continue;
    if (G.isHexAdjacent(board[i0], board[u.i])) { i1 = u.i; break; }
  }
  assert.ok(i1 >= 0, 'need neighbor of i0');
  board[i0].stack = Array.from({ length: 10 }, () => 5);
  board[i1].stack = [5, 5];
  const coins0 = s.progress.coins;
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  const left = st.run.board[i0].stack.length + st.run.board[i1].stack.length;
  assert.equal(left, 0, 'RED: 12-run must merge then destroy after settle');
  assert.equal(st.progress.coins, coins0 + 25 * 12,
    'RED: proving the 10+ survived long enough to absorb +2 before destroy');
});

// ---------------------------------------------------------------------------
// T23b — 2-neighbor unlock [R14.6]
// ---------------------------------------------------------------------------
test('T23b [R14.6] activateTile with <2 unlocked neighbors => needTwoNeighbors', () => {
  need('activateTile'); need('isActivateEligible'); need('unlockedNeighborCount');
  const s = mkGame(5);
  const bad = ineligibleDormant(s);
  assert.ok(bad, 'GIVEN: ineligible dormant exists at open');
  assert.ok(G.unlockedNeighborCount(s, bad) < 2);
  const ret = G.activateTile(s, bad.id, rng(1));
  assert.equal(ret.error, 'needTwoNeighbors');
  assert.equal(unwind(ret, s).run.board.find(c => c.id === bad.id).dormant, true);
});

test('T23b2 [R14.6] activateTile with ≥2 unlocked neighbors => ok; core already unlocked', () => {
  need('activateTile');
  const s = mkGame(5);
  const playable = s.run.board.filter(c => !c.dormant && !c.blocked).length;
  assert.equal(playable, 7, 'core 2-3-2 starts unlocked (no exception needed)');
  const good = eligibleDormant(s);
  assert.ok(good, 'mid-edge ring cells have 2 core contacts');
  assert.ok(G.unlockedNeighborCount(s, good) >= 2);
  const st = unwind(G.activateTile(s, good.id, rng(1)), s);
  assert.equal(st.run.board.find(c => c.id === good.id).dormant, false);
  assert.equal(st.skills.tables.uses, 9);
});

// ---------------------------------------------------------------------------
// T23c — hold-batch activateAroundUnlocked [R14.3b]
// ---------------------------------------------------------------------------
test('T23c [R14.3b] activateAroundUnlocked: board-index order, respects 2-neighbor + uses', () => {
  need('activateAroundUnlocked');
  const s = mkGame(6);
  s.skills.tables.uses = 3;
  // Snapshot expected candidates: eligible + around unlocked, sorted by index
  const unlocked = s.run.board.filter(c => !c.dormant);
  const expected = [];
  s.run.board.forEach((c, i) => {
    if (!c.dormant || c.blocked) return;
    if (!unlocked.some(u => G.isHexAdjacent(c, u))) return;
    if (!G.isActivateEligible(s, c)) return;
    expected.push(i);
  });
  expected.sort((a, b) => a - b);
  assert.ok(expected.length >= 3, `need ≥3 eligible at open, got ${expected.length}`);

  const st = unwind(G.activateAroundUnlocked(s, rng(1)), s);
  assert.equal(st.skills.tables.uses, 0, 'uses 3 → activate 3 then stop');
  for (let k = 0; k < 3; k++) {
    assert.equal(st.run.board[expected[k]].dormant, false,
      `RED: must activate board-index order; expected idx ${expected[k]}`);
  }
  // next eligible in snapshot (if any) stays dormant (uses gone; snapshot doesn't grow)
  if (expected[3] != null) {
    assert.equal(st.run.board[expected[3]].dormant, true,
      'RED: must not activate beyond uses / must not grow mid-batch');
  }
});

test('T23c2 [R14.3b] activateAroundUnlocked skips cells not adjacent to unlocked set', () => {
  need('activateAroundUnlocked');
  const s = mkGame(7);
  s.skills.tables.uses = 99;
  // Far dormant with 0 neighbors to unlocked must stay dormant
  const far = s.run.board.find(c => c.dormant && G.unlockedNeighborCount(s, c) === 0);
  assert.ok(far);
  const st = unwind(G.activateAroundUnlocked(s, rng(1)), s);
  assert.equal(st.run.board.find(c => c.id === far.id).dormant, true,
    'RED: non-adjacent / 0-contact cells must not activate');
});

test('T23c3 [R14.3b] activateAroundUnlocked noUses / noneEligible', () => {
  need('activateAroundUnlocked');
  const s = mkGame(8);
  s.skills.tables.uses = 0;
  const ret = G.activateAroundUnlocked(s, rng(1));
  assert.equal(ret.error, 'noUses');
});
