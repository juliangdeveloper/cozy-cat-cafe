// audit_v261_dom.mjs — audit v2.6.1 (puppeteer-core, dist file://)
// BUG: TILE_CSS/colorName solo mapeaban colores 1..6 — el color 7..10 comprado
// en la tienda caía al fallback --tile-mint => fichas de IDs DISTINTOS se
// dibujaban IDÉNTICAS (save real de Julián: c11=[4,1] junto a c19=[...,7]).
// (1) tokens --tile-{denim,teal,pine,orchid} definidos en :root;
// (2) tile superior de [7] usa token DISTINTO al de [1] (mecanismo del bug);
// (3) pedido de color 8/9/10 renderiza su minitile con token propio (no mint).
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

// (1) tokens en :root
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  return ['denim', 'teal', 'pine', 'orchid'].map((k) => cs.getPropertyValue('--tile-' + k).trim());
});
tokens.forEach((v, i) => { if (!/^#[0-9a-f]{6}$/i.test(v)) fails.push(`token --tile-${['denim','teal','pine','orchid'][i]} vacio/invalido ("${v}")`); });

// (2) sembrar el tablero del save real de Julián: c11=[4,1] (mint) junto a c19=[...,7]
const seeded = await page.evaluate(() => {
  const s = window.__dbg.state;
  const B = s.run.board;
  const at = (q, r) => B.findIndex((c) => c && c.q === q && c.r === r && !c.dormant);
  const c10 = at(0, -1), c11 = at(1, -1), c19 = at(0, 0);
  if ([c10, c11, c19].some((i) => i < 0)) return { error: 'coords' };
  B[c10].stack = [2];
  B[c11].stack = [4, 1];              // mint REAL
  B[c19].stack = [5, 1, 4, 1, 4, 7];  // tope color 7 (se veia mint — el bug)
  // (3) clientes con colores 8/9/10: sus minitiles NO deben caer a mint
  s.run.orders.forEach((o, i) => { o.color = 8 + i; });
  if (Array.isArray(s.run.activeClients)) s.run.activeClients.forEach((o, i) => { o.color = 8 + i; });
  s.skills.serveManual.autoServe = false;
  window.__dbg.renderAll();
  return { c11, c19 };
});
if (seeded.error) { console.log('FALLO seed:', JSON.stringify(seeded)); process.exit(1); }

const tcs = await page.evaluate(({ c11, c19 }) => {
  const topTile = (i) => document.querySelector(`#board .cell[data-id="${i}"] .tile:last-of-type`);
  return { a: topTile(c11)?.style.getPropertyValue('--tc'), b: topTile(c19)?.style.getPropertyValue('--tc') };
}, seeded);
if (!tcs.a || !tcs.b) fails.push('no se hallaron tiles en c11/c19');
else if (tcs.a === tcs.b) fails.push(`color 1 y color 7 renderizan el MISMO token (${tcs.a}) — bug original vivo`);

const mcs = await page.evaluate(() =>
  [...document.querySelectorAll('#orders .order-card .minitile')].map((e) => e.style.getPropertyValue('--mc')));
if (mcs.length < 3) fails.push(`esperados >=3 order-cards, hay ${mcs.length}`);
const uniq = [...new Set(mcs)];
if (uniq.includes('var(--tile-mint)')) fails.push(`pedido 8/9/10 cae a fallback mint (${mcs.join(',')})`);
if (uniq.length < 3) fails.push(`colores 8/9/10 no producen 3 tokens distintos: ${mcs.join(',')}`);

await page.screenshot({ path: 'audit-v261-palette.png' });
await browser.close();
if (fails.length) { console.log('FALLOS:'); fails.forEach(f => console.log(' -', f)); process.exit(1); }
console.log('AUDIT v2.6.1 OK ✅ (tokens 7..10; color 7 ≠ color 1; pedidos 8/9/10 sin fallback)');
