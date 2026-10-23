import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

const CLIP_IDS = ['destroyPile','swapPiles','refreshPool','tables','tips','undoMove','color','unlockLocks','clearBoard','rotateBoard'];

test('version footer is v2.24.40', () => {
  assert.match(html, /GAME_VERSION = 'v2\.24\.40'/);
});

test('tutorial steps name a gesture and a target only where a touch is shown', () => {
  const steps = html.slice(html.indexOf('const TUT_STEPS'), html.indexOf('const PAW_SCALE'));
  assert.match(steps, /sel: '#pool', gesture: 'tap', target: \['#pool \.poolslot', '#board \.cell:not\(\.dormant\):not\(\.blocked\)'\]/);
  assert.match(steps, /sel: '#btnClose', gesture: 'hold', target: '#btnClose'/);
  assert.match(steps, /sel: '#powerbar', gesture: 'tap-hold', target: '#powerbar \.pow'/);
  const orders = steps.slice(steps.indexOf("sel: '#orders'"), steps.indexOf("sel: '#queueCount'"));
  const queue = steps.slice(steps.indexOf("sel: '#queueCount'"), steps.indexOf("sel: '#btnClose'"));
  assert.equal(orders.includes('gesture'), false);
  assert.equal(queue.includes('gesture'), false);
  assert.match(html, /function startTutPaw/);
  assert.match(html, /function stopTutPaw/);
  assert.match(html, /startTutPaw\(step\)/);
  assert.match(html, /id="tutPaw"/);
});

test('the paw is 64 CSS px, pixelated, and a press keeps the toe on the target', () => {
  assert.match(css, /\.tut-paw\{[^}]*width:64px;height:64px/);
  assert.match(css, /\.tut-paw\{[^}]*image-rendering:pixelated/);
  assert.match(css, /\.tut-paw\{[^}]*z-index:97/);
  assert.match(html, /hold_0:\[9,9\]/);
  assert.match(html, /tap_0:\[9,6\]/);
  assert.match(html, /tap_1:\[9,9\]/);
  assert.match(html, /idle_1:\[9,5\]/);
  assert.match(html, /drag_0:\[8,9\]/);
  assert.match(html, /tx - \(hx \+ 0\.5\) \* PAW_SCALE/);
  assert.match(html, /31 - hot\[0\]/);
  assert.match(html, /scaleX\(-1\)/);
  assert.match(html, /ms:\[450,220\]/);
  assert.match(html, /ms:\[140,140,140,200\]/);
  assert.match(html, /ms:\[300,300\]/);
  assert.match(html, /ms:\[500,500\]/);
  assert.match(html, /function pawTarget\(sel\)/);
  assert.match(html, /const el = pawTarget\(sel\)/);
  assert.match(html, /function pawReduced\(\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /hold_0/);
});

test('each skill tip plays a muted looping clip inside the 220×140 frame', () => {
  assert.match(html, /id="skillClip"/);
  assert.match(html, /id="skillClipVid"/);
  assert.match(html, /id="skillPopText"/);
  assert.match(html, /id="skillPopTable"/);
  assert.match(html, /muted autoplay playsinline loop/);
  assert.match(html, /mountSkillClip\(skill\)/);
  assert.match(css, /\.skill-clip-frame\{[^}]*width:220px;height:140px[^}]*overflow:visible/);
  assert.match(css, /\.skill-clip-vid,\.skill-clip-still\{[^}]*left:10px;top:10px;width:200px;height:120px/);
  assert.match(css, /\.skill-clip-cat\{[^}]*left:162px;top:-26px;width:40px;height:34px/);
  assert.match(html, /clip_frame\.png/);
  assert.match(html, /clip_ornament_cat\.png/);
  assert.match(html, /type="video\/webm"/);
  assert.match(html, /type="video\/mp4"/);
  const ids = html.slice(html.indexOf('const SKILL_CLIP_IDS'), html.indexOf('function skillClipSrc'));
  for (const id of CLIP_IDS) assert.match(ids, new RegExp(id));
  for (const file of [
    'assets/tutorial/paw/hand_idle_sheet.png',
    'assets/tutorial/paw/hand_tap_sheet.png',
    'assets/tutorial/paw/hand_hold_sheet.png',
    'assets/tutorial/paw/hand_drag_sheet.png',
    'assets/tutorial/clip/clip_frame.png',
    'assets/tutorial/clip/clip_ornament_cat.png',
  ]) assert.ok(existsSync(join(root, file)), file);
  for (const id of CLIP_IDS) {
    assert.ok(existsSync(join(root, 'assets/tutorial/clips/'+id+'.webm')), id+' webm');
    assert.ok(existsSync(join(root, 'assets/tutorial/clips/'+id+'.mp4')), id+' mp4');
    assert.ok(existsSync(join(root, 'assets/tutorial/clips/'+id+'.png')), id+' poster');
  }
});
