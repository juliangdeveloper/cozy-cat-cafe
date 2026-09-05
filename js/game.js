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
  USES_SKILLS: ['destroyPile', 'swapPiles', 'refreshPool', 'queueSkip', 'tables', 'unlockLocks'], // v2.3 R7.2: skills modelo USOS (v2.8 += unlockLocks R7.8)
  MAX_USES_PER_SKILL: 5,            // v2.4: tope de usos por partida en destroy/swap/refresh/queueSkip (tables NO: su capa = baldosas dormant)
  TABLES_CAP_FROM_BOARD: true,      // v2.4: techo de buyTablesUp = celdas del tablero − núcleo 7
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
  RUN_TILE_BASE: 40,                // R14.3 [OBSOLETO v2.2 — queda solo por compat de tests viejos; runTilePrice≡0]
  PERM_TILE_BASE: 200,              // R14.4 v2.2: alias de TABLES_PERM_BASE (mismo valor)
  TABLES_PERM_BASE: 80,             // v2.5 R14.4 precio compra permanente 'tables' = BASE * RATIO^permTiles (antes 200×1.35 — 1.04M coins)
  TABLES_PERM_RATIO: 1.25,          // v2.5 R14.4 (dial balance, BALANCE_REPORT.md §6)
  MAX_COLORS: 10,                   // R13.7 10 colores / criaturas en orden de desbloqueo (R13.2)
  DEBRIS_THRESHOLD: 10,             // v2 escombros: umbral para entrar en tablero
  DEBRIS_BONUS_PER: 25,             // v2 escombros: bonus por escombro limpiado
  CASCADE_STEP_MS: 600,             // v2.2.1: ms entre eslabones (antes 1600 — muy lento para seguir el orden)
  PREVIEW_PRICE: 80,                // v2 R15.1 precio previewPool = PREVIEW_PRICE * level
  PILE_SIZE_WEIGHTS: [9, 8, 7, 6, 5, 4, 3], // v2.9 R3.1: peso del tamaño 1..7 —
                                    // menos fichas más común pero SUTIL (7 sigue
                                    // saliendo ~7%): P = peso/42 ⇒ 21/19/17/14/12/10/7%
  // v2.10 — R18 Bolsita de pool (rachas y transiciones suaves)
  BAG_INITIAL_COLORS: 4,            // R18.2 cantidad de colores iniciales en la bolsa
  BAG_INITIAL_MIN: 6,               // R18.2 puñado inicial mín por color
  BAG_INITIAL_MAX: 14,              // R18.2 puñado inicial máx por color
  BAG_RELOAD_MIN: 6,                // R18.4 recarga mín al agotarse un color
  BAG_RELOAD_MAX: 14,               // R18.4 recarga máx al agotarse un color
  // v2.1 — R16 cola de clientes / R17 skills de cola ⚖BALANCE
  MIN_CLIENTS: 20,                  // R16.1 TOTAL_CLIENTS base = 20 + capacidad.level
  MAX_CLIENTS: 60,                  // R16.1 v2.5: tope (capacidad max level = 40; antes 100/80 — curva rota, BALANCE_REPORT.md)
  USES_UP_BASE: 60,                 // R17.2 mejora de usos: precio = BASE * RATIO^compras
  USES_UP_RATIO: 1.6,               // R17.2 (exponencial auto-limita, sin tope)
  CAP_PRICE_BASE: 60,               // v2.5 R17.3 capacidad: precio = BASE * RATIO^level (antes 120×1.35 — 9.16e12 coins, imposible)
  CAP_RATIO: 1.145,                 // v2.5 R17.3 dial balance: 100% ≈ 30h en jugador medio (BALANCE_REPORT.md §6)
};

// ---------------------------------------------------------------------------
// v2 — R13.2 Roster de criaturas en orden de desbloqueo 1→10. Cada criatura
// pide SOLO su color (índice = posición + 1). Por ahora solo nombres: el
// render/sprites llega después.
// ---------------------------------------------------------------------------
export const ROSTER = [
  'Host cat', 'Fox kit', 'Frog', 'Dragonling',
  'Sweeper bot', 'Barista bot', 'Delivery bot', 'DJ bot',
  'Human twin A', 'Human twin B',
];

// ---------------------------------------------------------------------------
// deterministic seeding / sampling helpers (rng injected; never Math.random here)
// ---------------------------------------------------------------------------
const clone = (x) => structuredClone(x);
const rngInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
// v2.9 R3.1: tamaño de pila por TABLA DE PESOS (más común menos fichas, sutil).
// Uniforme ⇔ tabla plana. Un solo punto de verdad para v2Pile/pile/previewPool.
function pickPileSize(rng) {
  const w = CONFIG.PILE_SIZE_WEIGHTS;
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i + 1; }
  return w.length;
}

