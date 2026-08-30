// ============================================================================
// Cozy Cat Café × HexaSort — PURE GAME LOGIC (no DOM, no localStorage, no Date).
// Sources of truth: RULES.md (mechanics) + SPEC.md (US-1..43, G1-G7).
// All functions are pure: they take `state` (+ optional injected `rng`) and
// return a NEW state (immutable-ish via clone). Deterministic under a seeded rng.
//
// Logical layer only. Colors are INDEXES (1..6) — the renderer maps them to
// STYLE_GUIDE tiles. Sprites are resolved OUTSIDE via the sprite map.
// ============================================================================

export const CONFIG = {
  BASE_COIN: 5,                     // R5.1
  EXP_BASE: 1.25,                   // R5.2 superlinear exponent
  EXP_STEP: 0.05,                   // R5.2 multLevel exponent growth
  MULT_PRICE_BASE: 100,             // R5.2 cost 100*(multLevel+1)
  MULT_MAX: 6,                      // R5.2 cap
  CALAMITY_BONUS_PER: 15,           // R5.3 / R8.5 bonus per calamity cell
  CALAMITY_MIN_FRAC: 1 / 5,         // R8.2 lo
  CALAMITY_MAX_FRAC: 1 / 3,         // R8.2 hi
  CALAMITY_THRESHOLD: 15,           // R8.1 only if boardCells > 15
  BLOCK_PROB: 0.5,                  // R8.3 ~50% blocked / ~50% prestockated
  USES_PER_RUN: { destroyPile: 3, swapPiles: 3, refreshPool: 2 }, // R7 USES_PER_RUN
  PRODUCTS_PER_COLOR: 3,            // R10.1 [OBSOLETO v2 — reemplazado por R13.7]
  IDLE_RATE: { workers: 0.5, fame: 0.3, machines: 0.8 }, // R9.1
  IDLE_CAP:  { workers: 60,  fame: 100,  machines: 40 },  // R9.3 caps
  IDLE_PRICE: 50,                   // R9.4 price = 50 * level^2
  EXPAND: {
    clients:  { per: 1, price: (s) => 40 * s.progress.clients },             // R6.1
    board:    { per: 3, price: (s) => 60 * (s.progress.boardCells / 3) },     // R6.2
    products: { per: 1, price: (s) => 50 * (s.progress.productsBought + 1) }, // R6.3
  },
  // v2 — mecánica v2 (R13 clientes-criaturas / R14 tablero dual) ⚖BALANCE
  UNLOCK_PLACED_PILES: 3,           // R13.4 pilas colocadas por cada desbloqueo de criatura
  COLOR_PRICE_BASE: 150,            // R13.7 precio color = BASE * (n-3), n = colorsOwned tras comprar
  RUN_TILE_BASE: 40,                // R14.3 runTilePrice   = BASE * 1.6^runTilesActivated
  PERM_TILE_BASE: 200,              // R14.4 permTilePrice  = BASE * 1.35^permTiles
  MAX_COLORS: 10,                   // R13.7 10 colores / criaturas en orden de desbloqueo (R13.2)
  DEBRIS_THRESHOLD: 10,             // v2 escombros: umbral para entrar en tablero
  DEBRIS_BONUS_PER: 25,             // v2 escombros: bonus por escombro limpiado
  CASCADE_STEP_MS: 1600,            // v2 cascada: ms entre pasos (merge en cadena)
  PREVIEW_PRICE: 80,                // v2 R15.1 precio previewPool = PREVIEW_PRICE * level
};

// ---------------------------------------------------------------------------
// v2 — R13.2 Roster de criaturas en orden de desbloqueo 1→10. Cada criatura
// pide SOLO su color (índice = posición + 1). Por ahora solo nombres: el
// render/sprites llega después.
// ---------------------------------------------------------------------------
export const ROSTER = [
  'Gato anfitrión', 'Zorrito', 'Rana', 'Dragoncito',
  'Robot Barredor', 'Robot Barista', 'Robot Repartidor', 'Robot DJ',
  'Humano gemelo A', 'Humano gemelo B',
];

