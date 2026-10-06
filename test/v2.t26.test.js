// v2.21 — meta efímera, 100 clientes, tamaños de pedido, oleada 2, victoria, saves viejos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const rng = (n) => G.mulberry32(n);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);
const open = (seed, coins = 500) => unwind(G.openRun(G.createGame({ progress: { coins } }), rng(seed)), null);

test('restart keeps nothing but the separate mute key', () => {
  let s = open(3, 900);
  s = unwind(G.buySkill(s, 'destroyPile'), s);
  s = unwind(G.buyColor(s), s);
  s = unwind(G.buyIdleUpgrade(s, 'workers'), s);
  s.skills.capacidad.level = 4;
  s.skills.capacidad.owned = true;
  s.progress.totalGames = 6;
  assert.ok(s.progress.coins < 900);
  assert.equal(s.skills.destroyPile.owned, true);
  assert.equal(s.progress.colorsOwned, 5);
  const next = G.restartRun(s, rng(8));
  assert.equal(next.progress.coins, 0);
  assert.equal(next.progress.totalGames, 0);
  assert.equal(next.progress.colorsOwned, 4);
  assert.equal(next.skills.destroyPile.owned, false);
  assert.equal(next.skills.capacidad.level, 0);
  assert.equal(next.idle.workers.level, 0);
  assert.equal(next.run.clientsServed, 0);
  assert.equal(next.run.runTilesActivated, 0);
  assert.equal(G.totalClients(next), 100);
  const blob = JSON.stringify(next);
  assert.equal(blob.includes('audio.mute'), false);
  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  const fn = html.slice(html.indexOf('async function restartCafe'), html.indexOf('async function playVictory'));
  assert.ok(fn.includes("playCafeSfx('reset')"));
  assert.equal(fn.includes('audio.mute'), false);
  assert.equal(fn.includes('localStorage.removeItem'), false);
  assert.equal(html.includes('Open Shop'), false);
  assert.equal(html.includes('doClose'), false);
});

test('TOTAL_CLIENTS is 100 and capacidad cannot raise it', () => {
  assert.equal(G.CONFIG.TOTAL_CLIENTS, 100);
  assert.equal(G.CONFIG.MAX_CLIENTS, 100);
  const s = open(1);
  assert.equal(G.totalClients(s), 100);
  s.skills.capacidad.level = 40;
  assert.equal(G.totalClients(s), 100);
});

test('order sizes: 3 is the base, 5 and 8 appear from the start, 10 is capped per color', () => {
  const early = new Set();
  let saw5 = false, saw8 = false, saw10 = false;
  for (let seed = 1; seed <= 80; seed++) {
    const s = open(seed);
    assert.equal(s.run.clientsDrawn, 3);
    for (const o of s.run.activeClients) {
      assert.ok([3, 5, 8, 10].includes(o.qty), `early qty ${o.qty}`);
      early.add(o.qty);
      if (o.qty === 5) saw5 = true;
      if (o.qty === 8) saw8 = true;
      if (o.qty === 10) {
        saw10 = true;
        assert.equal(o.legendary, true);
      }
    }
  }
  assert.ok(saw5 && saw8, '5 and 8 show up before the ramp');
  assert.ok(early.has(3), 'base size 3 is in the opening tray of clients');
  assert.ok(saw10, 'a legendary 10 can appear on the opening clients');

  let capped = false;
  for (let seed = 1; seed <= 12 && !capped; seed++) {
    let s = open(seed);
    const r = rng(1000 + seed);
    while (s.run.clientsDrawn < 100) s = G.drawClient(s, r);
    const per = {};
    let legends = 0;
    for (const o of s.run.orders) {
      if (!o.legendary) continue;
      legends += 1;
      per[o.color] = (per[o.color] || 0) + 1;
      assert.equal(o.qty, 10);
    }
    for (const n of Object.values(per)) assert.ok(n <= G.CONFIG.ORDER_LEGENDARY_PER_COLOR);
    if (legends >= 1) capped = true;
  }
  assert.ok(capped, 'a full queue produces legendaries and never two of one color');

  const earlyQtys = [];
  const lateQtys = [];
  for (let i = 0; i < 300; i++) {
    const fresh = open(1);
    earlyQtys.push(G.rollOrderQty(fresh, 1, rng(2000 + i)).qty);
    fresh.run.clientsDrawn = 96;
    fresh.run.legendaries = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 };
    lateQtys.push(G.rollOrderQty(fresh, 1, rng(4000 + i)).qty);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(avg(lateQtys) > avg(earlyQtys), `ramp ${avg(earlyQtys)} -> ${avg(lateQtys)}`);
  assert.ok(lateQtys.includes(9), 'late orders reach toward 10');
  assert.ok(!earlyQtys.includes(9), '9 is not an opening size');
});

