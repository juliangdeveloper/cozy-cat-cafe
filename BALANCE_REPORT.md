# INFORME DE BALANCE — Cozy Cat Café v2.3/2.4 (análisis estático)

**Fecha:** 2026-09-02 · **Alcance:** pasos 1, 3, 4, 5 y 6 de `BALANCE_SPEC.md` (SOLO análisis estático del código y curvas; **sin** simulaciones Node, paso 2 omitido por instrucción del owner).
**Meta del dueño:** 100% del juego en **~30 horas** de juego real.
**Reglas respetadas:** no se tocó `js/game.js`, `index.html`, `RULES.md`, `tests/` ni `dist/`; no se hizo commit; no se creó script temporal que borrar (todo el cálculo fue matemática directa de las curvas citadas).

---

## 1. Metodología

1. Lectura completa de `RULES.md` (reglas R2–R17) y del bloque `CONFIG` + funciones `pay()`, `runVictory()`, `closeRun()`, `buySkill`, `buyTablesUp`, `buyColor`, `buyIdleUpgrade` en `js/game.js`.
2. **Sin simulación de partidas** (paso 2 del spec, omitido por delegación). En su lugar, modelo de income *analítico* construido sobre las curvas reales del código: pago por cliente `pay(qty, multLevel)`, mezcla de qty uniforme 2–4 (`rngInt(r, 2, 4)`, `js/game.js:406`), y bonus de calamidades al cierre.
3. Costo total del 100% = suma exacta de cada serie de precios (cerrada analíticamente).
4. Horas = costo total / (coins/min × 60), con 3 supuestos de ritmo económico.
5. Propuesta de números re-escalando SOLO las curvas que rompen la meta (ver §6).

⚠ Este informe es **estático**: no valida coins/partida empíricamente. La velocidad real de servir clientes (y por tanto coins/min) debe medirse con el paso 2 del spec cuando se quiera cerrar el dial.

---

## 2. Curvas actuales (citadas archivo:línea)

Todas en `js/game.js` salvo indicación.

| Concepto | Fórmula actual | Cita |
|---|---|---|
| Pago por pedido | `round(5 × qty^(1.25 + 0.05×multLevel))` | `js/game.js:115-118` (`CONFIG.BASE_COIN=5`, `EXP_BASE=1.25`, `EXP_STEP=0.05` en :12-14); aplicado en `serveOrder` :884 y auto-serve :961 |
| Colores (compra directa) | `150 × (n−3)`, n = colorsOwned tras comprar, 4→10 | `js/game.js:749-759` (precio :754; `COLOR_PRICE_BASE=150` :36; `MAX_COLORS=10` :41) |
| Multiplicador | `100 × (multLevel+1)`, tope `MULT_MAX=6` | `js/game.js:1288-1297` (precio :1292; cap :1291; `MULT_PRICE_BASE` :15, `MULT_MAX` :16) |
| Skills modelo usos (destroy/swap/refresh/queueSkip) | `price × 1.35^usesBought`; tope **5 usos** (v2.4) | `js/game.js:1081-1138` (costo :1128, cap :1127/:1130); precios base en `createGame` :149-151/:158 (250/120/40/100) |
| Mejora de usos (`buyUsesUp`) | `60 × 1.6^usesBought` | `js/game.js:1167-1190` (precio :1185; `USES_UP_BASE=60`, `USES_UP_RATIO=1.6` :49-50) |
| Tables / mesas (`buyTablesUp`) | `200 × 1.35^permTiles`, techo = 32−7 = **25 compras** | `js/game.js:816-832` (cap :823-824); precio en `permTilePrice` :776-779 (`TABLES_PERM_BASE=200`, `TABLES_PERM_RATIO=1.35` :39-40) |
| Capacidad (clientes/partida) | `120 × 1.35^level`, **80 niveles** (`MAX_CLIENTS=100`) | `js/game.js:1106-1118` (precio :1111; `CAP_PRICE_BASE=120`, `CAP_RATIO=1.35` :51-52); TOTAL efectivo en `totalClients` :358-361 (`MIN_CLIENTS=20` :47) |
| Idle (3 sistemas) | `50 × (level+1)²`, sin tope de nivel | `js/game.js:1299-1313` (precio :1303; `IDLE_PRICE=50` :28; tasas/caps :26-27) |
| Bonus de cierre | `calamities × 15` (5–7 con ~23 jugables → 75–105) | `js/game.js:120-123` y `closeRun` :1058-1059 (`CALAMITY_BONUS_PER=15` :17) |
| Escombros (debris) | `25 × tamaño` por grupo ≥10 | `js/game.js:976-992` (:986; `DEBRIS_THRESHOLD` :42, `DEBRIS_BONUS_PER` :43) |
| Victoria | `clientsServed >= totalClients` | `runVictory` :365-368; `closeRun` :1053-1076 |
| Duración de partida (ref.) | qty de cliente `rngInt(2..4)`; cola perezosa de 3 visibles | `js/game.js:399-413` (qty :406); regla R16 en `RULES.md:255-260` |

---

## 3. Modelo de income (estático)

