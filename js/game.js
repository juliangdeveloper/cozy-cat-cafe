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
  EXP_STEP: 0.10,                   // R5.2 v2.24: each Tips level doubles the old 0.05 jump
  MULT_PRICE_BASE: 100,             // R5.2 historical list price; live tips use 40×1.6^n
  MULT_MAX: 6,                      // retired as a purchase cap in v2.22.4 (tips are unlimited)
  CALAMITY_BONUS_PER: 15,           // R5.3 / R8.5 bonus per calamity cell
  CALAMITY_MIN_FRAC: 1 / 5,         // R8.2 lo
  CALAMITY_MAX_FRAC: 1 / 3,         // R8.2 hi
  CALAMITY_THRESHOLD: 15,           // R8.1 only if boardCells > 15
  BLOCK_PROB: 0.5,                  // R8.3 ~50% blocked / ~50% prestockated
  USES_SKILLS: ['destroyPile', 'swapPiles', 'refreshPool', 'queueSkip', 'unlockLocks'], // v2.3 R7.2: skills modelo USOS (v2.8 += unlockLocks R7.8). v2.20: tables ya no es skill de usos.
  MAX_USES_PER_SKILL: 5,            // retired v2.22.4: no per-skill use ceiling is enforced
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
  RUN_TILE_BASE: 40,                // R14.3 runTilePrice = BASE * RATIO^runTilesActivated (se resetea cada run)
  RUN_TILE_RATIO: 1.6,              // R14.3 curva temporal por partida; no hay tienda permanente (2026-10-06)
  // v2.22 / v2.22.4 — cada skill se paga al usarla. Siguiente precio =
  //   SKILL_USE_BASE * SKILL_USE_RATIO^n = 40 × 1.6^n (producto exacto)
  // n = usos de ESA skill en esta run (se pone a 0 al abrir/reiniciar).
  // Misma base y misma razón para todas salvo Clear board: Destroy/Swap/
  // Refresh/Unlock/Queue/Undo (skillUses), Tables (runTilesActivated),
  // Color (colorsOwned−4), Tips (multLevel), Board/Peek (previewPool.level).
  // Sin techo.
  SKILL_USE_BASE: 40,
  SKILL_USE_RATIO: 1.6,
  // v2.24 — Clear board no usa SKILL_USE_BASE. Precio = 10000 × 1.6^n.
  CLEAR_BOARD_BASE: 10000,
  MAX_COLORS: 10,                   // R13.7 10 colores / criaturas en el ROSTER (R13.2)
  // v2.23 — cada run sortea este subconjunto del roster. El desbloqueo
  // gradual (bolsa, rosterIndex, colorsOwned) vive DENTRO de esos 7.
  // MAX_COLORS sigue siendo el roster completo; no es el techo de la run.
  RUN_COLORS: 7,
  RUN_HISTORY_MAX: 20,              // últimas runs terminadas en el save
  DEBRIS_THRESHOLD: 10,             // v2 escombros: umbral para entrar en tablero
  DEBRIS_BONUS_PER: 25,             // v2 escombros: bonus por escombro limpiado
  CASCADE_STEP_MS: 600,             // v2.2.1: ms entre eslabones (antes 1600 — muy lento para seguir el orden)
  TABLES_HOLD_MS: 550,              // v2.17: press-and-hold Tables → batch activateAroundUnlocked
  CLOSE_HOLD_MS: 3000,              // Hold 3s restarts the run; coins do not carry over
  TABLES_ACTIVATE_MIN_NEIGHBORS: 2, // v2.17 R14.6: unlock requires ≥2 already-unlocked neighbors
  PREVIEW_PRICE: 80,                // historical; v2.22.4 peek price is skillUsePrice (40×1.6^level)
  PILE_SIZE_WEIGHTS: [9, 8, 7, 6, 5, 4, 3], // v2.9 R3.1: peso del tamaño 1..7 —
                                    // menos fichas más común pero SUTIL (7 sigue
                                    // saliendo ~7%): P = peso/42 ⇒ 21/19/17/14/12/10/7%
  // v2.10 — R18 Bolsita de pool (rachas y transiciones suaves)
  BAG_INITIAL_COLORS: 4,            // R18.2 cantidad de colores iniciales en la bolsa
  BAG_INITIAL_MIN: 7,               // R18.2 puñado inicial mín por color
  BAG_INITIAL_MAX: 18,              // R18.2 puñado inicial máx por color
  BAG_RELOAD_MIN: 7,                // R18.4 recarga mín al agotarse un color
  BAG_RELOAD_MAX: 18,               // R18.4 recarga máx al agotarse un color
  // v2.21 — la partida es SIEMPRE 100 clientes. El dial v2.5 (20 + capacidad, tope 60)
  // queda retirado: capacidad no suma N (el objetivo de diseño es 100 y nada persiste).
  TOTAL_CLIENTS: 100,               // R16.1 v2.21
  MIN_CLIENTS: 100,                 // alias del total fijo (antes 20)
  MAX_CLIENTS: 100,                 // anula el dial v2.5 de 60
  // Tamaños de pedido (v2.21). Base 3, rampa hacia 10 a lo largo de la run.
  // 5 y 8 entran desde el primer cliente. El 10 es legendario: ~1 cada N
  // clientes normales, como máximo uno por color, disponible desde el inicio.
  ORDER_QTY_BASE: 3,
  ORDER_QTY_EARLY: [3, 5, 8],
  ORDER_QTY_RAMP_TO: 9,             // los normales se acercan a 10; el 10 es legendario
  ORDER_LEGENDARY_QTY: 10,
  ORDER_LEGENDARY_EVERY: 10,        // probabilidad 1/N en cada cliente, mientras el color tenga cupo
  ORDER_LEGENDARY_PER_COLOR: 1,
  // Segunda oleada de calamidades cuando quedan ~estos clientes (una vez por run).
  CALAMITY_WAVE2_REMAINING: 20,
  CALAMITY_PLAYABLE_GOAL: 16,       // la barra de la 1ª oleada llena hacia 16 jugables (dispara al pasar de 15)
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
      econ: { multLevel: 0 },
    },
    economy: { multLevel: 0 },
    skills: {
      destroyPile: { owned: false, uses: 0, usesBought: 0, price: 250, unlockLevel: 5 },
      swapPiles:   { owned: false, uses: 0, usesBought: 0, price: 120, unlockLevel: 3 },
      refreshPool: { owned: false, uses: 0, usesBought: 0, price: 40,  unlockLevel: 1 },
      // previewPool: modelo LEVELS (owned + level, sin tope, SIN uses). v2.22.4
      // v2.22.2: auto-serve is always on. There is no serveManual / Waiter skill.
      previewPool: { owned: false, level: 0, price: 80, unlockLevel: 1 },
      // v2.1 R17.1 — queueSkip: modelo USES (R7.4) — los 3 visibles van al
      // fondo de la cola y entran 3 nuevos. R17.2: usesBought (mejora de usos).
      queueSkip: { owned: false, uses: 0, usesBought: 0, price: 100, unlockLevel: 1 },
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
    // v2.21: epoch marca un save de esta versión (la run en curso puede
    // recargarse). Un blob sin epoch es meta vieja: se descarta al cargar.
    // New games start with seenTutorial false so the spotlight can run once.
    // A finished flag is not cleared here, on restart, or when an old save loads.
    settings: { reducedMotion: false, seenTutorial: false, boardRot: 0, epoch: 21 },
    // v2.23 — historial compacto de runs terminadas. Sobrevive al reinicio
    // (restartRun lo copia). El mute sigue fuera de este blob.
    runHistory: [],
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

// v2.17 R14.6 — nº de vecinos YA desbloqueados (dormant===false) de una celda.
// Las celdas blocked del núcleo/activadas cuentan: son mesas desbloqueadas.
export function unlockedNeighborCount(state, cell) {
  const board = state && state.run && state.run.board;
  if (!board || !cell) return 0;
  let n = 0;
  for (const other of board) {
    if (!other || other.dormant) continue;
    if (isHexAdjacent(cell, other)) n += 1;
  }
  return n;
}

// v2.17 — elegible para activateTile / hold-batch: dormant, no blocked, ≥2 unlocked neighbors.
export function isActivateEligible(state, cell) {
  if (!cell || !cell.dormant || cell.blocked) return false;
  return unlockedNeighborCount(state, cell) >= (CONFIG.TABLES_ACTIVATE_MIN_NEIGHBORS || 2);
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
// { id, q, r, stack, blocked, calamity, dormant }. En el juego n SIEMPRE es 36
// (rectángulo 6×6 pointy: 6 filas axiales de 6 = 36 celdas, R14.1 v2.14).
// Las celdas nacen dormant:true (visibles pero apagadas) salvo el núcleo 2-3-2
// (7 celdas, mismas coords que initialHexCells) que queda jugable (dormant:false).
// ---------------------------------------------------------------------------
export function generateBoard(n, rng) {
  const size = n || 36;
  const core = new Set(initialHexCells().map((c) => `${c.q},${c.r}`));
  const board = [];
  let id = 0;
  // RECTÁNGULO 6×6 pointy (R14.1 v2.14): 6 filas axiales de 6 = 36 celdas,
  // contorno rectangular tipo marco de Catan con offset de panal. En columna
  // plegada col = q + floor(r/2) las 6 filas cubren el MISMO patrón consecutivo
  // -3..2 (qStart + floor(r/2) constante = -3) — así lo exige el contrato del
  // rectángulo (T14a):
  //   r=-2/-1: q -2..3   r=0/1: q -3..2   r=2/3: q -4..1
  // El núcleo 2-3-2 (7 celdas, initialHexCells) queda dentro y jugable.
  const ROWS = [ // [r, qStart, width] — RECTÁNGULO 6×6 pointy (36 celdas)
    [-2, -2, 6],
    [-1, -2, 6],
    [0, -3, 6],
    [1, -3, 6],
    [2, -4, 6],
    [3, -4, 6],
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
export function playableTables(state) {
  const board = state && state.run && state.run.board;
  if (!Array.isArray(board)) return 0;
  return board.filter((c) => c && !c.dormant && !c.blocked).length;
}

// Rango compartido por las dos oleadas: [ceil(p/5), max(floor(p/3), lo)].
function calamitySpan(jugables) {
  const lo = Math.ceil(jugables * CONFIG.CALAMITY_MIN_FRAC);
  const hi = Math.max(Math.floor(jugables * CONFIG.CALAMITY_MAX_FRAC), lo);
  return { lo, hi };
}

// Muta `s` (el caller ya clonó). Misma mezcla de tipos que la 1ª oleada:
// pila oculta en dormant, 50% candado con pila oculta, 50% pila encima.
// Devuelve el count sorteado (no el nº de celdas, igual que la oleada 1).
function stampCalamityBurst(s, r) {
  const jugables = playableTables(s);
  const { lo, hi } = calamitySpan(jugables);
  const count = jugables <= 0 ? 0 : rngInt(r, lo, hi);
  if (count <= 0) return 0;
  const cu = poolMaxColor(s.run.rosterIndex, s.progress.colorsOwned);
  const pool = s.run.board.filter((c) => c && !c.calamity);
  const idxs = pickDistinct(r, pool.length, count);
  for (const i of idxs) {
    const cell = pool[i];
    cell.calamity = true;
    if (cell.dormant) {
      const color = rngInt(r, 1, cu);
      cell.hiddenStack = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.calamityStack = false;
      continue;
    }
    if (r() < CONFIG.BLOCK_PROB) {
      cell.blocked = true;
      cell.calamityStack = false;
      const color = rngInt(r, 1, cu);
      cell.hiddenStack = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.stack = [];
    } else {
      const color = rngInt(r, 1, cu);
      const add = Array.from({ length: rngInt(r, 1, 3) }, () => color);
      cell.stack = (cell.stack || []).concat(add);
      cell.calamityStack = true;
    }
  }
  return count;
}

export function applyCalamities(state, rng) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return s;
  if (s.run.calamitiesApplied) return s;                    // una sola vez por partida
  const r = rng || Math.random;
  // v2.8 R8.1: el UMBRAL y el RANGO siguen contando JUGABLES (>15), pero el
  // pool de SELECCIÓN son TODAS las celdas (jugable/dormant/blocked) sin
  // calamidad previa — las dormant reciben pila oculta revelable.
  const jugables = playableTables(s);
  if (jugables <= CONFIG.CALAMITY_THRESHOLD) return s;      // R8.1/R14.5 solo jugables > 15
  const count = stampCalamityBurst(s, r);
  s.run.calamities = count;                                 // R8.2 anotar (R8.5 bonus)
  s.run.calamitiesApplied = true;
  return s;
}

// v2.21 — segunda oleada, una vez por run, cuando quedan
// <= CALAMITY_WAVE2_REMAINING clientes. Mismos tipos y mismo rango sobre
// las jugables de ese momento. Suma a run.calamities (el bonus sigue siendo
// 15 por calamidad, oleadas incluidas).
export function applyCalamityWave2(state, rng) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return s;
  if (s.run.calamityWave2Applied) return s;
  const remaining = totalClients(s) - (s.run.clientsServed || 0);
  if (remaining > CONFIG.CALAMITY_WAVE2_REMAINING) return s;
  const r = rng || Math.random;
  const count = stampCalamityBurst(s, r);
  s.run.calamities = (s.run.calamities || 0) + count;
  s.run.calamityWave2Applied = true;
  return s;
}

// Barra de la PRÓXIMA calamidad. Oleada 1: jugables / 16. Oleada 2: clientes
// servidos hacia el punto en que quedan ~20. Tras las dos, progress 1.
export function calamityForecast(state) {
  const run = state && state.run;
  const served = (run && run.clientsServed) || 0;
  const total = totalClients(state);
  const wave2At = Math.max(1, total - CONFIG.CALAMITY_WAVE2_REMAINING);
  if (!(run && run.calamitiesApplied)) {
    const playable = playableTables(state);
    const goal = CONFIG.CALAMITY_PLAYABLE_GOAL;
    return { wave: 1, progress: Math.min(1, playable / goal), current: playable, goal, done: false };
  }
  if (!run.calamityWave2Applied) {
    return { wave: 2, progress: Math.min(1, served / wave2At), current: served, goal: wave2At, done: false };
  }
  return { wave: 0, progress: 1, current: served, goal: wave2At, done: true };
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

// v2.21 — la partida sirve TOTAL_CLIENTS (100). capacidad ya no altera N.
export function totalClients(state) {
  void state;
  return CONFIG.TOTAL_CLIENTS;
}

// v2.1 — victoria de la partida en curso [R16.4]: clientsServed >= TOTAL.
// Helper para el renderer (checkServedAll) — expone el gate v2.1.
export function runVictory(state) {
  if (!state || !state.run) return false;
  return (state.run.clientsServed || 0) >= totalClients(state);
}

// v2.23 — techo de criaturas de ESTA run. Con palette, es su largo (7).
// Una run vieja sin palette conserva MAX_COLORS (10) para no reescribir fichas.
function rosterCeiling(run) {
  const p = run && run.palette;
  if (Array.isArray(p) && p.length) return p.length;
  return CONFIG.MAX_COLORS;
}

// v2.1 helper (R16.2) + v2.23: tope = min(colorsOwned+1, techo de la run).
// Con colorsOwned=4 y palette de 7 el roster arranca (y se estanca) en 5.
// Comprar colores sube el tope hasta el subconjunto, no hasta 11 ni hasta 10
// si la run solo trajo 7. colorsOwned puede pasar de 7 (precio sin tope);
// el roster no.
function rosterMax(colorsOwned, ceiling) {
  const cap = ceiling == null ? CONFIG.MAX_COLORS : ceiling;
  return Math.min((colorsOwned || 0) + 1, cap);
}

// v2.23 — sorteo de RUN_COLORS criaturas distintas del ROSTER (ids 1..10),
// en orden de desbloqueo de la run. Fisher-Yates con el rng de la run.
export function pickRunPalette(rng) {
  const r = rng || Math.random;
  const all = [];
  for (let i = 1; i <= ROSTER.length; i++) all.push(i);
  for (let i = all.length - 1; i > 0; i--) {
    const j = rngInt(r, 0, i);
    const tmp = all[i];
    all[i] = all[j];
    all[j] = tmp;
  }
  const k = Math.min(CONFIG.RUN_COLORS, all.length);
  return all.slice(0, k);
}

// Índice lógico 1..k de la run → id de criatura del roster. Sin palette
// (save viejo) el índice lógico ES la criatura.
export function runFaceColor(state, logical) {
  const pal = state && state.run && state.run.palette;
  const n = logical | 0;
  if (!Array.isArray(pal) || !pal.length || n < 1 || n > pal.length) return n;
  return pal[n - 1];
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

// R18.2: inicializar bolsa con 4 colores (o cu si cu < 4) y puñados 7..18
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
// v2.21 R16 — cola de clientes LAZY. El cliente ES un pedido flotante
// {id, color, qty, served:false} SIN celda. El tamaño sale de rollOrderQty
// (base 3, rampa hacia 10, 5 y 8 desde el inicio, legendario 10 con cupo).
// Se DIBUJA al servir (llegada perezosa): color uniforme 1..rosterIndex —
// puede pedir un color por encima de colorsOwned (presión R13.5).
// NO se pre-generan los 100: contadores run.clientsDrawn / run.clientsServed.
// v2.21 — tamaño de pedido. Puro: no muta legendaries (el caller anota el cupo).
// Al inicio el centro es ORDER_QTY_BASE y el sorteo incluye ORDER_QTY_EARLY
// (3, 5 y 8). El centro sube hacia ORDER_QTY_RAMP_TO con clientsDrawn.
// Legendario (qty 10): probabilidad 1/ORDER_LEGENDARY_EVERY si ese color
// todavía no llegó a ORDER_LEGENDARY_PER_COLOR. El cupo no consume rng.
export function rollOrderQty(state, color, rng) {
  const r = rng || Math.random;
  const legends = (state && state.run && state.run.legendaries) || {};
  const have = legends[color] || 0;
  const cap = CONFIG.ORDER_LEGENDARY_PER_COLOR;
  const every = CONFIG.ORDER_LEGENDARY_EVERY || 10;
  if (have < cap && r() < 1 / every) {
    return { qty: CONFIG.ORDER_LEGENDARY_QTY, legendary: true };
  }
  const drawn = (state && state.run && state.run.clientsDrawn) || 0;
  const span = Math.max(1, totalClients(state) - 1);
  const t = Math.min(1, drawn / span);
  const base = CONFIG.ORDER_QTY_BASE;
  const rampTo = CONFIG.ORDER_QTY_RAMP_TO;
  const center = base + (rampTo - base) * t;
  const early = CONFIG.ORDER_QTY_EARLY || [base];
  const hi = Math.max(base, Math.round(center));
  const set = new Set(early);
  for (let q = base; q <= hi; q++) set.add(q);
  const sizes = [...set].filter((q) => q !== CONFIG.ORDER_LEGENDARY_QTY).sort((a, b) => a - b);
  const weights = sizes.map((size) => {
    const dist = Math.abs(size - center);
    const floor = early.includes(size) ? 0.35 : 0;
    return floor + 1 / (1 + dist * dist);
  });
  let x = r() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < sizes.length; i++) {
    x -= weights[i];
    if (x < 0) return { qty: sizes[i], legendary: false };
  }
  return { qty: sizes[sizes.length - 1], legendary: false };
}

// helper interno (muta s — el caller ya clonó): dibuja 1 cliente si la cola
// tiene pendientes (clientsDrawn < TOTAL). Retorna true si dibujó.
function drawClientInto(s, r) {
  const total = totalClients(s);
  if ((s.run.clientsDrawn || 0) >= total) return false;    // cola agotada
  const roster = s.run.rosterIndex || 1;
  const color = rngInt(r, 1, Math.max(1, roster));
  if (!s.run.legendaries || typeof s.run.legendaries !== 'object') s.run.legendaries = {};
  const rolled = rollOrderQty(s, color, r);
  if (rolled.legendary) s.run.legendaries[color] = (s.run.legendaries[color] || 0) + 1;
  const order = {
    id: `ord-${s.run.orderSeq != null ? s.run.orderSeq++ : (s.run.clientsDrawn || 0)}`,
    color,
    qty: rolled.qty,
    legendary: !!rolled.legendary,
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
  const board = generateBoard(36, r);                            // R14.1 board dual 36 (rectángulo 6×6 pointy, v2.14)
  // v2.23: 7 de las 10 criaturas, fijas para esta run. El arranque sigue
  // en 5 activos / pool de colorsOwned (no se vuelcan las 7 de golpe).
  const palette = pickRunPalette(r);
  const rosterIdx = Math.min(5, rosterMax(s.progress.colorsOwned, palette.length)); // R13.3 v2.1: 5 tipos activos
  const cu = poolMaxColor(rosterIdx, s.progress.colorsOwned);
  const initialBag = initBag(r, cu);                               // R18.2 bolsita inicial
  const { piles, nextBag } = drawPoolPiles(r, initialBag, cu);    // R18.5
  s.run = {
    phase: 'open', board,
    orders: [], activeClients: [],                                 // v2.1 R16.2 clientes = pedidos flotantes
    pool: piles,
    bag: nextBag,                                                  // v2.10 R18
    poolPlaced: 0, calamities: 0,
    calamitiesApplied: false,                                      // R14.5 oleada 1, una vez por partida
    calamityWave2Applied: false,                                   // v2.21 oleada 2, una vez por partida
    legendaries: {},                                               // v2.21 cupo de pedidos de 10 por color
    rosterIndex: rosterIdx,
    palette,                                                       // v2.23: 7 criaturas de esta run, orden de desbloqueo
    moneyStacks: 0,                                                // servir + escombros que pagaron
    pilesDealt: piles.length,                                      // pilas repartidas para colocar
    placedCounter: 0,                                              // R13.4
    runTilesActivated: 0,                                          // R14.3 precio ×1.6; se resetea con la run
    skillUses: {},                                                 // v2.22 usos pagados esta run (precio ×1.6)
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
  rememberUndo(s);
  cell.stack = cell.stack.concat(pileArr);          // R3.4 apila al tope
  // v2.11 R12.4: pila MONOCOLOR marca el ANCLA del jugador — durante la
  // cascada que dispara esta colocación, todo grupo que contenga esta celda
  // drena HACIA ella. Multicolor no ancla (árbitro T1/R2 normal).
  s.run.anchor = (pileArr.length > 0 && pileArr.every((c) => c === pileArr[0])) ? cellId : null;
  // v2.12 R12.4c: pila MULTICOLOR activa el IMÁN MONOCOLOR — durante su
  // cascada, todo grupo con una celda puramente monocolor la elige destino.
  if (!s.run.anchor && pileArr.length > 1) s.run.monoSink = true;
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
  rememberUndo(s);
  const pile = s.run.pool[idx];
  cell.stack = cell.stack.concat(pile);      // R3.4 / R4.2 stack on top
  s.run.pool[idx] = [];
  s.run.poolPlaced += 1;
  // v2.11 R12.4: ancla del jugador — solo pila MONOCOLOR del tray.
  s.run.anchor = (pile.length > 0 && pile.every((c) => c === pile[0])) ? cellId : null;
  // v2.12 R12.4c: pila MULTICOLOR del tray activa el imán monocolor.
  if (!s.run.anchor && pile.length > 1) s.run.monoSink = true;
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
      const cap = rosterMax(s.progress.colorsOwned, rosterCeiling(s.run));
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
      s.run.pilesDealt = (s.run.pilesDealt || 0) + piles.length;
    } else {
      s.run.pool = buildPick(rng, 3, s.progress.colorsUnlocked);
      s.run.pilesDealt = (s.run.pilesDealt || 0) + s.run.pool.length;
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
  // v2.22.4: sin tope de compra. El roster sigue en MAX_COLORS para generar
  // fichas; colorsOwned puede pasar de 10 y el precio sigue 40×1.6^n.
  const price = colorPrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s }; // sin mutar
  s.progress.colorsOwned += 1;
  s.progress.coins -= price;
  return s;
}

// ---------------------------------------------------------------------------
// v2.20 — Economía de baldosas (R14.3, Julian 2026-10-06).
// Una sola curva, TEMPORAL por partida:
//   runTilePrice = RUN_TILE_BASE * RUN_TILE_RATIO^runTilesActivated
//                = 40 * 1.6^n
// Activar cobra ese precio en monedas y suma 1 a runTilesActivated (la
// siguiente baldosa de la misma run cuesta ×1.6). openRun regenera el
// tablero y pone runTilesActivated = 0, así que precio, contador y mesas
// activadas vuelven al inicio. No hay techo permTiles ni compra permanente.
//
// Reconciliación con el modelo USES (v2.2–v2.19): la skill `tables` gastaba
// usos comprados en tienda y runTilePrice era 0. Esa bolsa no sobrevive a
// la run; el gesto (tap / hold, vecinos R14.6) se queda, y cada activación
// se paga con la curva de monedas.
// ---------------------------------------------------------------------------
export function runTilePrice(state) {
  return skillUsePrice(state, 'tables');
}

// v2.22 — bolsa de usos pagados. Vive en la run (se tira al reiniciar).
// Sin run (tests que compran antes de abrir) cae en state.skillUses.
function skillUseBag(state) {
  if (state && state.run) return state.run.skillUses || null;
  return (state && state.skillUses) || null;
}

export function skillUseCount(state, power) {
  // One use-count per skill this run. Domain counters ARE the uses:
  // color purchases, tip levels, peek levels, tables activated.
  if (power === 'color') {
    const owned = (state && state.progress && state.progress.colorsOwned) || 4;
    return Math.max(0, owned - 4);
  }
  if (power === 'tips') {
    return (state && state.progress && state.progress.econ && state.progress.econ.multLevel) || 0;
  }
  if (power === 'previewPool') {
    return (state && state.skills && state.skills.previewPool && state.skills.previewPool.level) || 0;
  }
  if (power === 'tables') {
    return (state && state.run && state.run.runTilesActivated) || 0;
  }
  const bag = skillUseBag(state);
  return (bag && bag[power]) || 0;
}

export function skillUsePrice(state, power) {
  const n = skillUseCount(state, power);
  // Exact base × 1.6^n. Rounding the product changes the ratio (102
  // instead of 102.4) and can skip a table the player could still afford.
  // Clear board is the one skill with its own base (10000, not 40).
  const base = power === 'clearBoard' ? CONFIG.CLEAR_BOARD_BASE : CONFIG.SKILL_USE_BASE;
  return base * CONFIG.SKILL_USE_RATIO ** n;
}

// One level of undo. The snapshot is the whole café immediately before the
// last undoable action, with no nested snapshot. Undo restores that café
// (the action's coins come back) and only then subtracts the Undo fee.
function rememberUndo(s) {
  if (!s || !s.run) return;
  delete s.run.undoSnap;
  s.run.undoSnap = clone(s);
}

// Funds check, then snapshot, then charge. The snapshot must precede the
// charge so Undo refunds this action before taking its own fee.
function chargeUndoable(s, power) {
  const price = skillUsePrice(s, power);
  if ((s.progress.coins || 0) < price) return { error: 'noFunds' };
  rememberUndo(s);
  return chargeSkill(s, power);
}

// Cobra el precio actual y anota el uso. No muta si no alcanza.
// `s` ya es un clone del caller.
function chargeSkill(s, power) {
  const price = skillUsePrice(s, power);
  if ((s.progress.coins || 0) < price) return { error: 'noFunds' };
  s.progress.coins -= price;
  if (s.run) {
    if (!s.run.skillUses) s.run.skillUses = {};
    s.run.skillUses[power] = (s.run.skillUses[power] || 0) + 1;
  } else {
    if (!s.skillUses) s.skillUses = {};
    s.skillUses[power] = (s.skillUses[power] || 0) + 1;
  }
  return null;
}

export function colorPrice(state) {
  return skillUsePrice(state, 'color');
}

export function tipPrice(state) {
  return skillUsePrice(state, 'tips');
}

// v2.23 — una frase para el hold de Tips. Usa pay() real: cada nivel suma
// EXP_STEP al exponente. El ejemplo es un pedido de tamaño 8 (sale desde
// el inicio). No inventa otra curva.
export function tipSkillLine(state, qty = 8) {
  const n = skillUseCount(state, 'tips');
  const order = { qty };
  const extra = pay(order, n + 1) - pay(order, n);
  const step = CONFIG.EXP_STEP.toFixed(2);
  return `Each level adds ${step} to the pay exponent. A size-${qty} order pays ${extra} more coins.`;
}

export function previewPrice(state) {
  return skillUsePrice(state, 'previewPool');
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
  // v2.17 R14.6: solo si toca ≥2 mesas ya desbloqueadas (núcleo inicial ya
  // desbloqueado; primeras expansiones = anillos mid-edge del radio 2).
  if (!isActivateEligible(s, cell)) return { error: 'needTwoNeighbors', state: s };
  // R14.3 v2.20: cobra la curva temporal. Sin usos ni techo permanente.
  const price = runTilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s };
  rememberUndo(s);
  cell.dormant = false;                                // activa ESTA partida
  // v2.8 R8.1: revelar pila de calamidad oculta en baldosas (si la hay)
  if (cell.hiddenStack && cell.hiddenStack.length) {
    cell.stack = (cell.stack || []).concat(cell.hiddenStack);
    delete cell.hiddenStack;
  }
  s.run.runTilesActivated = (s.run.runTilesActivated || 0) + 1;
  s.progress.coins -= price;
  // R14.5: al activar puede cruzarse el umbral de JUGABLES (> 15) — las
  // calamidades entran UNA sola vez por partida (flag run.calamitiesApplied;
  // applyCalamities es no-op si ya aplicaron o si no se cruzó el umbral).
  s = applyCalamities(s, rng);
  return s;
}

// ---------------------------------------------------------------------------
// v2.17 R14.3b — activateAroundUnlocked(state, rng): batch del hold-Tables.
// Snapshot de elegibles al INICIO: dormant + vecinas del set desbloqueado
// actual + ≥2 vecinos desbloqueados (R14.6). Orden estable = índice de board
// ascendente. Activa en serie vía activateTile (cada una paga ×1.6). El set
// desbloqueado no crece mid-batch. Para si no alcanza el saldo (noFunds).
// ---------------------------------------------------------------------------
export function activateAroundUnlocked(state, rng) {
  let s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return { error: 'noRun', state: s };
  // Snapshot: vecinos del set desbloqueado AHORA (no crece mid-batch).
  const unlocked = s.run.board.filter((c) => c && !c.dormant);
  const candidates = [];
  s.run.board.forEach((c, i) => {
    if (!c || !c.dormant || c.blocked) return;
    if (!unlocked.some((u) => isHexAdjacent(c, u))) return; // around unlocked set
    if (!isActivateEligible(s, c)) return;                  // R14.6 ≥2
    candidates.push(i);
  });
  candidates.sort((a, b) => a - b); // board-scan order
  if (!candidates.length) return { error: 'noneEligible', state: s };
  const activated = [];
  let stoppedFunds = false;
  for (const idx of candidates) {
    const res = activateTile(s, idx, rng);
    if (res && res.error === 'noFunds') { stoppedFunds = true; break; }
    if (res && res.error) continue; // skip if somehow ineligible after prior
    s = res;
    activated.push(idx);
  }
  if (!activated.length) {
    return { error: stoppedFunds ? 'noFunds' : 'noneEligible', state: s };
  }
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
  rememberUndo(s);
  // consume exactly order.qty pieces from the top (they are all order.color)
  cell.stack.splice(cell.stack.length - order.qty, order.qty);            // R4.3 v2
  order.served = true;
  const amount = pay(order, s.economy.multLevel);                          // R5.1
  s.progress.coins += amount;
  if (amount > 0) s.run.moneyStacks = (s.run.moneyStacks || 0) + 1;
  // v2.1 R16.3/R16.4: al servir un VISIBLE → clientsServed+1 y entra el
  // siguiente de la cola (queueBack primero, luego draw si clientsDrawn<TOTAL).
  if (run.clientsServed != null && Array.isArray(run.activeClients)) {
    run.clientsServed += 1;
    run.activeClients = run.activeClients.filter((o) => o !== order);
    refillClients(s, rngFallback());
  }
  return applyCalamityWave2(s, rngFallback());
}

// v2.1: rng de refill — serveOrder no recibe rng (firma v1/v2 estable); el
// sorteo de clientes es el único uso no inyectado y SOLO afecta al color/qty
// del siguiente cliente (nunca a pagos ni merges). Documentado en R11.2 ⚠.
function rngFallback() { return Math.random; }

// ---------------------------------------------------------------------------
// sweepDebrisRuns(board, progress) — v2.17 R12.3: destruye runs contiguas
// >= DEBRIS_THRESHOLD en TODAS las celdas; coins += DEBRIS_BONUS_PER * qty.
// Retorna índices de celdas tocadas. NO reentra merge: se llama SOLO tras
// estabilizar merges/auto-serves de la acción del jugador.
// ---------------------------------------------------------------------------
export function sweepDebrisRuns(board, progress) {
  const hit = [];
  if (!Array.isArray(board)) return hit;
  board.forEach((c, i) => {
    if (!c || !c.stack || !c.stack.length) return;
    const st = c.stack;
    let j = 0;
    let touched = false;
    while (j < st.length) {
      let k = j;
      while (k < st.length && st[k] === st[j]) k++;
      const runLen = k - j;
      if (runLen >= CONFIG.DEBRIS_THRESHOLD) {
        st.splice(j, runLen);
        if (progress) progress.coins += CONFIG.DEBRIS_BONUS_PER * runLen;
        hit.stacks = (hit.stacks || 0) + 1;
        touched = true;
      } else {
        j = k;
      }
    }
    if (touched) hit.push(i);
  });
  return hit;
}

// ---------------------------------------------------------------------------
// resolveCascade(state) [R12.2 / v2.17] — PURA: clona, itera eslabones hasta
// estabilizar y retorna { state, steps }. Eslabón: (i) merge (R12.1); (ii)
// auto-servir flotantes SIEMPRE (v2.22.2: no hay toggle). Tras estabilizar merges/serves:
// (iii) sweepDebrisRuns — umbral 10+ SOLO al final de la cadena (las pilas 10+
// permanecen durante merges para seguir participando). Estable => steps 0.
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
        // v2.12: árbitro T1/R2 extraído (rama sin ancla/imán)
        const arbiterTarget = (tg) => {
          const plan = computeBestChain(s.run.board);              // T1
          const step = plan.find((p) => p.color === tg.color
            && p.source.every((si) => group.includes(si)));
          if (step && group.includes(step.target)) return step.target;
          return r2Target(s.run.board, group, tg.color, received); // R2
        };
        let target;
        // v2.11 R12.4: ANCLA DEL JUGADOR — si el grupo contiene la celda donde
        // el jugador colocó una pila monocolor, el destino SIEMPRE es el ancla
        // (los vecinos drenan hacia su baldosa). Grupos sin ancla: árbitro T1/R2.
        // v2.12 R12.4c: IMÁN MONOCOLOR — con colocación multicolor, si el grupo
        // contiene celda(s) PURAMENTE monocolor (stack entero = un color), el
        // destino es la pura MÁS ALTA (tie: menor índice). Prioridad: ancla >
        // imán > T1/R2 (una colocación es mono O multi: nunca coexisten).
        if (s.run.anchor != null && group.includes(s.run.anchor)) {
          target = s.run.anchor;
        } else if (s.run.monoSink) {
          const pures = group.filter((gi) => {
            const st = s.run.board[gi].stack;
            return st.length > 0 && st.every((c) => c === st[0]);
          });
          if (pures.length > 0) {
            pures.sort((a, b2) =>
              s.run.board[b2].stack.length - s.run.board[a].stack.length || a - b2);
            target = pures[0];
          } else {
            target = arbiterTarget(tg);
          }
        } else {
          target = arbiterTarget(tg);
        }
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
    const visible = Array.isArray(s.run.activeClients) ? s.run.activeClients : s.run.orders;
    if (Array.isArray(visible)) {
      for (const order of visible) {
        if (!order || order.served) continue;                           // R15.2
        if (order.cell !== null && order.cell !== undefined) continue;  // flotantes (cell null/absent)
        const idx = bestServeCell(s.run.board, order);
        if (idx < 0) continue;
        const cell = s.run.board[idx];
        cell.stack.splice(cell.stack.length - order.qty, order.qty);   // exacto
        order.served = true;
        const servedPay = pay(order, s.economy.multLevel);            // R5.1
        s.progress.coins += servedPay;
        if (servedPay > 0) s.run.moneyStacks = (s.run.moneyStacks || 0) + 1;
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
    // v2.17: SIN destrucción umbral aquí — las pilas 10+ siguen en tablero
    // para participar en merges posteriores de ESTA cadena.
    if (!acted) break;
    steps += 1;
  }
  // (iii) v2.17 R12.3 — barrido de escombros SOLO tras estabilizar merges/serves
  if (s.run && Array.isArray(s.run.board)) {
    const hit = sweepDebrisRuns(s.run.board, s.progress);
    if (hit.length) steps += 1;
    if (hit.stacks) s.run.moneyStacks = (s.run.moneyStacks || 0) + hit.stacks;
  }
  // v2.1 R16.4: refill inmediato — UNA vez al FINAL de la cascada. Los clientes
  // recién llegados quedan visibles para la SIGUIENTE cascada / serveOrder;
  // así la cascada es determinista (el Math.random del draw no re-entra aquí).
  if (Array.isArray(s.run.activeClients)) refillClients(s, rngFallback());
  if ('anchor' in s.run) delete s.run.anchor;   // v2.11 R12.4: el ancla vive SOLO durante su cascada (pureza: no dejar null en estados sin ancla)
  if ('monoSink' in s.run) delete s.run.monoSink; // v2.12 R12.4c: el imán vive SOLO durante su cascada
  // v2.21: la 2ª oleada entra en el mismo momento en que el servicio cruza
  // el umbral de clientes restantes (una vez; no-op si aún no toca).
  const waved = applyCalamityWave2(s, rngFallback());
  return { state: waved, steps };
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
  // v2.20: activar mesas no se compra. Un save viejo puede traer skills.tables
  // hasta que deserialize lo suelte; igual no se vende.
  if (power === 'tables' || power === 'serveManual') return { error: 'noSkill' };
  const sk = state.skills && state.skills[power];
  if (!sk) return { error: 'noSkill' };
  const s = clone(state);
  // v2 R15.1 / v2.22.4 — previewPool: modelo LEVELS, sin tope.
  // Cada compra sube level y el precio (40×1.6^level) y muestra una tanda más.
  if (power === 'previewPool') {
    const level = sk.level || 0;
    const price = previewPrice(s);
    if (s.progress.coins < price) return { error: 'noFunds' };             // R7.3
    s.progress.coins -= price;
    s.skills.previewPool.owned = true;
    s.skills.previewPool.level = level + 1;
    return s;
  }
  // v2.21 — capacidad retirada: N es 100 fijo. Comprarla no cambia la cola
  // y no gasta monedas (no hay nada que comprar).
  if (power === 'capacidad') return { error: 'retired' };
  // v2.3/v2.15/v2.16 R7.2 — skills modelo USOS (destroy/swap/refresh/queueSkip/unlock):
  // CADA uso se compra (sin base gratis): usesBought += 1 y uses += 1 (mid-run
  // usable ya; NO uses = usesBought — eso devolvería gastados). openRun repone
  // uses = usesBought. Precio = price * 1.35^usesBought. v2.16: sin gate cafeLevel.
  {
    const sk2 = s.skills[power];
    // v2.22.4: the old MAX_USES_PER_SKILL ceiling is not enforced.
    const cost = Math.round(sk2.price * Math.pow(1.35, sk2.usesBought || 0));
    if (s.progress.coins < cost) return { error: 'noFunds' };                // R7.3
    s.progress.coins -= cost;
    sk2.usesBought = (sk2.usesBought || 0) + 1;   // la compra ES un uso
    sk2.owned = true;
    sk2.uses = (sk2.uses || 0) + 1;               // v2.15: +1 uso ya (sin devolver gastados)
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
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.activeClients)) return { error: 'noRun' };
  const bill = chargeUndoable(s, 'queueSkip');
  if (bill) return bill;
  const old = s.run.activeClients.splice(0, s.run.activeClients.length);
  s.run.queueBack.push(...old);                 // R17.1: al fondo, orden FIFO
  // v2.1 FIX (T17e): drawClientInto MUTA `s` (el caller ya clonó); drawClient
  // es el export PURO (clona y descarta) — no dibujaba nada.
  for (let i = 0; i < 3; i++) drawClientInto(s, Math.random);  // 3 nuevos (R16.3)
  refillClients(s, Math.random);                // edge: cola agotada → re-entran
  return s;
}

// ---------------------------------------------------------------------------
// v2.1/v2.15 R17.2 — MEJORA DE USOS (tienda): cada skill modelo 'uses'
// (destroyPile/swapPiles/refreshPool/queueSkip/…) puede subir +1 uso por partida.
// Precio = USES_UP_BASE * USES_UP_RATIO^comprasDelSkill (exponencial).
// Mid-run: usesBought += 1 y uses += 1 (sin devolver gastados).
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
  if (power === 'tables' || !CONFIG.USES_SKILLS.includes(power)) return { error: 'noUsesModel' };  // solo modelo 'uses'
  const s = clone(state);
  const cur = s.skills[power];
  if (!cur.owned) return { error: 'locked' };                        // R7.1: mejora lo comprado
  const price = CONFIG.USES_UP_BASE * Math.pow(CONFIG.USES_UP_RATIO, cur.usesBought || 0);
  if (s.progress.coins < price) return { error: 'noFunds' };         // R7.3
  cur.usesBought = (cur.usesBought || 0) + 1;                        // acumulado
  cur.uses = (cur.uses || 0) + 1;                                    // v2.15: +1 uso ya
  s.progress.coins -= price;
  return s;
}

// ---------------------------------------------------------------------------
// v2 R15.1 — previewPool(state, rng): vista previa PURA de las próximas tandas
// del pool. level 0 (sin comprar) => null; level N (sin tope, v2.22.4) => N
// tandas de 3 pilas con colores en 1..min(rosterIndex, colorsOwned).
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
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const cell = s.run.board[cellId];
  if (!cell) return { error: 'noCell' };
  if (cell.blocked) return { error: 'blocked' };                        // R7.5 block
  const bill = chargeUndoable(s, 'destroyPile');
  if (bill) return bill;
  cell.stack = [];                                                       // R7.5 empty
  return s;
}

