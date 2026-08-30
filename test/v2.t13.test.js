// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2 (node:test, no deps).
// Block T13 (clientes-criaturas y progresión de run) — [R13.3..R13.5, R13.7].
// TDD ROJO: ../js/game.js aún NO implementa los exports v2 (openRun v2-shape,
// buyColor, CONFIG.UNLOCK_PLACED_PILES/COLOR_PRICE_BASE); cada test falla con
// mensaje `RED:` claro. Dynamic import en before() para que el archivo cargue
// aunque falten exports. NO se modifica js/game.js.
// R13.6 (victoria = servir a todas las criaturas) se testea en otro archivo.
// Run: node --test test/v2.t13.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G; // módulo ../js/game.js (cargado en before())
test.before(async () => { G = await import('../js/game.js'); });

// RED gate: assert que un export existe, si no falla con mensaje claro
const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
// RED gate para constantes de balance CONFIG (R13.4/R13.7)
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

// rng determinista (misma implementación mulberry32 que rules.test.js)
const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };

// unwinding de retornos: v1/v2 pueden retornar state directo o {state}/{error}
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 10000 } });
  if (!s.progress.colorsOwned) s.progress.colorsOwned = 4; // R13.7: 4 de inicio
  if (typeof G.openRun === 'function') return unwind(G.openRun(s, mulberry32(seed)), s);
  return s;
};

// primera celda jugable (!blocked && !dormant) para colocar pilas
const playableCell = (s) =>
  (s.run && s.run.board || []).findIndex(c => !c.blocked && !c.dormant);

// ---------------------------------------------------------------------------
// Colocar `n` pilas del pool (avanza placedCounter / roster según R13.4).
// Usa placeStack(state, cellId, slot?, rng?) — si la v1 complica (devuelve
// {error} o no existe), FALLBACK documentado: mutamos state directamente
// (placedCounter+1; al llegar a UNLOCK_PLACED_PILES → reset y rosterIndex+1),
// replicando exactamente la mecánica R13.4 para que el test mid behaviour y no
// la firma. Devuelve { state, usedFallback } para que cada test decida.
// ---------------------------------------------------------------------------
const placePiles = (s, n, seed = 7) => {
  need('placeStack');
  const rng = mulberry32(seed);
  let cur = s, usedFallback = false;
  for (let i = 0; i < n; i++) {
    const cell = playableCell(cur);
    if (cell < 0) { usedFallback = true; }
    const ret = usedFallback ? { error: 'fallback' }
      : G.placeStack(cur, cell, undefined, rng);
    if (ret && ret.error) {
      // FALLBACK (comentado según consigna): mutación directa del state.
      usedFallback = true;
      cur.run.placedCounter = (cur.run.placedCounter || 0) + 1;
      const cap = (G.CONFIG && G.CONFIG.UNLOCK_PLACED_PILES) || 3;
      if (cur.run.placedCounter >= cap) {
        cur.run.placedCounter = 0;
        cur.run.rosterIndex = (cur.run.rosterIndex || 1) + 1;
      }
    } else {
      cur = unwind(ret, cur);
    }
  }
  return { state: cur, usedFallback };
};

// ---------------------------------------------------------------------------
// T13a — Arranque de run [R13.3]: rosterIndex===1 (solo el Gato), pool solo
// color 1, tablero 32 celdas (dual v2-shape [7,9,9,7], R14.1) con núcleo
// 2-3-2 jugable (7).
// ---------------------------------------------------------------------------
test('T13a [R13.3] openRun: rosterIndex 1, pool solo color 1, board 32, 7 jugables', () => {
  need('createGame'); need('openRun');
  const state = G.createGame({ progress: { coins: 10000 } });
  if (!state.progress.colorsOwned) state.progress.colorsOwned = 4; // R13.7
  let s2;
  try {
    s2 = unwind(G.openRun(state, mulberry32(1)), state);
  } catch {
    assert.ok(false, 'RED: openRun(state, rng) firma rota (debe retornar state con run v2)');
  }
  const run = s2.run;
  assert.ok(run, 'RED: openRun debe dejar state.run');
  assert.equal(run.rosterIndex, 1,
    `RED: al abrir la run solo llegó el Gato (rosterIndex===1), hay ${JSON.stringify(run.rosterIndex)}`);
  // pool solo fichas color 1 (R13.3 / R10.2 principio)
  const tiles = (run.pool || []).flat();
  assert.ok(tiles.length > 0, 'RED: run.pool debe tener fichas al abrir la run');
  assert.ok(tiles.every(t => t === 1),
    `RED: pool de arranque solo color 1 [R13.3], hay ${JSON.stringify([...new Set(tiles)])}`);
  // tablero dual 32 celdas (R14.1) — núcleo 2-3-2 jugable (R14.2)
  assert.ok(Array.isArray(run.board), 'RED: run.board debe ser array');
  assert.equal(run.board.length, 32, 'RED: el board de run v2 tiene 32 celdas [R14.1]'); // v2-shape: 30 → 32 (filas [7,9,9,7])
  const playable = run.board.filter(c => !c.blocked && !c.dormant).length;
  assert.equal(playable, 7, `RED: jugables al arranque = núcleo 2-3-2 (7), hay ${playable} [R13.3,R14.2]`);
});

