# SPEC — Cozy Cat Café × HexaSort

**Fase:** PO (ciclo BMAD) · **Estado:** v1.0 · **Idioma del juego (UI):** English · **Idioma del doc:** español (interno)
**Fuentes:** `DESIGN_DECISIONS.md` (mecánica, fuente de verdad) · `STYLE_GUIDE.md` (dirección artística Warm Vintage Café) · `concept/interfaces_2x2_warm_vintage.png` (imagen maestra)
**Deliverable:** juego nuevo HTML/JS desplegable en GitHub Pages (responsive, touch-first, mobile-first).

---

## 1. VISIÓN / PROPÓSITO

Juego **incremental (idle) × sorting de hexas** ambientado en un café victoriano-cálido con gatos. **"Open the café" (= abrir el café) es una partida**: la jugadora sirve a gatos-clientes apilando hexágonos por color+cantidad hasta vaciar el tablero, gana dinero que invierte en expandir el café y en mejoras idle, y repite. Loop central: **abrir → servir pedidos (apilar/vaciar) → cobrar → expandir/potenciar → cerrar → reabrir más grande**.

Cozy, sin timer, sin presión; la dificultad crece por colores y calamidades, no por reloj.

---

## 2. PÚBLICO

- **Núcleo:** jugadoras casuales y de juegos cozy/idle (móvil-first).
- **Secundario:** amantes de gatos y de estética café vintage; compra emocional por la escena viva del café.
- **Fricción esperada:** mínima — una partida corta y legible, progresión que se siente al instante, arte cálido no competitivo.
- **Dispositivos:** mobile portrait primario, desktop con layout ampliado.

---

## 3. MODELO DE JUEGO (resumen accionable)

| Término | Definición |
|---|---|
| **Partida** | "Abrir el café". Empieza en el menú con botón OPEN SHOP. Reabrir = nueva partida. |
| **Pedido (order)** | Un gato pide `N× color` (ej. "3× pink"). Servir = apilar en una celda un grupo cuyo **tope es el color pedido** y con **la cantidad pedida**. |
| **Pool (tray)** | Muestra **3 pilas** (ingredientes traídos por gatos trabajadores). **No se rellena** hasta colocar esas 3. |
| **Servir** | La celda **se vacía** (piezas van al cliente, liberas espacio). |
| **Cierre** | ① tablero lleno sin poder colocar → fin; ② atendiste a **todos** los gatos → fin (éxito); ③ **cierre manual** en cualquier momento conservando el dinero ganado hasta ese punto. |
| **Árbol de habilidades** | Mejoras comprables desbloqueadas por **nivel del café** (sube con nº de partidas). El nivel NO tiene reflejo visual; **solo las mejoras compradas** sí. |

---

## 4. EPICS + USER STORIES

### Epic 1 — Bucle de partida (core loop)
- **US-1** — Como jugadora, quiero **abrir el café** desde el menú (botón OPEN SHOP, estética §4.1 del style guide), para comenzar una partida.
- **US-2** — Como jugadora, quiero ver el **pool con 3 pilas** de ingredientes traídas por gatos trabajadores, para saber qué puedo colocar.
- **US-3** — Como jugadora, quiero **colocar una pila** del pool en una celda del tablero hexadecimal, para apilar piezas del mismo color.
- **US-4** — Como jugadora, quiero ver los **pedidos de los gatos** (color + cantidad), para saber qué apilar en cada celda.
- **US-5** — Como jugadora, quiero que el grupo superior apilado señale visualmente cuando coincide **color (tope) y cantidad** del pedido (parpadeo `--highlight`), para saber que puedo servir.
- **US-6** — Como jugadora, quiero **servir un pedido** y que la celda **se vacíe** (confeti + corazón + pago), para liberar espacio del tablero.
- **US-7** — Como jugadora, quiero que el pool **solo se rellene tras colocar las 3 pilas actuales** (bandeja vacía con borde punteado como aviso "reponer"), para tener gestión de recursos.
- **US-8** — Como jugadora, quiero que la partida **se cierre cuando el tablero está lleno sin poder colocar** más pilas, para resolver la partida.
- **US-9** — Como jugadora, quiero que la partida **se cierre al atender a todos los gatos**, para ganar.
- **US-10** — Como jugadora, quiero **cerrar el café manualmente en cualquier momento conservando el dinero ganado**, para decidir cuándo parar; reabrir reinicia.