export function useSwapPiles(state, a, b) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const board = s.run.board;
  if (a === b) return { error: 'same' };
  if (!board[a] || !board[b]) return { error: 'noCell' };
  if (board[a].blocked || board[b].blocked) return { error: 'blocked' }; // R7.6
  const bill = chargeUndoable(s, 'swapPiles');
  if (bill) return bill;
  const tmp = board[a].stack;
  board[a].stack = board[b].stack;                                        // R7.6 swap
  board[b].stack = tmp;
  return s;
}

export function useUnlockLocks(state, cellId) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const cell = s.run.board[cellId];
  if (!cell) return { error: 'noCell' };
  if (!cell.blocked) return { error: 'notBlocked' };                    // R7.8 v2.8
  const bill = chargeUndoable(s, 'unlockLocks');
  if (bill) return bill;
  cell.blocked = false;
  if (cell.hiddenStack && cell.hiddenStack.length) {                    // R8.4 v2: revelar
    cell.stack = (cell.stack || []).concat(cell.hiddenStack);
    delete cell.hiddenStack;
  }
  return s;
}

export function useRefreshPool(state, rng) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const bill = chargeUndoable(s, 'refreshPool');
  if (bill) return bill;
  // v2.10 R18: useRefreshPool consume de s.run.bag
  const r = rng || Math.random;
  const cu = poolMaxColor(s.run && s.run.rosterIndex, s.progress.colorsOwned);
  const { piles, nextBag } = drawPoolPiles(r, s.run && s.run.bag, cu);
  s.run.pool = piles;
  s.run.bag = nextBag;
  s.run.pilesDealt = (s.run.pilesDealt || 0) + piles.length;
  s.run.poolPlaced = 0;                                                   // R7.7
  return s;
}

