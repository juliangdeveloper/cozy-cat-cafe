# Cozy Cat Café × HexaSort — Shared Understanding (post-grill)

## v2.22.2 — auto-servir siempre; la pizarra se ve

Waiter / `serveManual` / Modo mesero **no es un skill**. No hay botón, no hay precio, no hay hold que lo explique, no hay toggle de auto-serve. Cuando un tope coincide con la cantidad de un pedido visible, la cascada **siempre** lo sirve.

La fila de skills queda en nueve: Destroy, Swap, Refresh, Tables, Unlock, Queue, Board, Color, Tips.

**Board (pizarra).** Un hold sigue abriendo la frase corta. Un toque lo usa: cobra el siguiente nivel (hasta 3) y abre un modal con las próximas tandas del pool, pilas reales. Si ya está al máximo, el toque vuelve a abrir ese modal sin cobrar. Cerrar es el botón o un toque fuera.

**Color.** Comprar el siguiente color no es un “new color” mudo. El toast nombra la criatura y el número, con una ficha del color: `Unlocked: Frog (color 3)`.

## v2.22.1 — una sola tira de cromo

La fila de estado (monedas, calamidad, invitados, mute, guardar) y la banda de abajo (rotar 90°, hold 3s para reiniciar) son **una sola tira**, en la cabecera. No hay dos bandas a todo el ancho. En ~390px la tira no parte en dos filas: la barra de calamidad cede ancho y cada control sigue siendo un objetivo de ≥40px. El pie de versión se queda. La economía de skills (dos filas, pago por uso, sin tienda) y la meta efímera no cambian.

El puñado de la bolsita, inicial y de recarga, pasa de 6..14 a **7..18** (`BAG_INITIAL_MIN/MAX` y `BAG_RELOAD_MIN/MAX`).

Los skills son **solo icono**, con el próximo precio en monedas debajo. Un toque corto los usa igual que antes. Un hold de **500ms** abre un modal de una frase en inglés; se cierra tocando fuera o en Close. Ese hold no gasta monedas. El hold largo de Tables que activaba una corona queda fuera del botón para que el gesto no explique y cobre a la vez; abrir una mesa sigue siendo el toque corto.

## v2.22.0 — skills de pago por uso, sin tienda

La tienda (carrito, modal, sección “This café only”) desaparece. Lo que se compraba ahí vive en la barra de poderes, en **dos filas de cinco**. Cada uso cobra monedas y el siguiente precio es `SKILL_USE_BASE × SKILL_USE_RATIOⁿ` = **40 × 1.6ⁿ**, la misma curva que las mesas (`RUN_TILE_BASE` / `RUN_TILE_RATIO`). `n` son los usos ya pagados en esta run y vuelve a 0 al reiniciar. No hay badge de “usos restantes” ni gate por `unlockLevel`: el botón se apaga solo si no alcanza para el siguiente precio.

- **Fila (v2.22.0, antes de quitar Waiter):** Destroy, Swap, Refresh, Tables, Unlock, Queue, Board (pizarra, tope 3 tandas), Color (tope 10), Tips (tope `MULT_MAX` = 6, porque el exponente de `pay()` no tiene otro freno). Waiter salió en v2.22.2: auto-servir no se compra ni se apaga.
- **No entran como skills:** idle (Barista / Fame / máquinas) — la UI ya no lo vendía y el offline sigue en 0. Capacidad sigue retirada (N = 100). Expansiones de tablero / menú ya estaban fuera de la tienda.
- **Cabecera:** una sola fila — monedas, icono+barra de calamidad, invitados (`57/100`), mute y guardar. El pie de versión se queda.
- **Meta:** igual que v2.21. El reinicio tira monedas, precios y colores. Solo el mute persiste.

## v2.21 (2026-10-06) — una pantalla, meta efímera

Julian, en la llamada de voz de ese día. La economía de mesas de v2.20.0 no se toca: activar sigue costando `40 × 1.6ⁿ` monedas en la run y se resetea al reabrir. No hay tienda permanente de mesas.

