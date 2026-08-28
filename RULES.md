# RULES — Cozy Cat Café × HexaSort

**Fase:** ANALISTA / ARQUITECTO DE REGLAS (ciclo BMAD) · **Estado:** v1.0 · **Idioma:** código-primero (JSON/pseudocódigo/asserts), sin párrafos de relleno.
**Fuentes (fuente de verdad):** `DESIGN_DECISIONS.md` (mecánica) · `SPEC.md` (US-1..43, G1-G7) · `STYLE_GUIDE.md` (solo presentación/feedback §4-8).
**Trazabilidad inversa:** cada R → su(s) US/G. G1, G4, G5, G7 cubiertos aquí; G2 (Pages), G3, G6 son de deploy/arte/responsive (no lógica).

---

## 0. ARQUITECTURA LÓGICA (contrato de testeabilidad)

- **Regla de oro:** TODA la lógica vive en un módulo JS puro `js/game.js` con **funciones puras** (mismo input → mismo output, sin efectos de DOM ni `Math.random` no inyectado). El rendereo (DOM/CSS) y los sprites (`sprites.png` + `sprites.json`) quedan FUERA de `game.js`.
- El estado es un único objeto explícito `state` (ver §1). Las acciones son funciones puras que **reciben `state` (y un `rng` opcional) y devuelven un NUEVO state** (no mutan). Esto permite testeo determinista (inyectar `rng` con semilla).
- Framework de test elegido: **`node:test`** (Node ≥ 18, sin dependencias, headless: `node --test test/`). Suite en `test/rules.test.js`. Opcional: `tests.html` que envuelve la misma suite para el navegador (misma `game.js`, sin build).
- Los números de balance (precios, tasas, exponente) son **constantes con nombre** en `game.js` (bloque `CONFIG`), referenciadas por las reglas; sustituibles sin cambiar la lógica.

```js
// Firma canónica de game.js (ESM) — exporta:
export { createGame, CONFIG,
  placeStack, serveOrder, closeRun, newRun,
  buySkill, useDestroyPile, useSwapPiles, useRefreshPool,
  buyExpansion, buyIdleUpgrade, buyMultiplier,
  tickIdle, applyOffline,
  colorsUnlocked, orderReadyOn, generateBoard };
```

### R11. Purismo lógico
- `R11.1` — Toda función de esta spec **no toca DOM, localStorage ni `Date.now`** en sí mismas. Esas dependencias se inyectan o se confinan a una capa `io.js` (guardar/cargar/reloj). → traza: G7, US-42.
- `R11.2` — Ningún color/tile/artista está en `game.js`; la lógica usa **índices** de color (1..6), que el renderer mapea a `--tile-*`. El catálogo de sprites es intercambiable sin tocar código. → G7, US-43.
- `R11.3` — El reloj se pasa como argumento (`now` ms) a toda función de idle/offline; el test controla el tiempo, nunca `Date.now()`.

---

## 1. MODELO DE ESTADO (JSON persistido en localStorage)

**Clave localStorage:** `cozy-cat-cafe.save.v1`. Un único blob. **Sin versión de esquema compatible → reset total del save** (guardia de migración, R1.4).