// v2.24 — Clear board. Same per-cell rule as Destroy: a blocked cell is
// left alone (lock, hidden pile, and any stack sitting on the lock stay).
// Every other occupied cell loses its stack, whatever the height. Dormant,
// calamity flags, and hiddenStack are not touched. One charge, no target.
// An already-clear board does not charge.
export function useClearBoard(state) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return { error: 'noRun' };
  const targets = [];
  s.run.board.forEach((cell, i) => {
    if (!cell || cell.blocked) return;
    if (cell.stack && cell.stack.length) targets.push(i);
  });
  if (!targets.length) return { error: 'empty' };
  const bill = chargeUndoable(s, 'clearBoard');
  if (bill) return bill;
  for (const i of targets) s.run.board[i].stack = [];
  return s;
}

// v2.24 — Undo the last action that mutated the board, pool, or orders.
// Coin rule: restore the snapshot first (coins return to what they were
// before that action, so its fee comes back), then deduct the Undo fee
// (40 × 1.6^n) and count this use. Undo does not snapshot itself, and the
// stack is cleared, so a second tap cannot refund the fee. If the restored
// purse cannot cover the fee, nothing changes.
export function useUndoMove(state) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const snap = s.run.undoSnap;
  if (!snap || !snap.run || !snap.progress) return { error: 'nothingToUndo' };
  const n = skillUseCount(s, 'undoMove');
  const price = skillUsePrice(s, 'undoMove');
  const restored = snap.progress.coins || 0;
  if (restored < price) return { error: 'noFunds' };
  const next = clone(snap);
  delete next.run.undoSnap;
  next.progress.coins = restored - price;
  if (!next.run.skillUses) next.run.skillUses = {};
  next.run.skillUses.undoMove = n + 1;
  return next;
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
  // v2.22.4: sin MULT_MAX. Misma curva 40×1.6^n que el resto de skills.
  const price = tipPrice(s);
  if (s.progress.coins < price) return { error: 'noFunds' };
  s.progress.coins -= price;
  s.progress.econ.multLevel = lvl + 1;
  if (s.economy) s.economy.multLevel = s.progress.econ.multLevel;
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

