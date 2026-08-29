// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2 (node:test, no deps).
// Block T14 (board dual 5x6 / baldosas) — [R14.1..R14.4].
// TDD ROJO: ../js/game.js aún NO implementa los exports v2; cada test falla
// con mensaje `RED:` claro. Dynamic import en before() para que el archivo
// cargue aunque falten exports. NO se modifica js/game.js.
// Run: node --test test/v2.t14.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G; // módulo ../js/game.js (cargado en before())
test.before(async () => { G = await import('../js/game.js'); });

// RED gate: assert que un export existe, si no falla con mensaje claro
const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
// RED gate para constantes de balance CONFIG (R14.3/R14.4)
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

// rng determinista (misma implementación mulberry32 que rules.test.js)
const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);

// ---------------------------------------------------------------------------
// Convenciones v2 asumidas (documentadas aquí; la implementación decide):
//  * generateBoard(size, rng) -> array de `size` celdas axiales
//    { id, q, r, dormant, blocked, ... }. `size` SIEMPRE 30 en el juego
//    (R14.1: panal rectangular 5/6 alternado). Se pasa 30 explícito para
//    que el test no dependa de un default interno.
//  * openRun(state, rng) -> state con state.run = { board, runTilesActivated, ... }
//  * activateTile(state, cellId) / buyPermTile(state, cellId) -> mutan state
//    y retornan state (o {state} / {error}) — unwind() cubre ambos estilos.
//  * runTilePrice(state) / permTilePrice(state) -> precio actual.
// ---------------------------------------------------------------------------
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);
const boardOf = (x) => Array.isArray(x) ? x : (x && Array.isArray(x.board) ? x.board : null);

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 10000 } });
  if (typeof G.openRun === 'function') return unwind(G.openRun(s, rng(seed)), s);
  return s;
};

// primera baldosa apagada (dormant), preferendo no bloqueada
const dormantCell = (s) =>
  s.run.board.find(c => c.dormant && !c.blocked) ||
  s.run.board.find(c => c.dormant || c.blocked);

// ---------------------------------------------------------------------------
// T14a — Tablero dual 30 celdas [R14.1]
// AMBIGUA: orientación libre (flat/pointy). Se agrupa por `r` axial y solo se
// exige 6 filas axiales (panal 5×6 = 30; el multiconjunto original
// [5,5,5,6,6,6] sumaba 33 ≠ 30 — corregido abajo). Cualquier orientación pasa.
// ---------------------------------------------------------------------------
test('T14a [R14.1] generateBoard(30): 30 celdas, 6 filas axiales (panal 5x6 = 30)', () => {
  need('generateBoard');
  // FIRMA elegida: (size, rng) — 30 celdas, rng determinista.
  let board = null;
  try {
    board = boardOf(G.generateBoard(30, mulberry32(1)));
  } catch {
    // la v1 es generateBoard(state, rng): si la firma v2 (size, rng) aún no
    // existe, fallar con mensaje RED claro en vez de un TypeError opaco.
    assert.ok(false, 'RED: generateBoard(30, rng) firma v2 no implementada (debe retornar 30 celdas)');
  }
  assert.ok(Array.isArray(board), 'RED: generateBoard(30, rng) debe retornar el board (array de celdas)');
  assert.equal(board.length, 30, 'RED: el tablero dual v2 tiene SIEMPRE 30 celdas');
  // agrupar por fila axial r -> tamaños
  const rows = new Map();
  for (const c of board) {
    assert.ok(Number.isFinite(c.r), `RED: celda sin coordenada axial r: ${JSON.stringify(c)}`);
    rows.set(c.r, (rows.get(c.r) || 0) + 1);
  }
  assert.equal(rows.size, 6, `RED: panal rectangular 5/6 = 6 filas axiales, hay ${rows.size}`);
  const sizes = [...rows.values()].sort((a, b) => a - b);
  // FIX aritmético (parte a): el multiconjunto [5,5,5,6,6,6] suma 33 ≠ 30;
  // con 30 celdas / 6 filas axiales el panal 5×6 son 6 filas de 5 celdas
  // (contorno rectangular escalonado), ver DESIGN_DECISIONS.md "5×6 = 30".
  assert.deepEqual(sizes, [5, 5, 5, 5, 5, 5],
    `RED: panal 5×6 = 6 filas de 5 celdas (30), hay ${JSON.stringify(sizes)}`);
});

// ---------------------------------------------------------------------------
// T14b — Jugables = núcleo 2-3-2 (7); resto apagadas/bloqueadas [R14.2]
// ---------------------------------------------------------------------------
test('T14b [R14.2] tras openRun: 7 jugables y 23 dormant/blocked', () => {
  need('createGame'); need('openRun');
  const s = mkGame(1);
  const board = s.run && s.run.board;
  assert.ok(Array.isArray(board), 'RED: openRun debe dejar state.run.board');
  assert.equal(board.length, 30, 'RED: el board de run debe exponer las 30 celdas [R14.1]');
  const playable = board.filter(c => !c.dormant && !c.blocked).length;
  const off = board.length - playable;
  assert.equal(playable, 7, 'RED: jugables al inicio = núcleo 2-3-2 (7) [R14.2]');
  assert.equal(off, 23, 'RED: las otras 23 celdas deben estar dormant/blocked [R14.1,R14.2]');
});

