// ============================================================================
// Cozy Cat Café — ambience + three board effects.
// Browser audio only. js/game.js must not import this module.
// Locked loop: Hybrid Sunlatte, the long cut (ogg first so the loop
// seam does not pick up the mp3 encoder gap). Effects: stack, merge,
// serve, and the 10+ chain-clear payoff (destroy).
// Mute is shared and stored in localStorage (survives reload).
// ============================================================================

const ambMuteKey = 'cozy-cat-cafe.audio.mute';
// The master peaks near full scale but 0.3 sat under laptop speakers.
// 0.62 is clearly audible and still sits under the board.
const ambMusicVol = 0.62;
const ambSfxVol = 0.22;
const ambServeVol = 0.26;
// Louder than the merge click, still under the loop. This is the clear payoff.
const ambDestroyVol = 0.38;

// Ogg is the playing loop. The mp3 carries encoder priming and can click
// or gap when it repeats. Wav is only the last fallback.
const ambLoopSrc = [
  './assets/audio/hybrid-sunlatte-90s.ogg',
  './assets/audio/hybrid-sunlatte-90s.mp3',
  './assets/audio/hybrid-sunlatte-90s.wav',
];
const ambLoopFmt = ['ogg', 'mp3', 'wav'];
// Short dry tick for the coin reset, and a soft two-note close for victory.
// Synthesized so the café does not need another binary asset. game.js stays
// audio-free; only this module plays them.
function ambWavUri(samples, sampleRate) {
  const n = samples.length;
  const buffer = new ArrayBuffer(44 + n * 2);
  const view = new DataView(buffer);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + n * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) view.setInt16(44 + i * 2, samples[i], true);
  const bytes = new Uint8Array(buffer);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return 'data:audio/wav;base64,' + b64;
}
function ambDryResetWav() {
  const sr = 22050;
  const n = Math.floor(sr * 0.07);
  const samples = new Int16Array(n);
  let s = 1;
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 16807) + 1) | 0;
    if (s < 0) s = s >>> 0;
    s = s % 2147483647;
    const noise = ((s / 2147483647) * 2 - 1);
    const env = Math.exp(-i / (sr * 0.012));
    samples[i] = Math.max(-32767, Math.min(32767, noise * env * 12000));
  }
  return ambWavUri(samples, sr);
}
function ambCloseWav() {
  const sr = 22050;
  const n = Math.floor(sr * 0.42);
  const samples = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 4.2);
    const tone = Math.sin(2 * Math.PI * 392 * t) * (t < 0.18 ? 1 : 0)
      + Math.sin(2 * Math.PI * 262 * t) * (t >= 0.12 ? 1 : 0);
    samples[i] = Math.max(-32767, Math.min(32767, tone * env * 9000));
  }
  return ambWavUri(samples, sr);
}
const ambResetUri = ambDryResetWav();
const ambCloseUri = ambCloseWav();
const ambSfxSrc = {
  stack: ['./assets/audio/sfx-stack.ogg', './assets/audio/sfx-stack.mp3'],
  merge: ['./assets/audio/sfx-merge.ogg', './assets/audio/sfx-merge.mp3'],
  serve: ['./assets/audio/sfx-serve.ogg', './assets/audio/sfx-serve.mp3'],
  destroy: ['./assets/audio/sfx-destroy.ogg', './assets/audio/sfx-destroy.mp3', './assets/audio/sfx-destroy.wav'],
  reset: [ambResetUri],
  close: [ambCloseUri],
};
const ambSfxFmt = {
  stack: ['ogg', 'mp3'],
  merge: ['ogg', 'mp3'],
  serve: ['ogg', 'mp3'],
  destroy: ['ogg', 'mp3', 'wav'],
  reset: ['wav'],
  close: ['wav'],
};
const ambSfxNames = ['stack', 'merge', 'serve', 'destroy', 'reset', 'close'];

let ambMusic = null;
let ambMusicId = null;
let ambInFlight = false;
let ambWantPlay = false;
let ambMusicHtml5 = true;
let ambWatch = 0;
let ambRetryTimer = 0;
let ambSfx = { stack: null, merge: null, serve: null, destroy: null, reset: null, close: null };
let ambSfxHtml5 = { stack: false, merge: false, serve: false, destroy: false, reset: false, close: false };
let ambMuted = false;
let ambUnlocked = false;
let ambRunOpen = false;
let ambGestureBound = false;
let ambHeard = true;
let ambGestureAt = 0;

