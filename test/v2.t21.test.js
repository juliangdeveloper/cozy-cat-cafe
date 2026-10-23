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

test('T21a [R12.4] ancla monocolor: la pila colocada drena al tope del vecino', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  const A = s.run.board[8], D = s.run.board[9];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 9, 0, [2, 2]);
  const src = unwind(ret, s);
  assert.equal(src.run.anchor, 9, 'RED: colocar monocolor debe marcar run.anchor=cellId');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[9].stack, [1, 2, 2, 2, 2],
    'RED: el ANCLA (D) debe absorber la racha de A => [1,2,2,2,2]');
  assert.deepEqual(st.run.board[8].stack, [],
    'RED: A (fuente) cede su run y queda vacía');
  assert.equal(st.run.anchor, undefined,
    'RED: el ancla debe eliminarse al final de la cascada');
});

test('T21b [R12.4] revelación de 2º grado: sub-pilas drenadas en eslabones siguientes', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  const A = s.run.board[14], D = s.run.board[15], B = s.run.board[16];
  A.stack = [2, 2];
  D.stack = [1];
  B.stack = [3, 2];
  const ret = G.placeStack(s, 15, 0, [2, 2]);
  const src = unwind(ret, s);
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[15].stack, [1, 2, 2, 2, 2, 2],
    `RED: el ancla debe juntar AMBOS runs de 2 => [1,2,2,2,2,2], dio ${JSON.stringify(st.run.board[15].stack)}`);
  assert.deepEqual(st.run.board[14].stack, [], 'RED: A queda vacía');
  assert.deepEqual(st.run.board[16].stack, [3], 'RED: B conserva sub-pila [3]');
});

test('T21c [R12.4] pila multicolor NO marca ancla: árbitro normal (regresión T18c)', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  const A = s.run.board[8], D = s.run.board[9];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 9, 0, [2, 5]);
  const src = unwind(ret, s);
  assert.ok(!src.run.anchor, 'RED: multicolor NO debe marcar ancla');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  const tops = [st.run.board[8].stack, st.run.board[9].stack];
  const a = tops[0], d = tops[1];
  const dTop = d.length ? d[d.length - 1] : 0;
  assert.ok(
    (a.length === 3 && d.length === 1) || (d.length === 3 && a.length === 0) || (dTop !== 2),
    `RED: sin ancla el árbitro decide (A=${JSON.stringify(a)} D=${JSON.stringify(d)})`);
  assert.ok(a.length !== 0 || d.length >= 1, 'RED: sanity boards');
});

test('T21d [R12.4] grupo sin ancla usa T1/R2 normal aunque haya ancla vigente', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  const board = s.run.board;
  const adj = (x, y) => G.HEX_ADJ.some(([dq, dr]) =>
    board[y].q === board[x].q + dq && board[y].r === board[x].r + dr);
  const playable = board.map((c, i) => ({ c, i })).filter(x => !x.c.dormant && !x.c.blocked && x.i !== 0 && x.i !== 1);
  const far = playable.find(x => !adj(1, x.i));
  assert.ok(far, 'RED: precondition — se necesita una celda jugable no adyacente al ancla');
  s.run.anchor = 1;
  s.run.board[1].stack = [5, 5];
  far.c.stack = [5, 5];
  const nb = board.map((c, i) => ({ c, i })).find(x => x.i !== far.i && !x.c.dormant && !x.c.blocked && adj(far.i, x.i));
  assert.ok(nb, 'RED: precondition — la celda lejana necesita una vecina jugable');
  nb.c.stack = [5];
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  const anchorLen = st.run.board[1].stack.length;
  assert.ok(anchorLen <= 2,
    `RED: el ancla absorbió fichas de un grupo sin ancla (stack=${JSON.stringify(st.run.board[1].stack)})`);
  assert.equal(st.run.anchor, undefined, 'RED: ancla eliminada al final');
});

test('T21e [R12.4] flujo pool: colocar del tray monocolor ancla; el ancla vive solo durante la cascada', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.run.pool = [[3, 3], [], []];
  s.run.poolPlaced = 0;
  s.run.board[14].stack = [];
  s.run.board[15].stack = [3];
  const ret = G.placeStack(s, 14, 0);
  const src = unwind(ret, s);
  assert.equal(src.run.anchor, 14, 'RED: pool monocolor debe marcar ancla');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[14].stack, [3, 3, 3], 'RED: ancla absorbe vecino');
  assert.equal(st.run.board[15].stack.length, 0, 'RED: la torre vecina cede TODO su run de 3');
  assert.equal(st.run.anchor, undefined, 'RED: ancla eliminada tras cascada');
});

test('T21f [R12.4] swap no marca ancla', () => {
  need('useSwapPiles'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.swapPiles.owned = true; s.skills.swapPiles.uses = 3;
  s.run.board[0].stack = [2, 2];
  s.run.board[1].stack = [2];
  const ret = G.useSwapPiles(s, 0, 1);
  const st = unwind(ret, s);
  assert.ok(!st.error, 'RED: precondition — swap OK');
  assert.ok(!st.run.anchor, 'RED: swap NO debe marcar ancla');
});