- Pago por cliente (qty uniforme 2–4 ⇒ media): multLevel 0 → **20.0**; ml 3 → 23.7; ml 6 → **28.3** coins/cliente. La superlinealidad real es débil: pasar de ml 0 a ml 6 solo sube ~42% el ingreso por cliente mientras las partidas se alargan con la capacidad.
- **Income por partida ≈ media_pago × TOTAL_CLIENTS**: capacidad 20 → ~400–567; 40 → ~800–1133; 60 → ~1200–1700; 100 → ~2000–2833 coins/partida (rango ml 0→6).
- Bonus de cierre (calamidades 75–105) y debris (~25×ficha, esporádico) aportan <10% adicional en runs con tablero grande.
- **Duración humana** (estimación, sin simular): ~10 s de interacción por cliente servido (colocar pila + leer cascada a 600 ms/eslabón) ⇒ partida de 20 clientes ≈ 3–4 min (rango 3–5 min del spec ✓), partida de 100 ≈ 15–17 min.
- ⇒ **Ritmo económico** (coins/min de juego real): conservador ≈ **100** (early, mult bajo, colas cortas, atascos), medio ≈ **170** (mid-game, mult 4–6, capacidad ~60), alto ≈ **280** (late: capacidad 100, mult 6, cascadas largas).

---

## 4. Costo total del 100% (curvas v2.3/2.4 vigentes)

| Tramo | Serie | Costo total |
|---|---|---:|
| Colores 4→10 (6 compras) | 300+450+600+750+900+1050 | **4,050** |
| Multiplicador 0→6 | 100+200+…+600 | **2,100** |
| Skills usos ×5 (4 skills, ruta óptima: `buyUsesUp` para destroy/swap/queueSkip, `buySkill`×5 para refresh) | ver §5 ruta | **2,534** |
| Tables ×25 compras | Σ 200×1.35^m, m=1..25 (última: 362,555) | **1,397,656** |
| Capacidad ×80 niveles | Σ 120×1.35^lvl, lvl=0..79 | **9,158,300,000,000 (9.16×10¹²)** |
| Idle 3 sistemas × nivel 15 (tope razonable) | 3 × Σ 50k², k=1..15 | **186,000** |
| **TOTAL literal** | | **≈ 9.16×10¹² coins** |

**Hallazgo crítico:** el 100% *literal* es **matemáticamente imposible**. La curva de capacidad (120×1.35^lvl sin suavizar, 80 niveles) y la de tables (200×1.35^25) dominan el total: a 280 coins/min de ritmo *alto* serían **>5×10⁸ horas**. El último nivel de capacidad solo cuesta ~2.4×10¹¹. Ningún jugador llegará al nivel 80 de capacidad; el "100%" alcanzable en la práctica se detiene mucho antes. Esto es un defecto de las curvas, no del jugador.

**Costo del 100% "alcanzable"** (lectura B: tables 25, capacidad 40 niveles, idle 15):

| Tramo | Costo |
|---|---|
| Colores + mult + skills + idle 15 | 194,684 |
| Tables ×25 | 1,397,656 |
| Capacidad ×40 | 56,035,246 |
| **TOTAL B** | **≈ 57.6 M coins** |

---

## 5. Horas estimadas vs meta 30h

| Supuesto | coins/min | Horas (literal 9.16×10¹²) | Horas (lectura B, 57.6 M) | Delta vs 30h (B) |
|---|---|---|---|---|
| Conservador | 100 | ~1.5×10⁹ h (imposible) | **9,605 h** | +9,575 h |
| Medio | 170 | ~9×10⁸ h (imposible) | **5,650 h** | +5,620 h |
| Alto | 280 | ~5.4×10⁸ h (imposible) | **3,430 h** | +3,400 h |

**Delta vs meta:** incluso con la lectura alcanzable y ritmo alto, el 100% está **>100× por encima** de las 30 h. La causa no es el income (que está bien calibrado: 20–28 coins/cliente es razonable) sino **dos curvas exponenciales mal acotadas** (capacidad y tables), que consumen el 99.6% del presupuesto total.

---

## 6. Propuesta de números (tabla antes/después)

Principio: **no tocar** pay ni las curvas baratas (colores, mult, skills, idle — todas suman <200k y están bien). Re-acotar las dos curvas rotas con base/ratio/techo nuevos.

| Concepto | Antes (v2.4) | Después (propuesto) | Costo antes (tramo) | Costo después |
|---|---|---|---|---|
| Tables (`buyTablesUp`) | `200 × 1.35^m`, tope 25 | **`80 × 1.25^m`, tope 15** | 1,397,656 | **8,775** |
| Capacidad | `120 × 1.35^lvl`, tope 80 | **`60 × 1.12^lvl`, tope 40** (TOTAL max = 60 clientes) | 9.16×10¹² (80 niv.) / 56 M (40 niv.) | **38,355** |
| Colores | `150×(n−3)`, 4→10 | sin cambio | 4,050 | 4,050 |
| Multiplicador | `100×(lvl+1)`, tope 6 | sin cambio | 2,100 | 2,100 |
| Skills usos ×5 | `price×1.35^k` (tope 5) | sin cambio | 2,534 | 2,534 |
| `buyUsesUp` | `60×1.6^k` | sin cambio (queda como ruta alternativa) | — | — |
| Idle | `50×(lv+1)²`, sin tope | sin cambio; tope práctico lvl 15 | 186,000 | 186,000 |
| **TOTAL 100%** | | | **≈ 57.6 M (alcanzable)** / 9.16×10¹² (literal) | **≈ 241,800 coins** |

