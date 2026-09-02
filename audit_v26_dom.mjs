// audit_v26_dom.mjs — audit v2.6 (puppeteer-core, dist file://)
// R12.2: el SWAP debe disparar la cascada (merge pendiente se resuelve sin colocar).
// Escenario: X=[1,1] y Y=[1,1] NO adyacentes; Z=[2] adyacente a Y (no a X).
// UI real: botón Swap → tap X → tap Z (swap X<->Z). Post-swap Z=[1,1] queda
// junto a Y=[1,1] => el board final debe tener un stack de 4 (tope 1) y
// resolveCascade().steps===0 (sin merges pendientes). autoServe OFF para
// aislar el merge (convención de tests).
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 880 });
await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
await page.reload({ waitUntil: 'networkidle0' });
const hasMenu = await page.evaluate(() => !!document.querySelector('#btnOpen'));
if (hasMenu) { await page.click('#btnOpen'); await sleep(500); }
await sleep(300);

// --- sembrar estado: X, Y lejanas con [1,1]; Z=[2] adyacente SOLO a Y ---
const seed = await page.evaluate(() => {
  const B = window.__dbg.state.run.board;
  const play = (c) => c && !c.blocked && !c.dormant;
  const idx = (q, r) => B.findIndex((c) => play(c) && c.q === q && c.r === r);
  // núcleo 7: centro (0,0) toca TODO el núcleo => activar una baldosa extra
  // para tener Z adyacente a Y pero NO a X. Núcleo: N=(0,-1) idx?, NE=(1,-1),
  // NO=(-1,0), E=(1,0), SO=(0,1), S=(-1,1). Usar S=(-1,1)=Y, SO=(0,1)=Z,
  // NE=(1,-1)=X: NE y S NO comparten arista (dq=2). SO toca S y centro;
  // centro lo dejamos VACÍO para que el grupo post-swap sea SOLO {Y,Z}.
  const X = idx(1, -1), Y = idx(-1, 1), Z = idx(0, 1), CENTRO = idx(0, 0);
  if ([X, Y, Z, CENTRO].some((i) => i < 0)) return { error: 'coords' };
  B[X].stack = [1, 1];
  B[Y].stack = [1, 1];
  B[Z].stack = [2];
  B[CENTRO].stack = [];
  const s = window.__dbg.state;
  s.skills.serveManual.autoServe = false;          // aislar merge
  s.skills.swapPiles.owned = true; s.skills.swapPiles.uses = 3;
  const pend0 = window.__dbg.resolveCascade(structuredClone(s)).steps;
  return { X, Y, Z, pend0 };
});
if (seed.error) { console.log('FALLO seed:', JSON.stringify(seed)); process.exit(1); }
if (seed.pend0 !== 0) fails.push(`seed con merge pendiente (steps=${seed.pend0}) — escenario invalido`);

await page.reload({ waitUntil: 'networkidle0' });   // persist() guardó el seed
const hasMenu2 = await page.evaluate(() => !!document.querySelector('#btnOpen'));
if (hasMenu2) { await page.click('#btnOpen'); await sleep(500); }
const re = await page.evaluate(() => {
  const s = window.__dbg.state;
  return { pend: window.__dbg.resolveCascade(structuredClone(s)).steps,
           auto: s.skills.serveManual.autoServe, uses: s.skills.swapPiles.uses,
           X: s.run.board.findIndex((c) => c.q === 1 && c.r === -1 && !c.dormant),
           Z: s.run.board.findIndex((c) => c.q === 0 && c.r === 1 && !c.dormant) };
});
if (re.pend !== 0) fails.push(`tras reload steps=${re.pend}`);
if (re.auto !== false) fails.push('autoServe activo — escenario invalido');

// --- UI REAL: power Swap → tap X → tap Z ---
await page.click('.pow[data-mode=swap]');
await sleep(150);
await page.click(`#board .cell[data-id="${re.X}"]`);
await sleep(150);
await page.click(`#board .cell[data-id="${re.Z}"]`);

// --- poll: cascada animada (600ms/eslabón) hasta estabilizar ---
let fin = null;
for (let t = 0; t < 32; t++) {                      // ~8s
  await sleep(250);
  fin = await page.evaluate(() => {
    const s = window.__dbg.state;
    const pend = window.__dbg.resolveCascade(structuredClone(s)).steps;
    const four = s.run.board.some((c) => c.stack.length >= 3 && c.stack[c.stack.length - 1] === 1);
    const swapped = s.run.board.some((c) => c.q === 1 && c.r === -1 && c.stack.length === 1 && c.stack[0] === 2);
    return { pend, four, swapped, ver: (document.documentElement.innerHTML.match(/GAME_VERSION = '([^']+)'/) || [])[1] };
  });
  if (fin.pend === 0 && fin.four && fin.swapped) break;
}
if (!/^v2\.6/.test(fin.ver)) fails.push(`version ${fin.ver} (esperada v2.6.x)`);
if (!fin.swapped) fails.push('el swap no movio las pilas (X no quedo con [2])');
if (fin.pend !== 0) fails.push(`R12.2 VIOLADA: tras swap quedan merges pendientes (steps=${fin.pend})`);
if (!fin.four) fails.push('no hay stack fusionado de 4 fichas verdes tras el swap');

await page.screenshot({ path: 'audit-v26-swap.png' });
await browser.close();
if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
console.log('AUDIT v2.6 OK ✅ (swap dispara cascada R12.2: merge pendiente resuelto)');
