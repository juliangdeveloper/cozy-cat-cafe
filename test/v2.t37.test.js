// A pile draws at most 6 tiles. Anything under that is one wood base,
// with the total on the front and the top run on the top tile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  STACK_VISUAL_CAP, stackVisual, stackStepPx, stackLiftPadPx, topRunCount,
} from '../js/game.js';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

function paint(stack) {
  const view = stackVisual(stack);
  assert.ok(view.topLift <= STACK_VISUAL_CAP, `lift ${view.topLift} for ${stack.length}`);
  assert.equal(view.layers.length, Math.min(stack.length, STACK_VISUAL_CAP));
  assert.equal(view.hasBase, stack.length > STACK_VISUAL_CAP);
  assert.equal(view.showTotal, stack.length >= 2);
  assert.equal(view.showRun, topRunCount(stack) > 1);
  assert.equal(view.run, topRunCount(stack));
  if (view.layers.length) {
    const top = view.layers[view.layers.length - 1];
    assert.equal(top.lift, view.topLift);
    assert.equal(top.color, stack[stack.length - 1]);
    assert.equal(view.runColor, stack[stack.length - 1]);
  }
  return view;
}

test('counts 1, 3, 7, 15 and 40 stay within 6 steps', () => {
  const one = paint([2]);
  assert.equal(one.total, 1);
  assert.equal(one.topLift, 0);
  assert.equal(one.showRun, false);
  assert.equal(one.showTotal, false);
  assert.equal(one.hasBase, false);

  const three = paint([1, 1, 1]);
  assert.equal(three.total, 3);
  assert.equal(three.topLift, 2);
  assert.equal(three.showRun, true);
  assert.equal(three.run, 3);
  assert.equal(three.hasBase, false);
  assert.deepEqual(three.layers.map((l) => l.lift), [0, 1, 2]);

  const seven = paint([8, 2, 2, 4, 1, 1, 1]);
  assert.equal(seven.total, 7);
  assert.equal(seven.hasBase, true);
  assert.equal(seven.run, 3);
  assert.equal(seven.topLift, 6);
  assert.deepEqual(seven.layers.map((l) => l.color), [2, 2, 4, 1, 1, 1]);
  assert.deepEqual(seven.layers.map((l) => l.lift), [1, 2, 3, 4, 5, 6]);

  const fifteen = paint(Array.from({ length: 15 }, (_, i) => (i < 9 ? 4 : 8)));
  assert.equal(fifteen.total, 15);
  assert.equal(fifteen.hasBase, true);
  assert.equal(fifteen.run, 6);
  assert.equal(fifteen.topLift, 6);
  assert.ok(fifteen.layers.every((l) => l.color === 8));

  const forty = paint(Array.from({ length: 40 }, (_, i) => (i < 35 ? 3 : 6)));
  assert.equal(forty.total, 40);
  assert.equal(forty.hasBase, true);
  assert.equal(forty.run, 5);
  assert.equal(forty.showRun, true);
  assert.equal(forty.topLift, 6);
  assert.equal(forty.layers[0].color, 3);
  assert.equal(forty.layers.filter((l) => l.color === 6).length, 5);
});

test('a stack of 2 shows the total and the run only when the top matches', () => {
  const mixed = paint([1, 2]);
  assert.equal(mixed.showTotal, true);
  assert.equal(mixed.showRun, false);
  assert.equal(mixed.topLift, 1);
  const pair = paint([4, 4]);
  assert.equal(pair.showTotal, true);
  assert.equal(pair.showRun, true);
  assert.equal(pair.run, 2);
});

test('exactly 6 tiles have no base and 6 is the tallest lift', () => {
  const six = paint([1, 2, 3, 4, 5, 6]);
  assert.equal(six.hasBase, false);
  assert.equal(six.topLift, 5);
  assert.equal(six.showRun, false);
  const full = paint(Array.from({ length: 6 }, () => 9));
  assert.equal(full.hasBase, false);
  assert.equal(full.topLift, 5);
  assert.equal(full.run, 6);
});

test('lift pad covers 6 steps and the run badge from hx 16 to 60', () => {
  for (let hx = 16; hx <= 60; hx++) {
    const step = stackStepPx(hx);
    assert.equal(step, Math.max(5, Math.round(hx * 0.225)));
    const pad = stackLiftPadPx(hx);
    const top = STACK_VISUAL_CAP * step;
    const face = Math.ceil(hx * 0.015);
    assert.ok(pad >= top + face + 14, `hx ${hx} pad ${pad} top ${top}`);
    assert.equal(stackLiftPadPx(hx), pad);
    const view = stackVisual(Array.from({ length: 40 }, () => 1));
    assert.ok(view.topLift * step + face + 14 <= pad);
  }
});

test('pointy and flat boards share one lift pad and the renderer uses it', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.30'/);
  assert.match(html, /const liftPad=stackLiftPadPx\(hxN\)/);
  assert.match(html, /\(m\.h-m\.liftPad\)<=availH-slack/);
  assert.match(html, /const needsScroll=hxN<=HX_MIN && \(m\.w>availW\+0\.5 \|\| cellsH>availH\+0\.5\)/);
  assert.match(html, /function stackBodyHTML/);
  assert.match(html, /function stackBadgeHTML/);
  assert.match(html, /class="woodbase"/);
  assert.match(html, /class="runbadge"/);
  assert.match(html, /class="totalbadge"/);
  assert.match(html, /view\.showRun/);
  assert.match(html, /view\.showTotal/);
  assert.match(html, /top-view\.topLift\*step/);
  assert.doesNotMatch(html, /top:-16px/);
  assert.match(html, /\.board\.flat \.woodbase/);
  assert.match(html, /\.cell\.hex-flat \.woodface/);
  assert.match(html, /\.runbadge\{translate:-50% -50%\}/);
  assert.match(html, /\.totalbadge\{translate:-50% -100%\}/);
  assert.equal(stackLiftPadPx.length, 1);
});
