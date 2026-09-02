// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.2 (node:test, no deps).
// Block T14b — tablero RECTANGULAR 8×4 pointy (32 celdas) + Activate por USOS
// (skill 'tables', modelo USES R17.2; compra permanente = buyTablesUp R14.4).
// Fuente de verdad: RULES.md §R14 (v2.2), §R17.2, §R13.4.
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
test('T14g [R14.1] generateBoard(32): rectángulo pointy 8×4 (4 filas de 8)', () => {
  need('generateBoard');
  const board = G.generateBoard(32, mulberry32(1));
  assert.ok(Array.isArray(board) && board.length === 32, 'RED: generateBoard(32) debe retornar 32 celdas');
  const rows = new Map();
  for (const c of board) {
    assert.ok(Number.isFinite(c.r), `RED: celda sin r: ${JSON.stringify(c)}`);
    rows.set(c.r, (rows.get(c.r) || 0) + 1);
  }
  assert.equal(rows.size, 4, `RED: rectángulo 8×4 = 4 filas axiales, hay ${rows.size}`);
  const ordered = [...rows.keys()].sort((a, b) => a - b).map(r => rows.get(r));
  assert.deepEqual(ordered, [8, 8, 8, 8], `RED: 4 filas de 8, hay ${JSON.stringify(ordered)}`);
  const patterns = [...rows.keys()].sort((a, b) => a - b).map(r => {
    const cols = board.filter(c => c.r === r).map(c => c.q + Math.floor(r / 2)).sort((a, b) => a - b);
    assert.equal(new Set(cols).size, 8, `RED: fila r=${r} debe cubrir 8 columnas plegadas consecutivas`);
    return cols;
  });
  const base = patterns[0].join(',');
  for (const p of patterns) assert.equal(p.join(','), base, 'RED: las 4 filas deben compartir el patrón de columnas (rectángulo)');
});

// ---------------------------------------------------------------------------
// T14h — Arranque: núcleo 2-3-2 jugable (7), resto dormant (25) [R14.2]
// (el núcleo mantiene sus coords axial — solo cambia el shape del tablero)
// ---------------------------------------------------------------------------
test('T14h [R14.2] tras openRun: 7 jugables (núcleo 2-3-2) y 25 dormant', () => {
  need('createGame'); need('openRun');
  const s = mkGame(1);
  const board = s.run && s.run.board;
  assert.ok(Array.isArray(board), 'RED: openRun debe dejar state.run.board');
  assert.equal(board.length, 32, 'RED: el board de run debe exponer las 32 celdas [R14.1]');
  const playable = board.filter(c => !c.dormant && !c.blocked);
  assert.equal(playable.length, 7, 'RED: jugables al inicio = núcleo 2-3-2 (7) [R14.2]');
  const byCol = {};
  for (const c of playable) byCol[c.q] = (byCol[c.q] || 0) + 1;
  assert.deepEqual({ '-1': 2, '0': 3, '1': 2 }, { '-1': byCol[-1], '0': byCol[0], '1': byCol[1] },
    'RED: el núcleo jugable conserva las coords axial del 2-3-2');
  assert.equal(board.length - playable.length, 25, 'RED: las otras 25 celdas dormant [R14.2]');
});

