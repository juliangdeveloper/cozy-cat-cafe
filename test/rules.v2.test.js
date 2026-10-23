import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = (n) => mulberry32(n);

const need = (fnName) => {
  const v = G[fnName];
  if (fnName === 'CONFIG') {
    assert.ok(v && typeof v === 'object', 'RED: export CONFIG no implementado');
    return;
  }
  assert.ok(typeof v === 'function', `RED: export ${fnName} no implementado`);
};

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 1000 } });
  if (typeof G.openRun === 'function') return G.openRun(s, rng(seed)) || s;
  return s;
};

const unwind = (ret, fallback) =>
  (ret && ret.state) ? ret.state : (ret && ret.progress ? ret : fallback);

function parkOrders(s) {
  const park = (o) => { if (o) { o.color = 10; o.qty = 99; } };
  if (s && s.run) {
    (s.run.orders || []).forEach(park);
    (s.run.activeClients || []).forEach(park);
  }
  return s;
}

test('T11a [R12.1 v3] merge hexasort: grupo contiguo fusiona; fuente conserva sub-pila; target = no-receptor', () => {
  need('createGame'); need('placeStack'); need('resolveCascade');
  const s = mkGame();
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  parkOrders(s);
  const placed = G.placeStack(s, 1, 0, [5, 2]);
  const src = unwind(placed, s);
  assert.deepEqual(src.run.board[1].stack, [1, 5, 2], 'RED: placeStack apila la pila en D sin fusionar');
  assert.deepEqual(src.run.board[0].stack, [2, 2], 'RED: placeStack NO muta al vecino');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[0].stack, [2, 2, 2], 'RED: A (no-receptor, torre) absorbe la racha => [2,2,2]');
  assert.deepEqual(st.run.board[1].stack, [1, 5], 'RED: D (fuente) conserva su sub-pila [1,5]');
  assert.ok(res.steps >= 1, 'RED: el merge debe ocurrir en cascada (steps>=1)');
});

test('T11b [R12.1] merge: vecino de tope color distinto NO se fusiona ni muta', () => {
  need('createGame'); need('placeStack');
  const s = mkGame();
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [3, 3];
  D.stack = [1];
  const beforeA = JSON.stringify(A.stack), beforeD = JSON.stringify(D.stack);
  const ret = G.placeStack(s, 1, 0, [2]);
  const st = unwind(ret, s);
  assert.equal(JSON.stringify(st.run.board[0].stack), beforeA, 'RED: A (color distinto) no debe mutarse');
  assert.equal(JSON.stringify(st.run.board[1].stack), beforeD, 'RED: D no debe fusionar color distinto');
});

test('T11c [R15.2 + R12.2] orden eslabon: auto-servir ANTES de evaluar umbral', () => {
  need('createGame'); need('placeStack'); need('resolveCascade');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o11c', color: 2, qty: 3, cell: null, served: false });
  s.run.activeClients = [s.run.orders[0]];
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 1, 0, [2]);
  const src = unwind(ret, s);
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  const Dtop = st.run.board[1].stack;
  assert.ok(!Dtop || Dtop.filter(c => c === 2).length === 0, 'RED: auto-serve debe consumir 3 del tope de D');
  const o = st.run.orders.find(o => o.id === 'o11c');
  assert.ok(o && o.served, 'RED: order.served debe ser true tras auto-servir');
  assert.equal(st.progress.coins, 1000 + Math.round(5 * 3 ** 1.25), 'RED: coins debe subir exactamente pay(order)=20');
});

test('T11d [R12.2] resolveCascade es pura: {state, steps}; estable => steps 0 y no muta', () => {
  need('createGame'); need('resolveCascade');
  const s = mkGame();
  parkOrders(s);
  s.run.board[0].stack = [1, 1];
  const snapshot = JSON.stringify(s);
  const res = G.resolveCascade(s);
  assert.ok(res && typeof res === 'object' && 'state' in res && 'steps' in res,
    'RED: resolveCascade debe retornar {state, steps}');
  assert.equal(res.steps, 0, 'RED: estado estable => steps === 0');
  assert.deepEqual(res.state, JSON.parse(snapshot), 'RED: resolveCascade no debe mutar el estado de entrada (deep-equal)');
  const s2 = mkGame();
  parkOrders(s2);
  s2.run.board[0].stack = Array.from({ length: 10 }, () => 4);
  const res2 = G.resolveCascade(s2);
  assert.ok(res2.steps >= 1, 'RED: con mutación pendiente steps >= 1');
});

test('T11e [R12.3] debris: grupo contiguo de 10 fichas color 1 => destruido y coins += 250', () => {
  need('createGame'); need('CONFIG'); need('resolveCascade');
  assert.equal(G.CONFIG.DEBRIS_THRESHOLD, 10, 'RED: CONFIG.DEBRIS_THRESHOLD debe ser 10');
  assert.equal(G.CONFIG.DEBRIS_BONUS_PER, 25, 'RED: CONFIG.DEBRIS_BONUS_PER debe ser 25');
  const s = mkGame();
  parkOrders(s);
  s.run.board[0].stack = Array.from({ length: 10 }, () => 1);
  const coinsBefore = s.progress.coins;
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.equal(st.run.board[0].stack.length, 0, 'RED: stack debe perder las 10 fichas (grupo destruido)');
  assert.equal(st.progress.coins, coinsBefore + G.debrisPay(10), 'RED: un run de 10 paga ×4');
});

