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
//  * activateTile(state, cellId) cobra runTilePrice y retorna state (o {error,state}).
//  * runTilePrice(state) = RUN_TILE_BASE * 1.6^runTilesActivated.
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
  s.run.board.find(c => c.dormant && !c.blocked && G.isActivateEligible(s, c)) ||
  s.run.board.find(c => c.dormant && !c.blocked) ||
  s.run.board.find(c => c.dormant || c.blocked);

// ---------------------------------------------------------------------------
// T14a — Tablero dual 32 celdas [R14.1]
// v2-shape: orientación axial (agrupa por `r`); 4 filas consecutivas con picos
// [7,9,9,7] = 32 (estilo hexágono Catan pequeño, simetría de 180°). Cualquier
// orientación global pasa (se exige el multiconjunto/orden por fila r).
// ---------------------------------------------------------------------------
test('T14a [R14.1 v2.14] generateBoard(36): rectángulo pointy 6×6 (6 filas de 6)', () => {
  need('generateBoard');
  // FIRMA elegida: (size, rng) — 36 celdas, rng determinista.
  let board = null;
  try {
    board = boardOf(G.generateBoard(36, mulberry32(1)));
  } catch {
    assert.ok(false, 'RED: generateBoard(36, rng) firma v2 no implementada (debe retornar 36 celdas)');
  }
  assert.ok(Array.isArray(board), 'RED: generateBoard(36, rng) debe retornar el board (array de celdas)');
  assert.equal(board.length, 36, 'RED: el tablero dual v2.14 tiene SIEMPRE 36 celdas');
  // agrupar por fila axial r -> tamaños
  const rows = new Map();
  for (const c of board) {
    assert.ok(Number.isFinite(c.r), `RED: celda sin coordenada axial r: ${JSON.stringify(c)}`);
    rows.set(c.r, (rows.get(c.r) || 0) + 1);
  }
  assert.equal(rows.size, 6, `RED: rectángulo 6×6 = 6 filas axiales, hay ${rows.size}`);
  // v2.14-shape: filas ordenadas por r → 6 filas de 6 (rectángulo tipo marco de Catan)
  const ordered = [...rows.keys()].sort((a, b) => a - b).map((r) => rows.get(r));
  assert.deepEqual(ordered, [6, 6, 6, 6, 6, 6],
    `RED: rectángulo 6×6 = filas [6,6,6,6,6,6], hay ${JSON.stringify(ordered)}`);
  // columnas plegadas col=q+floor(r/2): 6 consecutivas y MISMO patrón por fila
  const patterns = [...rows.keys()].sort((a, b) => a - b).map((r) => {
    const cols = board.filter(c => c.r === r).map(c => c.q + Math.floor(r / 2)).sort((a, b) => a - b);
    assert.equal(new Set(cols).size, 6, `RED: fila r=${r} debe cubrir 6 columnas plegadas consecutivas`);
    return cols;
  });
  const base = patterns[0].join(',');
  for (const p of patterns) assert.equal(p.join(','), base,
    'RED: las 6 filas deben compartir el patrón de columnas (rectángulo)');
});

// ---------------------------------------------------------------------------
// T14b — Jugables = núcleo 2-3-2 (7); resto apagadas/bloqueadas [R14.2]
// ---------------------------------------------------------------------------
test('T14b [R14.2] tras openRun: 7 jugables y 29 dormant/blocked', () => {
  need('createGame'); need('openRun');
  const s = mkGame(1);
  const board = s.run && s.run.board;
  assert.ok(Array.isArray(board), 'RED: openRun debe dejar state.run.board');
  assert.equal(board.length, 36, 'RED: el board de run debe exponer las 36 celdas [R14.1]'); // v2.14-shape: 35 → 36
  const playable = board.filter(c => !c.dormant && !c.blocked).length;
  const off = board.length - playable;
  assert.equal(playable, 7, 'RED: jugables al inicio = núcleo 2-3-2 (7) [R14.2]');
  assert.equal(off, 29, 'RED: las otras 29 celdas deben estar dormant/blocked [R14.1,R14.2]'); // v2.14-shape: 28 → 29
});

