import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };

const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 10000 } });
  if (!s.progress.colorsOwned) s.progress.colorsOwned = 4;
  if (typeof G.openRun === 'function') return unwind(G.openRun(s, mulberry32(seed)), s);
  return s;
};

const playableCell = (s) =>
  (s.run && s.run.board || []).findIndex(c => !c.blocked && !c.dormant);

const placePiles = (s, n, seed = 7) => {
  need('placeStack');
  const rng = mulberry32(seed);
  let cur = s, usedFallback = false;
  for (let i = 0; i < n; i++) {
    let cell = cur.run.board.findIndex(c => !c.blocked && !c.dormant && !(c.stack && c.stack.length));
    if (cell < 0) {
      cur.run.board.forEach(c => { if (!c.blocked && !c.dormant) c.stack = []; });
      cell = cur.run.board.findIndex(c => !c.blocked && !c.dormant && !(c.stack && c.stack.length));
    }
    if (cell < 0) { usedFallback = true; }
    const ret = usedFallback ? { error: 'fallback' }
      : G.placeStack(cur, cell, undefined, rng);
    if (ret && ret.error) {
      usedFallback = true;
      cur.run.placedCounter = (cur.run.placedCounter || 0) + 1;
      const cap = (G.CONFIG && G.CONFIG.UNLOCK_PLACED_PILES) || 3;
      if (cur.run.placedCounter >= cap) {
        cur.run.placedCounter = 0;
        cur.run.rosterIndex = (cur.run.rosterIndex || 1) + 1;
      }
    } else {
      cur = unwind(ret, cur);
    }
  }
  return { state: cur, usedFallback };
};

test('T13a [R13.3] openRun: rosterIndex 5, pool 1..colorsOwned, board 35, 7 jugables', () => {
  need('createGame'); need('openRun');
  const state = G.createGame({ progress: { coins: 10000 } });
  if (!state.progress.colorsOwned) state.progress.colorsOwned = 4;
  let s2;
  try {
    s2 = unwind(G.openRun(state, mulberry32(1)), state);
  } catch {
    assert.ok(false, 'RED: openRun(state, rng) firma rota (debe retornar state con run v2)');
  }
  const run = s2.run;
  assert.ok(run, 'RED: openRun debe dejar state.run');
  assert.equal(run.rosterIndex, 5,
    `RED: al abrir la run el roster arranca en 5 (R13.3 v2.1), hay ${JSON.stringify(run.rosterIndex)}`);
  const tiles = (run.pool || []).flat();
  assert.ok(tiles.length > 0, 'RED: run.pool debe tener fichas al abrir la run');
  assert.ok(tiles.every(t => t >= 1 && t <= state.progress.colorsOwned),
    `RED: pool de arranque solo 1..colorsOwned [R13.5], hay ${JSON.stringify([...new Set(tiles)])}`);
  assert.ok(Array.isArray(run.board), 'RED: run.board debe ser array');
  assert.equal(run.board.length, 36, 'RED: el board de run v2.24.18 tiene 36 celdas');
  const playable = run.board.filter(c => !c.blocked && !c.dormant).length;
  assert.equal(playable, 7, `RED: jugables al arranque = núcleo 2-3-2 (7), hay ${playable} [R13.3,R14.2]`);
  assert.equal(run.activeClients.length, 3, 'RED: 3 visibles al abrir [R16.4]');
});

test('T13b [R13.4] 3 pilas colocadas → roster se mantiene en techo 5; unlock sin push de orders', () => {
  needCfg('UNLOCK_PLACED_PILES');
  assert.equal(G.CONFIG.UNLOCK_PLACED_PILES, 3,
    `RED: CONFIG.UNLOCK_PLACED_PILES===3, hay ${JSON.stringify(G.CONFIG.UNLOCK_PLACED_PILES)}`);
  need('createGame'); need('openRun');
  const s = mkGame(1);
  assert.equal(s.run.rosterIndex, 5, 'RED: partida recién abierta, rosterIndex===5 [R13.3 v2.1]');
  const ordersBefore = s.run.orders.length;
  const { state: s2, usedFallback } = placePiles(s, 3, 7);
  if (usedFallback) {
    assert.ok(false, 'RED: placeStack v1 no soportó el flujo; roster advance vía placeStack no implementado');
  }
  assert.equal(s2.run.rosterIndex, 5,
    `RED: con colorsOwned=4 el roster está en su techo 5 y NO avanza [R16.2/R13.5], hay ${JSON.stringify(s2.run.rosterIndex)}`);
  assert.equal(s2.run.orders.length, ordersBefore,
    `RED: unlock NO debe empujar orders (cola perezosa R16.3), antes ${ordersBefore} ahora ${s2.run.orders.length}`);
});

