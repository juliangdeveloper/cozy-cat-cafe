
export const CONFIG = {
  BASE_COIN: 5,
  EXP_BASE: 1.25,
  EXP_STEP: 0.20,
  MULT_PRICE_BASE: 100,
  MULT_MAX: 6,
  CALAMITY_BONUS_PER: 15,
  CALAMITY_MIN_FRAC: 1 / 5,
  CALAMITY_MAX_FRAC: 1 / 3,
  CALAMITY_THRESHOLD: 15,
  BLOCK_PROB: 0.5,
  USES_SKILLS: ['destroyPile', 'swapPiles', 'refreshPool', 'queueSkip', 'unlockLocks'],
  MAX_USES_PER_SKILL: 5,
  PRODUCTS_PER_COLOR: 3,
  IDLE_RATE: { workers: 0.5, fame: 0.3, machines: 0.8 },
  IDLE_CAP:  { workers: 60,  fame: 100,  machines: 40 },
  IDLE_PRICE: 50,
  EXPAND: {
    clients:  { per: 1, price: (s) => 40 * s.progress.clients },
    board:    { per: 3, price: (s) => 60 * (s.progress.boardCells / 3) },
    products: { per: 1, price: (s) => 50 * (s.progress.productsBought + 1) },
  },
  UNLOCK_PLACED_PILES: 3,
  COLOR_PRICE_BASE: 150,
  RUN_TILE_BASE: 40,
  RUN_TILE_RATIO: 1.6,
  SKILL_USE_BASE: 40,
  SKILL_USE_RATIO: 1.6,
  CLEAR_BOARD_BASE: 10000,
  UNLOCK_LOCKS_BASE: 10000,
  COLOR_SKILL_BASE: 1000,
  UNDO_HISTORY_MAX: 200,
  MAX_COLORS: 10,
  RUN_COLORS: 8,
  RUN_HISTORY_MAX: 20,
  TOP_RUNS: 10,
  DEBRIS_THRESHOLD: 10,
  DEBRIS_BONUS_PER: 25,
  DEBRIS_BIG_OVER: 10,
  DEBRIS_BIG_MULT: 4,
  CASCADE_STEP_MS: 600,
  TABLES_HOLD_MS: 550,
  CLOSE_HOLD_MS: 3000,
  TABLES_ACTIVATE_MIN_NEIGHBORS: 2,
  PREVIEW_PRICE: 80,
  PILE_SIZE_WEIGHTS: [9, 8, 7, 6, 5, 4, 3],
  BAG_INITIAL_COLORS: 4,
  BAG_INITIAL_MIN: 7,
  BAG_INITIAL_MAX: 18,
  BAG_RELOAD_MIN: 7,
  BAG_RELOAD_MAX: 18,
  TOTAL_CLIENTS: 100,
  MIN_CLIENTS: 100,
  MAX_CLIENTS: 100,
  ORDER_QTY_BASE: 3,
  ORDER_QTY_EARLY: [3, 5, 8],
  ORDER_QTY_RAMP_TO: 9,
  ORDER_LEGENDARY_QTY: 10,
  ORDER_LEGENDARY_EVERY: 10,
  ORDER_LEGENDARY_PER_COLOR: 1,
  CALAMITY_WAVE2_REMAINING: 20,
  CALAMITY_PLAYABLE_GOAL: 16,
  BOARD_SHUFFLE_COINS: 100000,
  USES_UP_BASE: 60,
  USES_UP_RATIO: 1.6,
  CAP_PRICE_BASE: 60,
  CAP_RATIO: 1.145,
};

export const ROSTER = [
  'Host cat', 'Fox kit', 'Frog', 'Dragonling',
  'Sweeper bot', 'Barista bot', 'Delivery bot', 'DJ bot',
  'Human twin A', 'Human twin B',
];

const clone = (x) => structuredClone(x);
const rngInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
function pickPileSize(rng) {
  const w = CONFIG.PILE_SIZE_WEIGHTS;
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i + 1; }
  return w.length;
}

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

export function colorsUnlocked(productsBought) {
  const v = 1 + Math.floor(productsBought / CONFIG.PRODUCTS_PER_COLOR);
  return Math.min(Math.max(v, 1), CONFIG.MAX_COLORS);
}

export function pay(order, multLevel = 0) {
  const exp = CONFIG.EXP_BASE + CONFIG.EXP_STEP * (multLevel || 0);
  return Math.round(CONFIG.BASE_COIN * Math.pow(order.qty, exp));
}

