// Shared meta.v1 writer. Same steps in every app: read, merge, write, post.
// Never throws. At most one record write per second, including backfill and flush.

let metaWroteAt = 0;
let metaTimer = 0;
let metaPending = null;

function metaIsDemo() {
  try {
    const loc = globalThis.location || (globalThis.window && globalThis.window.location);
    if (!loc) return false;
    const params = new URLSearchParams(loc.search || '');
    const on = (name) => {
      const v = params.get(name);
      return v === '1' || v === 'true';
    };
    return on('demo') || on('preview');
  } catch (e) {
    return false;
  }
}

function metaPlainVersion(version) {
  const s = version == null ? '' : String(version);
  return s.charAt(0) === 'v' || s.charAt(0) === 'V' ? s.slice(1) : s;
}

function metaFinite(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

// Declared keys only, in declared order, at most 20.
// A monotonic key keeps the greater of the stored and new values.
// A declared key omitted from this call keeps its stored value.
function metaMergeStats(prevStats, given) {
  const prev = prevStats && typeof prevStats === 'object' && !Array.isArray(prevStats) ? prevStats : {};
  const next = given && typeof given === 'object' && !Array.isArray(given) ? given : {};
  const stats = {};
  const list = STATS.slice(0, 20);
  for (const spec of list) {
    const hasNew = Object.prototype.hasOwnProperty.call(next, spec.key) && metaFinite(next[spec.key]);
    const hasOld = metaFinite(prev[spec.key]);
    if (hasNew && spec.monotonic && hasOld) stats[spec.key] = Math.max(prev[spec.key], next[spec.key]);
    else if (hasNew) stats[spec.key] = next[spec.key];
    else if (hasOld) stats[spec.key] = prev[spec.key];
  }
  return stats;
}

function metaUnionLogros(prev, next) {
  const ids = [];
  const push = (list) => {
    if (!Array.isArray(list)) return;
    for (const id of list) {
      if (typeof id !== 'string' || !id || ids.includes(id)) continue;
      ids.push(id);
    }
  };
  push(prev);
  push(next);
  ids.sort();
  return ids;
}

function metaStored(raw, slug) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    if (parsed.v !== 1 || parsed.slug !== slug) return null;
    return parsed;
  } catch (e) {
    return null;
  }
}

export function metaUpdate(slug, version, input) {
  try {
    if (metaIsDemo()) return null;
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const key = 'meta.v1.' + slug;
    let prev = {};
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = metaStored(raw, slug);
        if (parsed) prev = parsed;
      }
    } catch (e) {
      prev = {};
    }
    const stats = metaMergeStats(prev.stats, input && input.stats);
    const logros = metaUnionLogros(prev.logros, input && input.logros);
    const prevHitos = prev.hitos && typeof prev.hitos === 'object' && !Array.isArray(prev.hitos) ? prev.hitos : {};
    const now = new Date().toISOString();
    const hitos = {};
    for (const id of logros) {
      const old = prevHitos[id];
      hitos[id] = typeof old === 'string' && old ? old : now;
    }
    const record = {
      v: 1,
      slug,
      version: metaPlainVersion(version),
      updatedAt: now,
      stats,
      logros,
      hitos,
    };
    storage.setItem(key, JSON.stringify(record));
    try {
      const w = globalThis.window;
      if (w && w.parent && w.parent !== w) {
        w.parent.postMessage({ type: 'meta', key, data: record }, globalThis.location.origin);
      }
    } catch (e) {}
    return record;
  } catch (e) {
    return null;
  }
}

// Missing key: write once from the snapshot. A valid record is left untouched.
// Unreadable JSON, a non-object, v !== 1, or a slug mismatch is copied to
// meta.v1.<slug>.corrupt and rebuilt (hitos = this write).
export function metaBackfill(slug, version, snapshot) {
  try {
    if (metaIsDemo()) return false;
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const key = 'meta.v1.' + slug;
    const raw = storage.getItem(key);
    if (raw != null && metaStored(raw, slug)) return false;
    if (raw != null) {
      try { storage.setItem(key + '.corrupt', raw); } catch (e) {}
    }
    const record = metaUpdate(slug, version, snapshot || {});
    if (record) metaWroteAt = Date.now();
    return !!record;
  } catch (e) {
    return false;
  }
}