- **Una sola pantalla.** No hay menú ni botón Open Shop. Al cargar, el café ya está en juego. El audio sigue esperando un gesto (autoplay): la primera interacción arranca el loop, con la misma sensación de “la música entra cuando se abre la run”.
- **El hold de 3s reinicia.** El mismo control que cerraba el café ahora reinicia la run. La transición es corta y con peso (el tablero se apaga, las monedas caen a 0 con un tic seco). El café queda vacío, listo para el primer pedido. **Solo el mute sobrevive** (`cozy-cat-cafe.audio.mute`). Nada más.
- **Meta efímera.** No pasan monedas, skills, colores comprados, capacidad ni idle de una run a la otra. Lo que se compra a mitad de run se paga con el dinero de esa run y se pierde al reiniciar. `unlockLevel` / nivel de café ya no gatean nada: todo lo que se puede comprar se gatea solo por precio. **Capacidad se retira**: N es 100 fijo, comprarla no cambia la cola. El idle online sigue existiendo en la lógica si se invoca, pero la UI no lo vende y **el offline no acumula** (`applyOffline` devuelve 0). Elección de guardado: la run en curso de v2.21 (`settings.epoch === 21`) se recarga para que un refresh no corte el café; un reinicio la tira. Un save viejo (sin epoch) carga sin romperse y **se descarta** — no devuelve la meta permanente.
- **N = 100.** `TOTAL_CLIENTS` es 100. Sustituye el dial `MAX_CLIENTS = 60`.
- **Pedidos.** Base 3 del color del cliente, rampa hacia 10 a lo largo de la run. 5 y 8 salen desde el principio. Legendario de 10: uno por color, desde el inicio, ~1 cada 10 clientes normales, tope uno por color. Los diales están en `CONFIG` (`ORDER_QTY_*`, `ORDER_LEGENDARY_*`).
- **Calamidades.** La primera oleada no cambia: una vez, la primera vez que las mesas jugables (no dormant, no blocked) pasan de 15, al momento, count en `[ceil(p/5), max(floor(p/3), lo)]`, mismos tres tipos (pila oculta en dormant, 50% candado con pila oculta que Unlock revela, 50% pila ya puesta encima). **Segunda oleada** cuando quedan ~20 clientes (`CALAMITY_WAVE2_REMAINING`), mismos tipos y mismo rango, una vez por run. Una barra arriba muestra lo cerca que está la **próxima** oleada: la 1 sigue jugables hacia 16; la 2 sigue clientes servidos hacia ese punto de “quedan ~20”. El mismo elemento sirve para las dos. El icono marca la oleada que viene (I / II). Tocarlo abre una línea por tipo más la misma barra; se cierra tocando fuera o el botón. El bonus al ganar sigue siendo **15 por calamidad** (las dos oleadas suman en `run.calamities`). En el reinicio ese dinero no se guarda.
- **Victoria.** Servir los 100: las mesas se vacían en cascada con un sonido de cierre, las luces bajan y aparece el gato anfitrión con una frase. No hay pantalla de victoria pesada. Después se puede reiniciar con el hold, **o tocando el velo** (eso abre otra run al momento). Un tablero lleno o un reinicio son la pérdida informal: **no hay pantalla de “perdiste”.**
- **Se queda igual:** merge hex, auto-servir, bandeja de 3, tablero 6×6 y rotación que remailla (pointy a 0/180, flat-top a 90/270; las pilas de la bandeja siguen pointy), los 5 poderes más queueSkip y Unlock, el set de calamidades, Hybrid Sunlatte, silencio al perder foco, el sonido y el bonus de destruir 10+, Warm Vintage, y el precio de mesa por run.

Concepto: incremental + sorting de hex. "Abrir la tienda" = una partida.
Proyecto nuevo HTML/JS desplegable (pipeline BMAD + gate). Idioma: **inglés**.
Estética: a definir en fase de implementación (foco jugabilidad primero).
## v2 (2026-08-29): mecánica HexaSort merge — grill completo con Julian.

## Bucle de partida
- Partida = **abrir el café**. Sirves gatos-clientes con pedidos: juntar en una celda un
  grupo cuyo **tope es el color pedido** y con **la cantidad pedida** (gato "3×rojo" → apilas 3 rojos).
- El **pool muestra 3 pilas** (traídas por gatos trabajadores = ingredientes); **no se rellena
  hasta que colocas esas 3** en el tablero.
- **Servir = la celda se vacía** (las piezas van al cliente, liberas espacio).
- **La partida se cierra por 2 condiciones:** ① tablero lleno sin poder colocar más pilas,
  ② atendiste a **todos** los gatos. También se puede **cerrar cuando quieras** y conservar
  el dinero ganado hasta ese punto; reabrir reinicia.
- Pool de 3 pilas monocromas; refill de golpe al colocar las 3 (sin cambio v1).
- Colocar una pila FUSIONA los topes de vecinos del mismo color con el tope de la celda destino (estilo HexaSort). Grupo = fichas contiguas, sin superpiezas.
- AUTO-SERVIR siempre: cuando un tope alcanza la cantidad pedida, el pedido se sirve solo (paga, consume exactamente la cantidad, excedente queda). Pedidos FLOTAN: no anclados a celda. No hay skill que lo apague (v2.22.2).
- Cascada lenta encadenada (1600ms/eslabón) tras toda mutación de topes, hasta estabilizar. Grupos ≥10 se destruyen con bonus de monedas.
- Tocar un cliente y luego una pila sigue sirviendo ese pedido. No sustituye al auto-serve: un tope que ya coincide se sirve solo.

## Dinero / economía (incremental)
- **Pago base por pedido** + **multiplicador mejorable que premia pedidos grandes**
  (apilar 4 de una vez > 2 pedidos de 2; más difícil → más pago) + **bonus por calamidades** al cerrar.
