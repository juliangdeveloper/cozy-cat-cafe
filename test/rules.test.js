// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite (node:test, no deps).
// Source of truth: RULES.md §3 (T1..T10) + §2 (R1..R11).
// Tests exercise the REAL pure functions from js/game.js. Run: node --test test/
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, CONFIG, placeStack, serveOrder, closeRun, openRun,
  buySkill, buyMultiplier, useDestroyPile, useSwapPiles, useRefreshPool,
  buyExpansion, buyIdleUpgrade, tickIdle, applyOffline, buyColor,
  colorsUnlocked, generateBoard, orderReadyOn, topGroup, pay,
  serializeState, deserializeState, importSave, mulberry32,
  expandTile, freeSlots, activateTile, applyCalamities,
} from '../js/game.js';

const rng = (n) => mulberry32(n);

// helper: open a fresh run from a givens state
const fresh = (seed = 1) => createGame({ progress: { coins: 1000 } });
const openWith = (s, seed) => openRun(s, rng(seed));

// ---------------------------------------------------------------------------
// R1 — persistence
// ---------------------------------------------------------------------------
test('R1.2 roundtrip: deserialize(serialize(s)) igual JSON', () => {
  let s = openRun(createGame(), rng(2));
  // make the first order ready on cell 0, then serve it with the REAL logic fn
  const oid = s.run.orders[0].id;
  const cellIdx = 0;
  const col = s.run.orders[0].color, qty = s.run.orders[0].qty;
  s.run.board[cellIdx].stack = Array.from({ length: qty }, () => col);
  const served = serveOrder(s, oid, cellIdx);
  assert.ok(!served.error, 'order should serve');
  const json = serializeState(served);
  assert.equal(JSON.stringify(deserializeState(json)), JSON.stringify(served));
});

test('R1.4 version != 1 => reset sin crash', () => {
  const s = deserializeState(JSON.stringify({ version: 99 }));
  assert.equal(s.version, 1);
  assert.equal(s.run, null);
});

test('R1.3 import valido reemplaza; invalido rechaza', () => {
  const ok = importSave(JSON.stringify(createGame()));
  assert.equal(ok.version, 1);
  const bad = importSave(JSON.stringify({ hello: 1 }));
  assert.deepEqual(bad, { error: 'invalid' });
});

test('R1.1 export id embebido y no vacio', () => {
  const s = createGame();
  assert.ok(s.meta.exportId && s.meta.exportId.length > 0);
});

// ---------------------------------------------------------------------------
// T1 — pool y colocacion
// ---------------------------------------------------------------------------
test('T1.1 pool 3 pilas al abrir', () => {
  // v2.1-clients: openRun v2.1 da 3 pilas MONOCROMAS de 1..colorsOwned (R13.3
  // v2.1: rosterIndex arranca en 5 = rosterMax(4)+...; presión R13.5: pool <
  // roster) y la cola perezosa dibuja los 3 clientes VISIBLES (R16.3/R16.4).
  const s = openRun(createGame(), rng(1));
  assert.equal(s.run.pool.length, 3);
  assert.equal(s.run.poolPlaced, 0);
  assert.equal(s.run.rosterIndex, 5);            // R13.3 v2.1: arranque en 5
  assert.equal(s.run.activeClients.length, 3);   // R16.4: 3 visibles
  assert.equal(s.run.clientsDrawn, 3);           // R16.3: llegada perezosa
  const owned = s.progress.colorsOwned;          // 4 de inicio (R13.7)
  for (const p of s.run.pool) {
    for (const c of p) assert.ok(c >= 1 && c <= owned); // pool 1..colorsOwned
    for (const c of p) assert.equal(c, p[0]);           // monocromo (R3.1)
  }
  for (const o of s.run.orders) assert.ok(o.color >= 1 && o.color <= s.run.rosterIndex); // clientes piden 1..roster
});

test('T1.2 colocar vacia slot y NO rellena', () => {
  let s = baseRun();
  const pile = s.run.pool[0];
  s = placeStack(s, 0, 0);
  assert.deepEqual(s.run.board[0].stack, pile);
  assert.equal(s.run.pool[0].length, 0);
  assert.equal(s.run.pool.length, 3);
  assert.equal(s.run.poolPlaced, 1);
});

