import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const META_KEY = 'meta.v1.cozy-cat-cafe';

function memoryStorage() {
  const bag = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null; },
    setItem(k, v) { bag[k] = String(v); },
    removeItem(k) { delete bag[k]; },
  };
}

const realSleep = setTimeout;
const sleep = (ms) => new Promise((r) => realSleep(r, ms));

async function until(check, label) {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await sleep(25);
  }
  throw new Error('timed out: ' + label);
}

async function bootCafe(name) {
  const page = html
    .replace(/<script src="\.\/vendor\/howler\.min\.js"><\/script>\s*/, '')
    .replace(/<script type="module">[\s\S]*?<\/script>/, '');
  const dom = new JSDOM(page, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: true, media: '', addEventListener() {}, removeEventListener() {} });
  window.Image = class { set src(v) { if (v && this.onload) setTimeout(() => this.onload(), 0); } constructor() { this.onload = null; this.onerror = null; } };
  window.fetch = async () => { throw new Error('no-network'); };
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  const realAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, fn, opt) => {
    if (type === 'load') return;
    return realAdd(type, fn, opt);
  };
  const storage = memoryStorage();
  const timers = new Set();
  const realTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const id = realTimeout(() => {
      timers.delete(id);
      fn(...args);
    }, ms);
    timers.add(id);
    return id;
  };
  window.setTimeout = globalThis.setTimeout;
  const realNow = Date.now;
  const frozen = realNow();
  Date.now = () => frozen;
  Object.assign(globalThis, {
    window, document: window.document, localStorage: storage, location: window.location,
    fetch: window.fetch, Image: window.Image, matchMedia: window.matchMedia,
    getComputedStyle: window.getComputedStyle.bind(window),
    requestAnimationFrame: window.requestAnimationFrame, cancelAnimationFrame: window.cancelAnimationFrame,
    FileReader: window.FileReader, Blob: window.Blob,
  });
  const appCode = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  const gameImp = appCode.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\/js\/game\.js'/);
  const importBlock = gameImp[1].split('\n').map((line) => line.replace(/\/\/.*$/, '')).join('\n');
  const appBody = appCode
    .replace(/import \{[\s\S]*?from '\.\/js\/game\.js';/, '')
    .replace(/from '\.\/js\/ambience\.js'/g, "from '../js/ambience.js'")
    .replace(/from '\.\/js\/meta\.js'/g, `from '../js/meta.js?${name}'`);
  const tmp = join(root, 'test', `.app_lifetime_${name}.mjs`);
  writeFileSync(tmp, `import {${importBlock}} from '../js/game.js';\n${appBody}\nwindow.__boot = boot;\n`);
  const cleanup = () => {
    for (const id of timers) clearTimeout(id);
    globalThis.setTimeout = realTimeout;
    Date.now = realNow;
    for (const key of ['window', 'document', 'location', 'fetch', 'Image', 'matchMedia', 'getComputedStyle',
      'requestAnimationFrame', 'cancelAnimationFrame', 'FileReader', 'Blob']) delete globalThis[key];
    try { unlinkSync(tmp); } catch (e) {}
  };
  try {
    await import('file:///' + tmp.replace(/\\/g, '/'));
    await window.__boot();
  } catch (e) {
    cleanup();
    throw e;
  }
  const stored = () => JSON.parse(storage.getItem(META_KEY)).stats;
  return { window, dbg: window.__dbg, stored, cleanup };
}

async function finishGame(cafe) {
  const { window, dbg } = cafe;
  dbg.state.run.clientsServed = 5;
  window.document.getElementById('closeAgain').click();
  await until(() => !dbg.ui.restarting && dbg.state.run.clientsServed === 0, 'restart');
}

function hide(window) {
  window.dispatchEvent(new window.Event('pagehide'));
}

describe('meta.v1 lifetime totals in the café', { concurrency: false }, () => {
  test('a game that ends just before a reset is counted', async () => {
    const cafe = await bootCafe('reset');
    try {
      const { window, dbg, stored } = cafe;
      assert.equal(stored().runs_finished, 0);
      await finishGame(cafe);
      const reset = window.document.getElementById('resetBtn');
      reset.click();
      reset.click();
      assert.equal(dbg.state.runHistory.length, 0);
      hide(window);
      assert.equal(stored().runs_finished, 1);
      assert.equal(stored().clients_total, 5);
    } finally {
      cafe.cleanup();
    }
  });

  test('a game that ends just before an import is counted', async () => {
    const cafe = await bootCafe('import');
    try {
      const { window, dbg, stored } = cafe;
      const save = dbg.serializeState(dbg.state);
      await finishGame(cafe);
      const input = window.document.getElementById('importFile');
      Object.defineProperty(input, 'files', { configurable: true, value: [new window.File([save], 'save.json')] });
      input.dispatchEvent(new window.Event('change'));
      await until(() => dbg.state.runHistory.length === 0, 'import');
      hide(window);
      assert.equal(stored().runs_finished, 1);
      assert.equal(stored().clients_total, 5);
    } finally {
      cafe.cleanup();
    }
  });
});
