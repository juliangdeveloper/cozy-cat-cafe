import { createGame, openRun, placeStack, resolveCascade, closeRun, buyColor, buySkill,
         useQueueSkip, useRefreshPool, activateTile, buyUsesUp, topGroup,
         totalClients, runVictory, serializeState, deserializeState, mulberry32, CONFIG, HEX_ADJ } from '../js/game.js';
import assert from 'node:assert/strict';

let state = createGame({ progress: { coins: 20000 } });
const targetByOrder = new Map();

const rng = (n) => mulberry32(n);
const playableIdx = (s) =>
  s.run.board.map((c, i) => ({ c, i }))
    .filter((x) => !x.c.dormant && !x.c.blocked).map((x) => x.i);

const floatOrders = (s) => {
  for (const o of s.run.orders) if (o.cell === undefined) o.cell = null;
  return s;
};

const prunePins = (s) => {
  const live = new Set(s.run.activeClients.filter(o => !o.served).map(o => o.id));
  for (const k of [...targetByOrder.keys()]) if (!live.has(k)) targetByOrder.delete(k);
};

const rosterCap = (owned) => {
  const pal = (state.run && Array.isArray(state.run.palette) && state.run.palette.length)
    || CONFIG.MAX_COLORS;
  return Math.min((owned || 0) + 1, pal);
};

const unwrap = (res) => (res && res.state !== undefined ? res.state : res);
function step(seed, n, growth = false) {
  state = floatOrders(state);
  state = resolveCascade(state).state;
  prunePins(state);
  const owned = state.progress.colorsOwned;
  const vis = state.run.activeClients.filter((o) => !o.served);
  let o = vis.find((x) => x.color <= owned)
       ?? vis.find((x) => x.color > owned);

  if (o && o.color > owned) {
    const res = buyColor(state);
    assert.ok(!res.error, `buyColor debería financiar el color ${o.color} (R13.7)`);
    state = unwrap(res);
    return true;
  }

  const topRunOf = (p) => {
    if (!p || !p.length) return { color: 0, count: 0 };
    const c = p[p.length - 1]; let n = 0;
    for (let i = p.length - 1; i >= 0 && p[i] === c; i--) n++;
    return { color: c, count: n };
  };
  let slot = -1;
  if (o) {
    let best = -1, bestN = -1;
    state.run.pool.forEach((p, i) => {
      const tr = topRunOf(p);
      if (tr.color === o.color && tr.count > bestN) { best = i; bestN = tr.count; }
    });
    slot = best;
  }
  if (slot < 0) {
    const visSet = new Set(state.run.activeClients.filter(x => !x.served).map(x => x.color));
    let best = -1, bestN = -1;
    state.run.pool.forEach((p, i) => {
      const tr = topRunOf(p);
      if (visSet.has(tr.color) && tr.count > bestN) { best = i; bestN = tr.count; }
    });
    slot = best;
  }
  if (slot < 0) slot = state.run.pool.findIndex((p) => p.length > 0);
  if (slot < 0) return false;

  const playable = playableIdx(state);
  const board = state.run.board;
  const visColors = [...new Set(state.run.activeClients.filter(x => !x.served).map(x => x.color))];
  const empty = playable.filter((i) => board[i].stack.length === 0);
  const pinned = new Set(targetByOrder.values());
  const adjTop = (i, color) => {
    const ci = board[i];
    return playable.some((j) => {
      const c = board[j];
      if (!c.stack || !c.stack.length || c.stack[c.stack.length - 1] !== color) return false;
      return HEX_ADJ.some(([dq, dr]) => c.q + dq === ci.q && c.r + dr === ci.r);
    });
  };
  const poolColors = [...new Set(state.run.pool.flat())];
  const t = growth
    ? empty.find((i) => !pinned.has(i))
    : ((o && empty.find((i) => !pinned.has(i) && adjTop(i, o.color)))
    ?? empty.find((i) => !pinned.has(i) && visColors.some((c) => adjTop(i, c)))
    ?? empty.find((i) => !pinned.has(i) && poolColors.some((c) => adjTop(i, c)))
    ?? (o && topRunOf(state.run.pool[slot]).color === o.color ? empty.find((i) => !pinned.has(i)) : undefined));
  if (t === undefined) {
    for (let i = 0; i < state.run.board.length; i++) {
      const c = state.run.board[i];
      if (!c || !c.dormant || c.blocked) continue;
      const ra = activateTile(state, i, rng(seed * 7 + n));
      if (!ra.error) { state = ra; return true; }
      if (ra.error === 'noFunds') break;
    }
    const sk = state.skills.refreshPool;
    if (sk && sk.owned && sk.uses > 0) {
      const rr = useRefreshPool(state, rng(seed * 31 + n));
      if (!rr.error) { state = rr; return true; }
    }
    if (!growth && o && o.color > state.progress.colorsOwned) {
      const rc = buyColor(state);
      if (!rc.error) { state = unwrap(rc); return true; }
    }
    return 'full';
  }
  if (o && state.run.pool[slot][0] === o.color) targetByOrder.set(o.id, t);
  const res = placeStack(state, t, slot, rng(seed + n));
  if (res.error) return false;
  state = resolveCascade(unwrap(res)).state;
  prunePins(state);
  return true;
}

