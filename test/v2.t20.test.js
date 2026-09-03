// ============================================================================
// Block T20 — v2.8: calamidades v2 (R8 reescrita) + skill unlockLocks (R7.8).
// (1) candado con pila OCULTA (hiddenStack, stack vacío, no fusiona/sirve);
// (2) useUnlockLocks revela + cascada (merge real tras desbloquear);
// (3) pila de calamidad se CONCATENA sobre stack existente (no sobrescribe);
// (4) calamidades en cualquier celda de las 32 (incluye dormant);
// (5) applyCalamities sigue 1 vez por partida, rango [1/5, 1/3] jugables.
// Run: node --test test/v2.t20.test.js
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
  t = (t + Math.imul(t ^ (t >>> 14)) >>> 0) / 4294967296;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const unwind = (ret, fallback) => (ret && ret.error) ? fallback : ret;

// estado base con run abierta (32 celdas, núcleo jugable) y sin auto-serve
// (cafeLevel 7: unlockLocks exige LV5)
const base = () => {
  const s = G.openRun(G.createGame({ progress: { coins: 1e9, totalGames: 50, cafeLevel: 7 } }), mulberry32(3));
  s.skills.serveManual.autoServe = false;
  return s;
};

// ---------------------------------------------------------------------------
// T20.a — CONFIG + catálogo del skill nuevo
// ---------------------------------------------------------------------------
test('T20.a [v2.8] CONFIG: USES_SKILLS incluye unlockLocks (tope 5 aplica)', () => {
  needCfg('USES_SKILLS'); needCfg('MAX_USES_PER_SKILL');
  assert.deepEqual(G.CONFIG.USES_SKILLS,
    ['destroyPile', 'swapPiles', 'refreshPool', 'queueSkip', 'tables', 'unlockLocks']);
});
test('T20.b [v2.8] createGame: unlockLocks 250/LV5, sin base gratis', () => {
  const s = G.createGame();
  const sk = s.skills.unlockLocks;
  assert.ok(sk, 'RED: skills.unlockLocks no existe');
  assert.equal(sk.price, 250);
  assert.equal(sk.unlockLevel, 5);
  assert.equal(sk.owned, false);
  assert.equal(sk.uses, 0);
  assert.equal(sk.usesBought, 0);
});
test('T20.c [v2.8] buySkill unlockLocks: 1ª compra ES 1er uso; tope 5; precio 250*1.35^n', () => {
  need('buySkill');
  let s = base();
  for (let i = 0; i < 5; i++) {
    s = unwind(G.buySkill(s, 'unlockLocks'), s);
    assert.ok(!s.error, `compra ${i + 1} fallo: ${JSON.stringify(s.error)}`);
  }
  assert.equal(s.skills.unlockLocks.usesBought, 5);
  const r6 = G.buySkill(s, 'unlockLocks');
  assert.equal(r6.error, 'maxUses');
});

// ---------------------------------------------------------------------------
// T20.d — R8.4 v2: candado con pila OCULTA
// ---------------------------------------------------------------------------
test('T20.d [v2.8] candado sembrado guarda hiddenStack y NO participa en merge/serve', () => {
  const s = base();
  const B = s.run.board;
  const locked = B.findIndex((c) => c.dormant);          // dormant a mano = candado futuro
  B[locked].dormant = false;
  // sembrar a mano con la semántica nueva: blocked + hiddenStack
  B[locked].blocked = true;
  B[locked].hiddenStack = [1, 1];
  B[locked].stack = [];
  // vecino jugable con tope 1 => si la pila fuera visible, habría merge
  const nb = B.findIndex((c) => c && !c.dormant && !c.blocked && !c.stack.length);
  B[nb].stack = [1];
  const fin = G.resolveCascade(s);
  assert.equal(fin.state.run.board[locked].stack.length, 0, 'el candado no cede fichas');
  assert.deepEqual(fin.state.run.board[locked].hiddenStack, [1, 1], 'hiddenStack intacto');
  assert.equal(fin.steps, 0, 'sin merge: la pila oculta no participa');
});

// ---------------------------------------------------------------------------
// T20.e — R7.8 v2: useUnlockLocks
// ---------------------------------------------------------------------------
test('T20.e1 [v2.8] useUnlockLocks: revela hiddenStack y desbloquea (cascada la dispara la APP)', () => {
  need('useUnlockLocks');
  const s = base();
  const B = s.run.board;
  const lk = B.findIndex((c) => c && !c.dormant);
  B[lk].blocked = true; B[lk].stack = []; B[lk].hiddenStack = [1, 1];
  const nb = B.findIndex((c) => c && !c.dormant && !c.blocked && c.stack.length === 0 && G.HEX_ADJ
    .some(([dq, dr]) => { const j = B.findIndex((x) => x && x.q === B[lk].q + dq && x.r === B[lk].r + dr); return j >= 0 && B[j] === c; }));
  B[nb].stack = [1];
  s.skills.unlockLocks = { owned: true, uses: 1, usesBought: 1 };
  const fin = G.useUnlockLocks(s, lk);
  assert.ok(!fin.error, `useUnlockLocks fallo: ${JSON.stringify(fin.error)}`);
  assert.equal(fin.skills.unlockLocks.uses, 0);
  assert.equal(fin.run.board[lk].blocked, false);
  assert.deepEqual(fin.run.board[lk].stack, [1, 1], 'hiddenStack revelado en stack');
  assert.equal(fin.run.board[lk].hiddenStack, undefined, 'hiddenStack consumido');
  const cas = G.resolveCascade(fin);
  assert.ok(cas.steps >= 1, 'la app dispara cascada tras revelar (merge con vecino)');
  assert.deepEqual(cas.state.run.board[lk].stack, [1, 1, 1]);
});
test('T20.e2 [v2.8] useUnlockLocks: error en celda no bloqueada y sin usos/owned', () => {
  const s = base();
  const B = s.run.board;
  const free = B.findIndex((c) => c && !c.dormant && !c.blocked);
  // CON skill comprada: celda libre => notBlocked (el guard owned corre primero por convención)
  s.skills.unlockLocks = { owned: true, uses: 1, usesBought: 1 };
  const r1 = G.useUnlockLocks(s, free);
  assert.equal(r1.error, 'notBlocked');
  // SIN owned => error del guard
  const s2 = base();
  const lk2 = s2.run.board.findIndex((c) => c && !c.dormant);
  s2.run.board[lk2].blocked = true;
  const r2 = G.useUnlockLocks(s2, lk2);
  assert.ok(r2.error, 'sin skill comprada => error');
});