// v2.21 — el idle offline no acumula. La función sigue existiendo para que
// un save viejo y la UI no revienten: el reporte es cero y las monedas no
// se mueven. Lo comprado en la run (tickIdle) tampoco se guarda entre runs
// porque restartRun tira el estado; esta neutralización cubre el hueco de
// "volviste horas después".
export function applyOffline(state, now) {
  const s = clone(state);
  s.meta.lastSeenAt = now ?? s.meta.lastSeenAt;
  s.meta.offlineReport = { workers: 0, fame: 0, machines: 0, total: 0 };
  return s;
}

// v2.23 — ficha compacta de una run que termina (reinicio o victoria).
export function finishedRunRecord(state) {
  const run = state && state.run;
  if (!run) return null;
  const served = run.clientsServed || 0;
  return {
    clientsServed: served,
    moneyStacks: run.moneyStacks || 0,
    pilesDealt: run.pilesDealt || 0,
    victory: run.phase === 'victory' || served >= totalClients(state),
  };
}

export function pushRunHistory(history, record, max = CONFIG.RUN_HISTORY_MAX) {
  const next = Array.isArray(history) ? history.filter((row) => row && typeof row === 'object') : [];
  if (record) next.push(record);
  const cap = max > 0 ? max : CONFIG.RUN_HISTORY_MAX;
  while (next.length > cap) next.shift();
  return next;
}