export function tipLevel(state) {
  const n = state && state.progress && state.progress.econ && state.progress.econ.multLevel;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export function tipPayTable(state) {
  const lvl = tipLevel(state);
  const rows = [];
  for (let qty = 3; qty <= 10; qty++) {
    rows.push({ qty, now: pay({ qty }, lvl), next: pay({ qty }, lvl + 1) });
  }
  return { level: lvl, rows };
}

function syncTipLevel(state) {
  if (!state || !state.progress) return state;
  if (!state.progress.econ || typeof state.progress.econ !== 'object') state.progress.econ = {};
  const prog = state.progress.econ.multLevel;
  if (!Number.isFinite(prog)) {
    const econ = state.economy && state.economy.multLevel;
    state.progress.econ.multLevel = Number.isFinite(econ) ? econ : 0;
  }
  const lvl = tipLevel(state);
  state.progress.econ.multLevel = lvl;
  if (!state.economy || typeof state.economy !== 'object') state.economy = {};
  state.economy.multLevel = lvl;
  return state;
}

export function bonusCalamity(run) {
  if (!run) return 0;
  return (run.calamities || 0) * CONFIG.CALAMITY_BONUS_PER;
}

export function createGame(init = {}) {
  const base = {
    version: 1,
    meta: {
      createdAt: 0, lastSavedAt: 0, lastSeenAt: 0,
      exportId: `ccc-1-${Date.now ? 0 : 0}-${Math.floor(Math.random() * 1e9)}`,
    },
    progress: {
      coins: 0, totalGames: 0, cafeLevel: 1, productsBought: 0,
      clients: 3, boardCells: 7, colorsUnlocked: 1,
      colorsOwned: 4,
      econ: { multLevel: 0 },
    },
    economy: { multLevel: 0 },
    skills: {
      destroyPile: { owned: false, uses: 0, usesBought: 0, price: 250, unlockLevel: 5 },
      swapPiles:   { owned: false, uses: 0, usesBought: 0, price: 120, unlockLevel: 3 },
      refreshPool: { owned: false, uses: 0, usesBought: 0, price: 40,  unlockLevel: 1 },
      previewPool: { owned: false, level: 0, price: 80, unlockLevel: 1 },
      queueSkip: { owned: false, uses: 0, usesBought: 0, price: 100, unlockLevel: 1 },
      unlockLocks: { owned: false, uses: 0, usesBought: 0, price: 250, unlockLevel: 5 },
      capacidad: { owned: false, level: 0, price: 120, unlockLevel: 1 },
    },
    idle: {
      workers:  { level: 0, ratePerSec: 0, cap: 0 },
      fame:     { level: 0, ratePerSec: 0, cap: 0 },
      machines: { level: 0, ratePerSec: 0, cap: 0 },
    },
    run: null,
    metaClose: null,
    settings: { reducedMotion: false, seenTutorial: false, boardRot: 0, epoch: 21 },
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
  s.progress.cafeLevel = s.progress.totalGames + 1;
  s.progress.colorsUnlocked = colorsUnlocked(s.progress.productsBought);
  return s;
}

export const HEX_ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];

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

export function isActivateEligible(state, cell) {
  if (!cell || !cell.dormant || cell.blocked) return false;
  return unlockedNeighborCount(state, cell) >= (CONFIG.TABLES_ACTIVATE_MIN_NEIGHBORS || 2);
}

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

function tilePrice(s) {
  return Math.round(CONFIG.EXPAND.board.price(s));
}

function expandTileCheck(s, q, r) {
  const board = s.run?.board;
  if (!board || !board.length) return { error: 'noRun' };
  if (board.some((c) => c.q === q && c.r === r)) return { error: 'occupied' };
  const adjacent = board.some((c) => HEX_ADJ.some(([dq, dr]) => c.q + dq === q && c.r + dr === r));
  if (!adjacent) return { error: 'notAdjacent' };
  return null;
}

export function canonicalBoardSlots() {
  const slots = [];
  const ROWS = [
    [-2, -2, 6],
    [-1, -2, 6],
    [0, -3, 6],
    [1, -3, 6],
    [2, -4, 6],
    [3, -4, 6],
  ];
  for (const [r, qStart, w] of ROWS) {
    for (let q = qStart; q < qStart + w; q++) slots.push({ q, r });
  }
  return slots;
}

export function generateBoard(n, rng) {
  const core = new Set(initialHexCells().map((c) => `${c.q},${c.r}`));
  return canonicalBoardSlots().map(({ q, r }, i) => ({
    id: `c${i}`, q, r,
    stack: [], blocked: false, calamity: false,
    dormant: !core.has(`${q},${r}`),
  }));
}

export function repairBoardGeometry(board) {
  if (!Array.isArray(board) || board.length !== 36) return board;
  const seen = new Set();
  let ok = true;
  for (const cell of board) {
    if (!cell || typeof cell.q !== 'number' || typeof cell.r !== 'number' || !Number.isFinite(cell.q) || !Number.isFinite(cell.r)) {
      ok = false;
      break;
    }
    const k = `${cell.q},${cell.r}`;
    if (seen.has(k)) { ok = false; break; }
    seen.add(k);
  }
  if (ok) return board;
  const slots = canonicalBoardSlots();
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const cell = board[i];
    if (!cell || typeof cell !== 'object') {
      board[i] = {
        id: `c${i}`, q: slot.q, r: slot.r,
        stack: [], blocked: false, calamity: false, dormant: true,
      };
    } else {
      cell.q = slot.q;
      cell.r = slot.r;
      if (!cell.id) cell.id = `c${i}`;
    }
  }
  return board;
}

export function playableTables(state) {
  const board = state && state.run && state.run.board;
  if (!Array.isArray(board)) return 0;
  return board.filter((c) => c && !c.dormant && !c.blocked).length;
}

function calamitySpan(jugables) {
  const lo = Math.ceil(jugables * CONFIG.CALAMITY_MIN_FRAC);
  const hi = Math.max(Math.floor(jugables * CONFIG.CALAMITY_MAX_FRAC), lo);
  return { lo, hi };
}

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
  if (s.run.calamitiesApplied) return s;
  const r = rng || Math.random;
  const jugables = playableTables(s);
  if (jugables <= CONFIG.CALAMITY_THRESHOLD) return s;
  const count = stampCalamityBurst(s, r);
  s.run.calamities = count;
  s.run.calamitiesApplied = true;
  return s;
}

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
  if (!run.boardShuffleApplied) {
    const coins = (state.progress && state.progress.coins) || 0;
    const goal = CONFIG.BOARD_SHUFFLE_COINS;
    return { wave: 3, progress: Math.min(1, coins / goal), current: coins, goal, done: false };
  }
  return { wave: 0, progress: 1, current: served, goal: wave2At, done: true };
}

function tileCarry(cell) {
  return {
    stack: Array.isArray(cell.stack) ? cell.stack.slice() : [],
    blocked: !!cell.blocked,
    dormant: !!cell.dormant,
    calamity: !!cell.calamity,
    calamityStack: !!cell.calamityStack,
    hiddenStack: Array.isArray(cell.hiddenStack) ? cell.hiddenStack.slice() : null,
  };
}

function writeTileCarry(cell, src) {
  cell.stack = src.stack;
  cell.blocked = src.blocked;
  cell.dormant = src.dormant;
  cell.calamity = src.calamity;
  cell.calamityStack = src.calamityStack;
  if (src.hiddenStack) cell.hiddenStack = src.hiddenStack;
  else delete cell.hiddenStack;
}

export function shuffleBoardTiles(board, rng) {
  const r = rng || Math.random;
  const n = board.length;
  const from = board.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = rngInt(r, 0, i);
    const tmp = from[i];
    from[i] = from[j];
    from[j] = tmp;
  }
  if (n > 1 && from.every((v, i) => v === i)) {
    const tmp = from[0];
    from[0] = from[1];
    from[1] = tmp;
  }
  const carried = board.map(tileCarry);
  for (let i = 0; i < n; i++) writeTileCarry(board[i], carried[from[i]]);
  return from;
}

export function applyBoardShuffle(state, rng) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return s;
  if (s.run.boardShuffleApplied) return s;
  s.run.boardShuffleFrom = shuffleBoardTiles(s.run.board, rng || Math.random);
  s.run.boardShuffleApplied = true;
  s.run.calamities = (s.run.calamities || 0) + 1;
  return s;
}

export function maybeBoardShuffle(state, coinsBefore, rng) {
  if (!state || !state.run || !Array.isArray(state.run.board)) return state;
  if (state.run.boardShuffleApplied) return state;
  const before = Number(coinsBefore) || 0;
  const now = (state.progress && state.progress.coins) || 0;
  if (!(before < CONFIG.BOARD_SHUFFLE_COINS && now >= CONFIG.BOARD_SHUFFLE_COINS)) return state;
  return applyBoardShuffle(state, rng);
}