### Epic 2 — Economía incremental
- **US-11** — Como jugadora, quiero recibir un **pago base por cada pedido servido**, para acumular dinero.
- **US-12** — Como jugadora, quiero que el **multiplicador premie pedidos grandes** (apilar 4 de una vez > 2 pedidos de 2; más difícil → más pago; curva **superlineal** mejorable), para arriesgarme a pedidos grandes.
- **US-13** — Como jugadora, quiero recibir un **bonus por calamidades al cerrar** el café, para premiar haber jugado tableros difíciles.
- **US-14** — Como jugadora, quiero **gastar dinero en expandir el café +N clientes**, para aumentar el volumen de pedidos por partida.
- **US-15** — Como jugadora, quiero **expandir el tablero +N celdas**, para tener más espacio de juego.
- **US-16** — Como jugadora, quiero **expandir el catálogo +N colores**, para aumentar dificultad y recompensa.

### Epic 3 — Poderes comprables (árbol de habilidades)
- **US-17** — Como jugadora, quiero comprar el poder **DESTROY PILE** (destruir una pila; el más caro), para liberar una celda atascada.
- **US-18** — Como jugadora, quiero comprar el poder **SWAP PILES** (intercambiar 2 pilas de lugar; precio medio), para reorganizar el tablero.
- **US-19** — Como jugadora, quiero comprar el poder **REFRESH POOL** (descartar el pool actual y sacar otras 3; el barato), para cambiar mis opciones sin gastar en nada más.
- **US-20** — Como jugadora, quiero comprar poderes como **mejoras en un árbol de habilidades** simple del café (nodos, conexiones, candados — estética §4.7), para entender de un vistazo qué desbloqueo.
- **US-21** — Como jugadora, quiero que los poderes se **desbloqueen por nivel del café** (sube con el nº de partidas), para una progresión de meta larga.
- **US-22** — Como jugadora, quiero que el **nivel NO tenga reflejo visual** en la escena (solo se muestra en el árbol/UI), para que sea un sistema puro de desbloqueo.
- **US-23** — Como jugadora, quiero que **cada mejora comprada tenga su reflejo gráfico** en la escena (cambio visual del power up / nodo activo), para ver el progreso.
- **US-24** — Como jugadora, quiero que los poderes comprados tengan **usos/estado visible** (contador, badge candado/comprado), para saber cuándo puedo usarlos.

### Epic 4 — Calamidades (tablero > 15 hex)
- **US-25** — Como jugadora, quiero que al abrir el café con tablero >15 hex entren **calamidades: entre 1/3 y 1/5 del tamaño del tablero**, para que cada partida sea distinta.
- **US-26** — Como jugadora, quiero que algunas celdas de calamidad vengan con **pilas aleatorias pre-colocadas**, para añadir desafío de inicio.
- **US-27** — Como jugadora, quiero que otras celdas de calamidad estén **bloqueadas** (no clicables, candado — estética §4.8), para tener obstáculos fijos.
- **US-28** — Como jugadora, quiero que la **cantidad de calamidades varíe** cada partida, para que no haya dos cafés iguales.
- **US-29** — Como jugadora, quiero recibir el **bonus por calamidades al cerrar** (contador "Bonus: +N", badge `--danger`), para que los tableros difíciles paguen más.

### Epic 5 — Idle / offline
- **US-30** — Como jugadora, quiero que los **empleados-gatos** generen ganancia pasiva, para ganar dinero sin jugar activo.
- **US-31** — Como jugadora, quiero que la **fama / propinas** generen ganancia pasiva, para un segundo flujo incremental.
- **US-32** — Como jugadora, quiero que las **máquinas automáticas** generen ganancia pasiva, para un tercer flujo incremental.
- **US-33** — Como jugadora, quiero que los **3 sistemas idle generen pasivo a la vez**, para que cada mejora compuesta sume.
- **US-34** — Como jugadora, quiero que el **offline** acumule ganancias **con tope de almacenamiento** (modal "While you were away" + Collect), para recibir recompensas al volver sin desbalance.
- **US-35** — Como jugadora, quiero que **subir mejoras idle suba la tasa y el tope de almacenamiento**, para escalar el pasivo.
- **US-36** — Como jugadora, quiero que **cada sistema idle tenga reflejo gráfico en el café** (gato con babero, platito de propinas, máquina con vapor; nunca solo un número), para ver el café "vivo".

