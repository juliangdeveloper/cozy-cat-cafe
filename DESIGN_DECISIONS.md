# Cozy Cat Café × HexaSort — Shared Understanding (post-grill)

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
- AUTO-SERVIR por defecto: cuando un tope alcanza la cantidad pedida, el pedido se sirve solo (paga, consume exactamente la cantidad, excedente queda). Pedidos FLOTAN: no anclados a celda.
- Cascada lenta encadenada (1600ms/eslabón) tras toda mutación de topes, hasta estabilizar. Grupos ≥10 se destruyen con bonus de monedas.
- Serve manual = skill comprable ("Modo mesero", toggle auto-serve off → brillar y tocar, comportamiento v1).

## Dinero / economía (incremental)
- **Pago base por pedido** + **multiplicador mejorable que premia pedidos grandes**
  (apilar 4 de una vez > 2 pedidos de 2; más difícil → más pago) + **bonus por calamidades** al cerrar.
- El dinero **expande el café**: más clientes (N), más celdas de tablero, más catálogo/colores.
- Dos economías de baldosas: compra TEMPORAL por partida (precio exponencial ×1.6 por baldosa activada en la run, se resetea) y PERMANENTE desde la tienda (×1.35 por permanente total; habilita el techo de activables, la activación siempre se paga por partida).
- Compra de COLORES en la tienda: 4 de inicio → 10 máx. El roster de la partida avanza 1 color por encima del techo comprado: completar la partida exige comprar colores.
- Umbral de destrucción ≥10: bonus fijo (25×qty, CONFIG).

## Poderes comprables (5, en el café) — orden de precio
1. **Saltar a la barra** (destruir pila)
2. **Mesero ágil** (intercambiar pilas)
3. **Envío de la cocina** (refresh pool)
4. **Modo mesero** (serve manual toggle) — precio ⚖BALANCE
5. **Pizarra de tiza** (preview 1-3 tandas siguientes; niveles 1-3 recomprando) — precio ⚖BALANCE

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
- Tablero SIEMPRE dibujado completo (panal con picos filas [7,9,9,7] = 32 baldosas, v2-shape; antes panal 5×6 = 30); jugable = núcleo 2-3-2 + activables ≤ permanentes comprados; no jugable se ve apagada.
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