test('T1.5 colocar sobre piezas apila al tope', () => {
  let s = baseRun();
  s.run.board[0].stack = [2];
  const pile = s.run.pool[0];
  s = placeStack(s, 0, 0);
  assert.deepEqual(s.run.board[0].stack, [2].concat(pile));
});

test('T1.4 colocar en bloqueada => error sin mutar', () => {
  let s = baseRun();
  s.run.board[0].blocked = true;
  const before = serializeState(s);
  const res = placeStack(s, 0, 0);
  assert.ok(res.error);
  assert.equal(serializeState(s), before);
});

test('T1.3 refill al colocar la 3a', () => {
  let s = baseRun();
  s = placeStack(s, 0, 0);
  s = placeStack(s, 1, 1);
  assert.equal(s.run.poolPlaced, 2);
  s = placeStack(s, 2, 2);
  // pool refilled
  assert.equal(s.run.pool.length, 3);
});

// ---------------------------------------------------------------------------
// T2 — pedidos / servir  (nueva firma: orderReadyOn/serveOrder reciben cellId
// cliente→pila; los pedidos YA NO tienen campo `cell`)
// ---------------------------------------------------------------------------
test('T2.1 listo cuando tope color Y cantidad suficiente', () => {
  let s = baseRun();
  s.run.board[0].stack = [2, 2, 2];
  assert.equal(orderReadyOn(s, 'o0', 0), true);
});
test('T2.2 NO listo si cantidad inferior; SÍ listo si hay de sobra', () => {
  let a = baseRun(); a.run.board[0].stack = [2, 2];       // too few
  let b = baseRun(); b.run.board[0].stack = [2, 2, 2, 2]; // more than qty -> servable
  assert.equal(orderReadyOn(a, 'o0', 0), false);
  assert.equal(orderReadyOn(b, 'o0', 0), true);
});
test('T2.3 NO listo si color tope difiere', () => {
  let a = baseRun(); a.run.board[0].stack = [1, 1, 1];      // wrong color
  let b = baseRun(); b.run.board[0].stack = [2, 2, 1, 1, 1];// top color 1
  assert.equal(orderReadyOn(a, 'o0', 0), false);
  assert.equal(orderReadyOn(b, 'o0', 0), false);
});
test('T2.4 servir consume solo qty, marca served, paga', () => {
  let s = baseRun();
  s.run.board[0].stack = [2, 2, 2]; // count === qty
  const before = s.progress.coins;
  const served = serveOrder(s, 'o0', 0);
  assert.ok(!served.error, 'servable');
  assert.deepEqual(served.run.board[0].stack, []);
  assert.equal(served.run.orders[0].served, true);
  assert.equal(served.progress.coins, before + pay({ qty: 3, color: 2 }));
});
test('T2.5 servir in-servible => error', () => {
  let s = baseRun();
  s.run.board[0].stack = [2, 2];
  const res = serveOrder(s, 'o0', 0);
  assert.ok(res.error);
});

// ---------------------------------------------------------------------------
// REDESIGN (mayor) — sistema de servir (click cliente→pila) y tablero hex 2-3-2
// ---------------------------------------------------------------------------
test('REDESIGN (a) servir consume SOLO qty del tope (pila 4, pide 3 -> queda 1)', () => {
  let s = baseRun(); // o0 = color2 qty3
  s.run.board[0].stack = [1, 2, 2, 2, 2]; // topGroup color2 count4
  const before = s.progress.coins;
  const served = serveOrder(s, 'o0', 0);
  assert.ok(!served.error, 'debe servir con pila mayor');
  assert.deepEqual(served.run.board[0].stack, [1, 2]); // se consumen solo 3 rojos
  assert.equal(served.run.orders[0].served, true);
  assert.equal(served.progress.coins, before + pay({ qty: 3, color: 2 }));
});

