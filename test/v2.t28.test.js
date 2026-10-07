// v2.23.0 — tips line, 7-of-10 palette, paid stacks, trays dealt,
// run history, and the save-modal / defeat / coin-float UI contract.
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

test('tip hold line uses pay() and the exponent step', () => {
  let s = open();
  assert.equal(G.skillUseCount(s, 'tips'), 0);
  const extra0 = G.pay({ qty: 8 }, 1) - G.pay({ qty: 8 }, 0);
  const line0 = G.tipSkillLine(s);
  assert.equal(G.CONFIG.EXP_STEP, 0.1);
  assert.match(line0, /Each level adds 0\.10 to the pay exponent/);
  assert.match(line0, new RegExp(`A size-8 order pays ${extra0} more coins`));
  assert.equal(extra0, G.pay({ qty: 8 }, 1) - G.pay({ qty: 8 }, 0));
  assert.equal(extra0, 16);
  s = G.buyMultiplier(s);
  const n = G.skillUseCount(s, 'tips');
  const extra = G.pay({ qty: 8 }, n + 1) - G.pay({ qty: 8 }, n);
  const line = G.tipSkillLine(s);
  assert.match(line, new RegExp(`pays ${extra} more coins`));
  assert.equal(G.CONFIG.EXP_BASE + G.CONFIG.EXP_STEP * n, 1.25 + 0.1 * n);
  assert.match(html, /tipSkillLine\(state\)/);
  assert.match(html, /SKILL_HELP_MS = 500/);
});

test('each run keeps 7 of 10 creatures and unlocks them gradually', () => {
  const a = open(1e9, 4);
  const b = open(1e9, 4);
  assert.equal(G.CONFIG.RUN_COLORS, 7);
  assert.equal(G.ROSTER.length, 10);
  assert.equal(a.run.palette.length, 7);
  assert.equal(new Set(a.run.palette).size, 7);
  for (const id of a.run.palette) assert.ok(id >= 1 && id <= 10);
  assert.deepEqual(a.run.palette, b.run.palette);
  const other = open(1e9, 9);
  assert.notDeepEqual(a.run.palette, other.run.palette);
  const back = G.deserializeState(G.serializeState(a));
  assert.deepEqual(back.run.palette, a.run.palette);

  assert.equal(a.run.rosterIndex, 5);
  assert.equal(a.progress.colorsOwned, 4);
  for (const c of a.run.pool.flat()) assert.ok(c >= 1 && c <= 4);
  for (const o of a.run.activeClients) assert.ok(o.color >= 1 && o.color <= 5);
  assert.equal(G.runFaceColor(a, 1), a.run.palette[0]);
  assert.equal(G.runFaceColor(a, 5), a.run.palette[4]);
  assert.equal(G.runFaceColor(a, 8), 8);

  let s = a;
  s.progress.colorsOwned = 10;
  s.progress.coins = 1e9;
  const bought = G.buyColor(s);
  assert.equal(bought.progress.colorsOwned, 11);
  assert.equal(bought.run.rosterIndex, 5);
});

test('serving and a 10-stack count as paid stacks; trays are counted when dealt', () => {
  let s = open();
  assert.equal(s.run.pilesDealt, 3);
  assert.equal(s.run.moneyStacks, 0);
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  s.run.board.forEach((c, i) => { if (c && i !== cell) c.stack = []; });
  s.run.board[cell].stack = [1, 1, 1];
  const order = s.run.activeClients[0];
  order.color = 1;
  order.qty = 3;
  order.served = false;
  for (const o of s.run.activeClients) if (o !== order) o.served = true;
  const before = s.progress.coins;
  const paid = G.pay(order, s.economy.multLevel);
  const served = G.resolveCascade(s);
  assert.equal(served.state.run.moneyStacks, 1);
  assert.equal(served.state.progress.coins, before + paid);

  let d = open(1e9, 3);
  const spot = d.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  d.run.board.forEach((c, i) => { if (c && i !== spot) c.stack = []; });
  d.run.board[spot].stack = Array.from({ length: 10 }, () => 2);
  for (const o of d.run.activeClients) o.served = true;
  for (const o of d.run.orders) o.served = true;
  const coins = d.progress.coins;
  const swept = G.resolveCascade(d);
  assert.equal(swept.state.run.moneyStacks, 1);
  assert.equal(swept.state.progress.coins, coins + G.CONFIG.DEBRIS_BONUS_PER * 10);

  const refreshed = G.useRefreshPool(open(), rng(8));
  assert.equal(refreshed.run.pilesDealt, 6);
});

