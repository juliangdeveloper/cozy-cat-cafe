// Audio stays out of the pure rules module. Mute, unlock, and the three
// effects are covered here with a fake Howler — no speakers required.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(root, rel), 'utf8');

test('game.js stays free of audio', () => {
  const game = read('js/game.js');
  assert.equal(game.includes('ambience.js'), false);
  assert.equal(game.includes('Howler'), false);
  assert.equal(game.includes('Howl'), false);
  assert.equal(game.includes('playCafeSfx'), false);
  assert.equal(game.includes('.mp3'), false);
  assert.equal(game.includes('.ogg'), false);
  assert.equal(game.includes('Audio('), false);
});

test('the UI hooks the loop and the three effects only on success', () => {
  const html = read('index.html');
  const amb = read('js/ambience.js');
  const game = read('js/game.js');
  assert.match(html, /from '\.\/js\/ambience\.js'/);
  assert.equal(game.includes('ambience'), false);
  assert.match(html, /vendor\/howler\.min\.js/);
  assert.doesNotMatch(html, /https?:\/\/[^\s'"]*howler/i);
  assert.doesNotMatch(html, /https?:\/\/[^\s'"]*\.mp3/i);
  assert.match(amb, /hybrid-sunlatte\.mp3/);
  for (const name of ['sfx-stack', 'sfx-merge', 'sfx-serve']) {
    assert.match(amb, new RegExp(name + '\\.mp3'));
    assert.match(amb, new RegExp(name + '\\.ogg'));
  }
  // No fourth effect name is wired.
  assert.equal((html.match(/playCafeSfx\(/g) || []).length, 4); // place, cascade merge, cascade serve, manual serve
  const place = html.slice(html.indexOf('async function placeFlow'), html.indexOf('function serveOrderFlow'));
  assert.ok(place.indexOf('if(res.error)') < place.indexOf("playCafeSfx('stack')"));
  const serve = html.slice(html.indexOf('function serveOrderFlow'), html.indexOf('function checkFull'));
  assert.ok(serve.indexOf('res.error') < serve.indexOf("playCafeSfx('serve')"));
  const casc = html.slice(html.indexOf('async function playCascade'), html.indexOf('function renderPreview'));
  assert.match(casc, /if\(\(L\.merged\|\|\[\]\)\.length\) playCafeSfx\('merge'\)/);
  assert.match(casc, /if\(\(L\.served\|\|\[\]\)\.length\) playCafeSfx\('serve'\)/);
  assert.match(amb, /Howler\.ctx\.resume\(\)/);
  assert.match(html, /Mute music/);
  assert.match(amb, /cozy-cat-cafe\.audio\.mute/);
  assert.match(html, /unlockCafeAudio\(\)/);
  assert.match(html, /noteCafeOpen\(\)/);
});

test('mute persists, the loop waits for a gesture, and effects share that mute', async () => {
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
    _autoResume() { this.autoResumes = (this.autoResumes || 0) + 1; this.ctx.state = 'running'; },
    ctx: {
      state: 'suspended',
      resume() { this.state = 'running'; this.resumes = (this.resumes || 0) + 1; },
    },
  };
  globalThis.Howl = class {
    constructor(opts) { this.opts = opts; this.playCalls = 0; this._playing = false; this._id = null; created.push(this); }
    play(id) {
      this.playCalls += 1;
      if (this.failNext) {
        this.failNext = false;
        this._playing = false;
        if (typeof this.opts.onplayerror === 'function') this.opts.onplayerror();
        return id != null ? id : 1;
      }
      this._playing = true;
      if (id != null) return id;
      this._id = 1;
      return this._id;
    }
    playing() { return this._playing; }
    pause(id) { this._playing = false; return id; }
    unload() { this._playing = false; this.dead = true; }
    state() { return 'loaded'; }
    on() { return this; }
  };
  let onPointer = null;
  globalThis.document = {
    addEventListener(type, fn) { if (type === 'pointerdown') onPointer = fn; },
  };

  const amb = await import('../js/ambience.js');
  amb.bindCafeAudio();
  assert.equal(amb.cafeAudioMuted(), false);
  assert.equal(store.has('cozy-cat-cafe.audio.mute'), false);

  amb.noteCafeOpen();
  assert.equal(created.length, 0, 'a run does not start audio before a gesture');

  onPointer({ target: { closest: () => null } });
  assert.equal(globalThis.Howler.ctx.state, 'running');
  assert.ok(globalThis.Howler.ctx.resumes >= 1);
  assert.ok(globalThis.Howler.autoResumes >= 1);
  assert.equal(globalThis.Howler.autoSuspend, false);
  const music = created.find((h) => h.opts && h.opts.loop === true);
  assert.ok(music, 'Hybrid Sunlatte Howl is created on the gesture');
  assert.ok(music.opts.volume >= 0.5 && music.opts.volume <= 0.75);
  assert.deepEqual(music.opts.src, ['./assets/audio/hybrid-sunlatte.mp3']);
  assert.equal(music.playing(), true);
  assert.equal(music.playCalls, 1);
  assert.equal(music.opts.html5, true);
  music._playing = false; // buffer not audible yet — a second render must not stack the loop
  amb.noteCafeOpen();
  assert.equal(music.playCalls, 1);

  amb.playCafeSfx('stack');
  const stack = created.find((h) => h.opts && String(h.opts.src).includes('sfx-stack'));
  assert.ok(stack);
  assert.equal(stack.playCalls, 1);
  assert.ok(stack.opts.volume < music.opts.volume);
  amb.playCafeSfx('merge');
  amb.playCafeSfx('serve');
  amb.playCafeSfx('nope');
  const merge = created.find((h) => String(h.opts.src).includes('sfx-merge'));
  const serve = created.find((h) => String(h.opts.src).includes('sfx-serve'));
  assert.equal(merge.playCalls, 1);
  assert.equal(serve.playCalls, 1);
  assert.equal(created.length, 4);
  // A preload failure must not play an effect by itself.
  stack.opts.onloaderror();
  const stackHtml5 = created.filter((h) => h.opts && String(h.opts.src).includes('sfx-stack')).at(-1);
  assert.equal(stackHtml5.opts.html5, true);
  assert.equal(stackHtml5.playCalls, 0);
  assert.equal(stack.playCalls, 1);

  assert.equal(amb.toggleCafeAudio(), true);
  assert.equal(store.get('cozy-cat-cafe.audio.mute'), '1');
  assert.equal(globalThis.Howler.muted, true);
  const before = stack.playCalls;
  amb.playCafeSfx('stack');
  amb.playCafeSfx('merge');
  amb.playCafeSfx('serve');
  assert.equal(stack.playCalls, before, 'muted effects stay silent');

  amb.noteCafeClosed();
  assert.equal(music.playing(), false);

  // Boot reads the key again (same call the page makes on reload).
  const playsBefore = music.playCalls;
  amb.bindCafeAudio();
  assert.equal(amb.cafeAudioMuted(), true);
  amb.noteCafeOpen();
  onPointer({ target: { closest: () => null } });
  assert.equal(music.playCalls, playsBefore, 'a muted run does not start the loop');
  assert.equal(amb.toggleCafeAudio(), false);
  assert.equal(store.get('cozy-cat-cafe.audio.mute'), '0');
  const live = created.filter((h) => h.opts && h.opts.loop).at(-1);
  assert.equal(live.playing(), true);
  // A play error must not stick. HTML5 fails over to Web Audio and plays again.
  live.failNext = true;
  live._playing = false;
  live.play();
  const retried = created.filter((h) => h.opts && h.opts.loop).at(-1);
  assert.notEqual(retried, live);
  assert.equal(retried.opts.html5, false);
  assert.equal(retried.playing(), true);
  assert.equal(retried.playCalls, 1);
});
