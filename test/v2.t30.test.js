// v2.24.3 — clients ask for owned colors plus the next buyColor unlock,
// capped at this run's palette (8). Buying past 8 does not add a creature.
// A saved sitting with a 7-color palette keeps that cap until the next run.
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

const open = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 1e9, cafeLevel: 1, totalGames: 0 } });
  return G.openRun(s, rng(seed));
};

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

function drawnColors(state, seed, n = 100) {
  let s = structuredClone(state);
  s.run.clientsDrawn = 0;
  s.run.orders = [];
  s.run.activeClients = [];
  s.run.legendaries = {};
  s.run.orderSeq = 1;
  const r = rng(seed);
  const colors = [];
  for (let i = 0; i < n; i++) {
    const next = G.drawClient(s, r);
    assert.equal(next.run.clientsDrawn, i + 1);
    colors.push(next.run.orders[next.run.orders.length - 1].color);
    s = next;
  }
  return colors;
}

function assertCap(colors, cap, label) {
  for (const c of colors) {
    assert.ok(c >= 1 && c <= cap, `${label}: color ${c} outside 1..${cap}`);
  }
}

test('the next client color is the next buyColor unlock, not the roster', () => {
  const s = open(3);
  assert.equal(s.run.palette.length, G.CONFIG.RUN_COLORS);
  assert.equal(s.run.palette.length, 8);
  assert.equal(s.progress.colorsOwned, 4);
  // Logical colors are 1..k. buyColor only increments colorsOwned.
  // The face of logical k is palette[k-1].
  assert.equal(G.runFaceColor(s, 5), s.run.palette[4]);
  const rosterBefore = s.run.rosterIndex;
  const bought = G.buyColor(s);
  assert.equal(bought.progress.colorsOwned, 5);
  assert.equal(bought.run.rosterIndex, rosterBefore);
  assert.equal(bought.run.palette.length, 8);

  // Roster is stuck behind the purchase. The draw still includes the new next.
  const lag = structuredClone(s);
  lag.run.rosterIndex = 2;
  const at4 = drawnColors(lag, 11);
  assert.equal(lag.run.rosterIndex, 2);
  assertCap(at4, Math.min(4 + 1, lag.run.palette.length), 'owned 4');
  assert.ok(at4.includes(5), 'the extra color is colorsOwned+1');
  assert.equal(at4.includes(6), false);

  const after = structuredClone(bought);
  after.run.rosterIndex = rosterBefore;
  const at5 = drawnColors(after, 12);
  assert.equal(after.run.rosterIndex, rosterBefore);
  assert.ok(rosterBefore < 6, 'roster has not grown to the new next color');
  assertCap(at5, Math.min(5 + 1, after.run.palette.length), 'owned 5');
  assert.ok(at5.includes(6), 'a fresh buy makes its successor requestable immediately');
  assert.equal(at5.includes(7), false);
  assert.equal(G.runFaceColor(after, 6), after.run.palette[5]);
});

test('color locks at the palette and size-8 tips step by 0.20', () => {
  const s = open(8);
  assert.equal(s.run.palette.length, 8);
  s.progress.colorsOwned = 7;
  s.progress.coins = 12345;
  const eighth = G.buyColor(s);
  assert.ok(!eighth.error);
  assert.equal(eighth.progress.colorsOwned, 8);
  assert.ok(eighth.progress.coins < 12345);
  const locked = G.buyColor(eighth);
  assert.equal(locked.error, 'maxed');
  assert.equal(locked.state.progress.colorsOwned, 8);
  assert.equal(locked.state.progress.coins, eighth.progress.coins);
  eighth.progress.colorsOwned = 9;
  const still = G.buyColor(eighth);
  assert.equal(still.error, 'maxed');
  assert.equal(still.state.progress.colorsOwned, 9);
  assert.equal(still.state.progress.coins, eighth.progress.coins);
  assert.equal(G.CONFIG.EXP_STEP, 0.20);
  assert.equal(G.pay({ qty: 8 }, 0), 67);
  assert.equal(G.pay({ qty: 8 }, 1), 102);
  assert.equal(G.pay({ qty: 8 }, 2), 155);
  assert.equal(G.pay({ qty: 8 }, 3), 234);
});

test('colorsOwned 8 and 9 stay inside the 8-color palette', () => {
  const htmlCap = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'game.js'), 'utf8');
  assert.match(htmlCap, /Math\.min\(owned \+ 1, rosterCeiling\(s\.run\)\)/);
  assert.match(html, /GAME_VERSION = 'v2\.24\.4'/);
  assert.match(html, /All '\+colorRunCap\(state\)\+' colors unlocked/);

  const almost = open(27);
  assert.equal(almost.run.palette.length, 8);
  almost.progress.colorsOwned = 7;
  almost.run.rosterIndex = 2;
  const at7 = drawnColors(almost, 107);
  assertCap(at7, 8, 'owned 7');
  assert.ok(at7.includes(8), 'owned 7 still asks for the next color');
  assert.equal(at7.some((c) => c > 8), false);

  for (const owned of [8, 9]) {
    const s = open(20 + owned);
    assert.equal(s.run.palette.length, 8);
    s.progress.colorsOwned = owned;
    s.run.rosterIndex = 2;
    const colors = drawnColors(s, 100 + owned);
    assertCap(colors, 8, `owned ${owned}`);
    assert.equal(colors.some((c) => c > 8), false, `owned ${owned} asked for a creature past the palette`);
    assert.ok(colors.includes(8), `owned ${owned} still draws within the eight`);
    assert.equal(new Set(colors.filter((c) => c > 8)).size, 0);
  }
});

test('a saved 7-color sitting keeps its cap until the next run', () => {
  const s = open(4);
  assert.equal(s.run.palette.length, 8);
  const kept = s.run.palette.slice(0, 7);
  s.run.palette = kept;
  const back = G.deserializeState(G.serializeState(s));
  assert.deepEqual(back.run.palette, kept);
  assert.equal(G.colorRunCap(back), 7);
  back.progress.colorsOwned = 7;
  back.progress.coins = 99999;
  const locked = G.buyColor(back);
  assert.equal(locked.error, 'maxed');
  assert.equal(locked.state.progress.coins, 99999);
  const colors = drawnColors(back, 77, 40);
  assertCap(colors, 7, 'old palette');
  assert.equal(colors.some((c) => c > 7), false);
  const next = G.restartRun(back, rng(3));
  assert.equal(next.run.palette.length, 8);
  assert.equal(new Set(next.run.palette).size, 8);
  assert.equal(G.colorRunCap(next), 8);
  assert.equal(next.progress.colorsOwned, 4);
});
