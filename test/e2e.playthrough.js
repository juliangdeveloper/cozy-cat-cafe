// e2e PLAYTHROUGH v2.1 — drives the real game.js (the module the app imports).
// Simulates a SKILLED player on the v2.1 rules (RULES.md R16/R17):
//   openRun v2.1 (R13.3: rosterIndex arranca en 5 = rosterMax(colorsOwned);
//   pool monocromo 1..colorsOwned, board 32 con núcleo 2-3-2 jugable) → cola
//   de clientes PEREZOSA (R16.3: 3 VISIBLES dibujados, el resto al servir) →
//   placeStack (firma v2 state,cellId,slot,rng) → resolveCascade (R12.2 merge
//   + R12.3 escombros + R16.4 auto-serve de los 3 visibles) → presión de
//   compra buyColor (R13.5/R13.7: el color sobre el techo no se genera en
//   pool, y los clientes pueden pedirlo) → victoria R16.4:
//   clientsServed === totalClients(state) (20 la primera partida) sirviendo a
//   TODOS los clientes llegados (de a 3 visibles; useQueueSkip R17.1 si hace
//   falta para completar) → closeRun('allServed').
// Sin DOM, rng inyectado para el board, asserts duros.
//
// v2.1-clients: reemplaza el playthrough v2 (roster crecía cada 3 pilas y
// victoria = orders.length servidas) por el flujo v2.1 con cola de clientes.
import { createGame, openRun, placeStack, resolveCascade, closeRun, buyColor, buySkill,
         useQueueSkip, useRefreshPool, activateTile, buyTablesUp, buyUsesUp, topGroup,
         totalClients, runVictory, serializeState, deserializeState, mulberry32, CONFIG, HEX_ADJ } from '../js/game.js';
import assert from 'node:assert/strict';

let state = createGame({ progress: { coins: 20000 } });
// celda objetivo fijada por pedido (order.id -> índice de celda) — solo pins
// de clientes VISIBLES no servidos; se limpia en cada shift
const targetByOrder = new Map();

const rng = (n) => mulberry32(n);
// celdas JUGABLES (no dormant, no blocked) — v2 R14.2: solo ahí se coloca
const playableIdx = (s) =>
  s.run.board.map((c, i) => ({ c, i }))
    .filter((x) => !x.c.dormant && !x.c.blocked).map((x) => x.i);

// v2.1: los clientes son pedidos FLOTANTES (cell:null) — así resolveCascade
// los auto-sirve con el match determinista R15.2 (bestServeCell). openRun no
// setea el campo; se normaliza aquí.
const floatOrders = (s) => {
  for (const o of s.run.orders) if (o.cell === undefined) o.cell = null;
  return s;
};

// limpiar pins de pedidos ya servidos o no visibles (la cola rota clientes)
const prunePins = (s) => {
  const live = new Set(s.run.activeClients.filter(o => !o.served).map(o => o.id));
  for (const k of [...targetByOrder.keys()]) if (!live.has(k)) targetByOrder.delete(k);
};

// v2.1 R13.5: techo del roster = colorsOwned<10 ? colorsOwned+1 : 10
const rosterCap = (owned) => owned < CONFIG.MAX_COLORS ? owned + 1 : CONFIG.MAX_COLORS;