test('REDESIGN (b) pila insuficiente o color distinto => error sin consumir ni servir', () => {
  // color distinto
  let a = baseRun(); a.run.board[0].stack = [1, 1, 1];
  const preA = a.run.orders[0].served;
  const resA = serveOrder(a, 'o0', 0);
  assert.equal(resA.error, 'notEnough');
  assert.deepEqual(a.run.board[0].stack, [1, 1, 1]);
  assert.equal(a.run.orders[0].served, preA);
  assert.equal(a.progress.coins, 1000);
  // cantidad insuficiente (count < qty)
  let b = baseRun(); b.run.board[0].stack = [2, 2];
  const beforeB = JSON.stringify(b);
  const resB = serveOrder(b, 'o0', 0);
  assert.equal(resB.error, 'notEnough');
  assert.equal(JSON.stringify(b), beforeB); // no muta
  assert.equal(b.run.orders[0].served, false);
});

test('REDESIGN (c) tablero v2 = 32 celdas: núcleo 2-3-2 jugable + 25 dormant', () => {
  // v2-shape: R14.1/R14.2 reemplazan el tablero v1 de 7 celdas: el board es
  // SIEMPRE 32 (panal con picos filas [7,9,9,7], antes 30 = panal 5×6); el
  // núcleo 2-3-2 (7 celdas, coords de initialHexCells centradas) nace jugable
  // (dormant:false) y las otras 25 quedan dormant (visibles apagadas).
  const s = openRun(createGame(), rng(1));
  assert.equal(s.run.board.length, 32); // v2-shape: 30 → 32
  const playable = s.run.board.filter((c) => !c.dormant);
  const dormant = s.run.board.filter((c) => c.dormant);
  assert.equal(playable.length, 7);
  assert.equal(dormant.length, 25); // v2-shape: 23 → 25
  const byCol = {};
  for (const c of playable) byCol[c.q] = (byCol[c.q] || 0) + 1;
  assert.deepEqual({ '-1': 2, '0': 3, '1': 2 }, { '-1': byCol[-1], '0': byCol[0], '1': byCol[1] });
  // coordenadas axiales únicas en TODO el tablero (32) // v2-shape: 30 → 32
  const keys = new Set(s.run.board.map((c) => `${c.q},${c.r}`));
  assert.equal(keys.size, 32);
  // orders NO llevan `cell` (v2: pedidos flotantes)
  for (const o of s.run.orders) assert.equal(o.cell, undefined);
});

test('REDESIGN (d) expandTile: slot vecino válido funciona; no-vecino/ocupado dan error', () => {
  let s = openRun(createGame({ progress: { coins: 100000 } }), rng(1));
  const slots = freeSlots(s);
  assert.ok(slots.length >= 1);
  const target = slots[0];
  const n = s.run.board.length;
  const res = expandTile(s, target.q, target.r);
  assert.ok(!res.error, 'debe expandir en slot vecino libre');
  assert.equal(res.run.board.length, n + 1);
  assert.equal(res.progress.boardCells, s.progress.boardCells + 1);
  const added = res.run.board[res.run.board.length - 1];
  assert.equal(added.q, target.q);
  assert.equal(added.r, target.r);
  // ocupado -> error
  assert.equal(expandTile(s, s.run.board[0].q, s.run.board[0].r).error, 'occupied');
  // libre pero NO vecino -> error
  assert.equal(expandTile(s, 100, 100).error, 'notAdjacent');
  // sin saldo -> noFunds
  const poorRun = openRun(createGame({ progress: { coins: 0 } }), rng(2));
  const pRes = expandTile(poorRun, freeSlots(poorRun)[0].q, freeSlots(poorRun)[0].r);
  assert.equal(pRes.error, 'noFunds');
});

test('REDESIGN (e) contrato §0: signatures públicas siguen operativas', () => {
  // orderReadyOn / serveOrder aceptan (state, orderId, cellId), cliente→pila
  let s = baseRun(); s.run.board[0].stack = [2, 2, 2];
  assert.equal(orderReadyOn(s, 'o0', 0), true);
  assert.equal(orderReadyOn(s, 'o0', 1), false);
  const sv = serveOrder(s, 'o0', 0);
  assert.ok(!sv.error);
  // helpers intactos
  assert.equal(pay({ qty: 3, color: 2 }), 20);
  assert.deepEqual(topGroup([2, 2, 2]), { color: 2, count: 3 });
  // buyExpansion('board') legada sigue operativa sobre la base 7 (7+3=10)
  const exp = buyExpansion(createGame({ progress: { coins: 100000 } }), 'board');
  assert.equal(exp.progress.boardCells, 10);
});