// Queue one record write. A call inside the same second only marks it pending.
export function metaSchedule(slug, version, snapshot) {
  try {
    if (metaIsDemo()) return;
    metaPending = { slug, version, snapshot };
    const now = Date.now();
    if (now - metaWroteAt >= 1000) {
      metaFlush();
      return;
    }
    if (metaTimer) return;
    metaTimer = setTimeout(() => {
      metaTimer = 0;
      metaFlush();
    }, 1000 - (now - metaWroteAt));
  } catch (e) {}
}

// Write the pending snapshot, and only when the one-per-second window is open.
export function metaFlush() {
  try {
    if (metaIsDemo()) {
      metaPending = null;
      if (metaTimer) { clearTimeout(metaTimer); metaTimer = 0; }
      return;
    }
    if (!metaPending) return;
    const now = Date.now();
    if (now - metaWroteAt < 1000) return;
    if (metaTimer) { clearTimeout(metaTimer); metaTimer = 0; }
    const pending = metaPending;
    metaPending = null;
    metaWroteAt = now;
    const snap = typeof pending.snapshot === 'function' ? pending.snapshot() : pending.snapshot;
    metaUpdate(pending.slug, pending.version, snap || {});
  } catch (e) {}
}

export function metaResetClock() {
  try {
    if (metaTimer) clearTimeout(metaTimer);
  } catch (e) {}
  metaTimer = 0;
  metaPending = null;
  metaWroteAt = 0;
}

// ---------------------------------------------------------------------------
// Café snapshot. Stat keys and achievement ids stay stable.
// Counted sittings are runHistory plus the open sitting when it is not
// already archived there. Totals stop at the history cap (20).
// ---------------------------------------------------------------------------

function metaNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

