// FINAL AUDIT — v1.8 (5 fixes) — deterministic DOM/geometry + screenshots
// Runs against dist/index.html with the victory seed. No vision needed.
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = 'file:///C:/Users/Rog/Workspace/01_PROYECTOS/cozy-cat-cafe/dist/index.html';
const KEY = 'cozy-cat-cafe.save.v1';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
setTimeout(() => { console.log('WATCHDOG timeout'); process.exit(2); }, 240000);

const future = Date.now() + 120000;
const seedObj = JSON.parse(readFileSync('audit_seed_victory.json', 'utf8'));
seedObj.meta = seedObj.meta || {};
seedObj.meta.lastSeenAt = future; seedObj.meta.lastSavedAt = future; seedObj.meta.createdAt = future;
// 4 distinct piles on the non-dormant cells (verified by legibility run)
const want = { c11: [1, 1, 1], c12: [2, 2, 2], c19: [4, 4, 4], c20: [5, 5, 5] };
for (const cell of seedObj.run.board) {
  if (want[cell.id] && !cell.dormant && !cell.blocked) cell.stack = want[cell.id];
}
// power states for the badge audit: Destroy locked, Swap owned (2 uses), Refresh depleted, Activate price
seedObj.skills.destroyPile = { owned: false, uses: 0, price: 250, unlockLevel: 5 };
seedObj.skills.swapPiles = { owned: true, uses: 2, price: 120, unlockLevel: 3 };
seedObj.skills.refreshPool = { owned: true, uses: 0, price: 40, unlockLevel: 1 };
seedObj.skills.serveManual = { owned: true, autoServe: false };
const seed = JSON.stringify(seedObj);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✔ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  ✘ FAIL ${name}${extra ? ' — ' + extra : ''}`); }
};
const seedPage = async (page, vp) => {
  await page.setViewport(vp);
  await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, KEY, seed);
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__dbg && window.__dbg.state && document.querySelector('#app .scene.active #board'), { timeout: 15000 });
  await sleep(700);
};

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--window-size=390,844'],
  defaultViewport: { width: 390, height: 844 },
});

// ============================================================================
// 1) MOBILE 390x844 — run initial (fix 0a board grown + fix 0b hint position)
// ============================================================================
console.log('\n[1] MOBILE 390 — run initial');
const p1 = await browser.newPage();
await seedPage(p1, { width: 390, height: 844 });
const m1 = await p1.evaluate(() => {
  const cs = (el) => getComputedStyle(el);
  const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
  const topbar = document.querySelector('.topbar');
  const queuebar = document.querySelector('.queuebar');
  const wrap = document.querySelector('.board-wrap');
  const board = document.querySelector('#board');
  const hint = document.querySelector('.hint');
  const scene = document.querySelector('.scene.active');
  const hx = cs(document.documentElement).getPropertyValue('--hx').trim();
  return {
    hx,
    scenePos: cs(scene).position,
    topbar: r(topbar), queuebar: r(queuebar), wrap: r(wrap), board: r(board),
    hint: { ...r(hint), position: cs(hint).position, pointer: cs(hint).pointerEvents,
      offsetParent: hint.offsetParent ? hint.offsetParent.className : null,
      text: hint.textContent.trim().slice(0, 50) },
    boardHasCells: document.querySelectorAll('#board .cell').length,
  };
});
// fix 0a: board grown at 390 -> hx 13, board width ~357.5
ok('hx ladder: 390px -> --hx 13px (no 479 clamp)', m1.hx === '13px', `got ${m1.hx}`);
ok('board grew (width >= 350 at 390)', m1.board.w >= 350, `w=${m1.board.w}`);
ok('board has 32 cells', m1.boardHasCells === 32, `cells=${m1.boardHasCells}`);
// fix 0b: hint floats OVER the board, anchored to board-wrap, no row, not over topbar, click-through
ok('hint absolute (mobile 560 media)', m1.hint.position === 'absolute', m1.hint.position);
ok('hint anchored to board-wrap (offsetParent)', String(m1.hint.offsetParent).includes('board-wrap'), m1.hint.offsetParent);
ok('hint NOT over the topbar (bug fixed)', m1.hint.top > m1.topbar.bottom, `hint.top=${m1.hint.top} topbar.bottom=${m1.topbar.bottom}`);
ok('hint floats over the board (overlaps board band)', m1.hint.top < m1.board.bottom && m1.hint.bottom > m1.board.top, `hint ${m1.hint.top}-${m1.hint.bottom} vs board ${m1.board.top}-${m1.board.bottom}`);
ok('hint pushed inside wrap (top >= wrap top + 4)', m1.hint.top >= m1.wrap.top + 4, `hint.top=${m1.hint.top} wrap.top=${m1.wrap.top}`);
ok('NO hint row in flow: board-wrap starts right after queuebar', m1.wrap.top <= m1.queuebar.bottom + 2, `wrap.top=${m1.wrap.top} queuebar.bottom=${m1.queuebar.bottom}`);
ok('minimal dead space: wrap bottom hugs board bottom (<= 12px slack)', m1.wrap.bottom - m1.board.bottom <= 12, `slack=${m1.wrap.bottom - m1.board.bottom}`);
ok('hint pointer-events none (clicks pass to board)', m1.hint.pointer === 'none', m1.hint.pointer);
ok('scene no longer position:relative (desktop flow restored)', m1.scenePos === 'static', m1.scenePos);
await p1.screenshot({ path: 'screenshots/final_01_mobile_run.png' });
console.log('  SHOT screenshots/final_01_mobile_run.png');

// ============================================================================
// 2) MOBILE 390 — select a client (order-card) -> top color stripe visible
// ============================================================================
console.log('\n[2] MOBILE 390 — select client');
await p1.click('#orders .order-card');
await sleep(350);
const m2 = await p1.evaluate(() => {
  const cs = (el) => getComputedStyle(el);
  const sel = document.querySelector('#orders .order-card.selected');
  const hint = document.querySelector('.hint');
  const o = window.__dbg.state.run.activeClients[0];
  const tileVar = { 1: '--tile-mint', 2: '--tile-blue', 3: '--tile-pink', 4: '--tile-blush', 5: '--tile-lavender', 6: '--tile-cream' }[o.color] || '--tile-mint';
  const wantColor = cs(document.documentElement).getPropertyValue(tileVar).trim();
  return {
    hasSel: !!sel, seltag: !!document.querySelector('.seltag'),
    stripeW: sel ? cs(sel).borderTopWidth : null,
    stripeColor: sel ? cs(sel).borderTopColor : null,
    wantColor: (cs(document.documentElement).getPropertyValue(tileVar).trim() || ''),
    hintText: hint.textContent.trim().slice(0, 60),
    orderName: sel ? (sel.querySelector('.oname')?.textContent || '').trim() : null,
    nCards: document.querySelectorAll('#orders .order-card').length,
  };
});
const hexToRgb = (hex) => { const h = hex.replace('#', ''); return `rgb(${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)})`; };
ok('order-card got .selected after click', m2.hasSel);
ok('seltag ▼ marker rendered', m2.seltag);
ok('top stripe present: border-top 6px', m2.stripeW === '6px', m2.stripeW);
const stripeExpected = hexToRgb(m2.wantColor);
ok('stripe color matches requested tile color', m2.stripeColor === stripeExpected, `${m2.stripeColor} vs ${stripeExpected}`);
ok('hint JS write still reaches hint inside board-wrap', /Client selected/.test(m2.hintText), m2.hintText);
await p1.screenshot({ path: 'screenshots/final_02_mobile_order_selected.png' });
console.log('  SHOT screenshots/final_02_mobile_order_selected.png');

// ============================================================================
// 3) POWERBAR — mobile 390 + desktop 1280 badge states
// ============================================================================
console.log('\n[3] POWERBAR states — mobile 390');
const m3 = await p1.evaluate(() => {
  const g = (mode) => {
    const el = document.querySelector(`#powerbar .pow[data-mode="${mode}"]`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const badge = el.querySelector('.uses');
    return {
      cls: el.className, badge: badge ? badge.textContent.trim() : null,
      badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
      opacity: cs.opacity, cursor: cs.cursor,
    };
  };
  return { destroy: g('destroy'), swap: g('swap'), refresh: g('refresh'), activate: g('activate') };
});
ok('[m] Destroy locked + price badge 🪙250', m3.destroy && /locked/.test(m3.destroy.cls) && m3.destroy.badge === '🪙250', JSON.stringify(m3.destroy));
ok('[m] Swap owned + uses badge "2"', m3.swap && !/locked/.test(m3.swap.cls) && !/depleted/.test(m3.swap.cls) && m3.swap.badge === '2', JSON.stringify(m3.swap));
ok('[m] Refresh owned depleted + gray lock badge', m3.refresh && /depleted/.test(m3.refresh.cls) && m3.refresh.badge === '0' && m3.refresh.cursor === 'not-allowed', JSON.stringify(m3.refresh));
ok('[m] Activate badge = 🪙price', m3.activate && /^🪙\d+$/.test(m3.activate.badge) && !/locked/.test(m3.activate.cls), JSON.stringify(m3.activate));
const p3 = await p1.$('#powerbar');
await p3.screenshot({ path: 'screenshots/final_03_mobile_powerbar.png' });
console.log('  SHOT screenshots/final_03_mobile_powerbar.png');