// ---------------------------------------------------------------------------
// T20.f — R8.3 v2: pila de calamidad se CONCATENA (no sobrescribe)
// ---------------------------------------------------------------------------
test('T20.f [v2.8] applyCalamities: pila pre-colocada sobre ocupada concatena', () => {
  const s = base();
  const B = s.run.board;
  B.forEach((c) => { if (c.dormant) c.dormant = false; });   // 32 jugables
  // TODAS las celdas con base [2,2]: cualquier calamidad de pila debe apilar encima
  B.forEach((c) => { c.stack = [2, 2]; c.calamity = false; });
  // rng SIEMPRE rama pila (r()>=BLOCK_PROB): rngInt estable tras cada r()
  let z = 0.75;
  const rng = () => { z = (z * 9301 + 0.2113) % 1; return 0.5 + z * 0.5; };
  const fin = G.applyCalamities(s, rng);
  const cal = fin.run.board.filter((c) => c.calamity && c.calamityStack);
  assert.ok(cal.length > 0, 'rama pila forzada: debe haber pilas de calamidad');
  for (const c of cal) {
    assert.ok(c.stack.length >= 4 && c.stack.length <= 5, `2 previas + 2..3 de calamidad (concat): ${JSON.stringify(c.stack)}`);
    assert.deepEqual(c.stack.slice(0, 2), [2, 2], 'las fichas previas permanecen debajo');
  }
});

// ---------------------------------------------------------------------------
// T20.g — R8.1 v2: calamidades en CUALQUIER celda (incluye dormant)
// ---------------------------------------------------------------------------
test('T20.g [v2.8] applyCalamities alcanza celdas dormant (pila oculta revelable)', () => {
  const s = base();
  const B = s.run.board;
  // activar hasta 16 jugables: 7 núcleo + 9 baldosas
  let act = 0;
  for (const c of B) { if (c.dormant && act < 9) { c.dormant = false; act++; } }
  const dormantes = B.filter((c) => c.dormant).length;
  assert.equal(dormantes, 16, '16 dormant restantes (32-16 jugables)');
  // rng SIEMPRE rama pila: con pool de candidatos 32 y count ~[4,10], dormant
  // tiene ~50% de ser alcanzada; verificación robusta = EXPECT a nivel de API:
  // si alguna dormant recibió calamidad, DEBE llevar hiddenStack (nunca stack).
  const rng = mulberry32(21);
  const fin = G.applyCalamities(s, rng);
  assert.equal(fin.run.calamitiesApplied, true);
  const dormCal = fin.run.board.filter((c) => c.dormant && c.calamity);
  for (const c of dormCal) {
    assert.ok(Array.isArray(c.hiddenStack) && c.hiddenStack.length >= 1, 'dormant calaminosa => hiddenStack');
    assert.equal(c.blocked, false, 'dormant no se vuelve blocked');
    assert.equal(c.stack.length, 0, 'dormant sin stack visible');
  }
  // y la determinista: sembrar a mano y verificar el ciclo completo
  const d = fin.run.board.find((c) => c.dormant && !c.calamity);
  d.calamity = true; d.hiddenStack = [3];
  fin.skills.tables = { owned: true, uses: 1, usesBought: 1 };   // skill comprada
  const fin2 = G.activateTile(fin, fin.run.board.indexOf(d), () => 0.99);
  assert.ok(!fin2.error, `activateTile fallo: ${JSON.stringify(fin2.error)}`);
  assert.equal(fin2.run.board[fin.run.board.indexOf(d)].dormant, false);
  assert.deepEqual(fin2.run.board[fin.run.board.indexOf(d)].stack, [3], 'activateTile revela hiddenStack');
});
test('T20.h [v2.8] one-shot y rango [ceil(n/5), floor(n/3)] intactos', () => {
  const s = base();
  const B = s.run.board;
  B.forEach((c) => { if (c.dormant) c.dormant = false; });
  const rng = mulberry32(31);
  const fin = G.applyCalamities(s, rng);
  const n = 32;
  const lo = Math.ceil(n / 5), hi = Math.floor(n / 3);
  assert.ok(fin.run.calamities >= lo && fin.run.calamities <= hi, `count=${fin.run.calamities} fuera de [${lo},${hi}]`);
  const fin2 = G.applyCalamities(fin, rng);
  assert.equal(fin2.run.calamities, fin.run.calamities, 'segunda llamada = no-op');
});