function metaTipLevel(state) {
  const n = state && state.progress && state.progress.econ && state.progress.econ.multLevel;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

// Declared stat keys, in write order. monotonic: totals, finished counts, bests, highest levels.
export const STATS = [
  { key: 'runs_finished', monotonic: true }, // finished sittings kept in runHistory
  { key: 'victories', monotonic: true }, // kept sittings that served 100 guests
  { key: 'best_clients', monotonic: true }, // most guests served in one counted sitting
  { key: 'clients_total', monotonic: true }, // guests served across counted sittings
  { key: 'guests_now', monotonic: false }, // guests served in the open sitting
  { key: 'best_coins', monotonic: true }, // highest purse in a kept sitting or the live purse
  { key: 'coins', monotonic: false }, // coins in the live café
  { key: 'best_stacks', monotonic: true }, // most paid stacks in one counted sitting
  { key: 'stacks_total', monotonic: true }, // paid stacks across counted sittings
  { key: 'best_trays', monotonic: true }, // most trays dealt in one counted sitting
  { key: 'trays_total', monotonic: true }, // trays dealt across counted sittings
  { key: 'colors_owned', monotonic: true }, // highest colors owned
  { key: 'tip_level', monotonic: true }, // highest tip multiplier level
  { key: 'tables_opened', monotonic: true }, // most tables activated in a sitting
  { key: 'skills_used', monotonic: true }, // skill uses across counted sittings
  { key: 'best_skill_uses', monotonic: true }, // most uses of one skill in a counted sitting
  { key: 'calamities_seen', monotonic: false }, // calamity cells on the open board
  { key: 'tutorial_done', monotonic: true }, // 1 after the spotlight is finished or skipped
];

function metaBlankStats() {
  const stats = {};
  for (const spec of STATS) stats[spec.key] = 0;
  return stats;
}

function metaSkillTotals(uses) {
  let total = 0;
  let best = 0;
  if (!uses || typeof uses !== 'object' || Array.isArray(uses)) return { total, best };
  for (const key of Object.keys(uses)) {
    const n = metaNum(uses[key]);
    total += n;
    if (n > best) best = n;
  }
  return { total, best };
}

// Color, tips, and tables live on the café, not only in run.skillUses.
function metaLiveSkills(state) {
  const run = state.run || {};
  const bag = run.skillUses && typeof run.skillUses === 'object' && !Array.isArray(run.skillUses) ? run.skillUses : {};
  const uses = {};
  for (const key of Object.keys(bag)) {
    const n = metaNum(bag[key]);
    if (n > 0) uses[key] = n;
  }
  const colors = Math.max(0, metaNum(state.progress && state.progress.colorsOwned) - 4);
  if (colors > 0) uses.color = colors;
  const tips = metaTipLevel(state);
  if (tips > 0) uses.tips = tips;
  const tables = metaNum(run.runTilesActivated);
  if (tables > 0) uses.tables = tables;
  return uses;
}

function metaWon(clients, victory) {
  return victory === true || clients >= 100;
}

function metaFold(stats, sitting) {
  stats.clients_total += sitting.clients;
  stats.stacks_total += sitting.stacks;
  stats.trays_total += sitting.trays;
  stats.skills_used += sitting.skillTotal;
  if (sitting.clients > stats.best_clients) stats.best_clients = sitting.clients;
  if (sitting.coins > stats.best_coins) stats.best_coins = sitting.coins;
  if (sitting.stacks > stats.best_stacks) stats.best_stacks = sitting.stacks;
  if (sitting.trays > stats.best_trays) stats.best_trays = sitting.trays;
  if (sitting.bestSkill > stats.best_skill_uses) stats.best_skill_uses = sitting.bestSkill;
  if (sitting.victory) stats.victories += 1;
}

// Ids are stable. `met` reads the stat snapshot above.
export const META_ACHIEVEMENTS = [
  { id: 'first_service', met: (s) => s.clients_total >= 1 }, // one guest served
  { id: 'tutorial_done', met: (s) => s.tutorial_done >= 1 }, // spotlight finished or skipped
  { id: 'guests_10', met: (s) => s.best_clients >= 10 }, // 10 guests in one sitting
  { id: 'guests_50', met: (s) => s.best_clients >= 50 }, // 50 guests in one sitting
  { id: 'second_wave', met: (s) => s.best_clients >= 80 }, // 80 guests (second calamity wave)
  { id: 'full_service', met: (s) => s.best_clients >= 100 }, // 100 guests in one sitting
  { id: 'sittings_3', met: (s) => s.runs_finished >= 3 }, // three finished sittings kept
  { id: 'coins_1000', met: (s) => s.best_coins >= 1000 }, // purse reached 1000
  { id: 'coins_100000', met: (s) => s.best_coins >= 100000 }, // purse reached 100000 (board shuffle)
  { id: 'colors_8', met: (s) => s.colors_owned >= 8 }, // eight colors owned (run palette)
  { id: 'paid_stacks_20', met: (s) => s.best_stacks >= 20 }, // 20 paid stacks in one sitting
  { id: 'skill_used', met: (s) => s.skills_used >= 1 }, // one skill used in a counted sitting
];

export function metaFromState(state) {
  const stats = metaBlankStats();
  if (!state || typeof state !== 'object') {
    return { stats, logros: [] };
  }
  const progress = state.progress && typeof state.progress === 'object' ? state.progress : {};
  stats.coins = metaNum(progress.coins);
  stats.colors_owned = metaNum(progress.colorsOwned);
  stats.tip_level = metaTipLevel(state);
  stats.tutorial_done = state.settings && state.settings.seenTutorial === true ? 1 : 0;
  const history = Array.isArray(state.runHistory) ? state.runHistory : [];
  const rows = history.filter((row) => row && typeof row === 'object');
  stats.runs_finished = rows.length;
  for (const row of rows) {
    const clients = metaNum(row.clientsServed);
    const skills = metaSkillTotals(row.skillUses);
    metaFold(stats, {
      clients,
      coins: metaNum(row.coins),
      stacks: metaNum(row.moneyStacks),
      trays: metaNum(row.pilesDealt),
      victory: metaWon(clients, row.victory),
      skillTotal: skills.total,
      bestSkill: skills.best,
    });
  }
  const run = state.run && typeof state.run === 'object' ? state.run : null;
  if (run) {
    stats.guests_now = metaNum(run.clientsServed);
    stats.tables_opened = metaNum(run.runTilesActivated);
    stats.calamities_seen = metaNum(run.calamities);
    if (!run.archived) {
      const skills = metaSkillTotals(metaLiveSkills(state));
      metaFold(stats, {
        clients: stats.guests_now,
        coins: stats.coins,
        stacks: metaNum(run.moneyStacks),
        trays: metaNum(run.pilesDealt),
        victory: metaWon(stats.guests_now, run.phase === 'victory'),
        skillTotal: skills.total,
        bestSkill: skills.best,
      });
    }
  }
  if (stats.coins > stats.best_coins) stats.best_coins = stats.coins;
  const logros = [];
  for (const item of META_ACHIEVEMENTS) {
    if (item.met(stats)) logros.push(item.id);
  }
  logros.sort();
  return { stats, logros };
}