// ---------------------------------------------------------------------------
// deterministic seeding / sampling helpers (rng injected; never Math.random here)
// ---------------------------------------------------------------------------
const clone = (x) => structuredClone(x);
const rngInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// R3.1: build a single-color pool pile — one random color in [1, cu],
// repeated `size` (1..3) times. Used by generateBoard, buildPick (refill) and
// useRefreshPool so EVERY pool slot is monochrome.
function pile(rng, cu) {
  const color = rngInt(rng, 1, cu);
  return Array.from({ length: rngInt(rng, 1, 3) }, () => color);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// pick `k` distinct indices in [0, max)
function pickDistinct(rng, max, k) {
  const all = [];
  for (let i = 0; i < max; i++) all.push(i);
  if (k >= max) return all;
  const out = [];
  const seen = new Set();
  let guard = 0;
  while (out.length < k && guard++ < max * 2) {
    const v = rngInt(rng, 0, max - 1);
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Color progression — R10
// ---------------------------------------------------------------------------
export function colorsUnlocked(productsBought) {
  const v = 1 + Math.floor(productsBought / CONFIG.PRODUCTS_PER_COLOR);
  return Math.min(Math.max(v, 1), CONFIG.MAX_COLORS);
}

// ---------------------------------------------------------------------------
// Economy — R5
// ---------------------------------------------------------------------------
export function pay(order, multLevel = 0) {
  const exp = CONFIG.EXP_BASE + CONFIG.EXP_STEP * (multLevel || 0);
  return Math.round(CONFIG.BASE_COIN * Math.pow(order.qty, exp));
}

export function bonusCalamity(run) {
  if (!run) return 0;
  return (run.calamities || 0) * CONFIG.CALAMITY_BONUS_PER;
}

// ---------------------------------------------------------------------------
// createGame(initialDb) -> fresh persisted-shape state (R1.1). Also used as
// the "reset" target when a save has an unsupported version (R1.4).
// ---------------------------------------------------------------------------
export function createGame(init = {}) {
  const base = {
    version: 1,
    meta: {
      createdAt: 0, lastSavedAt: 0, lastSeenAt: 0,
      exportId: `ccc-1-${Date.now ? 0 : 0}-${Math.floor(Math.random() * 1e9)}`,
      // NOTE: exportId must be STABLE across save/load; renderer seeds it with
      // its own clock. Deterministic default here so roundtrip is identical.
    },
    progress: {
      coins: 0, totalGames: 0, cafeLevel: 1, productsBought: 0,
      clients: 3, boardCells: 7, colorsUnlocked: 1, // board starts as 7-cell hex 2-3-2
      colorsOwned: 4,                               // v2 R13.7: 4 colores de inicio
      permTiles: 1,                                 // v2 R14.2: techo inicial 1 (T14c/T14d:
                                                    // la 1ª activación por partida es posible
                                                    // sin comprar permanente)
      econ: { multLevel: 0 },
    },
    economy: { multLevel: 0 },
    skills: {
      destroyPile: { owned: false, uses: 0, price: 250, unlockLevel: 5 },
      swapPiles:   { owned: false, uses: 0, price: 120, unlockLevel: 3 },
      refreshPool: { owned: false, uses: 0, price: 40,  unlockLevel: 1 },
      // v2 R15.1 — serveManual: modelo TOGGLE (owned + autoServe, SIN uses);
      // previewPool: modelo LEVELS (owned + level 0..3, SIN uses).
      serveManual: { owned: false, autoServe: true, price: 150, unlockLevel: 1 },
      previewPool: { owned: false, level: 0, price: 80, unlockLevel: 1 },
    },
    idle: {
      workers:  { level: 1, ratePerSec: CONFIG.IDLE_RATE.workers,  cap: CONFIG.IDLE_CAP.workers },
      fame:     { level: 1, ratePerSec: CONFIG.IDLE_RATE.fame,     cap: CONFIG.IDLE_CAP.fame },
      machines: { level: 1, ratePerSec: CONFIG.IDLE_RATE.machines, cap: CONFIG.IDLE_CAP.machines },
    },
    run: null,
    metaClose: null,
    settings: { reducedMotion: false },
  };
  return deepMerge(base, init);
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = clone(base);
  for (const k of Object.keys(patch)) {
    if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k])
        && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], patch[k]);
    } else {
      out[k] = clone(patch[k]);
    }
  }
  return out;
}

function refreshProgressClose(s) {
  s.progress.cafeLevel = s.progress.totalGames + 1;           // R7.1
  s.progress.colorsUnlocked = colorsUnlocked(s.progress.productsBought); // R10.1
  return s;
}

// ---------------------------------------------------------------------------
// Hex axial-geometry helpers (R2 board redesign). A cell is {id,q,r,stack,...}
// where q/r are axial hex coordinates. Neighbors use the 6 standard axial deltas.
// ---------------------------------------------------------------------------
// standard axial hex adjacency (flat/pointy agnostic)
export const HEX_ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

// initial 7-cell board shaped 2-3-2 = hexagon of radius 1 (axial coords):
//   column q=-1 : r=0, r=1        (2 cells)
//   column q= 0 : r=-1, r=0, r=1  (3 cells)
//   column q= 1 : r=-1, r=0       (2 cells)
export function initialHexCells() {
  const coords = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  return coords.map(([q, r], i) => ({
    id: `c${i}`, q, r,
    stack: [], blocked: false, calamity: false, calamityStack: false,
  }));
}

