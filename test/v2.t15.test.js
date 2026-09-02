// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2 (node:test, no deps).
// Block T15 (skills v2: toggle / levels / uses) — [R15.1, R7.4 v2].
// TDD ROJO: ../js/game.js aún NO implementa el modelo v2 de skills; cada test
// falla con mensaje `RED:` claro. Dynamic import en before() para que el
// archivo cargue aunque falten exports. NO se modifica js/game.js.
// Run: node --test test/v2.t15.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G; // módulo ../js/game.js (cargado en before())
test.before(async () => { G = await import('../js/game.js'); });

// RED gate: assert que un export existe, si no falla con mensaje claro
const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
// RED gate para constantes de balance CONFIG (R7.4 v2)
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

// rng determinista (misma implementación mulberry32 que rules.test.js)
const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);

// Convención v2: las funciones mutan state y retornan state, o retornan
// {state}/{error} — unwind() cubre ambos estilos (igual que v2.t14).
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

// mkGame: estado con coins de sobra y progreso alto.
// R7.4 v2: si una skill requiere cafeLevel, ya lo dejamos alto ANTES de
// comprar (totalGames=50 -> cafeLevel desbloqueado) para no mezclar el gate
// de nivel con el modelo de compra que se testea aquí.
const mkGame = () => G.createGame({
  progress: { coins: 1e9, totalGames: 50, cafeLevel: 51 },
});

// ---------------------------------------------------------------------------
// T15a — serveManual: modelo toggle (owned + autoServe, SIN uses) [R15.1]
// ---------------------------------------------------------------------------
test('T15a [R15.1] buySkill(serveManual): owned=true, SIN campo uses, autoServe=true (toggle)', () => {
  need('buySkill');
  const s = mkGame();
  const ret = G.buySkill(s, 'serveManual');
  const st = unwind(ret, s);
  assert.ok(st.skills && st.skills.serveManual,
    `RED: buySkill('serveManual') debe crear skills.serveManual, retornó ${JSON.stringify(ret)}`);
  assert.equal(st.skills.serveManual.owned, true,
    `RED: serveManual comprado debe quedar owned=true (ret=${JSON.stringify(ret)}) [R15.1]`);
  assert.equal(Object.hasOwn(st.skills.serveManual, 'uses'), false,
    'RED: serveManual es modelo toggle — NO debe tener campo uses [R15.1]');
  assert.equal(st.skills.serveManual.autoServe, true,
    'RED: serveManual comprado debe iniciar autoServe=true [R15.1]');
});

// ---------------------------------------------------------------------------
// T15b — toggleServe: invierte autoServe; sin owned -> {error} [R15.1]
// ---------------------------------------------------------------------------
test('T15b [R15.1] toggleServe invierte autoServe; sin owned -> {error}', () => {
  need('toggleServe');
  // con owned: alterna autoServe true <-> false
  const s = mkGame();
  const st = unwind(G.buySkill(s, 'serveManual'), s);
  assert.ok(st.skills && st.skills.serveManual && st.skills.serveManual.owned === true,
    'RED: precondition — buySkill(serveManual) debe dejar owned=true [R15.1]');
  const a0 = st.skills.serveManual.autoServe;
  const st2 = unwind(G.toggleServe(st), st);
  assert.ok(st2.skills && st2.skills.serveManual,
    'RED: toggleServe debe retornar state con skills.serveManual');
  assert.equal(st2.skills.serveManual.autoServe, !a0,
    `RED: toggleServe debe invertir autoServe (${a0} -> ${!a0}) [R15.1]`);
  // sin owned: {error}
  const s2 = mkGame(); // nunca comprada
  const ret2 = G.toggleServe(s2);
  assert.ok(ret2 && typeof ret2 === 'object' && ret2.error,
    `RED: toggleServe sin owned debe retornar {error}, retornó ${JSON.stringify(ret2)} [R15.1]`);
});

// ---------------------------------------------------------------------------
// T15c — previewPool: modelo levels (level 1..3, {error:'max'}) [R15.1]
// ---------------------------------------------------------------------------
test('T15c [R15.1] buySkill(previewPool): level 1 -> recompra 2 -> en level 3 {error:"max"}', () => {
  need('buySkill');
  const s = mkGame();
  // 1a compra -> owned + level 1
  const r1 = unwind(G.buySkill(s, 'previewPool'), s);
  assert.ok(r1.skills && r1.skills.previewPool,
    `RED: buySkill('previewPool') debe crear skills.previewPool, retornó ${JSON.stringify(r1)}`);
  assert.equal(r1.skills.previewPool.owned, true,
    `RED: previewPool comprado debe quedar owned=true [R15.1]`);
  assert.equal(r1.skills.previewPool.level, 1,
    `RED: 1a compra de previewPool debe dejar level=1 (ret=${JSON.stringify(r1)}) [R15.1]`);
  // recompra -> level 2
  const r2 = unwind(G.buySkill(r1, 'previewPool'), r1);
  assert.ok(r2 && r2.skills && r2.skills.previewPool,
    `RED: recompra de previewPool debe retornar state (ret=${JSON.stringify(r2)})`);
  assert.equal(r2.skills.previewPool.level, 2,
    'RED: recompra de previewPool debe subir level a 2 [R15.1]');
  // 3a compra -> level 3; 4a compra -> {error:'max'}
  const r3 = unwind(G.buySkill(r2, 'previewPool'), r2);
  assert.equal(r3.skills.previewPool.level, 3, 'RED: 3a compra debe dejar level=3 [R15.1]');
  const r4 = G.buySkill(r3, 'previewPool');
  assert.ok(r4 && r4.error === 'max',
    `RED: en level 3, recomprar previewPool debe retornar {error:'max'}, retornó ${JSON.stringify(r4)} [R15.1]`);
});

