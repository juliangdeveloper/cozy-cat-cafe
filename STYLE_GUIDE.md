# STYLE GUIDE — Cozy Cat Café × HexaSort
**Dirección artística:** WARM VINTAGE CAFE · **Art Bible / Spec de implementación**
**Idioma UI:** Inglés · **Plataforma:** HTML/JS desplegable (responsive, touch-first)
**Fuente raíz:** `references/REFERENCES.md` (paleta candidata) · `DESIGN_DECISIONS.md` (mecánica)
**Estado:** v1.0 · code-first, sin párrafos de relleno.

---

## 1. DIRECCIÓN DE ARTE — Declaración

> **Warm Vintage Café.** Interiores de madera cálida, tazas de porcelana y pastelería
> en vitrinas de cristal, luz acogedora dorada al atardecer, ilustración *hand-drawn*
> con contornos de chocolate y arabescos de artesanía. El café es cálido y habitable:
> nada de neón, nada de frío digital. Gatos *cartoon-cálidos* de orejas redondas y cuerpos
> suaves, ataviados con baberos/gorros de barista. *Hand-drawn cozy*: bordes redondeados,
> sombras suaves difuminadas, madera warm-latte en marcos y muebles, y un toque vintage
> (doble raya artesanal, esquinas redondeadas de tarjeta, textura de papel de estraza).

Reglas de oro (hard rules):
- **Contorno chocolate `#794835`** en TODOS los elementos interactivos y tiles (legibilidad y estética tinta).
- **Fondos** siempre cálidos (pink-cream / cream / latte); **nunca** blanco puro.
- **Botones** de tamaño táctil ≥ 44×44 px; esquinas ≥ 14 px.
- **Textura** wood/paper vía SVG noise sutil + `border-radius`; sin sombras duras tipo neón.
- **Vintage**: elementos clave llevan doble borde (outline chocolate 2px + interior latte 1px).

---

## 2. PALETA — Tokens

> Todos los colores son variables CSS. **Ningún color fuera de esta lista** sin token nuevo.

```css
:root {
  /* ===== FONDOS ===== */
  --bg-primary:    #f7d1e1;  /* Pink Cream   — fondo principal de toda la UI  */
  --panel:         #f8f1d5;  /* Cream        — paneles / tarjetas / trayl      */
  --wood:          #b6947c;  /* Warm Latte   — madera, marcos, muebles, bordes */
  --wood-dark:     #9a7a63;  /* derivado de warm-latte (sombra de madera)      */

  /* ===== ACENTOS / ACCIÓN ===== */
  --accent:        #f6a7c1;  /* Blush Pink   — botón primario OPEN / acciones  */
  --accent-2:      #ffb2c1;  /* Soft Pink    — botones secundarios, corazones  */
  --highlight:     #fff5b2;  /* Yellow Pale  — brillos, badge de dinero/nuevo  */

  /* ===== TILE / HEXA COLORS (pedidos) ===== */
  --tile-mint:     #a8e1d4;  /* Mint         — grupo de tiles hexagono 1        */
  --tile-blue:     #b2d7ff;  /* Sky Blue     — grupo de tiles hexagono 2        */
  --tile-pink:     #ffb2c1;  /* Soft Pink    — grupo de tiles hexagono 3        */
  --tile-blush:    #f6a7c1;  /* Blush Pink   — grupo de tiles hexagono 4        */
  --tile-lavender: #e5c4e8;  /* Lavender (opt.) — grupo de tiles hexagono 5     */
  --tile-cream:    #f8f1d5;  /* Cream        — grupo de tiles hexagono 6        */

  /* ===== TINTA / CONTORNO ===== */
  --ink:           #794835;  /* Chocolate    — texto, contornos fuertes, trazo  */
  --ink-soft:      #a06e52;  /* derivado     — texto secundario / placeholders  */

  /* ===== ESTADOS & SEMÁNTICA ===== */
  --success:       #a8e1d4;  /* Mint para feedback positivo (clear/served)      */
  --danger:        #c96a5a;  /* derivado cálido para calamidad/bloqueo/bloqueo  */
  --lock:          #a0928a;  /* derivado apagado candados / locked tree         */
  --shadow:        rgba(121,72,53,.25);  /* sombra tintada chocolate, no negro  */
}
```