export function isHexAdjacent(a, b) {
  if (!a || !b) return false;
  if (a.q === b.q && a.r === b.r) return false;
  return HEX_ADJ.some(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
}

// every free axial position that touches >=1 occupied cell (valid drag targets)
export function freeSlots(state) {
  const board = state.run?.board || [];
  const occupied = new Set(board.map((c) => `${c.q},${c.r}`));
  const seen = new Set();
  const out = [];
  for (const c of board) {
    for (const [dq, dr] of HEX_ADJ) {
      const key = `${c.q + dq},${c.r + dr}`;
      if (!occupied.has(key) && !seen.has(key)) { seen.add(key); out.push({ q: c.q + dq, r: c.r + dr }); }
    }
  }
  return out;
}

// price of buying one new tile (reuses the board-expansion price formula R6.2)
function tilePrice(s) {
  return Math.round(CONFIG.EXPAND.board.price(s));
}

// not exported helper guard shared by expandTile validation
function expandTileCheck(s, q, r) {
  const board = s.run?.board;
  if (!board || !board.length) return { error: 'noRun' };
  if (board.some((c) => c.q === q && c.r === r)) return { error: 'occupied' };
  const adjacent = board.some((c) => HEX_ADJ.some(([dq, dr]) => c.q + dq === q && c.r + dr === r));
  if (!adjacent) return { error: 'notAdjacent' };
  return null;
}

// ---------------------------------------------------------------------------
// Board / pool generation — v2.1 (R14.1/R14.2; reemplaza el board v1 de 7).
// Firma elegida: generateBoard(n, rng) -> array de `n` celdas axiales
// { id, q, r, stack, blocked, calamity, dormant }. En el juego n SIEMPRE es 32
// (panal con picos: 4 filas axiales [7,9,9,7] — estilo hexágono Catan pequeño).
// Las celdas nacen dormant:true (visibles pero apagadas) salvo el núcleo 2-3-2
// (7 celdas, mismas coords que initialHexCells) que queda jugable (dormant:false).
// ---------------------------------------------------------------------------
export function generateBoard(n, rng) {
  const size = n || 32;
  const core = new Set(initialHexCells().map((c) => `${c.q},${c.r}`));
  const board = [];
  let id = 0;
  // v2-shape: panal con picos filas [7,9,9,7] = 32 celdas (estilo hexágono
  // Catan pequeño). 4 filas axiales consecutivas (r fijo) con el inicio q
  // desfasado por fila para que el contorno sea un hexágono con picos arriba/
  // abajo y simetría de 180° (mapa q→−q, r→−1−r; filas anchas 9 en el centro):
  //   r=-2: q -3..3  (7)      r=-1: q -4..4  (9)
  //   r= 0: q -4..4  (9)      r= 1: q -3..3  (7)
  // Filas consecutivas offset medio (paridad de r en el renderer) → panal
  // regular: cada celda interior tiene sus 6 vecinos axiales dentro del shape.
  // (v2.0 usaba panal rectangular 6 filas de 5 = 30; reemplazado por este.)
  const ROWS = [ // [r, qStart, width]
    [-2, -3, 7],
    [-1, -4, 9],
    [0, -4, 9],
    [1, -3, 7],
  ];
  for (const [r, qStart, w] of ROWS) {
    for (let q = qStart; q < qStart + w; q++) {
      board.push({
        id: `c${id++}`, q, r,
        stack: [], blocked: false, calamity: false,
        dormant: !core.has(`${q},${r}`),          // R14.2 núcleo 2-3-2 jugable
      });
    }
  }
  return board;
}

// ---------------------------------------------------------------------------
// openRun / openShop — v2 (R13.3 arranque de run; reemplaza openRun v1).
// run = { board (32 celdas v2-shape [7,9,9,7]), orders, pool, poolPlaced, calamities,
//         rosterIndex, placedCounter, runTilesActivated }.
// Arranque: rosterIndex=1 (solo el Gato anfitrión, pedido {color:1, qty 2-4}),
// pool = 3 pilas monocromas SOLO de color 1 (tamaños rng 1-4), placedCounter=0,
// runTilesActivated=0. Los demás colores no existen hasta desbloqueo (R13.4).
// ---------------------------------------------------------------------------
// v2 helper: color máximo que genera el pool = min(rosterIndex, colorsOwned).
// El pedido de una criatura recién llegada POR ENCIMA del techo (colorsOwned+1)
// NO se genera en pool — eso es la presión de compra (R13.5/R13.7).
function poolMaxColor(rosterIndex, colorsOwned) {
  return Math.min(rosterIndex || 1, colorsOwned || 1);
}
// v2 helper: pila monocroma de tamaño rng 1-4 en [1, cu] (R13.3/R13.4)
function v2Pile(rng, cu) {
  return Array.from({ length: rngInt(rng, 1, 4) }, () => rngInt(rng, 1, cu));
}

// ---------------------------------------------------------------------------
// applyCalamities(state, rng) — R8 v2 + R14.5 (calamidades sobre JUGABLES).
// DECISIÓN DE DISEÑO (R14.5): con el board dual 32 el umbral R8.1 ya NO se
// evalúa al abrir la partida (núcleo jugable = 7, nunca > 15 al abrir); entra
// EN JUEGO cuando el jugador activa baldosas (activateTile) y el conteo de
// celdas JUGABLES (no dormant, no blocked) cruza 15. Para que las calamidades
// apliquen UNA sola vez por partida existe el flag run.calamitiesApplied:
//  * openRun llama applyCalamities tras generar el board (con 7 jugables es
//    un no-op, pero queda el camino único de generación);
//  * activateTile re-llama applyCalamities tras activar: si jugables > 15 y
//    el flag aún no está puesto, aplica y marca el flag. Llamadas posteriores
//    son no-op (una sola vez por partida).
// Rango (R8.2/R14.5): lo=ceil(jugables/5), hi=floor(jugables/3)
// (si hi<lo, hi=lo); count = entero en [lo,hi] según rng. Cada calamidad se
// elige (rng) entre celdas JUGABLES: 50% celda blocked (R8.4, no colocable /
// no activable), 50% pila pre-colocada stack=[color]*rngInt(1,3) con color
// uniforme entre los desbloqueados del pool (R8.3). Anota run.calamities=count
// (R8.5 bonus al cerrar = bonusCalamity, ya existente).
// ---------------------------------------------------------------------------
export function applyCalamities(state, rng) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return s;
  if (s.run.calamitiesApplied) return s;                    // una sola vez por partida
  const r = rng || Math.random;
  const playable = s.run.board.filter((c) => c && !c.dormant && !c.blocked);
  const n = playable.length;
  if (n <= CONFIG.CALAMITY_THRESHOLD) return s;             // R8.1/R14.5 solo jugables > 15
  const lo = Math.ceil(n * CONFIG.CALAMITY_MIN_FRAC);       // R8.2 lo
  const hi = Math.max(Math.floor(n * CONFIG.CALAMITY_MAX_FRAC), lo); // R8.2 hi
  const count = rngInt(r, lo, hi);                          // cantidad variable
  // color del pool para pilas pre-colocadas: uniforme entre desbloqueados
  const cu = poolMaxColor(s.run.rosterIndex, s.progress.colorsOwned);
  const idxs = pickDistinct(r, n, count);                   // celdas jugables distintas
  for (const i of idxs) {
    const cell = playable[i];
    cell.calamity = true;
    if (r() < CONFIG.BLOCK_PROB) {                          // R8.4 ~50% bloqueada
      cell.blocked = true;
      cell.calamityStack = false;
    } else {                                                // R8.3 ~50% pila pre-colocada
      const color = rngInt(r, 1, cu);
      cell.stack = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.calamityStack = true;
    }
  }
  s.run.calamities = count;                                 // R8.2 anotar (R8.5 bonus)
  s.run.calamitiesApplied = true;
  return s;
}