```jsonc
{
  "version": 1,                       // debe ser 1; si no, RESET (R1.4)

  "meta": {                            // no-juego
    "createdAt": 1710000000000,        // ms epoch
    "lastSavedAt": 1710000360000,
    "lastSeenAt": 1710000300000,       // para offline (R9.3)
    "exportId": "ccc-1-1710000000000"  // id de save para export/import
  },

  "progress": {                        // meta persistente (NO se resetea al reabrir)
    "coins": 120,
    "totalGames": 3,                   // nº partidas cerradas (R2.5, R7.1)
    "cafeLevel": 4,                    // = totalGames + 1 (R7.1)
    "productsBought": 0,               // catálogo → colores (R10.1)
    "clients": 3,                      // nº gatos-cliente por partida (R6.1)
    "boardCells": 12,                  // nº celdas del tablero (R6.2)
    "colorsUnlocked": 1,               // derivable: clamp(1+floor(products/3),1,6) (R10)

    "econ": { "multLevel": 0 }         // multiplicador mejorable (R5.2)
  },

  "economy": {  // alias de lectura: multLevel → CONFIG (ver R5.2)
    "multLevel": 0
  },

  "skills": {                          // árbol de habilidades (R7)
    "destroyPile": { "owned": false, "uses": 0, "price": 250, "unlockLevel": 5 },
    "swapPiles":   { "owned": false, "uses": 0, "price": 120, "unlockLevel": 3 },
    "refreshPool": { "owned": false, "uses": 0, "price": 40,  "unlockLevel": 1 }
  },

  "idle": {                            // 3 sistemas pasivos (R9)
    "workers":  { "level": 1, "ratePerSec": 0.5, "cap": 60 },
    "fame":     { "level": 1, "ratePerSec": 0.3, "cap": 100 },
    "machines": { "level": 1, "ratePerSec": 0.8, "cap": 40 }
  },

  "run": null,                         // null = sin partida activa (menú); si no, R2

  "settings": { "reducedMotion": false }
}
```

### R1. Persistencia y estado
- `R1.1` — `state.progress`, `state.skills`, `state.idle`, `state.economy` son **persistencia de meta**; `state.run` (si existe) persiste la partida en curso. Todo se guarda en el mismo blob bajo `cozy-cat-cafe.save.v1`. → US-39, G4.
- `R1.2` — **Guardado**: snapshot del state en cada mutación transaccional (colocar/servir/cerrar/comprar/offline). **Carga**: al arrancar lee el blob; si no existe → state inicial (`createGame()`); si existe → restore íntegro (roundtrip idéntico: JSON.stringify(load(save)) === save). → US-40, G4.
- `R1.3` — **Export/Import**: exportar = descargar el blob como `cozy-cat-cafe-v1.json`; importar = validar `version===1`, shape mínima y reemplazar el blob. Import inválido se rechaza sin tocar el save actual. → US-41, G4.
- `R1.4` — Guardia de migración: si `version !== 1` en el momento de cargar → **reset a `createGame()`** y descarta el blob anterior (sin crash). → US-40.

### R2. Ciclo de partida (abrir/cerrar/reabrir)
```js
// Sig.: openRun(state, rng) -> newState (run no-null)
//       closeRun(state, reason) -> newState (run null, reason en run?.closeReason, contadores)
//       reason: 'full' | 'allServed' | 'manual'
```
- `R2.1` — **Abrir (OPEN SHOP):** `openRun` construye `state.run = { phase:'open', orders, board, pool, poolPlaced:0, calamities }` vía `generateBoard` (§1.2 abajo). **Crea una partida nueva; no reabre la anterior.** → US-1, G1.
- `R2.2` — **Cierre ① tablero lleno sin poder colocar → `closeRun('full')`** (pérdida/no-éxito). → US-8, G1.
- `R2.3` — **Cierre ② todos los gatos atendidos → `closeRun('allServed')` (éxito).** → US-9, G1.
- `R2.4` — **Cierre ③ manual, en cualquier fase → `closeRun('manual')`, conservando las monedas ganadas hasta ese punto.** → US-10.
- `R2.5` — **Cerrar = `totalGames += 1`, `cafeLevel = totalGames + 1`, se recalcula `colorsUnlocked`, `run=null`. Cierre NO borra `progress/skills/idle`, sí `run`. Al cerrar se liquidan calamidades (R5.3) y se añaden a `coins`.** Reabrir (R2.1) reinicia la partida. → US-10, US-21, G1.
- `R2.6` — Solo hay **una** condición ganadora: `allServed`. `full` y `manual` no son victoria, pero **conservan** coins ganadas. → US-8/9/10.

