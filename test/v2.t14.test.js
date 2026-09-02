// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2 (node:test, no deps).
// Block T14 (board dual peaked-hex 32 / baldosas) — [R14.1..R14.4].
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
//    { id, q, r, dormant, blocked, ... }. `size` SIEMPRE 32 en el juego
//    (R14.1 v2-shape: panal con picos filas [7,9,9,7]). Se pasa 32 explícito
//    para que el test no dependa de un default interno.
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
// T14a — Tablero dual 32 celdas [R14.1]
// v2-shape: orientación axial (agrupa por `r`); 4 filas consecutivas con picos
// [7,9,9,7] = 32 (estilo hexágono Catan pequeño, simetría de 180°). Cualquier
// orientación global pasa (se exige el multiconjunto/orden por fila r).
// ---------------------------------------------------------------------------
test('T14a [R14.1 v2.2] generateBoard(32): rectángulo pointy 8×4 (4 filas de 8)', () => {
  need('generateBoard');
  // FIRMA elegida: (size, rng) — 32 celdas, rng determinista.
  let board = null;
  try {
    board = boardOf(G.generateBoard(32, mulberry32(1)));
  } catch {
    assert.ok(false, 'RED: generateBoard(32, rng) firma v2 no implementada (debe retornar 32 celdas)');
  }
  assert.ok(Array.isArray(board), 'RED: generateBoard(32, rng) debe retornar el board (array de celdas)');
  assert.equal(board.length, 32, 'RED: el tablero dual v2 tiene SIEMPRE 32 celdas');
  // agrupar por fila axial r -> tamaños
  const rows = new Map();
  for (const c of board) {
    assert.ok(Number.isFinite(c.r), `RED: celda sin coordenada axial r: ${JSON.stringify(c)}`);
    rows.set(c.r, (rows.get(c.r) || 0) + 1);
  }
  assert.equal(rows.size, 4, `RED: rectángulo 8×4 = 4 filas axiales, hay ${rows.size}`);
  // v2.2-shape: filas ordenadas por r → 4 filas de 8 (rectángulo tipo marco de Catan)
  const ordered = [...rows.keys()].sort((a, b) => a - b).map((r) => rows.get(r));
  assert.deepEqual(ordered, [8, 8, 8, 8],
    `RED: rectángulo 8×4 = filas [8,8,8,8], hay ${JSON.stringify(ordered)}`);
  // columnas plegadas col=q+floor(r/2): 8 consecutivas y MISMO patrón por fila
  const patterns = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const cols = board.filter(c => c.r === r).map(c => c.q + Math.floor(r / 2)).sort((a, b) => a - b);
    assert.equal(new Set(cols).size, 8, `RED: fila r=${r} debe cubrir 8 columnas plegadas consecutivas`);
    return cols;
  });
  const base = patterns[0].join(',');
  for (const p of patterns) assert.equal(p.join(','), base,
    'RED: las 4 filas deben compartir el patrón de columnas (rectángulo)');
});

// ---------------------------------------------------------------------------
// T14b — Jugables = núcleo 2-3-2 (7); resto apagadas/bloqueadas [R14.2]
// ---------------------------------------------------------------------------
test('T14b [R14.2] tras openRun: 7 jugables y 25 dormant/blocked', () => {
  need('createGame'); need('openRun');
  const s = mkGame(1);
  const board = s.run && s.run.board;
  assert.ok(Array.isArray(board), 'RED: openRun debe dejar state.run.board');
  assert.equal(board.length, 32, 'RED: el board de run debe exponer las 32 celdas [R14.1]'); // v2-shape: 30 → 32
  const playable = board.filter(c => !c.dormant && !c.blocked).length;
  const off = board.length - playable;
  assert.equal(playable, 7, 'RED: jugables al inicio = núcleo 2-3-2 (7) [R14.2]');
  assert.equal(off, 25, 'RED: las otras 25 celdas deben estar dormant/blocked [R14.1,R14.2]'); // v2-shape: 23 → 25
});

