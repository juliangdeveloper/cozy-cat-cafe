// v2.24.4 — the board hx fits the wrap's width and height. The tray keeps :root --hx.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8');

test('the board fits its wrap and the tray keeps the width breakpoints', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.4'/);
  assert.match(html, /const HX_MAX = 60/);
  assert.match(html, /const HX_MIN = 16/);
  assert.match(html, /function boardMetrics/);
  assert.match(html, /function fitBoardHx/);
  assert.match(html, /function trayStep/);
  assert.match(html, /new ResizeObserver/);
  assert.match(html, /const liftPad=10\*Math\.max\(5,Math\.round\(hxN\*0\.225\)\)/);
  assert.match(html, /@media\(min-width:761px\)\{:root\{--hx:60px\}\}/);
  assert.match(html, /\.board-wrap\{flex:1 1 auto;min-height:0;min-width:0;overflow:hidden/);
  assert.doesNotMatch(html, /\.board-wrap\{[^}]*overflow:\s*auto/);
  assert.match(html, /wrap\.style\.overflow=needsScroll\?'auto':'hidden'/);
});