export function totalClients(state) {
  void state;
  return CONFIG.TOTAL_CLIENTS;
}

export function runVictory(state) {
  if (!state || !state.run) return false;
  return (state.run.clientsServed || 0) >= totalClients(state);
}

function rosterCeiling(run) {
  const p = run && run.palette;
  if (Array.isArray(p) && p.length) return p.length;
  return CONFIG.MAX_COLORS;
}

function rosterMax(colorsOwned, ceiling) {
  const cap = ceiling == null ? CONFIG.MAX_COLORS : ceiling;
  return Math.min((colorsOwned || 0) + 1, cap);
}

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

export function runFaceColor(state, logical) {
  const pal = state && state.run && state.run.palette;
  const n = logical | 0;
  if (!Array.isArray(pal) || !pal.length || n < 1 || n > pal.length) return n;
  return pal[n - 1];
}

export function guestForColor(state, logical) {
  const face = runFaceColor(state, logical);
  const i = (face | 0) - 1;
  return {
    logical: logical | 0,
    face,
    name: (i >= 0 && i < ROSTER.length) ? ROSTER[i] : 'Creature',
  };
}

export const GUEST_SWAP_MS = Object.freeze({ leave: 750, enter: 750 });
export const GUEST_SWAP_FADE_MS = Object.freeze({ leave: 160, enter: 160 });
export const PEEK_MOVE_MS = 1000;
export const PEEK_HOLD_MS = 1000;

function guestId(id) {
  if (id == null || id === '') return null;
  return String(id);
}

export function assignGuestSlots(slots, desiredIds, holdMissing) {
  const shown = (slots || []).map((s) => guestId(s && s.shownId));
  const want = (desiredIds || []).map(guestId).filter((id) => id != null);
  const kept = new Set();
  shown.forEach((id) => {
    if (id != null && want.includes(id) && !kept.has(id)) kept.add(id);
  });
  const newcomers = want.filter((id) => !kept.has(id));
  const missing = shown.some((id) => id != null && !want.includes(id));
  if (holdMissing && missing && newcomers.length === 0) return shown.slice();
  if (holdMissing && shown.every((id) => id == null)) return want.slice();
  const used = new Set();
  const out = shown.map((id) => {
    if (id != null && want.includes(id) && !used.has(id)) {
      used.add(id);
      return id;
    }
    return null;
  });
  const fresh = want.filter((id) => !used.has(id));
  for (let i = 0; i < out.length && fresh.length; i++) {
    if (out[i] == null) out[i] = fresh.shift();
  }
  while (fresh.length) out.push(fresh.shift());
  return out;
}

export function guestSwapPlan(shownId, phase, desiredId) {
  const shown = guestId(shownId);
  const desired = guestId(desiredId);
  const moving = phase === 'out' || phase === 'in';
  if (!moving) {
    if (shown === desired) return 'keep';
    if (shown == null) return desired == null ? 'keep' : 'mount';
    return 'leave';
  }
  if (phase === 'in' && desired === shown) return 'keep';
  return 'queue';
}

function poolMaxColor(rosterIndex, colorsOwned) {
  return Math.min(rosterIndex || 1, colorsOwned || 1);
}


export function initBag(rng, cu) {
  const bag = {};
  const maxC = Math.max(1, cu || 1);
  const k = Math.min(CONFIG.BAG_INITIAL_COLORS, maxC);
  const indices = pickDistinct(rng, maxC, k);
  for (const idx of indices) {
    const color = idx + 1;
    bag[color] = rngInt(rng, CONFIG.BAG_INITIAL_MIN, CONFIG.BAG_INITIAL_MAX);
  }
  return bag;
}

function reloadIntoDead(rng, bag, maxC) {
  const dead = [];
  for (let c = 1; c <= maxC; c++) {
    if (!bag[c] || bag[c] <= 0) dead.push(c);
  }
  if (dead.length === 0) return null;
  const c = dead[Math.floor(rng() * dead.length)];
  bag[c] = rngInt(rng, CONFIG.BAG_RELOAD_MIN, CONFIG.BAG_RELOAD_MAX);
  return c;
}

function drawTileFromBag(rng, bag, cu) {
  const maxC = Math.max(1, cu || 1);
  let alive = Object.keys(bag).map(Number).filter(c => bag[c] > 0);
  if (alive.length === 0) {
    reloadIntoDead(rng, bag, maxC);
    alive = Object.keys(bag).map(Number).filter(c => bag[c] > 0);
  }
  const chosenColor = alive[Math.floor(rng() * alive.length)];
  bag[chosenColor] -= 1;
  if (bag[chosenColor] <= 0) {
    delete bag[chosenColor];
    reloadIntoDead(rng, bag, maxC);
  }
  return chosenColor;
}

export function drawPoolPiles(rng, bag, cu) {
  const nextBag = clone(bag || {});
  const maxC = Math.max(1, cu || 1);
  const target = Math.min(CONFIG.BAG_INITIAL_COLORS, maxC);
  const aliveNow = () => Object.keys(nextBag).map(Number).filter(c => nextBag[c] > 0);
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
  if (aliveNow().length === 0) {
    reloadIntoDead(rng, nextBag, maxC);
  }
  return { piles, nextBag };
}

function v2Pile(rng, cu) {
  return Array.from({ length: pickPileSize(rng) }, () => rngInt(rng, 1, cu));
}

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

function drawClientInto(s, r) {
  const total = totalClients(s);
  if ((s.run.clientsDrawn || 0) >= total) return false;
  const owned = s.progress.colorsOwned || 1;
  const cap = Math.max(1, Math.min(owned + 1, rosterCeiling(s.run)));
  const color = rngInt(r, 1, cap);
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

export function drawClient(state, rng) {
  const s = clone(state);
  if (!s.run) return s;
  drawClientInto(s, rng || Math.random);
  return s;
}

function refillClients(s, rng) {
  if (!s.run || !Array.isArray(s.run.activeClients)) return;
  const r = rng || Math.random;
  while (s.run.activeClients.length < 3) {
    if (s.run.queueBack && s.run.queueBack.length) {
      s.run.activeClients.push(s.run.queueBack.shift());
    } else if (!drawClientInto(s, r)) {
      break;
    }
  }
}

export function openRun(state, rng) {
  let s = clone(state);
  const r = rng || Math.random;
  const board = generateBoard(36, r);
  const palette = pickRunPalette(r);
  const rosterIdx = Math.min(5, rosterMax(s.progress.colorsOwned, palette.length));
  const cu = poolMaxColor(rosterIdx, s.progress.colorsOwned);
  const initialBag = initBag(r, cu);
  const { piles, nextBag } = drawPoolPiles(r, initialBag, cu);
  s.run = {
    phase: 'open', board,
    orders: [], activeClients: [],
    pool: piles,
    bag: nextBag,
    poolPlaced: 0, calamities: 0,
    calamitiesApplied: false,
    calamityWave2Applied: false,
    boardShuffleApplied: false,
    legendaries: {},
    rosterIndex: rosterIdx,
    palette,
    moneyStacks: 0,
    pilesDealt: piles.length,
    placedCounter: 0,
    runTilesActivated: 0,
    skillUses: {},
    clientsDrawn: 0,
    clientsServed: 0,
    queueBack: [],
    orderSeq: 0,
    mergeSeeds: [],
  };
  refillClients(s, r);
  for (const key of CONFIG.USES_SKILLS) {
    if (s.skills[key] && s.skills[key].owned) {
      s.skills[key].uses = s.skills[key].usesBought || 0;
    }
  }
  s = applyCalamities(s, rng);
  s.meta.lastSeenAt = s.meta.lastSeenAt;
  return s;
}
export const newRun = openRun;

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
  groups.sort((a, b) => b.length - a.length);
  return groups;
}

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
    return groups.slice(0, 8);
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

