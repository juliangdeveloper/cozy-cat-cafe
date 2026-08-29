// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2 (node:test, no deps).
// Blocks T11-T12 only (T13-T15 are added by another agent).
// Source of truth: RULES.md §3 (T11..T12) + §2 (R12, R13, R15).
// v2 imports are DYNAMIC (inside before()) so the file parses/loads even
// while exports are missing; each test fails RED with a clear message.
// Run: node --test test/
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G; // module ../js/game.js (loaded in before())
test.before(async () => { G = await import('../js/game.js'); });

// helper rng: same mulberry32 as rules.test.js
const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = (n) => mulberry32(n);

// RED gate: assert an export exists, else fail with clear message
const need = (fnName) => {
  const v = G[fnName];
  if (fnName === 'CONFIG') {
    assert.ok(v && typeof v === 'object', 'RED: export CONFIG no implementado');
    return;
  }
  assert.ok(typeof v === 'function', `RED: export ${fnName} no implementado`);
};

// openRun (v1) RETORNA el estado con run abierto; sin él s.run es null
const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 1000 } });
  if (typeof G.openRun === 'function') return G.openRun(s, rng(seed)) || s;
  return s;
};

// board: array de 7 celdas {id:'c0'.., stack, blocked}; cellId = índice numérico
// (así funciona la v1: board[cellId]).
const unwind = (ret, fallback) =>
  (ret && ret.state) ? ret.state : (ret && ret.progress ? ret : fallback);

// ---------------------------------------------------------------------------
// T11 — Merge y cascada [R12]
// ---------------------------------------------------------------------------
test('T11a [R12.1] merge: vecino A top 2 se fusiona en D => D [1,2,2,2], A conserva sub-pila', () => {
  need('createGame'); need('placeStack');
  // GIVEN: estado construido a mano (createGame/openRun + mutación directa del board).
  // A = vecino con stack [2,2]; D = destino con stack [1].
  const s = mkGame();
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  // R12.1 // AMBIGUA: firma placeStack v1 es (state, cellId) con slot en ui —
  // v1 real es (state, cellId, slot, rng) y coloca pila del pool. Aquí se asume
  // la firma v2 (state, cellId, slot, stack) pasando la pila [2] explícita.
  const ret = G.placeStack(s, 1, 0, [2]);
  const st = unwind(ret, s);
  // THEN: el tope 2 de A se fusiona en D; A conserva [2].
  assert.deepEqual(st.run.board[1].stack, [1, 2, 2, 2], 'RED: D.stack debe ser [1,2,2,2] tras merge');
  assert.deepEqual(st.run.board[0].stack, [2], 'RED: A debe conservar su sub-pila [2]');
});

test('T11b [R12.1] merge: vecino de tope color distinto NO se fusiona ni muta', () => {
  need('createGame'); need('placeStack');
  const s = mkGame();
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [3, 3];        // color distinto del stack colocado (2)
  D.stack = [1];
  const beforeA = JSON.stringify(A.stack), beforeD = JSON.stringify(D.stack);
  // (misma firma asumida que T11a; ver comentario AMBIGUA ahí)
  const ret = G.placeStack(s, 1, 0, [2]);
  const st = unwind(ret, s);
  assert.equal(JSON.stringify(st.run.board[0].stack), beforeA, 'RED: A (color distinto) no debe mutarse');
  assert.equal(JSON.stringify(st.run.board[1].stack), beforeD, 'RED: D no debe fusionar color distinto');
});

test('T11c [R15.2 + R12.2] orden eslabon: auto-servir ANTES de evaluar umbral', () => {
  need('createGame'); need('placeStack'); need('resolveCascade');
  const s = mkGame();
  // pedido pendiente flotante {color:2, qty:3}
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o11c', color: 2, qty: 3, cell: null, served: false });
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 1, 0, [2]); // merge lleva tope de D a count 3 color 2
  const src = unwind(ret, s);
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  // THEN: auto-servir consume exactamente 3 del tope de D, ANTES del umbral
  const Dtop = st.run.board[1].stack;
  assert.ok(!Dtop || Dtop.filter(c => c === 2).length === 0, 'RED: auto-serve debe consumir 3 del tope de D');
  const o = st.run.orders.find(o => o.id === 'o11c');
  assert.ok(o && o.served, 'RED: order.served debe ser true tras auto-servir');
  // pay(order) = Math.round(5*3**1.25) = 20
  assert.equal(st.progress.coins, 1000 + Math.round(5 * 3 ** 1.25), 'RED: coins debe subir exactamente pay(order)=20');
});