function ambReadMute() {
  try { return localStorage.getItem(ambMuteKey) === '1'; }
  catch (e) { return false; }
}
function ambWriteMute(muted) {
  try { localStorage.setItem(ambMuteKey, muted ? '1' : '0'); }
  catch (e) { /* private mode / disabled storage */ }
}

function ambHowlerReady() {
  return typeof Howl === 'function' && typeof Howler !== 'undefined';
}

// Page Visibility is the reliable signal: background tab, minimized window,
// and a phone sending the browser to the background all set visibilityState
// to "hidden". Another desktop window can take focus while this tab stays
// "visible", so document.hasFocus() covers that case. Mobile blur/focus is
// not reliable on its own (it can miss an app switch, or fire for browser
// UI), so a blur only counts when hasFocus() agrees. This is not the Mute
// button and must not write cozy-cat-cafe.audio.mute.
function ambHearable() {
  if (typeof document === 'undefined') return true;
  if (document.visibilityState === 'hidden') return false;
  // The tap that opened the shop is still this gesture. Focus may dip while
  // the page rebuilds; that is not "the window went away."
  if (Date.now() - ambGestureAt < 400) return true;
  if (typeof document.hasFocus === 'function' && document.hasFocus() === false) return false;
  return true;
}

// iOS keeps the Web Audio context suspended until a gesture resumes it.
// Howler.ctx.resume() alone leaves Howler.state suspended, and play() then
// waits forever for a "resume" event that never fires. _autoResume() is what
// emits that event. Keep the raw resume() too, for browsers that need it
// in the same turn as the tap.
function ambResumeCtx() {
  if (!ambHowlerReady()) return null;
  try {
    if (typeof Howler.autoSuspend !== 'undefined') Howler.autoSuspend = false;
    if (typeof Howler._autoResume === 'function') Howler._autoResume();
  } catch (e) { /* older builds */ }
  if (!Howler.ctx || typeof Howler.ctx.resume !== 'function') return null;
  try { return Howler.ctx.resume(); }
  catch (e) { return null; }
}

// Howler will not call HTMLMediaElement.play() until the loop file has loaded,
// which is after the tap. Chrome and Safari then reject that late play() and
// the loop stays silent. The node already exists once the Howl is constructed,
// so play() it in this same turn while the gesture is still valid.
function ambHtml5Node(howl) {
  if (!howl || howl._webAudio) return null;
  const sounds = howl._sounds;
  if (!sounds || !sounds.length || !sounds[0]) return null;
  const node = sounds[0]._node;
  if (!node || typeof node.play !== 'function') return null;
  return node;
}

function ambPrimeHtml5(howl) {
  const node = ambHtml5Node(howl);
  if (!node) return;
  try {
    node.loop = true;
    if (!ambMuted) node.volume = ambMusicVol;
    const pending = node.play();
    if (pending && typeof pending.catch === 'function') {
      pending.catch(() => {
        if (ambMusic === howl && ambMusicHtml5 && !ambMusicPlaying()) ambFailMusic();
      });
    }
  } catch (e) {
    if (ambMusic === howl && ambMusicHtml5 && !ambMusicPlaying()) ambFailMusic();
  }
}

function ambMusicPlaying() {
  if (ambMusic && typeof ambMusic.playing === 'function' && ambMusic.playing()) return true;
  const node = ambHtml5Node(ambMusic);
  return !!(node && node.paused === false && node.ended !== true);
}

function ambRecreateMusic() {
  if (ambMusic && typeof ambMusic.unload === 'function') ambMusic.unload();
  ambMusic = null;
  ambMusicId = null;
  ambInFlight = false;
}

let ambFailing = false;
let ambSfxWanted = '';

function ambEnsure() {
  if (!ambHowlerReady()) return false;
  if (!ambMusic) {
    ambMusic = new Howl({
      src: ambLoopSrc,
      format: ambLoopFmt,
      loop: true,
      volume: ambMusicVol,
      // HTML5 audio decodes this loop where the Web Audio buffer stays silent.
      // A play/load error rebuilds it once on Web Audio and tries again.
      html5: ambMusicHtml5,
      preload: true,
      onplayerror: () => ambFailMusic(),
      onloaderror: () => ambFailMusic(),
      onunlock: () => {
        if (ambWantPlay && !ambMusicPlaying()) {
          ambInFlight = false;
          ambIssuePlay();
        }
      },
    });
  }
  const vols = { stack: ambSfxVol, merge: ambSfxVol, serve: ambServeVol, destroy: ambDestroyVol, reset: 0.34, close: 0.36 };
  for (const name of ambSfxNames) {
    if (ambSfx[name]) continue;
    ambSfx[name] = new Howl({
      src: ambSfxSrc[name],
      format: ambSfxFmt[name],
      loop: false,
      volume: vols[name],
      html5: !!ambSfxHtml5[name],
      preload: true,
      onplayerror: () => ambFailSfx(name, true),
      onloaderror: () => ambFailSfx(name, false),
    });
  }
  if (typeof Howler.mute === 'function') Howler.mute(ambMuted);
  return true;
}