export function r2Target(board, group, color, received) {
  let best = -1, bestChain = -1, bestReceived = false, bestSize = Infinity;
  for (const gi of group) {
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

export function orderReadyOn(state, orderId, cellId) {
  const order = state.run.orders.find((o) => String(o.id) === String(orderId));
  if (!order) return false;
  const cell = state.run.board[cellId];
  if (!cell || order.served) return false;
  const tg = topGroup(cell.stack);
  return tg.color === order.color && tg.count >= order.qty;
}

export function placeStack(state, cellId, slot, rngOrStack) {
  const s = clone(state);
  const b = s.run && s.run.board;
  if (!b || cellId < 0 || cellId >= b.length) return { error: 'noCell' };
  const cell = b[cellId];
  if (cell.blocked) return { error: 'blocked' };
  if (Array.isArray(rngOrStack)) {
  const pileArr = rngOrStack;
  const pc = pileArr.length ? pileArr[pileArr.length - 1] : 0;
  const canMerge = (pc && HEX_ADJ.some(([dq, dr]) => {
    const nb = b.find((c) => c && c.q === cell.q + dq && c.r === cell.r + dr);
    return !!(nb && nb.stack && nb.stack.length && topGroup(nb.stack).color === pc);
  })) || topGroup(cell.stack).color === pc;
  if (!canMerge) {
    return { error: (cell.stack && cell.stack.length) ? 'occupied' : 'noMerge', state: s };
  }
  rememberUndo(s);
  cell.stack = cell.stack.concat(pileArr);
  s.run.anchor = (pileArr.length > 0 && pileArr.every((c) => c === pileArr[0])) ? cellId : null;
  if (!s.run.anchor && pileArr.length > 1) s.run.monoSink = true;
  return s;
  }
  const rng = rngOrStack;
  if (cell.dormant) return { error: 'dormant' };
  if (cell.stack && cell.stack.length) return { error: 'occupied' };
  if (s.run.poolPlaced >= 3 && s.run.pool.every((x) => x.length === 0)) {
    return { error: 'emptyPool' };
  }
  let idx = slot;
  if (idx === undefined) idx = s.run.pool.findIndex((x) => x.length > 0);
  if (idx < 0 || s.run.pool[idx].length === 0) return { error: 'emptySlot' };
  rememberUndo(s);
  const pile = s.run.pool[idx];
  cell.stack = cell.stack.concat(pile);
  s.run.pool[idx] = [];
  s.run.poolPlaced += 1;
  s.run.anchor = (pile.length > 0 && pile.every((c) => c === pile[0])) ? cellId : null;
  if (!s.run.anchor && pile.length > 1) s.run.monoSink = true;
  if (s.run.rosterIndex != null) {
    s.run.placedCounter = (s.run.placedCounter || 0) + 1;
    if (s.run.placedCounter >= CONFIG.UNLOCK_PLACED_PILES) {
      s.run.placedCounter = 0;
      const cap = rosterMax(s.progress.colorsOwned, rosterCeiling(s.run));
      if (s.run.rosterIndex < cap) s.run.rosterIndex = s.run.rosterIndex + 1;
    }
  }
  if (s.run.poolPlaced === 3) {
    const r = rng || Math.random;
    if (s.run.rosterIndex != null || s.run.bag != null || s.progress.colorsOwned != null) {
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
  return s;
}

function buildPick(rng, n, cu) {
  return Array.from({ length: n }, () => pile(rng || Math.random, cu));
}

export function colorRunCap(state) {
  return rosterCeiling(state && state.run);
}

export function buyColor(state) {
  const s = clone(state);
  if (s.progress.colorsOwned == null) s.progress.colorsOwned = 4;
  const cap = colorRunCap(s);
  if (s.progress.colorsOwned >= cap) return { error: 'maxed', state: s };
  const price = colorPrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s };
  s.progress.colorsOwned += 1;
  s.progress.coins -= price;
  return s;
}

export function runTilePrice(state) {
  return skillUsePrice(state, 'tables');
}

function skillUseBag(state) {
  if (state && state.run) return state.run.skillUses || null;
  return (state && state.skillUses) || null;
}

export function skillUseCount(state, power) {
  if (power === 'color') {
    const owned = (state && state.progress && state.progress.colorsOwned) || 4;
    return Math.max(0, owned - 4);
  }
  if (power === 'tips') return tipLevel(state);
  if (power === 'previewPool') {
    return (state && state.skills && state.skills.previewPool && state.skills.previewPool.level) || 0;
  }
  if (power === 'tables') {
    return (state && state.run && state.run.runTilesActivated) || 0;
  }
  const bag = skillUseBag(state);
  return (bag && bag[power]) || 0;
}

function skillPriceBase(power) {
  if (power === 'rotateBoard') return 0;
  if (power === 'clearBoard') return CONFIG.CLEAR_BOARD_BASE;
  if (power === 'unlockLocks') return CONFIG.UNLOCK_LOCKS_BASE;
  if (power === 'color') return CONFIG.COLOR_SKILL_BASE;
  return CONFIG.SKILL_USE_BASE;
}

export function skillUsePrice(state, power) {
  if (power === 'rotateBoard') return 0;
  const n = skillUseCount(state, power);
  return skillPriceBase(power) * CONFIG.SKILL_USE_RATIO ** n;
}

export function skillStartPrice(power) {
  return skillPriceBase(power);
}

const SKILL_BAR_BASE = [
  'destroyPile', 'swapPiles', 'refreshPool', 'tables', 'unlockLocks',
  'color', 'tips', 'clearBoard', 'undoMove',
];
export const SKILL_BAR_ORDER = SKILL_BAR_BASE
  .map((skill, base) => ({ skill, base, start: skillPriceBase(skill) }))
  .sort((a, b) => (a.start - b.start) || (a.base - b.base))
  .map((d) => d.skill)
  .concat(['rotateBoard']);

function rememberUndo(s) {
  if (!s || !s.run) return;
  const stack = Array.isArray(s.run.undoStack) ? s.run.undoStack : [];
  delete s.run.undoStack;
  if (s.run.undoSnap) { stack.push(s.run.undoSnap); }
  delete s.run.undoSnap;
  const snap = clone(s);
  stack.push(snap);
  const max = CONFIG.UNDO_HISTORY_MAX || 200;
  while (stack.length > max) stack.shift();
  s.run.undoStack = stack;
}

function chargeUndoable(s, power) {
  const price = skillUsePrice(s, power);
  if ((s.progress.coins || 0) < price) return { error: 'noFunds' };
  rememberUndo(s);
  return chargeSkill(s, power);
}

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

export function tipSkillLine() {
  return 'Served orders pay more.';
}

export function previewPrice(state) {
  return skillUsePrice(state, 'previewPool');
}

function v2CellOf(s, cellId) {
  if (typeof cellId === 'number') return s.run.board[cellId];
  return s.run.board.find((c) => c.id === cellId);
}

export function activateTile(state, cellId, rng) {
  let s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return { error: 'noRun', state: s };
  const cell = v2CellOf(s, cellId);
  if (!cell) return { error: 'noCell', state: s };
  if (!cell.dormant) return { error: 'notDormant', state: s };
  if (!isActivateEligible(s, cell)) return { error: 'needTwoNeighbors', state: s };
  const price = runTilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds', state: s };
  rememberUndo(s);
  cell.dormant = false;
  if (cell.hiddenStack && cell.hiddenStack.length) {
    cell.stack = (cell.stack || []).concat(cell.hiddenStack);
    delete cell.hiddenStack;
  }
  s.run.runTilesActivated = (s.run.runTilesActivated || 0) + 1;
  s.progress.coins -= price;
  s = applyCalamities(s, rng);
  return s;
}

export function activateAroundUnlocked(state, rng) {
  let s = clone(state);
  if (!s.run || !Array.isArray(s.run.board)) return { error: 'noRun', state: s };
  const unlocked = s.run.board.filter((c) => c && !c.dormant);
  const candidates = [];
  s.run.board.forEach((c, i) => {
    if (!c || !c.dormant || c.blocked) return;
    if (!unlocked.some((u) => isHexAdjacent(c, u))) return;
    if (!isActivateEligible(s, c)) return;
    candidates.push(i);
  });
  candidates.sort((a, b) => a - b);
  if (!candidates.length) return { error: 'noneEligible', state: s };
  const activated = [];
  let stoppedFunds = false;
  for (const idx of candidates) {
    const res = activateTile(s, idx, rng);
    if (res && res.error === 'noFunds') { stoppedFunds = true; break; }
    if (res && res.error) continue;
    s = res;
    activated.push(idx);
  }
  if (!activated.length) {
    return { error: stoppedFunds ? 'noFunds' : 'noneEligible', state: s };
  }
  return s;
}

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
  if (order.served) return { error: 'alreadyServed' };
  if (Array.isArray(run.activeClients) && !run.activeClients.includes(order)) {
    return { error: 'notVisible' };
  }
  let idx = cellId;
  if (idx === undefined) {
    idx = bestServeCell(run.board, order);
    if (idx < 0) return { error: 'notEnough' };
  }
  const cell = run.board[idx];
  if (!cell) return { error: 'noCell' };
  const tg = topGroup(cell.stack);
  if (tg.color !== order.color || tg.count < order.qty) {
    return { error: 'notEnough' };
  }
  rememberUndo(s);
  const coinsBefore = s.progress.coins || 0;
  cell.stack.splice(cell.stack.length - order.qty, order.qty);
  order.served = true;
  const amount = pay(order, tipLevel(s));
  s.progress.coins += amount;
  if (amount > 0) s.run.moneyStacks = (s.run.moneyStacks || 0) + 1;
  if (run.clientsServed != null && Array.isArray(run.activeClients)) {
    run.clientsServed += 1;
    run.activeClients = run.activeClients.filter((o) => o !== order);
    refillClients(s, rngFallback());
  }
  return maybeBoardShuffle(applyCalamityWave2(s, rngFallback()), coinsBefore, rngFallback());
}

function rngFallback() { return Math.random; }

export function debrisPay(runLen) {
  const base = CONFIG.DEBRIS_BONUS_PER * runLen;
  return runLen >= CONFIG.DEBRIS_BIG_OVER ? base * CONFIG.DEBRIS_BIG_MULT : base;
}

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
        if (progress) progress.coins += debrisPay(runLen);
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

export function resolveCascade(state) {
  const s = clone(state);
  const coinsBefore = (s.progress && s.progress.coins) || 0;
  let steps = 0;
  const received = new Set();
  for (let guard = 0; guard < 1000; guard++) {
    let acted = false;
    if (s.run) {
      const groups = bfsMergeGroups(s.run.board);
      if (groups.length > 0) {
        const group = groups[0];
        const tg = topGroup(s.run.board[group[0]].stack);
        const arbiterTarget = (tg) => {
          const plan = computeBestChain(s.run.board);
          const step = plan.find((p) => p.color === tg.color
            && p.source.every((si) => group.includes(si)));
          if (step && group.includes(step.target)) return step.target;
          return r2Target(s.run.board, group, tg.color, received);
        };
        let target;
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
    const visible = Array.isArray(s.run.activeClients) ? s.run.activeClients : s.run.orders;
    if (Array.isArray(visible)) {
      for (const order of visible) {
        if (!order || order.served) continue;
        if (order.cell !== null && order.cell !== undefined) continue;
        const idx = bestServeCell(s.run.board, order);
        if (idx < 0) continue;
        const cell = s.run.board[idx];
        cell.stack.splice(cell.stack.length - order.qty, order.qty);
        order.served = true;
        const servedPay = pay(order, tipLevel(s));
        s.progress.coins += servedPay;
        if (servedPay > 0) s.run.moneyStacks = (s.run.moneyStacks || 0) + 1;
        if (s.run.clientsServed != null) s.run.clientsServed += 1;
        acted = true;
      }
      if (Array.isArray(s.run.activeClients)) {
        s.run.activeClients = s.run.activeClients.filter((o) => !o.served);
      }
    }
    if (!acted) break;
    steps += 1;
  }
  if (s.run && Array.isArray(s.run.board)) {
    const hit = sweepDebrisRuns(s.run.board, s.progress);
    if (hit.length) steps += 1;
    if (hit.stacks) s.run.moneyStacks = (s.run.moneyStacks || 0) + hit.stacks;
  }
  if (Array.isArray(s.run.activeClients)) refillClients(s, rngFallback());
  if ('anchor' in s.run) delete s.run.anchor;
  if ('monoSink' in s.run) delete s.run.monoSink;
  const waved = applyCalamityWave2(s, rngFallback());
  return { state: maybeBoardShuffle(waved, coinsBefore, rngFallback()), steps };
}

export function topRunCount(stack) {
  if (!stack || !stack.length) return 0;
  const t = stack[stack.length - 1];
  let n = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i] === t; i--) n++;
  return n;
}

export const STACK_VISUAL_CAP = 6;

export function stackStepPx(hx) {
  const n = Number(hx);
  if (!Number.isFinite(n)) return 5;
  return Math.max(5, Math.round(n * 0.225));
}

export function stackLiftPadPx(hx) {
  const n = Number(hx);
  const hxN = Number.isFinite(n) ? Math.max(0, n) : 0;
  const face = Math.ceil(hxN * 0.015);
  const badgeHang = 14;
  return STACK_VISUAL_CAP * stackStepPx(hxN) + face + badgeHang;
}

export function trayStackShiftPx(count, tileH, slotH) {
  const n = count | 0;
  const h = Number(tileH) || 0;
  const slot = Number(slotH) || 0;
  if (n <= 0 || !(h > 0) || !(slot > 0)) return 0;
  return slot / 2 - h / 2;
}

export function stackVisual(stack) {
  const tiles = Array.isArray(stack) ? stack : [];
  const total = tiles.length;
  const hasBase = total > STACK_VISUAL_CAP;
  const shown = hasBase ? tiles.slice(total - STACK_VISUAL_CAP) : tiles.slice();
  const layers = shown.map((color, i) => ({ color, lift: i }));
  const topLift = layers.length ? layers[layers.length - 1].lift : 0;
  const run = topRunCount(tiles);
  return {
    total,
    hasBase,
    layers,
    topLift,
    showRun: run > 1,
    run,
    runColor: total ? tiles[total - 1] : 0,
    showTotal: total >= 2,
  };
}

export function isServeReady(state, cellId) {
  if (!state || !state.run || !Array.isArray(state.run.board)) return false;
  const cell = typeof cellId === 'number'
    ? state.run.board[cellId]
    : state.run.board.find((c) => c && c.id === cellId);
  if (!cell) return false;
  const tg = topGroup(cell.stack);
  if (!tg.color) return false;
  const pool = Array.isArray(state.run.activeClients) ? state.run.activeClients : state.run.orders;
  return (pool || []).some((o) =>
    o && !o.served && o.color === tg.color && tg.count >= o.qty);
}

export function expandTile(state, q, r) {
  const s = clone(state);
  const guard = expandTileCheck(s, q, r);
  if (guard) return guard;
  const price = tilePrice(s);
  if (s.progress.coins < price) return { error: 'noFunds' };
  s.run.board.push({
    id: `c${s.progress.boardCells}`, q, r,
    stack: [], blocked: false, calamity: false, calamityStack: false,
  });
  s.progress.boardCells += 1;
  s.progress.coins -= price;
  return s;
}

export function closeRun(state, reason = 'manual') {
  const valid = new Set(['full', 'allServed', 'manual']);
  if (!valid.has(reason)) reason = 'manual';
  const s = clone(state);
  if (!s.run) return s;
  const bonus = bonusCalamity(s.run);
  s.progress.coins += bonus;
  s.metaClose = {
    reason,
    bonus,
    victory: reason === 'allServed',
    served: s.run.clientsServed != null
      ? s.run.clientsServed
      : s.run.orders.filter((o) => o.served).length,
    total: s.run.clientsServed != null ? totalClients(s) : s.run.orders.length,
  };
  s.progress.totalGames += 1;
  s.progress.cafeLevel = s.progress.totalGames + 1;
  s.progress.colorsUnlocked = colorsUnlocked(s.progress.productsBought);
  s.run = null;
  return s;
}

export function buySkill(state, power) {
  if (power === 'tables' || power === 'serveManual') return { error: 'noSkill' };
  const sk = state.skills && state.skills[power];
  if (!sk) return { error: 'noSkill' };
  const s = clone(state);
  if (power === 'previewPool') {
    const level = sk.level || 0;
    const price = previewPrice(s);
    if (s.progress.coins < price) return { error: 'noFunds' };
    s.progress.coins -= price;
    s.skills.previewPool.owned = true;
    s.skills.previewPool.level = level + 1;
    return s;
  }
  if (power === 'capacidad') return { error: 'retired' };
  {
    const sk2 = s.skills[power];
    const cost = Math.round(sk2.price * Math.pow(1.35, sk2.usesBought || 0));
    if (s.progress.coins < cost) return { error: 'noFunds' };
    s.progress.coins -= cost;
    sk2.usesBought = (sk2.usesBought || 0) + 1;
    sk2.owned = true;
    sk2.uses = (sk2.uses || 0) + 1;
    return s;
  }
}

export function useQueueSkip(state) {
  const s = clone(state);
  if (!s.run || !Array.isArray(s.run.activeClients)) return { error: 'noRun' };
  const bill = chargeUndoable(s, 'queueSkip');
  if (bill) return bill;
  const old = s.run.activeClients.splice(0, s.run.activeClients.length);
  s.run.queueBack.push(...old);
  for (let i = 0; i < 3; i++) drawClientInto(s, Math.random);
  refillClients(s, Math.random);
  return s;
}

export function usesUpPrice(state, power) {
  return CONFIG.USES_UP_BASE * Math.pow(CONFIG.USES_UP_RATIO, buysOf(state, power));
}
function buysOf(state, power) {
  const sk = state && state.skills && state.skills[power];
  return (sk && sk.usesBought) || 0;
}
export function buyUsesUp(state, power) {
  const sk = state && state.skills && state.skills[power];
  if (!sk) return { error: 'noSkill' };
  if (power === 'tables' || !CONFIG.USES_SKILLS.includes(power)) return { error: 'noUsesModel' };
  const s = clone(state);
  const cur = s.skills[power];
  if (!cur.owned) return { error: 'locked' };
  const price = CONFIG.USES_UP_BASE * Math.pow(CONFIG.USES_UP_RATIO, cur.usesBought || 0);
  if (s.progress.coins < price) return { error: 'noFunds' };
  cur.usesBought = (cur.usesBought || 0) + 1;
  cur.uses = (cur.uses || 0) + 1;
  s.progress.coins -= price;
  return s;
}

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
  if (!sk || !sk.owned) return { error: 'locked' };
  if (sk.uses <= 0) return { error: 'noUses' };
  return null;
}

export function useDestroyPile(state, cellId) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const cell = s.run.board[cellId];
  if (!cell) return { error: 'noCell' };
  if (cell.blocked) return { error: 'blocked' };
  const bill = chargeUndoable(s, 'destroyPile');
  if (bill) return bill;
  cell.stack = [];
  return s;
}

