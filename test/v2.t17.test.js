// ============================================================================
// Cozy Cat Café × HexaSort — TDD suite v2.1 (node:test, no deps).
// Block T17 — COLA DE CLIENTES v2.1 — [R16.1..R16.5, R17.1..R17.3].
// Patrón de v2.t14.test.js: import dinámico en before(), need(), mulberry32,
// unwind(). TDD ROJO: ../js/game.js aún NO implementa la cola de clientes;
// cada test falla con mensaje `RED:` claro.
//
// v2.1 NOTA roster (corrección de Julian): rosterMax = colorsOwned < 10
// ? colorsOwned + 1 : 10. Con colorsOwned=4 el roster ARRANCA en 5 (tope) y
// NO avanza; avanzar exige comprar colores (presión de compra R13.5).
// Run: node --test test/v2.t17.test.js
// ============================================================================
import { test } from 'node:test';
import assert from 'node:assert/strict';

let G; // módulo ../js/game.js (cargado en before())
test.before(async () => { G = await import('../js/game.js'); });

// RED gate: assert que un export existe, si no falla con mensaje claro
const need = n => assert.ok(typeof G[n] === 'function', `RED: export ${n} no implementado`);
const needCfg = k => assert.ok(G.CONFIG && G.CONFIG[k] !== undefined, `RED: CONFIG.${k} no definido`);