test('wave 1 is unchanged: once, above 15 playable, count in range, types unchanged', () => {
  const quiet = open(4);
  assert.equal(G.playableTables(quiet), 7);
  const none = G.applyCalamities(quiet, rng(4));
  assert.equal(none.run.calamitiesApplied, false);
  assert.equal(none.run.calamities, 0);
  assert.equal(none.run.calamityWave2Applied, false);

  const armed = open(5);
  let n = G.playableTables(armed);
  for (const c of armed.run.board) {
    if (n > 15) break;
    if (c.dormant) { c.dormant = false; n += 1; }
  }
  assert.ok(G.playableTables(armed) > 15);
  const p = G.playableTables(armed);
  const lo = Math.ceil(p / 5);
  const hi = Math.max(Math.floor(p / 3), lo);
  const first = G.applyCalamities(armed, rng(11));
  assert.equal(first.run.calamitiesApplied, true);
  assert.ok(first.run.calamities >= lo && first.run.calamities <= hi, `${first.run.calamities} not in ${lo}..${hi}`);
  const again = G.applyCalamities(first, rng(12));
  assert.equal(again.run.calamities, first.run.calamities);
  assert.equal(again.run.calamityWave2Applied, false);

  const seen = { dormant: 0, locked: 0, piled: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const s = open(seed);
    let k = G.playableTables(s);
    for (const c of s.run.board) {
      if (k > 15) break;
      if (c.dormant) { c.dormant = false; k += 1; }
    }
    const hit = G.applyCalamities(s, rng(seed + 20));
    for (const c of hit.run.board) {
      if (!c.calamity) continue;
      if (c.dormant && c.hiddenStack && c.hiddenStack.length) seen.dormant += 1;
      else if (c.blocked && c.hiddenStack && c.hiddenStack.length) seen.locked += 1;
      else if (c.calamityStack && c.stack.length) seen.piled += 1;
    }
  }
  assert.ok(seen.dormant > 0 && seen.locked > 0 && seen.piled > 0, JSON.stringify(seen));
});