test('finished runs keep best and worst, capped, across a restart', () => {
  let s = open(50, 2);
  s.run.clientsServed = 12;
  s.run.moneyStacks = 4;
  s.run.pilesDealt = 9;
  s = G.restartRun(s, rng(3));
  assert.equal(s.progress.coins, 0);
  assert.equal(s.runHistory.length, 1);
  assert.equal(s.runHistory[0].clientsServed, 12);
  assert.equal(s.runHistory[0].moneyStacks, 4);
  assert.equal(s.runHistory[0].pilesDealt, 9);
  assert.equal(s.runHistory[0].victory, false);
  assert.equal(s.run.pilesDealt, 3);

  s.run.clientsServed = 100;
  s.run.moneyStacks = 40;
  s.run.pilesDealt = 80;
  s = G.beginVictory(s);
  assert.equal(s.run.phase, 'victory');
  assert.equal(s.runHistory.length, 2);
  assert.equal(s.runHistory[1].victory, true);
  assert.equal(s.runHistory[1].clientsServed, 100);
  s = G.restartRun(s, rng(4));
  assert.equal(s.runHistory.length, 2);
  assert.equal(s.runHistory[1].victory, true);
  const ranked = G.bestWorstRuns(s.runHistory);
  assert.equal(ranked.best.clientsServed, 100);
  assert.equal(ranked.worst.clientsServed, 12);

  const tied = [
    { clientsServed: 5, moneyStacks: 2, pilesDealt: 6 },
    { clientsServed: 5, moneyStacks: 2, pilesDealt: 9 },
    { clientsServed: 5, moneyStacks: 2, pilesDealt: 9 },
  ];
  const tie = G.bestWorstRuns(tied);
  assert.equal(tie.best.pilesDealt, 9);
  assert.equal(tie.best, tied[2]);
  assert.equal(tie.worst, tied[0]);

  const many = [];
  for (let i = 0; i < 25; i++) many.push({ clientsServed: i, moneyStacks: 0, pilesDealt: 3 });
  const capped = G.pushRunHistory(many, { clientsServed: 25, moneyStacks: 1, pilesDealt: 3 });
  assert.equal(capped.length, G.CONFIG.RUN_HISTORY_MAX);
  assert.equal(capped[0].clientsServed, 25 - G.CONFIG.RUN_HISTORY_MAX + 1);
  assert.equal(capped[capped.length - 1].clientsServed, 25);

  const saved = G.deserializeState(G.serializeState(s));
  assert.equal(saved.runHistory.length, 2);
  assert.equal(saved.runHistory[1].clientsServed, 100);
});

test('save modal, skill level, coin float, and defeat are in the page', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.0'/);
  assert.match(html, /id="runHistory"/);
  assert.match(html, /function renderRunHistory/);
  assert.match(html, /bestWorstRuns/);
  assert.match(html, /guests · /);
  assert.match(html, /paid stacks/);
  assert.match(html, /trays/);
  assert.match(html, /class="pow-lvl"/);
  assert.match(html, /skillUseCount\(state, d\.skill\)/);
  assert.match(html, /function showCoinGain/);
  assert.match(html, /coin-gain/);
  assert.match(html, /COIN_GAIN_MS = 2400/);
  assert.match(html, /COIN_GAIN_RISE = 28/);
  assert.match(html, /function pinCoinGain/);
  assert.match(html, /e\.style\.position = 'fixed'/);
  assert.match(html, /font-size:36px/);
  assert.match(html, /animation:coinPop 2\.4s/);
  assert.match(html, /debrisCoins/);
  assert.match(html, /calamityGain/);
  assert.match(html, /function playDefeat/);
  assert.match(html, /The lights go down\. This sitting is over\./);
  assert.match(html, /defeat-veil/);
  assert.match(html, /if\(!victorious\)/);
  assert.match(html, /state\.run\.phase==='victory'/);
  assert.doesNotMatch(html, /class="uses"/);
});