// ---------------------------------------------------------------------------
// T14c — Activación temporal por USOS [R14.3 v2.2]: skill 'tables' modelo USES
// (1 uso base/partida + usesBought; SIN costo de monedas — el costo vive en la
// compra permanente de la tienda, buyTablesUp).
// ---------------------------------------------------------------------------
test('T14c [R14.3 v2.2] activateTile: celda dormant -> activa, consume 1 uso de tables, coins SIN cambio', () => {
  need('activateTile'); need('runTilePrice');
  const s = mkGame(1);
  s.skills.tables = { owned: true, uses: 2, usesBought: 0 };   // GIVEN skill con 2 usos
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant que activar');
  const coins0 = s.progress.coins;
  const st = unwind(G.activateTile(s, cell.id), s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.ok(target, 'RED: la celda activada debe seguir en run.board');
  assert.equal(target.dormant, false, 'RED: la celda debe dejar de estar dormant tras activateTile');
  assert.equal(st.run.runTilesActivated, (s.run.runTilesActivated || 0) + 1,
    'RED: run.runTilesActivated debe incrementarse en 1 [R14.3]');
  assert.equal(st.skills.tables.uses, 1, 'RED: activateTile debe consumir 1 uso de skills.tables [R14.3 v2.2]');
  assert.equal(st.progress.coins, coins0, 'RED: activar NO debe cobrar coins (modelo usos v2.2)');
  assert.equal(G.runTilePrice(st), 0, 'RED: runTilePrice === 0 desde v2.2 (sin precio por activación)');
});

// ---------------------------------------------------------------------------
// T14d — Activate sin usos [R14.3 v2.2]: skills.tables.uses === 0 ->
// {error:"noUses"} sin mutar (reemplaza el techo permTiles del modelo anterior).
// ---------------------------------------------------------------------------
test('T14d [R14.3 v2.2] skills.tables.uses === 0 -> activateTile {error:"noUses"} sin mutar', () => {
  need('activateTile');
  const s = mkGame(1);
  s.skills.tables = { owned: true, uses: 0, usesBought: 0 };   // GIVEN sin usos
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant que activar');
  const snap = { activated: s.run.runTilesActivated || 0, dormant: cell.dormant, coins: s.progress.coins };
  const ret = G.activateTile(s, cell.id);
  assert.ok(ret && ret.error === 'noUses',
    `RED: sin usos, activateTile debe retornar {error:"noUses"}, retornó ${JSON.stringify(ret)}`);
  const st = unwind(ret, s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.equal(st.run.runTilesActivated, snap.activated, 'RED: error noUses no debe mutar runTilesActivated');
  assert.equal(target.dormant, snap.dormant, 'RED: error noUses no debe activar la celda');
  assert.equal(st.progress.coins, snap.coins, 'RED: error noUses no debe cobrar coins');
});

// ---------------------------------------------------------------------------
// T14e — Compra permanente en TIENDA [R14.4 v2.2]: buyTablesUp sube permTiles
// (+1, techo histórico) Y skills.tables.usesBought (+1 mesa activable/partida);
// la 1ª compra marca owned. Precio = permTilePrice = PERM_TILE_BASE*1.35^permTiles.
// ---------------------------------------------------------------------------
test('T14e [R14.4 v2.2] buyTablesUp: permTiles+1, usesBought+1, owned; precio PERM_TILE_BASE*1.35^permTiles', () => {
  need('buyTablesUp'); need('permTilePrice'); needCfg('PERM_TILE_BASE'); needCfg('TABLES_PERM_RATIO');
  const s = mkGame(1);
  s.skills.tables = { owned: false, uses: 0, usesBought: 0 };
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant para comprar permanente');
  const price = G.permTilePrice(s);
  const coins0 = s.progress.coins;
  const perm0 = s.progress.permTiles ?? 0;
  const st = unwind(G.buyTablesUp(s), s);
  assert.equal(st.progress.permTiles, perm0 + 1, 'RED: buyTablesUp debe hacer progress.permTiles+1 [R14.4]');
  assert.equal(st.skills.tables.usesBought, 1, 'RED: buyTablesUp debe hacer skills.tables.usesBought+1 [R14.4 v2.2]');
  assert.equal(st.skills.tables.owned, true, 'RED: la 1ª compra debe marcar skills.tables.owned=true');
  assert.ok(Math.abs((coins0 - st.progress.coins) - price) < 1e-6,
    'RED: coins debe descontar exactamente permTilePrice [R14.4]');
  // fórmula con el estado ya mutado: TABLES_PERM_BASE * TABLES_PERM_RATIO^permTiles (v2.5 dial)
  assert.equal(G.permTilePrice(st), G.CONFIG.TABLES_PERM_BASE * G.CONFIG.TABLES_PERM_RATIO ** st.progress.permTiles,
    'RED: permTilePrice = TABLES_PERM_BASE * RATIO^permTiles [R14.4 v2.5]');
});

// ---------------------------------------------------------------------------
// T14f — Comprar permanente NO activa celdas [R14.4 v2.2]; con usos repuestos
// (openRun repone uses = USES_PER_RUN.tables + usesBought) activateTile activa.
// ---------------------------------------------------------------------------
test('T14f [R14.4 v2.2] buyTablesUp NO activa la celda; tras openRun (uses repuestos) activateTile activa', () => {
  need('buyTablesUp'); need('activateTile'); need('openRun');
  const s = mkGame(1);
  const cell = dormantCell(s);
  assert.ok(cell, 'RED: debe existir una celda dormant para comprar permanente');
  const st = unwind(G.buyTablesUp(s), s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.ok(target, 'RED: la celda comprada debe seguir en run.board');
  assert.equal(target.dormant, true,
    'RED: la compra permanente NO activa ninguna celda (sigue dormant) [R14.4]');
  // openRun repone los usos por partida (= usesBought, v2.3 sin base) y enable activateTile
  const st2 = unwind(G.openRun(st, mulberry32(7)), st);
  assert.equal(st2.skills.tables.uses, (st.skills.tables.usesBought || 0),
    'RED: openRun debe repone uses = usesBought [R17.2 v2.3]');
  const ret = G.activateTile(st2, cell.id);
  assert.ok(!ret.error, `RED: con usos disponibles activateTile debe funcionar, dio ${JSON.stringify(ret && ret.error)}`);
  const st3 = unwind(ret, st2);
  const target3 = st3.run.board.find(c => c.id === cell.id);
  assert.equal(target3.dormant, false,
    'RED: con techo/usos disponibles, activateTile debe activar la baldosa [R14.2,R14.4]');
  assert.equal(st3.run.runTilesActivated, (st2.run.runTilesActivated || 0) + 1,
    'RED: la activación temporal cuenta en runTilesActivated [R14.3]');
});
