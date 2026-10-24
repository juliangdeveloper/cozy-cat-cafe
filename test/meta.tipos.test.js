import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  metaUpdate, metaResetClock, metaProyecto, PROYECTO, STATS, TIPO_STAT, FASE, ESTADO_FASE,
} from '../js/meta.js';

function useStorage() {
  const bag = {};
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) { bag[k] = String(v); },
    removeItem(k) { delete bag[k]; },
  };
  delete globalThis.window;
  delete globalThis.location;
  return bag;
}

test('los enums están congelados y PROYECTO usa sus valores', () => {
  for (const e of [FASE, ESTADO_FASE, TIPO_STAT, STATS]) assert.ok(Object.isFrozen(e));
  assert.deepEqual(Object.values(FASE), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(Object.values(ESTADO_FASE), [0, 1, 2, 3, 4]);
  assert.equal(FASE.DESCARTADA, 7);
  assert.equal(PROYECTO.fase, FASE.CONSTRUCCION);
  assert.equal(PROYECTO.fase_estado, ESTADO_FASE.EN_CURSO);
  assert.deepEqual(metaProyecto(PROYECTO), { ...PROYECTO });
});

test('cada stat declara un tipo válido y una unidad, y la mezcla respeta su tipo', () => {
  const tipos = Object.values(TIPO_STAT);
  const keys = Object.keys(STATS);
  assert.ok(keys.length >= 1 && keys.length <= 20);
  for (const key of keys) {
    assert.ok(tipos.includes(STATS[key].tipo), key);
    assert.equal(typeof STATS[key].unidad, 'string');
    assert.ok(STATS[key].unidad.length > 0, key);
  }
  useStorage();
  metaResetClock();
  const alto = {};
  const bajo = {};
  for (const key of keys) { alto[key] = 10; bajo[key] = 3; }
  metaUpdate('cozy-cat-cafe', '1', { stats: alto, logros: [] });
  const record = metaUpdate('cozy-cat-cafe', '1', { stats: bajo, logros: [] });
  for (const key of keys) {
    const esperado = STATS[key].tipo === TIPO_STAT.VALOR_ACTUAL ? 3 : 10;
    assert.equal(record.stats[key], esperado, key);
  }
});