// un paso del jugador: sirve lo listo de los VISIBLES, compra color si hace
// falta (R13.5/R13.7) y coloca UNA pila del pool (firma v2). Devuelve false
// si no pudo colocar. NOTE: placeStack/buyColor retornan el ESTADO en éxito y
// {error[,state]} en fallo — unwrap: (res.state ?? res).
const unwrap = (res) => (res && res.state !== undefined ? res.state : res);
// growth=true (fase 1): basta COLOCAR cualquier pila en celda vacía (cada
// colocación cuenta para placedCounter/roster R13.4); sin espacio → activar
// baldosa (skill tables) → refresh → 'full'.
function step(seed, n, growth = false) {
  state = floatOrders(state);
  state = resolveCascade(state).state; // merge + escombros + auto-serve visibles (R16.4)
  prunePins(state);
  const owned = state.progress.colorsOwned;
  // objetivo: primer VISIBLE no servido que se pueda servir ya (color ≤ owned);
  // si ninguno, el primero que exija comprar su color (≤ roster ≤ MAX_COLORS)
  const vis = state.run.activeClients.filter((o) => !o.served);
  let o = vis.find((x) => x.color <= owned)
       ?? vis.find((x) => x.color > owned);

  // presión de compra: un cliente pide un color por ENCIMA de colorsOwned —
  // no aparece en el pool (R13.5): hay que comprar el color (R13.7).
  if (o && o.color > owned) {
    const res = buyColor(state);
    assert.ok(!res.error, `buyColor debería financiar el color ${o.color} (R13.7)`);
    state = unwrap(res);
    return true;
  }

  // pila a colocar: del color del pedido si hay; si no CUALQUIERA (colocar
  // pilas rellena el pool y puede habilitar el color de un cliente visible).
  let slot = -1;
  if (o) slot = state.run.pool.findIndex((p) => p.length > 0 && p[0] === o.color);
  if (slot < 0) slot = state.run.pool.findIndex((p) => p.length > 0);
  if (slot < 0) return false;

  const playable = playableIdx(state);
  const board = state.run.board;
  // v2.2 R3.5: placeStack SOLO en celdas VACÍAS. Estrategia del jugador hábil:
  // NO sembrar basura — (a) crecer racha: vacía junto a tope del MISMO color
  // (merge R12.1 acumula → auto-serve o umbral de escombros); (b) sembrar el
  // color del pedido en cualquier vacía; (c) si no hay jugada útil, refrescar
  // pool / activar baldosa / rotar cola (en ese orden, ahorrando usos).
  const empty = playable.filter((i) => board[i].stack.length === 0);
  const pinned = new Set(targetByOrder.values());
  const adjTop = (i, color) => {
    const ci = board[i];
    return playable.some((j) => {
      const c = board[j];
      if (!c.stack || !c.stack.length || c.stack[c.stack.length - 1] !== color) return false;
      return HEX_ADJ.some(([dq, dr]) => c.q + dq === ci.q && c.r + dr === ci.r);
    });
  };
  const poolColors = [...new Set(state.run.pool.flat())];
  const t = growth
    // (growth) cualquier vacía — colocación cuenta para el roster sin más
    ? empty.find((i) => !pinned.has(i))
    // (a) crecer racha del color del pedido (o de cualquier color del pool)
    : ((o && empty.find((i) => !pinned.has(i) && adjTop(i, o.color)))
    ?? empty.find((i) => !pinned.has(i) && poolColors.some((c) => adjTop(i, c)))
    // (b) sembrar el color del pedido
    ?? (o && state.run.pool[slot][0] === o.color ? empty.find((i) => !pinned.has(i)) : undefined));
  if (t === undefined) {
    // (c) sin jugada útil: activar espacio (growth primero) → refresh → nada
    const dt = state.run.board.findIndex(c => c.dormant && !c.blocked);
    const skt = state.skills.tables;
    if (dt >= 0 && skt && skt.owned && skt.uses > 0) {
      const ra = activateTile(state, dt, rng(seed * 7 + n));
      if (!ra.error) { state = ra; return true; }
    }
    const sk = state.skills.refreshPool;
    if (sk && sk.owned && sk.uses > 0) {
      const rr = useRefreshPool(state, rng(seed * 31 + n));
      if (!rr.error) { state = rr; return true; }
    }
    if (!growth && o && o.color > state.progress.colorsOwned) {
      // sin espacio y sin usos: si faltaba comprar el color del pedido, comprarlo
      const rc = buyColor(state);
      if (!rc.error) { state = unwrap(rc); return true; }
    }
    return 'full';  // v2.2: tablero sin jugadas y sin válvulas → cierre legítimo
  }
  if (o && state.run.pool[slot][0] === o.color) targetByOrder.set(o.id, t);
  const res = placeStack(state, t, slot, rng(seed + n)); // firma v2
  if (res.error) return false;
  state = resolveCascade(unwrap(res)).state;
  prunePins(state);
  return true;
}

