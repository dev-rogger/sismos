# Refactor visual — auditoría y diseño

Rama: `worktree-agent-acb626711821de69c`. Alcance: solo `apps/web`. Rendimiento primero (sin dependencias nuevas, solo CSS/Web APIs, solo `transform`/`opacity`, cero CLS).

## Línea base de build (antes de tocar nada)

`pnpm --filter web build` (Next 16.2.0, Webpack). Next 16 ya no imprime tamaños por ruta, así que se midió con `gzip -9` sobre `.next/static` (script en el scratchpad de la sesión).

| Métrica | Base |
|---|---|
| JS estático total (gzip) | 825 098 B |
| CSS estático total (gzip) | 17 902 B |
| Chunks cliente de la ruta `/` (7 archivos, gzip) | 549 809 B |
| `main` + polyfills raíz (gzip) | 166 542 B |

El peso lo domina MapLibre; el CSS propio es pequeño. Regla del refactor: CSS compartido debe costar < 3 KB gzip extra y el JS no puede crecer.

## Hallazgos priorizados

### Alta
1. **Contraste**: `text-neutral-500` (#737373) sobre `neutral-900/800` da ~3.8:1 y ~3.3:1 y se usa en 37 sitios con texto `xs`/`sm` (coordenadas, profundidad, estados vacíos). No pasa AA. Se corrige reajustando `--color-neutral-500` en `@theme` (efecto global sin tocar cada archivo). El popup usa `#737373` y `#a3a3a3` fijos: mismo problema.
2. **Copy hardcodeado en español dentro del popup del mapa** (`MapaSismos.tsx`: "km de profundidad", "Ubicación aproximada", "Falla sin nombre registrado") — rompe el modo `en`. Además `lugar` se inyecta con `setHTML` sin escapar.
3. **Foco visible inconsistente**: casi todos los botones no tienen `focus-visible`; los `select`/inputs hacen `focus:outline-none` y solo cambian el borde. No hay anillo de foco global.
4. **Clases repetidas ~80 veces** (botón de mapa, chip, botón secundario, item de menú, cabecera de pantalla): sin sistema, cualquier ajuste exige tocar decenas de líneas. Se centraliza en clases de componente.
5. **Estados de carga**: historial/estadísticas/fallas muestran solo texto "Cargando…" centrado → salto visual al llegar los datos. Se reemplaza por skeletons ligeros (solo `opacity`).

### Media
6. **Modales centrados en móvil** (filtro, configuración, instalar): en 390x844 el pulgar queda lejos y el modal flota sin ancla. Patrón de hoja inferior (bottom sheet) en móvil, centrado desde `sm`.
7. **Tarjetas del historial**: 5 líneas de texto del mismo peso; la magnitud (dato principal) queda enterrada en "M5.2 — fecha". Se jerarquiza con insignia de magnitud (mismo lenguaje que el popup) y fecha secundaria.
8. **Animaciones de pantallas**: duraciones y curvas sueltas (`duration-200 ease-out`) sin tokens; entrada y salida simétricas. Se introducen tokens de motion y salida más corta que la entrada.
9. **Popup de sismo**: aceptable, pero tip/gradiente con colores literales; botón cerrar de 24 px (< 44). Se amplía el área táctil sin cambiar el aspecto.
10. **Botones del mapa**: radio 8 px, sin anillo interior; sobre el mapa claro `bg-neutral-900/90` es correcto, pero se evita `backdrop-filter` en controles (costoso sobre WebGL en móviles medios).

### Baja
11. Emoji de bandera como icono estructural (se mantiene: es dato del sismo, no decoración).
12. `✕` de texto en el botón cerrar del modal de filtro: se cambia por SVG consistente con el resto.
13. `tabular-nums` en cifras (magnitud, conteos) para evitar saltos.

### Brechas
- No hay feedback táctil consistente (`active:scale` existe, pero con `transition` genérica que anima `all` visibles). Se limita a `transform`/`background-color`/`border-color`/`opacity`.
- Sin `color-scheme: dark`: scrollbars y controles nativos (select) salen claros.
- Sin `-webkit-tap-highlight-color` controlado.
- View Transitions: las pantallas son estado React (no rutas), `startViewTransition` obligaría a envolver setState en cada llamador y puede robar frames al mapa; **decisión conservadora: no se usa**; las transiciones son CSS con tokens y `prefers-reduced-motion` respetado.

## Sistema de diseño propuesto (implementado en `app/globals.css`)

**Tokens (`@theme`)**
- Neutros reajustados: `neutral-500 #8f8f8f` (≥ 4.5:1 sobre 800/900), `neutral-400 #a8a8a8`.
- Semánticos: `--color-superficie` (neutral-900), `--color-superficie-alta` (neutral-800), `--color-borde` (neutral-700/800), `--color-acento` (sky-400/500), `--color-peligro`, `--color-exito`.
- Radios: `--radius-control 0.75rem`, `--radius-tarjeta 1rem`, `--radius-hoja 1.5rem`.
- Elevación: `--sombra-flotante` (controles sobre mapa), `--sombra-hoja`, ambas con anillo `rgba(255,255,255,.06)`.
- Motion: `--dur-rapida 120ms`, `--dur-base 200ms`, `--dur-lenta 320ms`; curvas `--ease-salida cubic-bezier(.22,1,.36,1)` (entradas), `--ease-mover cubic-bezier(.25,1,.5,1)`, `--ease-hoja cubic-bezier(.32,.72,0,1)`. Salida = ~65 % de la entrada.
- Tipografía: pila del sistema (0 KB de fuentes web). Escala 12/14/16/20/30; títulos 600; cifras `tabular-nums`.

**Componentes base (`@layer components`)**: `.btn`, `.btn-mapa`, `.btn-icono`, `.chip`, `.campo`, `.pantalla-overlay` + `.cabecera-pantalla`, `.hoja` (+ fondo), `.tarjeta-sismo` + `.insignia-magnitud`, `.skeleton`, `.item-menu`. Todos con `:focus-visible` (anillo 2 px `--color-acento`), objetivo táctil ≥ 44 px, estados hover solo con `@media (hover:hover)`, disabled con opacidad .5.

## Plan por fase
1. Auditoría + nota (este archivo) + línea base.
2. Tokens y componentes base en `globals.css` (sin cambiar markup).
3. Aplicar: controles del mapa, popup, historial, filtros/modales (hoja inferior), estadísticas, menú, configuración, estados con skeleton.
4. Re-medir build, contraste, `aria-*`, tests/lint/types.
5. Validación visual en 390x844 y 1440x900, con y sin reduced-motion (proxy temporal no commiteado).
