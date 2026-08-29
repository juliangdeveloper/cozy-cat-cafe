// e2e PLAYTHROUGH v2 — drives the real game.js (the module the app imports).
// Simulates a SKILLED player on the v2 rules (RULES.md 2.0-draft):
//   openRun v2 (R13.3: 1 criatura/Gato, pool monocromo color 1, board 30 con
//   núcleo 2-3-2 jugable) → placeStack (firma v2 state,cellId,slot,rng en
//   celdas NO dormant) → resolveCascade (R12.2 merge + R12.3 escombros +
//   R15.2 auto-serve de pedidos flotantes) → desbloqueos cada 3 pilas
//   (R13.4: llega la siguiente criatura) → presión de compra buyColor
//   (R13.7: el color sobre el techo no se genera en pool) → victoria al
//   servir a TODAS las criaturas llegadas → closeRun('allServed').
// Sin DOM, rng inyectado, asserts duros.
//
// v2-reconcile: reemplaza el playthrough v1 (o.cell, board de 7, placeStack v1
// sin rng) por el flujo v2 completo.
import { createGame, openRun, placeStack, resolveCascade, closeRun, buyColor,
         topGroup, serializeState, deserializeState, mulberry32, CONFIG } from '../js/game.js';
import assert from 'node:assert/strict';

let state = createGame({ progress: { coins: 20000 } });
// celda objetivo fijada por pedido (order.id -> índice de celda) — se limpia
// en cada shift para no arrastrar objetivos de runs cerradas
const targetByOrder = new Map();

const rng = (n) => mulberry32(n);
// celdas JUGABLES (no dormant, no blocked) — v2 R14.2: solo ahí se coloca
const playableIdx = (s) =>
  s.run.board.map((c, i) => ({ c, i }))
    .filter((x) => !x.c.dormant && !x.c.blocked).map((x) => x.i);

// v2: los pedidos son FLOTANTES (cell:null) — así resolveCascade los
// auto-sirve con el match determinista R15.2 (bestServeCell sobre todo el
// board). openRun/placeStack no setean el campo; se normaliza aquí.
const floatOrders = (s) => {
  for (const o of s.run.orders) if (o.cell === undefined) o.cell = null;
  return s;
};

// un paso del jugador: sirve lo listo, compra color si hace falta (R13.7) y
// coloca UNA pila del pool (firma v2). Devuelve false si no pudo colocar.
// NOTE: placeStack/buyColor retornan el ESTADO en éxito y {error[,state]} en
// fallo — unwrap: (res.state ?? res).
const unwrap = (res) => (res && res.state !== undefined ? res.state : res);
function step(seed, n) {
  state = floatOrders(state);
  state = resolveCascade(state).state; // merge + escombros + auto-serve (R12.2)
  const o = state.run.orders.find((x) => !x.served);

  // presión de compra: un pedido por ENCIMA de colorsOwned no aparece en el
  // pool (R13.5) — hay que comprar el color (R13.7) para poder servirlo.
  if (o && o.color > state.progress.colorsOwned) {
    const res = buyColor(state);
    assert.ok(!res.error, `buyColor debería financiar el color ${o.color} (R13.7)`);
    state = unwrap(res);
    return true;
  }

  // pila a colocar: del color del pedido si hay; si no CUALQUIERA (colocar
  // pilas es lo que avanza placedCounter → R13.4 desbloqueo cada 3 → llegan
  // criaturas aunque todos los pedidos estén servidos al momento).
  let slot = -1;
  if (o) slot = state.run.pool.findIndex((p) => p.length > 0 && p[0] === o.color);
  if (slot < 0) slot = state.run.pool.findIndex((p) => p.length > 0);
  if (slot < 0) return false;

  const playable = playableIdx(state);
  const board = state.run.board;
  const forOrder = o && state.run.pool[slot][0] === o.color;
  // celda objetivo: para el pedido se FIJA por order.id (mapa) para acumular
  // el color en UNA celda — recalcularla cada paso fragmentaba los parciales
  // en celdas distintas y el pedido nunca juntaba qty. Vacía primero, luego
  // tope del color, si no cualquier jugable (el pool-path apila al tope sin
  // check). El STASH nunca cae en una celda con target fijado (la enterraría)
  // y prefiere celdas cuyo tope NO sea su color (evita runs ≥ DEBRIS_THRESHOLD
  // que dejan a resolveCascade saliendo por guard con runs gigantes).
  const stashColor = state.run.pool[slot][0];
  const pinned = new Set(targetByOrder.values());
  let t;
  if (forOrder) {
    t = targetByOrder.get(o.id);
    if (t === undefined || !playable.includes(t)) {
      t = playable.find((i) => !pinned.has(i) && board[i].stack.length === 0)
        ?? playable.find((i) => !pinned.has(i) && topGroup(board[i].stack).color === o.color)
        ?? playable.find((i) => !pinned.has(i))
        ?? playable[0];
      targetByOrder.set(o.id, t);
    }
  } else {
    t = playable.find((i) => !pinned.has(i) && board[i].stack.length === 0)
      ?? playable.find((i) => !pinned.has(i) && topGroup(board[i].stack).color !== stashColor)
      ?? playable.find((i) => !pinned.has(i))
      ?? playable[0];
  }
  const res = placeStack(state, t, slot, rng(seed + n)); // firma v2
  if (res.error) return false;
  state = resolveCascade(unwrap(res)).state;
  return true;
}

