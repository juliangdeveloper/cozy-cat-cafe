// v2.24.28 — after the board shuffle, every stack is drawn on its own cell.
// A save whose 36 cells no longer have unique positions is repaired on load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  applyBoardShuffle, canonicalBoardSlots, createGame, deserializeState,
  importSave, mulberry32, openRun, repairBoardGeometry, serializeState,
} from '../js/game.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const rng = (seed) => mulberry32(seed);
const open = (seed) => openRun(createGame({ progress: { coins: 1000 } }), rng(seed));

function slotKey(cell) {
  return `${cell.q},${cell.r}`;
}

test('a shuffle keeps 36 unique cells, and a broken save is repaired on load', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.37'/);
  assert.match(html, /function stopBoardMotion/);
  assert.match(html, /fill:'backwards'/);
  assert.doesNotMatch(html, /fill:'both'/);
  assert.match(html, /stopBoardMotion\(\);\s*renderBoard\(\);/);

  const slots = canonicalBoardSlots();
  assert.equal(slots.length, 36);
  assert.equal(new Set(slots.map((s) => `${s.q},${s.r}`)).size, 36);

  const s = open(3);
  s.run.board[4].stack = [1, 2, 3];
  s.run.board[4].blocked = true;
  const before = s.run.board.map(slotKey);
  const shuffled = applyBoardShuffle(s, rng(9));
  assert.deepEqual(shuffled.run.board.map(slotKey), before);
  assert.equal(new Set(shuffled.run.board.map(slotKey)).size, 36);
  const kept = shuffled.run.board.find((c) => JSON.stringify(c.stack) === JSON.stringify([1, 2, 3]));
  assert.equal(kept.blocked, true);

  const healthy = deserializeState(serializeState(shuffled));
  assert.deepEqual(healthy.run.board.map(slotKey), before);
  assert.equal(healthy.run.boardShuffleFrom, undefined);
  assert.deepEqual(
    healthy.run.board.find((c) => JSON.stringify(c.stack) === JSON.stringify([1, 2, 3])).stack,
    [1, 2, 3],
  );

  const broken = open(5);
  broken.run.board[0].stack = [8, 8];
  broken.run.board[7].stack = [4, 5, 4];
  broken.run.board[7].q = broken.run.board[0].q;
  broken.run.board[7].r = broken.run.board[0].r;
  broken.run.board[12].q = 99;
  broken.run.board[12].stack = [6];
  broken.run.board[20] = null;
  const saved = JSON.parse(serializeState(broken));
  saved.run.boardShuffleFrom = [1, 0];
  const loaded = deserializeState(JSON.stringify(saved));
  assert.equal(loaded.run.board.length, 36);
  assert.deepEqual(loaded.run.board.map(slotKey), slots.map((p) => `${p.q},${p.r}`));
  assert.equal(new Set(loaded.run.board.map(slotKey)).size, 36);
  assert.deepEqual(loaded.run.board[0].stack, [8, 8]);
  assert.deepEqual(loaded.run.board[7].stack, [4, 5, 4]);
  assert.deepEqual(loaded.run.board[12].stack, [6]);
  assert.deepEqual(loaded.run.board[20].stack, []);
  assert.equal(loaded.run.boardShuffleFrom, undefined);

  const imported = importSave(JSON.stringify(saved));
  assert.deepEqual(imported.run.board.map(slotKey), slots.map((p) => `${p.q},${p.r}`));
  assert.deepEqual(imported.run.board[7].stack, [4, 5, 4]);
  const fresh = open(1).run.board.map(slotKey);
  assert.deepEqual(repairBoardGeometry(open(1).run.board).map(slotKey), fresh);
});

test('the glide does not leave stacks off their cells, including after a reload', async () => {
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
  const tmp = join(root, 'test', '.app_t41.mjs');
  writeFileSync(tmp, `import {${importBlock}} from '../js/game.js';\n${appBody}\nwindow.__boot = boot;\n`);
  try {
    await import('file:///' + tmp.replace(/\\/g, '/'));
    await window.__boot();
    Object.defineProperty(window.HTMLElement.prototype, 'offsetLeft', {
      configurable: true,
      get() { return parseFloat(this.style.left) || 0; },
    });
    Object.defineProperty(window.HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get() { return parseFloat(this.style.top) || 0; },
    });
    window.HTMLElement.prototype.animate = function () {
      this.style.transform = 'translate(48px, 24px)';
      this.dataset.glided = '1';
      return { finished: Promise.resolve(), cancel() {} };
    };
    window.HTMLElement.prototype.getAnimations = function () { return []; };

    const dbg = window.__dbg;
    const s = dbg.state;
    s.progress.coins = 225000;
    s.run.boardShuffleApplied = false;
    delete s.run.boardShuffleFrom;
    s.run.board.forEach((c, i) => { c.stack = i % 2 === 0 ? [1 + (i % 5), 2] : []; });
    dbg.state = s;
    dbg.renderAll();
    const next = dbg.maybeBoardShuffle(dbg.state, 90000, rng(4));
    dbg.state = next;
    dbg.renderAll();

    const raw = window.localStorage.getItem('cozy-cat-cafe.save.v1');
    const mid = JSON.parse(raw);
    assert.equal(mid.run.boardShuffleFrom, undefined);
    assert.equal(new Set(mid.run.board.map(slotKey)).size, 36);
    assert.ok([...window.document.querySelectorAll('#board .cell')].some((el) => el.style.transform));

    await new Promise((r) => setTimeout(r, 50));
    const placed = () => [...window.document.querySelectorAll('#board .cell[data-id]')].map((el) => ({
      id: el.dataset.id,
      left: el.style.left,
      top: el.style.top,
      transform: el.style.transform,
      glided: el.dataset.glided || '',
    }));
    const after = placed();
    assert.equal(after.length, 36);
    assert.equal(new Set(after.map((c) => c.id)).size, 36);
    assert.equal(new Set(after.map((c) => `${c.left}|${c.top}`)).size, 36);
    assert.ok(after.every((c) => c.transform === '' && c.glided === ''));

    dbg.renderAll();
    assert.deepEqual(placed(), after);

    const reloaded = deserializeState(raw);
    dbg.state = reloaded;
    dbg.ui.pendingShuffle = null;
    dbg.ui.shuffleUntil = 0;
    dbg.renderAll();
    const again = placed();
    assert.equal(again.length, 36);
    assert.ok(again.every((c) => c.transform === '' && c.glided === ''));
    assert.deepEqual(again.map((c) => `${c.id}|${c.left}|${c.top}`), after.map((c) => `${c.id}|${c.left}|${c.top}`));
  } finally {
    try { unlinkSync(tmp); } catch (_) {}
  }
});