### Coste total propuesto: ≈ 241,814 coins

| Escenario | Sesión | Progresión estimada a la propuesta |
|---|---|---|
| **Casual** (20 min/día, ~100 c/min) | 0.33 h/día | **≈ 40 h → ~4 meses** (aceptable para perfil casual; delta +10h vs 30h "de juego activo") |
| **Regular** (1 h/día, ~170 c/min) | 1 h/día | **≈ 24 h → 3.5 semanas** ✓ roza la meta |
| **Grinding** (sesiones largas, ~280 c/min) | — | **≈ 14 h** (1–2 fines de semana) |

**Verificación del objetivo (juego activo):** 241,814 coins / (170×60) ≈ **23.7 h** (medio) · **40.3 h** (conservador) · **14.4 h** (alto). La banda [14–40 h] **rodea la meta de 30 h**: el jugador medio cae cerca de 24 h y el conservador la supera levemente — margen correcto para un cozy (mejor quedarse corto que largo).

Si se quiere clavar 30 h en el jugador *medio* exacto, el dial más fino es subir la capacidad a `60 × 1.145^lvl` (total ≈ 281k ⇒ 27.5 h medio / 46.8 h conservador).

### Detalle de la ruta de skills ×5 (mantiene v2.4)
- refreshPool (40): 5 compras por `buySkill` = 398 (más barato que mezclar con `buyUsesUp`).
- destroyPile (250): 250 + 4×`buyUsesUp` = 805. swapPiles: 675. queueSkip: 655. Total óptimo 2,534.

---

## 7. Riesgos

1. **coins/min es una estimación, no una medición.** Todo el informe depende del supuesto 8–10 s/cliente. Si el jugador real tarda 15 s (o hay muchos atascos 'full'), el ritmo conservador cae a ~60–70 c/min y la propuesta se queda corta (~60 h). **Acción:** ejecutar el paso 2 del spec (simulación ≥200 partidas con `mulberry32`) antes de tocar código.
2. **Reducir el tope de capacidad a 60 clientes acorta las partidas late-game** (~16 min → ~10 min). Si eso reduce también el coins/min percibido, el efecto neto sobre horas es parcialmente compensado. Vigilar que la fase de crecimiento de roster siga teniendo espacio (7 jugables + tables).
3. **Tables ×15 con tablero de 32 celdas** deja 10 baldosas dormant permanentemente inactivables — ok para la meta de 30 h, pero cambia el late-game (menos espacio, más cierres 'full'). Alternativa: mantener tope 25 y bajar ratio a 1.15 (Σ ≈ 3,900).
4. **Idle queda sub-representado** (186k de 242k = 77% del costo propuesto, pero es income *pasivo/offline* que no exige jugar): si se cuenta el tiempo offline en la meta, las horas reales de pared bajan aún más. Decidir si el 100% exige idle 15 o si con idle 10 (57,750) basta — ahorraría 128k.
5. **Guardas de balance pendientes en RULES.md** (R12.4 destroyPile "PENDIENTE DE BALANCE", varios ⚖BALANCE): este informe cubre precios, no el valor *funcional* de cada skill en partida; eso requiere la simulación omitida.
6. **Sin fallos de herramienta que anotar** — todos los cálculos se ejecutaron correctamente a la primera.

---

## 8. Resumen ejecutivo

- **Horas estimadas al 100% con curvas actuales:** imposibles en la lectura literal (9.16×10¹² coins por la curva de capacidad); ≈ **3,430–9,605 h** incluso con la lectura alcanzable (tables 25 + capacidad 40) y ritmo alto.
- **Delta vs meta 30h:** **+3,400 h a +9,575 h** — el 100% actual no es alcanzable por ~2 órdenes de magnitud.
- **Los 5 números que más impactan la meta:**
  1. **Ratio de capacidad: 1.35 → 1.12** (y base 120 → 60): pasa de 9.16×10¹² a 38k coins. Es el 99% del problema.
  2. **Base de tables: 200 → 80** (ratio 1.35 → 1.25): de 1.40 M a 8.8k coins.
  3. **Tope de capacidad: 80 → 40 niveles** (TOTAL max 100 → 60 clientes): acota el late-game a partidas jugables.
  4. **Ritmo económico real (coins/min)**: sin simularlo (paso 2 del spec), cualquier dial final es provisional.
  5. **Tope de idle: nivel 15** (≈186k): con idle 10 el total propuesto baja a ≈ 114k (≈ 11–19 h) — decidir si el 100% lo exige.
- **Costo total propuesto: ≈ 241,814 coins ⇒ 14–40 h de juego activo (medio ≈ 24 h), rodeando la meta de 30 h.**
