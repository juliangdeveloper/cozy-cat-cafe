// v2.22 UI contract: one header row, shop gone, skills in a 2-row grid,
// next price inside the button, speaker mute, order glow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

function sliceFn(name, next) {
  const start = html.indexOf(`function ${name}`);
  const end = html.indexOf(`function ${next}`, start + 1);
  assert.ok(start >= 0 && end > start, name);
  return html.slice(start, end);
}

test('version footer stays and reads v2.22.4', () => {
  assert.match(html, /GAME_VERSION = 'v2\.23\.0'/);
  assert.match(html, /☕ Cozy Cat Café \$\{GAME_VERSION\}/);
  assert.match(html, /Hold 3s to restart/);
});

test('status and rotate/restart share one chrome strip', () => {
  const run = sliceFn('renderRun', 'renderCalamity');
  const top = run.indexOf('class="topbar"');
  const orders = run.indexOf('id="orders"');
  const header = run.slice(top, orders);
  assert.ok(header.includes('id="coinNum"'));
  assert.ok(header.includes('id="calStrip"'));
  assert.ok(header.includes('class="cal-ico-btn"'));
  assert.equal(header.includes('cal-bar'), false);
  assert.equal(header.includes('id="calFill"'), false);
  assert.ok(header.includes('id="queueCount"'));
  assert.ok(header.includes('id="btnSave"'));
  assert.ok(header.includes('id="btnRotate"'));
  assert.ok(header.includes('id="btnClose"'));
  assert.ok(header.includes('muteBtnMarkup()'));
  assert.equal(header.includes('id="btnShop"'), false);
  assert.equal(header.includes('class="queuebar"'), false);
  assert.equal(run.includes('class="run-actions"'), false);
  const strip = header.indexOf('id="calStrip"');
  const count = header.indexOf('id="queueCount"');
  const rotate = header.indexOf('id="btnRotate"');
  const restart = header.indexOf('id="btnClose"');
  assert.ok(strip >= 0 && count > strip && rotate > count && restart > rotate);
  assert.match(css, /\.topbar\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.cal-ico-btn\{[^}]*min-height:\s*40px/);
  assert.match(css, /\.cal-ico-btn\{[^}]*--cal-p/);
  assert.match(css, /color-mix\(in srgb, var\(--danger\)/);
  assert.doesNotMatch(css, /\.cal-strip\{/);
  assert.doesNotMatch(header, /class="cal-bar"/);
  assert.match(css, /\.chrome-hold\{[^}]*min-height:\s*40px/);
  assert.match(css, /\.hdr-tools \.iconbtn\{[^}]*min-height:\s*40px/);
});

test('shop panel is gone and former café buys sit in the skill grid', () => {
  assert.equal(html.includes('id="shopModal"'), false);
  assert.equal(html.includes('id="btnShop"'), false);
  assert.equal(html.includes('function showShop'), false);
  assert.equal(html.includes('This café only'), false);
  const powers = sliceFn('renderPowers', 'refreshFlow');
  for (const id of ['destroyPile', 'swapPiles', 'refreshPool', 'tables', 'unlockLocks', 'queueSkip', 'previewPool', 'color', 'tips']) {
    assert.match(powers, new RegExp(`skill:'${id}'`));
  }
  assert.doesNotMatch(powers, /serveManual/);
  assert.doesNotMatch(powers, /mode:'waiter'/);
  assert.doesNotMatch(html, /toggleServe/);
  assert.doesNotMatch(html, /Turn auto-serve/);
  assert.match(powers, /mode:'preview'/);
  assert.match(powers, /mode:'color'/);
  assert.match(powers, /mode:'tips'/);
  assert.doesNotMatch(powers, /queueSkip\.owned\)\s*\n\s*arr\.push/);
  assert.match(powers, /class="pow-cost"/);
  assert.doesNotMatch(powers, /class="pow-label"/);
  assert.doesNotMatch(powers, /class="uses"/);
});

test('using the chalkboard opens a modal of the next tray piles', () => {
  assert.match(html, /id="peekPop"/);
  assert.match(html, /id="peekTrays"/);
  assert.match(html, /id="peekPopClose"/);
  assert.match(html, /aria-labelledby="peekTitle"/);
  assert.match(html, /function openPeekModal/);
  assert.match(html, /function closePeekModal/);
  assert.match(html, /previewPool\(state,\s*mulberry32\(ui\.previewSeed/);
  assert.match(html, /class="pv-pile"/);
  assert.match(html, /class="pv-t"/);
  assert.match(html, /Peek at the next trays before they arrive\./);
  const powers = sliceFn('renderPowers', 'refreshFlow');
  assert.match(powers, /mode==='preview'/);
  assert.match(powers, /openPeekModal\(\)/);
  assert.match(powers, /peekLvl>0 && p\.classList\.contains\('broke'\)/);
  assert.doesNotMatch(powers, /maxed/);
  assert.doesNotMatch(powers, /Maxed/);
  assert.doesNotMatch(powers, /pow-cost">Max/);
  assert.match(html, /if\(e\.target === peekPop\) closePeekModal/);
  const help = sliceFn('openSkillHelp', 'closeSkillHelp');
  assert.match(help, /closePeekModal\(\)/);
});

test('buying a color names the creature and shows its swatch', () => {
  const powers = sliceFn('renderPowers', 'refreshFlow');
  assert.match(powers, /Unlocked: '/);
  assert.match(powers, /creatureName\(n\)/);
  assert.match(powers, /\(color '/);
  assert.match(powers, /toast\('Unlocked: '\+who\+' \(color '\+n\+'\)', faceColor\(n\)\)/);
  assert.match(powers, /Every color in this café is already in\./);
  assert.doesNotMatch(powers, /New roster color/);
  assert.match(html, /\.toast-swatch/);
  assert.match(html, /function toast\(msg, colorId\)/);
});

test('a skill hold opens one sentence and a short tap still uses it', () => {
  assert.equal(html.includes('SKILL_HELP_MS = 500'), true);
  assert.match(html, /id="skillPop"/);
  assert.match(html, /id="skillPopClose"/);
  assert.match(html, /Clear every tile off one table\./);
  assert.match(html, /Trade the stacks on two tables\./);
  assert.match(html, /Open one more table beside the ones already open\./);
  assert.match(html, /if\(e\.target === skillPop\) closeSkillHelp/);
  assert.match(html, /openSkillHelp\(p\.dataset\.skill\)/);
  const powers = sliceFn('renderPowers', 'refreshFlow');
  assert.match(powers, /tookHold\(\)/);
  assert.match(powers, /bindSkillHold/);
  assert.match(powers, /mode==='activate'/);
  assert.doesNotMatch(powers, /activateAroundUnlocked/);
});

test('skills are two rows, prices stay inside the button', () => {
  assert.match(css, /\.powerbar\{[^}]*display:grid/);
  assert.match(css, /\.powerbar\{[^}]*grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.doesNotMatch(css, /grid-template-columns:repeat\(3/);
  assert.doesNotMatch(css, /\.powerbar\{[^}]*overflow-x:\s*auto/);
  assert.doesNotMatch(css, /\.powerbar\{[^}]*flex-wrap:\s*nowrap/);
  assert.match(css, /\.pow\{[^}]*min-height:44px/);
  assert.match(css, /\.pow-cost\{[^}]*position:static/);
  assert.doesNotMatch(css, /\.pow \.uses\{[^}]*top:\s*-/);
  const powers = sliceFn('renderPowers', 'refreshFlow');
  assert.match(powers, /title=/);
  assert.match(powers, /aria-label=/);
  assert.match(powers, /broke/);
});

test('mute is a speaker icon and still names Mute music', () => {
  const mute = sliceFn('speakerMarkup', 'renderIdle');
  assert.match(mute, /class="mute-ico"/);
  assert.match(mute, /Mute music/);
  assert.match(mute, /Unmute music/);
  assert.equal(mute.includes('textContent'), false);
  assert.match(mute, /innerHTML = speakerMarkup/);
  assert.match(html, /cozy-cat-cafe\.audio\.mute|toggleCafeAudio/);
});

test('first-run spotlight matches auto-serve, restart, and skill tips', () => {
  const start = html.indexOf('const TUT_STEPS');
  const end = html.indexOf('let tutStep');
  assert.ok(start >= 0 && end > start);
  const steps = html.slice(start, end);
  for (const sel of ['#pool', '#orders', '#queueCount', '#btnClose', '#powerbar']) {
    assert.match(steps, new RegExp(`sel: '${sel.replace('#', '\\#')}'`));
  }
  assert.match(steps, /Matching tops serve themselves/);
  assert.match(steps, /serve 100 customers/);
  assert.match(steps, /served\/100/);
  assert.match(steps, /Hold 3s to restart/);
  assert.match(steps, /Coins reset/);
  assert.match(steps, /Tap a skill to spend coins/);
  assert.match(steps, /one-line tip/);
  assert.doesNotMatch(steps, /keep the coins/i);
  assert.doesNotMatch(steps, /keep your coins/i);
  assert.doesNotMatch(steps, /Hold Close/);
  assert.doesNotMatch(steps, /Waiter|serveManual/);
  assert.match(html, /if\(step\.sel==='#btnClose'\) el\.classList\.add\('tut-spot-block'\)/);
  assert.match(html, /maybeStartTutorial\(\)/);
  const boardZ = Number((css.match(/body\.tut-on \.board-wrap,body\.tut-on \.pool\{[^}]*z-index:(\d+)/) || [])[1]);
  const holeZ = Number((css.match(/\.tut-hole\{[^}]*z-index:(\d+)/) || [])[1]);
  const cardZ = Number((css.match(/\.tut-card\{[^}]*z-index:(\d+)/) || [])[1]);
  assert.ok(boardZ > 0 && holeZ > boardZ && cardZ > boardZ, `layer board ${boardZ} hole ${holeZ} card ${cardZ}`);
  const overlayAt = html.indexOf('<div id="tutOverlay"');
  const cardAt = html.indexOf('<div class="tut-card"');
  const holeAt = html.indexOf('<div class="tut-hole"');
  assert.ok(overlayAt >= 0 && cardAt > overlayAt && holeAt > overlayAt);
  assert.equal(html.slice(overlayAt, overlayAt + 40).includes('tut-card'), false);
});

test('a selected order glows only cells the rules already accept', () => {
  const glow = sliceFn('orderGlowKind', 'hx');
  assert.match(glow, /orderReadyOn\(state, o\.id, idx\)/);
  assert.match(glow, /topGroup\(pile\)\.color===o\.color/);
  assert.match(glow, /cell\.blocked \|\| cell\.dormant/);
  assert.match(glow, /return toward \? 'place' : ''/);
  assert.match(html, /order-glow/);
  assert.match(html, /data-order-glow/);
  const cell = sliceFn('cellHTML', 'renderBoard');
  assert.equal(/servingOrder!==null && !cell\.blocked && !cell\.dormant\) cls\+=' serve-target'/.test(cell), false);
});