console.log('\n[3b] POWERBAR states — desktop 1280');
const p2 = await browser.newPage();
await seedPage(p2, { width: 1280, height: 800 });
const mb = await p2.evaluate(() => {
  const g = (mode) => {
    const el = document.querySelector(`#powerbar .pow[data-mode="${mode}"]`);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const badge = el.querySelector('.uses');
    return { cls: el.className, badge: badge ? badge.textContent.trim() : null, opacity: cs.opacity, cursor: cs.cursor };
  };
  return { destroy: g('destroy'), swap: g('swap'), refresh: g('refresh'), activate: g('activate') };
});
ok('[d] Destroy locked + price badge 🪙250', mb.destroy && /locked/.test(mb.destroy.cls) && mb.destroy.badge === '🪙250', JSON.stringify(mb.destroy));
ok('[d] Swap owned + uses badge "2"', mb.swap && !/locked/.test(mb.swap.cls) && mb.swap.badge === '2', JSON.stringify(mb.swap));
ok('[d] Refresh depleted + lock', mb.refresh && /depleted/.test(mb.refresh.cls) && mb.refresh.badge === '0', JSON.stringify(mb.refresh));
ok('[d] Activate badge = 🪙price', mb.activate && /^🪙\d+$/.test(mb.activate.badge) && !/locked/.test(mb.activate.cls), JSON.stringify(mb.activate));
const p4 = await p2.$('#powerbar');
await p4.screenshot({ path: 'screenshots/final_04_desktop_powerbar.png' });
console.log('  SHOT screenshots/final_04_desktop_powerbar.png');

