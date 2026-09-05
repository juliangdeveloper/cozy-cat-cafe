// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.11 (node:test, no deps).
// Block T21 — ANCLA DEL JUGADOR [R12.4]: colocar una pila MONOCOLOR marca
// run.anchor = celda; durante toda la cascada disparada por esa colocación,
// TODO grupo contiguo que CONTENGA el ancla tiene como destino el ancla
// (vecinos y vecinos-de-vecinos drenan su run de tope HACIA la baldosa del
// jugador). Grupos sin ancla usan el árbitro T1/R2 normal. El ancla se limpia
// al final de resolveCascade. swap/unlock no fijan ancla.
// Fuente de verdad: RULES.md §R12.4.
// Run: node --test test/v2.t21.test.js
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
// T21a — ancla absorbe el tope del vecino: D=[1] recibe [2,2] monocolor; A
// vecino con tope 2. Grupo {A,D}: el destino es D (ancla), NO la torre A.
// Contrario al tie-break viejo (T18c): la colocada drena al ancla.
// ---------------------------------------------------------------------------
test('T21a [R12.4] ancla monocolor: la pila colocada drena al tope del vecino', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 1, 0, [2, 2]);          // monocolor 2
  const src = unwind(ret, s);
  assert.equal(src.run.anchor, 1, 'RED: colocar monocolor debe marcar run.anchor=cellId');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  // D tras colocar = [1,2,2]; absorbe el run [2,2] de A => [1,2,2,2,2]
  assert.deepEqual(st.run.board[1].stack, [1, 2, 2, 2, 2],
    'RED: el ANCLA (D) debe absorber la racha de A => [1,2,2,2,2]');
  assert.deepEqual(st.run.board[0].stack, [],
    'RED: A (fuente) cede su run y queda vacía');
  assert.equal(st.run.anchor, undefined,
    'RED: el ancla debe eliminarse al final de la cascada');
});

// ---------------------------------------------------------------------------
// T21b — drenaje de 2º grado: la cascada revela sub-pilas y siguen drenando
// hacia el ancla. Ancla D=[1]; A=[2,2] y B=[2,3] vecinas del ancla. Coloco
// [2,2] en D => grupo {A,B,D} tope 2 drena a D => D=[1,2,2,2,2,2], B revela
// [3]. Si el 3 de B toca otra torre vecina de tope 3 (C=[3]) ese grupo NO
// contiene el ancla => árbitro normal (T1/R2), el ancla NO interfiere.
// ---------------------------------------------------------------------------
test('T21b [R12.4] revelación de 2º grado: sub-pilas drenadas en eslabones siguientes', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  // Geometría núcleo REAL (probe): 10-11-18-19 adyacentes; 10-18 y 10-19 y 11-19.
  // Ancla = 10; A=18 vecina del ancla; B=11 vecina del ancla.
  const A = s.run.board[18], D = s.run.board[10], B = s.run.board[11];
  A.stack = [2, 2];
  D.stack = [1];
  B.stack = [3, 2];            // tope 2 (entra al grupo), revela [3] al ceder
  const ret = G.placeStack(s, 10, 0, [2, 2]);
  const src = unwind(ret, s);
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  // D tras colocar = [1,2,2]; absorbe run de A (2 fichas) + run de B (1 ficha)
  assert.deepEqual(st.run.board[10].stack, [1, 2, 2, 2, 2, 2],
    `RED: el ancla debe juntar AMBOS runs de 2 => [1,2,2,2,2,2], dio ${JSON.stringify(st.run.board[10].stack)}`);
  assert.deepEqual(st.run.board[18].stack, [], 'RED: A queda vacía');
  assert.deepEqual(st.run.board[11].stack, [3], 'RED: B conserva sub-pila [3]');
});

// ---------------------------------------------------------------------------
// T21c — pila MULTICOLOR NO ancla: se conserva el árbitro T1/R2 (comportamiento
// v2.10: la torre A absorbe por tie-break). run.anchor queda undefined/null.
// ---------------------------------------------------------------------------
test('T21c [R12.4] pila multicolor NO marca ancla: árbitro normal (regresión T18c)', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  const A = s.run.board[0], D = s.run.board[1];
  A.stack = [2, 2];
  D.stack = [1];
  const ret = G.placeStack(s, 1, 0, [2, 5]);          // multicolor
  const src = unwind(ret, s);
  assert.ok(!src.run.anchor, 'RED: multicolor NO debe marcar ancla');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  // Árbitro v2.10 intacto: el tope 2 de D se fusiona; T1/R2 puede elegir A.
  const tops = [st.run.board[0].stack, st.run.board[1].stack];
  const a = tops[0], d = tops[1];
  const dTop = d.length ? d[d.length - 1] : 0;
  assert.ok(
    (a.length === 3 && d.length === 1) || (d.length === 3 && a.length === 0) || (dTop !== 2),
    `RED: sin ancla el árbitro decide (A=${JSON.stringify(a)} D=${JSON.stringify(d)})`);
  // Ningún estado intermedio debe haber tratado a D como destino forzoso.
  assert.ok(a.length !== 0 || d.length >= 1, 'RED: sanity boards');
});

