#!/usr/bin/env node
// ============================================================================
// build.js — Cozy Cat Café × HexaSort
// Genera un dist/index.html 100% autocontenido que se abre con doble clic bajo
// file:// (sin servidor): inlina la lógica pura de js/game.js (exports fuera),
// embebe assets/sprites.json como objeto JS y assets/sprites.png como data URI.
//
// R1  -> salida autocontenida: UN solo <script type="module"> inline, sin
//        import/fetch/<script src>/referencias a archivos.
// R2  -> los fuentes (index.html, js/game.js) SOLO se leen, jamás se modifican.
// R3  -> sprites embebidos (SPRITES_DATA + SPRITES_PNG) conservando el fallback
//        onerror -> placeholders de código (G7) exactamente igual que en dev.
// R5  -> fail-fast: verifica el dist generado y sale != 0 si aparece algo
//        prohibido.
//
// Determinista (sin timestamps ni Math.random) e idempotente.
// ============================================================================
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC_HTML = join(ROOT, 'index.html');
const SRC_GAME = join(ROOT, 'js', 'game.js');
const SRC_JSON = join(ROOT, 'assets', 'sprites.json');
const SRC_PNG = join(ROOT, 'assets', 'sprites.png');
const OUT_HTML = join(ROOT, 'dist', 'index.html');

