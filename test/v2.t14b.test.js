// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.2 (node:test, no deps).
// Block T14b — tablero RECTANGULAR pointy + activación temporal ×1.6 (v2.20).
// Fuente de verdad: RULES.md §R14.
// Run: node --test test/v2.t14b.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 10000 } });
  return unwind(G.openRun(s, rng(seed)), s);
};

// ---------------------------------------------------------------------------
// T14g — Forma RECTANGULAR 8×4 pointy [R14.1 v2.2]: 32 celdas, 4 filas axiales
// de 8. En coordenada plegada col = q + floor(r/2), cada fila cubre 8 columnas
// CONSECUTIVAS y las 4 filas comparten el MISMO patrón (rectángulo con offset
// de panal, contorno tipo marco de Catan).
// ---------------------------------------------------------------------------
test('T14g [R14.1 v2.14] generateBoard(36): rectángulo pointy 6×6 (6 filas de 6)', () => {
  need('generateBoard');
  const board = G.generateBoard(36, mulberry32(1));
  assert.ok(Array.isArray(board) && board.length === 36, 'RED: generateBoard(36) debe retornar 36 celdas');
  const rows = new Map();
  for (const c of board) {
    assert.ok(Number.isFinite(c.r), `RED: celda sin r: ${JSON.stringify(c)}`);
    rows.set(c.r, (rows.get(c.r) || 0) + 1);
  }
  assert.equal(rows.size, 6, `RED: rectángulo 6×6 = 6 filas axiales, hay ${rows.size}`);
  const ordered = [...rows.keys()].sort((a, b) => a - b).map(r => rows.get(r));
  assert.deepEqual(ordered, [6, 6, 6, 6, 6, 6], `RED: 6 filas de 6, hay ${JSON.stringify(ordered)}`);
  const patterns = [...rows.keys()].sort((a, b) => a - b).map(r => {
    const cols = board.filter(c => c.r === r).map(c => c.q + Math.floor(r / 2)).sort((a, b) => a - b);
    assert.equal(new Set(cols).size, 6, `RED: fila r=${r} debe cubrir 6 columnas plegadas consecutivas`);
    return cols;
  });
  const base = patterns[0].join(',');
  for (const p of patterns) assert.equal(p.join(','), base, 'RED: las 6 filas deben compartir el patrón de columnas (rectángulo)');
});

// ---------------------------------------------------------------------------
// T14h — Arranque: núcleo 2-3-2 jugable (7), resto dormant (25) [R14.2]
// (el núcleo mantiene sus coords axial — solo cambia el shape del tablero)
// ---------------------------------------------------------------------------
test('T14h [R14.2 v2.14] tras openRun: 7 jugables (núcleo 2-3-2) y 29 dormant', () => {
  need('createGame'); need('openRun');
  const s = mkGame(1);
  const board = s.run && s.run.board;
  assert.ok(Array.isArray(board), 'RED: openRun debe dejar state.run.board');
  assert.equal(board.length, 36, 'RED: el board de run debe exponer las 36 celdas [R14.1]');
  const playable = board.filter(c => !c.dormant && !c.blocked);
  assert.equal(playable.length, 7, 'RED: jugables al inicio = núcleo 2-3-2 (7) [R14.2]');
  const byCol = {};
  for (const c of playable) byCol[c.q] = (byCol[c.q] || 0) + 1;
  assert.deepEqual({ '-1': 2, '0': 3, '1': 2 }, { '-1': byCol[-1], '0': byCol[0], '1': byCol[1] },
    'RED: el núcleo jugable conserva las coords axial del 2-3-2');
  assert.equal(board.length - playable.length, 29, 'RED: las otras 29 celdas dormant [R14.2]');
});