export function useSwapPiles(state, a, b) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const board = s.run.board;
  if (a === b) return { error: 'same' };
  if (!board[a] || !board[b]) return { error: 'noCell' };
  if (board[a].blocked || board[b].blocked) return { error: 'blocked' };
  const bill = chargeUndoable(s, 'swapPiles');
  if (bill) return bill;
  const tmp = board[a].stack;
  board[a].stack = board[b].stack;
  board[b].stack = tmp;
  return s;
}

export function useUnlockLocks(state, cellId) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const cell = s.run.board[cellId];
  if (!cell) return { error: 'noCell' };
  if (!cell.blocked) return { error: 'notBlocked' };
  const bill = chargeUndoable(s, 'unlockLocks');
  if (bill) return bill;
  cell.blocked = false;
  if (cell.hiddenStack && cell.hiddenStack.length) {
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
  const r = rng || Math.random;
  const cu = poolMaxColor(s.run && s.run.rosterIndex, s.progress.colorsOwned);
  const { piles, nextBag } = drawPoolPiles(r, s.run && s.run.bag, cu);
  s.run.pool = piles;
  s.run.bag = nextBag;
  s.run.pilesDealt = (s.run.pilesDealt || 0) + piles.length;
  s.run.poolPlaced = 0;
  return s;
}

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

