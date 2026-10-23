// Shared meta.v1 writer. Same steps in every app: read, merge, write, post.
// Never throws. Normal use writes the record at most once per second, including
// backfill. Hiding the page flushes a pending change immediately.

let metaWroteAt = 0;
let metaTimer = 0;
let metaPending = null;

// Project status, set by hand and bumped with the version. Never computed from play.
// fase 1-6: Idea, Definición, Diseño, Construcción, Validación, Lanzamiento y mantenimiento.
// fase_estado 0-4: pendiente, en curso, bloqueada, en revisión, completada.
export const PROYECTO = {
  objetivo: 'Juego cozy de café para móvil: apilar comida en hexágonos y servir a 100 clientes, con tutorial y habilidades.',
  fase: 6,
  fase_estado: 1,
  fases_completadas: 5
};

let proyectoSource = PROYECTO;

function proyectoInt(n, lo, hi) {
  return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
}

// Clean copy of a proyecto block, or null when any field is missing or out of range.
export function metaProyecto(p) {
  try {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const o = p.objetivo;
    if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
    if (!proyectoInt(p.fase, 1, 6) || !proyectoInt(p.fase_estado, 0, 4) || !proyectoInt(p.fases_completadas, 0, 6)) return null;
    return { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
  } catch (e) {
    return null;
  }
}

// Tests only: swap the block the writer uses (null restores PROYECTO).
export function metaSetProyecto(p) {
  proyectoSource = p === null ? PROYECTO : p;
}

// Adds the current proyecto block to a record being written, when it is valid.
function withProyecto(record) {
  const p = metaProyecto(proyectoSource);
  if (p) record.proyecto = p;
  return record;
}

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
    withProyecto(record);
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

// Write the pending snapshot. A normal call waits until a second has passed
// since the last record write. immediate (page hide or tab hidden) writes a
// pending change now. With nothing pending, this does nothing.
export function metaFlush(immediate) {
  try {
    if (metaIsDemo()) {
      metaPending = null;
      if (metaTimer) { clearTimeout(metaTimer); metaTimer = 0; }
      return;
    }
    if (!metaPending) return;
    const now = Date.now();
    if (!immediate && now - metaWroteAt < 1000) return;
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
// already archived there. runHistory keeps only the 20 best sittings, so the
// lifetime totals (META_TOTALS) come from running counters once
// metaTotalsStart has read the record: finished sittings plus the open one.
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
  { key: 'runs_finished', monotonic: true }, // finished sittings, lifetime
  { key: 'victories', monotonic: true }, // sittings that served 100 guests, lifetime
  { key: 'best_clients', monotonic: true }, // most guests served in one counted sitting
  { key: 'clients_total', monotonic: true }, // guests served, lifetime
  { key: 'guests_now', monotonic: false }, // guests served in the open sitting
  { key: 'best_coins', monotonic: true }, // highest purse in a kept sitting or the live purse
  { key: 'coins', monotonic: false }, // coins in the live café
  { key: 'best_stacks', monotonic: true }, // most paid stacks in one counted sitting
  { key: 'stacks_total', monotonic: true }, // paid stacks, lifetime
  { key: 'best_trays', monotonic: true }, // most trays dealt in one counted sitting
  { key: 'trays_total', monotonic: true }, // trays dealt, lifetime
  { key: 'colors_owned', monotonic: true }, // highest colors owned
  { key: 'tip_level', monotonic: true }, // highest tip multiplier level
  { key: 'tables_opened', monotonic: true }, // most tables activated in a sitting
  { key: 'skills_used', monotonic: true }, // skill uses, lifetime
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

// One sitting as counted for meta, read from the live café.
function metaSitting(state) {
  const run = state.run && typeof state.run === 'object' ? state.run : {};
  const progress = state.progress && typeof state.progress === 'object' ? state.progress : {};
  const clients = metaNum(run.clientsServed);
  const skills = metaSkillTotals(metaLiveSkills(state));
  return {
    clients,
    coins: metaNum(progress.coins),
    stacks: metaNum(run.moneyStacks),
    trays: metaNum(run.pilesDealt),
    victory: metaWon(clients, run.phase === 'victory'),
    skillTotal: skills.total,
    bestSkill: skills.best,
  };
}

// Lifetime totals. These keys are running counters in the record.
const META_TOTALS = ['runs_finished', 'victories', 'clients_total', 'stacks_total', 'trays_total', 'skills_used'];

// Finished-sitting totals behind the record. null until metaTotalsStart.
let metaBase = null;

function metaTotalsOf(sitting, finished) {
  return {
    runs_finished: finished ? 1 : 0,
    victories: sitting.victory ? 1 : 0,
    clients_total: sitting.clients,
    stacks_total: sitting.stacks,
    trays_total: sitting.trays,
    skills_used: sitting.skillTotal,
  };
}

// The open sitting's share of the totals. Zero once it is archived.
function metaLiveTotals(state) {
  const run = state && state.run && typeof state.run === 'object' ? state.run : null;
  if (!run || run.archived) return metaTotalsOf({ clients: 0, stacks: 0, trays: 0, skillTotal: 0, victory: false }, false);
  return metaTotalsOf(metaSitting(state), false);
}

// Call once on load, after metaBackfill. Reads the stored totals as the
// running counters: stored value minus the open sitting, never below the
// runHistory estimate. With no record (demo, no storage) totals stay on runHistory.
export function metaTotalsStart(slug, state) {
  metaBase = null;
  try {
    if (metaIsDemo() || !state || typeof state !== 'object') return;
    const storage = globalThis.localStorage;
    if (!storage) return;
    const raw = storage.getItem('meta.v1.' + slug);
    const record = raw ? metaStored(raw, slug) : null;
    if (!record) return;
    const stored = record.stats && typeof record.stats === 'object' && !Array.isArray(record.stats) ? record.stats : {};
    const estimate = metaFromState(state).stats;
    const live = metaLiveTotals(state);
    const base = {};
    for (const key of META_TOTALS) {
      const fromHistory = Math.max(0, estimate[key] - live[key]);
      const fromRecord = metaFinite(stored[key]) ? Math.max(0, Math.floor(stored[key]) - live[key]) : 0;
      base[key] = Math.max(fromHistory, fromRecord);
    }
    metaBase = base;
  } catch (e) {
    metaBase = null;
  }
}

// Call once per finished sitting, with the café as it finished: after
// beginVictory, or before restartRun when the sitting was not archived.
export function metaRunFinished(state) {
  try {
    if (!metaBase || !state || typeof state !== 'object' || !state.run) return;
    const add = metaTotalsOf(metaSitting(state), true);
    for (const key of META_TOTALS) metaBase[key] += add[key];
  } catch (e) {}
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
    if (!run.archived) metaFold(stats, metaSitting(state));
  }
  if (metaBase) {
    const live = metaLiveTotals(state);
    for (const key of META_TOTALS) stats[key] = metaBase[key] + live[key];
  }
  if (stats.coins > stats.best_coins) stats.best_coins = stats.coins;
  const logros = [];
  for (const item of META_ACHIEVEMENTS) {
    if (item.met(stats)) logros.push(item.id);
  }
  logros.sort();
  return { stats, logros };
}