// ---------------------------------------------------------------------------
// T14c — Activación temporal por monedas [R14.3 v2.20]: 40 × 1.6^n.
// ---------------------------------------------------------------------------
test('T14c [R14.3 v2.20] activateTile cobra RUN_TILE_BASE y la siguiente es ×1.6', () => {
  need('activateTile'); need('runTilePrice'); needCfg('RUN_TILE_BASE'); needCfg('RUN_TILE_RATIO');
  assert.equal(G.CONFIG.RUN_TILE_BASE, 40, 'base histórica de la curva temporal');
  assert.equal(G.CONFIG.RUN_TILE_RATIO, 1.6, 'crecimiento ×1.6 por baldosa de la run');
  const s = mkGame(1);
  const cell = dormantCell(s);
  assert.ok(cell, 'debe existir una celda dormant elegible');
  const coins0 = s.progress.coins;
  const price = G.runTilePrice(s);
  assert.equal(price, 40);
  const st = unwind(G.activateTile(s, cell.id), s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.equal(target.dormant, false, 'la celda deja de estar dormant');
  assert.equal(st.run.runTilesActivated, 1);
  assert.ok(Math.abs((coins0 - st.progress.coins) - price) < 1e-6, 'descuenta el precio de esa activación');
  assert.ok(Math.abs(G.runTilePrice(st) / price - 1.6) < 1e-9, 'la siguiente cuesta ×1.6');
});

// ---------------------------------------------------------------------------
// T14d — Sin saldo no activa. El gate de usos (noUses) ya no existe.
// ---------------------------------------------------------------------------
test('T14d [R14.3 v2.20] sin saldo => {error:"noFunds"} sin mutar', () => {
  need('activateTile');
  const s = mkGame(1);
  s.progress.coins = 0;
  const cell = dormantCell(s);
  assert.ok(cell);
  const ret = G.activateTile(s, cell.id);
  assert.equal(ret && ret.error, 'noFunds');
  const st = unwind(ret, s);
  assert.equal(st.run.board.find(c => c.id === cell.id).dormant, true);
  assert.equal(st.run.runTilesActivated || 0, 0);
  assert.equal(st.progress.coins, 0);
});

// ---------------------------------------------------------------------------
// T14e — No hay compra permanente. Un permTiles residual no techa la activación.
// ---------------------------------------------------------------------------
test('T14e [R14.4 retirada] no hay compra permanente y permTiles no techa', () => {
  assert.equal(typeof G.buyTablesUp, 'undefined');
  assert.equal(typeof G.buyPermTile, 'undefined');
  assert.equal(typeof G.permTilePrice, 'undefined');
  assert.equal(G.CONFIG.TABLES_PERM_BASE, undefined);
  assert.equal(G.CONFIG.TABLES_PERM_RATIO, undefined);
  assert.equal(G.CONFIG.PERM_TILE_BASE, undefined);
  const s = mkGame(1);
  s.progress.permTiles = 0;
  const cell = dormantCell(s);
  const st = unwind(G.activateTile(s, cell.id), s);
  assert.equal(st.run.board.find(c => c.id === cell.id).dormant, false,
    'permTiles=0 no impide activar: se paga con monedas');
  assert.equal(G.buySkill(G.createGame({ progress: { coins: 1e9 } }), 'tables').error, 'noSkill');
});

// ---------------------------------------------------------------------------
// T14f — Al reabrir, contador, precio y baldosas activadas vuelven al inicio.
// ---------------------------------------------------------------------------
test('T14f [R14.3] openRun resetea precio, contador y baldosas activadas', () => {
  need('activateTile'); need('openRun');
  let s = mkGame(1);
  s = unwind(G.activateTile(s, dormantCell(s).id), s);
  s = unwind(G.activateTile(s, dormantCell(s).id), s);
  assert.equal(s.run.runTilesActivated, 2);
  assert.ok(Math.abs(G.runTilePrice(s) - 40 * 1.6 ** 2) < 1e-6);
  const st = unwind(G.openRun(s, mulberry32(7)), s);
  assert.equal(st.run.runTilesActivated, 0);
  assert.equal(G.runTilePrice(st), 40);
  assert.equal(st.run.board.filter(c => !c.dormant && !c.blocked).length, 7,
    'la siguiente run vuelve al núcleo 2-3-2');
});

// ---------------------------------------------------------------------------
// T14g — Tres activaciones seguidas: 40, luego ×1.6, luego ×1.6.
// ---------------------------------------------------------------------------
test('T14g [R14.3] tres activaciones cobran 40, 64 y 102.4', () => {
  need('activateTile'); need('runTilePrice');
  let s = mkGame(1);
  const paid = [];
  for (let i = 0; i < 3; i++) {
    const before = s.progress.coins;
    const price = G.runTilePrice(s);
    paid.push(price);
    s = unwind(G.activateTile(s, dormantCell(s).id), s);
    assert.ok(Math.abs((before - s.progress.coins) - price) < 1e-6, `activación ${i} cobra su precio`);
  }
  assert.ok(Math.abs(paid[0] - 40) < 1e-9);
  assert.ok(Math.abs(paid[1] / paid[0] - 1.6) < 1e-9);
  assert.ok(Math.abs(paid[2] / paid[1] - 1.6) < 1e-9);
  assert.equal(s.run.runTilesActivated, 3);
});