// R3.1 (v2.0): build a single pool pile — size rng 1..7, color POR FICHA
// aleatorio en [1, cu] (multicolor). Used by buildPick, useRefreshPool and
// generateBoard-era callers so EVERY pool slot follows the same rule.
function pile(rng, cu) {
  return Array.from({ length: pickPileSize(rng) }, () => rngInt(rng, 1, cu));
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
      destroyPile: { owned: false, uses: 0, usesBought: 0, price: 250, unlockLevel: 5 },
      swapPiles:   { owned: false, uses: 0, usesBought: 0, price: 120, unlockLevel: 3 },
      refreshPool: { owned: false, uses: 0, usesBought: 0, price: 40,  unlockLevel: 1 },
      // v2 R15.1 — serveManual: modelo TOGGLE (owned + autoServe, SIN uses);
      // previewPool: modelo LEVELS (owned + level 0..3, SIN uses).
      serveManual: { owned: false, autoServe: true, price: 150, unlockLevel: 1 },
      previewPool: { owned: false, level: 0, price: 80, unlockLevel: 1 },
      // v2.1 R17.1 — queueSkip: modelo USES (R7.4) — los 3 visibles van al
      // fondo de la cola y entran 3 nuevos. R17.2: usesBought (mejora de usos).
      queueSkip: { owned: false, uses: 0, usesBought: 0, price: 100, unlockLevel: 1 },
      // v2.2 R14.3/R14.4 — tables ("Activate"): modelo USES (1 uso base/partida,
      // repuesto por openRun). La compra permanente vive en la TIENDA
      // (buyTablesUp); price:0 aquí para que buySkill nunca lo venda.
      tables: { owned: false, uses: 0, usesBought: 0, unlockLevel: 1, price: 0 },
      // v2.8 R7.8 — unlockLocks ("Unlock"): modelo USES (tope MAX_USES 5/partida);
      // desbloquea UN candado de calamidad y REVELA su pila oculta (R8.4 v2).
      unlockLocks: { owned: false, uses: 0, usesBought: 0, price: 250, unlockLevel: 5 },
      // v2.1 R17.3 — capacidad: modelo LEVELS (level 0..80); TOTAL_CLIENTS =
      // MIN_CLIENTS + level (R16.1). Precio por fórmula CAP_PRICE (sk.price
      // no se usa; precio = CAP_PRICE_BASE * CAP_RATIO^level).
      capacidad: { owned: false, level: 0, price: 120, unlockLevel: 1 },
    },
    // v2.1: el café arranca VACÍO — todo el idle se compra en la tienda (R9.4):
    // level 0 => ratePerSec 0 (sin income) hasta comprar la 1ª mejora.
    idle: {
      workers:  { level: 0, ratePerSec: 0, cap: 0 },
      fame:     { level: 0, ratePerSec: 0, cap: 0 },
      machines: { level: 0, ratePerSec: 0, cap: 0 },
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
// (rectángulo 8×4 pointy: 4 filas axiales de 8 = 32 celdas, R14.1 v2.2).
// Las celdas nacen dormant:true (visibles pero apagadas) salvo el núcleo 2-3-2
// (7 celdas, mismas coords que initialHexCells) que queda jugable (dormant:false).
// ---------------------------------------------------------------------------
export function generateBoard(n, rng) {
  const size = n || 32;
  const core = new Set(initialHexCells().map((c) => `${c.q},${c.r}`));
  const board = [];
  let id = 0;
  // RECTÁNGULO 8×4 pointy (R14.1 v2.2): 4 filas axiales de 8 = 32 celdas,
  // contorno rectangular tipo marco de Catan con offset de panal. En columna
  // plegada col = q + floor(r/2) las 4 filas cubren el MISMO patrón consecutivo
  // -3..4 (qStart + floor(r/2) constante = -3) — así lo exige T14g:
  //   r=-2: q -2..5   r=-1: q -2..5   r=0: q -3..4   r=1: q -3..4
  // El núcleo 2-3-2 (7 celdas, initialHexCells) queda dentro y jugable.
  const ROWS = [ // [r, qStart, width] — RECTÁNGULO 8×4 pointy (32 celdas)
    [-2, -2, 8],
    [-1, -2, 8],
    [0, -3, 8],
    [1, -3, 8],
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
  // v2.8 R8.1: el UMBRAL y el RANGO siguen contando JUGABLES (>15), pero el
  // pool de SELECCIÓN son TODAS las celdas (jugable/dormant/blocked) sin
  // calamidad previa — las dormant reciben pila oculta revelable.
  const jugables = s.run.board.filter((c) => c && !c.dormant && !c.blocked).length;
  if (jugables <= CONFIG.CALAMITY_THRESHOLD) return s;      // R8.1/R14.5 solo jugables > 15
  const lo = Math.ceil(jugables * CONFIG.CALAMITY_MIN_FRAC);       // R8.2 lo
  const hi = Math.max(Math.floor(jugables * CONFIG.CALAMITY_MAX_FRAC), lo); // R8.2 hi
  const count = rngInt(r, lo, hi);                          // cantidad variable
  // color del pool para pilas pre-colocadas: uniforme entre desbloqueados
  const cu = poolMaxColor(s.run.rosterIndex, s.progress.colorsOwned);
  const pool = s.run.board.filter((c) => c && !c.calamity); // v2.8: 32 celdas elegibles
  const idxs = pickDistinct(r, pool.length, count);         // celdas distintas
  for (const i of idxs) {
    const cell = pool[i];
    cell.calamity = true;
    if (cell.dormant) {                                     // v2.8: dormant => pila oculta revelable al activar
      const color = rngInt(r, 1, cu);
      cell.hiddenStack = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.calamityStack = false;
      continue;
    }
    if (r() < CONFIG.BLOCK_PROB) {                          // R8.4 v2: bloqueada con pila OCULTA
      cell.blocked = true;
      cell.calamityStack = false;
      const color = rngInt(r, 1, cu);
      cell.hiddenStack = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.stack = [];
    } else {                                                // R8.3 v2: pila pre-colocada ENCUIMA de lo existente
      const color = rngInt(r, 1, cu);
      const add = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.stack = (cell.stack || []).concat(add);          // NUNCA sobrescribe (v2.8)
      cell.calamityStack = true;
    }
  }
  s.run.calamities = count;                                 // R8.2 anotar (R8.5 bonus)
  s.run.calamitiesApplied = true;
  return s;
}

// ---------------------------------------------------------------------------
// openRun / openShop — v2.1 (R13.3 v2.1 + R16 cola de clientes; reemplaza openRun v2.0).
// run = { board (32 celdas v2-shape [7,9,9,7]), orders, activeClients, pool,
//         poolPlaced, calamities, rosterIndex, placedCounter, runTilesActivated,
//         clientsDrawn, clientsServed, queueBack, orderSeq }.
// Arranque v2.1 (R16.2/R13.3 v2.1): rosterIndex=5 (5 tipos activos al abrir,
// NO 1), pool monocromo SOLO de colorsOwned (presión: pool < roster, R13.5).
// Cola PEREZOSA (R16.3): NO se pre-generan los TOTAL_CLIENTS; se dibujan los
// 3 VISIBLES (R16.4) y el resto se dibuja al servir (contadores clientsDrawn
// / clientsServed). TOTAL efectivo = MIN_CLIENTS + capacidad.level (R16.1).
// ---------------------------------------------------------------------------

// v2.1 — TOTAL_CLIENTS efectivo de la partida en curso [R16.1]:
// totalClients(state) = min(MAX_CLIENTS, MIN_CLIENTS + skills.capacidad.level).
export function totalClients(state) {
  const lvl = (state && state.skills && state.skills.capacidad && state.skills.capacidad.level) || 0;
  return Math.min(CONFIG.MAX_CLIENTS, CONFIG.MIN_CLIENTS + (lvl || 0));
}

// v2.1 — victoria de la partida en curso [R16.4]: clientsServed >= TOTAL.
// Helper para el renderer (checkServedAll) — expone el gate v2.1.
export function runVictory(state) {
  if (!state || !state.run) return false;
  return (state.run.clientsServed || 0) >= totalClients(state);
}

// v2.1 helper (R16.2 corrección): tope de roster de la partida =
// colorsOwned < MAX_COLORS ? colorsOwned + 1 : MAX_COLORS. Con colorsOwned=4
// el roster arranca (y se estanca) en 5; comprar colores sube el tope; con
// colorsOwned=10 el tope es 10 (no 11).
function rosterMax(colorsOwned) {
  return Math.min((colorsOwned || 0) + 1, CONFIG.MAX_COLORS);
}

// v2 helper: color máximo que genera el pool = min(rosterIndex, colorsOwned).
// El pedido de una criatura POR ENCIMA del techo (colorsOwned) NO se genera en
// pool — eso es la presión de compra (R13.5/R13.7). v2.1: pool < roster.
function poolMaxColor(rosterIndex, colorsOwned) {
  return Math.min(rosterIndex || 1, colorsOwned || 1);
}

// ---------------------------------------------------------------------------
// v2.10 R18 — Bolsita de colores en el pool (bag de inventario por color).
// v2.10.1 anti-colapso: el nº de colores VIVOS se mantiene en min(4, cu) — la
// recarga cae SOLO sobre colores muertos (incluido el que acaba de morir) y
// drawPoolPiles sana bolsas heredadas sub-viudas antes de dibujar. Cota: la
// cuota máx de un color pasa de 100% (colapso v2.10.0) a ~25%.
// ---------------------------------------------------------------------------

// R18.2: inicializar bolsa con 4 colores (o cu si cu < 4) y puñados 6..14
export function initBag(rng, cu) {
  const bag = {};
  const maxC = Math.max(1, cu || 1);
  const k = Math.min(CONFIG.BAG_INITIAL_COLORS, maxC);
  // Elegir k colores distintos en 1..maxC
  const indices = pickDistinct(rng, maxC, k); // 0-indexed en [0, maxC)
  for (const idx of indices) {
    const color = idx + 1;
    bag[color] = rngInt(rng, CONFIG.BAG_INITIAL_MIN, CONFIG.BAG_INITIAL_MAX);
  }
  return bag;
}

// R18.4 v2.10.1: recarga al agotarse — el rerolleo cae uniforme entre los
// colores MUERTOS (nunca sobre un vivo: el conjunto vivo es monótono estable).
function reloadIntoDead(rng, bag, maxC) {
  const dead = [];
  for (let c = 1; c <= maxC; c++) {
    if (!bag[c] || bag[c] <= 0) dead.push(c);
  }
  // con cu >= vivos siempre hay muertos (vivos <= 4 <= cu garantizado por el caller)
  if (dead.length === 0) return null;
  const c = dead[Math.floor(rng() * dead.length)];
  bag[c] = rngInt(rng, CONFIG.BAG_RELOAD_MIN, CONFIG.BAG_RELOAD_MAX);
  return c;
}

// R18.3/R18.4: saca 1 ficha de la bolsa (uniforme entre vivos) y descuenta 1.
// Si llega a 0, la recarga cae sobre un color muerto (R18.4 v2.10.1).
// Muta `bag` directamente (el caller es responsable de clonar si requiere pureza).
function drawTileFromBag(rng, bag, cu) {
  const maxC = Math.max(1, cu || 1);
  let alive = Object.keys(bag).map(Number).filter(c => bag[c] > 0);
  if (alive.length === 0) {
    // Bolsa totalmente vacía: sembrar un color muerto para poder dibujar
    reloadIntoDead(rng, bag, maxC);
    alive = Object.keys(bag).map(Number).filter(c => bag[c] > 0);
  }
  // Sorteo uniforme entre vivos
  const chosenColor = alive[Math.floor(rng() * alive.length)];
  bag[chosenColor] -= 1;
  if (bag[chosenColor] <= 0) {
    delete bag[chosenColor];
    // R18.4 v2.10.1: recarga SOLO sobre muertos (el propio muerto cuenta)
    reloadIntoDead(rng, bag, maxC);
  }
  return chosenColor;
}

// R18.5: drawPoolPiles(rng, bag, cu) -> { piles, nextBag }
// Función pura: clona `bag`, SANA bolsas heredadas con menos de min(4, cu)
// vivos (v2.10.0 podía colapsarlas a 1 — ej. save real {"10":4}) y genera 3
// pilas según PILE_SIZE_WEIGHTS.
export function drawPoolPiles(rng, bag, cu) {
  const nextBag = clone(bag || {});
  const maxC = Math.max(1, cu || 1);
  const target = Math.min(CONFIG.BAG_INITIAL_COLORS, maxC);
  const aliveNow = () => Object.keys(nextBag).map(Number).filter(c => nextBag[c] > 0);
  // Sana: mientras vivos < target, revivir muertos con puñados frescos
  // (v2.10.1): también cubre bolsa vacía/inexistente (saves pre-v2.10).
  let guard = 0;
  while (aliveNow().length < target && guard++ < target + 1) {
    const revived = reloadIntoDead(rng, nextBag, maxC);
    if (revived == null) break;
  }
  const piles = Array.from({ length: 3 }, () => {
    const size = pickPileSize(rng);
    const pile = [];
    for (let i = 0; i < size; i++) {
      pile.push(drawTileFromBag(rng, nextBag, cu));
    }
    return pile;
  });
  // Post-draw: un draw puede matar vivos si todos mueren en cascada — devolver
  // la bolsa SIEMPRE con vivos >= 1 para que la siguiente tanda sea posible.
  if (aliveNow().length === 0) {
    reloadIntoDead(rng, nextBag, maxC);
  }
  return { piles, nextBag };
}

// v2 helper: pila del pool — tamaño rng 1..7, color POR FICHA aleatorio en
// [1, cu] (v2.0: multicolor; antes monocromo 1..4, R13.3/R13.4).
function v2Pile(rng, cu) {
  return Array.from({ length: pickPileSize(rng) }, () => rngInt(rng, 1, cu));
}

// ---------------------------------------------------------------------------
// v2.1 R16.2/R16.3 — cola de clientes LAZY. El cliente ES un pedido flotante
// {id, color, qty 2-4, served:false} SIN celda; se DIBUJA al servir (llegada
// perezosa): drawClient saca el siguiente del pool de tipos 1..rosterIndex
// (uniforme rng) — puede pedir un color por encima de colorsOwned (presión
// R13.5: ese color no se genera en pool). NO se pre-generan los 20: se llevan
// contadores run.clientsDrawn / run.clientsServed.
// helper interno (muta s — el caller ya clonó): dibuja 1 cliente si la cola
// tiene pendientes (clientsDrawn < TOTAL). Retorna true si dibujó.
function drawClientInto(s, r) {
  const total = totalClients(s);
  if ((s.run.clientsDrawn || 0) >= total) return false;    // cola agotada
  const roster = s.run.rosterIndex || 1;
  const order = {
    id: `ord-${s.run.orderSeq != null ? s.run.orderSeq++ : (s.run.clientsDrawn || 0)}`,
    color: rngInt(r, 1, Math.max(1, roster)),              // uniforme 1..rosterIndex
    qty: rngInt(r, 2, 4),                                  // R16.2 qty 2-4
    served: false,
  };
  s.run.orders.push(order);
  s.run.activeClients.push(order);
  s.run.clientsDrawn += 1;
  return true;
}

// Firma pública: drawClient(state, rng) -> newState (dibuja 1 cliente; sin
// cambios si la cola está agotada o no hay run). rng default Math.random.
export function drawClient(state, rng) {
  const s = clone(state);
  if (!s.run) return s;
  drawClientInto(s, rng || Math.random);
  return s;
}

// v2.1 helper interno: rellena activeClients hasta VISIBLES=3 consumiendo
// PRIMERO run.queueBack (devueltos por queueSkip, FIFO) y después dibujando
// nuevos de la cola (si clientsDrawn < TOTAL). Muta `s` (el caller ya clonó).
function refillClients(s, rng) {
  if (!s.run || !Array.isArray(s.run.activeClients)) return;
  const r = rng || Math.random;
  while (s.run.activeClients.length < 3) {
    if (s.run.queueBack && s.run.queueBack.length) {
      s.run.activeClients.push(s.run.queueBack.shift());   // R17.1: devueltos primero
    } else if (!drawClientInto(s, r)) {
      break;                                               // llegada perezosa agotada
    }
  }
}

export function openRun(state, rng) {
  let s = clone(state);
  const r = rng || Math.random;
  if (s.progress.permTiles == null) s.progress.permTiles = 1;      // v2 default (saves v1)
  const board = generateBoard(32, r);                            // R14.1 board dual 32 (rectángulo 8×4 pointy, v2.2)
  const rosterIdx = Math.min(5, rosterMax(s.progress.colorsOwned)); // R13.3 v2.1: 5 tipos activos
  const cu = poolMaxColor(rosterIdx, s.progress.colorsOwned);
  const initialBag = initBag(r, cu);                               // R18.2 bolsita inicial
  const { piles, nextBag } = drawPoolPiles(r, initialBag, cu);    // R18.5
  s.run = {
    phase: 'open', board,
    orders: [], activeClients: [],                                 // v2.1 R16.2 clientes = pedidos flotantes
    pool: piles,
    bag: nextBag,                                                  // v2.10 R18
    poolPlaced: 0, calamities: 0,
    calamitiesApplied: false,                                      // R14.5 una vez por partida
    rosterIndex: rosterIdx,
    placedCounter: 0,                                              // R13.4
    runTilesActivated: 0,                                          // R14.3
    // v2.1 R16 — cola de clientes perezosa: 3 visibles, contadores, devueltos
    clientsDrawn: 0,                                               // R16.3 dibujados hasta ahora
    clientsServed: 0,                                              // R16.4 victoria = === TOTAL
    queueBack: [],                                                 // R17.1 FIFO de devueltos
    orderSeq: 0,                                                   // id ord-N estable
    mergeSeeds: [],                                                // v2.0 R12.1 paso a paso
  };
  // R16.4: dibujar los 3 VISIBLES iniciales (llegada perezosa, no pre-genera)
  refillClients(s, r);
  for (const key of CONFIG.USES_SKILLS) {
    if (s.skills[key] && s.skills[key].owned) {
      // v2.3 R7.4: cero base gratis — usos por partida = SOLO los comprados
      s.skills[key].uses = s.skills[key].usesBought || 0; // R7.4/R17.2 v2.3
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
// R12.1 v3 — MOTOR DE MERGE HEXASORT ORIGINAL (port de hexasort-party-v2):
// barrido global de grupos contiguos (BFS) con el mismo color de tope (≥2
// celdas); el destino de cada eslabón lo elige computeBestChain (T1: DFS
// simulada profundidad 6, cap 20000 nodos) o el fallback R2 (simula el
// post-merge de cada candidato y gana el que deja MÁS aristas encadenables;
// tie-break cozy: preferir candidato que NO haya recibido fichas en esta
// cascada → menor torre → menor índice). Las fuentes ceden su racha (run
// contiguo del tope) y conservan su sub-pila real — sin ficha de reserva.
// Cozy pacing: UN grupo por eslabón (cada merge es un paso visible).
// ---------------------------------------------------------------------------
export function bfsMergeGroups(board) {
  const groups = [];
  const seen = new Set();
  for (let i = 0; i < board.length; i++) {
    if (seen.has(i)) continue;
    const tg = topGroup(board[i].stack);
    if (!tg.color) continue;
    const comp = [i]; seen.add(i); const q = [i];
    while (q.length) {
      const ci = q.pop();
      const cc = board[ci];
      for (const [dq, dr] of HEX_ADJ) {
        const ni = board.findIndex((c) => c && c.q === cc.q + dq && c.r === cc.r + dr);
        if (ni < 0 || seen.has(ni)) continue;
        if (topGroup(board[ni].stack).color === tg.color) { seen.add(ni); comp.push(ni); q.push(ni); }
      }
    }
    if (comp.length >= 2) groups.push(comp.sort((a, b) => a - b));
  }
  groups.sort((a, b) => b.length - a.length);   // grupos grandes primero (determinista)
  return groups;
}

// T1 (port computeBestChain): mejor secuencia de merges simulada (DFS prof. 6,
// cap 20000 nodos). Score de hoja: -gruposActivos*1000 + top3 runs + depth*5.
export function computeBestChain(board) {
  const MAXD = 6;
  const stacks = board.map((c) => [...(c.stack || [])]);
  let nodes = 0, bestSeq = null, bestScore = -Infinity;
  const topOf = (st) => (st.length ? st[st.length - 1] : 0);
  const runOf = (st) => {
    if (!st.length) return 0;
    const t = st[st.length - 1]; let n = 0;
    for (let i = st.length - 1; i >= 0 && st[i] === t; i--) n++;
    return n;
  };
  const neighbors = (i) => {
    const out = [];
    const cc = board[i];
    for (const [dq, dr] of HEX_ADJ) {
      const ni = board.findIndex((c) => c && c.q === cc.q + dq && c.r === cc.r + dr);
      if (ni >= 0) out.push(ni);
    }
    return out;
  };
  function groupsOf(st) {
    const groups = []; const seen = new Set();
    for (let i = 0; i < st.length; i++) {
      if (seen.has(i)) continue;
      const t = topOf(st[i]);
      if (!t) continue;
      const comp = [i]; seen.add(i); const q = [i];
      while (q.length) {
        const ci = q.pop();
        for (const ni of neighbors(ci)) {
          if (!seen.has(ni) && topOf(st[ni]) === t) { seen.add(ni); comp.push(ni); q.push(ni); }
        }
      }
      if (comp.length >= 2) groups.push(comp.sort((a, b) => a - b));
    }
    groups.sort((a, b) => b.length - a.length);
    return groups.slice(0, 8);   // branch factor acotado
  }
  function applyMove(st, group, target) {
    const next = st.map((s2) => [...s2]);
    for (const gi of group) {
      if (gi === target) continue;
      const n = runOf(next[gi]);
      for (let z = 0; z < n; z++) next[target].push(next[gi].pop());
    }
    return next;
  }
  function countActiveGroups(st) {
    let g = 0; const seen = new Set();
    for (let i = 0; i < st.length; i++) {
      if (seen.has(i)) continue;
      const t = topOf(st[i]);
      if (!t) continue;
      const comp = [i]; seen.add(i); const q = [i];
      while (q.length) {
        const ci = q.pop();
        for (const ni of neighbors(ci)) {
          if (!seen.has(ni) && topOf(st[ni]) === t) { seen.add(ni); comp.push(ni); q.push(ni); }
        }
      }
      if (comp.length >= 2) g++;
    }
    return g;
  }
  function evalState(st, depth) {
    const runs = [];
    for (let i = 0; i < st.length; i++) { const r = runOf(st[i]); if (r > 0) runs.push(r); }
    runs.sort((a, b) => b - a);
    const r1 = runs[0] || 0, r2 = runs[1] || 0, r3 = runs[2] || 0;
    return -countActiveGroups(st) * 1000 + (r1 * 10 + r2 * 5 + r3) + depth * 5;
  }
  function dfs(st, depth, moves) {
    if (++nodes > 20000) return;
    const sc = evalState(st, depth);
    if (sc > bestScore) { bestScore = sc; bestSeq = moves.slice(); }
    if (depth >= MAXD) return;
    const groups = groupsOf(st);
    for (const g of groups) {
      const color = topOf(st[g[0]]);
      for (const t of g) {
        moves.push({ color, source: g.filter((x) => x !== t), target: t });
        dfs(applyMove(st, g, t), depth + 1, moves);
        moves.pop();
        if (nodes > 20000) return;
      }
    }
  }
  dfs(stacks, 0, []);
  return bestSeq || [];
}

// R2 (fallback): destino = candidato que deja MÁS aristas encadenables post-merge;
// tie-break v2.2.1 (flip pedido por el usuario): 1º candidato que SÍ recibió
// en esta cascada (último receptor, fiel al mergeTarget del original),
// 2º torre más baja, 3º menor índice (determinista).
export function r2Target(board, group, color, received) {
  let best = -1, bestChain = -1, bestReceived = false, bestSize = Infinity;
  for (const gi of group) {
    // tops post-merge: las fuentes pierden su run, los candidatos conservan el suyo
    const post = new Map();
    for (const g2 of group) {
      const rem = board[g2].stack.filter((h) => h !== color);
      post.set(g2, rem.length ? rem[rem.length - 1] : 0);
    }
    let chain = 0; const seenE = new Set();
    for (const g2 of group) {
      if (!post.get(g2)) continue;
      const gc = board[g2];
      for (const [dq, dr] of HEX_ADJ) {
        const ni = board.findIndex((c) => c && c.q === gc.q + dq && c.r === gc.r + dr);
        if (ni < 0) continue;
        const k = g2 < ni ? g2 + '-' + ni : ni + '-' + g2;
        if (seenE.has(k)) continue; seenE.add(k);
        const nt = post.has(ni) ? post.get(ni) : topGroup(board[ni].stack).color;
        if (nt && nt === post.get(g2)) chain++;
      }
    }
    const sz = board[gi].stack.length;
    const rec = received.has(gi);
    if (best < 0 || chain > bestChain
      || (chain === bestChain && !bestReceived && rec)
      || (chain === bestChain && rec === bestReceived && sz < bestSize)
      || (chain === bestChain && rec === bestReceived && sz === bestSize && gi < best)) {
      best = gi; bestChain = chain; bestReceived = rec; bestSize = sz;
    }
  }
  return best;
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
    if (!canMerge) {
      // v2.2 R3.5: pilas SOLO en celdas vacías. Si la celda está ocupada y la
      // pila explícita no fusiona con nada => {error:'occupied'} (T18a). En
      // celda vacía sin fusión se conserva el contrato T11b ('noMerge').
      return { error: (cell.stack && cell.stack.length) ? 'occupied' : 'noMerge', state: s };
    }
    cell.stack = cell.stack.concat(pileArr);          // R3.4 apila al tope
    return s;                                         // v3: barrido global en resolveCascade
  }
  const rng = rngOrStack;
  if (cell.dormant) return { error: 'dormant' };        // v2 R14.2 no colocable
  if (cell.stack && cell.stack.length) return { error: 'occupied' };   // v2.2 R3.5: solo espacios vacíos
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
    // v2.1 R16.2 (corregido): cada pila colocada cuenta; cada
    // UNLOCK_PLACED_PILES=3 el roster avanza +1 tipo HASTA el tope
    // rosterMax = colorsOwned < MAX_COLORS ? colorsOwned+1 : MAX_COLORS
    // (sin techo por colorsOwned en el AVANCE, pero con techo por la fórmula).
    // El color del tipo superior (colorsOwned+1) NO se genera en pool —
    // presión de compra R13.5 (pool < roster). Los clientes NO se empujan
    // aquí: son cola perezosa (drawClient al servir, R16.3).
    s.run.placedCounter = (s.run.placedCounter || 0) + 1;
    if (s.run.placedCounter >= CONFIG.UNLOCK_PLACED_PILES) {
      s.run.placedCounter = 0;
      const cap = rosterMax(s.progress.colorsOwned);
      if (s.run.rosterIndex < cap) s.run.rosterIndex = s.run.rosterIndex + 1;
    }
  }
  if (s.run.poolPlaced === 3) {
    // refill all 3 at once (R3.3); injected rng keeps it deterministic
    const r = rng || Math.random;
    if (s.run.rosterIndex != null || s.run.bag != null || s.progress.colorsOwned != null) {
      // v2.10 R18: refill consume de s.run.bag (o la inicializa si faltaba)
      const cu = poolMaxColor(s.run.rosterIndex || 5, s.progress.colorsOwned || 4);
      const { piles, nextBag } = drawPoolPiles(r, s.run.bag, cu);
      s.run.pool = piles;
      s.run.bag = nextBag;
    } else {
      s.run.pool = buildPick(rng, 3, s.progress.colorsUnlocked);
    }
    s.run.poolPlaced = 0;
  }
  return s;                                              // v3: barrido global en resolveCascade
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
// v2 — Economía de baldosas (R14.2/R14.3/R14.4; v2.2: Activate por USOS).
// Tablero dual 32 (rectángulo 8×4 pointy v2.2): las celdas dormant se activan
// TEMPORALMENTE por partida con la skill 'tables' (modelo USES R7.4/R17.2:
// 1 uso base + usesBought por partida, repuesto por openRun; SIN costo de
// monedas por activación — el costo vive en la TIENDA). La compra permanente
// es buyTablesUp (R14.4 v2.2): sube permTiles (techo histórico, compat) Y
// usesBought (+1 mesa/partida). Precio exponencial ⚖BALANCE:
//   permTilePrice  = TABLES_PERM_BASE * 1.35^permTiles  (= PERM_TILE_BASE)
// runTilePrice ≡ 0 desde v2.2 (sin precio por activación).
// ---------------------------------------------------------------------------
export function runTilePrice(state) {
  return 0;   // v2.2: sin precio por activación (modelo usos de skills.tables)
}

export function permTilePrice(state) {
  const m = (state.progress && state.progress.permTiles) || 0;
  return CONFIG.TABLES_PERM_BASE * CONFIG.TABLES_PERM_RATIO ** m;
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
  // v2.2 R14.3: modelo USOS de la skill 'tables' (R7.8) — sin techo permTiles
  // y SIN costo de coins (el costo vive en la compra permanente de la tienda).
  const sk = s.skills && s.skills.tables;
  if (!sk || !sk.owned) return { error: 'locked', state: s };   // R7.8
  if ((sk.uses | 0) <= 0) return { error: 'noUses', state: s }; // R14.3 v2.2
  cell.dormant = false;                                // activa ESTA partida
  // v2.8 R8.1: revelar pila de calamidad oculta en baldosas (si la hay)
  if (cell.hiddenStack && cell.hiddenStack.length) {
    cell.stack = (cell.stack || []).concat(cell.hiddenStack);
    delete cell.hiddenStack;
  }
  s.run.runTilesActivated = (s.run.runTilesActivated || 0) + 1;
  sk.uses -= 1;                                        // sin costo de coins
  // R14.5: al activar puede cruzarse el umbral de JUGABLES (> 15) — las
  // calamidades entran UNA sola vez por partida (flag run.calamitiesApplied;
  // applyCalamities es no-op si ya aplicaron o si no se cruzó el umbral).
  s = applyCalamities(s, rng);
  return s;
}

// ---------------------------------------------------------------------------
// v2.2 R14.4 — buyTablesUp (reemplaza a buyPermTile): compra permanente en la
// TIENDA. Sube el techo histórico permTiles (+1) Y skills.tables.usesBought
// (+1 mesa activable por partida; openRun repone uses = 1 + usesBought).
// La 1ª compra marca tables como owned. La celda elegida NO se activa aquí.
// Precio = permTilePrice = TABLES_PERM_BASE * 1.35^permTiles.
// ---------------------------------------------------------------------------
export function buyTablesUp(state) {
  const s = clone(state);
  if (s.progress.permTiles == null) s.progress.permTiles = 1;
  if (!s.skills.tables) s.skills.tables = { owned: false, uses: 0, usesBought: 0 };
  // v2.4: el techo de mesas/partida depende del TAMAÑO DEL TABLERO —
  // celdas totales − núcleo 7 (nunca tiene sentido comprar más activables
  // que baldosas apagadas existan). Con 32 celdas: tope 25.
  const boardCap = (s.run && Array.isArray(s.run.board) ? s.run.board.length : 32) - 7;
  if ((s.skills.tables.usesBought || 0) >= boardCap) return { error: 'maxUses', state: s };
  const price = permTilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s };
  s.progress.permTiles += 1;                                    // techo permanente
  s.skills.tables.usesBought = (s.skills.tables.usesBought || 0) + 1;  // mesas/partida
  s.skills.tables.owned = true;
  s.progress.coins -= price;
  return s;
}
// alias deprecado (compat imports viejos: buyPermTile(state, cellId))
export const buyPermTile = buyTablesUp;

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
  const run = s.run;
  const order = run && run.orders && run.orders.find((o) => String(o.id) === String(orderId));
  if (!order) return { error: 'noOrder' };
  if (order.served) return { error: 'alreadyServed' };                    // R4.4
  // v2.1 R16.4: SOLO los clientes VISIBLES (activeClients) pueden servirse
  // (auto o manual). En runs viejas sin activeClients (shape v1) se permite
  // servir cualquier order (compat v1, ver deserializeState).
  if (Array.isArray(run.activeClients) && !run.activeClients.includes(order)) {
    return { error: 'notVisible' };                                       // R16.4
  }
  // v2 R4.3: cellId opcional — sin celda, match determinista (R15.2)
  let idx = cellId;
  if (idx === undefined) {
    idx = bestServeCell(run.board, order);
    if (idx < 0) return { error: 'notEnough' };
  }
  const cell = run.board[idx];
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
  // v2.1 R16.3/R16.4: al servir un VISIBLE → clientsServed+1 y entra el
  // siguiente de la cola (queueBack primero, luego draw si clientsDrawn<TOTAL).
  if (run.clientsServed != null && Array.isArray(run.activeClients)) {
    run.clientsServed += 1;
    run.activeClients = run.activeClients.filter((o) => o !== order);
    refillClients(s, rngFallback());
  }
  return s;
}

// v2.1: rng de refill — serveOrder no recibe rng (firma v1/v2 estable); el
// sorteo de clientes es el único uso no inyectado y SOLO afecta al color/qty
// del siguiente cliente (nunca a pagos ni merges). Documentado en R11.2 ⚠.
function rngFallback() { return Math.random; }

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
  // received: celdas que ya RECIBIERON fichas en esta cascada (tie-break cozy
  // de R2: preferir candidato que NO haya recibido — pedido del usuario)
  const received = new Set();
  for (let guard = 0; guard < 1000; guard++) {
    let acted = false;
    // (i) merge HEXASORT ORIGINAL (R12.1 v3): barrido global — BFS de grupos
    // contiguos con mismo color de tope (≥2 celdas); UN grupo por eslabón
    // (paso a paso v2.0). Destino elegido por T1 (computeBestChain: mejor
    // secuencia simulada prof. 6) o R2 (más aristas encadenables post-merge;
    // tie-break: no-receptor → torre menor → índice). Las fuentes ceden su
    // racha (run del tope) y conservan su sub-pila real.
    if (s.run) {
      const groups = bfsMergeGroups(s.run.board);
      if (groups.length > 0) {
        const group = groups[0];
        const tg = topGroup(s.run.board[group[0]].stack);
        let target;
        const plan = computeBestChain(s.run.board);              // T1
        const step = plan.find((p) => p.color === tg.color
          && p.source.every((si) => group.includes(si)));
        if (step && group.includes(step.target)) target = step.target;
        else target = r2Target(s.run.board, group, tg.color, received); // R2
        for (const si of group) {
          if (si === target) continue;
          const nb = s.run.board[si];
          const ntg = topGroup(nb.stack);
          s.run.board[target].stack = s.run.board[target].stack
            .concat(nb.stack.splice(nb.stack.length - ntg.count, ntg.count));
          received.add(target);
        }
        acted = true;
      }
    }
    // (ii) auto-servir: SOLO los clientes VISIBLES (v2.1 R16.4: activeClients,
    // máx 3 — los pedidos NO visibles de run.orders se IGNORAN aunque tengan
    // tope válido). En runs viejas sin activeClients (shape v1) se itera
    // orders (compat). Match determinista R15.2.
    const auto = !(s.skills && s.skills.serveManual
      && s.skills.serveManual.autoServe === false);
    const visible = Array.isArray(s.run.activeClients) ? s.run.activeClients : s.run.orders;
    if (auto && Array.isArray(visible)) {
      for (const order of visible) {
        if (!order || order.served) continue;                           // R15.2
        if (order.cell !== null && order.cell !== undefined) continue;  // flotantes (cell null/absent)
        const idx = bestServeCell(s.run.board, order);
        if (idx < 0) continue;
        const cell = s.run.board[idx];
        cell.stack.splice(cell.stack.length - order.qty, order.qty);   // exacto
        order.served = true;
        s.progress.coins += pay(order, s.economy.multLevel);           // R5.1
        if (s.run.clientsServed != null) s.run.clientsServed += 1;      // v2.1 R16.3
        acted = true;
      }
      if (Array.isArray(s.run.activeClients)) {
        s.run.activeClients = s.run.activeClients.filter((o) => !o.served);
        // v2.1 FIX: el refill se hace UNA vez al final de la cascada (ver
        // cierre del bucle). Dentro del bucle, los clientes recién dibujados
        // (Math.random) podían auto-servirse en el siguiente eslabón y
        // consumir del board de forma NO determinista.
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
          acted = true;   // v3: sin imanes — el barrido global del próximo eslabón lo cubre
        } else {
          j = k;
        }
      }
    });
    if (!acted) break;
    steps += 1;
  }
  // v2.1 R16.4: refill inmediato — UNA vez al FINAL de la cascada. Los clientes
  // recién llegados quedan visibles para la SIGUIENTE cascada / serveOrder;
  // así la cascada es determinista (el Math.random del draw no re-entra aquí).
  if (Array.isArray(s.run.activeClients)) refillClients(s, rngFallback());
  return { state: s, steps };
}

