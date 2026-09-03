// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2 (node:test, no deps).
// Block T16 — CALAMIDADES v2 (R8 + R14.5: sobre celdas JUGABLES).
// Patrón de v2.t14.test.js: import dinámico en before(), need(), mulberry32.
// Run: node --test test/v2.t16.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G; // módulo ../js/game.js (cargado en before())
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

// run fresca con recursos para activar muchas baldosas
const mkGame = (seed = 1) => {
  const s = G.createGame({ progress: { coins: 1000000, permTiles: 30 } });
  const run = unwind(G.openRun(s, rng(seed)), s);
  // v2.2 R14.3: activateTile es modelo USOS de skills.tables — inyectar usos
  run.skills.tables = { owned: true, uses: 99, usesBought: 0 };
  return run;
};
const playableIdx = (s) => s.run.board
  .map((c, i) => ({ c, i })).filter((x) => !x.c.dormant && !x.c.blocked).map((x) => x.i);
const dormantIdx = (s) => s.run.board
  .map((c, i) => ({ c, i })).filter((x) => x.c.dormant && !x.c.blocked).map((x) => x.i);

// activar `k` baldosas (con rng determinista por paso) sobre la run dada
function activate(s, k, seed = 7) {
  let st = s;
  for (let j = 0; j < k; j++) {
    const d = dormantIdx(st);
    if (!d.length) break;
    st = unwind(G.activateTile(st, d[j % d.length], mulberry32(seed * 100 + j)), st);
    if (st.error) break;
  }
  return st;
}

// ---------------------------------------------------------------------------
// T16a — openRun con núcleo 7 jugable: SIN calamidades [R8.1, R14.5]
// ---------------------------------------------------------------------------
test('T16a [R8.1,R14.5] openRun (7 jugables) => calamities===0, sin blocked', () => {
  need('openRun'); need('applyCalamities'); needCfg('CALAMITY_THRESHOLD');
  for (const seed of [1, 2, 3]) {
    const s = mkGame(seed);
    assert.equal(s.run.calamities, 0, `RED: con 7 jugables NO hay calamidades (seed ${seed})`);
    assert.equal(s.run.calamitiesApplied, false, 'RED: el flag no debe marcarse sin cruzar umbral');
    assert.equal(s.run.board.filter(c => c.blocked).length, 0,
      `RED: sin calamidades no puede haber celdas blocked (seed ${seed})`);
    assert.equal(playableIdx(s).length, 7, 'RED: núcleo jugable = 7');
  }
});

// ---------------------------------------------------------------------------
// T16b — activar hasta jugables=16 => applyCalamities vía activateTile:
// calamities ∈ [lo,hi] con lo=ceil(16/5)=4, hi=floor(16/3)=5 [R8.2, R14.5]
// ---------------------------------------------------------------------------
test('T16b [R8.2,R14.5] jugables=16 => calamities en [4,5] (>0 y <= floor(16/3))', () => {
  need('activateTile'); need('applyCalamities');
  const counts = new Set();
  for (const seed of [11, 12, 13, 14]) {
    let s = mkGame(seed);
    // 9 activaciones: 7 núcleo + 9 activadas = 16 jugables > 15
    s = activate(s, 9, seed);
    // al cruzar el umbral había 7+9=16 jugables (las calamidades se calculan
    // SOBRE ese conteo; después, las blocked reducen las jugables visibles)
    assert.equal(s.run.runTilesActivated, 9, 'RED: 9 baldosas activadas');
    assert.equal(s.run.calamitiesApplied, true, 'RED: el flag debe marcarse al cruzar el umbral');
    const lo = Math.ceil(16 / 5), hi = Math.floor(16 / 3);
    assert.ok(s.run.calamities > 0, `RED: cruzado el umbral debe haber calamidades (seed ${seed})`);
    assert.ok(s.run.calamities >= lo && s.run.calamities <= hi,
      `RED: calamities=${s.run.calamities} fuera de [lo=${lo},hi=${hi}] (seed ${seed})`);
    assert.ok(s.run.calamities <= Math.floor(16 / 3),
      'RED: con 16 jugables el techo es floor(16/3)=5');
    // celdas de calamidad reales == count anotado
    const cal = s.run.board.filter(c => c.calamity).length;
    assert.equal(cal, s.run.calamities, 'RED: celdas calamity === run.calamities');
    counts.add(s.run.calamities);
  }
  assert.ok(counts.size >= 1, 'RED: sin observaciones');
});