> **Shape de `run` (partida activa):**
> ```jsonc
> "run": {
>   "phase": "open",                    // destino final tras close se borra
>   "orders": [
>     { "id":"ord-0", "cell":5, "color":2, "qty":3, "served":false }
>   ],
>   "board": [
>     { "cell":0, "stack":[2], "blocked":false, "calamity":false, "calamityStack":false },
>     { "cell":1, "stack":[3,3], "blocked":true, "calamity":true, "calamityStack":false }
>   ],
>   "pool": [ [1,1], [2], [3,3,3] ],    // 3 pilas (o [] al vaciarse, R3)
>   "poolPlaced": 0,                    // 0..3 (R3.2)
>   "calamities": 5                     // nº de celdas de calamidad (R8)
> }
> ```
> `board[i]` es celda `i`; `stack` es el array de piezas de abajo-arriba (último = tope).

---

## 2. REGLAS DE JUEGO

### R3. Pool y colocación
```js
// Sig.: placeStack(state, cellId) -> newState | { error }
```
- `R3.1` — El **pool tiene 3 slots**. Cada slot es una pila de piezas de un ÚNICO color (ej. `[2,2,2]`). Se generan por `rng`. → US-2, G1.
- `R3.2` — **No se rellena hasta colocar las 3 actuales.** Al colocar una pila en una celda, ese slot se vacía y `poolPlaced += 1`. **NO se genera una pila nueva por slot.** → US-7.
- `R3.3` — **Refill:** cuando `poolPlaced === 3` (las 3 colocadas), el pool se **rellena de golpe con 3 pilas nuevas** y `poolPlaced = 0`. La única "bandeja vacía con borde punteado" persistente es el instante entre la 3ª colocación y el refill. → US-7; render §4.4 STYLE.
- `R3.4` — **Colocar** = tomar la pila del slot `kol` del pool y añadir sus piezas al tope de la celda destino: `board[cell].stack = stack.concat(pile)`. **Válido solo si:** celda existe, `!blocked`, y `stack` NO está bloqueado por calamidad (R8.4). La celda puede tener piezas previas (apilado por tope, R4.2). → US-3.
- `R3.5` — **Invalid place** (`{error}`): celda bloqueada, celda inexistente, o pool vacío (slot ya colocado). No consume slot, no muta. → US-3.

### R4. Pedidos y servir
```js
// Sig.: topGroup(stack) -> { color, count }   // racha final de color igual
//       orderReadyOn(state, orderId) -> bool
//       serveOrder(state, orderId) -> newState | { error }
```
- `R4.1` — Cada **pedido** (gato) tiene `{color, qty}` y está **enlazado a una celda** (`order.cell`), una celda distinta por pedido. `cli = state.progress.clients` (R6.1). → US-4.
- `R4.2` — **Listo para servir:** el pedido de la celda está listo ⇔ **`topGroup(board[cell].stack) === { color: order.color, count: order.qty }`** (tope de color IGUAL al pedido Y conteo EXACTO). Cuando se cumple → señal `--highlight` (render). → US-5, G1; §5 STYLE.
- `R4.3` — **Servir:** `serveOrder` **vacía la celda completa** (`board[cell].stack = []`), marca `order.served = true`, y otorga pago (R5.1). → US-6, G1.
- `R4.4` — **No-se-puede-servir** (`{error}`) si: `order.served` ya era true, o el tope NO coincide con `order.color+order.qty`. No cobra, no muta. → US-5/6.
- `R4.5` — Servir una celda **libera espacio** (queda vacía y reusable para apilar más); los pedidos ya servidos NO se re-llenan (nº de pedidos fijo = `clients`). → R4, G1.

### R5. Economía
```js
// CONFIG: BASE_COIN=5, EXP_BASE=1.25, EXP_STEP=0.05, CALAMITY_BONUS_PER=15
// pay(order) = round(BASE_COIN * order.qty ** (EXP_BASE + EXP_STEP*multLevel))
// bonusCalamity(state) = state.run.calamities * CALAMITY_BONUS_PER
```
- `R5.1` — **Pago base:** cada pedido servido añade `pay(order)` a `state.progress.coins`. (Ej. qty=3, multLevel=0 → `round(5*3^1.25)=round(5*3.948)=20`). → US-11.
- `R5.2` — **Multiplicador superlineal mejorable:** el exponente crece con `economy.multLevel` (`price` sube con `buyMultiplier`). **Superlinealidad garantizada:** `pay(qty=4)` > `2*pay(qty=2)` con mismo multLevel (4^1.25≈5.66 ≥ 2·2.38≈4.76) → "apilar 4 de una vez > 2 pedidos de 2". `buyMultiplier` sube `multLevel` (costo `100*(multLevel+1)`, tope 6). → US-12.
- `R5.3` — **Bonus calamidades al cerrar:** al `closeRun` (cualquier motivo) se añade `bonusCalamity(state)` a `coins` y se expone `bonus` en el resultado para el badge `--danger` "Bonus +N". → US-13, US-29, G1; §4.8 STYLE.