// Cadenas prohibidas en el output COMPLETO (dist/index.html). Nota: la URI de
// datos y el base64 no contienen estos tokens (verificado en tiempo de build).
// El check de `import` se hace por FORMA sintáctica de ES module (regex), no por
// substring: el código real usa `importSave`/comentarios y el HTML tiene texto
// UI ("import your café"), que NUNCA deben ser falsos positivos.
const FORBIDDEN_FULL = [
  "from './",
  'from "./',
  'fetch(',
  '<script src',
  ".js'",
  '.js"',
  'http',
  'file:',
];
const ES_IMPORT_SHAPE = /import\s*\{|import\s*['"]|import\s*\*|import\s*\(|import\s+[A-Za-z_$][\w$]*\s+from\b/;

// Nombres de ámbito top-level de un bloque de código (para detectar colisiones
// al fusionar dos módulos en UN solo scope de módulo).
function topNames(code) {
  const names = new Set();
  const re = /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm;
  let m;
  while ((m = re.exec(code))) for (let g = 1; g <= 3; g++) if (m[g]) names.add(m[g]);
  return names;
}

const fail = (msg) => {
  console.error(`\n[build.js] ERROR (R5 fail-fast): ${msg}`);
  process.exit(1);
};

// ---------------------------------------------------------------------------
// 1) Leer fuentes (SÓLO lectura, R2).
// ---------------------------------------------------------------------------
const html = readFileSync(SRC_HTML, 'utf8');
const gameSrc = readFileSync(SRC_GAME, 'utf8');
const jsonRaw = readFileSync(SRC_JSON, 'utf8');
const pngB64 = readFileSync(SRC_PNG).toString('base64');

// ---------------------------------------------------------------------------
// 2) Extraer el UNICO <script type="module"> del HTML.
// ---------------------------------------------------------------------------
const OPEN_TAG = '<script type="module">';
const CLOSE_TAG = '</script>';
const i0 = html.indexOf(OPEN_TAG);
const i1 = html.indexOf(CLOSE_TAG, i0);
if (i0 < 0 || i1 < 0) fail('no se encontró el <script type="module"> en index.html');
if (html.indexOf('<script', i0 + 1) !== -1 && html.indexOf('<script', i0 + 1) < i1)
  fail('hay más de un <script> en index.html');
let app = html.slice(i0 + OPEN_TAG.length, i1);

// ---------------------------------------------------------------------------
// 3) Quitar el bloque `import {...} from './js/game.js'` de la app.
// ---------------------------------------------------------------------------
const importRe = /import\s*\{[\s\S]*?\}\s*from\s*['"]\.\/js\/game\.js['"];\s*/;
if (!importRe.test(app)) fail('no se encontró el bloque import de js/game.js');
app = app.replace(importRe, '');
if (/from\s*['"]\.\//.test(app)) fail('sigue habiendo un from relativo tras quitar el import');

// 4) Reemplazar el comentario de cabecera de la app (ahora es un bundle).
app = app.replace(
  /\/\/ ={10,}\n\/\/ Cozy Cat Café × HexaSort — APP \(DOM \+ browser lifecycle only\)\.\n[\s\S]*?\/\/ ={10,}\n/,
  [
    '// ===========================================================================\n',
    '// Cozy Cat Café × HexaSort — BUNDLE AUTOCONTENIDO (generado por build.js).\n',
    '// Inlina la lógica pura (js/game.js) y embebe cada sprite como datos.\n',
    '// Sin carga de módulos externa ni solicitudes de red: se abre por doble clic\n',
    '// protocolo local (doble clic). Se conserva el fallback G7 (placeholder) para arte faltante.\n',
    '// ===========================================================================\n',
  ].join('')
);

// ---------------------------------------------------------------------------
// 5) Inlinar js/game.js: quitar el prefijo `export ` de cada declaración.
//    (un módulo inline es su propio scope: no se necesitan exports ni globales)
// ---------------------------------------------------------------------------
let game = gameSrc
  .split('\n')
  .map((l) => (l.startsWith('export ') ? l.slice('export '.length) : l))
  .join('\n');
if (/^export\s/m.test(game)) fail('quedó un export sin quitar tras el strip');

// 6) Resolver colisiones de nombres top-level entre game.js y la app (p. ej.
//    freeSlots). Se renombra el lado de game.js (la app usa los suyos); los
//    símbolos de game.js se referencian desde dentro de game.js, así que un
//    rename con límites de palabra en TODO su texto es seguro y determinista.
const appNames = topNames(app);
const gameNames = topNames(game);
const collisions = [...gameNames].filter((n) => appNames.has(n));
for (const name of collisions) {
  const safe = `__ccc_${name}`;
  game = game.replace(new RegExp(`\\b${name}\\b`, 'g'), safe);
  console.log(`[build.js] colisión resuelta: ${name} -> ${safe} (lado game.js)`);
}

// ---------------------------------------------------------------------------
// 7) Datos de sprites embebidos (R3): JSON inline + PNG como data URI.
// ---------------------------------------------------------------------------
const spritesData = JSON.stringify(JSON.parse(jsonRaw));
const SPRITES_DATA_DECL = `const SPRITES_DATA = ${spritesData};\n`;
const SPRITES_PNG_DECL = `const SPRITES_PNG = 'data:image/png;base64,${pngB64}';\n`;

// 8) Sustituir loadSprites() por la versión embebida, conservando EXACTAMENTE
//    la lógica de fallback (onerror -> SPR.img queda null -> placeholders G7).
const loadRe = /async function loadSprites\(\)\{[\s\S]*?\n\}/;
if (!loadRe.test(app)) fail('no se encontró la función loadSprites() original');
const newLoad =
  SPRITES_DATA_DECL +
  SPRITES_PNG_DECL +
  `async function loadSprites(){
  try{
    const j = SPRITES_DATA;
    (j.sprites||[]).forEach(s=>SPR.byId[s.id]=s);
    SPR.w = j.sheetWidth||640; SPR.h = j.sheetHeight||512;
  }catch(e){ SPR.byId={}; }
  await new Promise(ok=>{ const im=new Image();
    im.onload=()=>{SPR.img=im; ok()}; im.onerror=()=>ok(); im.src=SPRITES_PNG; });
}`;
app = app.replace(loadRe, () => newLoad);

// ---------------------------------------------------------------------------
// 9) Ensamblar y escribir dist/index.html.
// ---------------------------------------------------------------------------
const bundle = `${game}\n\n// ---- APP (DOM + browser lifecycle) -------------------------------\n${app}\n`;
const outHtml = `${html.slice(0, i0 + OPEN_TAG.length)}\n${bundle}${html.slice(i1)}`;

mkdirSync(join(ROOT, 'dist'), { recursive: true });
writeFileSync(OUT_HTML, outHtml, 'utf8');

// ---------------------------------------------------------------------------
// 10) R5 fail-fast: verificación programática del output.
// ---------------------------------------------------------------------------
const problems = [];
for (const token of FORBIDDEN_FULL) {
  if (outHtml.includes(token)) problems.push(`token prohibido presente: ${JSON.stringify(token)}`);
}
if (ES_IMPORT_SHAPE.test(outHtml)) problems.push('shape de import ES module encontrado en el output');
if (/\bexport\s+(const|let|function|class)/.test(bundle))
  problems.push('quedó una declaración export en el bundle');
if (!bundle.includes('data:image/png;base64,'))
  problems.push('el script module inline NO contiene data:image/png;base64');
if (!bundle.includes('const SPRITES_DATA')) problems.push('falta const SPRITES_DATA en el bundle');
if (!bundle.includes('cozy-cat-cafe.save.v1')) problems.push('falta la clave de localStorage cozy-cat-cafe.save.v1');

if (problems.length) fail(problems.join('\n       - '));

// ---------------------------------------------------------------------------
// 11) Chequeo de sintaxis del script inline (extraído a un .mjs temporal).
// ---------------------------------------------------------------------------
const chk = join(os.tmpdir(), `ccc-bundle-check-${process.pid}.mjs`);
writeFileSync(chk, bundle, 'utf8');
try {
  execFileSync(process.execPath, ['--check', chk], { stdio: 'pipe' });
} catch (e) {
  unlinkSync(chk);
  fail(`el bundle tiene un error de sintaxis:\n${e.stderr || e.message}`);
}
unlinkSync(chk);

// ---------------------------------------------------------------------------
// 12) Reporte de éxito.
// ---------------------------------------------------------------------------
const bytes = Buffer.byteLength(outHtml, 'utf8');
console.log(`[build.js] OK → dist/index.html (${bytes.toLocaleString('en-US')} bytes)`);
console.log(`[build.js] OK → checks R5 superados (sin import/fetch/script-src/http/file:)`);
console.log(`[build.js] OK → ${collisions.length} colisión(es) de nombres resuelta(s), sintaxis válida`);
