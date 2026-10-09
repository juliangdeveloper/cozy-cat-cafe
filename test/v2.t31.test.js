// v2.24.2 — one tip level, the float is the coins added, the modal is pay().
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

function readyOrder(s, qty, color = 1) {
  const cell = s.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  s.run.board.forEach((c, i) => { if (c && i !== cell) c.stack = []; });
  s.run.board[cell].stack = Array.from({ length: qty }, () => color);
  const order = s.run.activeClients[0];
  order.color = color;
  order.qty = qty;
  order.served = false;
  for (const o of s.run.activeClients) if (o !== order) o.served = true;
  for (const o of s.run.orders) if (o !== order) o.served = true;
  return { cell, order };
}

test('serve and cascade pay progress.econ.multLevel and ignore a stale economy field', () => {
  const manual = open();
  manual.progress.econ.multLevel = 2;
  manual.economy.multLevel = 0;
  assert.equal(G.tipLevel(manual), 2);
  assert.equal(G.skillUseCount(manual, 'tips'), 2);
  const { cell, order } = readyOrder(manual, 8);
  const before = manual.progress.coins;
  const served = G.serveOrder(manual, order.id, cell);
  assert.ok(!served.error);
  const got = served.progress.coins - before;
  assert.equal(got, G.pay({ qty: 8 }, 2));
  assert.equal(got, 155);
  assert.notEqual(got, G.pay({ qty: 8 }, 0));

  const cascaded = open(1e9, 2);
  cascaded.progress.econ.multLevel = 2;
  cascaded.economy.multLevel = 0;
  const pile = readyOrder(cascaded, 8);
  const coins = cascaded.progress.coins;
  const resolved = G.resolveCascade(cascaded);
  assert.equal(resolved.state.progress.coins - coins, G.pay(pile.order, G.tipLevel(cascaded)));
  assert.equal(resolved.state.progress.coins - coins, 155);
});

test('buying tips writes both fields, even if economy was missing', () => {
  let s = open();
  delete s.economy;
  s = G.buyMultiplier(s);
  assert.equal(s.progress.econ.multLevel, 1);
  assert.equal(s.economy.multLevel, 1);
  assert.equal(G.tipLevel(s), 1);
});

test('load reconciles the two tip fields and a fresh game still round-trips', () => {
  const ahead = open();
  ahead.progress.econ.multLevel = 3;
  ahead.economy.multLevel = 0;
  const back = G.deserializeState(G.serializeState(ahead));
  assert.equal(G.tipLevel(back), 3);
  assert.equal(back.progress.econ.multLevel, 3);
  assert.equal(back.economy.multLevel, 3);

  const missing = open(1e9, 4);
  delete missing.progress.econ;
  missing.economy.multLevel = 2;
  const filled = G.deserializeState(G.serializeState(missing));
  assert.equal(G.tipLevel(filled), 2);
  assert.equal(filled.progress.econ.multLevel, 2);
  assert.equal(filled.economy.multLevel, 2);

  const imported = G.importSave(G.serializeState(ahead));
  assert.equal(G.tipLevel(imported), 3);
  assert.equal(imported.economy.multLevel, 3);

  const onlyEcon = open(1e9, 5);
  delete onlyEcon.progress.econ;
  onlyEcon.economy.multLevel = 1;
  const fromImport = G.importSave(G.serializeState(onlyEcon));
  assert.equal(G.tipLevel(fromImport), 1);
  assert.equal(fromImport.economy.multLevel, 1);

  const fresh = G.createGame();
  assert.equal(JSON.stringify(G.deserializeState(G.serializeState(fresh))), JSON.stringify(fresh));
});

test('the tip table is pay() at this level and the next, and a clear is not scaled', () => {
  const s = open();
  s.progress.econ.multLevel = 1;
  s.economy.multLevel = 9;
  const table = G.tipPayTable(s);
  assert.equal(table.level, 1);
  assert.deepEqual(table.rows.map((r) => r.qty), [3, 4, 5, 6, 7, 8, 9, 10]);
  for (const row of table.rows) {
    assert.equal(row.now, G.pay({ qty: row.qty }, 1));
    assert.equal(row.next, G.pay({ qty: row.qty }, 2));
  }
  const size8 = table.rows.find((r) => r.qty === 8);
  assert.equal(size8.now, 102);
  assert.equal(size8.next, 155);

  const debris = open(1e9, 6);
  debris.progress.econ.multLevel = 3;
  debris.economy.multLevel = 3;
  const spot = debris.run.board.findIndex((c) => c && !c.blocked && !c.dormant);
  debris.run.board.forEach((c, i) => { if (c && i !== spot) c.stack = []; });
  debris.run.board[spot].stack = Array.from({ length: 10 }, () => 2);
  for (const o of debris.run.activeClients) o.served = true;
  for (const o of debris.run.orders) o.served = true;
  const coins = debris.progress.coins;
  const swept = G.resolveCascade(debris);
  assert.equal(swept.state.progress.coins, coins + G.CONFIG.DEBRIS_BONUS_PER * 10);
});

test('the page floats the purse delta and builds the tip modal from pay()', () => {
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  assert.match(html, /GAME_VERSION = 'v2\.24\.4'/);
  assert.match(html, /const got=res\.progress\.coins-state\.progress\.coins/);
  assert.match(html, /showCoinGain\(got/);
  assert.match(html, /pay\(order, tipLevel\(s\)\)/);
  assert.match(html, /const gained=s\.progress\.coins-before/);
  assert.match(html, /showCoinGain\(L\.debrisCoins/);
  assert.match(html, /id="skillPopTitle"/);
  assert.match(html, /id="skillPopTable"/);
  assert.match(html, /Tips — level/);
  assert.match(html, /tipPayTable\(state\)/);
  assert.match(html, /Only a served order pays more\. A clear and a calamity bonus stay the same\./);
  assert.match(html, /Served orders pay more\./);
  assert.doesNotMatch(html, /pay exponent/);
  assert.doesNotMatch(html, /s\.economy\.multLevel/);
});