### Epic 6 — Progresión de colores
- **US-37** — Como jugadora, quiero que se desbloquee **+1 color por cada N productos del catálogo**, para ampliar progresivamente la dificultad.
- **US-38** — Como jugadora, quiero que **el tablero crezca con la expansión**, para amortiguar la dificultad añadida por nuevos colores (cozy, sin timer).

### Epic 7 — Persistencia
- **US-39** — Como jugadora, quiero que **todo el estado se guarde en localStorage**, para que mi progreso persista.
- **US-40** — Como jugadora, quiero **sobrevivir a recargas** (navegador cerrado y vuelto a abrir), para no perder el café.
- **US-41** — Como jugadora, quiero **exportar/importar mi save como JSON**, para respaldar o mover mi progreso.

### Epic 8 — Arquitectura lógica / arte separadas
- **US-42** — Como desarrolladora, quiero que la **lógica consuma los assets vía sprite map `sprites.png` + `sprites.json`**, para no acoplar mecánica y arte.
- **US-43** — Como desarrolladora, quiero que los **assets sean intercambiables sin tocar código** (solo sustituir sprites.png/json), para poder re-estilizar la dirección artística más adelante.

### Epic 9 — Bolsita de colores en el pool [v2.10]
- **US-44** — Como jugadora, quiero que las fichas del pool provengan de una **bolsita con inventario por color** (4 colores iniciales con puñados 6-14, sorteo uniforme entre los vivos), para que salgan rachas naturales de colores que faciliten encadenar y destruir torres.
- **US-45** — Como jugadora, quiero que al agotarse un color de la bolsita, se agregue una **recarga aleatoria (6-14) de cualquier color desbloqueado** (probabilidad 1/colores, pudiendo repetir el mismo o introducir uno nuevo), para tener una transición suave y continua entre colores sin cambios bruscos.

---

## 5. CRITERIOS DE ACEPTACIÓN GLOBALES

- **[G1] Playable e2e:** una partida jugable de principio a fin — abrir café, colocar pilas, servir un pedido que vacía la celda, cobrar, cerrar (por cualquiera de las 3 condiciones) y reabrir.
- **[G2] Publicado:** el juego corre en **GitHub Pages** en un repo del perfil; `index.html` accesible por URL pública.
- **[G3] Fidelidad visual:** la interfaz coincide **≥80% con la imagen maestra `concept/interfaces_2x2_warm_vintage.png`** (layout, paleta Warm Vintage Café, tipografías Baloo 2 / Nunito, botones, tiles, gatos, tray, árbol).
- **[G4] Persistencia:** todo el estado de juego se guarda en **localStorage** y sobrevive a recarga; export/import JSON disponible.
- **[G5] Estilo aplicado:** tokens de color solo de la paleta Warm Vintage Café (sin hex nuevos sin token), contorno chocolate `#794835` en interactivos/tiles, touch targets ≥44×44 px, `prefers-reduced-motion` respetado.
- **[G6] Móvil:** responsive mobile-first (≤480px apilado), orden 1) barra superior → 2) tablero → 3) pool tray → 4) poderes → 5) OPEN SHOP; safe areas y `touch-action: manipulation`.
- **[G7] Arquitectura:** lógica y arte desacopladas (sprite map `sprites.png` + `sprites.json`); sustituir assets no rompe código.

---

## 6. FUERA DE ALCANCE (explícitamente NO en este MVP)

- **Estética fina a pulir** — iteraciones de pulido artístico/animación fina post-MVP (solo la entrega ≥80% de la imagen maestra es obligatoria).
- **Sync multidispositivo / nube** — sin cuenta, sin backend, sin guardado en servidor.
- **Backend / servidores** — 100% estático y local; sin API, sin autenticación.
- **Monetización** — sin IAP, sin anuncios, sin compras, sin telemetría.
- **Números finos de balance** — tasas idle/hora, costos de mejoras, precios/multiplicadores exactos y orden final del árbol quedan diferidos a la fase de implementación (no bloquean el contrato funcional de este SPEC).

---

*Nota de trazabilidad: este documento deriva de `DESIGN_DECISIONS.md` (mecánica) y `STYLE_GUIDE.md` (arte). Cualquier cambio de mecánica debe actualizar primero las decisiones y reflejarse aquí.*
