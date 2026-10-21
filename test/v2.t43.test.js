// v2.24.30 — a served guest leaves, then the next guest enters.
// The cascade does not wait. A raised stack stays up for 1s.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GUEST_SWAP_FADE_MS, GUEST_SWAP_MS, PEEK_HOLD_MS, PEEK_MOVE_MS,
  assignGuestSlots, guestSwapPlan,
} from '../js/game.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

test('version footer is v2.24.32', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.32'/);
});

test('every served guest is replaced in their own card', () => {
  const slots = [{ shownId: 'A' }, { shownId: 'B' }, { shownId: 'C' }];
  assert.deepEqual(assignGuestSlots(stacks(slots), ['B', 'C', 'D']), ['D', 'B', 'C']);
  assert.equal(guestSwapPlan('A', 'idle', 'D'), 'leave');
  assert.equal(guestSwapPlan('B', 'idle', 'B'), 'keep');
  assert.equal(guestSwapPlan('C', 'idle', 'C'), 'keep');

  const both = assignGuestSlots(stacks(slots), ['C', 'D', 'E']);
  assert.deepEqual(both, ['D', 'E', 'C']);
  assert.equal(guestSwapPlan('A', 'idle', both[0]), 'leave');
  assert.equal(guestSwapPlan('B', 'idle', both[1]), 'leave');
  assert.equal(guestSwapPlan('C', 'idle', both[2]), 'keep');

  assert.deepEqual(assignGuestSlots([], ['A', 'B', 'C']), ['A', 'B', 'C']);
  assert.equal(guestSwapPlan(null, 'idle', 'A'), 'mount');
  assert.deepEqual(assignGuestSlots(stacks(slots), ['B', 'C']), [null, 'B', 'C']);
  assert.equal(guestSwapPlan('A', 'idle', null), 'leave');
});

test('a cascade step holds the served guest until the next one exists', () => {
  const slots = [{ shownId: 'A' }, { shownId: 'B' }, { shownId: 'C' }];
  assert.deepEqual(assignGuestSlots(stacks(slots), ['B', 'C'], true), ['A', 'B', 'C']);
  assert.deepEqual(assignGuestSlots([], ['A', 'B', 'C'], true), ['A', 'B', 'C']);
  assert.deepEqual(assignGuestSlots(stacks(slots), ['B', 'C', 'D'], true), ['D', 'B', 'C']);
});

test('a second swap on the same card is queued and does not restart', () => {
  assert.equal(guestSwapPlan('A', 'out', 'E'), 'queue');
  assert.equal(guestSwapPlan('A', 'out', 'D'), 'queue');
  assert.equal(guestSwapPlan('A', 'out', 'A'), 'queue');
  assert.equal(guestSwapPlan('D', 'in', 'E'), 'queue');
  assert.equal(guestSwapPlan('D', 'in', 'D'), 'keep');
  assert.equal(guestSwapPlan('D', 'idle', 'D'), 'keep');

  const orders = html.slice(html.indexOf('function renderOrders'), html.indexOf('function colorName'));
  const leave = orders.slice(orders.indexOf('function beginGuestLeave'), orders.indexOf('function arriveGuest'));
  assert.match(leave, /if\(slot\.phase==='out' \|\| slot\.phase==='in'\) return/);
  assert.match(orders, /plan==='queue'/);
  assert.match(orders, /slot\.next=live\?\{snap:guestSnap\(live\), live\}:null/);
  assert.doesNotMatch(orders.slice(0, orders.indexOf('function guestSnap')), /await /);
  assert.match(html, /keepOrders/);
});

test('the swap is 750ms out then 750ms in, and reduced motion is a short fade', () => {
  assert.equal(GUEST_SWAP_MS.leave, 750);
  assert.equal(GUEST_SWAP_MS.enter, 750);
  assert.ok(GUEST_SWAP_MS.leave >= 600 && GUEST_SWAP_MS.leave <= 800);
  assert.ok(GUEST_SWAP_MS.enter >= 600 && GUEST_SWAP_MS.enter <= 800);
  assert.equal(GUEST_SWAP_MS.leave + GUEST_SWAP_MS.enter, 1500);
  assert.ok(GUEST_SWAP_FADE_MS.leave <= 200 && GUEST_SWAP_FADE_MS.enter <= 200);
  assert.ok(GUEST_SWAP_FADE_MS.leave < GUEST_SWAP_MS.leave);
  const motion = html.slice(html.indexOf('function guestMotion'), html.indexOf('function paintGuest'));
  assert.match(motion, /prefers-reduced-motion:\s*reduce/);
  assert.match(motion, /GUEST_SWAP_FADE_MS/);
  assert.match(motion, /GUEST_SWAP_MS/);
  assert.match(motion, /translateY\(-8px\)/);
  assert.match(motion, /cubic-bezier\(\.4,0,\.2,1\)/);
  assert.match(css, /\.order-card\{flex:0 0 calc\(\(100% - 8px\)\/3\);width:calc\(\(100% - 8px\)\/3\);aspect-ratio:1/);
  assert.match(css, /\.order-card \.bubble\{position:absolute;top:4px;right:4px/);
  assert.match(css, /\.order-card \.px-avatar\{[^}]*height:100%/);
  assert.match(css, /\.order-swap\{position:absolute;inset:0/);
  assert.doesNotMatch(css, /\.order-swap\{[^}]*width:\d+px/);
  assert.doesNotMatch(css, /\.order-swap\{[^}]*height:\d+px/);
});

test('a stack peek stays raised for 1s and still rises and returns in 1s', () => {
  assert.equal(PEEK_MOVE_MS, 1000);
  assert.equal(PEEK_HOLD_MS, 1000);
  const peek = html.slice(html.indexOf('function peekStack'), html.indexOf('async function cascadeAfterReveal'));
  const tiles = html.slice(html.indexOf('function peekTiles'), html.indexOf('function peekStack'));
  assert.match(tiles, /duration:PEEK_MOVE_MS/);
  assert.match(peek, /PEEK_MOVE_MS \+ PEEK_HOLD_MS\)/);
  assert.match(peek, /PEEK_MOVE_MS \+ PEEK_HOLD_MS \+ PEEK_MOVE_MS\)/);
  assert.doesNotMatch(peek, /}, 3000\)/);
  assert.doesNotMatch(peek, /}, 4000\)/);
  assert.equal(PEEK_MOVE_MS + PEEK_HOLD_MS, 2000);
  assert.equal(PEEK_MOVE_MS + PEEK_HOLD_MS + PEEK_MOVE_MS, 3000);
});

function stacks(slots) {
  return slots;
}
