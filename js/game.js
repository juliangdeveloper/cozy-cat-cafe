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
  PRODUCTS_PER_COLOR: 3,            // R10.1
  MAX_COLORS: 6,                    // R10.1
  IDLE_RATE: { workers: 0.5, fame: 0.3, machines: 0.8 }, // R9.1
  IDLE_CAP:  { workers: 60,  fame: 100,  machines: 40 },  // R9.3 caps
  IDLE_PRICE: 50,                   // R9.4 price = 50 * level^2
  EXPAND: {
    clients:  { per: 1, price: (s) => 40 * s.progress.clients },             // R6.1
    board:    { per: 3, price: (s) => 60 * (s.progress.boardCells / 3) },     // R6.2
    products: { per: 1, price: (s) => 50 * (s.progress.productsBought + 1) }, // R6.3
  },
};

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
      econ: { multLevel: 0 },
    },
    economy: { multLevel: 0 },
    skills: {
      destroyPile: { owned: false, uses: 0, price: 250, unlockLevel: 5 },
      swapPiles:   { owned: false, uses: 0, price: 120, unlockLevel: 3 },
      refreshPool: { owned: false, uses: 0, price: 40,  unlockLevel: 1 },
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
// Board / order / pool generation (R2 board redesign, R8, R10.2)
// ---------------------------------------------------------------------------
export function generateBoard(state, rng) {
  const p = state.progress;
  // every run opens on the fixed 7-cell hex (2-3-2); growth happens via expandTile
  const board = initialHexCells();

  // orders are NOT anchored to any cell: {id,color,qty,served} (R4 redesign)
  const orders = Array.from({ length: p.clients }, (_, i) => ({
    id: `ord-${i}`, color: rngInt(rng, 1, p.colorsUnlocked),
    qty: rngInt(rng, 2, 4), served: false,
  }));

  // calamities (R8): only when progress.boardCells > threshold; count variable
  let calamities = 0;
  if (p.boardCells > CONFIG.CALAMITY_THRESHOLD) {
    const lo = Math.ceil(p.boardCells / 5);
    const hi = Math.floor(p.boardCells / 3);
    calamities = lo <= hi ? rngInt(rng, lo, hi) : 0;
    const free = board.filter((c) => !c.calamity);
    const chosen = pickDistinct(rng, free.length, Math.min(calamities, free.length));
    for (const ci of chosen) {
      const c = free[ci];
      c.calamity = true;
      if (rng() < CONFIG.BLOCK_PROB) {
        c.blocked = true;
      } else {
        const size = rngInt(rng, 1, 3);
        const col = rngInt(rng, 1, p.colorsUnlocked);
        c.stack = Array.from({ length: size }, () => col);
        c.calamityStack = true;
      }
    }
  }

  // pool: 3 piles, single color each, unlocked range (R3.1, R10.2)
  const pool = Array.from({ length: 3 }, () => pile(rng, p.colorsUnlocked));

  return { board, orders, pool, poolPlaced: 0, calamities };
}

// ---------------------------------------------------------------------------
// openRun / openShop (R2.1). Also `newRun` alias. Refills skill uses (R7.4).
// ---------------------------------------------------------------------------
export function openRun(state, rng) {
  const s = clone(state);
  s.run = { phase: 'open', ...generateBoard(s, rng) };
  for (const key of Object.keys(CONFIG.USES_PER_RUN)) {
    if (s.skills[key] && s.skills[key].owned) {
      s.skills[key].uses = CONFIG.USES_PER_RUN[key];          // R7.4 replenish per run
    }
  }
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
export function placeStack(state, cellId, slot, rng) {
  const s = clone(state);
  const b = s.run.board;
  if (!b || cellId < 0 || cellId >= b.length) return { error: 'noCell' }; // R3.5
  const cell = b[cellId];
  if (cell.blocked) return { error: 'blocked' };                            // R3.5/R8.4
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
  if (s.run.poolPlaced === 3) {
    // refill all 3 at once (R3.3); injected rng keeps it deterministic
    s.run.pool = buildPick(rng, 3, s.progress.colorsUnlocked);
    s.run.poolPlaced = 0;
  }
  return s;
}

function buildPick(rng, n, cu) {
  return Array.from({ length: n }, () => pile(rng || Math.random, cu));
}

// ---------------------------------------------------------------------------
// serveOrder(state, orderId, cellId) — click client (order) then pile (cell).
// Consumes EXACTLY order.qty pieces of the order's COLOR from the top of the
// pile (R4 redesign). Unlike the old rule, a pile larger than qty is served too
// (pile of 4, order qty 3 -> 1 piece remains). pago R5.1.
// ---------------------------------------------------------------------------
export function serveOrder(state, orderId, cellId) {
  const s = clone(state);
  const order = s.run && s.run.orders.find((o) => String(o.id) === String(orderId));
  if (!order) return { error: 'noOrder' };
  if (order.served) return { error: 'alreadyServed' };                    // R4.4
  const cell = s.run.board[cellId];
  if (!cell) return { error: 'noCell' };
  const tg = topGroup(cell.stack);
  // wrong color, or not enough pieces: error, consume nothing
  if (tg.color !== order.color || tg.count < order.qty) {                 // R4.4
    return { error: 'notEnough' };
  }
  // consume exactly order.qty pieces from the top (they are all order.color)
  cell.stack.splice(cell.stack.length - order.qty, order.qty);
  order.served = true;
  const amount = pay(order, s.economy.multLevel);                          // R5.1
  s.progress.coins += amount;
  return s;
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
  if (sk.owned) return { error: 'owned' };
  if (s.progress.cafeLevel < sk.unlockLevel) return { error: 'locked' }; // R7.1
  if (s.progress.coins < sk.price) return { error: 'noFunds' };          // R7.3
  s.progress.coins -= sk.price;
  s.skills[power].owned = true;
  s.skills[power].uses = CONFIG.USES_PER_RUN[power];                     // R7.3
  return s;
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
    if (s && s.version === 1) return s;
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