function play(seed) {
  state = floatOrders(openRun(state, rng(seed)));
  targetByOrder.clear();
  const startRoster = state.run.rosterIndex;
  const startOwned = state.progress.colorsOwned;
  // techo de criaturas llegadas (R13.5): rosterIndex <= colorsOwned+1 y < MAX_COLORS
  const cap = Math.min(startOwned + 1, CONFIG.MAX_COLORS - 1);
  console.log(`\n=== Shift #${state.progress.totalGames + 1} — board ${state.run.board.length} (7 jugables) · colorsOwned ${startOwned} · roster techo ${cap} ===`);

  // Fase 1 — crecimiento: colocar pilas hasta que hayan llegado TODAS las
  // criaturas posibles (R13.4: desbloqueo cada UNLOCK_PLACED_PILES=3 pilas).
  let guard = 0;
  while (state.run.rosterIndex < cap && guard++ < 5000) {
    assert.ok(step(seed, guard), 'fase crecimiento: siempre debe poder colocar');
  }
  assert.equal(state.run.rosterIndex, cap, 'R13.4: el roster debe llegar a su techo');
  assert.equal(state.run.orders.length, state.run.rosterIndex,
    'cada criatura llegada trae exactamente un pedido');

  // Fase 2 — cierre: construir y servir TODOS los pedidos de las criaturas
  // llegadas (victoria R2.3/R2.6 vía R13).
  while (guard++ < 20000) {
    if (!state.run.orders.some((o) => !o.served)) break;
    assert.ok(step(seed, guard), 'fase cierre: siempre debe poder colocar o comprar');
  }
  const served = state.run.orders.filter((o) => o.served).length;
  const total = state.run.orders.length;
  assert.equal(served, total, 'todas las criaturas llegadas deben ser servidas');

  state = closeRun(state, 'allServed');
  assert.equal(state.metaClose.reason, 'allServed');
  assert.equal(state.metaClose.victory, true, 'R2.6: allServed es la única victoria');
  console.log(`  => served ${served}/${total} · roster ${startRoster}->${cap} · coins=${Math.round(state.progress.coins)} ✅ VICTORY`);
}

for (let i = 0; i < 8; i++) {
  play(42 + i * 7);
}
console.log(`\nFINAL coins=${Math.round(state.progress.coins)} games=${state.progress.totalGames} level=${state.progress.cafeLevel} colorsOwned=${state.progress.colorsOwned}`);
const json = serializeState(state);
const identical = JSON.stringify(deserializeState(json)) === JSON.stringify(state);
console.log('save roundtrip identical:', identical);
assert.ok(identical, 'R1.2 roundtrip del save debe ser idéntico');
console.log('E2E PLAYTHROUGH OK ✅');
