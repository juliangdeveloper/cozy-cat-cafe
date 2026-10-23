// meta.v1 migration: a save without the key, an existing record, and corrupt JSON.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  metaUpdate, metaBackfill, metaFromState, metaSchedule, metaFlush, metaResetClock,
  META_ACHIEVEMENTS, STATS,
} from '../js/meta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const SAVE_KEY = 'cozy-cat-cafe.save.v1';
const META_KEY = 'meta.v1.cozy-cat-cafe';
const VERSION = 'v2.24.36';
const PLAIN = '2.24.36';
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function memoryStorage(initial) {
  const bag = Object.assign({}, initial);
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) { bag[k] = String(v); },
    removeItem(k) { delete bag[k]; },
    bag,
  };
}

function useStorage(initial) {
  globalThis.localStorage = memoryStorage(initial);
  delete globalThis.window;
  delete globalThis.location;
}

const oldSave = {
  version: 1,
  progress: { coins: 2500, colorsOwned: 6, econ: { multLevel: 2 } },
  settings: { seenTutorial: true, epoch: 21 },
  runHistory: [
    { clientsServed: 40, moneyStacks: 12, pilesDealt: 30, victory: false, coins: 800, skillUses: { destroyPile: 2, tables: 3 } },
    { clientsServed: 100, moneyStacks: 40, pilesDealt: 80, victory: true, coins: 5000, skillUses: { clearBoard: 1, tips: 2, rotateBoard: 0 } },
  ],
  run: {
    phase: 'open',
    archived: false,
    clientsServed: 15,
    moneyStacks: 4,
    pilesDealt: 10,
    calamities: 3,
    runTilesActivated: 5,
    skillUses: { refreshPool: 1 },
  },
};

const expectedStats = {
  runs_finished: 2,
  victories: 1,
  best_clients: 100,
  clients_total: 155,
  guests_now: 15,
  best_coins: 5000,
  coins: 2500,
  best_stacks: 40,
  stacks_total: 56,
  best_trays: 80,
  trays_total: 120,
  colors_owned: 6,
  tip_level: 2,
  tables_opened: 5,
  skills_used: 18,
  best_skill_uses: 5,
  calamities_seen: 3,
  tutorial_done: 1,
};

const expectedLogros = [
  'coins_1000',
  'first_service',
  'full_service',
  'guests_10',
  'guests_50',
  'paid_stacks_20',
  'second_wave',
  'skill_used',
  'tutorial_done',
];

describe('meta.v1', { concurrency: false }, () => {
test.beforeEach(() => metaResetClock());
test('an old save without the key produces a meta.v1 record', () => {
  const rawSave = JSON.stringify(oldSave);
  useStorage({ [SAVE_KEY]: rawSave });
  const snap = metaFromState(oldSave);
  assert.deepEqual(snap.stats, expectedStats);
  assert.deepEqual(snap.logros, expectedLogros);
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, snap), true);
  const record = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.deepEqual(Object.keys(record), ['v', 'slug', 'version', 'updatedAt', 'stats', 'logros', 'hitos']);
  assert.equal(record.v, 1);
  assert.equal(record.slug, 'cozy-cat-cafe');
  assert.equal(record.version, PLAIN);
  assert.match(record.updatedAt, ISO);
  assert.deepEqual(record.stats, expectedStats);
  assert.deepEqual(record.logros, expectedLogros);
  assert.deepEqual(Object.keys(record.hitos), expectedLogros);
  for (const id of expectedLogros) assert.equal(record.hitos[id], record.updatedAt);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, snap), false);
  assert.equal(globalThis.localStorage.getItem(META_KEY), JSON.stringify(record));
});

test('backfill does not overwrite an existing record', () => {
  const existing = {
    v: 1,
    slug: 'cozy-cat-cafe',
    version: 'v2.24.10',
    updatedAt: '2020-01-01T00:00:00.000Z',
    stats: { runs_finished: 9, coins: 3 },
    logros: ['first_service'],
    hitos: { first_service: '2020-01-01T00:00:00.000Z' },
  };
  const rawSave = JSON.stringify(oldSave);
  const rawMeta = JSON.stringify(existing);
  useStorage({ [SAVE_KEY]: rawSave, [META_KEY]: rawMeta });
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, metaFromState(oldSave)), false);
  assert.equal(globalThis.localStorage.getItem(META_KEY), rawMeta);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
});