// Mejor: más clientes; empate → más apilaciones que pagaron; empate → más
// pilas repartidas; empate → la más reciente (índice mayor).
// Peor: lo inverso en las tres cifras; si empatan, se queda la más antigua.
export function bestWorstRuns(history) {
  const list = Array.isArray(history) ? history.filter((row) => row && typeof row === 'object') : [];
  if (!list.length) return { best: null, worst: null };
  const clients = (row) => row.clientsServed || 0;
  const stacks = (row) => row.moneyStacks || 0;
  const piles = (row) => row.pilesDealt || 0;
  let bestI = 0;
  let worstI = 0;
  for (let i = 1; i < list.length; i++) {
    const r = list[i];
    const b = list[bestI];
    const w = list[worstI];
    const better = clients(r) > clients(b)
      || (clients(r) === clients(b) && stacks(r) > stacks(b))
      || (clients(r) === clients(b) && stacks(r) === stacks(b) && piles(r) > piles(b))
      || (clients(r) === clients(b) && stacks(r) === stacks(b) && piles(r) === piles(b));
    if (better) bestI = i;
    const worse = clients(r) < clients(w)
      || (clients(r) === clients(w) && stacks(r) < stacks(w))
      || (clients(r) === clients(w) && stacks(r) === stacks(w) && piles(r) < piles(w));
    if (worse) worstI = i;
  }
  return { best: list[bestI], worst: list[worstI] };
}