### R6. Expansiones (gasto de dinero)
- `R6.1` — **+clientes:** `buyExpansion('clients')` gana `clients += 1` (costo `40*clientsInicial`). Más gatos por partida. → US-14.
- `R6.2` — **+celdas de tablero:** `buyExpansion('board')` gana `boardCells += 3` (costo `60*boardCells/3`). Más espacio. → US-15, US-38.
- `R6.3` — **+catálogo/colores:** `buyExpansion('products')` gana `productsBought += 1` (costo `50*productsBought`); se recalcula `colorsUnlocked` (R10.1). Más dificultad/recompensa. → US-16.
- `R6.4` — Toda expansión gasta `coins`; **no se puede comprar sin saldo** (devuelve `{error:'noFunds'}`, no muta). → US-14/15/16.

### R7. Árbol de habilidades y poderes
```js
// CONFIG: UNLOCK(power)= skills[power].unlockLevel ; PRICE(power)= skills[power].price
// USES_PER_RUN: destroyPile:3, swapPiles:3, refreshPool:2
```
- `R7.1` — **Nivel del café desbloquea nodos:** `destroyPile` requiere `cafeLevel≥5`, `swapPiles≥3`, `refreshPool≥1`. `cafeLevel = totalGames+1` (sube con nº de partidas, R2.5). En el árbol, un nodo con nivel insuficiente = **bloqueado** (candado, no clicable). → US-20, US-21.
- `R7.2` — **El nivel NO tiene reflejo visual en la escena**; solo se muestra en la UI del árbol (LV chip). La escena NO cambia por subir de nivel, solo cambia al **comprar** un poder (R7.3). → US-22.
- `R7.3` — **Compra:** `buySkill(power)` exige `cafeLevel ≥ unlockLevel` Y `coins ≥ price`. Al comprar: `owned=true` (reflejo gráfico: nodo activo + arte del poder en la escena) y `uses = USES_PER_RUN`. → US-17/18/19, US-23.
- `R7.4` — **Usos por partida:** `uses` decrementa al usar; **no puede usar si `uses===0`** ni si `!owned`. Al reabrir (`openRun`) **se reponen los `uses`** de todos los poderes poseídos. Estado visible: contador de usos / badge candado-comprado (render). → US-24.
- `R7.5` — **DESTROY PILE** (más caro, `price=250`): `useDestroyPile(state, cellId)` — **vacía la pila de una celda** cualquiera (quita todo su `stack`, libera espacio), marca `uses -= 1`. Celda bloqueada (R8.4) no destruible. → US-17.
- `R7.6` — **SWAP PILES** (medio, `price=120`): `useSwapPiles(state, cellA, cellB)` — **intercambia los `stack` completos** de 2 celdas (o 1 pila de pool ↔ 1 celda). Marca `uses -= 1`. No toca bloqueadas. → US-18.
- `R7.7` — **REFRESH POOL** (barato, `price=40`): `useRefreshPool(state)` — **descarta el pool actual y genera otras 3 pilas** nuevas (no gasta colocaciones) con `rng`. Marca `uses -= 1`, `poolPlaced=0`. → US-19.

> R7.8 — **Cualquier uso sin `owned` o con `uses===0` → `{error}`**, no muta. → US-24.