export function undoStackOf(state) {
  const run = state && state.run;
  if (!run) return [];
  const st = Array.isArray(run.undoStack) ? run.undoStack.slice() : [];
  if (run.undoSnap) st.push(run.undoSnap);
  return st;
}

export function undoTopCoins(state) {
  const st = undoStackOf(state);
  const top = st[st.length - 1];
  return top && top.progress ? (top.progress.coins || 0) : null;
}

export function useRotateBoard(state) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const bill = chargeUndoable(s, 'rotateBoard');
  if (bill) return bill;
  return s;
}

export function useUndoMove(state) {
  const s = clone(state);
  if (!s.run) return { error: 'noRun' };
  const stack = undoStackOf(s);
  const snap = stack.pop();
  if (!snap || !snap.run || !snap.progress) return { error: 'nothingToUndo' };
  const n = skillUseCount(s, 'undoMove');
  const price = skillUsePrice(s, 'undoMove');
  const restored = snap.progress.coins || 0;
  if (restored < price) return { error: 'noFunds' };
  const next = clone(snap);
  delete next.run.undoSnap;
  for (const old of stack) {
    if (old && old.progress) old.progress.coins = (old.progress.coins || 0) - price;
  }
  next.run.undoStack = stack;
  next.progress.coins = restored - price;
  if (!next.run.skillUses) next.run.skillUses = {};
  next.run.skillUses.undoMove = n + 1;
  return next;
}

