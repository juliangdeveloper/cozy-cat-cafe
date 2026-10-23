// Shared meta.v1 writer. Same steps in every app: read, merge, write, post.
// Never throws. A bad stored value is ignored and the write starts fresh.

function metaCleanStats(obj) {
  const stats = {};
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return stats;
  for (const key of Object.keys(obj)) {
    const n = obj[key];
    if (typeof n === 'number' && Number.isFinite(n)) stats[key] = n;
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

export function metaUpdate(slug, version, input) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const key = 'meta.v1.' + slug;
    let prev = {};
    try {
      const raw = storage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) prev = parsed;
      }
    } catch (e) {
      prev = {};
    }
    // Replace stats with the finite numbers from this call.
    const stats = metaCleanStats(input && input.stats);
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
      version: version == null ? '' : String(version),
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

// Writes once, and only when the key is absent. An existing value stays, even if it is not JSON.
export function metaBackfill(slug, version, snapshot) {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return false;
    const key = 'meta.v1.' + slug;
    if (storage.getItem(key) != null) return false;
    metaUpdate(slug, version, snapshot || {});
    return true;
  } catch (e) {
    return false;
  }
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

function metaBlankStats() {
  return {
    runs_finished: 0, // finished sittings kept in runHistory
    victories: 0, // kept sittings that served 100 guests
    best_clients: 0, // most guests served in one counted sitting
    clients_total: 0, // guests served across counted sittings
    guests_now: 0, // guests served in the open sitting
    best_coins: 0, // highest purse in a kept sitting or the live purse
    coins: 0, // coins in the live café
    best_stacks: 0, // most paid stacks in one counted sitting
    stacks_total: 0, // paid stacks across counted sittings
    best_trays: 0, // most trays dealt in one counted sitting
    trays_total: 0, // trays dealt across counted sittings
    colors_owned: 0, // colors owned in the live café
    tip_level: 0, // tip multiplier level
    tables_opened: 0, // tables activated in the open sitting
    skills_used: 0, // skill uses across counted sittings
    best_skill_uses: 0, // most uses of one skill in a counted sitting
    calamities_seen: 0, // calamity cells on the open board
    tutorial_done: 0, // 1 after the spotlight is finished or skipped
  };
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
