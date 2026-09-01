---
tags: [arquitectura, hecho]
---

# Navegación: refactor del patrón de overlays

**Estado**: bug puntual arreglado y refactor implementado, ambos 2026-09-01.

## El bug que lo destapó (ya resuelto)

Síntoma reportado: "toco Estadísticas y no abre, como que se crashea y vuelve al mapa". Antes había pasado algo parecido con el login.

Reproducido en Chromium con CPU frenado 6x (celular de gama media / hilo principal ocupado por MapLibre): **fallaba 4 de cada 6 veces**. No era específico de Estadísticas — la misma firma aparecía con Sismos y Fallas. Estadísticas solo lo exponía más porque su montaje es más caro (fetch + gráfico), así que perdía la carrera más seguido.

### Mecanismo

1. `elegir()` en `MenuLateral.tsx` hacía `setAbierto(false)` y difería la apertura con `setTimeout(accion, 0)` → **dos commits de React separados**.
2. El cleanup del menú (`use-overlay-accesible.ts`) agenda su chequeo en `rAF + setTimeout(0)`. Bajo carga corría **antes** de que montara la pantalla nueva: veía `pilaOverlays` vacía → `history.back()`.
3. La pantalla montaba y hacía su propio `pushState`.
4. El `popstate` del `back()` llegaba tarde → cerraba la pantalla recién abierta.

No había excepción ni crash: era la pantalla cerrándose a sí misma.

### Fix aplicado (1 línea)

```ts
const elegir = (accion: () => void) => {
  setAbierto(false);
  accion();            // antes: setTimeout(accion, 0)
};
```

Un solo commit de React: destroy(menú) y create(pantalla) caen en el mismo flush, la pila nunca queda vacía, el `back()` nunca se dispara.

**Verificado por CDP** instrumentando `pushState`/`back`/`popstate`, con el bug reintroducido a propósito para confirmar que el harness detecta la diferencia:

```
CON fix:  [push]                          → 8/8 y 6/6 limpio
SIN fix:  [push, back, push, POPSTATE]    → 7/8 con la carrera
```

## El problema de fondo (pendiente)

Pedido textual del usuario: *"puede que agreguemos más o que lo reordenemos pero debería ser algo reutilizable, no que salga un problema por cada botón"*.

El patrón actual es frágil **por diseño**, no por complejidad accidental:

- Pone lógica de **interacción** (empujar/consumir historial) dentro de efectos de montaje/desmontaje.
- Sincroniza dos schedulers sin orden garantizado entre sí (frames del navegador vs. efectos pasivos de React) — de ahí los `rAF + setTimeout(0)` anidados.
- `pilaOverlays` es una pila global mutable compartida por todas las instancias del hook.
- `marcarProximoCierreComoNavegacion()` es una bandera global que consume **el próximo cleanup que corra**, no necesariamente el que la seteó. Si se olvida → `AbortError` y la navegación muere (fue el bug del login). Si sobra → se filtra a otro overlay.
- Conviven **tres** mecanismos para "mostrar una pantalla": overlays con estado local (`elegir`), rutas reales (`navegarA` + `router.push`), y deep links por searchParams en `app/page.tsx`.

Es el antipatrón `rerender-move-effect-to-event` de las react-best-practices de Vercel. Cada pantalla nueva vuelve a jugar la lotería.

## Refactor implementado

`lib/navegacion-overlays.tsx` (nuevo): `ProveedorOverlays` es el **único dueño
del historial**. Mantiene la pila en un ref, una `profundidad` en estado, un
solo listener de `popstate` y un solo efecto de reconciliación.

La clave: la decisión pasó de N cleanups independientes a **un efecto que ve el
estado final de la pila después de cada commit**. Si el menú se desregistra y
una pantalla se registra en el mismo commit, ambos updates se agrupan, la
profundidad va de 1 a 1 y no se toca el historial. La carrera desaparece por
construcción, no por ganarle al timing.

`use-overlay-accesible.ts` conserva **la misma firma pública** — los 11
llamadores no se tocaron. Solo cambian sus entrañas: sigue haciendo Escape,
scroll lock y focus trap; el historial se delega al proveedor. Se fueron
`pilaOverlays`, la bandera global, el `rAF + setTimeout(0)` y el `hrefAlCerrar`.

`marcarProximoCierreComoNavegacion()` se eliminó como global: `MenuLateral`
ahora toma `marcarNavegacionSaliente` del contexto. El defecto original ("lo
consume el cleanup equivocado") desaparece porque hay un solo consumidor.

### Verificación (CDP, ventana Chrome --app en standalone)

Suite funcional, 4 pantallas x 2 vueltas con CPU frenado 6x: **8/8**. Cada una
abre y queda abierta, el botón atrás la cierra, no saca de la app, y el rastro
de historial es `[push]` limpio.

Casos borde: **3/3**
- submenú Idioma anidado: atrás cierra el submenú y deja el menú abierto
- "Iniciar sesión" navega de verdad a /login (el caso de la bandera global)
- dos ciclos abrir/cerrar: sin overlays colgados ni historial inflado

### Límite honesto de esta verificación

No se pudo reproducir la carrera original en este entorno para demostrar que el
refactor la previene: con el dev server caliente y la página cacheada, el bug
tampoco aparece con el código viejo y el `setTimeout` reintroducido. La carrera
sí se había reproducido antes (7/8) al arreglar `elegir()`.

O sea: está verificado que el refactor **no regresiona** nada, y su valor es
estructural (se van la pila global y la bandera). No está medido que arregle
una carrera que hoy no se logra provocar.

### Trampas del harness que costaron tiempo (anotadas para la próxima)

1. React deja un `<div hidden id="S:0">` del streaming SSR con una copia del
   árbol, y aparece PRIMERO en el DOM. Hay que filtrar `el.closest('[hidden]')`
   o se termina clickeando botones invisibles.
2. Con la ventana `--app` tapada por otra, Chrome congela las transiciones CSS:
   `translate` se queda en el valor inicial para siempre. Guiarse por el estado
   (`aria-hidden`), no por la geometría, o pedir `prefers-reduced-motion`.
3. En dev el splash vive ~10s (hidratación + mapa lentos) y mientras tanto
   `<main>` tiene `visibility:hidden`. Esperar a que `.splash-pwa` desaparezca,
   no adivinar un timeout.

## Propuesta original (referencia)


Un único `useNavegacionOverlays`: reducer central en `MapaConHistorial` con `pantallaActiva: 'historial' | 'estadisticas' | ... | null` en vez de ~7 `useState` booleanos, y **una sola** suscripción a `popstate` en el proveedor. El `pushState` se hace en el handler `abrir(pantalla)`, no en un efecto; `cerrar()` hace `back()`.

Con un solo dueño del historial desaparecen la pila global, la bandera y la carrera. Agregar una pantalla pasa a ser agregar un valor al union type.

Migración acotada: 1 archivo nuevo + `MapaConHistorial` + quitar el manejo de historial del hook (que se queda solo con Escape, scroll-lock y focus-trap).

## Descartado

Migrar a intercepting/parallel routes o a searchParams como fuente de verdad: implica RSC + `router.push` por cada apertura sobre un mapa que no debe remontarse, y el estado del mapa (zoom, selección) es efímero por diseño. Costo alto, beneficio marginal. El deep link `?admin=` conviene mantenerlo como está: entrada inicial, no fuente de verdad.