- El dinero **expande el café**: más clientes (N), más celdas de tablero, más catálogo/colores.
- Una sola economía de baldosas, TEMPORAL por partida: precio exponencial ×1.6 por baldosa activada en la run. Activar mesas/baldosas se resetea entero entre partidas (precio, contador y baldosas activadas). La tienda permanente de baldosas (×1.35, y el dial posterior `TABLES_PERM_BASE × 1.25^permTiles` / `buyTablesUp` como techo) fue retirada (Julian, 2026-10-06).
- Compra de COLORES en la tienda: 4 de inicio → 10 máx. El roster de la partida avanza 1 color por encima del techo comprado: completar la partida exige comprar colores.
- Umbral de destrucción ≥10: bonus fijo (25×qty, CONFIG).

## Poderes comprables (5, en el café) — orden de precio
1. **Saltar a la barra** (destruir pila)
2. **Mesero ágil** (intercambiar pilas)
3. **Envío de la cocina** (refresh pool)
4. **Pizarra de tiza** (preview 1-3 tandas siguientes; niveles 1-3 recomprando; al usarla se ven las pilas en un modal) — precio ⚖BALANCE

Se compran como **mejoras en un árbol de habilidades del café**, muy simple y fácil de entender,
desbloqueadas por **nivel del café** (sube con el número de partidas jugadas). El nivel
**NO** tiene reflejo visual; **solo las mejoras compradas** sí (cada una con su mejora gráfica en la escena).

## Calamidades (tablero > 15 hexágonos)
- Al abrir el café entran **entre 1/3 y 1/5 del tamaño del tablero** como calamidades:
  algunas baldosas ya vienen con **pilas aleatorias**, otras **bloqueadas**.
- Cantidad variable (a veces más, a veces menos) para que cada partida sea distinta.
- **Bonus al cerrar el café según la cantidad de calamidades.**

## Idle / offline
- Sistemas de generación pasiva: **empleados-gatos**, **fama/propinas**, **máquinas automáticas**.
  Todos generan pasivo a la vez.
- **Offline con tope de almacenamiento** (idle clásico): subir mejoras sube la tasa y el tope.
- **Cada sistema tiene su mejora gráfica visible en el café** (no solo un número que sube).

## Progresión de colores
- 10 colores, 4 de inicio. Cada 3 pilas colocadas se desbloquea el siguiente color: llega su criatura-cliente y el pool empieza a generarlo (uniforme).
- Clientes = 10 criaturas, UNA por color, cada una solo pide SU color. Roster: 1 Gato anfitrión; zorrito, rana, dragoncito (fantásticas); 4 robots (barredor, barista, repartidor, DJ); 2 humanos andróginos gemelos. Llegada = orden 1→10.
- Arranque de run: 1 criatura + pool de 1 color + núcleo 2-3-2 del tablero. Victoria = servir a todas las criaturas que llegaron.

## Alcance
- Juego nuevo HTML/JS desplegable (como los otros juegos del perfil).
- Tablero SIEMPRE dibujado completo (panal con picos filas [7,9,9,7] = 32 baldosas, v2-shape; antes panal 5×6 = 30); jugable = núcleo 2-3-2 + las baldosas activadas en esa partida (no hay techo de compras permanentes); no jugable se ve apagada.
- Calamidades se recalculan sobre celdas jugables.

## v2.1 — Cola de clientes (2026-08-30)
- **Por partida: 20 clientes** (+1 por nivel del skill Capacidad, tope 100). Tipos = las 10 criaturas (1/color), activos = `colorsOwned+1` (con 10 comprados, 10).
- **Llegada perezosa**: se ven 3 clientes a la vez; al servir uno entra el siguiente. La cola no se pre-genera.
- **Presión de compra**: el pool solo genera colores comprados; los clientes piden colores del roster activo (siempre ≥ comprados+1 mientras queden colores por comprar) → sin comprar colores NO puedes servir a todos → cierre manual.
- **Skills**: "Enviar a la cola" (queueSkip: los 3 visibles vuelven al fondo, entran 3 nuevos), "Capacidad" (+1 cliente por nivel), y **mejora de usos** por skill (+1 uso/partida, precio exponencial).
- Victoria = servir TODOS los clientes de la partida.

- Diferido a implementación: assets (criaturas, ítems de pedido, fichas ×10 colores). El render final definirá la lista de assets necesarios y luego se reorganiza la UI. Números ⚖BALANCE: precios de skills nuevos, bases de precio de baldosas, bonus destrucción, COLOR_PRICE.
- **Diferido a implementación:** números finos de balance (tasas idle/hora, costos de mejoras,
  precio/multiplicador exacto), orden exacto del árbol de habilidades, detalles de estética.

## Changelog
- **2026-10-06 (v2.21):** una pantalla, reinicio efímero, 100 clientes, tamaños de pedido, segunda oleada de calamidades con barra, victoria suave. La curva de mesas ×1.6 queda como en v2.20.0.
- **2026-10-06 (Julian):** retirada la tienda permanente de baldosas/mesas (×1.35 y el dial posterior `TABLES_PERM_BASE × 1.25^permTiles` / `buyTablesUp`). Queda solo la curva temporal por partida ×1.6, que se resetea entre runs; las mesas jugables ya no dependen de compras permanentes.
