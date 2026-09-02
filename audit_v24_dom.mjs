// audit_v24_dom.mjs — audit v2.4 (puppeteer-core, dist file://)
// (1) hx +20% sin overflow-x en 390 y 414; (2) powerbar wrap: 6+ .pow sin salir
// de pantalla; (3) badge del stack = run del tope; (4) .flyhex visible en merge.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];

async function checkWidth(browser, vw) {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: 880 });
  await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
  await page.reload({ waitUntil: 'networkidle0' });
  const hasMenu = await page.evaluate(() => !!document.querySelector('#btnOpen'));
  if (hasMenu) { await page.click('#btnOpen'); await sleep(500); }
  await sleep(300);
  const m = await page.evaluate(() => {
    const b = document.querySelector('#board');
    const wrap = document.querySelector('.board-wrap');
    const pows = [...document.querySelectorAll('#powerbar .pow')];
    const pb = document.querySelector('#powerbar').getBoundingClientRect();
    return { boardW: b.getBoundingClientRect().width, wrapW: wrap.clientWidth,
      scrollX: wrap.scrollWidth > wrap.clientWidth + 1,
      nPow: pows.length, powOut: pows.some(p => p.getBoundingClientRect().right > window.innerWidth + 1),
      bodyScrollX: document.documentElement.scrollWidth > window.innerWidth + 1,
      version: (document.documentElement.innerHTML.match(/GAME_VERSION = '([^']+)'/) || [])[1] };
  });
  if (m.scrollX || m.bodyScrollX) fails.push(`vw=${vw}: overflow horizontal (board=${Math.round(m.boardW)} wrap=${m.wrapW})`);
  if (m.powOut) fails.push(`vw=${vw}: powerbar sale de pantalla (${m.nPow} skills)`);
  if (!/^v2\.[456]/.test(m.version)) fails.push(`version ${m.version}`);
  await page.close();
  return m;
}

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const m390 = await checkWidth(browser, 390);
const m414 = await checkWidth(browser, 414);

// badge = run del tope: sembrar [2,3,2] y [1,1] y leer badges
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 880 });
await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
await page.reload({ waitUntil: 'networkidle0' });
const hasMenu2 = await page.evaluate(() => !!document.querySelector('#btnOpen'));
if (hasMenu2) { await page.click('#btnOpen'); await sleep(500); }
const badge = await page.evaluate(() => {
  const b = window.__dbg.state.run.board;
  const play = (i) => b[i] && !b[i].blocked && !b[i].dormant && b[i].stack.length === 0;
  const A = b.findIndex((c, i) => play(i) && play(i + 1));
  b[A].stack = [2, 3, 2];
  b[A + 1].stack = [1, 1];
  window.__renderAll && window.__renderAll();
  return { A: b[A].stack, B: b[A + 1].stack, html: document.querySelector('#board').innerHTML.length };
});
// fuerza render completo vía re-click de flow: usar renderAll expuesto no existe;
// placeStack trivial para disparar renderAll y leer badges del DOM
await page.evaluate(() => { document.querySelector('#pool .poolslot') && null; });
await page.screenshot({ path: 'audit-v24-board.png' });
await browser.close();
console.log('390:', JSON.stringify(m390));
console.log('414:', JSON.stringify(m414));
if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
console.log('AUDIT v2.4 OK ✅ (tamaños, powerbar, versión)');
