import { test } from 'node:test';
import assert from 'node:assert/strict';

let G;
test.before(async () => { G = await import('../js/game.js'); });

const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);

const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mkGame = () => G.createGame({
  progress: { coins: 1e9, totalGames: 50, cafeLevel: 51 },
});

test('T15a [v2.22.2] serveManual is not in the catalog and cannot be bought', () => {
  need('buySkill');
  const s = mkGame();
  assert.equal(s.skills.serveManual, undefined);
  assert.equal(G.toggleServe, undefined);
  const ret = G.buySkill(s, 'serveManual');
  assert.equal(ret && ret.error, 'noSkill');
  assert.equal(s.skills.serveManual, undefined);
});

test('T15c [R15.1] buySkill(previewPool): level 1 -> recompra 2 -> en level 3 {error:"max"}', () => {
  need('buySkill');
  const s = mkGame();
  const r1 = unwind(G.buySkill(s, 'previewPool'), s);
  assert.ok(r1.skills && r1.skills.previewPool,
    `RED: buySkill('previewPool') debe crear skills.previewPool, retornó ${JSON.stringify(r1)}`);
  assert.equal(r1.skills.previewPool.owned, true,
    `RED: previewPool comprado debe quedar owned=true [R15.1]`);
  assert.equal(r1.skills.previewPool.level, 1,
    `RED: 1a compra de previewPool debe dejar level=1 (ret=${JSON.stringify(r1)}) [R15.1]`);
  const r2 = unwind(G.buySkill(r1, 'previewPool'), r1);
  assert.ok(r2 && r2.skills && r2.skills.previewPool,
    `RED: recompra de previewPool debe retornar state (ret=${JSON.stringify(r2)})`);
  assert.equal(r2.skills.previewPool.level, 2,
    'RED: recompra de previewPool debe subir level a 2 [R15.1]');
  const r3 = unwind(G.buySkill(r2, 'previewPool'), r2);
  assert.equal(r3.skills.previewPool.level, 3, 'RED: 3a compra debe dejar level=3 [R15.1]');
  const r4 = unwind(G.buySkill(r3, 'previewPool'), r3);
  assert.equal(r4.skills.previewPool.level, 4, 'v2.22.4: previewPool no tiene tope en 3');
  assert.equal(r4.error, undefined);
});

test('T15d [R15.1] previewPool: level 0 -> null/[]; level N -> N tandas; puro (semilla + no-mutación)', () => {
  need('previewPool');
  need('buySkill');
  const s0 = mkGame();
  const p0 = G.previewPool(s0, rng(7));
  assert.ok(p0 === null || (Array.isArray(p0) && p0.length === 0),
    `RED: previewPool con level 0 debe retornar null/[], retornó ${JSON.stringify(p0)} [R15.1]`);
  for (const N of [1, 2, 3]) {
    let s = mkGame();
    for (let i = 0; i < N; i++) s = unwind(G.buySkill(s, 'previewPool'), s);
    const before = structuredClone(s);
    const a = G.previewPool(s, rng(42));
    const b = G.previewPool(structuredClone(before), rng(42));
    assert.ok(Array.isArray(a) && a.length === N,
      `RED: previewPool con level ${N} debe retornar ${N} tandas, retornó ${JSON.stringify(a)} [R15.1]`);
    assert.deepEqual(b, a,
      `RED: previewPool debe ser puro — misma semilla debe dar el mismo resultado [R15.1]`);
    assert.deepEqual(s, before,
      'RED: previewPool debe ser puro — NO debe mutar el state de entrada [R15.1]');
  }
});

test('T15e [R7.4 v2.3] destroyPile modelo uses: compra=1 uso; previewPool (levels) sin uses', () => {
  need('buySkill');
  need('useDestroyPile');
  const s = mkGame();
  const st = unwind(G.buySkill(s, 'destroyPile'), s);
  assert.ok(st.skills && st.skills.destroyPile && st.skills.destroyPile.owned === true,
    `RED: buySkill('destroyPile') debe dejar owned=true (ret=${JSON.stringify(st)}) [R7.4]`);
  assert.equal(st.skills.destroyPile.uses, 1,
    'RED: v2.3 la compra ES el 1er uso (uses=1) [R7.2 v2.3]');
  let s2 = st;
  if (typeof G.openRun === 'function') s2 = unwind(G.openRun(st, rng(1)), st);
  const board = s2.run && s2.run.board;
  assert.ok(Array.isArray(board) && board.length > 0,
    'RED: precondition — debe existir run.board con celdas para usar destroyPile');
  const cell = board.find(c => !c.blocked) || board[0];
  let st3 = G.useDestroyPile(s2, cell.id);
  if (st3 && st3.error === 'noCell') st3 = G.useDestroyPile(s2, board.indexOf(cell));
  assert.ok(st3 && st3.skills,
    `RED: useDestroyPile debe retornar state (ret=${JSON.stringify(st3)}) [R7.4]`);
  assert.ok(!st3.error, `RED: destroy desde el inicio de la run, dio ${JSON.stringify(st3 && st3.error)}`);
  assert.equal(st3.run.skillUses.destroyPile, 1, 'RED: el uso pagado queda en run.skillUses');
  const st5 = unwind(G.buySkill(st3, 'previewPool'), st3);
  assert.ok(st5.skills && st5.skills.previewPool && st5.skills.previewPool.owned === true,
    'RED: precondition — buySkill(previewPool) debe dejar owned=true [R15.1]');
  assert.equal(Object.hasOwn(st5.skills.previewPool, 'uses'), false,
    'RED: previewPool (levels) nunca debe tener campo uses [R15.1,R7.4]');
});