### Rol de cada color — tabla de decisión
| Token | Hex | Rol en UI |
|---|---|---|
| `--bg-primary` | `#f7d1e1` | Fondo global (screen). Suave, nunca compite con el tablero. |
| `--panel` | `#f8f1d5` | Fondo de tarjetas: pedidos, panel árbol, tray, tooltips. |
| `--wood` | `#b6947c` | Madera: marco del tablero, bandeja pool, estanterías, mesas, marcos vintage. |
| `--accent` | `#f6a7c1` | Botón PRIMARIO (OPEN SHOP), resaltar selección, avisos de caja registradora. |
| `--accent-2` | `#ffb2c1` | Botones secundarios, corazones, puntitos de capa de tile. |
| `--highlight` | `#fff5b2` | Badge de monedas ganadas / "NEW" en el árbol / brillos de confeti. |
| `--tile-*` | (5–6) | Colores de las piezas hexágono y de los pedidos de los gatos. |
| `--ink` | `#794835` | TODOS los textos, contornos de 2px, iconografía lineal. |
| `--ink-soft` | `#a06e52` | Texto secundario, hints, precios de mejoras bloqueadas. |

**Contraste:** `--ink` (#794835) sobre `--panel` (#f8f1d5) y `--bg-primary` (#f7d1e1) supera 4.5:1 → cumple AA para texto. Los colores de tile con detalle usan solo adornos (capa + punto) en `--ink`, nunca texto sobre el tile.

---

## 3. TIPOGRAFÍA

> Google Fonts cached/self-hosted (woff2). Solo 2 familias. Pesos explícitos.

| Rol | Font | Pesos | Uso |
|---|---|---|---|
| **Display / Títulos** | `'Baloo 2'` | 700, 800 | Logo del café, título de pantalla, números grandes (contador de monedas, nivel). Redondeada, cálida. |
| **UI / Cuerpo / Botones** | `'Nunito'` | 600, 700, 800 | Botones, tarjetas de pedido, árbol, tooltips, chips. Legible y suave. |
| *(Fallback)* | `system-ui, 'Segoe UI', sans-serif` | — | Si las fuentes no cargan. |

```css
:root {
  --font-display: 'Baloo 2', system-ui, sans-serif;   /* títulos */
  --font-ui:      'Nunito', system-ui, sans-serif;     /* cuerpo  */
  --fs-xs: 11px;  --fs-sm: 13px; --fs-md: 15px;
  --fs-lg: 18px;  --fs-xl: 24px; --fs-2xl: 32px; --fs-hero: 44px;
}
```

Reglas:
- **Nada en itálica** (fuentes redondeadas no lo necesitan). Saltos de línea manuales permitidos.
- Números con `font-variant-numeric: tabular-nums` (contadores no "bailan").
- `line-height: 1.15` en display, `1.4` en cuerpo. Colores: `--ink`.
- Títulos con sombra de texto sutil `0 1px 0 var(--wood-dark)` para profundidad vintage.

---

## 4. COMPONENTES UI

> Mecánica de estado: `:active` desplaza 2px en Y, reduce sombra; `:hover` eleva 2px y
> aclara 6% el fondo. Todas las sombras usan `--shadow` (chocolate, no negro).
> Touch targets ≥ **44×44 px** (con área de golpe invisible si el visual es menor).

### 4.1 Botón primario — OPEN SHOP
- Rol: comenzar/reabrir la partida ("abrir el café").
- Fondo `--accent` (#f6a7c1), texto `--ink` (700), contorno `--ink` 2px, esquinas 16px.
- Sombra base `0 4px 0 var(--wood-dark)`; pressed `0 1px 0 var(--wood-dark)` + `translateY(3px)`.
- Forma: pill ancho (border-radius: 999px) o tarjeta redondeada; icono opcional 🐾-taza de café SVG.
- Mínimo: **64×56 px** (altura cómoda para pulgar). Texto `--fs-lg`, `--font-display` 800.
```css
.btn-primary {
  background: var(--accent); color: var(--ink);
  border: 2px solid var(--ink); border-radius: 16px;
  box-shadow: 0 4px 0 var(--wood-dark);
  font: 800 var(--fs-lg)/1 var(--font-display);
  min-width: 200px; min-height: 56px; padding: 0 24px;
  transition: transform .12s ease, box-shadow .12s ease, filter .12s ease;
}
.btn-primary:hover  { filter: brightness(1.06); transform: translateY(-2px); }
.btn-primary:active { box-shadow: 0 1px 0 var(--wood-dark); transform: translateY(3px); }
```

### 4.2 Botón secundario — SKILL TREE (y poderes)
- Fondo `--panel` (#f8f1d5) con borde doble vintage: outer `--ink` 2px, en `inset` `--wood` 1px.
- Texto `--ink` 700, `--font-ui`. Icono de rama/árbol SVG en `--ink`.
- Tamaño ≥ **52×48 px**, esquinas 14px, sombra 0 3px 0 var(--wood-dark).
- Mismo patrón hover/pressed.

### 4.3 Tarjeta de pedido de gato (order card + burbuja)
- Gato cliente sentado + burbuja de pedido encima.
- **Tarjeta:** `--panel`, marco `--wood` 3px, esquinas 12px, sombra `0 3px 0 var(--shadow)`.
- **Burbuja:** blanco-crema `--panel`, contorno `--ink` 2px, esquinas pill; colita de cometa apuntando al gato.
- **Contenido:** "<span>3×</span> <tile color>pink</tile>" — multiplicador en `--fs-xl` `--font-display` 800, testigo de color como hexágono mini del color pedido.
- **Estados:**
  - *Pendiente* (default): burbuja `--panel`.
  - *Completando* (cuando la celda a tope coincide): burbuja pinta `--highlight` + pulso suave.
  - *Servido*: tarjeta se desvanece → confeti → se marca como ✔ con fade.
- Tamaño mínimo tarjeta entera **≥ 72×72 px** (gato 44 + burbuja).

### 4.4 Pool tray — 3 piezas (bandeja de ingredientes)
- **Bandeja:** `--wood` (#b6947c), borde `--ink` 2px, esquinas 14px, doble raya vintage interior.
- 3 celdas: cada una muestra una **pila hex** vertical (misma render que el tile, ver §5).
- Celda activa/clicable: overlay `--highlight` 25% + borde `--accent` 2px al hover.
- **Vaciado del tray:** cuando las 3 se colocan, el tray no se rellena hasta que el jugador las usa → bandeja queda vacía con borde punteado `--wood-dark` (señal "reponer con los gatos trabajadores").

### 4.5 Barra superior — monedas / nivel
- Fija al top, `--bg-primary` con 92% opacidad + blur ligero; borde inferior `--wood` 2px.
- **Chip de monedas:** pill `--panel`, contorno `--ink` 2px; icono 🪙 (aro `--ink` + núcleo `--highlight`); número `--fs-lg` `--font-display` 800.
- **Chip de nivel:** pill con estrella/vintage; "LV n".
- **Contador idle:** chip pequeño `--highlight` cuando hay ganancias pasivas pendientes.
- Al **ganar dinero**: número pops (scale 1.15→1, 180ms, ease-out) y el chip brilla `--highlight`.

### 4.6 Botones de poder (3 poderes comprables)
Pill apiladas bajo el tablero o en una barra lateral (toggle en móvil). Ícono + etiqueta corta.
| Poder | Ícono SVG | Color clave |
|---|---|---|
| **Destroy stack** (destruir pila) | bomba/tachuela | `--danger` acento |
| **Swap 2 stacks** (intercambiar) | flechas circulares | `--tile-blue` |
| **Refresh pool** (descartar pool) | bucle/flecha derecha | `--tile-mint` |
- **Comprado/habilitado:** fondo `--panel`, contorno `--ink` 2px, sombra activa.
- **No comprado (candado):** fondo `--lock`, contorno `--lock-dark`, icono de candado SVG; precio bajo en `--ink-soft`.
- **Con usos limitados:** contador de usos restantes en esquina (badge `--highlight`). ≥ **48×48 px** cada uno.

### 4.7 Árbol de habilidades (Skill Tree)
- **Panel:** `--panel` grande, marco `--wood` 4px + esquinas 20px; título "Café Skills" `--font-display` 800.
- **Nodos:** círculos de madera `--wood` con icono; nodo raíz `--accent` (nivel del café).
- **Conexión:** línea `--wood-dark` 3px de nodo→nodo.
- **Estado por nodo:**
  - *Bloqueado*: gris `--lock`, candado SVG (no clicable).
  - *Comprable*: contorno `--ink` 2px + precio badge `--highlight`; pulso lento para llamar atención.
  - *Comprado*: nodo `--accent` con check ✔ rodeado de `--highlight` halo.
- **Tooltip de pago:** burbuja `--panel`, muestra "XP del café" (nivel) requerido y costo en monedas → botón "Unlock".

### 4.8 Badge de calamidad / candado (Locked tile)
- **Tile bloqueada en tablero:** tile hex `--lock` con candado SVG sobrescrito en `--ink-soft`; NO clicable; borde `--ink` punteado.
- **Tile con pila aleatoria (calamidad):** misma pila hex normal pero con un rombo/estrella pequeña `--danger` indicando "viene del desorden".
- **Contador de calamidades al cerrar:** badge `--danger` "Bonus: +N" en la pantalla de cierre.

---

## 5. TILE HEX (pieza hexágono)

- **Forma:** clip-path hexágono regular (`polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0 50%)`) o SVG path; tamaño base **56×64 px**, celda de tablero ~64×72 px.
- **Apilado:** las piezas del mismo color se encolan **verticalmente con solape** (la pieza superior cubre ~40% de la inferior, desplazada −10px en Y). La pila crece hacia arriba.
- **Cada pieza (layers):**
  1. `fill: var(--tile-*)` de su color.
  2. **Contorno:** `--ink` 2px (regla de oro).
  3. **Adorno de capa:** punto central (`--ink` al 35%) o mini-espiral → hace legible el conteo de la pila.
- **Pila = pedido:** cuando el grupo superior de la pila tiene el tope de color y la cantidad exacta del pedido → las piezas del pedido **parpadean** (`--highlight` overlay) → al servir **desaparecen** (la celda se vacía).
- **Contadores táctiles:** número de la cantidad pedida sobre la pila con badge `--panel`+`--ink` circulito 26px.

### Colores de tile asignables (progresión de catálogo)
| Índice catálogo | Tile color | Orden/pedido label |
|---|---|---|
| 1 | `--tile-mint` `#a8e1d4` | mint / green |
| 2 | `--tile-blue` `#b2d7ff` | sky / blue |
| 3 | `--tile-pink` `#ffb2c1` | pink |
| 4 | `--tile-blush` `#f6a7c1` | blush / rose |
| 5 | `--tile-lavender` `#e5c4e8` | lavender |
| 6 | `--tile-cream` `#f8f1d5` | cream / vanilla |

> Todos los colores de tile mantienen **suficiente separación tonal** contra `--wood` y `--bg-primary`
> para distinguirse a simple vista. Los pedidos usan EXACTAMENTE el mismo token que sus piezas.

---

## 6. GATOS / ILUSTRACIÓN

- **Estilo:** cartoon-cálido hand-drawn, cuerpos redondeados de 2 cabezas, orejas de triángulo suave, cola en espiral, bigotes finos en `--ink`. Mismo lenguaje que la dirección "fat latte" (cuerpo gordito, patas cortas).
- **Paleta de pelaje:** caramel / crema / gris-café (derivados de `--wood`/`--panel`/`--bg-primary`), con manchas `--accent`/`--tile-blue`. Nunca blanco puro ni negro.
- **Contorno:** `--ink` 2px en todo el contorno del gato.
- **Clientes (en el tablero/café):** sentados junto a su pedido, expectantes; posición idle con respiro (scaleY 1↔1.03, 2s).
- **Trabajadores (empleado-gato idle):** gato con **babero/gorro de barista** (`--panel` + doble raya vintage); caminando entre bandeja y tablero ("trae ingredientes"), o sirviendo.
- **Expresiones:** ojos de botón (2 círculos `--ink`), boca simple; mejillas rosa `--accent` al 40%; corazón `--accent` sobre la cabeza al **servir un pedido** (feedback emocional).
- **Nuevos trabajadores:** al comprar mejora, UN gato nuevo entra por la puerta y ocupa su puesto (reflejo gráfico del idle, ver §8).
- **Formato:** SVG inline (curvas suaves) para crispado; animación vía CSS/keyframe transform (barato, no canvas cada frame).

---

## 7. FEEDBACK / ANIMACIÓN

> Timing maestro **800–1200 ms** por ciclo de feedback. Easings: `cubic-bezier(.32,.72,.17,1)` (cozy-out) y
> `cubic-bezier(.34,1.56,.64,1)` (spring-pop). Preferir `transform`/`opacity` (compositor, 60fps).

| Evento | Animación | Duración | Easing |
|---|---|---|---|
| **Servir pedido (clear)** | pila del pedido → scale .3 + fade up + confeti, celda se vacía | 900 ms | spring-pop |
| **Pago** | chip de monedas pop + "+N" flota desde la celda hasta la barra | 1000 ms | cozy-out |
| **Colocar pila** | pieza baja al tablero con pequeño squash (scaleY .92→1) | 220 ms | spring-pop |
| **Confeti** | 10–14 partículas (tiles random) desde la celda servida, gravedad ligera ↑↓ | 800 ms | ease-out |
| **Screen shake** | SOLO calamidad / cierre de café: `translate` ±3px X, 3 ciclos | 300 ms | ease-in-out |
| **Pool tray vacío** | bandeja pulsa el borde punteado (aviso "reponer") | 500 ms | ease-in-out |
| **Skill unlock** | nodo big pop + halo `--highlight` expandiéndose | 900 ms | cozy-out |
| **Cambio de dinero** | número scale 1.15→1 + brillo chip | 180 ms | spring-pop |
| **Nuevo color desbloqueado** | overlay "New color!" + los 3 primeros pedidos nuevos brillan | 1000 ms | cozy-out |

Reduced-motion (`prefers-reduced-motion: reduce`): **desactivar** screen shake y confeti; mantener solo fades 200ms.

---

## 8. IDLE SYSTEMS — REFLEJO GRÁFICO

> Cada idle system tiene **reflejo visual real en el café** (nunca solo un número que sube).

### 8.1 Empleados-gatos (worker cats)
- Representación: **gatos trabajadores visibles** en la escena (contador = nº de gatos en el café).
- Al comprar +1 empleado → **un gato nuevo con babero entra** y se coloca junto a la bandeja/estación.
- Animación: caminan de la bandeja al tablero (llevan pila de ingredientes), hacen una pausa, vuelven.
- Ganancia pasiva: cada empleado produce una **moneda** que flota hacia el chip cada intervalo.

### 8.2 Fama / Propinas (tips)
- Representación: **cofre/platito de propinas** junto a la puerta + estrellas de fama sobre los gatos.
- Fama sube → platito se llena (badge de progreso circular o barra de ⭐).
- Propinas: moneda dorada `--highlight` cae al platito con tintineo (render puntual, no texto).

### 8.3 Máquinas automáticas (auto-machines)
- Representación: **máquina de café/expendedora** visible en una esquina del café; **estampida de vapor** cuando produce.
- Al comprar/potenciar → la máquina cambia de nivel visual (cromado + nube de vapor cada N segundos).
- Ganancia: máquina "tose" una moneda que rueda por el mostrador hasta la caja.

### 8.4 Offline acumulado
- Al volver: **modal "While you were away"** con pancarta `--panel` + lista de los 3 sistemas y sus ganancias → botón "Collect" (badge `--highlight`).
- Tope visual: si el almacén está lleno, el platito/máquina muestran el borde `--danger` "Full".

---

## 9. ESPECIFICACIONES MÓVILES (responsive)

- **Breakpoint:** `@media (max-width: 480px)` → layout de 1 columna apilado.
- **Touch targets:** TODOS los controles interactivos **≥ 44×44 px** (ideal 48×48); botón OPEN ≥ 56 px de alto. Botones de poder ≥ 48 px.
- **Safe areas:** `padding: env(safe-area-inset-*)` para notch/home indicator.
- **No hover en táctil:** los estados `:hover` no aplican en touch; confiar en `:active` y en `:focus-visible`. (`@media (hover: none)` para eliminar sombras de hover).
- **Orden de apilado (480px):** 1) barra superior (monedas/nivel) → 2) tablero hex (scroll vertical si excede) → 3) pool tray (3 pilas) → 4) fila de poderes (scroll horizontal) → 5) botón OPEN SHOP / tarjetas de pedido accesibles.
- **POOL tray en móvil:** celdas ≥ 60×70 px, separación 8px, contorno `--ink` 2px.
- **Árbol de habilidades en móvil:** panel full-screen modal con scroll; nodos ≥ 48 px; línea de conexión se vuelve punteada.
- **Tablero escalado:** escalar el tablero hexagonal a `transform: scale()` para caber en el viewport, nunca recortar celdas críticas; mínimo celda 48 px.
- **Tooltips:** aparecen como badge fijo inferior (no hover); dismissible tap.
- **Orientación:** se admite portrait (recomendado) y landscape con scroll; `touch-action: manipulation` para eliminar delay de doble-tap en botones.

---

## Nota de fuente
Colores tomados de la **paleta candidata** de `references/REFERENCES.md`; roles asignados a una UI de café cálido.
Los derivados (`--wood-dark`, `--ink-soft`, `--danger`, `--lock`) se generaron desde los 8 hex + 2 opcionales de la paleta.
Fonts propuestas (Baloo 2 / Nunito) — verificar disponibilidad/weight antes de empaquetar; fallback `system-ui` incluido.
