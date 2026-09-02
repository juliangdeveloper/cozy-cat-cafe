# RULES — Cozy Cat Café × HexaSort

**Fase:** ANALISTA / ARQUITECTO DE REGLAS (ciclo BMAD) · **Estado:** v2.0-draft (mecánica HexaSort merge) · **Idioma:** código-primero (JSON/pseudocódigo/asserts), sin párrafos de relleno.
**Fuentes (fuente de verdad):** `DESIGN_DECISIONS.md` (mecánica) · `SPEC.md` (US-1..43, G1-G7) · `STYLE_GUIDE.md` (solo presentación/feedback §4-8).
Fase v2: R12-R15 aprobadas por grill 2026-08-29; números marcados ⚖BALANCE pendientes de ajuste.
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
    "clients": 3,                      // nº gatos-cliente por partida (R6.1)
    "colorsUnlocked": 1,               // v2: derivado de compras directas de color (R13.7)
    "colorsOwned": 4,                  // v2: colores comprados por el jugador (R13.7, COLOR_PRICE)

    "econ": { "multLevel": 0 }         // multiplicador mejorable (R5.2)
  },

  "economy": {  // alias de lectura: multLevel → CONFIG (ver R5.2)
    "multLevel": 0
  },

  "skills": {                          // v2: catálogo ampliado (R15.1, R7)
    "destroyPile": { "owned": false, "uses": 0, "price": 250, "unlockLevel": 5 },
    "swapPiles":   { "owned": false, "uses": 0, "price": 120, "unlockLevel": 3 },
    "refreshPool": { "owned": false, "uses": 0, "price": 40,  "unlockLevel": 1 },
    "serveManual": { "owned": false, "autoServe": true },  // v2: toggle, sin usos (R15.2)
    "previewPool": { "owned": false, "level": 0 }          // v2: level 0..3 (R15.1)
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
>   "rosterIndex": 1,                   // v2: nº criaturas llegadas (R13.2/R13.4)
>   "placedCounter": 0,                 // v2: pilas colocadas en la run (R13.4, UNLOCK_PLACED_PILES)
>   "runTilesActivated": 0,             // v2: n, baldosas activadas esta partida (R14.3)
>   "permTiles": 0,                     // v2: m, techo permanente de activables, en progress (R14.2)
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
- `R3.1` — [v2.0] El **pool tiene 3 slots**. Cada slot es una pila de **tamaño 1..7** con **color POR FICHA** aleatorio en los desbloqueados (multicolor; el monocromo es un caso posible, no la regla). Se generan por `rng`. → US-2, G1.
- `R3.2` — **No se rellena hasta colocar las 3 actuales.** Al colocar una pila en una celda, ese slot se vacía y `poolPlaced += 1`. **NO se genera una pila nueva por slot.** → US-7.
- `R3.3` — **Refill:** cuando `poolPlaced === 3` (las 3 colocadas), el pool se **rellena de golpe con 3 pilas nuevas** y `poolPlaced = 0`. La única "bandeja vacía con borde punteado" persistente es el instante entre la 3ª colocación y el refill. → US-7; render §4.4 STYLE.
- `R3.4` — **Colocar** = tomar la pila del slot `kol` del pool y añadir sus piezas a la celda destino: `board[cell].stack = stack.concat(pile)`. **Válido solo si:** celda existe, `!blocked`, `!dormant` y la celda está VACÍA (`stack.length === 0`) — (v2.2: pilas del pool SOLO en espacios vacíos, error `occupied` en celda ocupada). → US-3.
- `R3.5` — **Invalid place** (`{error}`): celda bloqueada, celda inexistente, celda ocupada (`occupied`, v2.2), celda dormant, o pool vacío (slot ya colocado). No consume slot, no muta. → US-3.

### R4. Pedidos y servir
```js
// Sig.: topGroup(stack) -> { color, count }   // racha final de color igual
//       orderReadyOn(state, orderId) -> bool
//       serveOrder(state, orderId) -> newState | { error }
```
- `R4.1` — Cada **pedido** (gato) tiene `{color, qty}` y está **enlazado a una celda** (`order.cell`), una celda distinta por pedido. `cli = state.progress.clients` (R6.1). → US-4.
- `R4.2` — **Listo para servir** [v2]: Servible ⇔ existe al menos una celda con tope de color X y count ≥ qty de un pedido pendiente de color X (match determinista R15.2). La señal `--highlight` aplica a TODAS las celdas cuyo tope cumpla algún pedido pendiente. → US-5, G1; §5 STYLE.
- `R4.3` — **Servir** [v2]: Servir consume EXACTAMENTE qty fichas del tope (splice final); la celda NO se vacía completa — el excedente del tope queda arriba. `order.served = true` al cerrar el pedido. → US-6, G1.
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
- `R6.2` — **+celdas de tablero:** `buyExpansion('board')` gana `boardCells += 3` (costo `60*boardCells/3`). Más espacio. → US-15, US-38. [OBSOLETO v2 — reemplazado por R14]
- `R6.3` — **+catálogo/colores:** `buyExpansion('products')` gana `productsBought += 1` (costo `50*productsBought`); se recalcula `colorsUnlocked` (R10.1). Más dificultad/recompensa. → US-16. [OBSOLETO v2 — reemplazado por R13.7]
- `R6.4` — Toda expansión gasta `coins`; **no se puede comprar sin saldo** (devuelve `{error:'noFunds'}`, no muta). → US-14/15/16.

### R7. Árbol de habilidades y poderes
```js
// CONFIG: UNLOCK(power)= skills[power].unlockLevel ; PRICE(power)= skills[power].price
// USES_PER_RUN: destroyPile:3, swapPiles:3, refreshPool:2
```
- `R7.1` — **Nivel del café desbloquea nodos:** `destroyPile` requiere `cafeLevel≥5`, `swapPiles≥3`, `refreshPool≥1`. `cafeLevel = totalGames+1` (sube con nº de partidas, R2.5). En el árbol, un nodo con nivel insuficiente = **bloqueado** (candado, no clicable). → US-20, US-21.
- `R7.2` — **El nivel NO tiene reflejo visual en la escena**; solo se muestra en la UI del árbol (LV chip). La escena NO cambia por subir de nivel, solo cambia al **comprar** un poder (R7.3). → US-22.
- `R7.3` — **Compra (v2.3 = todo usos):** `buySkill(power)` exige `cafeLevel ≥ unlockLevel` Y `coins ≥ precio siguiente = price × 1.35^usesBought`. La 1ª compra desbloquea y **ES el 1er uso** (`usesBought: 0→1`, `owned=true`); recomprar = +1 uso por partida (acumulativo, sin tope). → US-17/18/19, US-23.
- `R7.4` — **Usos por partida (v2.3, sin base gratis):** `uses = usesBought` (0 si nunca compraste — la skill ni existe para la partida). `uses` decrementa al usar; **no puede usar si `uses===0`** ni si `!owned`. Al reabrir (`openRun`) **se reponen `uses = usesBought`**. Estado visible: badge "N uses/run" + botón de precio siguiente en tienda; el contador se refresca en vivo (también entre eslabones de cascada). **v2.4:** tope `MAX_USES_PER_SKILL=5` usos/partida por skill (destroyPile/swapPiles/refreshPool/queueSkip — 6ª compra `{error:'maxUses'}`); `tables` NO usa ese tope (su capa = celdas del tablero − 7). → US-24. [v2: solo aplica a skills modelo 'uses' — ver R15.1]
- `R7.5` — **DESTROY PILE** (más caro, `price=250`): `useDestroyPile(state, cellId)` — **vacía la pila de una celda** cualquiera (quita todo su `stack`, libera espacio), marca `uses -= 1`. Celda bloqueada (R8.4) no destruible. → US-17.
- `R7.6` — **SWAP PILES** (medio, `price=120`): `useSwapPiles(state, cellA, cellB)` — **intercambia los `stack` completos** de 2 celdas (o 1 pila de pool ↔ 1 celda). Marca `uses -= 1`. No toca bloqueadas. → US-18.
- `R7.7` — **REFRESH POOL** (barato, `price=40`): `useRefreshPool(state)` — **descarta el pool actual y genera otras 3 pilas** nuevas (no gasta colocaciones) con `rng`. Marca `uses -= 1`, `poolPlaced=0`. **v2.4 FIX:** genera EXACTAMENTE como `openRun` — `v2Pile` multicolor con `poolMaxColor(rosterIndex, colorsOwned)` (antes usaba `pile(colorsUnlocked)` v1 => monocolor). → US-19.

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
- `R8.1` — **Solo entran si `boardCells > 15`.** A 15 o menos, `calamities = 0`. → US-25. [v2: ver R14.5 — se evalúa sobre jugables]
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
- `R9.4` — **Subir mejora sube tasa Y tope (v2.1):** `buyIdleUpgrade(system)` gana `level+=1` (costo `IDLE_PRICE × (level+1)²` — 1ª compra 50 con level 0), subiendo `ratePerSec` y `cap`. **El café arranca VACÍO** (v2.1: idle level 0, income 0) — todo el decor/idle se compra en la tienda. → US-35.
- `R9.5` — **Reflejo gráfico por sistema** (gato con babero / platito de propinas / máquina con vapor) es responsabilidad del render; la lógica solo expone niveles/tasas. → US-36 (lógica mínima: que `idle.*.level` sea visible al render).

### R10. Progresión de colores
```js
// CONFIG: PRODUCTS_PER_COLOR=3, MAX_COLORS=6
// colorsUnlocked = clamp(1 + floor(productsBought / PRODUCTS_PER_COLOR), 1, MAX_COLORS)
```
- `R10.1` — **+1 color por cada 3 productos del catálogo:**
  `products` 0-2→1, 3-5→2, 6-8→3, 9-11→4, 12-14→5, 15+→6 (tope 6). → US-37, US-16; §5 STYLE (6 colores). [OBSOLETO v2 — reemplazado por R13.7]
- `R10.2` — **Los colores generados** (pool y pedidos) se eligen **solo entre los desbloqueados** `1..colorsUnlocked`. → US-37, US-3/4.
- `R10.3` — El tablero crece con la expansión (R6.2) para amortiguar la dificultad de más colores (cozy, sin timer). → US-38. [OBSOLETO v2 — reemplazado por R13.7]

### R12. Merge y cascada (estilo HexaSort) [v2]
- `R12.1` — **Merge HEXASORT ORIGINAL (v3):** tras toda colocación, barrido GLOBAL: grupos contiguos (BFS, HEX_ADJ) de celdas con el MISMO color de tope y tamaño ≥2 se fusionan. En cada eslabón el destino lo elige `computeBestChain` (T1: mejor secuencia simulada, profundidad 6, cap 20000 nodos) o, si no hay paso aplicable, R2: el candidato que deja MÁS aristas encadenables post-merge. **Tie-break R2 (v2.2.1):** preferir candidato que SÍ haya recibido fichas en esta cascada (último receptor, fiel al `mergeTarget` del original) → torre más baja → menor índice. Las FUENTES ceden solo su racha de tope (run contiguo del mismo color) y conservan su sub-pila real — sin ficha de reserva.
- `R12.2` — **CASCADA (v3):** tras toda mutación de topes (colocar, auto-servir, destrucción umbral, swap) re-evaluar hasta estabilizar; UN grupo por eslabón (paso visible al jugador); 1 eslabón = `CASCADE_STEP_MS=600ms` (CONFIG, v2.2.1 — antes 1600). Orden por eslabón: merge (grupo completo, multi-fuente) → auto-servir (ids ascendentes) → destrucción umbral → siguiente eslabón.
- `R12.3` — **UMBRAL:** grupo contiguo ≥ `DEBRIS_THRESHOLD=10` fichas (CONFIG) se destruye al estabilizar, bonus `DEBRIS_BONUS_PER=25` × qty (CONFIG ⚖BALANCE).
- `R12.4` — destroyPile queda **PENDIENTE DE BALANCE** (pierde valor relativo frente a R12.3).

### R13. Clientes-criaturas y progresión de run [v2] (modifica R4.1, R6.1)
- `R13.1` — Pedidos FLOTAN: `{color, qty}` sin celda anclada. Servible desde cualquier celda cuyo tope cumpla. Subsumidos en auto-servir R15.2; R4.2/R4.3 reescritos en v2.
- `R13.2` — 10 criaturas, una por color, cada una solo pide SU color. Roster: 1 Gato anfitrión, 2-4 fantásticas (zorrito, rana, dragoncito), 5-8 robots (barredor, barista, repartidor, DJ), 9-10 humanos andróginos (gemelos). Llegada = orden de desbloqueo 1→10.
- `R13.3` — Arranque de run [v2.1]: 5 tipos activos (rosterIndex=5) + pool solo genera `1..colorsOwned` + núcleo 2-3-2 jugable. Los 3 primeros clientes son los VISIBLES (R16.4).
- `R13.4` — Desbloqueo: cada `UNLOCK_PLACED_PILES=3` pilas colocadas (CONFIG) → siguiente color: llega su criatura y el pool lo genera con probabilidad UNIFORME entre desbloqueados.
- `R13.5` — Presión de compra [v2.1]: el roster avanza 1 color cada UNLOCK_PLACED_PILES pilas hasta `rosterMax = colorsOwned < 10 ? colorsOwned+1 : 10`. El pool SOLO genera `1..colorsOwned` → el color sobre el techo NUNCA se genera en pool: para servir a esos clientes hay que comprar colores. Con 10 comprados, rosterMax=10 (sin +1).
- `R13.6` — Victoria [v2.1 → R16.4]: servir a TODOS los clientes de la cola (`clientsServed === totalClients`). R2.2/R2.4 sin cambio.
- `R13.7` — Colores: 10 máx, 4 de inicio. Compra DIRECTA en tienda: `buyColor` desbloquea el siguiente color del roster; precio `COLOR_PRICE(n) = COLOR_PRICE_BASE * (n-3)` CONFIG ⚖BALANCE. R10 queda REPLANTEADA: `productsBought`/catálogo se ELIMINA del state (§1); `colorsUnlocked`/`colorsOwned` pasa a derivarse de compras directas. R10.2 (solo colores desbloqueados se generan) se mantiene como principio. R10.1/R10.3 y R6.3 quedan marcadas OBSOLETAS-v2 (reemplazadas por R13.7).

### R14. Tablero dual rectangular 8×4 pointy 32 [v2.2] (modifica R6.2, R8)
- `R14.1` — Tablero SIEMPRE dibujado completo: RECTÁNGULO pointy de 4 filas axiales × 8 celdas = 32 (v2.2, contorno rectangular tipo marco de Catan con offset de panal; en columna plegada `q+floor(r/2)` las 4 filas comparten patrón consecutivo). No jugable = visible apagada (estilo lock). (v2.0/v2.1: panal [7,9,9,7], reemplazado.)
- `R14.2` — Jugable al inicio = núcleo 2-3-2 (7). [v2.2] La capacidad de activar por partida la da la skill `tables` (modelo USES, R14.3); `permTiles` queda como contador histórico de compras. [v2] R6.2 (`boardCells += 3`) queda OBSOLETA.
- `R14.3` — [v2.3] Activate por USOS: skill `tables` (modelo USES R7.4) — **cero base gratis**; cada uso/partida se compra con `buyTablesUp` (que además sube el techo permTiles); `openRun` repone `uses = usesBought`. Tocar baldosa apagada consume 1 uso y la activa ESA partida. SIN costo de monedas por activación (`runTilePrice ≡ 0`; RUN_TILE_BASE OBSOLETO-v2.2).
- `R14.4` — [v2.2] Compra permanente en TIENDA (`buyTablesUp`, fila "Tables per run"): `permTilePrice = TABLES_PERM_BASE(200) × 1.35^permTiles` ⚖BALANCE → `permTiles += 1` (techo histórico) Y `skills.tables.usesBought += 1` (+1 mesa activable por partida; se repone en cada openRun). La 1ª compra marca `tables.owned`. NO activa ninguna celda (la activación es siempre temporal). **v2.4:** techo = `celdas del tablero − 7` (25 con 32); alcanzar el tope ⇒ `{error:'maxUses'}`.
- `R14.5` — Calamidades (R8): rango se calcula sobre celdas JUGABLES, no sobre 32. [v2] R8.1 se reinterpreta: calamidades entran cuando las celdas JUGABLES (núcleo 7 + activadas) > 15. El rango lo/hi se calcula sobre jugables, no sobre 32. → US-53.

### R15. Skills v2 [v2] (amplía R7)
- `R15.1` — Catálogo: destroyPile="Saltar a la barra", swapPiles="Mesero ágil", refreshPool="Envío de la cocina", serveManual="Modo mesero" (toggle autoServe, sin usos), previewPool="Pizarra de tiza" (levels 0-3: muestra próximas 1/2/3 tandas del pool; se sube recomprando; unlock cafeLevel 2 ⚖BALANCE). [v2] R7.4 se reescribe: cada skill declara su MODELO — 'uses' (destroyPile/swapPiles/refreshPool: se reponen al reabrir, R7.4 original aplica solo a ellos), 'toggle' (serveManual: owned bool + autoServe bool, sin usos), 'levels' (previewPool: level 0..3, subir = recomprar, sin usos).
- `R15.2` — R4 redefinido [v2.1: solo clientes VISIBLES (activeClients, máx 3) son servibles — auto o manual]: AUTO-SERVIR por defecto; al estabilizar cada eslabón, para cada pedido pendiente elegir tope válido (si varios: count más cercano a qty sin exceder; si no hay, el menor disponible) → paga `pay(order)`, consume exactamente qty del tope, excedente queda. serveManual.off = modo v1 (brilla `--highlight`, servir tocando).
- `R15.3` — Pedido render: ítem dibujado (taza/pastel) construido con fichas del color; mecánicamente fichas del color.

### R16. Cola de clientes [v2.1]
- `R16.1` — TOTAL_CLIENTS = 20 + skills.capacidad.level (CONFIG MIN_CLIENTS=20, MAX_CLIENTS=100; capacidad max level 80). ⚖BALANCE
- `R16.2` — Los clientes son pedidos flotantes `{id, color, qty 2-4, served}`. El roster define tipos disponibles: `rosterMax = colorsOwned < 10 ? colorsOwned+1 : 10` (R13.5).
- `R16.3` — Llegada PEREZOSA: la cola NO se pre-genera; al servir un visible se dibuja el siguiente (`drawClient`, uniforme 1..rosterIndex). Contadores `clientsDrawn` / `clientsServed`; `queueBack` FIFO se consume antes de dibujar nuevos.
- `R16.4` — VISIBLES = 3 (`activeClients`): solo ellos son servibles (auto o manual). Al servir uno entra el siguiente si `clientsDrawn < TOTAL_CLIENTS`. Victoria ⇔ `clientsServed === TOTAL_CLIENTS` (`runVictory`). Al final de la cola los visibles se agotan 3→2→1→0 (no sobre-dibujar).
- `R16.5` — Sin timer de paciencia (cozy).

### R17. Skills de cola y mejoras de usos [v2.1]
- `R17.1` — **queueSkip "Enviar a la cola"** (modelo uses, USES_PER_RUN.queueSkip=2, unlock cafeLevel 1): los 3 visibles vuelven al fondo de la cola (queueBack) y entran 3 nuevos. `{error}` si !owned o uses===0.
- `R17.2` — **Mejora de usos**: cada skill modelo uses puede subir +1 uso por partida: `buyUsesUp`, precio `USES_UP_BASE × USES_UP_RATIO^usesBought` (CONFIG 60, 1.6 ⚖BALANCE). openRun: `uses = USES_PER_RUN + usesBought`. Sin tope.
- `R17.3` — **capacidad** (modelo levels): `CAP_PRICE_BASE × CAP_RATIO^level` (CONFIG 120, 1.35 ⚖BALANCE), max 80. TOTAL efectivo = 20 + level.

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
- `T1.5` — **v2.2 colocar en celda ocupada → `occupied` sin mutar:** GIVEN `stack:[2]`; WHEN colocar; THEN `{error:'occupied'}` y estado idéntico. [R3.5]

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
- `T6.2` — **comprar exige nivel+saldo (v2.3):** GIVEN nivel 1 y coins 100; THEN `buySkill('destroyPile')` → `{error}`; tras `totalGames` suficientes y coins, `owned=true` y `uses=usesBought=1` (la compra ES el 1er uso); recompra = +1 uso con precio `price×1.35^usesBought`. [R7.1, R7.3]
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
- `T8.1` — **v2.1 café vacío + 3 sistemas comprados suman online:** GIVEN idle 0/0/0; `tickIdle` → income 0. Tras comprar las 3 mejoras (niveles 1/1/1) y dt=10s: `coins += (0.5+0.3+0.8)*10 = 16`. [R9.1, R9.2, R9.4]
- `T8.2` — **offline con tope POR sistema:** GIVEN `lastSeenAt = now-100s`; niveles 1/1/1 (caps 60/100/40); THEN gains = `min(0.5*100,60)=50` + `min(0.3*100,100)=30` + `min(0.8*100,40)=40` ⇒ `coins += 120` y `offlineReport.machines===40` (saturado). [R9.3]
- `T8.3` — **v2.1 subir mejora sube tasa Y tope desde level 0:** GIVEN idle machines level 0; `buyIdleUpgrade` → nivel 1 (`ratePerSec=0.8`, `cap=40`); 2ª compra cuesta `50×2²=200`. [R9.4]
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

### T11. Merge y cascada [v2]
- `T11.1` — **merge v3 multi-fuente:** GIVEN celdas contiguas A=[2,2] y B=[2] (torres con tope 2); WHEN la cascada resuelve el grupo; THEN un candidato se lleva AMBAS rachas (multi-fuente) y las fuentes conservan su sub-pila (ceden solo el run del tope). [R12.1]
- `T11.2` — **no merge si color difiere:** GIVEN vecinos con tope color ≠ tope destino; WHEN colocar; THEN stacks de vecinos intactos. [R12.1]
- `T11.3` — **orden determinista de eslabón:** GIVEN una colocación que dispara merge + pedidos servibles + grupo ≥ umbral; THEN al estabilizar el eslabón se ejecuta en orden: merge → auto-servir (ids ascendentes) → destrucción umbral; nunca antes. [R12.2]
- `T11.4` — **cascada itera hasta estabilizar:** GIVEN merge que deja un nuevo tope servible; THEN se evalúa el siguiente eslabón tras `CASCADE_STEP_MS` y la cascada termina solo sin mutaciones pendientes. [R12.2]
- `T11.5` — **umbral 10 destruye y bonifica:** GIVEN grupo contiguo de 10 fichas; WHEN estabiliza; THEN grupo destruido y `coins += DEBRIS_BONUS_PER*qty` (25×qty). GIVEN grupo de 9; THEN no se destruye. [R12.3]
- `T11.6` — **swap dispara cascada:** GIVEN `useSwapPiles` que alinea topes; THEN cascada se re-evalúa igual que en colocación. [R12.2]

### T12. Clientes-criaturas y progresión [v2]
- `T12.1` — **desbloqueo cada 3 pilas:** GIVEN `placedCounter` 0→3; WHEN colocar la 3ª pila; THEN `rosterIndex += 1` (llega criatura del siguiente color) y `placedCounter` se resetea. [R13.4]
- `T12.2` — **techo roster > colorsOwned:** GIVEN `colorsOwned=4`; WHEN roster avanza; THEN puede llegar a color 5 (una unidad por encima) pero no más; requires compra para seguir. [R13.5]
- `T12.3` — **pool uniforme entre desbloqueados:** GIVEN colores desbloqueados {1,2,3}; THEN el pool genera cada color con probabilidad uniforme (muchas semillas → frecuencias ≈ iguales). [R13.4]
- `T12.4` — **pedidos flotan, servibles desde cualquier celda:** GIVEN pedido {color:2, qty:3} sin `cell` y dos celdas con tope [2,2,2]; THEN auto-serve (o toque en v1) sirve desde cualquiera de las dos. [R13.1, R15.2]
- `T12.5` — **cada criatura pide solo su color:** GIVEN roster de 3 criaturas; THEN los pedidos generados tienen color ∈ {1,2,3}, uno por criatura. [R13.2]
- `T12.6` — **arranque de run:** GIVEN `openRun`; THEN `rosterIndex===1` (solo Gato), pool genera solo color 1, y solo el núcleo 2-3-2 (7 celdas) es jugable. [R13.3, R14.2]

### T13. Tablero dual rectangular 8×4 32 [v2.2]
- `T13.1` — **tablero fijo 32 celdas:** GIVEN `generateBoard`; THEN 32 celdas en RECTÁNGULO pointy 4 filas × 8 (v2.2; axial, columnas plegadas consecutivas compartidas), todas presentes en `board` (no jugables con flag lock). [R14.1]
- `T13.2` — **[v2.2] activate sin usos → noUses:** GIVEN `skills.tables.uses===0`; WHEN activar una baldosa apagada; THEN `{error:'noUses'}` y nada cambia. [R14.3]
- `T13.3` — **[v2.2] activar consume 1 uso, sin coins:** GIVEN `skills.tables.uses===2`; WHEN activar; THEN `uses===1`, `runTilesActivated+1`, coins sin cambio (`runTilePrice ≡ 0`). [R14.3]
- `T13.4` — **precio exponencial m (buyTablesUp):** GIVEN `permTiles=2`; THEN `permTilePrice = TABLES_PERM_BASE(200) × 1.35^2`; comprar sube permTiles Y usesBought. [R14.4]
- `T13.5` — **permanente habilita techo, activación es temporal:** GIVEN compra permanente de baldosa B; THEN `permTiles += 1` y B sigue apagada al abrir la siguiente run (solo activable temporalmente). [R14.4]
- `T13.6` — **calamidades sobre jugables:** GIVEN tablero 32 con 23 jugables; THEN el rango de calamidades se calcula sobre 23 (jugables), no sobre 32. [R14.5, R8.2]

### T14. Auto-servir [v2]
- `T14.1` — **consume qty exacta, excedente queda:** GIVEN pedido {color:2, qty:3} y tope [2,2,2,2]; WHEN auto-servir; THEN se consumen 3 fichas, el tope queda [2], `pay(order)` cobrado. [R15.2]
- `T14.2` — **elección de tope más cercano a qty sin exceder:** GIVEN pedidos {qty:3} y topes de color 2 con counts 3, 5, 2 en distintas celdas; THEN elige count=3 (más cercano sin exceder); si solo hubiera 2 y 5, elige 2 (el menor disponible). [R15.2]
- `T14.3` — **varios pedidos en orden de id ascendente:** GIVEN 2 pedidos pendientes servibles en el mismo eslabón (ids ord-0 < ord-5); THEN se sirven ord-0 primero. [R15.2, R12.2]
- `T14.4` — **destrucción umbral en cascada tras auto-servir:** GIVEN eslabón donde auto-serve fusiona un grupo a ≥10; THEN la destrucción umbral se evalúa después de servir, en el mismo eslabón. [R12.2, R12.3]

### T15. Skills v2 catálogo [v2]
- `T15.1` — **serveManual toggle:** GIVEN serveManual owned; WHEN toggle; THEN `autoServe` alterna y en `off` el pedido brilla `--highlight` y solo se sirve tocando (modo v1, R4.2/R4.3). [R15.2]
- `T15.2` — **serveManual sin usos:** GIVEN serveManual owned con `uses` indefinido; WHEN toggle; THEN NO consulta ni decrementa `uses` (a diferencia de R7.4). [R15.1, R7.4 ⚠]
- `T15.3` — **preview levels 0-3:** GIVEN `previewPool.level = k`; THEN el render muestra las próximas k tandas del pool; k=0 no muestra nada. [R15.1]
- `T15.4` — **preview se sube recomprando:** GIVEN `previewPool.level=1`; WHEN recomprar; THEN `level=2` y coins bajan el precio; no interfiere con `uses`. [R15.1]
- `T15.5` — **preview unlock cafeLevel 2:** GIVEN cafeLevel<2; THEN comprar previewPool → `{error:'locked'}`. [R15.1]
- `T15.6` — **nombres de catálogo v2:** GIVEN estado inicial; THEN skills expone destroyPile/swapPiles/refreshPool + serveManual + previewPool (5 nodos). [R15.1, §1]

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
| R12.1–R12.4 | 44,45,46 (US-nuevos v2) | G1 |
| R13.1–R13.7 | 44,47,48,49,50 (US-nuevos v2) | G1 |
| R14.1–R14.5 | 51,52,53 (US-nuevos v2) | — |
| R15.1–R15.3 | 54,55,56 (US-nuevos v2) | — |

> Nota de mantenimiento: cambiar mecánica actualiza PRIMERO `DESIGN_DECISIONS.md`, luego `SPEC.md`, y reflejar aquí (R1.x son los puntos más estables). Números de balance (R5/R6/R7/R9) son constantes `CONFIG` sustituibles sin romper el contrato.