function ambIssuePlay() {
  if (!ambWantPlay || !ambMusic || ambMuted || !ambUnlocked || !ambRunOpen || !ambHearable()) return;
  if (ambInFlight || ambMusicPlaying()) return;
  const howl = ambMusic;
  ambInFlight = true;
  ambResumeCtx();
  let id = null;
  try {
    id = ambMusicId != null ? howl.play(ambMusicId) : howl.play();
  } catch (e) {
    ambInFlight = false;
    ambFailMusic();
    return;
  }
  // play() can swap the Howl from inside onplayerror. Don't keep the old id.
  if (ambMusic === howl && id != null) ambMusicId = id;
  else if (ambMusic === howl) ambInFlight = false;
  if (ambMusic === howl && ambMusicHtml5) ambPrimeHtml5(howl);
}

function ambScheduleRetry() {
  if (ambRetryTimer || ambMusicPlaying()) return;
  ambRetryTimer = setTimeout(() => {
    ambRetryTimer = 0;
    ambInFlight = false;
    if (ambWantPlay && !ambMuted && ambUnlocked && ambRunOpen && ambHearable() && !ambMusicPlaying()) ambIssuePlay();
  }, 700);
}

function ambFailMusic() {
  if (ambFailing || ambMusicPlaying() || !ambHearable()) return;
  ambFailing = true;
  ambInFlight = false;
  try {
    if (ambMusicHtml5) {
      ambMusicHtml5 = false;
      ambRecreateMusic();
      if (ambWantPlay && ambUnlocked && ambRunOpen && !ambMuted) {
        ambEnsure();
        ambIssuePlay();
      }
    } else if (ambMusic && typeof ambMusic.stop === 'function') {
      try { ambMusic.stop(); } catch (e) { /* already stopped */ }
      ambMusicId = null;
    }
  } finally {
    ambFailing = false;
  }
  if (!ambMusicPlaying() && ambHearable()) ambScheduleRetry();
}

// Replay only a sound that just failed while playing. A preload error must
// not chirp on its own — effects stay tied to a successful move.
function ambFailSfx(name, fromPlay) {
  if (ambMuted || !ambUnlocked) return;
  if (ambSfxHtml5[name]) return;
  ambSfxHtml5[name] = true;
  ambResumeCtx();
  const prev = ambSfx[name];
  if (prev && typeof prev.unload === 'function') prev.unload();
  ambSfx[name] = null;
  ambEnsure();
  if (fromPlay && ambHearable() && !ambMuted && ambSfxWanted === name && ambSfx[name]) ambSfx[name].play();
}

function ambArmWatch() {
  if (ambWatch) clearTimeout(ambWatch);
  ambWatch = setTimeout(ambWatchTick, 1200);
}

function ambWatchTick() {
  ambWatch = 0;
  if (!ambHearable() || !ambWantPlay || ambMuted || !ambRunOpen || !ambUnlocked || !ambMusic) return;
  if (ambMusicPlaying()) return;
  const state = typeof ambMusic.state === 'function' ? ambMusic.state() : 'loaded';
  if (state === 'loading') {
    ambArmWatch();
    return;
  }
  // Loaded (or failed) and still silent: drop the latch and try the other engine.
  ambInFlight = false;
  ambFailMusic();
}

function ambStartMusic() {
  if (!ambRunOpen || !ambUnlocked || ambMuted || !ambHearable()) return;
  ambWantPlay = true;
  if (!ambEnsure() || !ambMusic) return;
  ambResumeCtx();
  if (ambMusicPlaying()) return;
  ambIssuePlay();
  ambArmWatch();
}

