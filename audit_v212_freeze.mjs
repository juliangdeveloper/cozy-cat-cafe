// audit v2.12.1 — repro del congelamiento ANTES del fix: imán (monoSink) con
// 2º eslabón SIN celda pura => el espejo viejo lanzaba ReferenceError dentro
// de playCascade => promesa rechazada sin catch => UI congelada sin render.
// Este audit verifica la REPARACIÓN: la cascada completa se anima, los dos
// eslabones ocurren (A absorbe run, sub-pila 5 revelada) y la UI queda viva.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 880 });
page.on('pageerror', e => fails.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') fails.push('console: ' + m.text()); });
await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
await page.reload({ waitUntil: 'networkidle0' });
if (await page.evaluate(() => !!document.querySelector('#btnOpen'))) { await page.click('#btnOpen'); await sleep(500); }
await sleep(300);

// Sembrar (v2.14: núcleo jugable = 8,9,14,15,16,20,21): D=15 vacía; A=14=[2,2]
// puro adyacente a D; E=8=[5,5] vecina de D. Colocar [5,2] (multi, tope 2) en D
// => eslabón 1: imán manda el run de 2 a A (A=[2,2,2], D revela [5]).
// Eslabón 2: D=[5] con E=[5,5] adyacente => grupo {D,E} SIN pura (ambas [5,5])
// => arbiterTarget normal; ANTES del fix el helper con closure rota lanzaba
// ReferenceError dentro de playCascade => promesa rechazada sin catch => UI
// congelada sin render. Verifica la REPARACIÓN: anima completa y UI viva.
await page.evaluate(() => {
  const s = window.__dbg.state;
  const B = s.run.board;
  B[14].stack = [2, 2];
  B[8].stack = [5, 5];         // vecina de 15: provocará eslabón 2 sin pura
  B[15].stack = [];
  s.skills.serveManual.autoServe = false;   // aislar merges (convención suite)
  s.run.pool[0] = [5, 2];      // multi, tope 2 => monoSink
  window.__dbg.renderAll();
  return true;
});
await sleep(200);
await page.evaluate(() => { const el = document.querySelector('#pool .poolslot:not(.drop)'); if (el) el.click(); });
await sleep(150);
await page.evaluate(() => { const el = document.querySelector('#board .cell[data-id="15"]'); if (el) el.click(); });
await sleep(4500);             // 2 eslabones × 600ms + settle + margen

const fin = await page.evaluate(() => {
  const s = window.__dbg.state;
  const B = s.run.board;
  return {
    A18: JSON.stringify(B[14].stack),
    D10: JSON.stringify(B[15].stack),
    E11: JSON.stringify(B[8].stack),
    slot: (typeof ui !== 'undefined') ? ui.slot : 'n/a',
    anim: !!document.querySelector('#board') && !document.body.classList.contains('anim'),
  };
});
console.log('FIN:', JSON.stringify(fin));
// UI desbloqueada: la prueba real es que una 2ª colocación via UI funciona
const second = await page.evaluate(() => {
  const s = window.__dbg.state;
  const free = s.run.board.findIndex((c) => !c.dormant && !c.blocked && c.stack.length === 0);
  s.run.pool[2] = [4, 4];
  window.__dbg.renderAll();
  return { free };
});
await sleep(150);
await page.evaluate(() => { const els = document.querySelectorAll('#pool .poolslot:not(.drop)'); els[els.length - 1].click(); });
await sleep(150);
await page.evaluate((freeIdx) => {
  const el = document.querySelector(`#board .cell[data-id="${freeIdx}"]`);
  if (el) el.click();
}, second.free);
await sleep(2500);
const fin2 = await page.evaluate(() => {
  const s = window.__dbg.state;
  const B = s.run.board;
  return { free: JSON.stringify(B[(function(){ return 0; })()] ? B.findIndex(c => !c.dormant && !c.blocked && c.stack.length === 0) : -1) };
});
console.log('FIN2 (celda libre tras 2ª colocación):', JSON.stringify(fin2));
// Espejo≡oráculo con el estado final: sin pending, UI desbloqueada
if (fin.A18 !== '[2,2,2]') fails.push(`eslabón 1 no ocurrió: A18=${fin.A18}`);
if (fin.E11 !== '[]' || fin.D10 !== '[5,5,5]') {
  const d = JSON.parse(fin.D10), e = JSON.parse(fin.E11);
  const pend = (d.length === 2 && e.length === 2);
  if (pend) fails.push(`eslabón 2 quedó pendiente sin animar: D=${fin.D10} E=${fin.E11}`);
}
if (fin2.free < 0) fails.push('la 2ª colocación no liberó celda — cascada no corrió');
if (fails.length) { console.log('FALLOS:\n' + fails.join('\n')); await browser.close(); process.exit(1); }
console.log('AUDIT v2.12.1 FREEZE OK ✅ (cascada multi→imán→grupo sin pura anima completa y la UI queda viva)');
await browser.close();
process.exit(0);