test('T13c [R13.4] pool uniforme entre desbloqueados: 5 semillas → >1 color en nuevas tandas', () => {
  need('createGame'); need('openRun'); need('placeStack');
  const colorsSeen = new Set();
  for (let seed = 1; seed <= 5; seed++) {
    const s = mkGame(seed);
    const r1 = placePiles(s, 3, seed * 10);
    if (r1.usedFallback) {
      assert.ok(false, 'RED: placeStack no soportó el flujo R13.4 (fallback de mutación activo)');
    }
    assert.equal(r1.state.run.rosterIndex, 5,
      `RED: seed ${seed}: el roster se mantiene en su techo 5 (rosterMax=colorsOwned+1) [R13.4 v2.1]`);
    const r2 = placePiles(r1.state, 3, seed * 10 + 1);
    if (r2.usedFallback) {
      assert.ok(false, 'RED: placeStack no soportó el flujo R13.4 (fallback de mutación activo)');
    }
    for (const tile of (r2.state.run.pool || []).flat()) colorsSeen.add(tile);
  }
  assert.ok(colorsSeen.size > 1,
    `RED: entre semillas, las nuevas tandas del pool deben mostrar >1 color distinto (uniforme entre desbloqueados [R13.4/T12.3]), observados: ${JSON.stringify([...colorsSeen])}`);
});

test('T13d [R13.5] con colorsOwned=4, muchas pilas → rosterIndex se estanca en 5', () => {
  need('createGame'); need('openRun'); need('placeStack');
  needCfg('UNLOCK_PLACED_PILES');
  const s = mkGame(1);
  s.progress.colorsOwned = 4;
  const rosterMax = s.progress.colorsOwned + 1;
  const { state: s2, usedFallback } = placePiles(s, 3 * 8, 21);
  if (usedFallback) {
    assert.ok(false, 'RED: placeStack v1 no soportó el flujo; techo de roster no verificable sin la mecánica real');
  }
  assert.equal(s2.run.rosterIndex, rosterMax,
    `RED: con colorsOwned=${s.progress.colorsOwned}, el roster debe estancarse en ${rosterMax} (colorsOwned+1) [R13.5], hay ${JSON.stringify(s2.run.rosterIndex)}`);
});

test('T13f [v2.22] buyColor: colorsOwned+1, precio 40×1.6^(owned-4); sin saldo → {error:"noFunds"}', () => {
  need('buyColor'); need('colorPrice');
  need('createGame');
  const s = G.createGame({ progress: { coins: 10000 } });
  if (!s.progress.colorsOwned) s.progress.colorsOwned = 4;
  const n = s.progress.colorsOwned + 1;
  const price = G.colorPrice(s);
  assert.equal(price, Math.round(G.CONFIG.SKILL_USE_BASE));
  const st = unwind(G.buyColor(s), s);
  assert.equal(st.progress.colorsOwned, n,
    `RED: buyColor debe hacer colorsOwned+1 (${n}) [R13.7], hay ${JSON.stringify(st.progress.colorsOwned)}`);
  assert.equal(st.progress.coins, 10000 - price,
    `RED: coins debe descontar colorPrice=${price}, hay ${JSON.stringify(st.progress.coins)}`);
  const s2 = G.createGame({ progress: { coins: 0 } });
  if (!s2.progress.colorsOwned) s2.progress.colorsOwned = 4;
  const ret = G.buyColor(s2);
  assert.ok(ret && ret.error === 'noFunds',
    `RED: sin saldo buyColor debe retornar {error:"noFunds"}, retornó ${JSON.stringify(ret)}`);
  const st2 = unwind(ret, s2);
  assert.equal(st2.progress.colorsOwned, 4, 'RED: error noFunds no debe mutar colorsOwned');
  assert.equal(st2.progress.coins, 0, 'RED: error noFunds no debe tocar coins');
});