test('a corrupt record is copied aside and rebuilt', () => {
  const rawSave = JSON.stringify(oldSave);
  const junk = '{not json';
  useStorage({ [META_KEY]: junk, [SAVE_KEY]: rawSave });
  assert.doesNotThrow(() => metaBackfill('cozy-cat-cafe', VERSION, metaFromState(oldSave)));
  assert.equal(globalThis.localStorage.getItem(META_KEY + '.corrupt'), junk);
  const record = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(record.v, 1);
  assert.equal(record.slug, 'cozy-cat-cafe');
  assert.equal(record.version, PLAIN);
  assert.deepEqual(record.stats, expectedStats);
  assert.deepEqual(record.logros, expectedLogros);
  for (const id of expectedLogros) assert.equal(record.hitos[id], record.updatedAt);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  const kept = globalThis.localStorage.getItem(META_KEY);
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, metaFromState(oldSave)), false);
  assert.equal(globalThis.localStorage.getItem(META_KEY), kept);
  assert.equal(globalThis.localStorage.getItem(META_KEY + '.corrupt'), junk);

  const wrong = JSON.stringify({ v: 9, slug: 'other-game', stats: { coins: 1 }, logros: ['foreign'], hitos: { foreign: '2020-01-01T00:00:00.000Z' } });
  useStorage({ [META_KEY]: wrong, [SAVE_KEY]: rawSave });
  metaResetClock();
  assert.doesNotThrow(() => metaBackfill('cozy-cat-cafe', VERSION, { stats: { coins: 4 }, logros: [] }));
  assert.equal(globalThis.localStorage.getItem(META_KEY + '.corrupt'), wrong);
  const rebuilt = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(rebuilt.v, 1);
  assert.equal(rebuilt.slug, 'cozy-cat-cafe');
  assert.deepEqual(rebuilt.logros, []);
  assert.equal(rebuilt.stats.coins, 4);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);

  const foreign = JSON.stringify({ v: 1, slug: 'other-game', stats: { coins: 9 }, logros: ['foreign'], hitos: { foreign: '2020-01-01T00:00:00.000Z' } });
  useStorage({ [META_KEY]: foreign, [SAVE_KEY]: rawSave });
  metaResetClock();
  metaBackfill('cozy-cat-cafe', VERSION, { stats: { coins: 2 }, logros: [] });
  assert.equal(globalThis.localStorage.getItem(META_KEY + '.corrupt'), foreign);
  const fromSlug = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(fromSlug.slug, 'cozy-cat-cafe');
  assert.equal(fromSlug.stats.coins, 2);
  assert.deepEqual(fromSlug.logros, []);

  useStorage({ [META_KEY]: '[]', [SAVE_KEY]: rawSave });
  metaResetClock();
  metaBackfill('cozy-cat-cafe', VERSION, { stats: { coins: 1 }, logros: [] });
  assert.equal(globalThis.localStorage.getItem(META_KEY + '.corrupt'), '[]');
  const fromArray = JSON.parse(globalThis.localStorage.getItem(META_KEY));
  assert.equal(fromArray.v, 1);
  assert.equal(fromArray.stats.coins, 1);
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
});

test('storage failures and a blocked clock do not throw', () => {
  useStorage({});
  let record = null;
  assert.doesNotThrow(() => {
    record = metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 1, guests_now: NaN }, logros: ['first_service'] });
  });
  assert.equal(record.version, PLAIN);
  assert.equal(record.stats.coins, 1);
  assert.equal(record.stats.guests_now, undefined);
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 1 }, logros: [] }), null);
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, { stats: {}, logros: [] }), false);
  assert.equal(metaFromState({ runHistory: 'nope', run: 'x', progress: null }).logros.length, 0);
});

test('a later update unions logros and keeps the first timestamp', () => {
  useStorage({});
  const first = metaUpdate('cozy-cat-cafe', VERSION, {
    stats: { coins: 10, runs_finished: 1 },
    logros: ['first_service'],
  });
  const second = metaUpdate('cozy-cat-cafe', VERSION, {
    stats: { runs_finished: 2, coins: Number.NaN, guests_now: 4, best_coins: Infinity, blob: 'x'.repeat(5000) },
    logros: ['full_service', 'first_service', 'full_service'],
  });
  assert.equal(second.stats.runs_finished, 2);
  assert.equal(second.stats.guests_now, 4);
  assert.equal(second.stats.coins, 10);
  assert.equal(second.stats.blob, undefined);
  assert.deepEqual(Object.keys(second.stats), ['runs_finished', 'guests_now', 'coins']);
  assert.deepEqual(second.logros, ['first_service', 'full_service']);
  assert.equal(second.hitos.first_service, first.hitos.first_service);
  assert.equal(second.hitos.full_service, second.updatedAt);
  assert.notEqual(second.hitos.first_service, undefined);
});