// ---------------------------------------------------------------------------
// T13b — Desbloqueo cada UNLOCK_PLACED_PILES=3 pilas [R13.4]: colocar 3 pilas
// → rosterIndex===2 y run.orders incluye un pedido del color 2.
// ---------------------------------------------------------------------------
test('T13b [R13.4] 3 pilas colocadas → rosterIndex 2 y pedido de color 2', () => {
  needCfg('UNLOCK_PLACED_PILES');
  assert.equal(G.CONFIG.UNLOCK_PLACED_PILES, 3,
    `RED: CONFIG.UNLOCK_PLACED_PILES===3, hay ${JSON.stringify(G.CONFIG.UNLOCK_PLACED_PILES)}`);
  need('createGame'); need('openRun');
  const s = mkGame(1);
  assert.equal(s.run.rosterIndex, 1, 'RED: partida recién abierta, rosterIndex===1 [R13.3]');
  const { state: s2, usedFallback } = placePiles(s, 3, 7);
  if (usedFallback) {
    // NOTA: placeStack v1 complica (board/errors) → se mutó state directamente
    // (placedCounter/rosterIndex) replicando la mecánica R13.4 en placePiles().
    assert.ok(false, 'RED: placeStack v1 no soportó el flujo; roster advance vía placeStack no implementado');
  }
  assert.equal(s2.run.rosterIndex, 2,
    `RED: tras UNLOCK_PLACED_PILES=3 pilas llega la criatura del color 2 (rosterIndex===2), hay ${JSON.stringify(s2.run.rosterIndex)} [R13.4]`);
  assert.ok((s2.run.orders || []).some(o => o.color === 2),
    `RED: run.orders debe incluir un pedido del color 2 tras el desbloqueo [R13.2,R13.4], orders=${JSON.stringify(s2.run.orders)}`);
});

// ---------------------------------------------------------------------------
// T13c — Uniformidad del pool [R13.4 / T12.3]: con colores desbloqueados
// {1,2}, las NUEVAS tandas del pool (tras cada 3 pilas) deben mostrar >1
// color distinto entre semillas (test de uniformidad, NO distribución exacta).
// ---------------------------------------------------------------------------
test('T13c [R13.4] pool uniforme entre desbloqueados: 5 semillas → >1 color en nuevas tandas', () => {
  need('createGame'); need('openRun'); need('placeStack');
  const colorsSeen = new Set();
  for (let seed = 1; seed <= 5; seed++) {
    const s = mkGame(seed);
    // 3 pilas → desbloquea color 2 (rosterIndex 2); 3 más → nuevas tandas del pool
    const r1 = placePiles(s, 3, seed * 10);
    if (r1.usedFallback) {
      assert.ok(false, 'RED: placeStack no soportó el flujo R13.4 (fallback de mutación activo)');
    }
    assert.equal(r1.state.run.rosterIndex, 2,
      `RED: seed ${seed}: tras 3 pilas rosterIndex===2 (colores {1,2} desbloqueados) [R13.4]`);
    const r2 = placePiles(r1.state, 3, seed * 10 + 1);
    if (r2.usedFallback) {
      assert.ok(false, 'RED: placeStack no soportó el flujo R13.4 (fallback de mutación activo)');
    }
    for (const tile of (r2.state.run.pool || []).flat()) colorsSeen.add(tile);
  }
  assert.ok(colorsSeen.size > 1,
    `RED: entre semillas, las nuevas tandas del pool deben mostrar >1 color distinto (uniforme entre desbloqueados [R13.4/T12.3]), observados: ${JSON.stringify([...colorsSeen])}`);
});

