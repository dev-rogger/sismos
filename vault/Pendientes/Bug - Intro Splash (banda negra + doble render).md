---
tags: [bug, abierto]
---

# Bug: intro/splash — banda negra inferior + a veces se muestra 2 veces

**Estado**: ABIERTO. El fix del 2026-09-01 (`638b61d`) fue una REGRESIÓN y se revirtió el mismo día.

> ⚠️ Lección cara: `638b61d` se basó en medir con `Emulation.setSafeAreaInsetsOverride`
> en Chromium, donde `visualViewport.height` SÍ incluye el área del home indicator.
> En WebKit real es al revés. Chromium no sirve para validar esto — y WebKit es el
> único navegador donde el bug existe (PWA instalada en iPhone).
> Efecto de la regresión: la franja pasó de verse solo en la intro a verse SIEMPRE,
> también sobre el mapa, y en más de un dispositivo.
> Estado actual = el de `856a11b`: franja en la intro, mapa limpio.

## CAUSA RAÍZ de la franja negra: el gradiente cortado (2026-09-02)

La pista decisiva la dio el usuario: *"en web se ve bien, porque la franja negra
sube la pantalla para que no tope con los botones del navegador, pero a nivel de
PWA no hay barra de navegador, por lo que debería usar el total de la pantalla"*.

`.splash-fondo` tiene dos gradientes; el segundo es
`radial-gradient(140% 120% at 50% 100%, rgba(14,22,34,0.4) 0%, ...)` — un
resplandor frío **anclado al borde inferior, donde está en su punto MÁS fuerte**,
no desvanecido.

En la PWA instalada esa capa (`inset:0`) se cortaba antes del borde físico de la
pantalla, y debajo quedaba `.splash-pwa::after` con negro plano. O sea: resplandor
azulado a plena intensidad y, de golpe, ~34px de negro puro. **Ese corte era la
franja.** En web no se nota porque la barra del navegador ocupa justo esa zona, así
que el gradiente sí llega hasta donde termina lo visible.

### Por qué el comentario anterior del CSS estaba equivocado

Argumentaba que la costura era invisible porque "el gradiente se desvanece a
`rgba(10,10,10,0)` justo en el borde, el mismo color plano que hay debajo". Eso es
cierto para el PRIMER gradiente (cálido, `at 50% 38%`) pero **falso para el
segundo**, que está anclado justo ahí y en su máximo. De ahí que varios intentos
"arreglaran" el fondo sin que la franja desapareciera.

### Fix aplicado

`.splash-fondo` pasa de `inset: 0` a extenderse por debajo:
`bottom: calc(-1 * env(safe-area-inset-bottom, 0px))`. Así el `100%` del gradiente
cae en el borde físico real y no queda ningún corte. El grano (`::after`) hereda la
caja extendida automáticamente.

Es **agnóstico a la hipótesis** de cómo mide iOS: si el viewport ya cubría el área
del home indicator, la extensión se va fuera de pantalla y no se ve; si no la
cubría, la tapa justo. En web, `env(safe-area-inset-bottom)` es 0 y no cambia nada.

Medido en Chromium con inset de iPhone: `.splash-fondo` sobrepasa el viewport en
34px exactos, sin costura visible ni regresión. **La confirmación real es en el
iPhone del usuario** — Chromium no puede validar este caso (ver la lección de más
abajo).

## La intro ahora se ve también en web (2026-09-01)

El splash dejó de estar detrás de `@media (display-mode: standalone)`: ahora se
muestra igual en navegador y en la PWA instalada. Motivos:

1. **Una sola experiencia** en vez de dos que divergen.
2. **Se puede depurar.** Que la intro solo existiera en standalone fue el bloqueo
   real detrás de varios arreglos a ciegas — nadie podía verla en un navegador
   normal. Ahora se abre en cualquier pestaña, incluido Safari del iPhone.

De paso se borró el fallback `data-standalone-legacy` (para iOS viejo sin soporte
de la media query) y las 3 media queries + sus 3 duplicados colapsaron en 3 reglas
simples.

Verificado en pestaña normal (`display-mode: standalone` = false): el splash se
monta con `display:flex`, `<main>` queda en `visibility:hidden` mientras dura, y
a los ~6s se desmonta y el mapa se revela.

**Pendiente de opinión del producto:** en web el piso sigue siendo 2100ms. Para
una app sísmica que la gente abre con urgencia después de un temblor, quizá
convenga un piso más corto en navegador que en la PWA.

## Cómo VER la intro (el bloqueo que duró 6 commits)

El splash solo se activa con `@media (display-mode: standalone)`, así que en una pestaña normal de Chrome no aparece — por eso todos los fixes anteriores se hicieron a ciegas. `Emulation.setEmulatedMedia` de DevTools **no** soporta `display-mode`. La forma que sí funciona:

