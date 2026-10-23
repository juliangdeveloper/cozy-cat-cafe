import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metaUpdate, metaBackfill, metaFromState, metaResetClock, metaTotalsStart, metaRunFinished,
} from '../js/meta.js';
import {
  createGame, openRun, restartRun, beginVictory, totalClients, serializeState, deserializeState,
} from '../js/game.js';

const SLUG = 'cozy-cat-cafe';
const META_KEY = 'meta.v1.' + SLUG;
const VERSION = '2.24.41';

function useStorage(initial) {
  const bag = Object.assign({}, initial);
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) { bag[k] = String(v); },
    removeItem(k) { delete bag[k]; },
  };
  delete globalThis.window;
  delete globalThis.location;
}

function seeded() {
  let x = 7;
  return () => {
    x = (x * 16807) % 2147483647;
    return x / 2147483647;
  };
}

function stored() {
  return JSON.parse(globalThis.localStorage.getItem(META_KEY)).stats;
}

function write(state) {
  return metaUpdate(SLUG, VERSION, metaFromState(state));
}

function finishByRestart(state, rng, clients) {
  state.run.clientsServed = clients;
  state.run.moneyStacks = 2;
  state.run.pilesDealt = 3;
  const finishing = state;
  const next = restartRun(state, rng);
  metaRunFinished(finishing);
  return next;
}

describe('meta.v1 lifetime totals', { concurrency: false }, () => {
  test.beforeEach(() => {
    metaResetClock();
    metaTotalsStart(SLUG, null);
  });

  test('totals keep counting past the 20 sittings kept in runHistory', () => {
    useStorage();
    const rng = seeded();
    let state = openRun(createGame(), rng);
    metaBackfill(SLUG, VERSION, metaFromState(state));
    metaTotalsStart(SLUG, state);
    for (let i = 0; i < 25; i++) {
      state = finishByRestart(state, rng, 7);
      write(state);
    }
    assert.equal(state.runHistory.length, 20);
    let stats = stored();
    assert.equal(stats.runs_finished, 25);
    assert.equal(stats.clients_total, 175);
    assert.equal(stats.stacks_total, 50);
    assert.equal(stats.trays_total, 75 + state.run.pilesDealt);
    assert.equal(stats.victories, 0);

    state.run.clientsServed = 4;
    write(state);
    assert.equal(stored().clients_total, 179);
    assert.equal(stored().runs_finished, 25);

    state.run.clientsServed = totalClients(state);
    state = beginVictory(state);
    metaRunFinished(state);
    write(state);
    stats = stored();
    assert.equal(stats.runs_finished, 26);
    assert.equal(stats.victories, 1);
    assert.equal(stats.clients_total, 175 + totalClients(state));

    const finishing = state.run.archived ? null : state;
    state = restartRun(state, rng);
    if (finishing) metaRunFinished(finishing);
    write(state);
    assert.equal(stored().runs_finished, 26);
    assert.equal(stored().victories, 1);
  });

  test('a reload continues from the record, not from runHistory', () => {
    useStorage();
    const rng = seeded();
    let state = openRun(createGame(), rng);
    metaBackfill(SLUG, VERSION, metaFromState(state));
    metaTotalsStart(SLUG, state);
    for (let i = 0; i < 22; i++) {
      state = finishByRestart(state, rng, 5);
      write(state);
    }
    state.run.clientsServed = 3;
    write(state);
    assert.equal(stored().clients_total, 113);

    state = deserializeState(serializeState(state));
    metaResetClock();
    metaBackfill(SLUG, VERSION, metaFromState(state));
    metaTotalsStart(SLUG, state);
    write(state);
    assert.equal(stored().runs_finished, 22);
    assert.equal(stored().clients_total, 113);
    state = finishByRestart(state, rng, 5);
    write(state);
    assert.equal(stored().runs_finished, 23);
    assert.equal(stored().clients_total, 115);
  });

  test('importing a save restarts the counters from the record and the imported history', () => {
    useStorage();
    const rng = seeded();
    let state = openRun(createGame(), rng);
    metaBackfill(SLUG, VERSION, metaFromState(state));
    metaTotalsStart(SLUG, state);
    for (let i = 0; i < 3; i++) {
      state = finishByRestart(state, rng, 5);
      write(state);
    }
    assert.equal(stored().runs_finished, 3);

    let other = openRun(createGame(), rng);
    for (let i = 0; i < 20; i++) {
      other.run.clientsServed = 50;
      other = restartRun(other, rng);
    }
    const imported = deserializeState(serializeState(other));
    imported.run.clientsServed = 4;
    state = imported;
    metaTotalsStart(SLUG, state);
    write(state);
    assert.equal(stored().runs_finished, 20);
    assert.equal(stored().clients_total, 1004);

    state = finishByRestart(state, rng, 6);
    write(state);
    assert.equal(stored().runs_finished, 21);
    assert.equal(stored().clients_total, 1006);
  });

  test('a reset (new game) keeps counting from the record', () => {
    useStorage();
    const rng = seeded();
    let state = openRun(createGame(), rng);
    metaBackfill(SLUG, VERSION, metaFromState(state));
    metaTotalsStart(SLUG, state);
    for (let i = 0; i < 3; i++) {
      state = finishByRestart(state, rng, 5);
      write(state);
    }
    state.run.clientsServed = 4;
    write(state);
    assert.equal(stored().runs_finished, 3);
    assert.equal(stored().clients_total, 19);

    state = createGame();
    metaTotalsStart(SLUG, state);
    write(state);
    assert.equal(stored().runs_finished, 3);
    assert.equal(stored().clients_total, 19);

    state = openRun(state, rng);
    for (let i = 0; i < 2; i++) {
      state = finishByRestart(state, rng, 5);
      write(state);
    }
    assert.equal(state.runHistory.length, 2);
    assert.equal(stored().runs_finished, 5);
    assert.equal(stored().clients_total, 29);
  });

  test('an old capped record is the best estimate and the totals never go down', () => {
    const rng = seeded();
    let state = openRun(createGame(), rng);
    for (let i = 0; i < 20; i++) state = restartRun(state, rng);
    useStorage({
      [META_KEY]: JSON.stringify({
        v: 1, slug: SLUG, version: '2.24.38', updatedAt: '2026-01-01T00:00:00.000Z',
        stats: { runs_finished: 20, clients_total: 900, victories: 2 },
        logros: [], hitos: {},
      }),
    });
    metaTotalsStart(SLUG, state);
    state = finishByRestart(state, rng, 10);
    write(state);
    const stats = stored();
    assert.equal(stats.runs_finished, 21);
    assert.equal(stats.clients_total, 910);
    assert.equal(stats.victories, 2);
  });

  test('without a record the totals stay on runHistory', () => {
    useStorage();
    const rng = seeded();
    let state = openRun(createGame(), rng);
    metaTotalsStart(SLUG, state);
    state = finishByRestart(state, rng, 6);
    assert.equal(metaFromState(state).stats.runs_finished, 1);
    assert.equal(metaFromState(state).stats.clients_total, 6);
  });
});