export function buyExpansion(state, kind) {
  const cfg = CONFIG.EXPAND[kind];
  if (!cfg) return { error: 'noKind' };
  const s = clone(state);
  const price = Math.round(cfg.price(s));
  if (s.progress.coins < price) return { error: 'noFunds' };
  if (kind === 'clients') s.progress.clients += cfg.per;
  if (kind === 'board') s.progress.boardCells += cfg.per;
  if (kind === 'products') {
    s.progress.productsBought += cfg.per;
    s.progress.colorsUnlocked = colorsUnlocked(s.progress.productsBought);
  }
  s.progress.coins -= price;
  return s;
}

export function buyMultiplier(state) {
  const s = clone(state);
  if (!s.progress.econ || typeof s.progress.econ !== 'object') s.progress.econ = { multLevel: 0 };
  const lvl = tipLevel(s);
  const price = tipPrice(s);
  if (s.progress.coins < price) return { error: 'noFunds' };
  s.progress.coins -= price;
  s.progress.econ.multLevel = lvl + 1;
  if (!s.economy || typeof s.economy !== 'object') s.economy = {};
  s.economy.multLevel = s.progress.econ.multLevel;
  return s;
}

export function buyIdleUpgrade(state, system) {
  const s = clone(state);
  const cur = s.idle[system];
  if (!cur) return { error: 'noSystem' };
  const price = CONFIG.IDLE_PRICE * (cur.level + 1) * (cur.level + 1);
  if (s.progress.coins < price) return { error: 'noFunds' };
  s.progress.coins -= price;
  const lvl = cur.level + 1;
  s.idle[system] = {
    level: lvl,
    ratePerSec: CONFIG.IDLE_RATE[system] * lvl,
    cap: CONFIG.IDLE_CAP[system] * lvl,
  };
  return s;
}

export function tickIdle(state, dt) {
  const s = clone(state);
  const coinsBefore = s.progress.coins || 0;
  let total = 0;
  for (const k of ['workers', 'fame', 'machines']) {
    total += s.idle[k].ratePerSec * (dt || 0);
  }
  s.progress.coins += total;
  return maybeBoardShuffle(s, coinsBefore, rngFallback());
}

export function applyOffline(state, now) {
  const s = clone(state);
  s.meta.lastSeenAt = now ?? s.meta.lastSeenAt;
  s.meta.offlineReport = { workers: 0, fame: 0, machines: 0, total: 0 };
  return s;
}

function snapshotSkillUses(state) {
  const uses = {};
  for (const skill of SKILL_BAR_ORDER) uses[skill] = skillUseCount(state, skill);
  return uses;
}

export function finishedRunRecord(state) {
  const run = state && state.run;
  if (!run) return null;
  const served = run.clientsServed || 0;
  const purse = state.progress && state.progress.coins;
  return {
    clientsServed: served,
    moneyStacks: run.moneyStacks || 0,
    pilesDealt: run.pilesDealt || 0,
    victory: run.phase === 'victory' || served >= totalClients(state),
    coins: Math.max(0, Math.floor(purse || 0)),
    skillUses: snapshotSkillUses(state),
  };
}

function historyRows(history) {
  return Array.isArray(history) ? history.filter((row) => row && typeof row === 'object') : [];
}

function runIsBetter(a, b, aIndex, bIndex) {
  const clients = (row) => (row && row.clientsServed) || 0;
  const stacks = (row) => (row && row.moneyStacks) || 0;
  const piles = (row) => (row && row.pilesDealt) || 0;
  if (clients(a) !== clients(b)) return clients(a) > clients(b);
  if (stacks(a) !== stacks(b)) return stacks(a) > stacks(b);
  if (piles(a) !== piles(b)) return piles(a) > piles(b);
  return aIndex > bIndex;
}