```
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=9223 --user-data-dir=/tmp/chrome-pwa \
  --no-first-run "--app=http://localhost:3000/"
```

Una ventana `--app=` sí matchea `(display-mode: standalone)`. Además Chrome soporta `Emulation.setSafeAreaInsetsOverride` por CDP, así que se reproduce la geometría exacta de un iPhone 15 Pro (393×852, inset inferior 34px). Alternativa con WebKit real: simulador iOS + `xcrun simctl openurl booted http://localhost:3000/`.

## Causa raíz — banda negra: el inset se contaba dos veces

El hook `useAlturaViewportReal` hacía `visualViewport.height + env(safe-area-inset-bottom)`. Pero con `viewport-fit=cover` (que la app usa), `visualViewport.height` **ya incluye** el área del home indicator — ese es el efecto de `cover`. Sumarle el inset lo contaba doble.

Medido en standalone con insets de iPhone 15 Pro, ANTES del fix:

```
innerHeight = 852
main        = 886   ← 34px de más, exactamente el home indicator
scrollHeight= 886   overflow = 34   ← el documento scrolleaba
```

Ese scroll de 34px es lo que producía la franja: el rubber-band de iOS dejaba ver el fondo negro del `<body>` bajo el mapa.

Verificado en WebKit real: `fixed inset:0` == `100dvh` == `innerHeight` == `visualViewport.height`. Los insets y el alto del viewport **nunca son sumables** — o el viewport ya los incluye (standalone), o el inset vale 0.

### Por qué fallaron los fixes anteriores

- Los 3 fixes sobre `.splash-fondo`/viñetas atacaban una costura de tono dentro del splash, no la franja.
- `856a11b` (`min-height:100dvh`) no podía funcionar: `min-height` es un piso, y el elemento tenía `height:886px`. Apuntaba a "la medición sale corta" cuando en realidad **salía larga**.
- `.splash-pwa::after` (extender 120px el fondo) era código muerto: `.splash-pwa` ya cubría la pantalla completa. Su premisa ("`inset:0` no cubre el home indicator en iOS") es falsa con `viewport-fit=cover`.

### Fix aplicado

Se **borró** el hook `use-altura-viewport-real.ts` (medía un valor idéntico a `100dvh` y le sumaba un error). En su lugar, CSS puro:

```css
.pantalla-principal { position: fixed; inset: 0; background: var(--color-background); }
```

`fixed inset:0` deriva del mismo viewport que ya usa `.splash-pwa` — así ambos coinciden por construcción, sin ninguna cuenta que tenga que calzar — y además hace **imposible** que el documento scrollee, matando la clase entera de bugs de rubber-band. Lo mismo en `MenuLateral.tsx` (`inset-y-0`), que tenía el mismo bug.

Medido DESPUÉS: `main = 852`, `overflow = 0`. ✅

Los `env(safe-area-inset-bottom)` de los botones flotantes del mapa (`MapaSismos.tsx`) se dejaron como estaban: con el contenedor ya correcto, ahora posicionan bien (antes el sobrante los empujaba sobre el home indicator).

## Causa raíz y fix — doble splash

`ActualizacionToastWatcher.tsx` hacía `window.location.reload()` sin avisar si el service worker se actualizaba dentro de los primeros 5s (`VENTANA_ARRANQUE_MS`). El splash dura entre 2.1s y 6s, así que una actualización post-deploy caía en plena intro, recargaba la app entera y el splash se reproducía. Se sacó el reload automático: ahora siempre se muestra el toast de "nueva versión" y la persona decide.

## Ideas evaluadas y descartadas

- **SCSS**: no aporta. Es un preprocesador — compila a CSS antes de que el navegador vea nada, y el bug es aritmética de viewport en runtime. Además desalinea del Tailwind v4, que ya tiene variables y anidamiento nativos.
- **`100svh`/`100lvh`**: en standalone son idénticos a `dvh` (no hay barras que colapsen).
- **Framer Motion**: el problema es layout, no orquestación.
- **Splash nativo del manifest**: iOS no lo implementa bien (`apple-touch-startup-image` por resolución, ~20 archivos, sin animación) y se perdería la coreografía de la cinta sismográfica. Mantener el splash en React es correcto — lo que estaba mal era que competía por el alto con `<main>`.

## Pendiente (P1/P2, opcional)

- **P1**: limpiar andamiaje muerto — `.splash-pwa::after` y quizá las reglas `display:none` de `.maplibregl-ctrl-*`.
- **P2**: con `<main>` ya fijo, se podría bajar el piso del splash de 2100ms a ~1200ms y volver a un crossfade real de 240ms (`cubic-bezier(0.32, 0.72, 0, 1)`). El crossfade se había sacado porque el mapa aparecía mal geometrizado — causa que ya no existe. Conversación aparte.
