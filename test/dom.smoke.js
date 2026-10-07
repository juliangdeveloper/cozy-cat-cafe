// DOM-level smoke test: run the ACTUAL index.html app module inside jsdom,
// with the REAL js/game.js logic imported, then simulate a play session.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

// capture async failures instead of crashing mysteriously
const reset = { fired:false };
process.on('uncaughtExceptionMonitor', (e)=>{ global.__asyncErr = (e&&e.message)||String(e); });
process.on('uncaughtException', (e)=>{ console.log('UNCAUGHT-STACK:', (e&&e.stack)||String(e)); try{ unlinkSync(join(base,'test','.app_runner.mjs'));}catch(_){} process.exit(1); });

const base = dirname(dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(join(base, 'index.html'), 'utf-8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('no module script');

const dom = new JSDOM(html
  .replace(/<script src="\.\/vendor\/howler\.min\.js"><\/script>\s*/, '')
  .replace(/<script type="module">[\s\S]*?<\/script>/, ''), {
  runScripts: 'dangerously', pretendToBeVisual: true,
  url: 'http://localhost/',
});
const { window } = dom;
const { document } = window;

// polyfills jsdom lacks
window.matchMedia = (q) => ({ matches:false, media:q, addEventListener(){}, removeEventListener(){},
  addListener(){}, removeListener(){} });
window.Image = class { set src(v){ if(v&&this.onload) setTimeout(()=>this.onload(),0);} constructor(){this.onload=null;this.onerror=null;} };
window.fetch = async () => { throw new Error('no-network'); };

// export module globals to jsdom window so the app sees them
// jsdom provides localStorage (http origin); ensure available
if(!window.localStorage){ const s={}; try{ Object.defineProperty(window,'localStorage',{value:{getItem:k=>s[k]||null,setItem:(k,v)=>{s[k]=String(v);},removeItem:k=>{delete s[k]; }},configurable:true});}catch(_){} }

// jsdom provides localStorage already; ensure it
if(globalThis.localStorage && typeof globalThis.localStorage=== 'object'){};
window.setInterval = global.setInterval.bind(global);
window.setTimeout  = global.setTimeout.bind(global);
window.clearInterval = global.clearInterval.bind(global);
window.clearTimeout  = global.clearTimeout.bind(global);
window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
window.cancelAnimationFrame = (id) => clearTimeout(id);

// expose jsdom as Node globals so the app module's bare refs resolve
globalThis.window = window;
globalThis.document = window.document;
globalThis.localStorage = window.localStorage;
globalThis.fetch = window.fetch;
globalThis.Image = window.Image;
globalThis.matchMedia = window.matchMedia;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.setInterval = global.setInterval.bind(global);
globalThis.setTimeout  = global.setTimeout.bind(global);
globalThis.clearInterval = global.clearInterval.bind(global);
globalThis.clearTimeout  = global.clearTimeout.bind(global);
globalThis.requestAnimationFrame = window.requestAnimationFrame;
globalThis.cancelAnimationFrame = window.cancelAnimationFrame;

// Build bridge module: real imports + app body + exposed boot.
// Take the game import from the page so new skills stay in the smoke boot.
const appCode = m[1];
const gameImp = appCode.match(/import\s*\{([\s\S]*?)\}\s*from\s*'\.\/js\/game\.js'/);
if (!gameImp) throw new Error('no game import');
const importBlock = gameImp[1]
  .split('\n')
  .map((line) => line.replace(/\/\/.*$/, ''))
  .join('\n');
const header = `import {${importBlock}} from '../js/game.js';\n`;
const appBody = appCode
  .replace(/import \{[\s\S]*?from '\.\/js\/game\.js';/, '')
  .replace(/from '\.\/js\/ambience\.js'/g, "from '../js/ambience.js'");
const bridge = header + appBody + '\nwindow.__boot = boot;\n';
const tmp = join(base, 'test', '.app_runner.mjs');
writeFileSync(tmp, bridge);

const sleep = ms => new Promise(r=>global.setTimeout(r, ms));
const results = { };
try {
  await import('file:///' + tmp.replace(/\\/g,'/'));
  if (window.__boot) await window.__boot();
  await sleep(80);
  results.menuShows = /Open Shop/.test(document.body.innerText || '');
  results.opened = !!document.getElementById('board');
  results.boardCells = document.querySelectorAll('#board .cell').length;
  results.poolSlots = document.querySelectorAll('#pool .poolslot').length;
  results.hasOrders = document.querySelectorAll('#orders .order-card').length > 0;
  results.hasCalStrip = !!document.getElementById('calStrip');
  const slot = document.querySelector('#pool .poolslot:not(.drop)');
  const tile = document.querySelector('#board .cell:not(.blocked):not(.dormant)');
  if (slot && tile) {
    const beforeTiles = document.querySelectorAll('#board .tile').length;
    slot.click(); await sleep(10);
    tile.click(); await sleep(40);
    await sleep(700);
    const afterTiles = document.querySelectorAll('#board .tile').length;
    results.placedTilesAfter = afterTiles - beforeTiles;
    results.boardAfterPlace = document.querySelectorAll('#board .cell').length;
  } else {
    results.noPlaceable = true;
  }
  results.shopGone = !document.getElementById('btnShop') && !document.getElementById('shopModal');
  results.powerCount = document.querySelectorAll('#powerbar .pow').length;
  results.headerKids = document.querySelector('.topbar') ? document.querySelector('.topbar').children.length : 0;
  // a click is not a restart; the hold is 3s and must not open a lose modal
  document.getElementById('btnClose').click(); await sleep(20);
  results.closeOpens = document.getElementById('closeModal').classList.contains('show');
} catch(e) {
  results.runError = (e&&e.message)||String(e);
  results.errStack = (e&&e.stack||'').slice(0,600);
}
results.asyncError = global.__asyncErr;
console.log(JSON.stringify(results, null, 2));
try{ unlinkSync(tmp); }catch(_){}
const ok = results.opened && results.menuShows === false && results.hasCalStrip
  && results.shopGone && results.powerCount === 11
  && results.closeOpens === false && !results.runError;
process.exit(ok ? 0 : 1);