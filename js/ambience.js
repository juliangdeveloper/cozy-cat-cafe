// ============================================================================
// Cozy Cat Café — ambience + three board effects.
// Browser audio only. js/game.js must not import this module.
// Locked loop: Hybrid Sunlatte. Effects: stack, merge, serve.
// Mute is shared and stored in localStorage (survives reload).
// ============================================================================

const ambMuteKey = 'cozy-cat-cafe.audio.mute';
const ambMusicVol = 0.3;
const ambSfxVol = 0.14;
const ambServeVol = 0.16;

const ambLoopSrc = ['./assets/audio/hybrid-sunlatte.mp3'];
const ambLoopFmt = ['mp3'];
const ambSfxSrc = {
  stack: ['./assets/audio/sfx-stack.ogg', './assets/audio/sfx-stack.mp3'],
  merge: ['./assets/audio/sfx-merge.ogg', './assets/audio/sfx-merge.mp3'],
  serve: ['./assets/audio/sfx-serve.ogg', './assets/audio/sfx-serve.mp3'],
};
const ambSfxFmt = ['ogg', 'mp3'];

let ambMusic = null;
let ambMusicId = null;
let ambStartPending = false;
let ambSfx = { stack: null, merge: null, serve: null };
let ambMuted = false;
let ambUnlocked = false;
let ambRunOpen = false;
let ambGestureBound = false;

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

// iOS keeps the Web Audio context suspended until a gesture resumes it.
// Without this, the built-in speaker stays silent even after play().
function ambResumeCtx() {
  if (!ambHowlerReady() || !Howler.ctx || typeof Howler.ctx.resume !== 'function') return;
  Howler.ctx.resume();
}

function ambEnsure() {
  if (!ambHowlerReady()) return false;
  if (!ambMusic) {
    ambMusic = new Howl({
      src: ambLoopSrc,
      format: ambLoopFmt,
      loop: true,
      volume: ambMusicVol,
      html5: false,
      preload: true,
    });
  }
  const vols = { stack: ambSfxVol, merge: ambSfxVol, serve: ambServeVol };
  for (const name of ['stack', 'merge', 'serve']) {
    if (ambSfx[name]) continue;
    ambSfx[name] = new Howl({
      src: ambSfxSrc[name],
      format: ambSfxFmt,
      loop: false,
      volume: vols[name],
      html5: false,
      preload: true,
    });
  }
  Howler.mute(ambMuted);
  return true;
}

function ambStartMusic() {
  if (!ambRunOpen || !ambUnlocked || ambMuted) return;
  if (!ambEnsure() || !ambMusic) return;
  ambResumeCtx();
  // playing() stays false until the buffer decodes. A second render in that
  // window would stack another copy of the loop, so the first play() latches.
  if (ambMusic.playing() || ambStartPending) return;
  ambStartPending = true;
  if (ambMusicId != null) ambMusic.play(ambMusicId);
  else ambMusicId = ambMusic.play();
}

function ambPauseMusic() {
  ambStartPending = false;
  if (ambMusic && ambMusicId != null) ambMusic.pause(ambMusicId);
  else if (ambMusic) ambMusic.pause();
}

export function cafeAudioMuted() {
  return ambMuted;
}

export function toggleCafeAudio() {
  ambMuted = !ambMuted;
  ambWriteMute(ambMuted);
  if (ambHowlerReady()) Howler.mute(ambMuted);
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

// name is 'stack' | 'merge' | 'serve'. Ignored until a gesture unlocks audio,
// and ignored while muted. Unknown names are a no-op (no extra effects).
export function playCafeSfx(name) {
  if (!ambUnlocked || ambMuted) return;
  if (name !== 'stack' && name !== 'merge' && name !== 'serve') return;
  if (!ambEnsure()) return;
  const howl = ambSfx[name];
  if (howl) howl.play();
}

export function unlockCafeAudio() {
  ambUnlocked = true;
  ambEnsure();
  ambResumeCtx();
  ambStartMusic();
}

function ambOnGesture(e) {
  const muteTap = e && e.target && typeof e.target.closest === 'function' && e.target.closest('#btnMute');
  ambUnlocked = true;
  ambEnsure();
  ambResumeCtx();
  if (!muteTap) ambStartMusic();
}

export function bindCafeAudio() {
  ambMuted = ambReadMute();
  if (ambHowlerReady()) Howler.mute(ambMuted);
  if (ambGestureBound || typeof document === 'undefined' || !document.addEventListener) return;
  ambGestureBound = true;
  document.addEventListener('pointerdown', ambOnGesture, true);
  document.addEventListener('keydown', ambOnGesture, true);
}
