import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('version footer is v2.24.55', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.55'/);
});

test('the stage pads every edge by the device safe area and refits when it changes', () => {
  assert.match(html, /viewport-fit=cover/);
  const stage = html.slice(html.indexOf('#stage{'), html.indexOf('#frame{'));
  for (const [edge, v] of [['top', 'top'], ['right', 'right'], ['bottom', 'bottom'], ['left', 'left']]) {
    assert.match(stage, new RegExp('max\\(env\\(safe-area-inset-' + edge + ', 0px\\), var\\(--safe-' + v + ', 0px\\)\\)'));
  }
  assert.match(html, /new ResizeObserver\(\(\)=>fitFrame\(\)\)\.observe\(document\.getElementById\('stage'\)\)/);
  const tut = html.slice(html.indexOf('function positionTut'), html.indexOf('function finishTutorial'));
  assert.equal(tut.includes('safe-area'), false);
});

test('leaving the app pauses the loop and every effect, and only a playing loop comes back', async () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  const created = [];
  globalThis.Howler = {
    muted: false,
    autoSuspend: true,
    mute(v) { this.muted = !!v; },
    _autoResume() {},
    ctx: {
      state: 'running',
      resume() { this.state = 'running'; },
      suspend() { this.state = 'suspended'; this.suspends = (this.suspends || 0) + 1; return Promise.resolve(); },
    },
  };
  globalThis.Howl = class {
    constructor(opts) { this.opts = opts; this.playCalls = 0; this._playing = false; created.push(this); }
    play(id) { this.playCalls += 1; this._playing = true; return id != null ? id : 1; }
    playing() { return this._playing; }
    pause(id) { this._playing = false; return id; }
    stop() { this._playing = false; this.stopped = (this.stopped || 0) + 1; }
    unload() { this._playing = false; }
    state() { return 'loaded'; }
  };
  const listeners = {};
  const fire = (type, ev) => { for (const fn of listeners[type] || []) fn(ev || { type }); };
  globalThis.document = {
    visibilityState: 'visible',
    hasFocus() { return true; },
    addEventListener(type, fn) { (listeners[type] ||= []).push(fn); },
  };
  globalThis.window = {
    addEventListener(type, fn) { (listeners['win:' + type] ||= []).push(fn); },
  };
  const tap = () => fire('touchend', { type: 'touchend', target: { closest: () => null } });

  const amb = await import('../js/ambience.js');
  amb.bindCafeAudio();
  amb.noteCafeOpen();
  tap();
  const music = created.find((h) => h.opts.loop === true);
  assert.equal(music.playing(), true);
  amb.playCafeSfx('stack');
  const stack = created.find((h) => String(h.opts.src).includes('sfx-stack'));
  assert.equal(stack.playing(), true);

  document.visibilityState = 'hidden';
  fire('visibilitychange');
  assert.equal(music.playing(), false, 'locking the phone pauses the loop');
  assert.equal(stack.playing(), false, 'locking the phone stops the effects');
  assert.equal(Howler.ctx.state, 'suspended');
  const plays = stack.playCalls;
  amb.playCafeSfx('stack');
  assert.equal(stack.playCalls, plays, 'no effect plays while hidden');
  document.visibilityState = 'visible';
  fire('visibilitychange');
  assert.equal(music.playing(), true, 'the loop comes back on return');
  assert.equal(Howler.ctx.state, 'running');

  fire('win:pagehide', { type: 'pagehide' });
  assert.equal(music.playing(), false, 'pagehide pauses the loop');
  fire('win:pageshow', { type: 'pageshow' });
  assert.equal(music.playing(), true);

  assert.equal(typeof window.cafeAudioAway, 'function');
  window.cafeAudioAway(true);
  assert.equal(music.playing(), false, 'the app going to the background pauses the loop');
  tap();
  assert.equal(music.playing(), false, 'a stray touch while away stays silent');
  window.cafeAudioAway(false);
  assert.equal(music.playing(), true);

  amb.toggleCafeAudio();
  music._playing = false;
  window.cafeAudioAway(true);
  window.cafeAudioAway(false);
  assert.equal(music.playing(), false, 'a muted loop stays off on return');
  amb.toggleCafeAudio();
  assert.equal(music.playing(), true);
});