function historyAfterRun(state) {
  const prev = state && Array.isArray(state.runHistory) ? state.runHistory : [];
  return pushRunHistory(prev, finishedRunRecord(state));
}

// v2.21 — reinicio de la jugadora. Monedas, skills, colores, capacidad,
// idle y tablero empiezan de cero. El mute vive fuera de este objeto
// (localStorage cozy-cat-cafe.audio.mute) y esta función no lo toca.
// seenTutorial sí se conserva: un tutorial ya visto no se vuelve a mostrar.
// v2.23 — el historial de runs también se conserva (y suma la run que cierra).
export function restartRun(state, rng) {
  // Coins, skills, and colors start over. A finished spotlight stays finished
  // so Hold 3s does not replay the tutorial. Unseen stays unseen.
  const seen = !!(state && state.settings && state.settings.seenTutorial);
  const already = !!(state && state.run && state.run.archived);
  const history = already
    ? pushRunHistory(state.runHistory || [], null)
    : historyAfterRun(state);
  const next = openRun(createGame(), rng || Math.random);
  if (next.settings) next.settings.seenTutorial = seen;
  next.runHistory = history;
  return next;
}

// v2.21 — victoria formal: se sirvieron los N clientes. No cierra a un
// menú ni anula la run (la escena se queda para atenuar luces y mostrar
// al gato anfitrión). El bonus de calamidad (15 c/u, ambas oleadas) se
// suma a las monedas de ESTA run; el siguiente restartRun las tira.
export function beginVictory(state) {
  const s = clone(state);
  if (!s.run) return s;
  if (s.run.phase === 'victory') return s;
  if (!runVictory(s)) return s;
  const bonus = bonusCalamity(s.run);
  s.progress.coins += bonus;
  s.run.phase = 'victory';
  s.run.victoryBonus = bonus;
  // The winning move is not rewound. Restart opens a fresh run anyway.
  delete s.run.undoSnap;
  // The sitting is finished. Archive it once so the save modal can show it
  // before Hold 3s, and so restart does not record it a second time.
  s.run.archived = true;
  s.runHistory = pushRunHistory(s.runHistory, finishedRunRecord(s));
  s.metaClose = {
    reason: 'allServed',
    bonus,
    victory: true,
    served: s.run.clientsServed,
    total: totalClients(s),
  };
  return s;
}