// ---------------------------------------------------------------------------
// T3 — cierres
// ---------------------------------------------------------------------------
test('T3.1 cierre full: run null, totalGames+1', () => {
  let s = baseRun();
  const t = s.progress.totalGames;
  s = closeRun(s, 'full');
  assert.equal(s.run, null);
  assert.equal(s.progress.totalGames, t + 1);
});
test('T3.2 cierre allServed => victoria', () => {
  let s = baseRun();
  s.run.orders[0].served = true;
  s = closeRun(s, 'allServed');
  assert.equal(s.run, null);
  assert.equal(s.metaClose.victory, true);
});
test('T3.3 cierre manual conserva dinero', () => {
  let s = baseRun();
  s.progress.coins = 120;
  s = closeRun(s, 'manual');
  assert.ok(s.progress.coins >= 120);
  assert.equal(s.metaClose.victory, false);
});
test('T3.4 reabrir reinicia run, conserva meta', () => {
  const g = rng(3);
  let s = openRun(createGame({ progress: { coins: 777 } }), g);
  const coins = s.progress.coins;
  const t = s.progress.totalGames;
  s = closeRun(s, 'manual');
  s = openRun(s, g);
  assert.ok(s.run && s.run.orders.length > 0);
  assert.equal(s.progress.coins, coins);
  assert.equal(s.progress.totalGames, t + 1);
});
test('T3.5 solo allServed es victoria', () => {
  assert.equal(closeRun(baseRun(), 'full').metaClose.victory, false);
  assert.equal(closeRun(baseRun(), 'manual').metaClose.victory, false);
  let s = baseRun(); s.run.orders[0].served = true;
  assert.equal(closeRun(s, 'allServed').metaClose.victory, true);
});

// ---------------------------------------------------------------------------
// T4 — economia
// ---------------------------------------------------------------------------
test('T4.1 pago base', () => {
  assert.equal(pay({ qty: 2 }), 12);   // round(5*2^1.25)=12
  assert.equal(pay({ qty: 3 }), 20);   // round(5*3.948)=20
});
test('T4.2 superlinealidad 4 > 2*2', () => {
  assert.ok(pay({ qty: 4 }) > 2 * pay({ qty: 2 }));
});
test('T4.3 multi sube pago, cuesta 100*(lvl+1)', () => {
  assert.ok(pay({ qty: 3 }, 1) > pay({ qty: 3 }, 0));
  let s = createGame(); s.progress.coins = 500;
  const after = buyMultiplier(s);
  assert.equal(after.progress.econ.multLevel, 1);
  assert.equal(after.progress.coins, 400);
});
test('T4.4 bonus calamidad al cerrar', () => {
  let s = baseRun();
  s.run.calamities = 6;
  s = closeRun(s, 'full');
  assert.equal(s.metaClose.bonus, 6 * 15);
});
test('R5.2 buyMultiplier sin saldo => error', () => {
  let s = createGame(); // coins 0
  assert.equal(buyMultiplier(s).error, 'noFunds');
});

// ---------------------------------------------------------------------------
// T5 — expansiones
// ---------------------------------------------------------------------------
test('T5.1 clients +1', () => {
  let s = richState();
  const b = s.progress.clients;
  s = buyExpansion(s, 'clients');
  assert.equal(s.progress.clients, b + 1);
});
test('T5.2 board +3', () => {
  let s = richState();
  const b = s.progress.boardCells;
  s = buyExpansion(s, 'board');
  assert.equal(s.progress.boardCells, b + 3);
});
test('T5.3 products recalcula colores', () => {
  let s = richState();
  s = buyExpansion(s, 'products');
  assert.equal(s.progress.productsBought, 1);
  assert.equal(s.progress.colorsUnlocked, colorsUnlocked(1));
});
test('T5.4 sin saldo => error noFunds', () => {
  assert.equal(buyExpansion(createGame(), 'clients').error, 'noFunds');
});

