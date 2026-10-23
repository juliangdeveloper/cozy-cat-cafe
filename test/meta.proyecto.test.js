// meta.v1 proyecto block: written when valid, left out when invalid, optional on read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metaUpdate, metaBackfill, metaResetClock, metaProyecto, metaSetProyecto, PROYECTO, STATS,
} from '../js/meta.js';

const SLUG = 'cozy-cat-cafe';
const KEY = 'meta.v1.' + SLUG;

function useStorage(initial) {
  const bag = Object.assign({}, initial);
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) { bag[k] = String(v); },
    removeItem(k) { delete bag[k]; },
  };
  delete globalThis.window;
  delete globalThis.location;
  return bag;
}

test.beforeEach(() => { metaResetClock(); metaSetProyecto(null); });
test.after(() => metaSetProyecto(null));

test('PROYECTO is a valid block within the shared ranges', () => {
  assert.deepEqual(metaProyecto(PROYECTO), { ...PROYECTO });
  assert.ok(Array.from(PROYECTO.objetivo).length <= 140);
  assert.equal(STATS.some((s) => s.key === 'proyecto' || s.key.startsWith('fase')), false);
});

test('backfill and updates write the proyecto block outside stats', () => {
  const bag = useStorage();
  assert.equal(metaBackfill(SLUG, 'v9.9.9', { stats: { coins: 1 }, logros: [] }), true);
  let rec = JSON.parse(bag[KEY]);
  assert.deepEqual(rec.proyecto, { ...PROYECTO });
  assert.equal('proyecto' in rec.stats, false);
  rec = metaUpdate(SLUG, 'v9.9.9', { stats: { coins: 2 }, logros: [] });
  assert.equal(rec.v, 1);
  assert.deepEqual(JSON.parse(bag[KEY]).proyecto, { ...PROYECTO });
});

test('an invalid block is left out and never throws', () => {
  const bad = [
    'x', [], {},
    { ...PROYECTO, objetivo: '' },
    { ...PROYECTO, objetivo: 'a'.repeat(141) },
    { ...PROYECTO, objetivo: 5 },
    { ...PROYECTO, fase: 0 }, { ...PROYECTO, fase: 7 }, { ...PROYECTO, fase: 2.5 }, { ...PROYECTO, fase: '4' },
    { ...PROYECTO, fase_estado: -1 }, { ...PROYECTO, fase_estado: 5 },
    { ...PROYECTO, fases_completadas: 7 }, { ...PROYECTO, fases_completadas: NaN },
    { get objetivo() { throw new Error('boom'); } },
  ];
  for (const p of bad) {
    assert.equal(metaProyecto(p), null);
    const bag = useStorage();
    metaResetClock();
    metaSetProyecto(p);
    let rec;
    assert.doesNotThrow(() => { rec = metaUpdate(SLUG, 'v9.9.9', { stats: { coins: 3 }, logros: [] }); });
    assert.ok(rec);
    const stored = JSON.parse(bag[KEY]);
    assert.equal('proyecto' in stored, false);
    assert.equal(stored.stats.coins, 3);
  }
});

test('an old record without proyecto is still valid and gains the block', () => {
  const old = {
    v: 1, slug: SLUG, version: '2.24.37', updatedAt: '2026-01-01T00:00:00.000Z',
    stats: { coins: 7 }, logros: ['first_service'], hitos: { first_service: '2026-01-01T00:00:00.000Z' },
  };
  const bag = useStorage({ [KEY]: JSON.stringify(old) });
  assert.equal(metaBackfill(SLUG, 'v9.9.9', { stats: { coins: 1 }, logros: [] }), false);
  assert.equal(bag[KEY + '.corrupt'], undefined);
  assert.equal(bag[KEY], JSON.stringify(old));
  const rec = metaUpdate(SLUG, 'v9.9.9', { stats: {}, logros: [] });
  assert.equal(rec.hitos.first_service, '2026-01-01T00:00:00.000Z');
  assert.equal(rec.stats.coins, 7);
  assert.deepEqual(rec.proyecto, { ...PROYECTO });
});

test('a stored record with a different proyecto gets the current block on the next write', () => {
  const old = {
    v: 1, slug: SLUG, version: '2.24.37', updatedAt: '2026-01-01T00:00:00.000Z',
    stats: { coins: 7 }, logros: ['first_service'], hitos: { first_service: '2026-01-01T00:00:00.000Z' },
    proyecto: { extra: 1, objetivo: 'Objetivo anterior.', fase: 2, fase_estado: 3, fases_completadas: 1 },
  };
  const bag = useStorage({ [KEY]: JSON.stringify(old) });
  metaUpdate(SLUG, 'v9.9.9', { stats: {}, logros: [] });
  const rec = JSON.parse(bag[KEY]);
  assert.deepEqual(rec.proyecto, { ...PROYECTO });
  assert.equal(rec.hitos.first_service, '2026-01-01T00:00:00.000Z');
  assert.equal(bag[KEY + '.corrupt'], undefined);

  // With an invalid current block the stale one is dropped, not kept.
  metaSetProyecto({ fase: 9 });
  metaResetClock();
  const second = useStorage({ [KEY]: JSON.stringify(old) });
  metaUpdate(SLUG, 'v9.9.9', { stats: {}, logros: [] });
  assert.equal('proyecto' in JSON.parse(second[KEY]), false);
});