export function topRunCount(stack) {
  if (!stack || !stack.length) return 0;
  const t = stack[stack.length - 1];
  let n = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i] === t; i--) n++;
  return n;
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
  // v2.1 R16.4: solo cuentan los clientes VISIBLES (activeClients) — en runs
  // viejas sin activeClients (shape v1) se consideran todas las orders.
  const pool = Array.isArray(state.run.activeClients) ? state.run.activeClients : state.run.orders;
  return (pool || []).some((o) =>
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
    // v2.1 R16.4: served/total de la COLA (clientsServed / TOTAL efectivo);
    // en runs viejas sin contadores (shape v1) se derivan de orders.
    served: s.run.clientsServed != null
      ? s.run.clientsServed
      : s.run.orders.filter((o) => o.served).length,
    total: s.run.clientsServed != null ? totalClients(s) : s.run.orders.length,
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
  // v2.1 R17.3 — capacidad: modelo LEVELS (level 0..80; TOTAL = MIN+level)
  if (power === 'capacidad') {
    const level = sk.level || 0;
    const capMax = CONFIG.MAX_CLIENTS - CONFIG.MIN_CLIENTS;   // 80 (R16.1)
    if (level >= capMax) return { error: 'max' };
    const price = CONFIG.CAP_PRICE_BASE * Math.pow(CONFIG.CAP_RATIO, level); // ⚖BALANCE
    if (s.progress.cafeLevel < sk.unlockLevel) return { error: 'locked' }; // R7.1
    if (s.progress.coins < price) return { error: 'noFunds' };             // R7.3
    s.progress.coins -= price;
    s.skills.capacidad.owned = true;
    s.skills.capacidad.level = level + 1;
    return s;
  }
  // v2.3 R7.2 — skills modelo USOS (destroyPile/swapPiles/refreshPool/queueSkip):
  // CADA uso se compra (sin base gratis): la 1ª compra desbloquea y ES el 1er
  // uso (usesBought 0→1); recomprar = +1 uso por partida. openRun repone
  // uses = usesBought. Precio = price * 1.35^usesBought (compras acumuladas).
  {
    const sk2 = s.skills[power];
    // v2.4: tope de usos/partida = MAX_USES_PER_SKILL (5) para destroy/swap/
    // refresh/queueSkip; 'tables' sin ese tope (su capa real = baldosas dormant).
    const cap = power === 'tables' ? Infinity : CONFIG.MAX_USES_PER_SKILL;
    const cost = Math.round(sk2.price * Math.pow(1.35, sk2.usesBought || 0));
    if (s.progress.cafeLevel < sk2.unlockLevel) return { error: 'locked' };  // R7.1
    if ((sk2.usesBought || 0) >= cap) return { error: 'maxUses' };           // v2.4
    if (s.progress.coins < cost) return { error: 'noFunds' };                // R7.3
    s.progress.coins -= cost;
    sk2.usesBought = (sk2.usesBought || 0) + 1;   // la compra ES un uso
    sk2.owned = true;
    sk2.uses = sk2.usesBought;                    // repuesto inmediato
    return s;
  }
}

