# ASSET MANIFEST — Cozy Cat Café × HexaSort

**Objetivo:** lista de compra exacta para el artista. Cada sprite que el **código** (`index.html` + `js/game.js`) referencia, con su estado:

- **✅ existente** → ya dibujado en `assets/sprites.png` + `assets/sprites.json`.
- **🔶 placeholder [pl]** → NO está en el sprite map; el juego lo genera *por código* (celda de color sólido fiel a STYLE_GUIDE + sigla del id) para que el juego sea **100 % jugable sin arte** (G7 / US-42 / US-43).

La hoja `sprites.png` sigue alimentando el café de fondo (worker, máquinas, muebles). **Clientes, gato anfitrión y poderes** salen de `assets/pixel/` (pixel art, § abajo). El renderer elige la criatura con `runFaceColor()` → `colorIndex` del manifest.

---

## Hoja actual
| Campo | Valor |
|---|---|
| Archivo | `assets/sprites.png` (640×512 px · celda 128×128 · grid 5×4) |
| Mapa | `assets/sprites.json` (17 sprites registrados) |
| Generador programático | `assets/gen_sprites.py` (regenera ambos; base de arte replicable) |

---

## Sprites REQUERIDOS por el código (referenciados en `index.html`)

> Columna «Usado en» = punto del código. Los hexágonos de los pedidos **NO** son sprites del sheet: son **CSS `clip-path`** de los tokens `--tile-*` (STYLE_GUIDE §5), mapeados desde índices 1..6; no requieren arte externo.

| # | id | qué es | Usado en | Estado |
|---|----|--------|----------|--------|
| 1 | `cat_worker` | Gato barista (worker) | menú + `renderIdle` (reflejo worker, US-36) | ✅ existente |
| 2 | `cat_client_*` | Clientes genéricos del sheet | solo si falta el pixel | respaldo |
| 3 | `assets/pixel/customers/*` | Criatura del pedido (idle) | tarjeta de pedido, por `colorIndex` | ✅ pixel |
| 4 | `machine_coffee` | Máquina de espresso | menú + `renderIdle` (máquinas, US-36) | ✅ existente |
| 5 | `icon_coin` | Moneda | chip de monedas (menú y barra superior) | ✅ existente |
| 6 | `assets/pixel/skills/<skillKey>/26.png` | Icono 26×26 de la barra | `renderPowers` (9 poderes) | ✅ pixel |
| 7 | `idle_tips_plate` | Platito de propinas | `renderIdle` (sistema fama/propinas, US-31) | 🔶 **placeholder [pl]** |
| 8 | `idle_fame_star` | Estrella de fama | ídem (US-31) | 🔶 **placeholder [pl]** |

---

## Sprites PRESENTES en el sheet (no referenciados directamente por la UI principal)
Disponibles como decoración o remplazo de placeholders emoji; no bloquean nada:

| id | qué es | Estado |
|----|--------|--------|
| `furniture_table` | Mesa de madera | ✅ existente |
| `furniture_shelf` | Estantería + planta | ✅ existente |
| `furniture_cup` | Taza | ✅ existente |
| `furniture_pastry` | Bollo/croissant | ✅ existente |
| `machine_bar` | Máquina de bar | ✅ existente |
| `calamity_lock` | Candado (tablero usa 🔒 por simplicidad) | ✅ existente |
| `icon_heart` | Corazón | ✅ existente |
| `icon_paw` | Pata (badge de nivel) | ✅ existente |

---

## Sprites FALTANTES → placeholder por código (lo que el artista debe dibujar)
La regla de oro: **ningún sprite ausente rompe la jugabilidad**. Estos dos se generan en `index.html` como celda de color token + sigla:

| id | placeholder actual | arte aconsejado |
|----|--------------------|-----------------|
| `idle_tips_plate` | mosaico dorado «IP» | platito de enlaces con monedas (US-31) |
| `idle_fame_star` | mosaico azul-pastel «FS» | estrella de fama (US-31) |

---

## Cómo entregar arte completo (instrucciones al artista)
1. Sumistra una **nueva** `assets/sprites.png` (512×512 o mayor). Añade las **2 celdas** que faltan:
   - `idle_tips_plate`
   - `idle_fame_star`
2. Genera `assets/sprites.json` con el MISMO esquema actual: `{ "SPRITE_CELL":128, "cols":N, "rows":M, "sheetWidth":…, "sheetHeight":…, "sprites":[{"id","name","x","y","w","h","col","row"}] }`.
3. Sustituye ambos archivos en `assets/`. El juego detecta los ids y deja de usar los placeholders, **sin tocar `index.html`**.

---

## Pixel art (`assets/pixel/`)

Manifest `format: cozy-cat-cafe-sprites`, `version: 1`. Fondo transparente, nearest-neighbor, 1:1.

| Qué | Tamaño | Notas |
|---|---|---|
| Cliente | 32×32 y 28×28 | 28 solo en `@media (max-width: 560px)`. Idle 4 frames: 250, 170, 250, 170 ms. |
| Host cat (victoria / derrota) | 96×96 | `host_cat_96.png` + idle |
| Poderes de la barra | 26×26 | destroyPile, swapPiles, refreshPool, tables, unlockLocks, color, tips, clearBoard, undoMove |
| previewPool, queueSkip | 26×26 | en el pack; sin botón |

Trazo `#794835`, crema `#f8f1d5`, blush `#f6a7c1`, parche del color de pedido, luz arriba-izquierda.

---

## Verificación
- **TDD lógica:** `node --test test/rules.test.js` → **47 tests PASS**.
- **Jugable e2e:** `node test/e2e.playthrough.js` → jugada real que incluye cierre **victoria `allServed`** (misma lógica que usa la UI).
- **Placeholders visibles:** abre `index.html`, en la franja `#idleDecor` se ven mosaicos «IP» / «FS» si el arte falta; al agregarlo aparecen las imágenes del sheet.