export function openRun(state, rng) {
  let s = clone(state);
  if (s.progress.permTiles == null) s.progress.permTiles = 1;      // v2 default (saves v1)
  const board = generateBoard(32, rng);                            // R14.1 board dual 32 (v2-shape [7,9,9,7])
  const orders = [{ id: 'ord-0', color: 1, qty: rngInt(rng, 2, 4), served: false }]; // R13.3 Gato
  s.run = {
    phase: 'open', board, orders,
    pool: Array.from({ length: 3 }, () => v2Pile(rng, poolMaxColor(1, s.progress.colorsOwned))),
    poolPlaced: 0, calamities: 0,
    calamitiesApplied: false,                                      // R14.5 una vez por partida
    rosterIndex: 1,                                                // R13.3 solo Gato
    placedCounter: 0,                                              // R13.4
    runTilesActivated: 0,                                          // R14.3
  };
  for (const key of Object.keys(CONFIG.USES_PER_RUN)) {
    if (s.skills[key] && s.skills[key].owned) {
      s.skills[key].uses = CONFIG.USES_PER_RUN[key];          // R7.4 replenish per run
    }
  }
  // R8/R14.5: generación única de calamidades (con el núcleo 7 jugable es
  // no-op al abrir; entra en juego vía activateTile al cruzar 15 jugables).
  s = applyCalamities(s, rng);
  s.meta.lastSeenAt = s.meta.lastSeenAt;
  return s;
}
export const newRun = openRun;

// ---------------------------------------------------------------------------
// topGroup(stack) -> { color, count } final run of equal-color at the top (R4.2)
// ---------------------------------------------------------------------------
export function topGroup(stack) {
  if (!stack || stack.length === 0) return { color: 0, count: 0 };
  const color = stack[stack.length - 1];
  let count = 0;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] !== color) break;
    count++;
  }
  return { color, count };
}

// ---------------------------------------------------------------------------
// R12.1 — merge: los vecinos axiales cuyo tope (racha final) tiene el MISMO
// color que el tope resultante de `cell` ceden esa racha al final del stack de
// `cell`. El vecino conserva su sub-pila inferior; si al cederla queda vacío
// conserva una ficha del color fusionado (contrato T11a: D gana la racha
// completa y A conserva [2]). Una pasada por los 6 vecinos.
// ---------------------------------------------------------------------------
function mergeNeighbors(s, cell) {
  const board = (s.run && s.run.board) || [];
  const tg = topGroup(cell.stack);
  if (!tg.color) return;
  for (const [dq, dr] of HEX_ADJ) {
    const nb = board.find((c) => c && c.q === cell.q + dq && c.r === cell.r + dr);
    if (!nb || !nb.stack || nb.stack.length === 0) continue;
    const ntg = topGroup(nb.stack);
    if (ntg.color === tg.color) {
      cell.stack = cell.stack.concat(nb.stack.splice(nb.stack.length - ntg.count, ntg.count));
      if (!nb.stack.length) nb.stack.push(ntg.color);   // conserva una ficha
    }
  }
}

// ---------------------------------------------------------------------------
// orderReadyOn — topGroup of a given pile cell can serve the order (R4 redesign)
// New signature: orderReadyOn(state, orderId, cellId). Orders have no cell anchor;
// the player picks the client first, then the pile to inspect.
// ---------------------------------------------------------------------------
export function orderReadyOn(state, orderId, cellId) {
  const order = state.run.orders.find((o) => String(o.id) === String(orderId));
  if (!order) return false;
  const cell = state.run.board[cellId];
  if (!cell || order.served) return false;
  const tg = topGroup(cell.stack);
  return tg.color === order.color && tg.count >= order.qty;
}

// ---------------------------------------------------------------------------
// placeStack(state, cellId, slot?) — place a pool pile onto a cell (R3)
// ---------------------------------------------------------------------------
export function placeStack(state, cellId, slot, rngOrStack) {
  const s = clone(state);
  const b = s.run && s.run.board;
  if (!b || cellId < 0 || cellId >= b.length) return { error: 'noCell' }; // R3.5
  const cell = b[cellId];
  if (cell.blocked) return { error: 'blocked' };                            // R3.5/R8.4
  // v2 firma TDD (state, cellId, slot, stack): pila EXPLÍCITA — se coloca sin
  // tocar pool/roster/refill. R12.1: si el color de la pila no fusiona con
  // ningún vecino (ni con el tope de la propia celda), la colocación se
  // RECHAZA sin mutar (contrato T11b: {error, state} sin cambios).
  if (Array.isArray(rngOrStack)) {
    const pileArr = rngOrStack;
    const pc = pileArr.length ? pileArr[pileArr.length - 1] : 0;
    const canMerge = (pc && HEX_ADJ.some(([dq, dr]) => {
      const nb = b.find((c) => c && c.q === cell.q + dq && c.r === cell.r + dr);
      return !!(nb && nb.stack && nb.stack.length && topGroup(nb.stack).color === pc);
    })) || topGroup(cell.stack).color === pc;
    if (!canMerge) return { error: 'noMerge', state: s };
    cell.stack = cell.stack.concat(pileArr);          // R3.4 apila al tope
    mergeNeighbors(s, cell);                          // R12.1 merge
    return s;
  }
  const rng = rngOrStack;
  if (cell.dormant) return { error: 'dormant' };        // v2 R14.2 no colocable
  if (s.run.poolPlaced >= 3 && s.run.pool.every((x) => x.length === 0)) {
    return { error: 'emptyPool' };
  }
  let idx = slot;
  if (idx === undefined) idx = s.run.pool.findIndex((x) => x.length > 0);
  if (idx < 0 || s.run.pool[idx].length === 0) return { error: 'emptySlot' }; // R3.5
  const pile = s.run.pool[idx];
  cell.stack = cell.stack.concat(pile);      // R3.4 / R4.2 stack on top
  s.run.pool[idx] = [];
  s.run.poolPlaced += 1;
  if (s.run.rosterIndex != null) {
    // v2 R13.4: cada pila colocada cuenta; cada UNLOCK_PLACED_PILES llega la
    // siguiente criatura (pedido {color: rosterIndex, qty 2-4}) — techo
    // R13.5: rosterIndex+1 <= colorsOwned+1 y < MAX_COLORS. El color de una
    // criatura por ENCIMA del techo NO se genera en pool (presión de compra).
    s.run.placedCounter = (s.run.placedCounter || 0) + 1;
    if (s.run.placedCounter >= CONFIG.UNLOCK_PLACED_PILES) {
      s.run.placedCounter = 0;
      const next = s.run.rosterIndex + 1;
      const owned = s.progress.colorsOwned || 0;
      if (next <= owned + 1 && next < CONFIG.MAX_COLORS) {
        s.run.rosterIndex = next;
        const r = rng || Math.random;
        s.run.orders.push({ id: `ord-${next}`, color: next, qty: rngInt(r, 2, 4), served: false });
      }
    }
  }
  if (s.run.poolPlaced === 3) {
    // refill all 3 at once (R3.3); injected rng keeps it deterministic
    if (s.run.rosterIndex != null) {
      // v2 R13.4: pool UNIFORME entre desbloqueados 1..min(rosterIndex, colorsOwned)
      const r = rng || Math.random;
      const cu = poolMaxColor(s.run.rosterIndex, s.progress.colorsOwned);
      s.run.pool = Array.from({ length: 3 }, () => v2Pile(r, cu));
    } else {
      s.run.pool = buildPick(rng, 3, s.progress.colorsUnlocked);
    }
    s.run.poolPlaced = 0;
  }
  mergeNeighbors(s, cell);                                 // R12.1 merge
  return s;
}

