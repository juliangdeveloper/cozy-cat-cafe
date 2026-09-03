// ============================================================================
// Block T19 — v2.4: tope de usos (MAX_USES_PER_SKILL=5; tables = tablero−7),
// refresh multicolor (v2Pile + poolMaxColor), badge run del tope (topRunCount).
// Run: node --test test/v2.t19.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = (n) => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const needCfg = (k) => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} falta`);
const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
// buySkill puede retornar {error} o el estado nuevo — normaliza ambos
const unwind = (ret, fallback) => (ret && ret.error) ? fallback : ret;

test('T19a [v2.4] CONFIG: MAX_USES_PER_SKILL=5 y USES_SKILLS completo', () => {
  needCfg('MAX_USES_PER_SKILL'); needCfg('USES_SKILLS');
  assert.equal(G.CONFIG.MAX_USES_PER_SKILL, 5, 'RED: tope de usos = 5 por partida');
  assert.deepEqual(G.CONFIG.USES_SKILLS,
    ['destroyPile', 'swapPiles', 'refreshPool', 'queueSkip', 'tables', 'unlockLocks']); // v2.8 += unlockLocks
});

test('T19b [v2.4] buySkill respeta tope 5: 5 compras OK, la 6ª => maxUses', () => {
  need('buySkill');
  let s = G.createGame({ progress: { coins: 1e9, totalGames: 50 } });
  for (let i = 0; i < 5; i++) {
    s = unwind(G.buySkill(s, 'refreshPool'), s);
    assert.ok(!s.error, `RED: compra ${i + 1} no debe dar error, dio ${JSON.stringify(s.error)}`);
    assert.equal(s.skills.refreshPool.usesBought, i + 1, `RED: usesBought=${i + 1}`);
  }
  assert.equal(s.skills.refreshPool.usesBought, 5, 'RED: tope exacto 5 usos/partida');
  const r6 = G.buySkill(s, 'refreshPool');
  assert.equal(r6.error, 'maxUses', 'RED: la 6ª compra debe dar {error:"maxUses"}');
  assert.ok(!('state' in r6) || r6.state.progress.coins === s.progress.coins,
    'RED: maxUses no debe cobrar');
});

test('T19c [v2.4] buyTablesUp: capa = tablero−núcleo (25 con 32 celdas), NO el tope 5', () => {
  need('buyTablesUp');
  let s = G.createGame({ progress: { coins: 1e9 } });
  for (let i = 0; i < 6; i++) {
    s = unwind(G.buyTablesUp(s), s);
    assert.ok(!s.error, `RED: compra de mesa ${i + 1} debe permitir >5 (usaBought=${i + 1})`);
  }
  assert.equal(s.skills.tables.usesBought, 6, 'RED: tables NO está limitada a 5');
});

test('T19d [v2.4] useRefreshPool genera multicolor igual que openRun (bug monocolor)', () => {
  need('useRefreshPool'); need('openRun');
  let s = G.createGame({ progress: { coins: 1e9 } });
  s.skills.refreshPool = { owned: true, uses: 999, usesBought: 5 };
  s = unwind(G.openRun(s, mulberry32(11)), s);
  const rosterIdx = s.run.rosterIndex || 1;
  const cu = Math.min(rosterIdx, s.progress.colorsOwned);
  assert.ok(cu >= 2, `RED: precondition — cu=${cu} debe ser >=2 para probar multicolor`);
  const st = unwind(G.useRefreshPool(s, mulberry32(23)), s);
  assert.ok(!st.error, `RED: refresh OK, dio ${JSON.stringify(st && st.error)}`);
  const colors = new Set();
  st.run.pool.forEach((p) => p.forEach((c) => colors.add(c)));
  assert.ok(colors.size >= 1 && Math.max(...colors) <= cu,
    'RED: los colores del pool deben ser <= cu (poolMaxColor)');
  // con 200 refreshes sobre la MISMA semilla el multicolor es estadístico: pilas
  // grandes (>=4) no pueden ser de un solo color SIEMPRE (prob monocolor < 1)
  let monocolorBig = 0, big = 0, refreshErrors = 0;
  let cur = st;
  for (let i = 0; i < 60; i++) {
    cur.skills.refreshPool.uses = 999;          // sondeo sin tope del guard
    const r = G.useRefreshPool(cur, mulberry32(100 + i));
    if (r.error) { refreshErrors++; continue; }
    cur = r;
    for (const p of cur.run.pool) {
      if (p.length >= 4) { big++; if (new Set(p).size === 1) monocolorBig++; }
    }
  }
  assert.ok(big > 10, 'RED: precondition — deben aparecer pilas grandes');
  assert.ok(monocolorBig < big, 'RED: pilas grandes monocolor SIEMPRE => refresh sigue v1 (bug)');
  assert.equal(refreshErrors, 0, 'RED: ningún refresh del sondeo debe fallar');
});

test('T19e [v2.4] topRunCount: racha contigua del tope (badge azul-verde-verde=2, rojo-naranja-rojo=1)', () => {
  need('topRunCount');
  assert.equal(G.topRunCount([1, 2, 2]), 2, 'RED: [1,2,2] => run del tope = 2');
  assert.equal(G.topRunCount([3, 1, 3]), 1, 'RED: [3,1,3] => run del tope = 1');
  assert.equal(G.topRunCount([2, 2, 2]), 3, 'RED: [2,2,2] => run del tope = 3');
  assert.equal(G.topRunCount([]), 0, 'RED: [] => 0');
  assert.equal(G.topRunCount([5]), 1, 'RED: [5] => 1');
});