// Vacía las pilas visibles. La UI lo llama al final de la cascada de victoria.
export function clearTables(state) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return s;
  for (const cell of s.run.board) {
    if (!cell) continue;
    cell.stack = [];
  }
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

// A pre-epoch blob is not this run's save. Coins and skills still start
// over, but a finished spotlight (or a save that predates the flag) must
// not be treated as unseen. Explicit false still means "not seen".
function freshGameKeepingTutorial(blob) {
  const fresh = createGame();
  const flag = blob && blob.settings ? blob.settings.seenTutorial : undefined;
  if (flag !== false) fresh.settings.seenTutorial = true;
  return fresh;
}

// R1.2 roundtrip: deserialize(serialize(state)) restores identical.
// R1.4 guard: unsupported version -> fresh createGame (never throws).
export function deserializeState(json) {
  try {
    const s = JSON.parse(json);
    if (s && s.version === 1) {
      // v2.21 — un save anterior (sin settings.epoch === 21) trae meta
      // permanente (monedas, skills, colores, idle). No se restaura: se
      // abre un juego nuevo. No lanza. La run en curso de v2.21 sí vuelve
      // (recarga ≠ reinicio). El mute no vive en este blob.
      if (!s.settings || s.settings.epoch !== 21) return freshGameKeepingTutorial(s);
      // v2 defaults: saves v1 viejos no tienen los campos nuevos — no romper
      if (s.progress) {
        if (s.progress.colorsOwned == null) s.progress.colorsOwned = 4;  // R13.7
      }
      if (s.skills) {
        // R15.1 defaults para saves viejos (levels, sin uses). v2.22.2 suelta Waiter.
        if (!s.skills.previewPool) s.skills.previewPool = { owned: false, level: 0 };
        // v2.1 R17 defaults (cola de clientes / usos mejorados)
        if (!s.skills.queueSkip) s.skills.queueSkip = { owned: false, uses: 0, usesBought: 0 };
        if (!s.skills.capacidad) s.skills.capacidad = { owned: false, level: 0 };
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
      // v2.18 — first-run tutorial flag. Old saves (v2.16/v2.17) lack the key;
      // treat missing as TRUE so existing players never see the overlay.
      if (!s.settings) s.settings = { reducedMotion: false };
      if (s.settings.seenTutorial == null) s.settings.seenTutorial = true;
      if (s.settings.boardRot == null) s.settings.boardRot = 0;
      if (!Array.isArray(s.runHistory)) s.runHistory = [];
      dropPermanentTableFields(s);
      return s;
    }
    return createGame();
  } catch (e) {
    return createGame();
  }
}

// v2.20 — la tienda permanente de mesas ya no existe. Un save v2.19 puede
// traer progress.permTiles y skills.tables (usos que sobrevivían a la run).
// Se sueltan al cargar; el resto del progreso se queda. Lo activado en la
// run en curso (board + runTilesActivated) no es esa tienda y se conserva.
function dropPermanentTableFields(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.progress && Object.prototype.hasOwnProperty.call(s.progress, 'permTiles')) {
    delete s.progress.permTiles;
  }
  if (s.skills && Object.prototype.hasOwnProperty.call(s.skills, 'tables')) {
    delete s.skills.tables;
  }
  // v2.22.2 — Waiter / serveManual ya no es un skill. Un save que lo traiga lo suelta.
  if (s.skills && Object.prototype.hasOwnProperty.call(s.skills, 'serveManual')) {
    delete s.skills.serveManual;
  }
  return s;
}

// R1.3 import — valid version1 => state; invalid (no version / mis-shape) => {error}.
export function importSave(json) {
  try {
    const s = JSON.parse(json);
    if (!s || s.version !== 1 || !s.progress || !s.meta) return { error: 'invalid' };
    if (!s.settings || s.settings.epoch !== 21) return freshGameKeepingTutorial(s);
    dropPermanentTableFields(s);
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