// ============================================================================
// 4) DESKTOP 1280 — Shop + Skills modals (English copy)
// ============================================================================
console.log('\n[4] DESKTOP 1280 — modals');
await p2.click('#btnShop');
await sleep(300);
const shopTxt = await p2.evaluate(() => {
  const m = document.querySelector('#shopModal.show');
  if (!m) return null;
  const t = m.textContent.replace(/\s+/g, ' ');
  return { title: m.querySelector('h3')?.textContent.trim(), text: t.slice(0, 400), spanish: /[áíóúñÁÍÓÚÑ¿¡]/.test(t) };
});
ok('Shop modal opens', !!shopTxt);
ok('Shop modal has English heading "Café Shop"', shopTxt && shopTxt.title === '🛒 Café Shop', shopTxt && shopTxt.title);
ok('Shop modal: no Spanish copy (é only in "Café" brand)', shopTxt && !shopTxt.spanish);
ok('Shop modal English copy present', shopTxt && /Buy|Expand|Upgrade|color/i.test(shopTxt.text), shopTxt && shopTxt.text.slice(0, 120));
const shopEl = await p2.$('#shopModal .modal');
await shopEl.screenshot({ path: 'screenshots/final_05_desktop_shop_modal.png' });
console.log('  SHOT screenshots/final_05_desktop_shop_modal.png');