// rng determinista (misma implementación mulberry32 que rules.test.js)
const mulberry32 = s => () => { s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
const rng = n => mulberry32(n);
const unwind = (ret, s) => (ret && ret.state) ? ret.state : (ret || s);

const mkGame = (seed = 1, coins = 1e9) => {
  const s = G.createGame({ progress: { coins } });
  if (typeof G.openRun === 'function') return unwind(G.openRun(s, rng(seed)), s);
  return s;
};

// ---------------------------------------------------------------------------
// T17a — Arranque v2.1 [R16.1-R16.3]: rosterIndex===5, 3 visibles, clientsDrawn
// 3, TOTAL efectivo 20 (capacidad level 0), pool solo colorsOwned (presión).
// ---------------------------------------------------------------------------
test('T17a [R16.1-R16.3] openRun: rosterIndex 5, activeClients 3, clientsDrawn 3, TOTAL 20', () => {
  need('createGame'); need('openRun'); need('totalClients'); need('runVictory');
  needCfg('MIN_CLIENTS'); needCfg('MAX_CLIENTS');
  assert.equal(G.CONFIG.MIN_CLIENTS, 20, 'RED: CONFIG.MIN_CLIENTS===20 [R16.1]');
  assert.equal(G.CONFIG.MAX_CLIENTS, 100, 'RED: CONFIG.MAX_CLIENTS===100 [R16.1]');
  const s = mkGame(1);
  const run = s.run;
  assert.ok(run, 'RED: openRun debe dejar state.run');
  assert.equal(run.rosterIndex, 5,
    `RED: arranque v2.1 rosterIndex===5 (NO 1) [R13.3 v2.1], hay ${JSON.stringify(run.rosterIndex)}`);
  assert.ok(Array.isArray(run.activeClients), 'RED: run.activeClients debe existir [R16.4]');
  assert.equal(run.activeClients.length, 3, 'RED: VISIBLES=3 — activeClients.length===3 [R16.4]');
  assert.equal(run.clientsDrawn, 3, 'RED: llegada perezosa — clientsDrawn===3 al abrir [R16.3]');
  assert.equal(run.clientsServed, 0, 'RED: clientsServed nace en 0 [R16.3]');
  assert.deepEqual(run.queueBack, [], 'RED: queueBack nace vacía [R17.1]');
  // TOTAL efectivo = 20 con capacidad level 0 [R16.1]
  assert.equal(G.totalClients(s), 20, 'RED: TOTAL = MIN_CLIENTS(20) + capacidad.level(0)');
  // shape de cliente flotante: {id, color, qty 2-4, served:false} SIN celda
  for (const c of run.activeClients) {
    assert.ok(c && typeof c.id === 'string' && c.color >= 1
      && c.qty >= 2 && c.qty <= 4 && c.served === false,
      `RED: cliente flotante {id,color,qty 2-4,served:false}, hay ${JSON.stringify(c)} [R16.2]`);
    assert.equal(c.cell, undefined, 'RED: clientes flotantes SIN celda [R16.2]');
  }
  // presión de compra [R13.5]: pool genera SOLO colorsOwned (4) < roster (5)
  const poolColors = new Set((run.pool || []).flat());
  assert.ok(poolColors.size > 0, 'RED: run.pool debe tener fichas al abrir');
  for (const c of poolColors) {
    assert.ok(c >= 1 && c <= s.progress.colorsOwned,
      `RED: pool solo genera colorsOwned=${s.progress.colorsOwned} (presión: pool < roster), vio color ${c}`);
  }
});

// ---------------------------------------------------------------------------
// T17b — [R16.4] solo los 3 VISIBLES se sirven: resolveCascade ignora pedidos
// no visibles aunque tengan tope válido.
// ---------------------------------------------------------------------------
test('T17b [R16.4] resolveCascade auto-serve SOLO itera activeClients (ignora no visibles)', () => {
  need('createGame'); need('openRun'); need('resolveCascade');
  const s = mkGame(2);
  // pedido NO visible (está en orders pero NO en activeClients) con tope válido
  s.run.orders.push({ id: 'hidden-x', color: 2, qty: 3, served: false });
  s.run.board[0].stack = [2, 2, 2];                 // tope válido para hidden-x
  // neutralizar los visibles: color imposible → nada más puede auto-servirse
  for (const c of s.run.activeClients) { c.color = 98; c.qty = 2; }
  const res = G.resolveCascade(s);
  const st = res.state;
  const hidden = st.run.orders.find(o => o.id === 'hidden-x');
  assert.ok(hidden && hidden.served === false,
    'RED: resolveCascade debe IGNORAR pedidos NO visibles (solo activeClients) [R16.4]');
  assert.equal(st.run.clientsServed, 0, 'RED: nada servido → clientsServed se mantiene 0');
});

// ---------------------------------------------------------------------------
// T17c — [R16.4] servir 1 visible → entra el siguiente: clientsDrawn 3→4,
// activeClients se refilla a 3, clientsServed 1.
// ---------------------------------------------------------------------------
test('T17c [R16.4] servir 1 visible → clientsDrawn 3→4, activeClients se refilla', () => {
  need('createGame'); need('openRun'); need('serveOrder');
  const s = mkGame(2);
  const vis = s.run.activeClients[0];
  const oldIds = s.run.activeClients.map(c => c.id);
  const coins0 = s.progress.coins;
  const cellIdx = s.run.board.findIndex(c => !c.blocked && !c.dormant);
  s.run.board[cellIdx].stack = Array.from({ length: vis.qty }, () => vis.color);
  const ret = G.serveOrder(s, vis.id, cellIdx);
  assert.ok(!ret.error, `RED: servir un visible debe funcionar, dio ${JSON.stringify(ret)}`);
  const st = ret;
  assert.equal(st.run.clientsDrawn, 4, 'RED: al servir un visible entra el siguiente (clientsDrawn 3→4) [R16.4]');
  assert.equal(st.run.clientsServed, 1, 'RED: clientsServed debe contar 1 [R16.3]');
  assert.equal(st.run.activeClients.length, 3, 'RED: activeClients se refilla a 3 [R16.4]');
  assert.ok(!st.run.activeClients.some(c => c.id === vis.id), 'RED: el servido sale de visibles');
  assert.ok(st.run.activeClients.some(c => !oldIds.includes(c.id)), 'RED: entra un cliente nuevo de la cola');
  assert.equal(st.run.orders.find(o => o.id === vis.id).served, true, 'RED: pedido served=true');
  assert.equal(st.progress.coins, coins0 + Math.round(5 * vis.qty ** 1.25), 'RED: paga pay(order) [R5.1]');
  // el cliente NO visible no se sirve manualmente [R16.4]
  const s2 = mkGame(3);
  s2.run.orders.push({ id: 'hidden-y', color: 2, qty: 3, served: false });
  const r2 = G.serveOrder(s2, 'hidden-y', 0);
  assert.ok(r2 && r2.error === 'notVisible',
    `RED: serveOrder de un NO visible debe dar {error:"notVisible"}, dio ${JSON.stringify(r2)} [R16.4]`);
});

// ---------------------------------------------------------------------------
// T17d — [R17.3] capacidad: modelo levels; TOTAL = 20 + level (tope 100);
// precio CAP_PRICE_BASE * CAP_RATIO^level creciente; level 80 → {error:'max'}.
// ---------------------------------------------------------------------------
test('T17d [R17.3] buySkill(capacidad): TOTAL 21, precio exponencial creciente, level 80 → {error:"max"}', () => {
  need('buySkill'); need('totalClients');
  needCfg('CAP_PRICE_BASE'); needCfg('CAP_RATIO');
  assert.equal(G.CONFIG.CAP_PRICE_BASE, 120, 'RED: CONFIG.CAP_PRICE_BASE===120 [R17.3]');
  assert.equal(G.CONFIG.CAP_RATIO, 1.35, 'RED: CONFIG.CAP_RATIO===1.35 [R17.3]');
  const s = G.createGame({ progress: { coins: 1e13 } });
  assert.equal(G.totalClients(s), 20, 'RED: TOTAL efectivo = 20 con capacidad level 0 [R16.1]');
  // 1a compra: precio CAP_PRICE_BASE * CAP_RATIO^0 = 120; TOTAL 21
  const st1 = unwind(G.buySkill(s, 'capacidad'), s);
  assert.ok(st1.skills.capacidad && st1.skills.capacidad.owned === true,
    `RED: buySkill('capacidad') debe dejar owned=true, dio ${JSON.stringify(st1.skills && st1.skills.capacidad)}`);
  assert.equal(st1.skills.capacidad.level, 1, 'RED: 1a compra → level 1 [R17.3]');
  assert.equal(st1.progress.coins, 1e13 - 120, 'RED: precio level0 = CAP_PRICE_BASE * CAP_RATIO^0 = 120');
  assert.equal(G.totalClients(st1), 21, 'RED: TOTAL efectivo = 20 + level [R16.1/R17.3]');
  // precios crecientes (exponencial por level)
  let cur = st1;
  const prices = [];
  for (let i = 0; i < 3; i++) {
    const lvl = cur.skills.capacidad.level;
    const before = cur.progress.coins;
    cur = unwind(G.buySkill(cur, 'capacidad'), cur);
    const delta = before - cur.progress.coins;
    const expected = G.CONFIG.CAP_PRICE_BASE * G.CONFIG.CAP_RATIO ** lvl;
    // v2.1-clients: tolerancia 1e-2 — convención "sin redondeo" (igual que
    // permTilePrice): con coins grandes el delta float difiere ~1e-4 del precio
    // exponencial (error de punto flotante, no de fórmula).
    assert.ok(Math.abs(delta - expected) < 1e-2,
      `RED: precio compra ${i + 2} = CAP_PRICE_BASE*CAP_RATIO^${lvl}=${expected}, pagó ${delta} [R17.3]`);
  }
  assert.ok(cur.skills.capacidad.level === 4, 'RED: 4 compras → level 4');
  // level 80 (tope) → {error:'max'}; TOTAL efectivo tope = MAX_CLIENTS = 100
  const sMax = mkGame(1, 1e15);
  sMax.skills.capacidad = { owned: true, level: 80 };
  assert.equal(G.totalClients(sMax), 100, 'RED: TOTAL efectivo tope = MAX_CLIENTS=100 [R16.1]');
  const rMax = G.buySkill(sMax, 'capacidad');
  assert.ok(rMax && rMax.error === 'max',
    `RED: capacidad en level 80 → {error:'max'}, dio ${JSON.stringify(rMax)} [R17.3]`);
});

// ---------------------------------------------------------------------------
// T17e — [R17.1] queueSkip: los 3 visibles van al FONDO de la cola (FIFO en
// run.queueBack, se consume ANTES de dibujar nuevos) y entran 3 nuevos;
// uses-1; {error} si uses===0 o !owned.
// ---------------------------------------------------------------------------
test('T17e [R17.1] queueSkip: 3 visibles al fondo de la cola, entran 3 nuevos; re-entran FIFO', () => {
  need('useQueueSkip'); need('buySkill'); need('serveOrder');
  needCfg('USES_PER_RUN');
  assert.equal(G.CONFIG.USES_PER_RUN.queueSkip, 2, 'RED: USES_PER_RUN.queueSkip===2 [R17.1]');
  // {error} si !owned
  const sNo = mkGame(3);
  const r0 = G.useQueueSkip(sNo);
  assert.ok(r0 && r0.error, `RED: queueSkip sin owned → {error}, dio ${JSON.stringify(r0)}`);
  // comprar (unlock cafeLevel 1) → uses = USES_PER_RUN.queueSkip
  let s = G.createGame({ progress: { coins: 1e9 } });
  s = unwind(G.buySkill(s, 'queueSkip'), s);
  assert.equal(s.skills.queueSkip.owned, true, 'RED: buySkill(queueSkip) → owned=true');
  s = unwind(G.openRun(s, rng(3)), s);
  assert.equal(s.skills.queueSkip.uses, G.CONFIG.USES_PER_RUN.queueSkip,
    'RED: openRun repone uses de queueSkip [R7.4/R17.1]');
  const oldIds = s.run.activeClients.map(c => c.id);
  const st = unwind(G.useQueueSkip(s), s);
  assert.equal(st.skills.queueSkip.uses, G.CONFIG.USES_PER_RUN.queueSkip - 1,
    'RED: usar queueSkip decrementa uses en 1 [R17.1]');
  assert.equal(st.run.activeClients.length, 3, 'RED: siguen 3 visibles tras queueSkip');
  const newIds = st.run.activeClients.map(c => c.id);
  assert.equal(newIds.filter(id => oldIds.includes(id)).length, 0,
    'RED: los 3 visibles deben CAMBIAR (los viejos van al fondo)');
  assert.deepEqual(st.run.queueBack.map(c => c.id), oldIds,
    'RED: los viejos van a queueBack en orden FIFO [R17.1]');
  assert.equal(st.run.clientsDrawn, 6, 'RED: entran 3 nuevos dibujados (clientsDrawn 3→6)');
  // al servir, la refill consume queueBack ANTES de dibujar nuevos: re-entra un viejo
  const vis = st.run.activeClients[0];
  const ci = st.run.board.findIndex(c => !c.blocked && !c.dormant);
  st.run.board[ci].stack = Array.from({ length: vis.qty }, () => vis.color);
  const st2 = unwind(G.serveOrder(st, vis.id, ci), st);
  assert.ok(st2.run.activeClients.some(c => oldIds.includes(c.id)),
    'RED: los devueltos por queueSkip re-entran (FIFO) al servir [R17.1]');
  assert.equal(st2.run.clientsDrawn, 6,
    'RED: queueBack se consume ANTES de dibujar nuevos (clientsDrawn no cambia)');
  // uses===0 → {error}
  const sZero = unwind(G.buySkill(mkGame(4, 1e9), 'queueSkip'), mkGame(3));
  sZero.skills.queueSkip.uses = 0;
  const rNo = G.useQueueSkip(sZero);
  assert.ok(rNo && rNo.error, `RED: queueSkip con uses===0 → {error}, dio ${JSON.stringify(rNo)}`);
});

// ---------------------------------------------------------------------------
// T17f — [R17.2] buyUsesUp: +1 uso por partida en skills modelo 'uses';
// precio USES_UP_BASE * USES_UP_RATIO^compras (exponencial, sin tope);
// openRun repone uses = USES_PER_RUN + usesBought.
// ---------------------------------------------------------------------------
test('T17f [R17.2] buyUsesUp: usesBought+1, openRun uses=USES_PER_RUN+usesBought, precio exponencial', () => {
  need('buyUsesUp'); need('buySkill'); need('openRun');
  needCfg('USES_UP_BASE'); needCfg('USES_UP_RATIO');
  assert.equal(G.CONFIG.USES_UP_BASE, 60, 'RED: CONFIG.USES_UP_BASE===60 [R17.2]');
  assert.equal(G.CONFIG.USES_UP_RATIO, 1.6, 'RED: CONFIG.USES_UP_RATIO===1.6 [R17.2]');
  let s = G.createGame({ progress: { coins: 1e9 } });
  s.progress.cafeLevel = 6;                        // unlock destroyPile (5)
  s = unwind(G.buySkill(s, 'destroyPile'), s);
  assert.equal(s.skills.destroyPile.usesBought, 0, 'RED: usesBought nace 0 [R17.2]');
  const c0 = s.progress.coins;
  const st = unwind(G.buyUsesUp(s, 'destroyPile'), s);
  assert.equal(st.skills.destroyPile.usesBought, 1, 'RED: buyUsesUp → usesBought+1 [R17.2]');
  assert.equal(st.progress.coins, c0 - G.CONFIG.USES_UP_BASE, 'RED: 1a mejora cuesta USES_UP_BASE=60');
  const c1 = st.progress.coins;
  const st2 = unwind(G.buyUsesUp(st, 'destroyPile'), st);
  assert.equal(st2.skills.destroyPile.usesBought, 2, 'RED: 2a mejora → usesBought 2');
  // v2.1-clients: tolerancia 1e-2 — convención "sin redondeo" (igual que
  // permTilePrice): delta float vs precio exponencial difiere ~1e-4 con coins grandes.
  assert.ok(Math.abs((c1 - st2.progress.coins) - G.CONFIG.USES_UP_BASE * G.CONFIG.USES_UP_RATIO) < 1e-2,
    'RED: precio exponencial creciente: 60*1.6=96 en la 2a compra [R17.2]');
  // tras openRun: uses = USES_PER_RUN + usesBought
  const st3 = unwind(G.openRun(st2, rng(5)), st2);
  assert.equal(st3.skills.destroyPile.uses, G.CONFIG.USES_PER_RUN.destroyPile + 2,
    'RED: openRun repone uses = USES_PER_RUN + usesBought [R17.2]');
  // guards: sin owned → {error}; skill sin modelo uses → {error}
  const s4 = mkGame(4);
  assert.ok(G.buyUsesUp(s4, 'swapPiles').error, 'RED: buyUsesUp sin owned → {error}');
  assert.ok(G.buyUsesUp(st3, 'previewPool').error,
    'RED: buyUsesUp solo aplica a skills modelo uses (previewPool es levels) [R17.2]');
});

// ---------------------------------------------------------------------------
// T17g — [R16.4] victoria: clientsServed === TOTAL_CLIENTS; refill inmediato
// mantiene 3 visibles mientras quede cola → no hay victoria momentánea.
// ---------------------------------------------------------------------------
test('T17g [R16.4] victoria: clientsServed===TOTAL → closeRun(allServed); refill inmediato', () => {
  need('runVictory'); need('totalClients'); need('serveOrder'); need('closeRun');
  let s = mkGame(4);
  const TOTAL = G.totalClients(s);
  assert.equal(TOTAL, 20, 'RED: TOTAL efectivo = 20 con capacidad level 0 [R16.1]');
  assert.equal(G.runVictory(s), false, 'RED: run recién abierta NO es victoria');
  let served = 0;
  while (s.run && s.run.clientsServed < TOTAL) {
    const vis = s.run.activeClients[0];
    assert.ok(vis, 'RED: refill inmediato — mientras quede cola hay visible que servir');
    const ci = s.run.board.findIndex(c => !c.blocked && !c.dormant);
    s.run.board[ci].stack = Array.from({ length: vis.qty }, () => vis.color);
    const ret = G.serveOrder(s, vis.id, ci);
    assert.ok(!ret.error, `RED: serveOrder visible debe funcionar, dio ${JSON.stringify(ret)}`);
    s = ret;
    served++;
    assert.ok(served <= TOTAL, 'RED: el bucle debe terminar en TOTAL servicios');
    if (s.run.clientsServed < TOTAL) {
      // v2.1-clients: refill inmediato — visibles = min(3, restantes de cola).
      // Al final de la cola (clientsDrawn===TOTAL) los visibles se agotan de a
      // 1: 3 → 2 → 1 → 0 (la cola perezosa no sobre-dibuja más allá de TOTAL).
      assert.equal(s.run.activeClients.length, Math.min(3, TOTAL - s.run.clientsServed),
        'RED: refill inmediato — visibles = min(3, cola restante) [R16.4]');
      assert.equal(G.runVictory(s), false,
        'RED: con cola pendiente NO hay victoria aunque se acabe de servir [R16.4]');
    }
  }
  assert.equal(s.run.clientsServed, TOTAL, 'RED: clientsServed === TOTAL_CLIENTS');
  assert.equal(s.run.clientsDrawn, TOTAL, 'RED: la cola se agotó exactamente (clientsDrawn===TOTAL)');
  assert.equal(s.run.activeClients.length, 0, 'RED: sin cola pendiente, los visibles se agotan');
  assert.equal(G.runVictory(s), true, 'RED: runVictory(state)===true al servir TOTAL [R16.4]');
  const closed = G.closeRun(s, 'allServed');
  assert.equal(closed.metaClose.reason, 'allServed');
  assert.equal(closed.metaClose.victory, true, 'RED: victoria al cierre allServed');
  assert.equal(closed.metaClose.served, TOTAL, 'RED: metaClose.served === clientsServed [R16.4]');
  assert.equal(closed.metaClose.total, TOTAL, 'RED: metaClose.total === TOTAL efectivo');
});

// ---------------------------------------------------------------------------
// T17h — [R16.2 v2.1-corregido] tope de roster = colorsOwned<10 ? colorsOwned+1
// : 10. Con colorsOwned=4 el roster ARRANCA en 5 (= tope) y NO avanza; tras
// comprar colores (owned 6 → tope 7) avanza cada 3 pilas y se estanca en 7.
// ---------------------------------------------------------------------------
test('T17h [R16.2] roster: arranca 5, tope colorsOwned+1 (10 si owned=10); avanza cada 3 pilas', () => {
  need('createGame'); need('openRun'); need('placeStack'); need('buyColor');
  needCfg('UNLOCK_PLACED_PILES'); needCfg('MAX_COLORS');
  // GIVEN colorsOwned=4 → rosterMax = 5 = arranque: colocar pilas NO avanza
  let s = mkGame(1);
  assert.equal(s.run.rosterIndex, 5, 'RED: arranque v2.1 rosterIndex===5 [R13.3 v2.1]');
  const place = (st, n, seed) => {
    let cur = st;
    for (let i = 0; i < n; i++) {
      // v2.2 R3.5: placeStack SOLO en celdas VACÍAS — 1ª jugable vacía; si no
      // hay (todas ocupadas), vaciar (simula servicio) y seguir.
      let cell = cur.run.board.findIndex(c => !c.blocked && !c.dormant && !(c.stack && c.stack.length));
      if (cell < 0) {
        cur.run.board.forEach(c => { if (!c.blocked && !c.dormant) c.stack = []; });
        cell = cur.run.board.findIndex(c => !c.blocked && !c.dormant && !(c.stack && c.stack.length));
      }
      const ret = G.placeStack(cur, cell, undefined, mulberry32(seed * 100 + i));
      assert.ok(!ret.error, `RED: placeStack debe colocar (paso ${i}): ${JSON.stringify(ret.error)}`);
      cur = unwind(ret, cur);
    }
    return cur;
  };
  const s1 = place(s, 9, 31);                     // 9 pilas: sin techo nuevo no avanza
  assert.equal(s1.run.rosterIndex, 5,
    'RED: con colorsOwned=4 el tope es 5 (colorsOwned+1) — el roster NO avanza [R16.2 corregido]');
  // comprar 2 colores: colorsOwned 6 → rosterMax 7 → el roster SÍ avanza
  let s2 = unwind(G.buyColor(s1), s1);
  s2 = unwind(G.buyColor(s2), s2);
  assert.equal(s2.progress.colorsOwned, 6, 'RED: precondition colorsOwned=6');
  assert.equal(s2.run.rosterIndex, 5, 'RED: comprar colores no sube el roster en caliente');
  s2 = place(s2, 3, 41);                          // 3 pilas → rosterIndex 6
  assert.equal(s2.run.rosterIndex, 6, 'RED: tras comprar y 3 pilas, roster 5→6 [R16.2]');
  s2 = place(s2, 3, 42);
  assert.equal(s2.run.rosterIndex, 7, 'RED: otras 3 pilas → rosterIndex 7 (tope colorsOwned+1)');
  s2 = place(s2, 3, 42);
  assert.equal(s2.run.rosterIndex, 7, 'RED: el roster se ESTANCA en rosterMax=colorsOwned+1=7 [R16.2]');
  // frontera: colorsOwned=10 → tope 10 (no 11)
  const s10 = G.createGame({ progress: { coins: 1e9, colorsOwned: 10 } });
  const s10r = unwind(G.openRun(s10, rng(9)), s10);
  const s10b = place(s10r, 3 * 6, 43);            // 18 pilas: sobra para llegar al tope
  assert.equal(s10b.run.rosterIndex, 10,
    'RED: con colorsOwned=10 el tope de roster es 10 (NO 11) [R16.2 corregido]');
});