// ---------------------------------------------------------------------------
// T14c — Activación temporal: precio exponencial n [R14.3]
// ---------------------------------------------------------------------------
test('T14c [R14.3] activateTile: celda dormant -> activa, runTilesActivated+1, coins -= runTilePrice', () => {
  need('activateTile'); need('runTilePrice'); needCfg('RUN_TILE_BASE');
  const s = mkGame(1);
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant que activar');
  const price = G.runTilePrice(s);
  const coins0 = s.progress.coins;
  const st = unwind(G.activateTile(s, cell.id), s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.ok(target, 'RED: la celda activada debe seguir en run.board');
  assert.equal(target.dormant, false, 'RED: la celda debe dejar de estar dormant tras activateTile');
  assert.equal(st.run.runTilesActivated, (s.run.runTilesActivated || 0) + 1,
    'RED: run.runTilesActivated debe incrementarse en 1 [R14.3]');
  assert.equal(st.progress.coins, coins0 - price,
    'RED: coins debe descontar exactamente runTilePrice [R14.3]');
  // fórmula: RUN_TILE_BASE * 1.6^runTilesActivated (con el estado ya mutado)
  assert.equal(G.runTilePrice(st), G.CONFIG.RUN_TILE_BASE * 1.6 ** st.run.runTilesActivated,
    'RED: runTilePrice = RUN_TILE_BASE * 1.6^runTilesActivated [R14.3]');
});

// ---------------------------------------------------------------------------
// T14d — Techo por partida: activables ≤ permTiles [R14.2]
// ---------------------------------------------------------------------------
test('T14d [R14.2] runTilesActivated === permTiles -> activateTile {error:"cap"} sin mutar', () => {
  need('activateTile');
  const s = mkGame(1);
  const cap = s.progress.permTiles ?? 0;
  s.run.runTilesActivated = cap;                 // GIVEN techo alcanzado
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant que activar');
  const snap = { activated: s.run.runTilesActivated, dormant: cell.dormant, coins: s.progress.coins };
  const ret = G.activateTile(s, cell.id);
  assert.ok(ret && ret.error === 'cap',
    `RED: al llegar al techo permTiles, activateTile debe retornar {error:"cap"}, retornó ${JSON.stringify(ret)}`);
  const st = unwind(ret, s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.equal(st.run.runTilesActivated, snap.activated, 'RED: error cap no debe mutar runTilesActivated');
  assert.equal(target.dormant, snap.dormant, 'RED: error cap no debe activar la celda');
  assert.equal(st.progress.coins, snap.coins, 'RED: error cap no debe cobrar coins');
});

// ---------------------------------------------------------------------------
// T14e — Compra permanente: precio exponencial m [R14.4]
// ---------------------------------------------------------------------------
test('T14e [R14.4] buyPermTile: permTiles+1, coins -= permTilePrice; fórmula PERM_TILE_BASE*1.35^permTiles', () => {
  need('buyPermTile'); need('permTilePrice'); needCfg('PERM_TILE_BASE');
  const s = mkGame(1);
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant para comprar permanente');
  const price = G.permTilePrice(s);
  const coins0 = s.progress.coins;
  const perm0 = s.progress.permTiles ?? 0;
  const st = unwind(G.buyPermTile(s, cell.id), s);
  assert.equal(st.progress.permTiles, perm0 + 1, 'RED: buyPermTile debe hacer progress.permTiles+1 [R14.4]');
  assert.equal(st.progress.coins, coins0 - price, 'RED: coins debe descontar exactamente permTilePrice [R14.4]');
  // fórmula con el estado ya mutado: PERM_TILE_BASE * 1.35^permTiles
  assert.equal(G.permTilePrice(st), G.CONFIG.PERM_TILE_BASE * 1.35 ** st.progress.permTiles,
    'RED: permTilePrice = PERM_TILE_BASE * 1.35^permTiles [R14.4]');
});

// ---------------------------------------------------------------------------
// T14f — Permanente habilita el techo, la activación es temporal [R14.4]
// ---------------------------------------------------------------------------
test('T14f [R14.4] comprar permanente NO activa la celda; subir el techo permite activateTile', () => {
  need('buyPermTile'); need('activateTile');
  const s = mkGame(1);
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant para comprar permanente');
  const st = unwind(G.buyPermTile(s, cell.id), s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.ok(target, 'RED: la celda comprada debe seguir en run.board');
  assert.equal(target.dormant, true,
    'RED: la compra permanente elige la baldosa pero NO la activa (sigue dormant) [R14.4]');
  // subir el techo (permTiles ya +1) ahora permite activarla temporalmente
  const st2 = unwind(G.activateTile(st, cell.id), st);
  const target2 = st2.run.board.find(c => c.id === cell.id);
  assert.equal(target2.dormant, false,
    'RED: con techo disponible, activateTile debe activar la baldosa permanente [R14.2,R14.4]');
  assert.equal(st2.run.runTilesActivated, (st.run.runTilesActivated || 0) + 1,
    'RED: la activación temporal cuenta en runTilesActivated [R14.3]');
});