test('wave 2 fires once when about 20 clients remain, same count logic', () => {
  const s = open(6);
  s.run.clientsServed = G.totalClients(s) - G.CONFIG.CALAMITY_WAVE2_REMAINING - 1;
  const early = G.applyCalamityWave2(s, rng(3));
  assert.equal(early.run.calamityWave2Applied, false);
  assert.equal(early.run.calamities, 0);

  s.run.clientsServed = G.totalClients(s) - G.CONFIG.CALAMITY_WAVE2_REMAINING;
  const p = G.playableTables(s);
  const lo = Math.ceil(p * G.CONFIG.CALAMITY_MIN_FRAC);
  const hi = Math.max(Math.floor(p * G.CONFIG.CALAMITY_MAX_FRAC), lo);
  const wave = G.applyCalamityWave2(s, rng(9));
  assert.equal(wave.run.calamityWave2Applied, true);
  assert.ok(wave.run.calamities >= lo && wave.run.calamities <= hi);
  const twice = G.applyCalamityWave2(wave, rng(10));
  assert.equal(twice.run.calamities, wave.run.calamities);

  const vis = s.run.activeClients[0];
  const ci = s.run.board.findIndex((c) => !c.blocked && !c.dormant);
  s.run.board[ci].stack = Array.from({ length: vis.qty }, () => vis.color);
  const served = G.serveOrder(s, vis.id, ci);
  assert.equal(served.run.clientsServed, s.run.clientsServed + 1);
  assert.equal(served.run.calamityWave2Applied, true);
  const served2setup = served;
  const vis2 = served2setup.run.activeClients[0];
  const ci2 = served2setup.run.board.findIndex((c) => !c.blocked && !c.dormant && !(c.stack && c.stack.length));
  assert.ok(ci2 >= 0);
  served2setup.run.board[ci2].stack = Array.from({ length: vis2.qty }, () => vis2.color);
  const served2 = G.serveOrder(served2setup, vis2.id, ci2);
  assert.equal(served2.run.calamities, served.run.calamities);

  const f1 = G.calamityForecast(open(1));
  assert.equal(f1.wave, 1);
  assert.ok(f1.progress > 0 && f1.progress < 1);
  const mid = open(1);
  mid.run.calamitiesApplied = true;
  mid.run.clientsServed = 40;
  const f2 = G.calamityForecast(mid);
  assert.equal(f2.wave, 2);
  assert.ok(Math.abs(f2.progress - 40 / (100 - 20)) < 1e-9);
  mid.run.calamityWave2Applied = true;
  assert.equal(G.calamityForecast(mid).done, true);
});

test('victory credits 15 per calamity and leaves the run in place', () => {
  const s = open(2);
  s.run.clientsServed = 100;
  s.run.calamities = 4;
  s.run.activeClients = [];
  assert.equal(G.runVictory(s), true);
  const before = s.progress.coins;
  const won = G.beginVictory(s);
  assert.equal(won.run.phase, 'victory');
  assert.ok(won.run);
  assert.equal(won.metaClose.victory, true);
  assert.equal(won.metaClose.bonus, 4 * G.CONFIG.CALAMITY_BONUS_PER);
  assert.equal(won.progress.coins, before + 60);
  const again = G.beginVictory(won);
  assert.equal(again.progress.coins, won.progress.coins);
  assert.equal(G.clearTables(won).run.board.every((c) => !c.stack.length), true);
});

test('old saves and garbage load without throwing', () => {
  const old = {
    version: 1,
    meta: { createdAt: 1, lastSavedAt: 2, lastSeenAt: 3, exportId: 'ccc-old' },
    progress: { coins: 9999, totalGames: 12, cafeLevel: 13, colorsOwned: 9, clients: 40, boardCells: 30, econ: { multLevel: 3 } },
    economy: { multLevel: 3 },
    skills: { destroyPile: { owned: true, uses: 4, usesBought: 4, price: 250 }, capacidad: { owned: true, level: 9 } },
    idle: { workers: { level: 2, ratePerSec: 1, cap: 80 }, fame: { level: 1, ratePerSec: 0.3, cap: 10 }, machines: { level: 0, ratePerSec: 0, cap: 0 } },
    run: { phase: 'open', clientsServed: 10, calamities: 3, board: [], orders: [] },
    settings: { seenTutorial: true },
  };
  const s = G.deserializeState(JSON.stringify(old));
  assert.equal(s.version, 1);
  assert.equal(s.progress.coins, 0);
  assert.equal(s.skills.destroyPile.owned, false);
  assert.equal(s.run, null);
  const junk = G.deserializeState('{');
  assert.equal(junk.version, 1);
  assert.equal(junk.run, null);
  const badVer = G.deserializeState(JSON.stringify({ version: 99, progress: { coins: 5 } }));
  assert.equal(badVer.progress.coins, 0);

  const live = open(4, 222);
  live.settings.epoch = 21;
  const back = G.deserializeState(G.serializeState(live));
  assert.equal(back.progress.coins, live.progress.coins);
  assert.equal(back.run.clientsDrawn, live.run.clientsDrawn);
  assert.equal(back.settings.epoch, 21);
});
