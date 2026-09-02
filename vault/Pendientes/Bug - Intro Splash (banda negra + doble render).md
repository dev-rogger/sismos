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
