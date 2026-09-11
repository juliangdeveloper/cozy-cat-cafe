// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.18 (node:test, no deps).
// Block T24 — first-run tutorial flag (settings.seenTutorial).
// Run: node --test test/v2.t24.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

test('T24a createGame().settings.seenTutorial === false', () => {
  const s = G.createGame();
  assert.equal(s.settings.seenTutorial, false,
    'RED: fresh game must start with seenTutorial false (show tutorial)');
});

test('T24b deserialize v2.16-like JSON without seenTutorial → true (old players skip)', () => {
  const old = {
    version: 1,
    meta: { createdAt: 0, lastSavedAt: 0, lastSeenAt: 0, exportId: 'ccc-old' },
    progress: { coins: 100, totalGames: 2, cafeLevel: 3, productsBought: 0,
      clients: 3, boardCells: 7, colorsUnlocked: 1, colorsOwned: 4, permTiles: 1,
      econ: { multLevel: 0 } },
    economy: { multLevel: 0 },
    skills: {},
    idle: {
      workers:  { level: 0, ratePerSec: 0, cap: 0 },
      fame:     { level: 0, ratePerSec: 0, cap: 0 },
      machines: { level: 0, ratePerSec: 0, cap: 0 },
    },
    run: null,
    metaClose: null,
    settings: { reducedMotion: false },
  };
  assert.equal(Object.prototype.hasOwnProperty.call(old.settings, 'seenTutorial'), false);
  const s = G.deserializeState(JSON.stringify(old));
  assert.equal(s.settings.seenTutorial, true,
    'RED: missing seenTutorial on old save must default TRUE (never show tutorial)');
  assert.equal(s.progress.coins, 100, 'must not wipe coins');
  assert.equal(s.progress.totalGames, 2, 'must not wipe progress');
});

test('T24c deserialize with seenTutorial false stays false', () => {
  const fresh = G.createGame();
  assert.equal(fresh.settings.seenTutorial, false);
  const s = G.deserializeState(G.serializeState(fresh));
  assert.equal(s.settings.seenTutorial, false,
    'RED: explicit false must round-trip (new player mid-tutorial / after reset)');
});

test('T24d deserialize with seenTutorial true stays true', () => {
  const g = G.createGame();
  g.settings.seenTutorial = true;
  const s = G.deserializeState(G.serializeState(g));
  assert.equal(s.settings.seenTutorial, true);
});