// ---------------------------------------------------------------------------
// T6 — poderes / arbol
// ---------------------------------------------------------------------------
test('T6.1 desbloqueo por nivel', () => {
  let s = richState(); s.progress.cafeLevel = 2;
  assert.equal(buySkill(s, 'swapPiles').error, 'locked');     // needs 3
  assert.equal(buySkill(s, 'destroyPile').error, 'locked');   // needs 5
  assert.ok(!buySkill(s, 'refreshPool').error);               // needs 1
});
test('T6.2 compra exige nivel + saldo', () => {
  let s = createGame({ progress: { coins: 100000, totalGames: 5 } });
  s.progress.cafeLevel = 6;
  s = buySkill(s, 'destroyPile');
  assert.equal(s.skills.destroyPile.owned, true);
  assert.equal(s.skills.destroyPile.uses, CONFIG.USES_PER_RUN.destroyPile);
});
test('T6.2b compra sin saldo => noFunds', () => {
  assert.equal(buySkill(createGame(), 'refreshPool').error, 'noFunds');
});
test('T6.3 DESTROY PILE vacia pila', () => {
  let s = baseRun(); s.skills.destroyPile.owned = true; s.skills.destroyPile.uses = 3;
  s.run.board[0].stack = [2, 2, 2];
  s = useDestroyPile(s, 0);
  assert.deepEqual(s.run.board[0].stack, []);
  assert.equal(s.skills.destroyPile.uses, 2);
});
test('T6.4 DESTROY no afecta bloqueada', () => {
  let s = baseRun(); s.skills.destroyPile.owned = true; s.skills.destroyPile.uses = 3;
  s.run.board[0].blocked = true;
  const res = useDestroyPile(s, 0);
  assert.ok(res.error);
  assert.equal(s.skills.destroyPile.uses, 3);
});
test('T6.5 SWAP intercambia stacks', () => {
  let s = baseRun(); s.skills.swapPiles.owned = true; s.skills.swapPiles.uses = 3;
  s.run.board[0].stack = [1, 1]; s.run.board[1].stack = [2];
  s = useSwapPiles(s, 0, 1);
  assert.deepEqual(s.run.board[0].stack, [2]);
  assert.deepEqual(s.run.board[1].stack, [1, 1]);
  assert.equal(s.skills.swapPiles.uses, 2);
});
test('T6.6 REFRESH genera 3 nuevas', () => {
  let s = baseRun(); s.skills.refreshPool.owned = true; s.skills.refreshPool.uses = 2;
  s.run.pool = [[1], [2], [3]]; s.run.poolPlaced = 1;
  s = useRefreshPool(s, rng(7));
  assert.equal(s.run.pool.length, 3);
  assert.equal(s.run.poolPlaced, 0);
  assert.equal(s.skills.refreshPool.uses, 1);
});
test('T6.7 sin owned/usos => error', () => {
  let s = baseRun();
  assert.ok(useDestroyPile(s, 0).error);
  assert.ok(useRefreshPool(s).error);
});
test('T6.8 usos se reponen al reabrir', () => {
  let s = createGame({ progress: { coins: 100000, totalGames: 6 } });
  s.progress.cafeLevel = 6; // unlock destroyPile
  s = buySkill(s, 'destroyPile');
  s.skills.destroyPile.uses = 0;
  s = openRun(s, rng(1));
  assert.equal(s.skills.destroyPile.uses, CONFIG.USES_PER_RUN.destroyPile);
});

