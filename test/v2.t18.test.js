import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);

function parkOrders(s) {
  const park = (o) => { if (o) { o.color = 10; o.qty = 99; } };
  if (s && s.run) {
    (s.run.orders || []).forEach(park);
    (s.run.activeClients || []).forEach(park);
  }
  return s;
}
const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 10000 } });
  return parkOrders(unwind(G.openRun(s, rng(seed)), s));
};

test('T18a [R3.5 v2.2] placeStack sobre celda ocupada => {error:"occupied"} sin mutar (firma explícita)', () => {
  need('placeStack');
  const s = mkGame(1);
  const idx = s.run.board.findIndex(c => !c.blocked && !c.dormant);
  s.run.board[idx].stack = [2];
  const before = JSON.stringify(s);
  const ret = G.placeStack(s, idx, 0, [1]);
  assert.ok(ret && ret.error === 'occupied',
    `RED: colocar sobre ocupada debe dar {error:"occupied"}, dio ${JSON.stringify(ret && ret.error)}`);
  assert.equal(JSON.stringify(unwind(ret, s)), before, 'RED: occupied no debe mutar el estado');
});

test('T18b [R3.5 v2.2] placeStack (pool) sobre celda ocupada => {error:"occupied"} sin mutar', () => {
  need('placeStack');
  const s = mkGame(1);
  const idx = s.run.board.findIndex(c => !c.blocked && !c.dormant);
  s.run.board[idx].stack = [2];
  const before = JSON.stringify(s);
  const ret = G.placeStack(s, idx, 0);
  assert.ok(ret && ret.error === 'occupied',
    `RED: colocar pila del pool sobre ocupada debe dar {error:"occupied"}, dio ${JSON.stringify(ret && ret.error)}`);
  assert.equal(JSON.stringify(s), before, 'RED: occupied no debe mutar el estado');
});

test('T18c [R12.1 v3] fuente conserva sub-pila; la colocada es absorbida por la torre (no-receptor)', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 1, 0, [5, 2]);
  const src = unwind(ret, s);
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[0].stack, [2, 2, 2], 'RED: A (no-receptor) absorbe la racha => [2,2,2]');
  assert.deepEqual(st.run.board[1].stack, [1, 5], 'RED: D (fuente) conserva su sub-pila [1,5]');
});

test('T18d [R3.5 v2.2] colocar pila en baldosa vacía sigue OK (regresión)', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  const idx = s.run.board.findIndex(c => !c.blocked && !c.dormant);
  assert.equal(s.run.board[idx].stack.length, 0, 'GIVEN: la celda debe estar vacía');
  const ret = G.placeStack(s, idx, 0);
  assert.ok(!ret.error, `RED: colocar en vacía no debe dar error, dio ${JSON.stringify(ret && ret.error)}`);
  const placed = s.run.board[idx].stack.length + ((s.run.pool[0] || []).length);
  const pileLen = unwind(ret, s).run.board[idx].stack.length;
  const st = unwind(G.resolveCascade(unwind(ret, s)), s);
  assert.equal(st.run.board[idx].stack.length, pileLen, 'RED: la pila del pool debe quedar en la celda');
  assert.ok(pileLen >= 1 && pileLen <= 7, 'RED: tamaño de pila v2.0 en 1..7');
  assert.equal(st.run.poolPlaced, 1, 'RED: poolPlaced debe contar la colocación');
});

test('T18e [R14.2] placeStack en celda dormant => {error:"dormant"}', () => {
  need('placeStack');
  const s = mkGame(1);
  const idx = s.run.board.findIndex(c => c.dormant && !c.blocked);
  assert.ok(idx >= 0, 'GIVEN: debe existir una celda dormant');
  const ret = G.placeStack(s, idx, 0);
  assert.ok(ret && ret.error === 'dormant',
    `RED: colocar en dormant debe dar {error:"dormant"}, dio ${JSON.stringify(ret && ret.error)}`);
  assert.equal(s.run.board[idx].dormant, true, 'RED: dormant no debe activarse');
});