// ---------------------------------------------------------------------------
// v2.1 R17.1 — useQueueSkip(state): los 3 clientes VISIBLES vuelven al final
// de la cola (run.queueBack, FIFO — re-entran después de los que falten por
// dibujar: queueBack se consume ANTES de dibujar nuevos en refillClients) y
// entran 3 nuevos (draw). NO consume nada más. {error} si uses===0 o !owned.
// ---------------------------------------------------------------------------
export function useQueueSkip(state) {
  const guard = ensureOwnedUses(state, 'queueSkip');
  if (guard) return guard;
  const s = clone(state);
  const old = s.run.activeClients.splice(0, s.run.activeClients.length);
  s.run.queueBack.push(...old);                 // R17.1: al fondo, orden FIFO
  // v2.1 FIX (T17e): drawClientInto MUTA `s` (el caller ya clonó); drawClient
  // es el export PURO (clona y descarta) — no dibujaba nada.
  for (let i = 0; i < 3; i++) drawClientInto(s, Math.random);  // 3 nuevos (R16.3)
  refillClients(s, Math.random);                // edge: cola agotada → re-entran
  s.skills.queueSkip.uses -= 1;
  return s;
}

// ---------------------------------------------------------------------------
// v2.1 R17.2 — MEJORA DE USOS (tienda): cada skill modelo 'uses'
// (destroyPile/swapPiles/refreshPool/queueSkip) puede subir +1 uso por partida.
// Precio = USES_UP_BASE * USES_UP_RATIO^comprasDelSkill (exponencial, sin
// tope — auto-limita). Estructura state.skills[p].usesBought (acumulado).
// openRun repone uses = usesBought (v2.3: cada uso se compra, sin base).
// ---------------------------------------------------------------------------
export function usesUpPrice(state, power) {
  return CONFIG.USES_UP_BASE * Math.pow(CONFIG.USES_UP_RATIO, buysOf(state, power));
}
// comprasDelSkill acumuladas (usesBought) del skill dado
function buysOf(state, power) {
  const sk = state && state.skills && state.skills[power];
  return (sk && sk.usesBought) || 0;
}
export function buyUsesUp(state, power) {
  const sk = state && state.skills && state.skills[power];
  if (!sk) return { error: 'noSkill' };
  if (!CONFIG.USES_SKILLS.includes(power)) return { error: 'noUsesModel' };  // solo modelo 'uses'
  // v2.4: mismo tope que buySkill (5 por partida; tables sin tope 5)
  const cap = power === 'tables' ? Infinity : CONFIG.MAX_USES_PER_SKILL;
  if ((sk.usesBought || 0) >= cap) return { error: 'maxUses' };
  const s = clone(state);
  const cur = s.skills[power];
  if (!cur.owned) return { error: 'locked' };                        // R7.1: mejora lo comprado
  const price = CONFIG.USES_UP_BASE * Math.pow(CONFIG.USES_UP_RATIO, cur.usesBought || 0);
  if (s.progress.coins < price) return { error: 'noFunds' };         // R7.3
  cur.usesBought = (cur.usesBought || 0) + 1;                        // acumulado (sin tope)
  s.progress.coins -= price;
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
  let simBag = clone(r.bag || {});
  const tandas = [];
  for (let i = 0; i < level; i++) {
    const res = drawPoolPiles(rng, simBag, cu);
    tandas.push(res.piles);
    simBag = res.nextBag;
  }
  return tandas;
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

export function useUnlockLocks(state, cellId) {
  const guard = ensureOwnedUses(state, 'unlockLocks');
  if (guard) return guard;
  const s = clone(state);
  const cell = s.run ? s.run.board[cellId] : null;
  if (!cell) return { error: 'noCell' };
  if (!cell.blocked) return { error: 'notBlocked' };                    // R7.8 v2.8
  cell.blocked = false;
  if (cell.hiddenStack && cell.hiddenStack.length) {                    // R8.4 v2: revelar
    cell.stack = (cell.stack || []).concat(cell.hiddenStack);
    delete cell.hiddenStack;
  }
  s.skills.unlockLocks.uses -= 1;
  return s;
}

export function useRefreshPool(state, rng) {
  const guard = ensureOwnedUses(state, 'refreshPool');
  if (guard) return guard;
  const s = clone(state);
  // v2.10 R18: useRefreshPool consume de s.run.bag
  const r = rng || Math.random;
  const cu = poolMaxColor(s.run && s.run.rosterIndex, s.progress.colorsOwned);
  const { piles, nextBag } = drawPoolPiles(r, s.run && s.run.bag, cu);
  s.run.pool = piles;
  s.run.bag = nextBag;
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
  const price = CONFIG.IDLE_PRICE * (cur.level + 1) * (cur.level + 1);  // R9.4 v2.1: level 0 => 1ª compra 50
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
        // v2.1 R17 defaults (cola de clientes / usos mejorados)
        if (!s.skills.queueSkip) s.skills.queueSkip = { owned: false, uses: 0, usesBought: 0 };
        if (!s.skills.capacidad) s.skills.capacidad = { owned: false, level: 0 };
        // v2.2 R14.3 defaults (Activate = skill 'tables' modelo usos)
        if (!s.skills.tables) s.skills.tables = { owned: false, uses: 0, usesBought: 0 };
        // v2.8 R7.8 defaults (Unlock = skill 'unlockLocks' modelo usos)
        if (!s.skills.unlockLocks) s.skills.unlockLocks = { owned: false, uses: 0, usesBought: 0 };
      }
      if (s.run) {
        // v2.1 R16 defaults para runs viejas (pre-cola): migración documentada
        // en DESIGN_DECISIONS §clientes — si la run vieja no tiene
        // activeClients, las primeras 3 orders se toman como VISIBLES y el
        // resto de la run vieja se DESCARTA (no se pre-genera la cola).
        if (!Array.isArray(s.run.activeClients)) {
          const act = (s.run.orders || []).slice(0, 3);
          s.run.orders = act;                                  // resto descartado
          s.run.activeClients = act;
          s.run.clientsDrawn = act.length;
          s.run.clientsServed = act.filter((o) => o.served).length;
          if (s.run.orderSeq == null) s.run.orderSeq = act.length;
        }
        if (s.run.queueBack == null) s.run.queueBack = [];      // R17.1
        if (s.run.mergeSeeds == null) s.run.mergeSeeds = [];    // v2.0 R12.1
        if (s.run.clientsDrawn == null) s.run.clientsDrawn = (s.run.orders || []).length;
        if (s.run.clientsServed == null) {
          s.run.clientsServed = (s.run.orders || []).filter((o) => o.served).length;
        }
        if (s.run.orderSeq == null) s.run.orderSeq = (s.run.orders || []).length;
        if (s.run.rosterIndex == null) s.run.rosterIndex = 5;   // R13.3 v2.1
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