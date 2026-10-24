
let metaWroteAt = 0;
let metaTimer = 0;
let metaPending = null;

export const FASE = Object.freeze({ IDEA: 1, DEFINICION: 2, DISENO: 3, CONSTRUCCION: 4, VALIDACION: 5, LANZAMIENTO_Y_MANTENIMIENTO: 6, DESCARTADA: 7 });
export const ESTADO_FASE = Object.freeze({ PENDIENTE: 0, EN_CURSO: 1, BLOQUEADA: 2, EN_REVISION: 3, COMPLETADA: 4 });
export const TIPO_STAT = Object.freeze({ TOTAL_ACUMULADO: 'total_acumulado', MEJOR_MARCA: 'mejor_marca', VALOR_ACTUAL: 'valor_actual' });
export const TIPO_PROYECTO = Object.freeze({ PROYECTO: 'proyecto', AREA: 'area', RECURSO: 'recurso', ARCHIVO: 'archivo' });

export const PROYECTO = {
  objetivo: 'Juego cozy de café publicado en la App Store: apilar comida en hexágonos y servir clientes, con tutorial y habilidades.',
  fase: FASE.CONSTRUCCION,
  fase_estado: ESTADO_FASE.EN_CURSO,
  fases_completadas: 3
};

let proyectoSource = PROYECTO;

function proyectoInt(n, lo, hi) {
  return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;
}

export function enumValido(enumeracion, valor) {
  return Object.values(enumeracion).indexOf(valor) !== -1;
}

export function statConservaMaximo(tipo) {
  return tipo === TIPO_STAT.TOTAL_ACUMULADO || tipo === TIPO_STAT.MEJOR_MARCA;
}

export function statsDeclarados(stats) {
  if (Array.isArray(stats)) return stats;
  if (!stats || typeof stats !== 'object') return [];
  return Object.keys(stats).map(function (key) { return { key: key, tipo: stats[key] && stats[key].tipo }; });
}

export function metaProyecto(p) {
  try {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const o = p.objetivo;
    if (typeof o !== 'string' || !o.trim() || Array.from(o).length > 140) return null;
    if (!enumValido(FASE, p.fase) || !enumValido(ESTADO_FASE, p.fase_estado) || !proyectoInt(p.fases_completadas, 0, FASE.LANZAMIENTO_Y_MANTENIMIENTO)) return null;
    if (p.tipo !== undefined && !enumValido(TIPO_PROYECTO, p.tipo)) return null;
    const bloque = { objetivo: o, fase: p.fase, fase_estado: p.fase_estado, fases_completadas: p.fases_completadas };
    if (p.tipo !== undefined) bloque.tipo = p.tipo;
    return bloque;
  } catch (e) {
    return null;
  }
}

export function metaSetProyecto(p) {
  proyectoSource = p === null ? PROYECTO : p;
}

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

function metaMergeStats(prevStats, given) {
  const prev = prevStats && typeof prevStats === 'object' && !Array.isArray(prevStats) ? prevStats : {};
  const next = given && typeof given === 'object' && !Array.isArray(given) ? given : {};
  const stats = {};
  const list = statsDeclarados(STATS).slice(0, 20);
  for (const spec of list) {
    const hasNew = Object.prototype.hasOwnProperty.call(next, spec.key) && metaFinite(next[spec.key]);
    const hasOld = metaFinite(prev[spec.key]);
    if (hasNew && statConservaMaximo(spec.tipo) && hasOld) stats[spec.key] = Math.max(prev[spec.key], next[spec.key]);
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


function metaNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

function metaTipLevel(state) {
  const n = state && state.progress && state.progress.econ && state.progress.econ.multLevel;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

export const STATS = Object.freeze({
  runs_finished: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas terminadas' },
  victories: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'partidas ganadas' },
  best_clients: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'clientes servidos en una partida' },
  clients_total: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'clientes servidos' },
  guests_now: { tipo: TIPO_STAT.VALOR_ACTUAL, unidad: 'clientes servidos en la partida en curso' },
  best_coins: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'monedas' },
  coins: { tipo: TIPO_STAT.VALOR_ACTUAL, unidad: 'monedas' },
  best_stacks: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'pilas cobradas en una partida' },
  stacks_total: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'pilas cobradas' },
  best_trays: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'bandejas repartidas en una partida' },
  trays_total: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'bandejas repartidas' },
  colors_owned: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'colores de comida desbloqueados' },
  tip_level: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'nivel de mejora de propinas' },
  tables_opened: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'mesas abiertas en una partida' },
  skills_used: { tipo: TIPO_STAT.TOTAL_ACUMULADO, unidad: 'usos de habilidades' },
  best_skill_uses: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'usos de una misma habilidad en una partida' },
  calamities_seen: { tipo: TIPO_STAT.VALOR_ACTUAL, unidad: 'calamidades en la partida en curso' },
  tutorial_done: { tipo: TIPO_STAT.MEJOR_MARCA, unidad: 'tutorial completado: 1 sí, 0 no' }
});

function metaBlankStats() {
  const stats = {};
  for (const key of Object.keys(STATS)) stats[key] = 0;
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

const META_TOTALS = Object.keys(STATS).filter((key) => STATS[key].tipo === TIPO_STAT.TOTAL_ACUMULADO);

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

function metaLiveTotals(state) {
  const run = state && state.run && typeof state.run === 'object' ? state.run : null;
  if (!run || run.archived) return metaTotalsOf({ clients: 0, stacks: 0, trays: 0, skillTotal: 0, victory: false }, false);
  return metaTotalsOf(metaSitting(state), false);
}

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

export function metaRunFinished(state) {
  try {
    if (!metaBase || !state || typeof state !== 'object' || !state.run) return;
    const add = metaTotalsOf(metaSitting(state), true);
    for (const key of META_TOTALS) metaBase[key] += add[key];
  } catch (e) {}
}

export const META_ACHIEVEMENTS = [
  { id: 'first_service', met: (s) => s.clients_total >= 1 },
  { id: 'tutorial_done', met: (s) => s.tutorial_done >= 1 },
  { id: 'guests_10', met: (s) => s.best_clients >= 10 },
  { id: 'guests_50', met: (s) => s.best_clients >= 50 },
  { id: 'second_wave', met: (s) => s.best_clients >= 80 },
  { id: 'full_service', met: (s) => s.best_clients >= 100 },
  { id: 'sittings_3', met: (s) => s.runs_finished >= 3 },
  { id: 'coins_1000', met: (s) => s.best_coins >= 1000 },
  { id: 'coins_100000', met: (s) => s.best_coins >= 100000 },
  { id: 'colors_8', met: (s) => s.colors_owned >= 8 },
  { id: 'paid_stacks_20', met: (s) => s.best_stacks >= 20 },
  { id: 'skill_used', met: (s) => s.skills_used >= 1 },
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