### R8. Calamidades (tablero > 15 hex)
```js
// CONFIG: CALAMITY_LO=None, CALAMITY_MIN_FRAC=1/5, CALAMITY_MAX_FRAC=1/3, BLOCK_PROB=0.5
// generateBoard(state, rng):
//   n = state.progress.boardCells
//   if n <= 15: calamities = 0 (sin calamidades)
//   else:
//     lo = ceil(n/5); hi = floor(n/3)
//     count = rngInt(rng, lo, hi)           // variable por partida
//     for k in count: pick random celda libre:
//        if rng()<0.5 -> blocked=true
//        else         -> stack = [randColor]*rngInt(1,3) (pila pre-colocada)
//    state.run.calamities = count
```
- `R8.1` — **Solo entran si `boardCells > 15`.** A 15 o menos, `calamities = 0`. → US-25.
- `R8.2` — **Cantidad entre 1/3 y 1/5 del tablero, variable:** `count ∈ [floor(n/3), ceil(n/5)]` (i.e. lo=ceil(n/5), hi=floor(n/3)), aleatorio según `rng` → cada partida distinta. → US-25, US-28.
- `R8.3` — **Celdas con pilas pre-colocadas:** ~50% de las calamidades son celdas con una pila aleatoria ya encima (desafío de inicio); señal `--danger` (render). → US-26; §4.8 STYLE.
- `R8.4` — **Celdas bloqueadas:** el resto son celdas `blocked=true` (candado, no clicables, no place/destroy/swap). Ocultan espacio utilizable. → US-27; §4.8 STYLE.
- `R8.5` — **Bonus al cerrar** ya definido en R5.3 (badge `--danger` "Bonus +N"). → US-29.

### R9. Idle / offline
```js
// CONFIG: RATE(workers, lvl)=0.5*lvl ; RATE(fame,lvl)=0.3*lvl ; RATE(machines,lvl)=0.8*lvl
//         CAP(workers,lvl)=60*lvl ; CAP(fame,lvl)=100*lvl ; CAP(machines,lvl)=40*lvl
//         IDLE_PRICE(s,lvl)= 50*lvl^2
// tickIdle(state, dt): coins += Σ(rate*sys * dt)     // online, SIN tope
// applyOffline(state, now): dt = now - meta.lastSeenAt
//         por sistema: gained = min(RATE(s, lvl)*dt, CAP(s, lvl)) ; coins += gained
//         expone state.meta.offlineReport = {workers, fame, machines, total}
```
- `R9.1` — **Los 3 sistemas generan pasivo a la vez** (suman): workers + fame + machines. → US-33.
- `R9.2` — **Online** (`tickIdle`): acumula continuamente por `dt` según tasa de cada nivel, sin tope. → US-30/31/32.
- `R9.3` — **Offline con tope:** al volver, `gained = min(rate*dt, cap(level))` POR sistema. Un solo sistema saturado no frena a los otros. Se muestra modal "While you were away" con `offlineReport` y Collect. → US-34; §8.4 STYLE.
- `R9.4` — **Subir mejora sube tasa Y tope:** `buyIdleUpgrade(system)` gana `level+=1` (costo `IDLE_PRICE`), subiendo `ratePerSec` y `cap`. → US-35.
- `R9.5` — **Reflejo gráfico por sistema** (gato con babero / platito de propinas / máquina con vapor) es responsabilidad del render; la lógica solo expone niveles/tasas. → US-36 (lógica mínima: que `idle.*.level` sea visible al render).

### R10. Progresión de colores
```js
// CONFIG: PRODUCTS_PER_COLOR=3, MAX_COLORS=6
// colorsUnlocked = clamp(1 + floor(productsBought / PRODUCTS_PER_COLOR), 1, MAX_COLORS)
```
- `R10.1` — **+1 color por cada 3 productos del catálogo:**
  `products` 0-2→1, 3-5→2, 6-8→3, 9-11→4, 12-14→5, 15+→6 (tope 6). → US-37, US-16; §5 STYLE (6 colores).
- `R10.2` — **Los colores generados** (pool y pedidos) se eligen **solo entre los desbloqueados** `1..colorsUnlocked`. → US-37, US-3/4.
- `R10.3` — El tablero crece con la expansión (R6.2) para amortiguar la dificultad de más colores (cozy, sin timer). → US-38.

---

## 3. ESPECIFICACIÓN DE TESTS TDD (`test/rules.test.js`, node:test)