test('T12a [R13.1] pedido sin order.cell es servible desde CUALQUIER celda', () => {
  need('createGame'); need('orderReadyOn');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12a', color: 2, qty: 3, cell: null, served: false });
  s.run.activeClients = [s.run.orders[0]];
  s.run.board[3].stack = [1, 2, 2, 2];
  assert.equal(G.orderReadyOn(s, 'o12a', 3), true, 'RED: pedido flotante debe ser servible desde cualquier celda (c3)');
  s.run.board[3].stack = [1];
  s.run.board[5].stack = [2, 2, 2];
  assert.equal(G.orderReadyOn(s, 'o12a', 5), true, 'RED: pedido flotante servible desde otra celda cualquiera (c5)');
});

test('T12b [R15.2] match determinista: elige tope count mas cercano SIN exceder (luego menor disponible)', () => {
  need('createGame'); need('resolveCascade');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12b', color: 2, qty: 3, cell: null, served: false });
  s.run.activeClients = [s.run.orders[0]];
  s.run.board[0].stack = [2, 2, 2];
  s.run.board[10].stack = [2, 2, 2, 2];
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.ok(st.run.orders.find(o => o.id === 'o12b').served, 'RED: debe auto-servir');
  assert.equal(st.run.board[0].stack.length, 0, 'RED: debe elegir la celda con tope count 3 (cercano sin exceder)');
  assert.deepEqual(st.run.board[10].stack, [2, 2, 2, 2], 'RED: la celda no elegida queda intacta');

  const s2 = mkGame();
  s2.run.orders.length = 0;
  s2.run.orders.push({ id: 'o12b2', color: 2, qty: 3, cell: null, served: false });
  s2.run.activeClients = [s2.run.orders[0]];
  s2.run.board[0].stack = [2, 2, 2, 2, 2];
  s2.run.board[10].stack = [2, 2, 2, 2, 2, 2];
  const res2 = G.resolveCascade(s2);
  const st2 = unwind(res2, s2);
  assert.ok(st2.run.orders.find(o => o.id === 'o12b2').served, 'RED: debe auto-servir');
  assert.equal(st2.run.board[0].stack.length, 2, 'RED: debe elegir la celda con tope count 5 (menor disponible)');
  assert.deepEqual(st2.run.board[10].stack, [2, 2, 2, 2, 2, 2], 'RED: la celda no elegida debe quedar intacta');
});

test('T12c [R4.3 v2] servir consume EXACTAMENTE qty del tope (excedente queda)', () => {
  need('createGame'); need('serveOrder');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12c', color: 2, qty: 3, cell: null, served: false });
  s.run.activeClients = [s.run.orders[0]];
  s.run.board[0].stack = [2, 2, 2, 2, 2];
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
  s.run.activeClients = [s.run.orders[0]];
  s.run.board[0].stack = [2, 2, 2, 2, 2];
  const coinsBefore = s.progress.coins;
  const ret = G.serveOrder(s, 'o12d', 0);
  const st = unwind(ret, s);
  const expected = Math.round(5 * qty ** 1.25);
  assert.equal(st.progress.coins, coinsBefore + expected, `RED: coins debe subir exactamente pay(order)=${expected}`);
});

test('T12e [R15.2] a matching top always auto-serves', () => {
  need('createGame'); need('resolveCascade');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12e', color: 2, qty: 3, cell: null, served: false });
  s.run.activeClients = [s.run.orders[0]];
  s.run.board[0].stack = [2, 2, 2];
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  assert.ok(st.run.orders.find(o => o.id === 'o12e').served, 'a matching top always auto-serves');
  assert.equal(st.run.board[0].stack.length, 0, 'the matching top is consumed');
});

test('T12f [R4.3] serveOrder(state, orderId) without a cell still serves the closest top', () => {
  need('createGame'); need('serveOrder');
  const s = mkGame();
  s.run.orders.length = 0;
  s.run.orders.push({ id: 'o12f', color: 2, qty: 3, cell: null, served: false });
  s.run.activeClients = [s.run.orders[0]];
  s.run.board[0].stack = [2, 2, 2, 2, 2];
  const coinsBefore = s.progress.coins;
  let ret;
  try {
    ret = G.serveOrder(s, 'o12f');
  } catch (e) {
    assert.fail('RED: serveOrder manual (state, orderId) sin cellId no implementado: ' + e.message);
  }
  assert.ok(!(ret && ret.error), 'RED: serveOrder manual debe servir (match determinista con el pedido)');
  const st = unwind(ret, s);
  assert.deepEqual(st.run.board[0].stack, [2, 2], 'RED: consume exactamente qty=3, excedente [2,2] queda');
  assert.ok(st.run.orders.find(o => o.id === 'o12f').served, 'RED: pedido served');
  assert.equal(st.progress.coins, coinsBefore + Math.round(5 * 3 ** 1.25), 'RED: paga pay(order)=20');
});