test('a framed page posts the record to the parent origin', () => {
  useStorage({});
  const messages = [];
  const parent = { postMessage: (data, origin) => messages.push({ data, origin }) };
  globalThis.window = { parent };
  globalThis.location = { origin: 'https://play.example' };
  const record = metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 2 }, logros: [] });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].origin, 'https://play.example');
  assert.equal(messages[0].data.type, 'meta');
  assert.equal(messages[0].data.key, META_KEY);
  assert.equal(messages[0].data.data, record);
  const top = {};
  top.parent = top;
  globalThis.window = top;
  messages.length = 0;
  metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 3 }, logros: [] });
  assert.equal(messages.length, 0);
  delete globalThis.window;
  delete globalThis.location;
});

test('an archived sitting is not counted twice', () => {
  const snap = metaFromState({
    progress: { coins: 5000, colorsOwned: 4, econ: { multLevel: 0 } },
    settings: { seenTutorial: false },
    runHistory: [
      { clientsServed: 100, moneyStacks: 40, pilesDealt: 80, victory: true, coins: 5000, skillUses: { clearBoard: 1 } },
    ],
    run: { phase: 'victory', archived: true, clientsServed: 100, moneyStacks: 40, pilesDealt: 80, calamities: 2, runTilesActivated: 1 },
  });
  assert.equal(snap.stats.clients_total, 100);
  assert.equal(snap.stats.victories, 1);
  assert.equal(snap.stats.stacks_total, 40);
  assert.equal(snap.stats.guests_now, 100);
  assert.equal(snap.stats.skills_used, 1);
  assert.equal(snap.logros.includes('full_service'), true);
  assert.equal(snap.logros.includes('sittings_3'), false);
});

test('stat keys and achievement ids stay inside the shared limits', () => {
  const ids = META_ACHIEVEMENTS.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 5 && ids.length <= 12);
  for (const id of ids) assert.match(id, /^[a-z][a-z0-9_]*$/);
  const snap = metaFromState(null);
  const keys = Object.keys(snap.stats);
  assert.ok(keys.length >= 1 && keys.length <= 20);
  for (const key of keys) {
    assert.match(key, /^[a-z][a-z0-9_]*$/);
    assert.equal(typeof snap.stats[key], 'number');
    assert.equal(Number.isFinite(snap.stats[key]), true);
  }
  assert.deepEqual(snap.logros, []);
});

test('declared stats are capped at 20 and undeclared keys are dropped', () => {
  assert.ok(STATS.length >= 1 && STATS.length <= 20);
  const given = { photo: 'a'.repeat(8000) };
  for (let i = 0; i < 25; i++) given['extra_' + i] = i;
  for (const spec of STATS) given[spec.key] = 3;
  useStorage({});
  const record = metaUpdate('cozy-cat-cafe', VERSION, { stats: given, logros: [] });
  assert.deepEqual(Object.keys(record.stats), STATS.map((spec) => spec.key));
  assert.equal(record.stats.photo, undefined);
  assert.equal(record.stats.extra_0, undefined);
  assert.ok(JSON.stringify(record).length < 4000);
});

test('monotonic stats keep the greater value when history shrinks', () => {
  useStorage({});
  metaUpdate('cozy-cat-cafe', VERSION, {
    stats: {
      runs_finished: 20, victories: 4, clients_total: 500, stacks_total: 80,
      trays_total: 200, skills_used: 30, best_clients: 100, best_coins: 9000,
      best_stacks: 40, best_trays: 80, best_skill_uses: 6, colors_owned: 8,
      tip_level: 3, tables_opened: 12, tutorial_done: 1, coins: 50, guests_now: 40,
    },
    logros: [],
  });
  const next = metaUpdate('cozy-cat-cafe', VERSION, {
    stats: {
      runs_finished: 12, victories: 1, clients_total: 90, stacks_total: 10,
      trays_total: 20, skills_used: 2, best_clients: 15, best_coins: 100,
      best_stacks: 4, best_trays: 8, best_skill_uses: 1, colors_owned: 4,
      tip_level: 0, tables_opened: 1, tutorial_done: 0, coins: 5, guests_now: 2,
      calamities_seen: 1,
    },
    logros: [],
  });
  assert.equal(next.stats.runs_finished, 20);
  assert.equal(next.stats.victories, 4);
  assert.equal(next.stats.clients_total, 500);
  assert.equal(next.stats.stacks_total, 80);
  assert.equal(next.stats.trays_total, 200);
  assert.equal(next.stats.skills_used, 30);
  assert.equal(next.stats.best_clients, 100);
  assert.equal(next.stats.best_coins, 9000);
  assert.equal(next.stats.best_stacks, 40);
  assert.equal(next.stats.best_trays, 80);
  assert.equal(next.stats.best_skill_uses, 6);
  assert.equal(next.stats.colors_owned, 8);
  assert.equal(next.stats.tip_level, 3);
  assert.equal(next.stats.tables_opened, 12);
  assert.equal(next.stats.tutorial_done, 1);
  assert.equal(next.stats.coins, 5);
  assert.equal(next.stats.guests_now, 2);
  assert.equal(next.stats.calamities_seen, 1);
});