Convención: cada caso usa `createGame()` + `rng` con semilla fija (determinista). Se escriben **rojos** primero (falla) → implementación → verde. Formato: `test('R# name', () => { GIVEN…; WHEN…; THEN assert })`.

### Suite minimizada (`.js`)

```js
// rng determinista: mulberry32(seed)
import { createGame, CONFIG, placeStack, serveOrder, closeRun, openRun,
         buySkill, useDestroyPile, useSwapPiles, useRefreshPool, buyExpansion,
         buyIdleUpgrade, tickIdle, applyOffline, colorsUnlocked, orderReadyOn,
         generateBoard } from '../js/game.js';
const seed = n => mulberry32(n);
const pay = (q, m=0) => Math.round(5 * q ** (1.25 + 0.05*m));
```

### T1. Ciclo de partida / colocación
- `T1.1` — **pool 3 pilas al abrir:** GIVEN `openRun(state, rng(1))`; THEN `run.pool.length === 3` y `run.poolPlaced === 0`. [R3.1]
- `T1.2` — **colocar pila vacía slot y NO rellena:** GIVEN pool `[[1,1],[2],[3]]`, celda libre `c`; WHEN `placeStack(c, slot0)`; THEN `board[c].stack === [1,1]`, `pool[0] === []`, `pool.length === 3` (no se añadió pila), `poolPlaced === 1`. [R3.2]
- `T1.3` — **refill al colocar la 3ª:** GIVEN `poolPlaced===2` y pool `[[], [], [3]]`; WHEN colocar el slot 2; THEN `poolPlaced === 0` y `pool === [[…],[…],[…]]` (3 pilas nuevas, `length===3`). [R3.3]
- `T1.4` — **colocar en celda bloqueada → error, sin mutar:** GIVEN celda `blocked:true`; WHEN `placeStack`; THEN devuelve `{error}` y `pool`/`board` idénticos. [R3.5, R8.4]
- `T1.5` — **colocar en celda ya con piezas apila al tope:** GIVEN `stack:[2]`; WHEN colocar `[2,2]`; THEN `stack === [2,2,2]`. [R3.4, R4.2]

### T2. Pedidos / servir
- `T2.1` — **listo cuando tope color Y cantidad exacta:** GIVEN order `{color:2, qty:3}`, `stack:[2,2,2]`; THEN `orderReadyOn === true`. [R4.2]
- `T2.2` — **NO listo si cantidad difiere:** GIVEN order qty=3, `stack:[2,2]` → false; y `stack:[2,2,2,2]` → false. [R4.2]
- `T2.3` — **NO listo si color tope difiere:** GIVEN order color=2, `stack:[1,1,1]` (y `[2,2,1,1,1]` tope 1) → false. [R4.2]
- `T2.4` — **servir vacía la celda y marca served:** GIVEN order listo en celda `c`; WHEN `serveOrder`; THEN `board[c].stack === []`, `order.served === true`. [R4.3, R6→G1]
- `T2.5` — **servir si no está listo → error, no muta:** GIVEN `stack:[2,2]` para qty 3; WHEN serve; THEN `{error}`, `stack` intacto, `served===false`. [R4.4]

### T3. Cierres (3 condiciones)
- `T3.1` — **cierre ① tablero lleno sin poder colocar:** GIVEN run con 0 celdas libres no-bloqueadas y pool con pilas sin colocar y `!allServed`; WHEN intentar colocar / evaluar; THEN `closeRun('full')`, `run=null`, `totalGames+=1`. [R2.2]
- `T3.2` — **cierre ② todos atendidos (éxito):** GIVEN todos `orders.served===true`; THEN resolve a `closeRun('allServed')`. [R2.3]
- `T3.3` — **cierre ③ manual conserva dinero:** GIVEN run con `coins:120` activas; WHEN `closeRun('manual')`; THEN `run=null` y `coins` SÍ conserva las ganadas (no se descuenta). [R2.4]
- `T3.4` — **reabrir reinicia run pero conserva meta:** GIVEN tras cerrar; WHEN `openRun`; THEN `run.orders` nuevo, `progress.coins/totalGames/cafeLevel` intactos, y `totalGames === prev+1`. [R2.5]
- `T3.5` — **solo allServed es victoria:** GIVEN cierres `full`, `manual`, `allServed`; THEN flag `victory===true` SOLO en `allServed`. [R2.6]