// ---------------------------------------------------------------------------
// T7 — calamidades (R8 v2 → R14.5: sobre celdas JUGABLES, umbral > 15)
// ---------------------------------------------------------------------------
// v2: R14.5 reemplaza R8.1-R8.4 — el rango se calcula sobre celdas JUGABLES
// (núcleo 7 + activadas vía activateTile). Las calamidades NO entran al abrir
// (7 jugables < 15); entran UNA vez por partida cuando activateTile cruza el
// umbral (flag run.calamitiesApplied, implementado en applyCalamities).
const T7 = () => {
  // activar `k` baldosas dormant con rng determinista por (seed, paso)
  const act = (st, k, seed) => {
    for (let j = 0; j < k; j++) {
      const d = st.run.board.map((c, i) => ({ c, i })).filter((x) => x.c.dormant && !x.c.blocked);
      if (!d.length) break;
      st = activateTile(st, d[j % d.length].i, mulberry32(seed * 100 + j));
      if (st.error) break;
    }
    return st;
  };
  const open = (seed) => openRun(createGame({ progress: { coins: 1000000, permTiles: 30 } }), rng(seed));
  return { act, open };
};
// T7.1 — solo si jugables > 15: con 15 (7+8) NO entran; con 16 (7+9) sí
test('T7.1 solo si >15 (v2: sobre JUGABLES tras activar)', () => {
  const { act, open } = T7();
  const s15 = act(open(1), 8, 1);
  assert.equal(s15.run.calamities, 0, 'con 15 jugables NO hay calamidades');
  assert.equal(s15.run.board.filter(c => c.blocked).length, 0, 'sin calamidades no hay blocked');
  const s16 = act(s15, 1, 1);                    // una activación más cruza a 16
  assert.ok(s16.run.calamities > 0, 'con 16 jugables entran calamidades');
  assert.equal(s16.run.calamitiesApplied, true, 'flag una-sola-vez marcado al cruzar');
});
// T7.2 — count en [lo,hi] y variable: lo=ceil(n/5), hi=floor(n/3) sobre
// JUGABLES n (16 => [4,5], 18 => [4,6], 21 => [5,7]); ≥2 valores distintos
test('T7.2 count en [lo,hi] y variable (v2: rango sobre jugables)', () => {
  const { act, open } = T7();
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const k = [9, 10, 11, 14][seed % 4];           // jugables 16/17/18/21
    const s = act(open(seed), k, seed);
    if (!s.run.calamitiesApplied) continue;
    const n = 16;                                  // jugables AL CRUZAR el umbral (7+9)
    const lo = Math.ceil(n / 5), hi = Math.floor(n / 3);
    assert.ok(s.run.calamities >= lo && s.run.calamities <= hi,
      `calamities=${s.run.calamities} fuera de [${lo},${hi}] (jugables ${n})`);
    assert.equal(s.run.board.filter(c => c.calamity).length, s.run.calamities);
    seen.add(s.run.calamities);
  }
  assert.ok(seen.size >= 2, `debe observarse variabilidad, hubo ${[...seen].join(',')}`);
});
// T7.3 — ≈50% blocked / ≈50% pre-pila; cada calamidad es blocked XOR calamityStack
test('T7.3 conteo brutal: blocked XOR pre-pila, mezcla ~50/50 entre semillas', () => {
  const { act, open } = T7();
  let blocked = 0, pre = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = act(open(seed), 9, seed);
    if (!s.run.calamitiesApplied) continue;
    for (const c of s.run.board) {
      if (!c.calamity) continue;
      if (c.blocked) { assert.equal(c.calamityStack, false, 'blocked XOR pre-pila'); blocked++; }
      else { assert.ok(c.stack.length >= 1, 'pre-pila => stack>=1'); assert.equal(c.blocked, false); pre++; }
    }
  }
  assert.ok(blocked > 0 && pre > 0, 'ambos tipos deben aparecer');
  const frac = blocked / (blocked + pre);
  assert.ok(frac >= 0.3 && frac <= 0.7, `fracción blocked=${frac.toFixed(2)} fuera de [0.3,0.7]`);
});
// T7.4 — celda de calamidad con pila pre-colocada: NO bloqueada y placeStack encima
test('T7.4 pila pre-colocada placeable (no bloqueada) — v2 sobre jugables', () => {
  const { act, open } = T7();
  let done = false;
  for (let seed = 1; seed <= 20 && !done; seed++) {
    const s = act(open(seed), 9, seed);
    if (!s.run.calamitiesApplied) continue;
    const i = s.run.board.findIndex(c => c.calamityStack && !c.blocked);
    if (i < 0) continue;
    assert.ok(s.run.board[i].stack.length >= 1, 'pre-pila => stack>=1');
    const before = s.run.board[i].stack.length;
    const res = placeStack(s, i);                 // pila del pool encima
    assert.ok(!res.error, `placeStack sobre pre-pila debe funcionar, dio ${JSON.stringify(res.error)}`);
    assert.ok(res.run.board[i].stack.length > before, 'la pila crece al colocar encima');
    done = true;
  }
  assert.ok(done, 'ninguna semilla produjo pre-pila colocable');
});


