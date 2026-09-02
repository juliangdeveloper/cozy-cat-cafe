# SPEC — Informe de balance v2.3 (solo análisis, NO tocar código)

## Objetivo
Meta del dueño: **100% del juego en ~30 horas** de juego real (todos los colores, capacidad/colores al máximo, skills con usos altos, perfil 100%).

## Qué hacer (EN ORDEN)
1. Leer `RULES.md` completo y el bloque `CONFIG` + funciones `pay()`, `runVictory()`, `closeRun()`, `buySkill`, `buyTablesUp`, `buyColor`, `buyIdleUpgrade` en `js/game.js`.
2. Escribir un script Node EFÍMERO (en `%TEMP%`, NO en el repo) que importe `js/game.js` (ESM, headless) con `mulberry32` y simule ≥200 partidas por perfil: early (5 colores, sin usos), mid (7 colores), late (10 colores, skills llenas). Duración humana de partida de referencia: 3–5 min (mira `test/e2e.playthrough.js`). Medir coins/partida.
3. Calcular el COSTO TOTAL del 100% con las curvas v2.3: colores hasta 10, capacidad +80, mult hasta MULT_MAX, 5 skills × hasta 5 usos (curva `price × 1.35^n`), idle hasta caps (`50×(lv+1)²`), expansiones.
4. Estimar horas hasta 100% = costo total / (coins/partida × partidas/hora). Comparar vs meta 30h. Dar delta.
5. Proponer ajustes de números (precios base, ratios, caps, pay) en tabla antes/después. 3 escenarios: casual 20 min/día, regular 1 h/día, grinding.
6. Escribir `BALANCE_REPORT.md` en la RAÍZ del repo, en ESPAÑOL: metodología, curvas actuales (citar archivo:línea), modelo de income, costo total, horas estimadas, delta vs 30h, propuesta, riesgos. Terminar con: horas estimadas, delta, y los 5 números que más impactan la meta.

## REGLAS DURAS
- NO modificar `js/game.js`, `index.html`, `RULES.md`, `tests/`, `dist/`. SOLO crear `BALANCE_REPORT.md`.
- NO hacer commit ni push. Borrar el script temporal al terminar.
- Los usos por skill tienen tope 5/partida (v2.4) EXCEPTO tables (capa = baldosas dormant del tablero).
- Si un comando falla 2 veces, anota el error en el informe y sigue con el siguiente paso; no te atasques.
