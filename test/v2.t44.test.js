// v2.24.31 — a tall stack's bottom tile sits on its cell. The wood slab
// for hidden tiles shares that footprint and does not paint a plank hatch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STACK_VISUAL_CAP, stackVisual } from '../js/game.js';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

test('version footer is v2.24.39', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.39'/);
});

test('every height seats its bottom tile on the cell', () => {
  for (let n = 1; n <= 12; n++) {
    const view = stackVisual(Array.from({ length: n }, () => 4));
    assert.equal(view.layers[0].lift, 0, `height ${n}`);
    assert.equal(view.topLift, Math.min(n, STACK_VISUAL_CAP) - 1, `height ${n}`);
    assert.equal(view.hasBase, n > STACK_VISUAL_CAP, `height ${n}`);
    assert.deepEqual(view.layers.map((l) => l.lift), view.layers.map((_, i) => i));
  }
  const forty = stackVisual(Array.from({ length: 40 }, () => 2));
  assert.equal(forty.layers[0].lift, 0);
  assert.equal(forty.topLift, STACK_VISUAL_CAP - 1);
  assert.equal(forty.hasBase, true);
});

test('the wood slab has no cross-hatch and peek starts on the resting lifts', () => {
  const face = html.slice(html.indexOf('.woodface{'), html.indexOf('.calmk{'));
  assert.match(face, /\.woodface\{/);
  assert.match(face, /background:var\(--wood\)/);
  assert.doesNotMatch(face, /repeating-linear-gradient/);
  assert.doesNotMatch(face, /background-image/);
  const body = html.slice(html.indexOf('function stackBodyHTML'), html.indexOf('function stackBadgeHTML'));
  assert.match(body, /class="woodbase"/);
  assert.match(body, /--lift:\$\{-layer\.lift\*step\}px/);
  const peek = html.slice(html.indexOf('function peekLiftPx'), html.indexOf('function peekTiles'));
  assert.match(peek, /start\[hidden\+i\]=-i\*step/);
  assert.doesNotMatch(peek, /-\(i\+1\)\*step/);
});