// ---------------------------------------------------------------------------
// T8 — idle / offline
// ---------------------------------------------------------------------------
test('T8.1 3 sistemas suman online', () => {
  let s = baseRun(); s.progress.coins = 0;
  s = tickIdle(s, 10);
  // rates default 0.5/0.3/0.8 = 1.6/s -> 16 coins in 10s
  assert.ok(Math.abs(s.progress.coins - 16) < 1e-6);
});
test('T8.2 offline con tope por sistema', () => {
  let s = baseRun(); s.progress.coins = 0;
  s.idle = {
    workers:  { level: 1, ratePerSec: 0.5, cap: 60 },
    fame:     { level: 1, ratePerSec: 0.3, cap: 100 },
    machines: { level: 1, ratePerSec: 0.8, cap: 40 },
  };
  s.meta.lastSeenAt = 0;
  s = applyOffline(s, 10000);
  // caps: workers min(0.5*10000,60)=60, fame min(3000,100)=100, machines=min(8000,40)=40 -> 200
  assert.equal(s.meta.offlineReport.machines, 40);
  assert.equal(s.meta.offlineReport.workers, 60);
  assert.ok(s.progress.coins > 0);
});
test('T8.3 via 1 nivel: rate/cap suben', () => {
  let s = richState();
  s = buyIdleUpgrade(s, 'machines');
  assert.equal(s.idle.machines.level, 2);
  assert.equal(s.idle.machines.ratePerSec, 1.6);
  assert.equal(s.idle.machines.cap, 80);
});

// ---------------------------------------------------------------------------
// T9 — colores
// ---------------------------------------------------------------------------
test('T9.1 +1 color cada 3 productos', () => {
  assert.equal(colorsUnlocked(0), 1);
  assert.equal(colorsUnlocked(2), 1);
  assert.equal(colorsUnlocked(3), 2);
  assert.equal(colorsUnlocked(5), 2);
  assert.equal(colorsUnlocked(6), 3);
  assert.equal(colorsUnlocked(15), 6);
});
test('T9.2 solo colores desbloqueados', () => {
  // v2.1-clients: el pool genera 1..colorsOwned (presión R13.5: por DEBAJO del
  // roster); los clientes pueden pedir 1..rosterIndex (rosterMax=colorsOwned+1).
  let s = createGame({ progress: { boardCells: 16, productsBought: 0, colorsOwned: 2 } });
  s.progress.colorsUnlocked = 2;
  s = openRun(s, rng(4));
  assert.equal(s.run.rosterIndex, 3);            // rosterMax = colorsOwned+1 = 3
  for (const pile of s.run.pool) for (const c of pile) assert.ok(c >= 1 && c <= 2);
  for (const o of s.run.activeClients) assert.ok(o.color >= 1 && o.color <= 3);
});
test('T9.3 tope 10 colores (MAX_COLORS v2)', () => {
  // v2-reconcile: R13.7 (MAX_COLORS=10) reemplaza el tope v1 de 6 en
  // colorsUnlocked; la progresión permanente v2 es colorsOwned vía buyColor.
  assert.equal(CONFIG.MAX_COLORS, 10);
  assert.equal(colorsUnlocked(0), 1);
  assert.equal(colorsUnlocked(27), 10);   // 1+floor(27/3)=10
  assert.equal(colorsUnlocked(1000), 10); // clamp a MAX_COLORS=10
  // comprar colores sube colorsOwned hasta 10 (R13.7) y luego {error:'maxed'}
  let s = createGame({ progress: { coins: 1000000, colorsOwned: 9 } });
  s = buyColor(s);
  assert.equal(s.progress.colorsOwned, 10);
  const res = buyColor(s);
  assert.equal(res.error, 'maxed');
});