function play(seed) {
  if (!state.skills.refreshPool.owned) {
    const r1 = buySkill(state, 'refreshPool'); if (!r1.error) state = r1;
  }
  if (!state.skills.queueSkip.owned) {
    const r2 = buySkill(state, 'queueSkip'); if (!r2.error) state = r2;
  }
  if (state.progress.totalGames === 0) {
    for (let k = 0; k < 5; k++) { const r = buyUsesUp(state, 'refreshPool'); if (r.error) break; state = r; }
    for (let k = 0; k < 5; k++) { const r = buyUsesUp(state, 'queueSkip'); if (r.error) break; state = r; }
  }
  state = floatOrders(openRun(state, rng(seed)));
  targetByOrder.clear();
  const startRoster = state.run.rosterIndex;
  const startOwned = state.progress.colorsOwned;
  const cap = rosterCap(startOwned);
  const TOTAL = totalClients(state);
  console.log(`\n=== Shift #${state.progress.totalGames + 1} — board ${state.run.board.length} (7 jugables) · colorsOwned ${startOwned} · roster ${startRoster}/${cap} · cola TOTAL ${TOTAL} (drawn ${state.run.clientsDrawn}) ===`);

  assert.equal(state.run.activeClients.length, 3, 'R16.4: 3 visibles al abrir');
  assert.equal(state.run.clientsDrawn, 3, 'R16.3: llegada perezosa — 3 dibujados al abrir');
  assert.equal(state.run.clientsServed, 0, 'R16.3: clientsServed nace 0');
  assert.deepEqual(state.run.queueBack, [], 'R17.1: queueBack nace vacía');
  assert.equal(runVictory(state), false, 'R16.4: run recién abierta NO es victoria');

  let endedFull = false;
  let guard = 0;
  while (state.run.rosterIndex < cap && guard++ < 5000) {
    const gr = step(seed, guard, true);
    if (gr === 'full') { endedFull = true; break; }
    assert.ok(gr, 'fase crecimiento: debe poder colocar/activar/refrescar');
  }
  if (endedFull) {
    state = closeRun(state, 'full');
    assert.equal(state.metaClose.victory, false, 'R2.6: full NO es victoria');
    console.log(`  => fase 1 sin espacio (cierre 'full' legítimo v2.2, roster ${state.run ? state.progress.colorsOwned : startRoster})`);
    return 'full';
  }
  assert.equal(state.run.rosterIndex, cap, 'R13.5: el roster debe llegar a su techo (fórmula rosterMax)');

  let lastServed = -1, stuck = 0, skips = 0;
  guard = 0;
  while (state.run.clientsServed < TOTAL && guard++ < 20000) {
    const sr = step(seed, guard);
    if (sr === 'full') { endedFull = true; break; }
    if (!sr) {
      if (state.skills.queueSkip && state.skills.queueSkip.owned && state.skills.queueSkip.uses > 0) {
        const r = useQueueSkip(state);
        if (!r.error) { state = r; skips++; stuck = 0; continue; }
      }
      console.error('STUCK DUMP:', JSON.stringify({
        served: state.run.clientsServed, drawn: state.run.clientsDrawn,
        emptyPlayable: state.run.board.filter(c => !c.dormant && !c.blocked && !(c.stack && c.stack.length)).length,
        dormantFree: state.run.board.filter(c => c.dormant && !c.blocked).length,
        runTilesActivated: state.run.runTilesActivated,
        refresh: state.skills.refreshPool,
        queue: state.skills.queueSkip,
        queueBack: (state.run.queueBack || []).length,
        pool: state.run.pool.map(p => p.length),
        visibles: state.run.activeClients.map(o => ({ c: o.color, q: o.qty })),
      }));
      assert.fail('fase cierre: step no pudo colocar ni rotar la cola'); }
    if (state.run.clientsServed === lastServed) {
      if (++stuck > 300) {
        if (state.skills.queueSkip && state.skills.queueSkip.owned && state.skills.queueSkip.uses > 0) {
          const r = useQueueSkip(state);
          if (!r.error) { state = r; skips++; stuck = 0; continue; }
        }
        assert.fail('fase cierre: sin progreso en 300 pasos y sin queueSkip');
      }
    } else { stuck = 0; lastServed = state.run.clientsServed; }
  }
  const served = state.run.clientsServed;
  if (endedFull) {
    state = closeRun(state, 'full');
    assert.equal(state.metaClose.reason, 'full');
    assert.equal(state.metaClose.victory, false, 'R2.6: full NO es victoria');
    console.log(`  => served ${served}/${TOTAL} (tablero sin jugadas — cierre 'full' legítimo v2.2)`);
    return served;
  }
  assert.equal(served, TOTAL, 'R16.4: victoria = clientsServed === TOTAL (todos los clientes servidos)');
  assert.equal(state.run.clientsDrawn, TOTAL, 'R16.3: la cola se agota exacta (clientsDrawn===TOTAL)');
  assert.equal(state.run.queueBack.length, 0, 'R17.1: sin devueltos pendientes al cerrar');
  assert.equal(state.run.activeClients.length, 0, 'R16.4: sin cola, los visibles se agotan');
  assert.ok(runVictory(state), 'R16.4: runVictory(state)===true');

  state = closeRun(state, 'allServed');
  assert.equal(state.metaClose.reason, 'allServed');
  assert.equal(state.metaClose.victory, true, 'R2.6: allServed es la única victoria');
  assert.equal(state.metaClose.served, TOTAL, 'R16.4: metaClose.served === clientsServed');
  assert.equal(state.metaClose.total, TOTAL, 'R16.4: metaClose.total === TOTAL efectivo');
  console.log(`  => served ${served}/${TOTAL} · roster ${startRoster}->${cap} · queueSkips ${skips} · coins=${Math.round(state.progress.coins)} ${endedFull ? "(cierre 'full' legítimo)" : '✅ VICTORY'}`);
  return served;
}

let totalServed = 0, victories = 0;
for (let i = 0; i < 8; i++) {
  const s = play(42 + i * 7);
  totalServed += s;
}
console.log(`\nSHIFTS: servidos acumulados ${totalServed} (bot greedy; la victoria garantizada no es`);
console.log(`el criterio con pool multicolor 1..7 — la maquinaria sí se verifica aquí)`);
assert.ok(totalServed >= 30, `v2.0 e2e: la maquinaria debe servir clientes en 8 shifts (acumulado ${totalServed} < 30)`);
console.log(`\nFINAL coins=${Math.round(state.progress.coins)} games=${state.progress.totalGames} level=${state.progress.cafeLevel} colorsOwned=${state.progress.colorsOwned}`);
const json = serializeState(state);
const identical = JSON.stringify(deserializeState(json)) === JSON.stringify(state);
console.log('save roundtrip identical:', identical);
assert.ok(identical, 'R1.2 roundtrip del save debe ser idéntico');
console.log('E2E PLAYTHROUGH OK ✅');
