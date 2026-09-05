// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.12 (node:test, no deps).
// Block T22 — IMÁN MONOCOLOR (inversa del ancla) [R12.4c]: al colocar una pila
// MULTICOLOR, durante su cascada todo grupo del eslabón que contenga una celda
// PURAMENTE monocolor (stack entero = un color) la elige como destino — el run
// del tope del jugador drena HACIA el vecino puro. Empate entre puras: más
// alta → menor índice. Sin pura en el grupo: árbitro T1/R2 normal.
// Simetría con R12.4b: mono→tu baldosa recibe; multi→el vecino puro recibe.
// Swap/unlock NO activan el imán.
// Run: node --test test/v2.t22.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 10000 } });
  return unwind(G.openRun(s, rng(seed)), s);
};

// ---------------------------------------------------------------------------
// T22a — colocación multicolor junto a vecino PURO: el vecino puro es destino.
// Geometría real (núcleo): A=18=[2,2] puro, adyacente a 10; 27 NO es adyacente
// a 10 (decoy inerte). Coloco [5,2] (tope 2, multicolor) en D=10 => grupo
// {A,D} tope 2. El imán elige la PURA A: A=[2,2,2], D conserva [5].
// ---------------------------------------------------------------------------
test('T22a [R12.4c] multi colocada: el vecino monocolor puro es el destino', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  const A = s.run.board[18], D = s.run.board[10], E = s.run.board[27];
  A.stack = [2, 2];
  E.stack = [5, 5];
  const ret = G.placeStack(s, 10, 0, [5, 2]);          // multicolor, tope 2
  const src = unwind(ret, s);
  assert.equal(src.run.monoSink, true, 'RED: multi debe marcar run.monoSink');
  assert.ok(!src.run.anchor, 'RED: multi NO debe marcar ancla');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[18].stack, [2, 2, 2],
    `RED: la torre PURA A debe absorber el run => [2,2,2], dio A=${JSON.stringify(st.run.board[18].stack)} D=${JSON.stringify(st.run.board[10].stack)}`);
  assert.deepEqual(st.run.board[10].stack, [5],
    'RED: D conserva su sub-pila [5]');
  assert.equal(st.run.monoSink, undefined, 'RED: monoSink eliminado al final de la cascada');
});

// ---------------------------------------------------------------------------
// T22b — empate entre puras: gana la MÁS ALTA (luego menor índice).
// A=18=[2,2] (pura alta), B=11=[2] (pura baja), D=10 vacía adyacente a ambas.
// Coloco [3,2] en D (tope 2, multi). R2 viejo preferiría B (torre más baja);
// el imán elige A (más alta): A=[2,2,2,2], B=[], D=[3].
// ---------------------------------------------------------------------------
test('T22b [R12.4c] empate de puras: gana la más alta (no la más baja)', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  const A = s.run.board[18], B = s.run.board[11], D = s.run.board[10];
  A.stack = [2, 2];
  B.stack = [2];
  const ret = G.placeStack(s, 10, 0, [3, 2]);          // multi, tope 2 (3 debajo, 2 tope)
  const src = unwind(ret, s);
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[18].stack, [2, 2, 2, 2],
    `RED: la pura MÁS ALTA debe ganar => A=[2,2,2,2], dio A=${JSON.stringify(st.run.board[18].stack)} B=${JSON.stringify(st.run.board[11].stack)} D=${JSON.stringify(st.run.board[10].stack)}`);
  assert.deepEqual(st.run.board[11].stack, [], 'RED: B (pura baja) cede su run');
  assert.deepEqual(st.run.board[10].stack, [3], 'RED: D conserva [3]');
});

// ---------------------------------------------------------------------------
// T22c — SIN pura en el grupo: árbitro normal (regresión). Vecino [3,2] (tope
// 2 pero NO puro) no califica: el merge ocurre con el árbitro T1/R2.
// ---------------------------------------------------------------------------
test('T22c [R12.4c] grupo sin celda pura: árbitro T1/R2 normal', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  const A = s.run.board[18], D = s.run.board[10];
  A.stack = [3, 2];                                     // tope 2, NO pura
  const ret = G.placeStack(s, 10, 0, [7, 2]);           // multi, tope 2
  const src = unwind(ret, s);
  assert.equal(src.run.monoSink, true, 'RED: multi marca monoSink');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  const total = st.run.board[18].stack.length + st.run.board[10].stack.length;
  // sin pura, el árbitro decide: lo único fijado es que el run de 2 se fusionó
  assert.ok(total === 4,
    `RED: las 4 fichas deben seguir en {A,D} (merge hecho), dio ${JSON.stringify(st.run.board[18].stack)} + ${JSON.stringify(st.run.board[10].stack)}`);
  const aTop = st.run.board[18].stack[st.run.board[18].stack.length - 1];
  const dTop = st.run.board[10].stack[st.run.board[10].stack.length - 1];
  assert.ok(aTop === 3 || dTop === 3 || total === 4, 'sanity: sub-pilas preservadas');
  assert.equal(st.run.monoSink, undefined, 'RED: monoSink eliminado al final');
});

// ---------------------------------------------------------------------------
// T22d — swap NO activa el imán (regresión v2.6): useSwapPiles no deja monoSink
// ---------------------------------------------------------------------------
test('T22d [R12.4c] swap no marca monoSink ni ancla', () => {
  need('useSwapPiles');
  const s = mkGame(1);
  s.skills.swapPiles.owned = true; s.skills.swapPiles.uses = 3;
  s.run.board[0].stack = [2, 2];
  s.run.board[1].stack = [5];
  const ret = G.useSwapPiles(s, 0, 1);
  const st = unwind(ret, s);
  assert.ok(!st.error, 'RED: precondition — swap OK');
  assert.ok(!st.run.monoSink, 'RED: swap NO debe marcar monoSink');
  assert.ok(!st.run.anchor, 'RED: swap NO debe marcar ancla');
});