export function pushRunHistory(history, record, max = CONFIG.RUN_HISTORY_MAX) {
  const next = historyRows(history);
  if (record) next.push(record);
  const cap = max > 0 ? max : CONFIG.RUN_HISTORY_MAX;
  if (next.length <= cap) return next;
  const keep = new Set(topRuns(next, cap));
  return next.filter((row) => keep.has(row));
}

export function topRuns(history, limit = CONFIG.TOP_RUNS) {
  const list = historyRows(history);
  const ranked = list.map((row, index) => ({ row, index }));
  ranked.sort((a, b) => {
    if (runIsBetter(a.row, b.row, a.index, b.index)) return -1;
    if (runIsBetter(b.row, a.row, b.index, a.index)) return 1;
    return 0;
  });
  const n = limit > 0 ? limit : CONFIG.TOP_RUNS;
  return ranked.slice(0, n).map((d) => d.row);
}

export function bestWorstRuns(history) {
  const list = historyRows(history);
  if (!list.length) return { best: null, worst: null };
  let bestI = 0;
  let worstI = 0;
  for (let i = 1; i < list.length; i++) {
    if (runIsBetter(list[i], list[bestI], i, bestI)) bestI = i;
    if (runIsBetter(list[worstI], list[i], worstI, i)) worstI = i;
  }
  return { best: list[bestI], worst: list[worstI] };
}

function historyAfterRun(state) {
  const prev = state && Array.isArray(state.runHistory) ? state.runHistory : [];
  return pushRunHistory(prev, finishedRunRecord(state));
}

export function restartRun(state, rng) {
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

export function beginVictory(state) {
  const s = clone(state);
  if (!s.run) return s;
  if (s.run.phase === 'victory') return s;
  if (!runVictory(s)) return s;
  s.run.phase = 'victory';
  delete s.run.victoryBonus;
  delete s.run.undoSnap;
  delete s.run.undoStack;
  s.run.archived = true;
  s.runHistory = pushRunHistory(s.runHistory, finishedRunRecord(s));
  s.metaClose = {
    reason: 'allServed',
    bonus: 0,
    victory: true,
    served: s.run.clientsServed,
    total: totalClients(s),
  };
  return s;
}

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

export function serializeState(state) {
  if (state && state.run && state.run.boardShuffleFrom) {
    const copy = clone(state);
    delete copy.run.boardShuffleFrom;
    return JSON.stringify(copy);
  }
  return JSON.stringify(state);
}

function freshGameKeepingTutorial(blob) {
  const fresh = createGame();
  const flag = blob && blob.settings ? blob.settings.seenTutorial : undefined;
  if (flag !== false) fresh.settings.seenTutorial = true;
  return fresh;
}

export function deserializeState(json) {
  try {
    const s = JSON.parse(json);
    if (s && s.version === 1) {
      if (!s.settings || s.settings.epoch !== 21) return freshGameKeepingTutorial(s);
      if (s.progress) {
        if (s.progress.colorsOwned == null) s.progress.colorsOwned = 4;
      }
      if (s.skills) {
        if (!s.skills.previewPool) s.skills.previewPool = { owned: false, level: 0 };
        if (!s.skills.queueSkip) s.skills.queueSkip = { owned: false, uses: 0, usesBought: 0 };
        if (!s.skills.capacidad) s.skills.capacidad = { owned: false, level: 0 };
        if (!s.skills.unlockLocks) s.skills.unlockLocks = { owned: false, uses: 0, usesBought: 0 };
      }
      if (s.run) {
        if (!Array.isArray(s.run.activeClients)) {
          const act = (s.run.orders || []).slice(0, 3);
          s.run.orders = act;
          s.run.activeClients = act;
          s.run.clientsDrawn = act.length;
          s.run.clientsServed = act.filter((o) => o.served).length;
          if (s.run.orderSeq == null) s.run.orderSeq = act.length;
        }
        if (s.run.queueBack == null) s.run.queueBack = [];
        if (s.run.mergeSeeds == null) s.run.mergeSeeds = [];
        if (s.run.clientsDrawn == null) s.run.clientsDrawn = (s.run.orders || []).length;
        if (s.run.clientsServed == null) {
          s.run.clientsServed = (s.run.orders || []).filter((o) => o.served).length;
        }
        if (s.run.orderSeq == null) s.run.orderSeq = (s.run.orders || []).length;
        if (s.run.rosterIndex == null) s.run.rosterIndex = 5;
        if (s.run.boardShuffleApplied == null) s.run.boardShuffleApplied = false;
        delete s.run.boardShuffleFrom;
        if (Array.isArray(s.run.board)) repairBoardGeometry(s.run.board);
      }
      if (!s.settings) s.settings = { reducedMotion: false };
      if (s.settings.seenTutorial == null) s.settings.seenTutorial = true;
      if (s.settings.boardRot == null) s.settings.boardRot = 0;
      if (!Array.isArray(s.runHistory)) s.runHistory = [];
      dropPermanentTableFields(s);
      syncTipLevel(s);
      return s;
    }
    return createGame();
  } catch (e) {
    return createGame();
  }
}

function dropPermanentTableFields(s) {
  if (!s || typeof s !== 'object') return s;
  if (s.progress && Object.prototype.hasOwnProperty.call(s.progress, 'permTiles')) {
    delete s.progress.permTiles;
  }
  if (s.skills && Object.prototype.hasOwnProperty.call(s.skills, 'tables')) {
    delete s.skills.tables;
  }
  if (s.skills && Object.prototype.hasOwnProperty.call(s.skills, 'serveManual')) {
    delete s.skills.serveManual;
  }
  return s;
}

export function importSave(json) {
  try {
    const s = JSON.parse(json);
    if (!s || s.version !== 1 || !s.progress || !s.meta) return { error: 'invalid' };
    if (!s.settings || s.settings.epoch !== 21) return freshGameKeepingTutorial(s);
    dropPermanentTableFields(s);
    syncTipLevel(s);
    if (s.run && s.run.boardShuffleFrom) delete s.run.boardShuffleFrom;
    if (s.run && Array.isArray(s.run.board)) repairBoardGeometry(s.run.board);
    return s;
  } catch (e) {
    return { error: 'invalid' };
  }
}

export function makeExportId(ms = 0) {
  return `ccc-1-${ms}`;
}

export function brandExportId(state, ms) {
  const s = clone(state);
  if (!s.meta.exportId) s.meta.exportId = `ccc-1-${ms}`;
  return s;
}