function buildPick(rng, n, cu) {
  return Array.from({ length: n }, () => pile(rng || Math.random, cu));
}

// ---------------------------------------------------------------------------
// v2 — Progresión permanente de colores (R13.7): buyColor desbloquea el
// siguiente color del roster. Precio COLOR_PRICE(n) = COLOR_PRICE_BASE*(n-3)
// con n = colorsOwned tras comprar. Máx MAX_COLORS (R13.7).
// ---------------------------------------------------------------------------
export function buyColor(state) {
  const s = clone(state);
  if (s.progress.colorsOwned == null) s.progress.colorsOwned = 4; // v2 default
  if (s.progress.colorsOwned >= CONFIG.MAX_COLORS) return { error: 'maxed', state: s };
  const n = s.progress.colorsOwned + 1;
  const price = CONFIG.COLOR_PRICE_BASE * (n - 3);
  if (s.progress.coins < price) return { error: 'noFunds', state: s }; // sin mutar
  s.progress.colorsOwned = n;
  s.progress.coins -= price;
  return s;
}

// ---------------------------------------------------------------------------
// v2 — Economía de baldosas (R14.2/R14.3/R14.4). Tablero dual 32 (v2-shape
// [7,9,9,7]): las celdas
// dormant se activan TEMPORALMENTE por partida (activateTile, techo
// runTilesActivated <= progress.permTiles) o se compran PERMANENTES en tienda
// (buyPermTile sube el techo; NO activa la celda — la activación es siempre
// temporal). Precios exponenciales ⚖BALANCE:
//   runTilePrice   = RUN_TILE_BASE  * 1.6^runTilesActivated   (R14.3)
//   permTilePrice  = PERM_TILE_BASE * 1.35^permTiles          (R14.4)
// (sin redondeo: la fórmula es la spec exacta)
// ---------------------------------------------------------------------------
export function runTilePrice(state) {
  const n = (state.run && state.run.runTilesActivated) || 0;
  return CONFIG.RUN_TILE_BASE * 1.6 ** n;
}

export function permTilePrice(state) {
  const m = (state.progress && state.progress.permTiles) || 0;
  return CONFIG.PERM_TILE_BASE * 1.35 ** m;
}

function v2CellOf(s, cellId) {
  if (typeof cellId === 'number') return s.run.board[cellId];
  return s.run.board.find((c) => c.id === cellId);
}

// NOTE: los retornos {error} llevan `state` (clone SIN mutar) — el contrato
// v2 de la suite hace unwind({error,state}) para verificar "sin mutar".
export function activateTile(state, cellId, rng) {
  let s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return { error: 'noRun', state: s };
  const cell = v2CellOf(s, cellId);
  if (!cell) return { error: 'noCell', state: s };
  if (!cell.dormant) return { error: 'notDormant', state: s };   // solo baldosas apagadas
  const perm = s.progress.permTiles || 0;
  if ((s.run.runTilesActivated || 0) >= perm) return { error: 'cap', state: s }; // R14.2 techo
  const price = runTilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s };
  cell.dormant = false;                                // activa ESTA partida
  s.run.runTilesActivated = (s.run.runTilesActivated || 0) + 1;
  s.progress.coins -= price;
  // R14.5: al activar puede cruzarse el umbral de JUGABLES (> 15) — las
  // calamidades entran UNA sola vez por partida (flag run.calamitiesApplied;
  // applyCalamities es no-op si ya aplicaron o si no se cruzó el umbral).
  s = applyCalamities(s, rng);
  return s;
}

export function buyPermTile(state, cellId) {
  const s = clone(state);
  if (s.progress.permTiles == null) s.progress.permTiles = 1;
  const price = permTilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s };
  // sube el techo permanente; la celda elegida NO se activa aquí (R14.4):
  // sigue dormant hasta un activateTile posterior (temporal por partida).
  s.progress.permTiles += 1;
  s.progress.coins -= price;
  return s;
}

// ---------------------------------------------------------------------------
// serveOrder(state, orderId, cellId) — click client (order) then pile (cell).
// Consumes EXACTLY order.qty pieces of the order's COLOR from the top of the
// pile (R4 redesign). Unlike the old rule, a pile larger than qty is served too
// (pile of 4, order qty 3 -> 1 piece remains). pago R5.1.
// ---------------------------------------------------------------------------
// R15.2 match determinista: entre las celdas servibles (tope color X, count>=N)
// gana la de count MÁS CERCANO a N (menor count); empate => menor índice.
function bestServeCell(board, order) {
  let best = -1;
  let bestCount = Infinity;
  board.forEach((c, i) => {
    if (!c || c.blocked || !c.stack || !c.stack.length) return;
    const tg = topGroup(c.stack);
    if (tg.color !== order.color || tg.count < order.qty) return;
    if (tg.count < bestCount) { best = i; bestCount = tg.count; }
  });
  return best;
}