// ---------------------------------------------------------------------------
// T13d — Techo de roster [R13.5 / T12.2]: con colorsOwned=4, el roster avanza
// hasta 5 (colorsOwned+1) y se ESTANCA ahí; completar la partida exige comprar
// colores. AMBIGUA: se asume rosterMax = colorsOwned + 1 (una unidad por
// encima del permanente), tal como lee RULES.md T12.2.
// ---------------------------------------------------------------------------
test('T13d [R13.5] con colorsOwned=4, muchas pilas → rosterIndex se estanca en 5', () => {
  need('createGame'); need('openRun'); need('placeStack');
  needCfg('UNLOCK_PLACED_PILES');
  const s = mkGame(1);
  s.progress.colorsOwned = 4;                 // GIVEN 4 colores comprados
  const rosterMax = s.progress.colorsOwned + 1; // AMBIGUA: techo = colorsOwned+1
  const { state: s2, usedFallback } = placePiles(s, 3 * 8, 21); // 24 pilas: sobra para llegar al techo
  if (usedFallback) {
    assert.ok(false, 'RED: placeStack v1 no soportó el flujo; techo de roster no verificable sin la mecánica real');
  }
  assert.equal(s2.run.rosterIndex, rosterMax,
    `RED: con colorsOwned=${s.progress.colorsOwned}, el roster debe estancarse en ${rosterMax} (colorsOwned+1) [R13.5], hay ${JSON.stringify(s2.run.rosterIndex)}`);
});

// ---------------------------------------------------------------------------
// T13f — Compra directa de color [R13.7]: buyColor(state) → colorsOwned+1 y
// coins -= COLOR_PRICE_BASE*(n-3) con n=colorsOwned+1; sin saldo →
// {error:'noFunds'} sin mutar. (R13.6 victoria se testea en otro archivo.)
// ---------------------------------------------------------------------------
test('T13f [R13.7] buyColor: colorsOwned+1, precio BASE*(n-3); sin saldo → {error:"noFunds"}', () => {
  need('buyColor'); needCfg('COLOR_PRICE_BASE');
  need('createGame');
  // caso feliz: 4 owned → n=5 → precio = COLOR_PRICE_BASE * (5-3)
  const s = G.createGame({ progress: { coins: 10000 } });
  if (!s.progress.colorsOwned) s.progress.colorsOwned = 4; // R13.7: 4 de inicio
  const n = s.progress.colorsOwned + 1;
  const price = G.CONFIG.COLOR_PRICE_BASE * (n - 3);
  assert.ok(price > 0, 'RED: COLOR_PRICE_BASE*(n-3) debe ser > 0 con n=colorsOwned+1');
  const st = unwind(G.buyColor(s), s);
  assert.equal(st.progress.colorsOwned, n,
    `RED: buyColor debe hacer colorsOwned+1 (${n}) [R13.7], hay ${JSON.stringify(st.progress.colorsOwned)}`);
  assert.equal(st.progress.coins, 10000 - price,
    `RED: coins debe descontar COLOR_PRICE_BASE*(n-3)=${price} [R13.7], hay ${JSON.stringify(st.progress.coins)}`);
  // sin saldo: {error:'noFunds'} y SIN mutar
  const s2 = G.createGame({ progress: { coins: 0 } });
  if (!s2.progress.colorsOwned) s2.progress.colorsOwned = 4;
  const ret = G.buyColor(s2);
  assert.ok(ret && ret.error === 'noFunds',
    `RED: sin saldo buyColor debe retornar {error:"noFunds"}, retornó ${JSON.stringify(ret)}`);
  const st2 = unwind(ret, s2);
  assert.equal(st2.progress.colorsOwned, 4, 'RED: error noFunds no debe mutar colorsOwned');
  assert.equal(st2.progress.coins, 0, 'RED: error noFunds no debe tocar coins');
});