// ---------------------------------------------------------------------------
// R3.1 — pool mono-color (regression: multicolor-pool bug)
// ---------------------------------------------------------------------------
test('R3.1 pool de openRun v2: cada pila es de UNICO color', () => {
  // v2-reconcile: la firma v2 de generateBoard es (n, rng) y retorna el BOARD
  // (R14.1, sin pool); el pool monocromo nace en openRun (R13.3). Se testea el
  // pool de openRun sobre 32 semillas (v2Pile: tamaños 1..4, un solo color).
  // v2-shape: 30 → 32 semillas (count alineado con el nuevo board de 32 celdas).
  for (let g = 1; g <= 32; g++) {
    const s = openRun(createGame({ progress: { coins: 1000 } }), rng(g));
    assert.equal(s.run.pool.length, 3);
    for (const pile of s.run.pool) {
      assert.ok(pile.length >= 1 && pile.length <= 4, 'pile size in 1..4 (R13.3)');
      for (const c of pile) assert.equal(c, pile[0], 'pile must be one color');
    }
  }
});

test('R3.1 refill en placeStack: pilas nuevas son mono-color', () => {
  let s = baseRun(); s.progress.colorsUnlocked = 3;
  s = placeStack(s, 0, 0);
  s = placeStack(s, 1, 1);
  s = placeStack(s, 2, 2, rng(9)); // 3a coloca -> refill con rng inyectado
  assert.equal(s.run.pool.length, 3);
  for (const pile of s.run.pool) for (const c of pile) assert.equal(c, pile[0]);
});

test('R3.1 determinismo: misma semilla -> mismo pool tras refill', () => {
  const refill = (seed) => {
    let s = baseRun(); s.progress.colorsUnlocked = 3;
    s = placeStack(s, 0, 0);
    s = placeStack(s, 1, 1);
    s = placeStack(s, 2, 2, rng(seed));
    return s.run.pool;
  };
  assert.deepEqual(refill(3), refill(3));
  assert.deepEqual(refill(11), refill(11));
});

test('R7.7 REFRESH pool genera pilas mono-color y deterministas', () => {
  const refresh = () => {
    let s = baseRun(); s.progress.colorsUnlocked = 3;
    s.skills.refreshPool.owned = true; s.skills.refreshPool.uses = 2;
    return useRefreshPool(s, rng(21)).run.pool;
  };
  const p1 = refresh();
  assert.equal(JSON.stringify(p1), JSON.stringify(refresh()));
  for (const pile of p1) for (const c of pile) assert.equal(c, pile[0]);
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function baseRun() {
  const s = createGame({ progress: { coins: 1000 } });
  s.run = {
    phase: 'open',
    orders: [{ id: 'o0', color: 2, qty: 3, served: false },
             { id: 'o1', color: 1, qty: 2, served: false }],
    board: [
      { id: 'c0', q: 0, r: 0, stack: [], blocked: false, calamity: false, calamityStack: false },
      { id: 'c1', q: 1, r: 0, stack: [], blocked: false, calamity: false, calamityStack: false },
      { id: 'c2', q: -1, r: 0, stack: [], blocked: false, calamity: false, calamityStack: false },
    ],
    pool: [[1, 1], [2, 2], [3]],
    poolPlaced: 0,
    calamities: 0,
  };
  return s;
}
function serve(s, id, cellIdx) {
  const order = s.run.orders.find((o) => o.id === id);
  if (!order || order.served) return { error: 'noOrder' };
  const cell = s.run.board[cellIdx];
  const stack = cell.stack || [];
  const topC = stack[stack.length - 1];
  let n = 0;
  for (let i = stack.length - 1; i >= 0; i--) { if (stack[i] !== topC) break; n++; }
  if (topC !== order.color || n < order.qty) return { error: 'notEnough' };
  cell.stack.splice(stack.length - order.qty, order.qty);
  order.served = true;
  s.progress.coins += pay(order, 0);
  return s;
}
function richState() {
  return createGame({ progress: { coins: 100000 } });
}