export function serveOrder(state, orderId, cellId) {
  const s = clone(state);
  const order = s.run && s.run.orders.find((o) => String(o.id) === String(orderId));
  if (!order) return { error: 'noOrder' };
  if (order.served) return { error: 'alreadyServed' };                    // R4.4
  // v2 R4.3: cellId opcional — sin celda, match determinista (R15.2)
  let idx = cellId;
  if (idx === undefined) {
    idx = bestServeCell(s.run.board, order);
    if (idx < 0) return { error: 'notEnough' };
  }
  const cell = s.run.board[idx];
  if (!cell) return { error: 'noCell' };
  const tg = topGroup(cell.stack);
  // wrong color, or not enough pieces: error, consume nothing
  if (tg.color !== order.color || tg.count < order.qty) {                 // R4.4
    return { error: 'notEnough' };
  }
  // consume exactly order.qty pieces from the top (they are all order.color)
  cell.stack.splice(cell.stack.length - order.qty, order.qty);            // R4.3 v2
  order.served = true;
  const amount = pay(order, s.economy.multLevel);                          // R5.1
  s.progress.coins += amount;
  return s;
}

// ---------------------------------------------------------------------------
// resolveCascade(state) [R12.2] — PURA: clona, itera eslabones hasta estabilizar
// y retorna { state, steps }. Eslabón: (i) merge hacia celdas modificadas en
// esta cascada (R12.1); (ii) auto-servir pedidos flotantes (cell===null) con
// match determinista, si skills.serveManual.autoServe !== false; (iii) umbral
// de escombros (grupo contiguo >= DEBRIS_THRESHOLD eliminado, bonus por ficha).
// Estable desde el inicio => steps 0. Sin CASCADE_STEP_MS: síncrona.
// ---------------------------------------------------------------------------
export function resolveCascade(state) {
  const s = clone(state);
  let steps = 0;
  // "imanes": celdas cuyo stack cambió dentro de ESTA cascada y que atraen el
  // merge de sus vecinos. Arranca vacío => el primer eslabón no re-fusiona
  // pilas ya estables (solo la colocación previa, en placeStack, dispara ese).
  let magnets = new Set();
  for (let guard = 0; guard < 1000; guard++) {
    let acted = false;
    // (i) merge entre vecinos — solo hacia imanes
    if (magnets.size > 0) {
      const targets = [...magnets];
      magnets = new Set();
      let didMerge = false;
      for (const i of targets) {
        const cell = s.run.board[i];
        if (!cell || !cell.stack || !cell.stack.length) continue;
        const tg = topGroup(cell.stack);
        if (!tg.color) continue;
        for (const [dq, dr] of HEX_ADJ) {
          const nb = s.run.board.find((c) => c && c.q === cell.q + dq && c.r === cell.r + dr);
          if (!nb || !nb.stack || !nb.stack.length) continue;
          const ntg = topGroup(nb.stack);
          if (ntg.color === tg.color) {
            cell.stack = cell.stack.concat(nb.stack.splice(nb.stack.length - ntg.count, ntg.count));
            didMerge = true;
          }
        }
        if (didMerge) magnets.add(i);
      }
      if (didMerge) acted = true;
    }
    // (ii) auto-servir: pedidos flotantes (cell === null), match determinista
    const auto = !(s.skills && s.skills.serveManual
      && s.skills.serveManual.autoServe === false);
    if (auto && Array.isArray(s.run.orders)) {
      for (const order of s.run.orders) {
        if (!order || order.served || order.cell !== null) continue;   // R15.2
        const idx = bestServeCell(s.run.board, order);
        if (idx < 0) continue;
        const cell = s.run.board[idx];
        cell.stack.splice(cell.stack.length - order.qty, order.qty);   // exacto
        order.served = true;
        s.progress.coins += pay(order, s.economy.multLevel);           // R5.1
        acted = true;
      }
    }
    // (iii) umbral de escombros: todo grupo contiguo >= DEBRIS_THRESHOLD se
    // elimina; coins += DEBRIS_BONUS_PER * tamaño (R12.3). La celda remanente
    // queda como imán para el merge del siguiente eslabón.
    s.run.board.forEach((c, i) => {
      if (!c || !c.stack || !c.stack.length) return;
      const st = c.stack;
      let j = 0;
      while (j < st.length) {
        let k = j;
        while (k < st.length && st[k] === st[j]) k++;
        const runLen = k - j;
        if (runLen >= CONFIG.DEBRIS_THRESHOLD) {
          st.splice(j, runLen);
          s.progress.coins += CONFIG.DEBRIS_BONUS_PER * runLen;
          magnets.add(i);
          acted = true;
        } else {
          j = k;
        }
      }
    });
    if (!acted) break;
    steps += 1;
  }
  return { state: s, steps };
}

// ---------------------------------------------------------------------------
// isServeReady(state, cellId) — el tope de ESA celda cumple ALGÚN pedido
// pendiente (R15.2: la celda queda "servible" para el serve manual).
// ---------------------------------------------------------------------------
export function isServeReady(state, cellId) {
  if (!state || !state.run || !Array.isArray(state.run.board)) return false;
  const cell = typeof cellId === 'number'
    ? state.run.board[cellId]
    : state.run.board.find((c) => c && c.id === cellId);
  if (!cell) return false;
  const tg = topGroup(cell.stack);
  if (!tg.color) return false;
  return (state.run.orders || []).some((o) =>
    o && !o.served && o.color === tg.color && tg.count >= o.qty);
}

