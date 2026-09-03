// audit_v262_dom.mjs — audit v2.7 UI compacta (puppeteer-core, dist file://)
// Pedido de Julián: (1) #hint eliminado (ni elemento ni mensajes en esa zona);
// (2) powerbar SIEMPRE en UNA fila (sin wrap, sin salir de pantalla);
// (3) topbar en UNA fila a 390/414 (chips+botones compactos);
// (4) pool -20% (tray/ttile ~37px) y clientes más pequeños (cat 34px, card ~110);
// (5) sin overflow horizontal del body.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
for (const vw of [390, 414]) {
  const page = await browser.newPage();
  await page.setViewport({ width: vw, height: 844 });
  await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
  await page.reload({ waitUntil: 'networkidle0' });
  if (await page.evaluate(() => !!document.querySelector('#btnOpen'))) { await page.click('#btnOpen'); await sleep(500); }
  await sleep(300);
  const m = await page.evaluate(() => {
    const pows = [...document.querySelectorAll('#powerbar .pow')];
    const tops = [...new Set(pows.map(p => Math.round(p.getBoundingClientRect().top)))];
    const tb = document.querySelector('.topbar');
    const tt = [...tb.children].filter(c => c.getBoundingClientRect().height > 10).map(c => Math.round(c.getBoundingClientRect().top));
    const tMid = (Math.min(...tt) + Math.max(...tt)) / 2;
    const ttile = document.querySelector('.ttile');
    const card = document.querySelector('.order-card');
    const cat = document.querySelector('.order-card .o,.order-card .catimg');
    return {
      hint: !!document.querySelector('#hint'),
      powN: pows.length, powRows: tops.length,
      powRight: Math.max(0, ...pows.map(p => p.getBoundingClientRect().right)),
      topbarSpread: Math.max(...tt) - Math.min(...tt), topbarH: Math.round(tb.getBoundingClientRect().height),
      ttileW: ttile ? Math.round(ttile.getBoundingClientRect().width) : 0,
      cardW: card ? Math.round(card.getBoundingClientRect().width) : 0,
      catW: cat ? Math.round(cat.getBoundingClientRect().width) : 0,
      bodyScrollX: document.documentElement.scrollWidth > innerWidth + 1,
      ver: (document.documentElement.innerHTML.match(/GAME_VERSION = '([^']+)'/) || [])[1],
    };
  });
  if (m.hint) fails.push(`vw=${vw}: #hint sigue en el DOM`);
  if (m.powRows !== 1) fails.push(`vw=${vw}: powerbar en ${m.powRows} filas (${m.powN} skills)`);
  if (m.topbarSpread > 8 || m.topbarH > 46) fails.push(`vw=${vw}: topbar no compacta (spread=${m.topbarSpread} h=${m.topbarH})`);
  if (m.bodyScrollX) fails.push(`vw=${vw}: overflow horizontal del body`);
  if (vw === 390) {
    if (m.powRight > 391) fails.push(`vw=390: powerbar desborda (right=${Math.round(m.powRight)})`);
    if (!(m.ttileW >= 33 && m.ttileW <= 41)) fails.push(`vw=390: ttile ${m.ttileW}px (esperado ~37)`);
    if (!(m.cardW >= 100 && m.cardW <= 118)) fails.push(`vw=390: order-card ${m.cardW}px (esperado ~110-117)`);
    if (!(m.catW >= 30 && m.catW <= 38)) fails.push(`vw=390: cat ${m.catW}px (esperado 34)`);
  }
  if (!/^v2\.[6-9]/.test(m.ver)) fails.push(`version ${m.ver} (esperada v2.6+)`);
  await page.screenshot({ path: `audit-v262-${vw}.png` });
  await page.close();
}
await browser.close();
if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
console.log('AUDIT v2.7 UI COMPACTA OK ✅ (sin hint; powerbar+topbar 1 fila; pool/cards reducidos)');