### T4. Economía
- `T4.1` — **pago base por pedido:** GIVEN qty=2, multLevel 0; WHEN servir; THEN `coins += pay(2)` (12), y `coins −=` nada más. [R5.1]
- `T4.2` — **superlinealidad (4 > 2×2):** GIVEN mismo multLevel; THEN `pay(4)` (28) `>` `2*pay(2)` (24). [R5.2]
- `T4.3` — **multiplicador mejorable sube pago:** GIVEN multLevel 0→1; THEN `pay(q,1) > pay(q,0)` para q≥2, y `buyMultiplier` consume `100*(multLevel+1)` coins. [R5.2]
- `T4.4` — **bonus calamidades al cerrar:** GIVEN `run.calamities=6`; WHEN `closeRun`; THEN `coins += 6*15` (=90) y resultado expone `bonus===90`. [R5.3, R8.5]

### T5. Expansiones
- `T5.1` — **clients:** WHEN `buyExpansion('clients')` con saldo; THEN `clients+=1` y `coins` bajan el precio. [R6.1]
- `T5.2` — **board:** THEN `boardCells+=3`. [R6.2]
- `T5.3` — **products:** THEN `productsBought+=1` y `colorsUnlocked` se recalcula. [R6.3, R10.1]
- `T5.4` — **sin saldo → {error}, no muta:** GIVEN coins < precio; THEN `{error:'noFunds'}`, nada cambia. [R6.4]

### T6. Poderes / árbol
- `T6.1` — **desbloqueo por nivel (candado):** GIVEN cafeLevel 2; THEN `swapPiles`/`destroyPile` NO comprables (`{error:'locked'}`) y `refreshPool` sí. CONFIG: swap needs 3, destroy needs 5. [R7.1]
- `T6.2` — **comprar exige nivel+saldo:** GIVEN nivel 1 y coins 100; THEN `buySkill('destroyPile')` → `{error}`; tras `totalGames` suficientes y coins, `owned=true` y `uses=USES_PER_RUN`. [R7.1, R7.3]
- `T6.3` — **DESTROY PILE vacía pila:** GIVEN destructor owned, uses≥1, celda con `stack:[2,2,2]`; WHEN `useDestroyPile(c)`; THEN `stack===[]` y `uses-=1`. [R7.5]
- `T6.4` — **DESTROY PILE no afecta celda bloqueada:** THEN `{error}`, `uses` intacto. [R7.5, R8.4]
- `T6.5` — **SWAP PILES intercambia stacks:** GIVEN A:`[1,1]`, B:`[2]`; WHEN `useSwapPiles(A,B)`; THEN A:`[2]`, B:`[1,1]`, `uses-=1`. [R7.6]
- `T6.6` — **REFRESH POOL descarta y genera 3 nuevas:** GIVEN pool `[[1],[2],[3]]`; WHEN `useRefreshPool`; THEN `pool` son 3 pilas nuevas (aún sin colocar, `poolPlaced===0`), `uses-=1`. [R7.7]
- `T6.7` — **sin owned o sin usos → {error}:** GIVEN `owned:false` o `uses:0`; WHEN usar; THEN `{error}`, estado sin cambio. [R7.8]
- `T6.8` — **usos se reponen al reabrir:** GIVEN `uses:0` tras partida; WHEN `openRun`; THEN todos los `owned` tienen `uses===USES_PER_RUN`. [R7.4]