test('at most one meta write per second, including backfill and flush', async () => {
  const writes = [];
  const bag = {};
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) {
      if (k === META_KEY) writes.push(v);
      bag[k] = String(v);
    },
    removeItem(k) { delete bag[k]; },
  };
  const snap = () => ({ stats: { coins: writes.length + 1, runs_finished: 2 }, logros: [] });
  try {
    assert.equal(metaBackfill('cozy-cat-cafe', VERSION, snap()), true);
    assert.equal(writes.length, 1);
    metaSchedule('cozy-cat-cafe', VERSION, snap);
    metaFlush();
    assert.equal(writes.length, 1);
    await new Promise((r) => setTimeout(r, 1200));
    assert.equal(writes.length, 2);
    metaFlush();
    assert.equal(writes.length, 2);
    metaSchedule('cozy-cat-cafe', VERSION, snap);
    metaFlush();
    assert.equal(writes.length, 2);
  } finally {
    metaResetClock();
  }
});

test('demo and preview do not write or postMessage', () => {
  useStorage({});
  const messages = [];
  const parent = { postMessage: (data, origin) => messages.push({ data, origin }) };
  globalThis.window = { parent };
  globalThis.location = { search: '?demo=1', origin: 'https://play.example' };
  assert.equal(metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 8 }, logros: ['first_service'] }), null);
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, { stats: { coins: 8 }, logros: ['first_service'] }), false);
  metaSchedule('cozy-cat-cafe', VERSION, () => ({ stats: { coins: 8 }, logros: ['first_service'] }));
  metaFlush();
  assert.equal(globalThis.localStorage.getItem(META_KEY), null);
  assert.equal(messages.length, 0);
  globalThis.location = { search: '?preview=true', origin: 'https://play.example' };
  metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 8 }, logros: [] });
  metaBackfill('cozy-cat-cafe', VERSION, { stats: { coins: 8 }, logros: [] });
  assert.equal(globalThis.localStorage.getItem(META_KEY), null);
  assert.equal(messages.length, 0);
  delete globalThis.window;
  delete globalThis.location;
});

test('the café save stays byte-identical through backfill and a later update', () => {
  const rawSave = JSON.stringify(oldSave);
  const state = JSON.parse(rawSave);
  useStorage({ [SAVE_KEY]: rawSave });
  metaFromState(state);
  assert.equal(JSON.stringify(state), rawSave);
  metaBackfill('cozy-cat-cafe', VERSION, metaFromState(state));
  metaUpdate('cozy-cat-cafe', VERSION, metaFromState({
    ...state,
    progress: { ...state.progress, coins: (state.progress.coins || 0) + 15 },
    run: { ...state.run, clientsServed: (state.run.clientsServed || 0) + 1 },
  }));
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), rawSave);
  assert.equal(JSON.stringify(state), rawSave);
});

test('the café schedules one meta write and flushes only when one is pending', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.36'/);
  assert.match(html, /import \{ metaBackfill, metaFromState, metaSchedule, metaFlush \} from '\.\/js\/meta\.js'/);
  assert.match(html, /const META_SLUG = 'cozy-cat-cafe'/);
  assert.match(html, /metaBackfill\(META_SLUG, GAME_VERSION, metaFromState\(state\)\)/);
  assert.match(html, /function scheduleMeta\(\)/);
  assert.match(html, /metaSchedule\(META_SLUG, GAME_VERSION/);
  assert.match(html, /function flushMeta\(\)/);
  assert.match(html, /metaFlush\(\)/);
  assert.match(html, /function leaveCafe\(\)/);
  assert.match(html, /beforeunload', leaveCafe\)/);
  assert.match(html, /pagehide', leaveCafe\)/);
  assert.equal(html.includes('metaLast'), false);
  assert.equal(html.includes('meta.v1.cozy-cat-cafe'), false);
  assert.equal(html.includes("removeItem(META_KEY)"), false);
  assert.equal(html.includes("removeItem('meta"), false);
});
});