// ---------------------------------------------------------------------------
// expandTile(state, q, r) — buy ONE tile and place it at the axial position
// (q,r). Valid only if the position is FREE and ADJACENT to >=1 existing cell.
// Costs coins (R6.2 price formula) and grows boardCells by 1.
// ---------------------------------------------------------------------------
export function expandTile(state, q, r) {
  const s = clone(state);
  const guard = expandTileCheck(s, q, r);
  if (guard) return guard;
  const price = tilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds' };              // R6.4
  s.run.board.push({
    id: `c${s.progress.boardCells}`, q, r,
    stack: [], blocked: false, calamity: false, calamityStack: false,
  });
  s.progress.boardCells += 1;
  s.progress.coins -= price;
  return s;
}

// ---------------------------------------------------------------------------
// closeRun(state, reason) — R2.2/2.3/2.4/2.5, bonus R5.3/R8.5
// ---------------------------------------------------------------------------
export function closeRun(state, reason = 'manual') {
  const valid = new Set(['full', 'allServed', 'manual']);
  if (!valid.has(reason)) reason = 'manual';
  const s = clone(state);
  if (!s.run) return s;
  const bonus = bonusCalamity(s.run);
  s.progress.coins += bonus;                                             // R5.3
  s.metaClose = {
    reason,
    bonus,
    victory: reason === 'allServed',                                      // R2.6
    served: s.run.orders.filter((o) => o.served).length,
    total: s.run.orders.length,
  };
  s.progress.totalGames += 1;                                            // R2.5
  s.progress.cafeLevel = s.progress.totalGames + 1;                       // R7.1
  s.progress.colorsUnlocked = colorsUnlocked(s.progress.productsBought);  // R10
  s.run = null;
  return s;
}

// ---------------------------------------------------------------------------
// Skill tree / powers — R7
// ---------------------------------------------------------------------------
export function buySkill(state, power) {
  const sk = state.skills[power];
  if (!sk) return { error: 'noSkill' };
  const s = clone(state);
  // v2 R15.1 — serveManual: modelo TOGGLE (owned, SIN uses)
  if (power === 'serveManual') {
    if (sk.owned) return { error: 'owned' };
    if (s.progress.cafeLevel < sk.unlockLevel) return { error: 'locked' }; // R7.1
    if (s.progress.coins < sk.price) return { error: 'noFunds' };          // R7.3
    s.progress.coins -= sk.price;
    s.skills.serveManual.owned = true;        // autoServe ya viene true (toggle)
    return s;
  }
  // v2 R15.1 — previewPool: modelo LEVELS (level 1..3, SIN uses)
  if (power === 'previewPool') {
    const level = sk.level || 0;
    if (level >= 3) return { error: 'max' };
    const price = CONFIG.PREVIEW_PRICE * (level + 1);   // p.ej. 80*level
    if (s.progress.cafeLevel < sk.unlockLevel) return { error: 'locked' }; // R7.1
    if (s.progress.coins < price) return { error: 'noFunds' };             // R7.3
    s.progress.coins -= price;
    s.skills.previewPool.owned = true;
    s.skills.previewPool.level = level + 1;
    return s;
  }
  // v1 — skills de USES (destroyPile / swapPiles / refreshPool)
  if (sk.owned) return { error: 'owned' };
  if (s.progress.cafeLevel < sk.unlockLevel) return { error: 'locked' }; // R7.1
  if (s.progress.coins < sk.price) return { error: 'noFunds' };          // R7.3
  s.progress.coins -= sk.price;
  s.skills[power].owned = true;
  s.skills[power].uses = CONFIG.USES_PER_RUN[power];                     // R7.3
  return s;
}

// ---------------------------------------------------------------------------
// v2 R15.1 — toggleServe(state): invierte skills.serveManual.autoServe.
// Requiere la skill comprada; si no, {error} sin mutar.
// ---------------------------------------------------------------------------
export function toggleServe(state) {
  const sk = state.skills && state.skills.serveManual;
  if (!sk || !sk.owned) return { error: 'locked' };
  const s = clone(state);
  s.skills.serveManual.autoServe = !s.skills.serveManual.autoServe;
  return s;
}

// ---------------------------------------------------------------------------
// v2 R15.1 — previewPool(state, rng): vista previa PURA de las próximas tandas
// del pool. level 0 (sin comprar) => null; level N (1..3) => N tandas de 3
// pilas monocromas con colores uniformes en 1..min(rosterIndex, colorsOwned).
// Determinista (rng inyectado) y NO muta el estado.
// ---------------------------------------------------------------------------
export function previewPool(state, rng) {
  const sk = state && state.skills && state.skills.previewPool;
  const level = (sk && sk.level) || 0;
  if (level <= 0) return null;
  const r = (state && state.run) || {};
  const cu = poolMaxColor(r.rosterIndex, state.progress && state.progress.colorsOwned);
  return Array.from({ length: level }, () =>
    Array.from({ length: 3 }, () => {
      const color = rngInt(rng, 1, cu);                    // pila monocroma
      return Array.from({ length: rngInt(rng, 1, 4) }, () => color);
    }));
}

function ensureOwnedUses(state, power) {
  const sk = state.skills[power];
  if (!sk || !sk.owned) return { error: 'locked' };                     // R7.8
  if (sk.uses <= 0) return { error: 'noUses' };                          // R7.8
  return null;
}

export function useDestroyPile(state, cellId) {
  const guard = ensureOwnedUses(state, 'destroyPile');
  if (guard) return guard;
  const s = clone(state);
  const cell = s.run ? s.run.board[cellId] : null;
  if (!cell) return { error: 'noCell' };
  if (cell.blocked) return { error: 'blocked' };                        // R7.5 block
  cell.stack = [];                                                       // R7.5 empty
  s.skills.destroyPile.uses -= 1;
  return s;
}

