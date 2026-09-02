// audit_v22_dom.mjs — audit merge v3 (hexasort original) en dist file://
// A) FIDELIDAD DEL ESPEJO (determinista): cascadeLinks(base) vs resolveCascade(base)
// B) ANIMACIÓN: flecha + anillos visibles durante el merge vía clicks reales
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 414, height: 880 } });
const page = await browser.newPage();
await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
await page.click('#btnOpen'); await sleep(700);
await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));

// sembrar A=[2,2] (celda 0) y B=[2] (celda 1) — vecinos contiguos => grupo {0,1}
const seed = await page.evaluate(() => {
  const b = window.__dbg.state.run.board;
  const play = (i) => b[i] && !b[i].blocked && !b[i].dormant && b[i].stack.length === 0;
  const A = b.findIndex((c, i) => play(i) && play(i + 1));
  if (A < 0) return { ok: false };
  b[A].stack = [2, 2]; b[A + 1].stack = [2];
  return { ok: true, A, B: A + 1 };
});
if (!seed.ok) { console.log('SKIP: sin 2 vecinos vacíos', JSON.stringify(seed)); process.exit(2); }

// A) espejo determinista sobre el MISMO estado base (scope fijo: celdas 0-1)
const mirror = await page.evaluate(() => {
  const base = structuredClone(window.__dbg.state);
  const [A, B] = [0, 1];                          // scope fijo: celdas 0 y 1
  const links = window.__dbg.cascadeLinks(base);
  const oracle = window.__dbg.resolveCascade(base);
  const last = links.length ? links[links.length - 1].snap.run.board.map(c => c.stack) : null;
  const orc = oracle.state.run.board.map(c => c.stack);
  const mergedArrows = links.flatMap(l => l.merged || []);
  const finalB = last || base.run.board.map(c => c.stack);
  return { nLinks: links.length, arrows: mergedArrows.length,
    equal: JSON.stringify(last) === JSON.stringify(orc),
    froms: mergedArrows.map(m => m.from), tos: mergedArrows.map(m => m.to),
    lenA: finalB[A].length, lenB: finalB[B].length };
});
const failsA = [];
if (!mirror.equal) failsA.push('espejo: board final de cascadeLinks != resolveCascade');
if (mirror.nLinks < 1) failsA.push('esperaba >=1 eslabón con merge');
if (mirror.arrows < 1) failsA.push('esperaba >=1 tirón merged[]');
if (!(mirror.lenA === 0 || mirror.lenB === 0)) failsA.push(`fuente debe quedar vacía (A=${mirror.lenA}, B=${mirror.lenB})`);

// B) animación con clicks reales: recolocar pilas y colocar pila en X
// B) animación: el grupo {A,B} ya está sembrado en vivo — colocar pila en una
// celda vacía cualquiera dispara playCascade y el merge se ve animado
await page.evaluate(() => {
  const b = window.__dbg.state.run.board;
  const X = b.findIndex((c, i) => c && !c.blocked && !c.dormant && c.stack.length === 0);
  window.__x = X;
  document.querySelector('#pool .poolslot').click();
});
await sleep(150);
await page.evaluate(() => {
  const el = document.querySelector(`#board .cell[data-id="${window.__x}"] .hexbg`)
    || document.querySelector(`#board .cell[data-id="${window.__x}"]`);
  el.click();
});
await sleep(900);
const anim = await page.evaluate(() => ({
  arrows: document.querySelectorAll('.mergearrow').length,
  rings: document.querySelectorAll('.cell.casc').length }));
await page.screenshot({ path: 'audit-v22-merge.png' });
await browser.close();
const failsB = [];
if (anim.arrows < 1) failsB.push(`sin .mergearrow visible (vi ${anim.arrows})`);
if (anim.rings < 2) failsB.push(`sin anillos .cell.casc (vi ${anim.rings})`);
if (failsA.length || failsB.length) {
  console.log('FALLOS:'); [...failsA, ...failsB].forEach(f => console.log(' -', f)); process.exit(1);
}
console.log(`AUDIT v3 OK ✅ espejo=oráculo (${mirror.nLinks} eslabón/es, tirón ${mirror.froms}->${mirror.tos}, fuente vacía), anim flechas=${anim.arrows} anillos=${anim.rings}`);