function ambPauseMusic() {
  ambWantPlay = false;
  ambInFlight = false;
  if (ambWatch) { clearTimeout(ambWatch); ambWatch = 0; }
  if (ambRetryTimer) { clearTimeout(ambRetryTimer); ambRetryTimer = 0; }
  const node = ambHtml5Node(ambMusic);
  if (node && typeof node.pause === 'function') {
    try { node.pause(); } catch (e) { /* element already gone */ }
  }
  if (ambMusic && ambMusicId != null) ambMusic.pause(ambMusicId);
  else if (ambMusic) ambMusic.pause();
}

export function cafeAudioMuted() {
  return ambMuted;
}

export function toggleCafeAudio() {
  ambMuted = !ambMuted;
  ambWriteMute(ambMuted);
  if (ambHowlerReady() && typeof Howler.mute === 'function') Howler.mute(ambMuted);
  if (!ambMuted) ambStartMusic();
  return ambMuted;
}

export function noteCafeOpen() {
  ambRunOpen = true;
  ambStartMusic();
}

export function noteCafeClosed() {
  ambRunOpen = false;
  ambPauseMusic();
}

// name is 'stack' | 'merge' | 'serve' | 'destroy' | 'reset' | 'close'. Ignored until a gesture
// unlocks audio, while muted, and while the page is hidden or unfocused.
// Unknown names are a no-op (no extra effects).
export function playCafeSfx(name) {
  if (!ambUnlocked || ambMuted || !ambHearable()) return;
  if (!ambSfxNames.includes(name)) return;
  if (!ambEnsure()) return;
  const howl = ambSfx[name];
  if (!howl) return;
  ambSfxWanted = name;
  ambResumeCtx();
  howl.play();
}

export function unlockCafeAudio() {
  ambUnlocked = true;
  if (ambMusic && !ambMusicPlaying()) ambInFlight = false;
  ambEnsure();
  ambResumeCtx();
  ambStartMusic();
}

function ambSilenceSfx() {
  for (const name of ambSfxNames) {
    const howl = ambSfx[name];
    if (!howl) continue;
    try {
      if (typeof howl.stop === 'function') howl.stop();
      else if (typeof howl.pause === 'function') howl.pause();
    } catch (e) { /* already stopped */ }
  }
}

// Open Shop replaces the whole page and Chrome blurs the window in that same
// moment, even though the tab is still visible. A blur that arrives with the
// tap is that rebuild, not the player leaving. A later blur (another window)
// still silences. A hidden tab always silences, including during the tap.
function ambBlurIsRebuild() {
  if (typeof document === 'undefined' || document.visibilityState === 'hidden') return false;
  return Date.now() - ambGestureAt < 400;
}

// Drop the loop and any effect that is still ringing. The saved mute flag
// stays untouched; coming back calls ambStartMusic, which respects it.
function ambSyncHearing() {
  if (ambBlurIsRebuild()) {
    // Chrome may already have suspended the element when focus dipped.
    // Start it again; this blur belongs to the tap, not to leaving.
    const wasAway = !ambHeard;
    ambHeard = true;
    if (!ambMuted && (wasAway || !ambMusicPlaying())) ambStartMusic();
    return;
  }
  const hear = ambHearable();
  if (hear === ambHeard) return;
  ambHeard = hear;
  if (!hear) {
    ambSilenceSfx();
    ambPauseMusic();
    return;
  }
  if (!ambMuted) ambStartMusic();
}

function ambOnGesture(e) {
  ambGestureAt = Date.now();
  const muteTap = e && e.target && typeof e.target.closest === 'function' && e.target.closest('#btnMute');
  ambUnlocked = true;
  // A stuck first play() must not keep the rest of the session silent.
  if (ambMusic && !ambMusicPlaying()) ambInFlight = false;
  ambEnsure();
  ambResumeCtx();
  if (!muteTap) ambStartMusic();
}

export function bindCafeAudio() {
  ambMuted = ambReadMute();
  if (ambHowlerReady() && typeof Howler.mute === 'function') Howler.mute(ambMuted);
  if (ambGestureBound || typeof document === 'undefined' || !document.addEventListener) return;
  ambGestureBound = true;
  document.addEventListener('pointerdown', ambOnGesture, true);
  document.addEventListener('keydown', ambOnGesture, true);
  document.addEventListener('visibilitychange', ambSyncHearing);
  const host = typeof window !== 'undefined' ? window : null;
  if (host && typeof host.addEventListener === 'function') {
    host.addEventListener('blur', ambSyncHearing);
    host.addEventListener('focus', ambSyncHearing);
  }
  ambSyncHearing();
}
