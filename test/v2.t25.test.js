// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.20 (node:test, no deps).
// Economía de mesas: solo curva temporal 40 × 1.6^n, reset entre runs.
// Sin tienda permanente. Saves viejos con permTiles / skills.tables cargan.
// Run: node --test test/v2.t25.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const open = (seed, coins = 100000) => {
  const s = G.createGame({ progress: { coins } });
  return unwind(G.openRun(s, mulberry32(seed)), s);
};
const eligible = (s) => s.run.board.find(c => c.dormant && !c.blocked && G.isActivateEligible(s, c));

test('T25a per-run price grows ×1.6 and resets on the next run', () => {
  assert.equal(G.CONFIG.RUN_TILE_BASE, 40);
  assert.equal(G.CONFIG.RUN_TILE_RATIO, 1.6);
  let s = open(1);
  assert.equal(G.runTilePrice(s), 40);
  const paid = [];
  for (let i = 0; i < 4; i++) {
    const cell = eligible(s);
    assert.ok(cell, `eligible cell at step ${i}`);
    const price = G.runTilePrice(s);
    const coins = s.progress.coins;
    s = unwind(G.activateTile(s, cell.id, mulberry32(20 + i)), s);
    paid.push(price);
    assert.ok(Math.abs((coins - s.progress.coins) - price) < 1e-6);
    assert.equal(s.run.runTilesActivated, i + 1);
  }
  for (let i = 1; i < paid.length; i++) {
    assert.ok(Math.abs(paid[i] / paid[i - 1] - 1.6) < 1e-9, `step ${i} is ×1.6`);
  }
  assert.ok(Math.abs(paid[0] - 40) < 1e-9);
  assert.ok(Math.abs(paid[3] - 40 * 1.6 ** 3) < 1e-6);

  const next = unwind(G.openRun(s, mulberry32(99)), s);
  assert.equal(next.run.runTilesActivated, 0);
  assert.equal(G.runTilePrice(next), 40);
  assert.equal(next.run.board.filter(c => !c.dormant && !c.blocked).length, 7);
  assert.ok(next.progress.coins < s.progress.coins + 1, 'coins spent on tables stay spent');
});

test('T25b no permanent table purchase is available', () => {
  assert.equal(typeof G.buyTablesUp, 'undefined');
  assert.equal(typeof G.buyPermTile, 'undefined');
  assert.equal(typeof G.permTilePrice, 'undefined');
  for (const key of ['TABLES_PERM_BASE', 'TABLES_PERM_RATIO', 'PERM_TILE_BASE', 'TABLES_CAP_FROM_BOARD']) {
    assert.equal(G.CONFIG[key], undefined, key);
  }
  assert.equal(G.CONFIG.USES_SKILLS.includes('tables'), false);
  const fresh = G.createGame({ progress: { coins: 5000 } });
  assert.equal(fresh.progress.permTiles, undefined);
  assert.equal(fresh.skills.tables, undefined);
  assert.equal(G.buySkill(fresh, 'tables').error, 'noSkill');
  fresh.skills.tables = { owned: true, uses: 0, usesBought: 4, price: 0 };
  fresh.progress.permTiles = 4;
  assert.equal(G.buySkill(fresh, 'tables').error, 'noSkill');
  assert.equal(G.buyUsesUp(fresh, 'tables').error, 'noUsesModel');
  assert.equal(fresh.progress.coins, 5000);
  assert.equal(fresh.skills.tables.usesBought, 4);

  const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');
  assert.equal(html.includes('buyTablesUp'), false);
  assert.equal(html.includes('permTilePrice'), false);
  assert.equal(html.includes('data-tables'), false);
  assert.match(html, /GAME_VERSION = 'v2\.24\.2'/);
});

test('T25c old save loads without throwing; v2.21 drops persistent meta, keeps the per-run price', () => {
  const old = {
    version: 1,
    meta: { createdAt: 1, lastSavedAt: 1, lastSeenAt: 1, exportId: 'ccc-1-oldsave' },
    progress: {
      coins: 1234, totalGames: 7, cafeLevel: 8, productsBought: 0,
      clients: 3, boardCells: 7, colorsUnlocked: 1, colorsOwned: 6,
      permTiles: 12,
      econ: { multLevel: 2 },
    },
    economy: { multLevel: 2 },
    skills: {
      destroyPile: { owned: true, uses: 2, usesBought: 3, price: 250, unlockLevel: 5 },
      tables: { owned: true, uses: 4, usesBought: 9, unlockLevel: 1, price: 0 },
      capacidad: { owned: true, level: 3, price: 120, unlockLevel: 1 },
    },
    idle: {
      workers:  { level: 1, ratePerSec: 0.5, cap: 60 },
      fame:     { level: 0, ratePerSec: 0, cap: 0 },
      machines: { level: 0, ratePerSec: 0, cap: 0 },
    },
    run: {
      phase: 'open',
      runTilesActivated: 2,
      board: [{ id: 'c0', dormant: false, blocked: false, stack: [] }],
      orders: [],
      activeClients: [],
      calamities: 0,
    },
    metaClose: null,
    settings: { reducedMotion: false, seenTutorial: true, boardRot: 90 },
  };
  const s = G.deserializeState(JSON.stringify(old));
  assert.equal(s.version, 1);
  assert.equal(s.progress.coins, 0);
  assert.equal(s.progress.totalGames, 0);
  assert.equal(s.progress.colorsOwned, 4);
  assert.equal(s.skills.destroyPile.owned, false);
  assert.equal(s.skills.capacidad.level, 0);
  assert.equal(s.idle.workers.level, 0);
  assert.equal(s.run, null);
  assert.equal(Object.prototype.hasOwnProperty.call(s.progress, 'permTiles'), false);
  assert.equal(s.skills.tables, undefined);

  const again = G.deserializeState(G.serializeState(s));
  assert.equal(JSON.stringify(again), JSON.stringify(s), 'fresh save round-trips');

  const imported = G.importSave(JSON.stringify(old));
  assert.equal(imported.error, undefined);
  assert.equal(imported.progress.coins, 0);
  assert.equal(imported.skills.tables, undefined);

  const resumed = unwind(G.openRun(s, mulberry32(3)), s);
  assert.equal(resumed.run.runTilesActivated, 0);
  assert.equal(G.runTilePrice(resumed), 40);
  resumed.progress.coins = 40;
  const cell = eligible(resumed);
  const paid = unwind(G.activateTile(resumed, cell.id), resumed);
  assert.equal(paid.run.board.find(c => c.id === cell.id).dormant, false);
  assert.equal(paid.progress.coins, 0);
});