export function useSwapPiles(state, a, b) {
  const guard = ensureOwnedUses(state, 'swapPiles');
  if (guard) return guard;
  const s = clone(state);
  const board = s.run.board;
  if (a === b) return { error: 'same' };
  if (!board[a] || !board[b]) return { error: 'noCell' };
  if (board[a].blocked || board[b].blocked) return { error: 'blocked' }; // R7.6
  const tmp = board[a].stack;
  board[a].stack = board[b].stack;                                        // R7.6 swap
  board[b].stack = tmp;
  s.skills.swapPiles.uses -= 1;
  return s;
}

export function useRefreshPool(state, rng) {
  const guard = ensureOwnedUses(state, 'refreshPool');
  if (guard) return guard;
  const s = clone(state);
  s.run.pool = Array.from({ length: 3 }, () => pile(rng || Math.random, s.progress.colorsUnlocked)); // R7.7 + R3.1
  s.run.poolPlaced = 0;                                                   // R7.7
  s.skills.refreshPool.uses -= 1;
  return s;
}

// ---------------------------------------------------------------------------
// Purchases — expansions (R6), multiplier (R5.2), idle (R9.4)
// ---------------------------------------------------------------------------
export function buyExpansion(state, kind) {
  const cfg = CONFIG.EXPAND[kind];
  if (!cfg) return { error: 'noKind' };
  const s = clone(state);
  const price = Math.round(cfg.price(s));
  if (s.progress.coins < price) return { error: 'noFunds' };            // R6.4
  if (kind === 'clients') s.progress.clients += cfg.per;                  // R6.1
  if (kind === 'board') s.progress.boardCells += cfg.per;                 // R6.2
  if (kind === 'products') {
    s.progress.productsBought += cfg.per;                                 // R6.3
    s.progress.colorsUnlocked = colorsUnlocked(s.progress.productsBought); // R10.1
  }
  s.progress.coins -= price;
  return s;
}

export function buyMultiplier(state) {
  const s = clone(state);
  const lvl = s.progress.econ.multLevel;
  if (lvl >= CONFIG.MULT_MAX) return { error: 'maxed' };                 // R5.2 cap
  const price = CONFIG.MULT_PRICE_BASE * (lvl + 1);
  if (s.progress.coins < price) return { error: 'noFunds' };
  s.progress.coins -= price;
  s.progress.econ.multLevel = lvl + 1;
  return s;
}

export function buyIdleUpgrade(state, system) {
  const s = clone(state);
  const cur = s.idle[system];
  if (!cur) return { error: 'noSystem' };
  const price = CONFIG.IDLE_PRICE * cur.level * cur.level;              // R9.4
  if (s.progress.coins < price) return { error: 'noFunds' };
  s.progress.coins -= price;
  const lvl = cur.level + 1;
  s.idle[system] = {
    level: lvl,
    ratePerSec: CONFIG.IDLE_RATE[system] * lvl,                          // R9.1
    cap: CONFIG.IDLE_CAP[system] * lvl,                                  // R9.3
  };
  return s;
}

// ---------------------------------------------------------------------------
// Idle (online) / offline — R9
// ---------------------------------------------------------------------------
export function tickIdle(state, dt) {
  const s = clone(state);
  let total = 0;
  for (const k of ['workers', 'fame', 'machines']) {
    total += s.idle[k].ratePerSec * (dt || 0);                            // R9.1/R9.2 sum everything
  }
  s.progress.coins += total;
  return s;
}

export function applyOffline(state, now) {
  const s = clone(state);
  const dt = Math.max(0, (now ?? (s.meta.lastSeenAt || 0)) - (s.meta.lastSeenAt || 0));
  const report = { workers: 0, fame: 0, machines: 0, total: 0 };
  for (const k of ['workers', 'fame', 'machines']) {
    const sys = s.idle[k];
    const gained = Math.min(sys.ratePerSec * dt, sys.cap);                // R9.3 cap per system
    report[k] = Math.floor(gained);
  }
  report.total = report.workers + report.fame + report.machines;
  s.progress.coins += report.total;
  s.meta.lastSeenAt = now;
  s.meta.offlineReport = report;                                          // R9.3 expose
  return s;
}

export function idleRate(state, system) { return state.idle[system].ratePerSec; }
export function idleCap(state, system) { return state.idle[system].cap; }

// ---------------------------------------------------------------------------
// Persistence (pure — no localStorage here). R1
// ---------------------------------------------------------------------------
export function serializeState(state) {
  return JSON.stringify(state);
}

// R1.2 roundtrip: deserialize(serialize(state)) restores identical.
// R1.4 guard: unsupported version -> fresh createGame (never throws).
export function deserializeState(json) {
  try {
    const s = JSON.parse(json);
    if (s && s.version === 1) {
      // v2 defaults: saves v1 viejos no tienen los campos nuevos — no romper
      if (s.progress) {
        if (s.progress.permTiles == null) s.progress.permTiles = 1;      // R14.2 (techo inicial, ver createGame)
        if (s.progress.colorsOwned == null) s.progress.colorsOwned = 4;  // R13.7
      }
      if (s.skills) {
        // R15.1 defaults para saves viejos (modelo toggle / levels, sin uses)
        if (!s.skills.serveManual) s.skills.serveManual = { owned: false, autoServe: true };
        if (!s.skills.previewPool) s.skills.previewPool = { owned: false, level: 0 };
      }
      return s;
    }
    return createGame();
  } catch (e) {
    return createGame();
  }
}

// R1.3 import — valid version1 => state; invalid (no version / mis-shape) => {error}.
export function importSave(json) {
  try {
    const s = JSON.parse(json);
    if (!s || s.version !== 1 || !s.progress || !s.meta) return { error: 'invalid' };
    return s;
  } catch (e) {
    return { error: 'invalid' };
  }
}

// stable export id helper (uses caller ms; deterministic in tests when ms=0)
export function makeExportId(ms = 0) {
  return `ccc-1-${ms}`;
}

// small free helper exposed for renderer: brand a fresh id from a clock
export function brandExportId(state, ms) {
  const s = clone(state);
  if (!s.meta.exportId) s.meta.exportId = `ccc-1-${ms}`;
  return s;
}