// ---------------------------------------------------------------------------
// Activate por USOS [R14.3 v2.2]: skill 'tables' modelo USES (R17.2).
//  * activateTile consume 1 uso de skills.tables.uses (NO cobra coins).
//  * CONFIG.USES_PER_RUN.tables = 1 (base por partida).
//  * openRun repone uses = USES_PER_RUN.tables + usesBought.
//  * sin usos => {error:'noUses'} sin mutar; sin owned => {error:'locked'}.
// ---------------------------------------------------------------------------
test('T14i [R14.3 v2.2] activateTile: consume 1 uso de tables, NO cobra coins', () => {
  need('activateTile'); need('runTilePrice');
  const s = mkGame(1);
  s.skills.tables = { owned: true, uses: 2, usesBought: 0 };
  const cell = s.run.board.find(c => c.dormant && !c.blocked);
  assert.ok(cell, 'RED: debe existir una celda dormant que activar');
  const coins0 = s.progress.coins;
  const st = unwind(G.activateTile(s, cell.id), s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.equal(target.dormant, false, 'RED: la celda debe activarse');
  assert.equal(st.run.runTilesActivated, 1, 'RED: run.runTilesActivated debe incrementarse');
  assert.equal(st.skills.tables.uses, 1, 'RED: activateTile debe consumir 1 uso de skills.tables');
  assert.equal(st.progress.coins, coins0, 'RED: activar NO debe cobrar coins (el costo vive en la tienda) [R14.3 v2.2]');
  assert.equal(G.runTilePrice(st), 0, 'RED: runTilePrice === 0 (sin precio por activación)');
});

test('T14j [R14.3 v2.2] activateTile sin usos => {error:"noUses"} sin mutar', () => {
  need('activateTile');
  const s = mkGame(1);
  s.skills.tables = { owned: true, uses: 0, usesBought: 0 };
  const cell = s.run.board.find(c => c.dormant && !c.blocked);
  const snap = { dormant: cell.dormant, coins: s.progress.coins };
  const ret = G.activateTile(s, cell.id);
  assert.ok(ret && ret.error === 'noUses', `RED: sin usos debe dar {error:"noUses"}, dio ${JSON.stringify(ret)}`);
  const st = unwind(ret, s);
  const target = st.run.board.find(c => c.id === cell.id);
  assert.equal(target.dormant, snap.dormant, 'RED: noUses no debe activar la celda');
  assert.equal(st.progress.coins, snap.coins, 'RED: noUses no debe tocar coins');
  assert.equal(st.run.runTilesActivated, 0, 'RED: noUses no debe contar activaciones');
});

test('T14k [R14.3 v2.2] activateTile sin la skill => {error:"locked"} sin mutar', () => {
  need('activateTile');
  const s = mkGame(1);
  const cell = s.run.board.find(c => c.dormant && !c.blocked);
  const ret = G.activateTile(s, cell.id);
  assert.ok(ret && ret.error === 'locked', `RED: sin skill debe dar {error:"locked"}, dio ${JSON.stringify(ret)}`);
  const st = unwind(ret, s);
  assert.equal(st.run.board.find(c => c.id === cell.id).dormant, true, 'RED: locked no debe activar');
});

test('T14l [R17.2 v2.3] openRun repone tables.uses = usesBought', () => {
  need('openRun');
  const s = G.createGame({ progress: { coins: 10000 } });
  s.skills.tables = { owned: true, uses: 0, usesBought: 2 };
  const st = unwind(G.openRun(s, rng(5)), s);
  assert.equal(st.skills.tables.uses, 2,
    'RED: openRun debe repone uses = usesBought (R17.2 v2.3, sin base)');
});

// ---------------------------------------------------------------------------
// Compra permanente = mesas activables por partida [R14.4 v2.2]:
//  * buyTablesUp(state): permTiles+1 Y skills.tables.usesBought+1;
//    precio = PERM_TILE_BASE * 1.35^permTiles (sin redondeo, igual que antes).
//  * comprar NO activa ninguna celda (la activación es temporal por partida).
// ---------------------------------------------------------------------------
test('T14m [R14.4 v2.5] buyTablesUp: permTiles+1, usesBought+1, coins -= TABLES_PERM_BASE*RATIO^permTiles', () => {
  need('buyTablesUp'); need('permTilePrice'); needCfg('PERM_TILE_BASE'); needCfg('TABLES_PERM_RATIO');
  assert.equal(G.CONFIG.TABLES_PERM_BASE, 80, 'RED: v2.5 dial TABLES_PERM_BASE===80');
  assert.equal(G.CONFIG.TABLES_PERM_RATIO, 1.25, 'RED: v2.5 dial TABLES_PERM_RATIO===1.25');
  const s = G.createGame({ progress: { coins: 100000 } });
  s.skills.tables = { owned: false, uses: 0, usesBought: 0 };
  s.progress.permTiles = 1;
  const price = G.permTilePrice(s);
  const st = unwind(G.buyTablesUp(s), s);
  assert.equal(st.progress.permTiles, 2, 'RED: buyTablesUp debe subir el techo permanente [R14.4]');
  assert.equal(st.skills.tables.usesBought, 1, 'RED: buyTablesUp debe subir usesBought (mesas por partida)');
  assert.equal(st.skills.tables.owned, true, 'RED: comprar la 1ª vez marca tables como owned');
  assert.ok(Math.abs((st.progress.coins - 100000) + price) < 1e-6, 'RED: coins debe descontar permTilePrice exacto');
  assert.equal(G.permTilePrice(st), G.CONFIG.TABLES_PERM_BASE * G.CONFIG.TABLES_PERM_RATIO ** st.progress.permTiles,
    'RED: permTilePrice = TABLES_PERM_BASE * RATIO^permTiles [R14.4 v2.5]');
});

test('T14n [R14.4 v2.2] buyTablesUp sin saldo => {error:"noFunds"} sin mutar; comprar NO activa celdas', () => {
  need('buyTablesUp');
  const s = G.createGame({ progress: { coins: 0 } });
  s.skills.tables = { owned: false, uses: 0, usesBought: 0 };
  s.progress.permTiles = 1;
  const ret = G.buyTablesUp(s);
  assert.ok(ret && ret.error === 'noFunds', `RED: sin saldo debe dar noFunds, dio ${JSON.stringify(ret)}`);
  const st = unwind(ret, s);
  assert.equal(st.progress.permTiles, 1, 'RED: noFunds no debe mutar permTiles');
  assert.equal(st.skills.tables.usesBought, 0, 'RED: noFunds no debe mutar usesBought');
});