// ---------------------------------------------------------------------------
// T15d — previewPool(state, rng): nivel 0 -> nada; nivel N -> N tandas;
//        PUREZA: determinista por semilla y NO muta el state [R15.1]
// ---------------------------------------------------------------------------
test('T15d [R15.1] previewPool: level 0 -> null/[]; level N -> N tandas; puro (semilla + no-mutación)', () => {
  need('previewPool');
  need('buySkill');
  // nivel 0 (skill nunca comprada) -> null o array vacío
  const s0 = mkGame();
  const p0 = G.previewPool(s0, rng(7));
  assert.ok(p0 === null || (Array.isArray(p0) && p0.length === 0),
    `RED: previewPool con level 0 debe retornar null/[], retornó ${JSON.stringify(p0)} [R15.1]`);
  // nivel N (1..3) -> exactamente N tandas futuras
  for (const N of [1, 2, 3]) {
    let s = mkGame();
    for (let i = 0; i < N; i++) s = unwind(G.buySkill(s, 'previewPool'), s);
    const before = structuredClone(s);
    const a = G.previewPool(s, rng(42));
    const b = G.previewPool(structuredClone(before), rng(42));
    assert.ok(Array.isArray(a) && a.length === N,
      `RED: previewPool con level ${N} debe retornar ${N} tandas, retornó ${JSON.stringify(a)} [R15.1]`);
    // PUREZA 1: misma semilla -> resultado idéntico
    assert.deepEqual(b, a,
      `RED: previewPool debe ser puro — misma semilla debe dar el mismo resultado [R15.1]`);
    // PUREZA 2: el state de entrada no se muta
    assert.deepEqual(s, before,
      'RED: previewPool debe ser puro — NO debe mutar el state de entrada [R15.1]');
  }
});

// ---------------------------------------------------------------------------
// T15e — destroyPile: modelo uses (R7.4 v2); serveManual/previewPool no
//        tocan uses nunca.
// NOTA R7.4: si la skill requiere cafeLevel, mkGame() ya mutó
// progress.totalGames=50 (cafeLevel alto) ANTES de comprar, para saltar ese
// gate y testear solo el modelo de uses.
// ---------------------------------------------------------------------------
test('T15e [R7.4 v2.3] destroyPile modelo uses: compra=1 uso, decrementa al usar; toggle/levels sin uses', () => {
  need('buySkill');
  need('useDestroyPile');
  const s = mkGame(); // totalGames=50/cafeLevel alto: gate R7.4 ya sorteado
  const st = unwind(G.buySkill(s, 'destroyPile'), s);
  assert.ok(st.skills && st.skills.destroyPile && st.skills.destroyPile.owned === true,
    `RED: buySkill('destroyPile') debe dejar owned=true (ret=${JSON.stringify(st)}) [R7.4]`);
  assert.equal(st.skills.destroyPile.uses, 1,
    'RED: v2.3 la compra ES el 1er uso (uses=1) [R7.2 v2.3]');
  // usar la skill -> uses-1 (sobre una celda válida del board de run)
  let s2 = st;
  if (typeof G.openRun === 'function') s2 = unwind(G.openRun(st, rng(1)), st);
  const board = s2.run && s2.run.board;
  assert.ok(Array.isArray(board) && board.length > 0,
    'RED: precondition — debe existir run.board con celdas para usar destroyPile');
  const cell = board.find(c => !c.blocked) || board[0];
  // FIRMA: la v1 indexa board[cellId] numéricamente; la v2 puede usar cell.id.
  // Se prueba cell.id y, si no resuelve celda, se reintenta con el índice.
  let st3 = G.useDestroyPile(s2, cell.id);
  if (st3 && st3.error === 'noCell') st3 = G.useDestroyPile(s2, board.indexOf(cell));
  assert.ok(st3 && st3.skills,
    `RED: useDestroyPile debe retornar state (ret=${JSON.stringify(st3)}) [R7.4]`);
  assert.equal(st3.skills.destroyPile.uses, 0,
    'RED: usar destroyPile debe decrementar uses en 1 (1→0, v2.3) [R7.4]');
  // serveManual (toggle) y previewPool (levels) NUNCA tienen/tocan uses
  const st4 = unwind(G.buySkill(st3, 'serveManual'), st3);
  assert.ok(st4.skills && st4.skills.serveManual && st4.skills.serveManual.owned === true,
    'RED: precondition — buySkill(serveManual) debe dejar owned=true [R15.1]');
  assert.equal(Object.hasOwn(st4.skills.serveManual, 'uses'), false,
    'RED: serveManual (toggle) nunca debe tener campo uses [R15.1,R7.4]');
  const st5 = unwind(G.buySkill(st4, 'previewPool'), st4);
  assert.ok(st5.skills && st5.skills.previewPool && st5.skills.previewPool.owned === true,
    'RED: precondition — buySkill(previewPool) debe dejar owned=true [R15.1]');
  assert.equal(Object.hasOwn(st5.skills.previewPool, 'uses'), false,
    'RED: previewPool (levels) nunca debe tener campo uses [R15.1,R7.4]');
});