function play(seed) {
  // v2.2 R14.4/R17.2: el jugador hábil invierte ANTES de abrir (openRun repone
  // uses = base + usesBought): skills nivel 1 + capacidad permanente de válvulas
  // (+4 mesas/partida, +3 refresh, +3 skips) para no quedarse hard-stuck.
  // RETORNA 'victory' | 'full' — el final 'full' (tablero lleno sin jugadas) es
  // un cierre LEGÍTIMO con la regla v2.2 (pool de 3 vs 7 celdas: puede no haber
  // jugada útil y no quedar válvulas; R2.3 lo contempla).
  if (!state.skills.tables.owned) {
    const rt = buyTablesUp(state); if (!rt.error) state = rt;
  }
  if (!state.skills.refreshPool.owned) {
    const r1 = buySkill(state, 'refreshPool'); if (!r1.error) state = r1;
  }
  if (!state.skills.queueSkip.owned) {
    const r2 = buySkill(state, 'queueSkip'); if (!r2.error) state = r2;
  }
  if (state.progress.totalGames === 0) {
    for (let k = 0; k < 4; k++) { const r = buyTablesUp(state); if (r.error) break; state = r; }
    for (let k = 0; k < 3; k++) { const r = buyUsesUp(state, 'refreshPool'); if (r.error) break; state = r; }
    for (let k = 0; k < 3; k++) { const r = buyUsesUp(state, 'queueSkip'); if (r.error) break; state = r; }
  }
  state = floatOrders(openRun(state, rng(seed)));
  targetByOrder.clear();
  const startRoster = state.run.rosterIndex;
  const startOwned = state.progress.colorsOwned;
  // v2.1 R13.5: techo del roster por fórmula rosterMax(colorsOwned)
  const cap = rosterCap(startOwned);
  const TOTAL = totalClients(state); // R16.1: 20 + capacidad.level (tope 100)
  console.log(`\n=== Shift #${state.progress.totalGames + 1} — board ${state.run.board.length} (7 jugables) · colorsOwned ${startOwned} · roster ${startRoster}/${cap} · cola TOTAL ${TOTAL} (drawn ${state.run.clientsDrawn}) ===`);

  // asserts de arranque de cola (R16.2/R16.3/R16.4)
  assert.equal(state.run.activeClients.length, 3, 'R16.4: 3 visibles al abrir');
  assert.equal(state.run.clientsDrawn, 3, 'R16.3: llegada perezosa — 3 dibujados al abrir');
  assert.equal(state.run.clientsServed, 0, 'R16.3: clientsServed nace 0');
  assert.deepEqual(state.run.queueBack, [], 'R17.1: queueBack nace vacía');
  assert.equal(runVictory(state), false, 'R16.4: run recién abierta NO es victoria');

  // Fase 1 — crecimiento: colocar pilas hasta que el roster llegue a su techo
  // rosterMax (R13.5: avanza cada UNLOCK_PLACED_PILES=3 pilas hasta la fórmula).
  // v2.2: basta COLOCAR en vacía (growth); si no hay espacio ni usos → 'full'.
  let endedFull = false;
  let guard = 0;
  while (state.run.rosterIndex < cap && guard++ < 5000) {
    const gr = step(seed, guard, true);
    if (gr === 'full') { endedFull = true; break; }
    assert.ok(gr, 'fase crecimiento: debe poder colocar/activar/refrescar');
  }
  if (endedFull) {
    state = closeRun(state, 'full');
    assert.equal(state.metaClose.victory, false, 'R2.6: full NO es victoria');
    console.log(`  => fase 1 sin espacio (cierre 'full' legítimo v2.2, roster ${state.run ? state.progress.colorsOwned : startRoster})`);
    return 'full';
  }
  assert.equal(state.run.rosterIndex, cap, 'R13.5: el roster debe llegar a su techo (fórmula rosterMax)');

  // Fase 2 — cierre: servir a TODOS los clientes de la cola (victoria R16.4)
  // o quedarse sin jugadas → cierre 'full' LEGÍTIMO (v2.2 R2.3: tablero lleno).
  let lastServed = -1, stuck = 0, skips = 0;
  guard = 0;
  while (state.run.clientsServed < TOTAL && guard++ < 20000) {
    const sr = step(seed, guard);
    if (sr === 'full') { endedFull = true; break; }
    if (!sr) {
      // sin colocación posible: rotar la cola si quedan usos de queueSkip
      if (state.skills.queueSkip && state.skills.queueSkip.owned && state.skills.queueSkip.uses > 0) {
        const r = useQueueSkip(state);
        if (!r.error) { state = r; skips++; stuck = 0; continue; }
      }
      // v2.2 diagnóstico: dump del estado real en el atasco
      console.error('STUCK DUMP:', JSON.stringify({
        served: state.run.clientsServed, drawn: state.run.clientsDrawn,
        emptyPlayable: state.run.board.filter(c => !c.dormant && !c.blocked && !(c.stack && c.stack.length)).length,
        dormantFree: state.run.board.filter(c => c.dormant && !c.blocked).length,
        tables: state.skills.tables,
        refresh: state.skills.refreshPool,
        queue: state.skills.queueSkip,
        queueBack: (state.run.queueBack || []).length,
        pool: state.run.pool.map(p => p.length),
        visibles: state.run.activeClients.map(o => ({ c: o.color, q: o.qty })),
      }));
      assert.fail('fase cierre: step no pudo colocar ni rotar la cola'); }
    if (state.run.clientsServed === lastServed) {
      if (++stuck > 300) {
        // atasco: rotar la cola (R17.1) para traer clientes servibles
        if (state.skills.queueSkip && state.skills.queueSkip.owned && state.skills.queueSkip.uses > 0) {
          const r = useQueueSkip(state);
          if (!r.error) { state = r; skips++; stuck = 0; continue; }
        }
        assert.fail('fase cierre: sin progreso en 300 pasos y sin queueSkip');
      }
    } else { stuck = 0; lastServed = state.run.clientsServed; }
  }
  const served = state.run.clientsServed;
  if (endedFull) {
    // v2.2: final 'full' legítimo — el jugador se quedó sin jugadas (R2.3).
    // Se cierra SIN victoria, conservando las monedas. El e2e exige que al
    // menos 1 de los 8 shifts alcance la victoria real (checker abajo).
    state = closeRun(state, 'full');
    assert.equal(state.metaClose.reason, 'full');
    assert.equal(state.metaClose.victory, false, 'R2.6: full NO es victoria');
    console.log(`  => served ${served}/${TOTAL} (tablero sin jugadas — cierre 'full' legítimo v2.2)`);
    return 'full';
  }
  assert.equal(served, TOTAL, 'R16.4: victoria = clientsServed === TOTAL (todos los clientes servidos)');
  assert.equal(state.run.clientsDrawn, TOTAL, 'R16.3: la cola se agota exacta (clientsDrawn===TOTAL)');
  assert.equal(state.run.queueBack.length, 0, 'R17.1: sin devueltos pendientes al cerrar');
  assert.equal(state.run.activeClients.length, 0, 'R16.4: sin cola, los visibles se agotan');
  assert.ok(runVictory(state), 'R16.4: runVictory(state)===true');

  state = closeRun(state, 'allServed');
  assert.equal(state.metaClose.reason, 'allServed');
  assert.equal(state.metaClose.victory, true, 'R2.6: allServed es la única victoria');
  assert.equal(state.metaClose.served, TOTAL, 'R16.4: metaClose.served === clientsServed');
  assert.equal(state.metaClose.total, TOTAL, 'R16.4: metaClose.total === TOTAL efectivo');
  console.log(`  => served ${served}/${TOTAL} · roster ${startRoster}->${cap} · queueSkips ${skips} · coins=${Math.round(state.progress.coins)} ✅ VICTORY`);
  return 'victory';
}

let victories = 0;
for (let i = 0; i < 8; i++) {
  if (play(42 + i * 7) === 'victory') victories++;
}
console.log(`\nSHIFTS: ${victories}/8 victorias (${8 - victories} cierres 'full' legítimos)`);
assert.ok(victories >= 1, 'v2.2 e2e: al menos 1 de 8 shifts debe alcanzar la victoria real');
console.log(`\nFINAL coins=${Math.round(state.progress.coins)} games=${state.progress.totalGames} level=${state.progress.cafeLevel} colorsOwned=${state.progress.colorsOwned}`);
const json = serializeState(state);
const identical = JSON.stringify(deserializeState(json)) === JSON.stringify(state);
console.log('save roundtrip identical:', identical);
assert.ok(identical, 'R1.2 roundtrip del save debe ser idéntico');
console.log('E2E PLAYTHROUGH OK ✅');