await p2.click('#shopModal .x');
await sleep(250);
await p2.click('#btnSkills');
await sleep(300);
const skillTxt = await p2.evaluate(() => {
  const m = document.querySelector('#skillsModal.show');
  if (!m) return null;
  const t = m.textContent.replace(/\s+/g, ' ');
  return { title: m.querySelector('h3')?.textContent.trim(), text: t.slice(0, 400), spanish: /[áíóúñÁÍÓÚÑ¿¡]/.test(t) };
});
ok('Skills modal opens', !!skillTxt);
ok('Skills modal has English heading "Café Skills"', skillTxt && skillTxt.title === '🌿 Café Skills', skillTxt && skillTxt.title);
ok('Skills modal: no Spanish copy (é only in "Café" brand)', skillTxt && !skillTxt.spanish);
ok('Skills modal English copy present', skillTxt && /reach a node's level|Level grows/.test(skillTxt.text), skillTxt && skillTxt.text.slice(0, 120));
const skEl = await p2.$('#skillsModal .modal');
await skEl.screenshot({ path: 'screenshots/final_06_desktop_skills_modal.png' });
console.log('  SHOT screenshots/final_06_desktop_skills_modal.png');
await p2.click('#skillsModal .x');
await sleep(250);

// ============================================================================
// 5) HEXAGONS — 3x zoom of the piles (6 edges, distinguishable colors)
// ============================================================================
console.log('\n[5] HEX 3x zoom — piles');
const hex = await p2.evaluate(() => {
  const cells = [...document.querySelectorAll('#board .cell')].filter(c => c.querySelectorAll('.tile').length > 0);
  const piles = cells.map(c => {
    const tiles = [...c.querySelectorAll('.tile')];
    return { id: c.dataset?.id, n: tiles.length, tc: tiles.map(t => t.style.getPropertyValue('--tc')) };
  });
  const hexClip = getComputedStyle(document.querySelector('.tile')).clipPath;
  const hexVerts = hexClip.split('(')[1].split(')')[0].split(',').length;
  const bb = cells.reduce((a, c) => {
    const b = c.getBoundingClientRect();
    a.x0 = Math.min(a.x0, b.left); a.y0 = Math.min(a.y0, b.top);
    a.x1 = Math.max(a.x1, b.right); a.y1 = Math.max(a.y1, b.bottom);
    return a;
  }, { x0: 1e9, y0: 1e9, x1: 0, y1: 0 });
  return { piles, hexClip, hexVerts, bb };
});
ok('hex tile clip-path = 6-vertex polygon (6 edges)', hex.hexVerts === 6, `vertices=${hex.hexVerts} clip=${hex.hexClip.slice(0, 60)}`);
const colors = new Set(hex.piles.flatMap(p => p.tc));
ok('4 piles on board', hex.piles.length === 4, `piles=${hex.piles.length}`);
ok('pile colors distinguishable (4 distinct --tc)', colors.size === 4, `colors=${[...colors].join(',')}`);
ok('every pile >1 tile (a real stack)', hex.piles.every(p => p.n >= 2), hex.piles.map(p => `${p.id}:${p.n}`).join(' '));
// 3x zoom screenshot of the piles region (deviceScaleFactor 3)
await p2.setViewport({ width: 1280, height: 800, deviceScaleFactor: 3 });
await sleep(300);
const bb = await p2.evaluate(() => {
  const cells = [...document.querySelectorAll('#board .cell')].filter(c => c.querySelectorAll('.tile').length > 0);
  const bb = cells.reduce((a, c) => {
    const b = c.getBoundingClientRect();
    a.x0 = Math.min(a.x0, b.left); a.y0 = Math.min(a.y0, b.top);
    a.x1 = Math.max(a.x1, b.right); a.y1 = Math.max(a.y1, b.bottom);
    return a;
  }, { x0: 1e9, y0: 1e9, x1: 0, y1: 0 });
  return { x: bb.x0 - 40, y: bb.y0 - 40, width: bb.x1 - bb.x0 + 80, height: bb.y1 - bb.y0 + 80 };
});
await p2.screenshot({ path: 'screenshots/final_07_hex_zoom.png', clip: { x: bb.x, y: bb.y, width: bb.width, height: bb.height, scale: 1 } });
console.log('  SHOT screenshots/final_07_hex_zoom.png', JSON.stringify(bb));

await browser.close();
console.log(`\n==== FINAL AUDIT: ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);