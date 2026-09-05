// audit v2.12.2 — espejo≡oráculo con autoServe ON y pedido servible NO VISIBLE.
// El espejo v2.12.1 itera run.orders (TODOS) en la fase auto-serve mientras el
// oráculo itera SOLO activeClients (R16.4) => phantom-serves de pedidos no
// visibles => snaps intermedios consumen pilas que el estado final conserva
// => "pilas desaparecen y vuelven". Este audit lo reproduce y fija el contrato.
import puppeteer from 'puppeteer-core';
import { pathToFileURL } from 'node:url';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fails = [];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 880 });
page.on('pageerror', e => fails.push('pageerror: ' + e.message));
await page.goto(pathToFileURL('dist/index.html').href, { waitUntil: 'networkidle0' });
await page.evaluate(() => localStorage.removeItem('ccSaveCozyV1'));
await page.reload({ waitUntil: 'networkidle0' });
if (await page.evaluate(() => !!document.querySelector('#btnOpen'))) { await page.click('#btnOpen'); await sleep(500); }
await sleep(300);

const res = await page.evaluate(() => {
  const s = window.__dbg.state;
  const B = s.run.board;
  // Mergeo pendiente para que exista encadenamiento: 18=[2,2] adyacente a 10=[2]
  B[18].stack = [2, 2];
  B[10].stack = [2];
  // Un pedido NO visible: activeClients son referencias al array orders; para
  // tener uno fuera del set visible, fabricamos uno extra flotante no visible.
  const hidden = { id: 'ord-ghost', color: 3, qty: 2, served: false, cell: null };
  s.run.orders.push(hidden);
  B[19].stack = [3, 3];
  // Un visible NO servible para que el auto-servir visible no ensucie el caso
  s.run.activeClients.forEach(o => { o.color = 8; o.qty = 4; });
  s.skills.serveManual.autoServe = true;
  const before = JSON.stringify({
    b18: B[18].stack, b10: B[10].stack, b19: B[19].stack,
    hidServed: hidden.served, hidId: hidden.id,
  });
  // ESPEJO: cascadeLinks sobre clon
  const links = window.__dbg.cascadeLinks(structuredClone(s));
  const mirrorLast = links.length ? links[links.length - 1].snap : s;
  // ORÁCULO: resolveCascade sobre otro clon
  const oracle = window.__dbg.resolveCascade(structuredClone(s)).state;
  const stacks = (st) => st.run.board.map(c => JSON.stringify(c.stack));
  const mirrorStacks = stacks(mirrorLast);
  const oracleStacks = stacks(oracle);
  const mirrorHiddenServed = mirrorLast.run.orders.find(o => o.id === hidden.id).served;
  const oracleHiddenServed = oracle.run.orders.find(o => o.id === hidden.id).served;
  return {
    before, links: links.length,
    mirrorStacks, oracleStacks,
    boardEqual: JSON.stringify(mirrorStacks) === JSON.stringify(oracleStacks),
    mirrorHiddenServed, oracleHiddenServed,
    mirrorCoins: mirrorLast.progress.coins, oracleCoins: oracle.progress.coins,
  };
});
console.log(JSON.stringify(res, null, 2));
if (res.error) { console.log('FALLO seed: ' + res.error); await browser.close(); process.exit(1); }
if (!res.boardEqual) fails.push(`ESPEJO≠ORÁCULO en boards finales (phantom-serve confirmado): mirror hidServed=${res.mirrorHiddenServed} oracle hidServed=${res.oracleHiddenServed}`);
if (res.mirrorHiddenServed !== res.oracleHiddenServed) fails.push('divergencia en served del pedido NO visible');
if (res.mirrorCoins !== res.oracleCoins) fails.push(`divergencia de coins: mirror=${res.mirrorCoins} oracle=${res.oracleCoins}`);
if (fails.length) { console.log('FALLOS:\n' + fails.join('\n')); await browser.close(); process.exit(1); }
console.log('AUDIT v2.12.2 ESPEJO≡ORÁCULO (autoServe ON + hidden servible) OK ✅');
await browser.close();
process.exit(0);
