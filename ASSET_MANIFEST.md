# ASSET MANIFEST — Cozy Cat Café × HexaSort

**Objetivo:** lista de compra exacta para el artista. Cada sprite que el **código** (`index.html` + `js/game.js`) referencia, con su estado:

- **✅ existente** → ya dibujado en `assets/sprites.png` + `assets/sprites.json`.
- **🔶 placeholder [pl]** → NO está en el sprite map; el juego lo genera *por código* (celda de color sólido fiel a STYLE_GUIDE + sigla del id) para que el juego sea **100 % jugable sin arte** (G7 / US-42 / US-43).

Regla: **no escribas a mano sobre `sprites.png`/`sprites.json`.** Cuando el artista entregue el arte completo, sustituye ambos archivos; el juego los consume en caliente y solo cambian las imágenes. El código no se toca.

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
| 2 | `cat_client_1` | Gato cliente Caramel | menú + tarjetas de pedido | ✅ existente |
| 3 | `cat_client_2` | Gato cliente Cream | ídem (pedido #2) | ✅ existente |
| 4 | `cat_client_3` | Gato cliente Grey | ídem (pedido #3) | ✅ existente |
| 5 | `machine_coffee` | Máquina de espresso | menú + `renderIdle` (máquinas, US-36) | ✅ existente |
| 6 | `icon_coin` | Moneda | chip de monedas (menú y barra superior) | ✅ existente |
| 7 | `power_destroy` | Poder — destruir pila | barra de poderes `renderPowers` | ✅ existente |
| 8 | `power_swap` | Poder — intercambiar | ídem | ✅ existente |
| 9 | `power_refresh` | Poder — refrescar tray | ídem | ✅ existente |
| 10 | `idle_tips_plate` | Platito de propinas | `renderIdle` (sistema fama/propinas, US-31) | 🔶 **placeholder [pl]** |
| 11 | `idle_fame_star` | Estrella de fama | ídem (US-31) | 🔶 **placeholder [pl]** |

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

## Verificación
- **TDD lógica:** `node --test test/rules.test.js` → **47 tests PASS**.
- **Jugable e2e:** `node test/e2e.playthrough.js` → jugada real que incluye cierre **victoria `allServed`** (misma lógica que usa la UI).
- **Placeholders visibles:** abre `index.html`, en la franja `#idleDecor` se ven mosaicos «IP» / «FS» si el arte falta; al agregarlo aparecen las imágenes del sheet.