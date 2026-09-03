// audit_v263_dom.mjs — audit v2.8 (puppeteer-core, dist file://)
// (1) calamidad SIN marcador: 0 elementos .calmk y 0 celdas .calm aunque haya
//     calamity/calamityStack en el estado;
// (2) skill Unlock en powerbar (6 botones, 1 fila) y flujo UI completo:
//     Unlock → tap candado → 🔒 fuera, hiddenStack revelado, cascada corre
//     (merge con vecino mint), steps=0 pendientes;
// (3) versión v2.8.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844 });
await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
await page.reload({ waitUntil: 'networkidle0' });
if (await page.evaluate(() => !!document.querySelector('#btnOpen'))) { await page.click('#btnOpen'); await sleep(500); }
await sleep(300);

// sembrar: candado con pila oculta [1,1] + vecino [1]; pila de calamidad en
// el centro (calamityStack) para probar "sin rombo"; skill unlockLocks comprada
const seed = await page.evaluate(() => {
  const s = window.__dbg.state;
  const B = s.run.board;
  const at = (q, r) => B.findIndex((c) => c && c.q === q && c.r === r);
  const lk = at(1, -1), nb = at(1, 0), c19 = at(0, 0);
  if ([lk, nb, c19].some((i) => i < 0)) return { error: 'coords' };
  B[lk].blocked = true; B[lk].stack = []; B[lk].hiddenStack = [1, 1]; B[lk].calamity = true; B[lk].dormant = false;
  B[nb].stack = [1]; B[nb].dormant = false;
  B[c19].calamity = true; B[c19].calamityStack = true; B[c19].stack = [3, 3]; B[c19].dormant = false;
  s.skills.unlockLocks = { owned: true, uses: 2, usesBought: 2 };
  s.skills.serveManual.autoServe = false;
  window.__dbg.renderAll();
  return { lk, nb, c19 };
});
if (seed.error) { console.log('FALLO seed:', JSON.stringify(seed)); process.exit(1); }

const m0 = await page.evaluate(() => ({
  calmk: document.querySelectorAll('.calmk').length,
  calmCells: document.querySelectorAll('.cell.calm').length,
  powN: document.querySelectorAll('#powerbar .pow').length,
  powRows: [...new Set([...document.querySelectorAll('#powerbar .pow')].map(p => Math.round(p.getBoundingClientRect().top)))].length,
  powRight: Math.max(0, ...[...document.querySelectorAll('#powerbar .pow')].map(p => p.getBoundingClientRect().right)),
  unlockPow: !!document.querySelector('#powerbar .pow[data-mode=unlock]'),
  ver: (document.documentElement.innerHTML.match(/GAME_VERSION = '([^']+)'/) || [])[1],
}));
if (m0.calmk !== 0) fails.push(`quedan ${m0.calmk} rombos .calmk`);
if (m0.calmCells !== 0) fails.push(`quedan ${m0.calmCells} celdas .calm (anillo)`);
if (!m0.unlockPow) fails.push('powerbar sin boton Unlock');
if (m0.powRows !== 1) fails.push(`powerbar en ${m0.powRows} filas con ${m0.powN} skills`);
if (m0.powRight > 391) fails.push(`powerbar desborda (right=${Math.round(m0.powRight)})`);
if (!/^v2\.8/.test(m0.ver)) fails.push(`version ${m0.ver}`);

// UI real: Unlock → tap candado → cascada
await page.click('#powerbar .pow[data-mode=unlock]');
await sleep(150);
await page.click(`#board .cell[data-id="${seed.lk}"]`);
let fin = null;
for (let t = 0; t < 32; t++) {
  await sleep(250);
  fin = await page.evaluate(({ lk }) => {
    const s = window.__dbg.state;
    const c = s.run.board[lk];
    return {
      blocked: c.blocked, stack: c.stack, hidden: c.hiddenStack,
      pend: window.__dbg.resolveCascade(structuredClone(s)).steps,
      lockOvl: !!document.querySelector(`#board .cell[data-id="${lk}"] .lockovl`),
    };
  }, seed);
  if (!fin.blocked && fin.pend === 0) break;
}
if (fin.blocked) fails.push('el candado sigue bloqueado tras Unlock');
if (JSON.stringify(fin.stack) !== '[1,1,1]') fails.push(`pila no fusionada tras reveal: ${JSON.stringify(fin.stack)}`);
if (fin.hidden) fails.push('hiddenStack no consumido');
if (fin.lockOvl) fails.push('overlay 🔒 sigue en el DOM');
if (fin.pend !== 0) fails.push(`merges pendientes tras unlock: ${fin.pend}`);

await page.screenshot({ path: 'audit-v263-unlock.png' });
await browser.close();
if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
console.log('AUDIT v2.8 OK ✅ (sin rombos/anillos; Unlock UI -> reveal + cascada; powerbar 1 fila)');
