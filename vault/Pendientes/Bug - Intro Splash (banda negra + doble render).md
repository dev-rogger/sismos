---
tags: [bug, resuelto]
---

# Bug: intro/splash — banda negra inferior + a veces se muestra 2 veces

**Estado**: fixes implementados 2026-08-31, pendiente de confirmación visual del usuario en PWA instalada (no se pudo probar en navegador automatizado en esa sesión — extensión Chrome desconectada).

## Síntomas reportados originalmente

1. Persistía un espacio/banda de color negro en la parte inferior de la pantalla durante o después de la intro, a pesar de 3 intentos de fix previos.
2. El splash a veces se renderizaba/mostraba dos veces.

## Causa raíz y fix — banda negra

No estaba en `SplashPWA.tsx` (ese ya cubre toda la pantalla correctamente). Estaba en `PantallaPrincipal.tsx`: el `<main>` que contiene el mapa fija su alto en px vía `useAlturaViewportReal()` (`apps/web/lib/use-altura-viewport-real.ts`), que medía `visualViewport.height` **una sola vez, síncrono al montar**. Si esa primera medición salía corta (arranque en frío de la PWA), `<main>` quedaba con altura insuficiente para toda la sesión — invisible mientras el splash lo tapa (`visibility:hidden`), expuesto recién al desmontarse.

Importante: ya hubo una versión con puro CSS `100dvh` sin JS, revertida por el commit `e580e23` porque Safari mobile no siempre recalcula `dvh` a tiempo — por eso no se podía simplemente volver a CSS puro.

**Fix aplicado** (commit `856a11b`):
- `use-altura-viewport-real.ts`: remedido único con doble `requestAnimationFrame` tras el mount, mientras `<main>` sigue oculto detrás del splash (no repite el parpadeo del timer que se sacó en un fix anterior).
- `globals.css` + `PantallaPrincipal.tsx`: nueva clase `.pantalla-principal` con `min-height:100dvh` + mismo `background` oscuro del splash, como red de seguridad si la medición en px falla igual.

Revisado por el agente `animation-guardian` antes de implementar (aprobó el enfoque, sugirió el doble rAF en vez de enganchar la remedición al evento `sismos:mapa-listo`, para no depender de que el mapa cargue).

## Causa raíz y fix — doble splash

No era un bug de React ni de la coreografía del splash — era un `window.location.reload()` real. `ActualizacionToastWatcher.tsx` recargaba la página sola y sin avisar si el service worker se actualizaba dentro de los primeros 5s de abierta la app (`VENTANA_ARRANQUE_MS`). Como el splash dura entre 2.1s y 6s, una actualización de SW que activa justo después de un deploy caía en esa ventana, recargando la app entera a mitad del splash — que volvía a montarse de cero.

**Fix aplicado** (commit `5252355`): se sacó el reload automático y silencioso; ahora siempre se muestra el toast de "nueva versión disponible" (el mismo que ya existía para fuera de esa ventana) y la persona decide cuándo recargar. Cualquier `reload()` es una navegación completa, así que no había forma de "posponerlo" y seguir garantizando que el splash aparezca una sola vez — había que sacarlo.

## Archivos modificados

- `apps/web/lib/use-altura-viewport-real.ts`
- `apps/web/components/PantallaPrincipal.tsx`
- `apps/web/app/globals.css`
- `apps/web/components/ActualizacionToastWatcher.tsx`

## Siguiente paso

Confirmación visual del usuario en la PWA instalada (celular o Mac) después del deploy a prod. Si algo sigue fallando, retomar desde acá — no está 100% verificado en navegador real todavía.
