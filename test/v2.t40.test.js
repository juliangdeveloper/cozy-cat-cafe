// v2.24.28 — tall top-row stacks must not move the board. A tray stack is
// centered by its base hex, and taller stacks grow upward.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { trayStackShiftPx, stackStepPx } from '../js/game.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('a tray stack is centered by its base, and a tall one overflows upward', () => {
  const step = stackStepPx(31);
  const tileH = 34;
  const slotH = 82;
  assert.equal(trayStackShiftPx(0, tileH, slotH), 0);
  const one = trayStackShiftPx(1, tileH, slotH);
  const mid = trayStackShiftPx(3, tileH, slotH);
  const tall = trayStackShiftPx(8, tileH, slotH);
  assert.equal(one, mid);
  assert.equal(mid, tall);
  assert.ok(Math.abs(tileH / 2 + one - slotH / 2) < 1e-9);
  const top = (8 - 1) * step + tileH + tall;
  assert.ok(top > slotH);
  assert.match(html, /\.poolslot\{[^}]*overflow:visible/);
  assert.match(html, /\.ttile\{[^}]*left:50%[^}]*bottom:0[^}]*translate:-50% 0/);
  assert.match(html, /function centerTrayStacks/);
  assert.match(html, /trayStackShiftPx\(n, tileH, slotH\)/);
  assert.match(html, /\.pool\{[^}]*overflow:visible/);
});

test('tall top-row stacks do not move the 36-cell board', async () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.38'/);
  const boardFn = html.slice(html.indexOf('function renderBoard'), html.indexOf('function renderPool'));
  const shift = boardFn.slice(boardFn.indexOf('const cellsH'), boardFn.indexOf('box.style.setProperty'));
  assert.doesNotMatch(shift, /stack/);
  assert.match(boardFn, /const overhang=!v\.slot && v\.cell && v\.cell\.stack && v\.cell\.stack\.length>=6 && v\.y<=topY\+0\.01/);
  assert.match(boardFn, /const z=overhang\?40\+zi:zi/);
  assert.match(boardFn, /wrap\.style\.overflow=needsScroll\?'auto':'visible'/);
  assert.match(boardFn, /wrap\.style\.overflowAnchor='none'/);
  assert.match(html, /\.board-wrap\{[^}]*z-index:6/);

  const page = html
    .replace(/<script src="\.\/vendor\/howler\.min\.js"><\/script>\s*/, '')
    .replace(/<script type="module">[\s\S]*?<\/script>/, '');
  const dom = new JSDOM(page, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {} });
  window.Image = class { set src(v) { if (v && this.onload) setTimeout(() => this.onload(), 0); } constructor() { this.onload = null; this.onerror = null; } };
  window.fetch = async () => { throw new Error('no-network'); };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.localStorage = window.localStorage;
  globalThis.fetch = window.fetch;
  globalThis.Image = window.Image;
  globalThis.matchMedia = window.matchMedia;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = window.requestAnimationFrame;
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

  const appCode = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const gameImp = appCode.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\/js\/game\.js'/);
  const importBlock = gameImp[1].split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const appBody = appCode
    .replace(/import \{[\s\S]*?from '\.\/js\/game\.js';/, '')
    .replace(/from '\.\/js\/ambience\.js'/g, "from '../js/ambience.js'")
    .replace(/from '\.\/js\/meta\.js'/g, "from '../js/meta.js'");
  const tmp = join(root, 'test', '.app_t40.mjs');
  writeFileSync(tmp, `import {${importBlock}} from '../js/game.js';\n${appBody}\nwindow.__boot = boot;\n`);
  try {
    await import('file:///' + tmp.replace(/\\/g, '/'));
    await window.__boot();
    const dbg = window.__dbg;
    const snap = () => {
      const board = window.document.getElementById('board');
      const wrap = window.document.querySelector('.board-wrap');
      const cells = [...window.document.querySelectorAll('#board .cell')].map((el) => ({
        id: el.dataset.id,
        top: el.style.top,
        left: el.style.left,
        w: el.style.width,
        h: el.style.height,
        z: el.style.zIndex,
      }));
      return {
        n: cells.length,
        cells,
        margin: board.style.marginTop,
        hx: board.style.getPropertyValue('--hx'),
        bh: board.style.height,
        bw: board.style.width,
        overflow: wrap.style.overflow,
      };
    };
    const s = dbg.state;
    s.progress.coins = 100;
    s.run.boardShuffleApplied = true;
    s.run.board.forEach((c) => { c.stack = null; });
    dbg.state = s;
    dbg.renderAll();
    const empty = snap();
    const minR = Math.min(...s.run.board.map((c) => c.r));
    s.run.board.forEach((c) => {
      if (c.r === minR) c.stack = [1, 2, 3, 4, 5, 6, 7, 8];
    });
    dbg.renderAll();
    const tall = snap();
    assert.equal(tall.n, 36);
    assert.equal(empty.n, 36);
    assert.equal(tall.hx, empty.hx);
    assert.equal(tall.margin, empty.margin);
    assert.equal(tall.bh, empty.bh);
    assert.equal(tall.bw, empty.bw);
    assert.equal(tall.overflow, 'visible');
    assert.deepEqual(tall.cells.map(({ id, top, left, w, h }) => ({ id, top, left, w, h })),
      empty.cells.map(({ id, top, left, w, h }) => ({ id, top, left, w, h })));
    const boardH = parseFloat(tall.bh);
    for (const cell of tall.cells) {
      const bottom = parseFloat(cell.top) + parseFloat(cell.h);
      assert.ok(parseFloat(cell.top) >= 0 && bottom <= boardH + 0.5, `${cell.id} ${cell.top} ${bottom} ${boardH}`);
    }
    const topCells = tall.cells.filter((c) => parseFloat(c.top) === Math.min(...tall.cells.map((x) => parseFloat(x.top))));
    assert.ok(topCells.length > 0);
    assert.ok(topCells.every((c) => Number(c.z) >= 40));
  } finally {
    try { unlinkSync(tmp); } catch (_) {}
  }
});