test('T11d [R12.2] resolveCascade es pura: {state, steps}; estable => steps 0 y no muta', () => {
  need('createGame'); need('resolveCascade');
  const s = mkGame();
  s.run.board[0].stack = [1, 1]; // estable: sin merge ni threshold pendiente
  const snapshot = JSON.stringify(s);
  const res = G.resolveCascade(s);
  assert.ok(res && typeof res === 'object' && 'state' in res && 'steps' in res,
    'RED: resolveCascade debe retornar {state, steps}');
  assert.equal(res.steps, 0, 'RED: estado estable => steps === 0');
  assert.deepEqual(res.state, JSON.parse(snapshot), 'RED: resolveCascade no debe mutar el estado de entrada (deep-equal)');
  // con una mutación pendiente itera hasta estabilizar
  const s2 = mkGame();
  s2.run.board[0].stack = Array.from({ length: 10 }, () => 4); // debris threshold pendiente
  const res2 = G.resolveCascade(s2);
  assert.ok(res2.steps >= 1, 'RED: con mutación pendiente steps >= 1');
});

test('T11e [R12.3] debris: grupo contiguo de 10 fichas color 1 => destruido y coins += 250', () => {
  need('createGame'); need('CONFIG'); need('resolveCascade');
  assert.equal(G.CONFIG.DEBRIS_THRESHOLD, 10, 'RED: CONFIG.DEBRIS_THRESHOLD debe ser 10');
  assert.equal(G.CONFIG.DEBRIS_BONUS_PER, 25, 'RED: CONFIG.DEBRIS_BONUS_PER debe ser 25');
  const s = mkGame();
  s.run.board[0].stack = Array.from({ length: 10 }, () => 1);
  const coinsBefore = s.progress.coins;
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.equal(st.run.board[0].stack.length, 0, 'RED: stack debe perder las 10 fichas (grupo destruido)');
  assert.equal(st.progress.coins, coinsBefore + 25 * 10, 'RED: coins debe subir 25*10=250');
});

// ---------------------------------------------------------------------------
// T12 — Auto-servir y pedidos flotantes [R13.1, R15.2]
// ---------------------------------------------------------------------------
test('T12a [R13.1] pedido sin order.cell es servible desde CUALQUIER celda', () => {
  need('createGame'); need('orderReadyOn');
  const s = mkGame();
  // pedido flotante (sin cell / cell null)
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12a', color: 2, qty: 3, cell: null, served: false });
  // tope color 2 count 3 en la celda 3
  s.run.board[3].stack = [1, 2, 2, 2];
  assert.equal(G.orderReadyOn(s, 'o12a', 3), true, 'RED: pedido flotante debe ser servible desde cualquier celda (c3)');
  // y también desde otra celda distinta (c5)
  s.run.board[3].stack = [1];
  s.run.board[5].stack = [2, 2, 2];
  assert.equal(G.orderReadyOn(s, 'o12a', 5), true, 'RED: pedido flotante servible desde otra celda cualquiera (c5)');
});

