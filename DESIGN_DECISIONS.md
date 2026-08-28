# Cozy Cat Café × HexaSort — Shared Understanding (post-grill)

Concepto: incremental + sorting de hex. "Abrir la tienda" = una partida.
Proyecto nuevo HTML/JS desplegable (pipeline BMAD + gate). Idioma: **inglés**.
Estética: a definir en fase de implementación (foco jugabilidad primero).

## Bucle de partida
- Partida = **abrir el café**. Sirves gatos-clientes con pedidos: juntar en una celda un
  grupo cuyo **tope es el color pedido** y con **la cantidad pedida** (gato "3×rojo" → apilas 3 rojos).
- El **pool muestra 3 pilas** (traídas por gatos trabajadores = ingredientes); **no se rellena
  hasta que colocas esas 3** en el tablero.
- **Servir = la celda se vacía** (las piezas van al cliente, liberas espacio).
- **La partida se cierra por 2 condiciones:** ① tablero lleno sin poder colocar más pilas,
  ② atendiste a **todos** los gatos. También se puede **cerrar cuando quieras** y conservar
  el dinero ganado hasta ese punto; reabrir reinicia.

## Dinero / economía (incremental)
- **Pago base por pedido** + **multiplicador mejorable que premia pedidos grandes**
  (apilar 4 de una vez > 2 pedidos de 2; más difícil → más pago) + **bonus por calamidades** al cerrar.
- El dinero **expande el café**: más clientes (N), más celdas de tablero, más catálogo/colores.

## Poderes comprables (3, en el café) — orden de precio
1. **Destruir una pila** (el más caro)
2. **Intercambiar 2 pilas de lugar** (medio)
3. **Descartar el pool actual y sacar otras 3** (el barato)

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
- **+1 color por cada N productos del catálogo**; el tablero crece con la expansión
  (amortigua la dificultad). Cozy, sin timer.

## Alcance
- Juego nuevo HTML/JS desplegable (como los otros juegos del perfil).
- **Diferido a implementación:** números finos de balance (tasas idle/hora, costos de mejoras,
  precio/multiplicador exacto), orden exacto del árbol de habilidades, detalles de estética.
