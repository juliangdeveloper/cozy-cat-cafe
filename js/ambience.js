// ============================================================================
// Cozy Cat Café — ambience + three board effects.
// Browser audio only. js/game.js must not import this module.
// Locked loop: Hybrid Sunlatte. Effects: stack, merge, serve.
// Mute is shared and stored in localStorage (survives reload).
// ============================================================================

const ambMuteKey = 'cozy-cat-cafe.audio.mute';
// The master peaks near full scale but 0.3 sat under laptop speakers.
// 0.62 is clearly audible and still sits under the board.
const ambMusicVol = 0.62;
const ambSfxVol = 0.22;
const ambServeVol = 0.26;

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
let ambInFlight = false;
let ambWantPlay = false;
let ambMusicHtml5 = true;
let ambWatch = 0;
let ambRetryTimer = 0;
let ambSfx = { stack: null, merge: null, serve: null };
let ambSfxHtml5 = { stack: false, merge: false, serve: false };
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

// Howler will not call HTMLMediaElement.play() until the mp3 has loaded, which
// is after the tap. Chrome and Safari then reject that late play() and the
// loop stays silent. The node already exists once the Howl is constructed, so
// play() it in this same turn while the gesture is still valid.
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
      // HTML5 audio decodes this mp3 where the Web Audio buffer stays silent.
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
  const vols = { stack: ambSfxVol, merge: ambSfxVol, serve: ambServeVol };
  for (const name of ['stack', 'merge', 'serve']) {
    if (ambSfx[name]) continue;
    ambSfx[name] = new Howl({
      src: ambSfxSrc[name],
      format: ambSfxFmt,
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
  if (!ambWantPlay || !ambMusic || ambMuted || !ambUnlocked || !ambRunOpen) return;
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
    if (ambWantPlay && !ambMuted && ambUnlocked && ambRunOpen && !ambMusicPlaying()) ambIssuePlay();
  }, 700);
}

function ambFailMusic() {
  if (ambFailing || ambMusicPlaying()) return;
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
  if (!ambMusicPlaying()) ambScheduleRetry();
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
  if (fromPlay && ambSfxWanted === name && ambSfx[name]) ambSfx[name].play();
}

function ambArmWatch() {
  if (ambWatch) clearTimeout(ambWatch);
  ambWatch = setTimeout(ambWatchTick, 1200);
}

function ambWatchTick() {
  ambWatch = 0;
  if (!ambWantPlay || ambMuted || !ambRunOpen || !ambUnlocked || !ambMusic) return;
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
  if (!ambRunOpen || !ambUnlocked || ambMuted) return;
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

// name is 'stack' | 'merge' | 'serve'. Ignored until a gesture unlocks audio,
// and ignored while muted. Unknown names are a no-op (no extra effects).
export function playCafeSfx(name) {
  if (!ambUnlocked || ambMuted) return;
  if (name !== 'stack' && name !== 'merge' && name !== 'serve') return;
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

function ambOnGesture(e) {
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
}