test('T12b [R15.2] match determinista: elige tope count mas cercano SIN exceder (luego menor disponible)', () => {
  need('createGame'); need('resolveCascade');
  // caso 1: topes count 3 (celda 0) y 4 (celda 1) => elige el de 3
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12b', color: 2, qty: 3, cell: null, served: false });
  s.run.board[0].stack = [2, 2, 2];
  s.run.board[1].stack = [2, 2, 2, 2];
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.ok(st.run.orders.find(o => o.id === 'o12b').served, 'RED: debe auto-servir');
  assert.equal(st.run.board[0].stack.length, 0, 'RED: debe elegir la celda con tope count 3 (cercano sin exceder)');

  // caso 2: topes 5 y 6, qty 3 => elige el de 5 (menor disponible)
  const s2 = mkGame();
  s2.run.orders.length = 0;
  s2.run.orders.push({ id: 'o12b2', color: 2, qty: 3, cell: null, served: false });
  s2.run.board[0].stack = [2, 2, 2, 2, 2];
  s2.run.board[1].stack = [2, 2, 2, 2, 2, 2];
  const res2 = G.resolveCascade(s2);
  const st2 = unwind(res2, s2);
  assert.ok(st2.run.orders.find(o => o.id === 'o12b2').served, 'RED: debe auto-servir');
  assert.equal(st2.run.board[0].stack.length, 2, 'RED: debe elegir la celda con tope count 5 (menor disponible)');
  assert.equal(st2.run.board[1].stack.length, 6, 'RED: la celda no elegida debe quedar intacta');
});

test('T12c [R4.3 v2] servir consume EXACTAMENTE qty del tope (excedente queda)', () => {
  need('createGame'); need('serveOrder');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12c', color: 2, qty: 3, cell: null, served: false });
  s.run.board[0].stack = [2, 2, 2, 2, 2]; // tope count 5
  const ret = G.serveOrder(s, 'o12c', 0);
  assert.ok(!(ret && ret.error), 'RED: serveOrder debe servir el pedido');
  const st = unwind(ret, s);
  assert.deepEqual(st.run.board[0].stack, [2, 2], 'RED: tope debe quedar en [2,2] (consume exactamente qty=3)');
  assert.ok(st.run.orders.find(o => o.id === 'o12c').served, 'RED: pedido debe quedar served');
});

test('T12d [R5.1] paga pay(order) exacto: Math.round(5*qty**1.25)', () => {
  need('createGame'); need('serveOrder');
  const s = mkGame();
  const qty = 3;
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12d', color: 2, qty, cell: null, served: false });
  s.run.board[0].stack = [2, 2, 2, 2, 2];
  const coinsBefore = s.progress.coins;
  const ret = G.serveOrder(s, 'o12d', 0);
  const st = unwind(ret, s);
  const expected = Math.round(5 * qty ** 1.25);
  assert.equal(st.progress.coins, coinsBefore + expected, `RED: coins debe subir exactamente pay(order)=${expected}`);
});

test('T12e [R15.2] autoServe=false => resolveCascade NO sirve; celda marcada servible', () => {
  need('createGame'); need('resolveCascade'); need('isServeReady');
  const s = mkGame();
  s.skills = s.skills || {};
  s.skills.serveManual = { autoServe: false };
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12e', color: 2, qty: 3, cell: null, served: false });
  s.run.board[0].stack = [2, 2, 2];
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.ok(!st.run.orders.find(o => o.id === 'o12e').served, 'RED: autoServe=false => NO debe auto-servir');
  assert.equal(G.isServeReady(st, 0), true, 'RED: celda con tope servible debe marcarse ready');
});

test('T12f [R15.2] autoServe=false: serveOrder(state, orderId) manual sirve igual que T12c', () => {
  need('createGame'); need('serveOrder');
  const s = mkGame();
  s.skills = s.skills || {};
  s.skills.serveManual = { autoServe: false };
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12f', color: 2, qty: 3, cell: null, served: false });
  s.run.board[0].stack = [2, 2, 2, 2, 2]; // tope count 5
  const coinsBefore = s.progress.coins;
  let ret;
  try {
    ret = G.serveOrder(s, 'o12f'); // firma manual v2: sin cellId
  } catch (e) {
    assert.fail('RED: serveOrder manual (state, orderId) sin cellId no implementado: ' + e.message);
  }
  assert.ok(!(ret && ret.error), 'RED: serveOrder manual debe servir (match determinista con el pedido)');
  const st = unwind(ret, s);
  assert.deepEqual(st.run.board[0].stack, [2, 2], 'RED: consume exactamente qty=3, excedente [2,2] queda');
  assert.ok(st.run.orders.find(o => o.id === 'o12f').served, 'RED: pedido served');
  assert.equal(st.progress.coins, coinsBefore + Math.round(5 * 3 ** 1.25), 'RED: paga pay(order)=20');
});
