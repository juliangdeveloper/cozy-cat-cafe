// meta.v1 migration: a save without the key, an existing record, and corrupt JSON.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { metaUpdate, metaBackfill, metaFromState, META_ACHIEVEMENTS } from '../js/meta.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const SAVE_KEY = 'cozy-cat-cafe.save.v1';
const META_KEY = 'meta.v1.cozy-cat-cafe';
const VERSION = 'v2.24.35';
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
  assert.equal(record.version, VERSION);
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

test('corrupt JSON does not crash', () => {
  useStorage({ [META_KEY]: '{not json', [SAVE_KEY]: '{"version":1}' });
  assert.doesNotThrow(() => metaBackfill('cozy-cat-cafe', VERSION, metaFromState(oldSave)));
  assert.equal(globalThis.localStorage.getItem(META_KEY), '{not json');
  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), '{"version":1}');
  let record = null;
  assert.doesNotThrow(() => {
    record = metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 1, guests_now: NaN }, logros: ['first_service'] });
  });
  assert.equal(record.v, 1);
  assert.equal(record.stats.coins, 1);
  assert.equal(record.stats.guests_now, undefined);
  assert.deepEqual(record.logros, ['first_service']);
  assert.equal(JSON.parse(globalThis.localStorage.getItem(SAVE_KEY)).version, 1);
  const thrown = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
  };
  assert.equal(metaUpdate('cozy-cat-cafe', VERSION, { stats: { coins: 1 }, logros: [] }), null);
  assert.equal(metaBackfill('cozy-cat-cafe', VERSION, { stats: {}, logros: [] }), false);
  assert.equal(metaFromState({ runHistory: 'nope', run: 'x', progress: null }).logros.length, 0);
  globalThis.localStorage = thrown;
});

test('a later update unions logros and keeps the first timestamp', () => {
  useStorage({});
  const first = metaUpdate('cozy-cat-cafe', VERSION, {
    stats: { coins: 10, runs_finished: 1 },
    logros: ['first_service'],
  });
  const second = metaUpdate('cozy-cat-cafe', VERSION, {
    stats: { runs_finished: 2, coins: Number.NaN, guests_now: 4, best_coins: Infinity },
    logros: ['full_service', 'first_service', 'full_service'],
  });
  assert.deepEqual(second.stats, { runs_finished: 2, guests_now: 4 });
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

test('the café debounces progress writes and backfills on boot', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.35'/);
  assert.match(html, /import \{ metaUpdate, metaBackfill, metaFromState \} from '\.\/js\/meta\.js'/);
  assert.match(html, /const META_SLUG = 'cozy-cat-cafe'/);
  assert.match(html, /metaBackfill\(META_SLUG, GAME_VERSION, metaFromState\(state\)\)/);
  assert.match(html, /function scheduleMeta\(\)/);
  assert.match(html, /since >= 1000/);
  assert.match(html, /1000 - since/);
  assert.match(html, /function flushMeta\(\)/);
  assert.match(html, /beforeunload', \(\)=>\{ persist\(\); flushMeta\(\); \}/);
  assert.equal(html.includes('meta.v1.cozy-cat-cafe'), false);
  assert.equal(html.includes("removeItem(META_KEY)"), false);
  assert.equal(html.includes("removeItem('meta"), false);
});
});