### T7. Calamidades
- `T7.1` — **solo si >15 hex:** GIVEN `boardCells 12/15` → `calamities===0`; GIVEN `boardCells 16` → `calamities>0`. [R8.1]
- `T7.2` — **cantidad en [lo,hi] y variable:** GIVEN n=21 (lo=ceil(21/5)=5, hi=floor(21/3)=7); THEN para muchas semillas, `count ∈ [5,7]` y al menos 2 valores distintos observados. [R8.2]
- `T7.3` — **≈50% pilas pre-colocadas / ≈50% bloqueadas:** GIVEN n=30; THEN el nº de `blocked:true` está en `[0.3,0.7]*count` y cada calamidad es blocked XOR tiene `stack.length ≥ 1` (calamityStack). [R8.3, R8.4]
- `T7.4` — **celda de calamidad con pila NO bloqueada pero pre-ocupada:** GIVEN calamityStack cell; THEN `stack.length≥1`, `blocked===false`, y `placeStack` aún posible sobre ella (apila encima). [R8.3, R3.4]

### T8. Idle / offline
- `T8.1` — **3 sistemas suman online:** GIVEN niveles 1/1/1, dt=10s; WHEN `tickIdle`; THEN `coins += (0.5+0.3+0.8)*10 = 16`. [R9.1, R9.2]
- `T8.2` — **offline con tope POR sistema:** GIVEN `lastSeenAt = now-100s`; niveles 1/1/1 (caps 60/100/40); THEN gains = `min(0.5*100,60)=50` + `min(0.3*100,100)=30` + `min(0.8*100,40)=40` ⇒ `coins += 120` y `offlineReport.machines===40` (saturado). [R9.3]
- `T8.3` — **subir mejora sube tasa Y tope:** GIVEN `buyIdleUpgrade('machines')` → nivel 2; THEN `ratePerSec=1.6`, `cap=80`; offline 100s → 80 (>40). [R9.4]
- `T8.4` — **un tope no frena a los demás:** GIVEN machines saturado a 40; THEN workers/fame siguen dando su min() hasta su propio tope (50/30 en T8.2). [R9.3]

### T9. Progresión de colores
- `T9.1` — **+1 color cada 3 productos:** THEN `colorsUnlocked(products)` = [1,1,1,2,2,2,3,3,3,4,…] para `products` 0..9, tope 6 a `products≥15`. [R10.1]
- `T9.2` — **solo colores desbloqueados en pool/orders:** GIVEN `colorsUnlocked=2`; THEN todas las piezas y pedidos generados tienen `color ∈ {1,2}`. [R10.2]
- `T9.3` — **tope 6:** GIVEN `colorsUnlocked` ya 6; THEN nunca genera `color>6`. [R10.1, §5]

### T10. Persistencia save/load
- `T10.1` — **roundtrip idéntico:** GIVEN state complejo (run activa + coins + idle); THEN `JSON.stringify(load(save(state))) === JSON.stringify(state)`. [R1.2]
- `T10.2` — **version≠1 → reset:** GIVEN blob `{version:99}`; THEN carga devuelve `createGame()`; no lanza. [R1.4]
- `T10.3` — **import válido reemplaza, inválido rechaza:** GIVEN blob con `version:1` + shape mínima → import OK y estado = blob; GIVEN `{}` sin version → `{error}`, save actual intacto. [R1.3]
- `T10.4` — **export id embebido:** GIVEN state; THEN `meta.exportId` no vacío y estable entre save/load. [R1.1, R1.3]

---

## 4. TRAZABILIDAD RESUMIDA (R → US/G)

| Regla | US | G |
|---|---|---|
| R1.1–R1.4 | 39,40,41 | G4 |
| R2.1–R2.6 | 1,8,9,10,21 | G1 |
| R3.1–R3.5 | 2,3,7 | G1 |
| R4.1–R4.5 | 4,5,6 | G1 |
| R5.1–R5.3 | 11,12,13,29 | G1 |
| R6.1–R6.4 | 14,15,16,38 | — |
| R7.1–R7.8 | 17-24 | — |
| R8.1–R8.5 | 25-29 | — |
| R9.1–R9.5 | 30-36 | — |
| R10.1–R10.3 | 16,37,38 | — |
| R11.1–R11.3 | 42,43 | G5,G7 |

> Nota de mantenimiento: cambiar mecánica actualiza PRIMERO `DESIGN_DECISIONS.md`, luego `SPEC.md`, y reflejar aquí (R1.x son los puntos más estables). Números de balance (R5/R6/R7/R9) son constantes `CONFIG` sustituibles sin romper el contrato.