// ---------------------------------------------------------------------------
// T21d — grupo SIN ancla usa el árbitro normal: con ancla vigente (cascada en
// curso tras colocar monocolor), un grupo lejano del mismo color se resuelve
// por T1/R2, no por el ancla.
// ---------------------------------------------------------------------------
test('T21d [R12.4] grupo sin ancla usa T1/R2 normal aunque haya ancla vigente', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  // Encontrar dos celdas jugables NO adyacentes entre sí y NO adyacentes al ancla 1
  const board = s.run.board;
  const adj = (x, y) => G.HEX_ADJ.some(([dq, dr]) =>
    board[y].q === board[x].q + dq && board[y].r === board[x].r + dr);
  const playable = board.map((c, i) => ({ c, i })).filter(x => !x.c.dormant && !x.c.blocked && x.i !== 0 && x.i !== 1);
  const far = playable.find(x => !adj(1, x.i));
  assert.ok(far, 'RED: precondition — se necesita una celda jugable no adyacente al ancla');
  // Marcar ancla a mano (como si la cascada estuviera en curso tras colocar monocolor)
  s.run.anchor = 1;
  s.run.board[1].stack = [5, 5];
  far.c.stack = [5, 5];
  // dar a la far una vecina con tope 5 para formar grupo sin ancla
  const nb = board.map((c, i) => ({ c, i })).find(x => x.i !== far.i && !x.c.dormant && !x.c.blocked && adj(far.i, x.i));
  assert.ok(nb, 'RED: precondition — la celda lejana necesita una vecina jugable');
  nb.c.stack = [5];
  const res = G.resolveCascade(s);
  const st = unwind(res, s);
  // El grupo {far, nb} NO contiene el ancla: el árbitro T1/R2 decide. El ancla
  // (torre 5,5 sin grupo) NO debe absorber nada del grupo lejano.
  const anchorLen = st.run.board[1].stack.length;
  assert.ok(anchorLen <= 2,
    `RED: el ancla absorbió fichas de un grupo sin ancla (stack=${JSON.stringify(st.run.board[1].stack)})`);
  assert.equal(st.run.anchor, undefined, 'RED: ancla eliminada al final');
});

// ---------------------------------------------------------------------------
// T21e — NO-monocolor explícito: pila monocolor colocada por la FIRMA v2
// (rngOrStack array) con un solo color SÍ ancla; con dos colores NO. Cubre
// también el flujo pool (slot del tray).
// ---------------------------------------------------------------------------
test('T21e [R12.4] flujo pool: colocar del tray monocolor ancla; el ancla vive solo durante la cascada', () => {
  need('placeStack'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  // Geometría real: 10-11 adyacentes. Pool monocolor [3,3] al slot 0; torre
  // vecina de tope 3 en 11; ancla = 10.
  s.run.pool = [[3, 3], [], []];
  s.run.poolPlaced = 0;
  s.run.board[10].stack = [];
  s.run.board[11].stack = [3];
  const ret = G.placeStack(s, 10, 0);                 // firma pool: (state, cellId, slot)
  const src = unwind(ret, s);
  assert.equal(src.run.anchor, 10, 'RED: pool monocolor debe marcar ancla');
  const res = G.resolveCascade(src);
  const st = unwind(res, src);
  assert.deepEqual(st.run.board[10].stack, [3, 3, 3], 'RED: ancla absorbe vecino');
  assert.equal(st.run.board[11].stack.length, 0, 'RED: la torre vecina cede TODO su run de 3');
  assert.equal(st.run.anchor, undefined, 'RED: ancla eliminada tras cascada');
});

// ---------------------------------------------------------------------------
// T21f — swap NO marca ancla (regresión v2.6): useSwapPiles no deja run.anchor
// ---------------------------------------------------------------------------
test('T21f [R12.4] swap no marca ancla', () => {
  need('useSwapPiles'); need('resolveCascade');
  const s = mkGame(1);
  s.skills.serveManual.autoServe = false;
  s.skills.swapPiles.owned = true; s.skills.swapPiles.uses = 3;
  s.run.board[0].stack = [2, 2];
  s.run.board[1].stack = [2];
  const ret = G.useSwapPiles(s, 0, 1);
  const st = unwind(ret, s);
  assert.ok(!st.error, 'RED: precondition — swap OK');
  assert.ok(!st.run.anchor, 'RED: swap NO debe marcar ancla');
});