// ---------------------------------------------------------------------------
// T16c — ~50/50 blocked vs pila pre-colocada (ambos tipos aparecen) [R8.3,R8.4]
// ---------------------------------------------------------------------------
test('T16c [R8.3,R8.4] varias semillas: blocked y pre-pila AMBOS aparecen, mezcla ~50/50', () => {
  need('activateTile'); need('applyCalamities');
  let blocked = 0, prestack = 0, total = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = activate(mkGame(seed), 9, seed);
    if (!s.run || !s.run.calamitiesApplied) continue;
    for (const c of s.run.board) {
      if (!c.calamity) continue;
      total++;
      if (c.blocked) { blocked++; assert.equal(c.calamityStack, false, 'RED: blocked XOR pre-pila');
        assert.ok(Array.isArray(c.hiddenStack) && c.hiddenStack.length >= 1, 'v2.8: candado lleva hiddenStack'); }
      else if (c.dormant) { // v2.8: dormant con pila oculta (no cuenta como visible)
        assert.equal(c.stack.length, 0, 'v2.8: dormant sin stack visible');
        assert.ok(Array.isArray(c.hiddenStack) && c.hiddenStack.length >= 1, 'v2.8: dormant => hiddenStack');
      }
      else {
        prestack++;
        assert.ok(!c.blocked && c.stack.length >= 1, 'RED: pre-pila => no blocked y stack>=1');
      }
    }
  }
  assert.ok(blocked > 0, 'RED: deben aparecer celdas BLOCKED en alguna semilla');
  assert.ok(prestack > 0, 'RED: deben aparecer pilas PRE-COLOCADAS en alguna semilla');
  // v2.8: la mezcla ~50/50 aplica sobre las NO-dormant (las dormant con pila
  // oculta diluyen el total — R8.1 v2 permite calamidad en las 32 celdas)
  const visibles = blocked + prestack;
  const frac = blocked / visibles;
  assert.ok(frac >= 0.3 && frac <= 0.7,
    `RED: mezcla ~50/50, blocked/visibles = ${frac.toFixed(2)} (${blocked}/${visibles})`);
});

// ---------------------------------------------------------------------------
// T16d — celdas blocked: no colocables NI activables [R8.4, R3.5]
// ---------------------------------------------------------------------------
test('T16d [R8.4] celda blocked: placeStack {error}, activateTile no la activa, destroy {error}', () => {
  need('activateTile'); need('placeStack'); need('useDestroyPile');
  const s = activate(mkGame(21), 9, 21);
  const bIdx = s.run.board.findIndex(c => c.blocked);
  assert.ok(bIdx >= 0, 'RED: la escenario debe contener una celda blocked');
  const snap = JSON.stringify(s);
  // no colocable
  const p = G.placeStack(s, bIdx);
  assert.ok(p.error === 'blocked', `RED: placeStack en blocked debe dar error 'blocked', dio ${JSON.stringify(p.error)}`);
  assert.equal(p.state, undefined, 'RED: placeStack blocked no debe retornar state');
  // no activable (una blocked ya no es dormant)
  const a = G.activateTile(s, bIdx, rng(1));
  assert.ok(a.error, 'RED: activateTile sobre blocked debe fallar');
  // no destruible (skill owned para llegar al guard de blocked, no al de locked)
  const sd = JSON.parse(JSON.stringify(s));
  sd.skills.destroyPile = { owned: true, uses: 2, price: 250, unlockLevel: 5 };
  const d = G.useDestroyPile(sd, bIdx);
  assert.ok(d.error === 'blocked', 'RED: useDestroyPile sobre blocked debe dar error');
  assert.equal(JSON.stringify(s), snap, 'RED: los errores no deben mutar el estado');
});

// ---------------------------------------------------------------------------
// T16e — pila pre-colocada: v2.2 placeStack SOLO en espacios VACÍOS => la
// pre-pila de calamidad NO acepta pilas del pool ({error:'occupied'}).
// ---------------------------------------------------------------------------
test('T16e [R8.3,R3.5 v2.2] celda con pila pre-colocada NO acepta placeStack (occupied)', () => {
  need('placeStack'); need('activateTile');
  let done = false;
  for (let seed = 1; seed <= 20 && !done; seed++) {
    const s = activate(mkGame(seed), 9, seed);
    if (!s.run || !s.run.calamitiesApplied) continue;
    const i = s.run.board.findIndex(c => c.calamityStack && !c.blocked);
    if (i < 0) continue;
    assert.ok(s.run.board[i].stack.length >= 1, 'RED: la pila pre-colocada debe tener >=1 ficha');
    const snap = JSON.stringify(s);
    const res = G.placeStack(s, i);                    // v2.2: pilas solo en VACÍAS
    assert.ok(res && res.error === 'occupied',
      `RED: placeStack sobre pre-pila debe dar {error:"occupied"}, dio ${JSON.stringify(res && res.error)}`);
    assert.equal(JSON.stringify(s), snap, 'RED: occupied no debe mutar el estado');
    done = true;
  }
  assert.ok(done, 'RED: ninguna semilla produjo celda pre-pila colocable');
});

// ---------------------------------------------------------------------------
// T16f — bonus al cerrar = CALAMITY_BONUS_PER * calamities [R8.5, R5.3]
// ---------------------------------------------------------------------------
test('T16f [R8.5] closeRun: bonus === CALAMITY_BONUS_PER * calamities (constante v1 intacta)', () => {
  need('closeRun'); needCfg('CALAMITY_BONUS_PER');
  assert.equal(typeof G.CONFIG.CALAMITY_BONUS_PER, 'number');
  assert.ok(G.CONFIG.CALAMITY_BONUS_PER > 0, 'RED: CALAMITY_BONUS_PER debe ser positivo');
  const s = activate(mkGame(31), 9, 31);
  assert.ok(s.run.calamities > 0, 'RED: la escenario debe tener calamidades');
  const coins0 = s.progress.coins;
  const closed = G.closeRun(s, 'manual');
  const expected = G.CONFIG.CALAMITY_BONUS_PER * s.run.calamities;
  assert.equal(closed.metaClose.bonus, expected,
    `RED: bonus=${closed.metaClose.bonus}, esperado CALAMITY_BONUS_PER*calamities=${expected}`);
  assert.equal(closed.progress.coins, coins0 + expected, 'RED: coins debe sumar el bonus');
});