// ---------------------------------------------------------------------------
// Activación temporal [R14.3 v2.20]: cobra 40 × 1.6^n. No hay skill de usos.
// ---------------------------------------------------------------------------
test('T14i [R14.3 v2.20] activateTile cobra la curva y no pide la skill tables', () => {
  need('activateTile'); need('runTilePrice');
  const s = mkGame(1);
  assert.equal(s.skills.tables, undefined);
  const cell = s.run.board.find(c => c.dormant && !c.blocked && G.isActivateEligible(s, c));
  assert.ok(cell, 'debe existir una celda dormant elegible (≥2 vecinos)');
  const coins0 = s.progress.coins;
  const price = G.runTilePrice(s);
  const st = unwind(G.activateTile(s, cell.id), s);
  assert.equal(st.run.board.find(c => c.id === cell.id).dormant, false);
  assert.equal(st.run.runTilesActivated, 1);
  assert.ok(Math.abs((coins0 - st.progress.coins) - price) < 1e-6);
  assert.ok(Math.abs(G.runTilePrice(st) - price * 1.6) < 1e-6);
});

test('T14j [R14.3 v2.20] activateTile sin saldo => {error:"noFunds"} sin mutar', () => {
  need('activateTile');
  const s = mkGame(1);
  s.progress.coins = 10; // por debajo de la base 40
  const cell = s.run.board.find(c => c.dormant && !c.blocked && G.isActivateEligible(s, c));
  const ret = G.activateTile(s, cell.id);
  assert.equal(ret && ret.error, 'noFunds');
  const st = unwind(ret, s);
  assert.equal(st.run.board.find(c => c.id === cell.id).dormant, true);
  assert.equal(st.progress.coins, 10);
  assert.equal(st.run.runTilesActivated || 0, 0);
});

test('T14k [R14.3 v2.20] activar no exige skill tables (no locked)', () => {
  need('activateTile');
  const s = mkGame(1);
  const cell = s.run.board.find(c => c.dormant && !c.blocked && G.isActivateEligible(s, c));
  const ret = G.activateTile(s, cell.id);
  assert.ok(!ret.error, `sin skill debe activar pagando monedas, dio ${JSON.stringify(ret && ret.error)}`);
  assert.equal(unwind(ret, s).run.board.find(c => c.id === cell.id).dormant, false);
});

test('T14l [R14.3 v2.20] openRun no conserva mesas ni el precio de la run anterior', () => {
  need('openRun'); need('activateTile');
  let s = mkGame(1);
  s.skills.tables = { owned: true, uses: 0, usesBought: 9 };
  s.progress.permTiles = 12;
  s = unwind(G.activateTile(s, s.run.board.find(c => c.dormant && G.isActivateEligible(s, c)).id), s);
  assert.ok(G.runTilePrice(s) > 40);
  const st = unwind(G.openRun(s, rng(5)), s);
  assert.equal(st.run.runTilesActivated, 0);
  assert.equal(G.runTilePrice(st), 40);
  assert.equal(st.run.board.filter(c => !c.dormant && !c.blocked).length, 7);
  // los campos permanentes que el caller dejó en memoria no reponen usos
  assert.notEqual(st.skills.tables && st.skills.tables.uses, 9);
});

test('T14m [R14.4 retirada] buyTablesUp y el dial permanente no existen', () => {
  assert.equal(typeof G.buyTablesUp, 'undefined');
  assert.equal(typeof G.permTilePrice, 'undefined');
  assert.equal(G.CONFIG.TABLES_PERM_BASE, undefined);
  assert.equal(G.CONFIG.TABLES_PERM_RATIO, undefined);
  assert.equal(G.CONFIG.TABLES_CAP_FROM_BOARD, undefined);
  const fresh = G.createGame();
  assert.equal(fresh.progress.permTiles, undefined);
  assert.equal(fresh.skills.tables, undefined);
  assert.equal(G.CONFIG.USES_SKILLS.includes('tables'), false);
});

test('T14n [R14.3] un objeto tables residual no se puede comprar', () => {
  const s = G.createGame({ progress: { coins: 0 } });
  s.skills.tables = { owned: false, uses: 0, usesBought: 0, price: 0 };
  s.progress.permTiles = 1;
  const coins = s.progress.coins;
  assert.equal(G.buySkill(s, 'tables').error, 'noSkill');
  assert.equal(G.buyUsesUp(s, 'tables').error, 'noUsesModel');
  assert.equal(s.progress.coins, coins);
  assert.equal(s.progress.permTiles, 1, 'la compra rechazada no toca el save en memoria');
  assert.equal(s.skills.tables.usesBought, 0);
});
