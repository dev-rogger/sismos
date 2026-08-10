# Invitar a instalar la app (agregar a inicio) — design

## Contexto

La app ya es una PWA (`apps/web/public/manifest.json` con `"display": "standalone"`, service worker vía Serwist), pero nada invita al usuario a agregarla a la pantalla de inicio — la mayoría la usa como pestaña normal del navegador. Motivación explícita: en iOS, las push notifications (`docs/superpowers/specs/2026-08-10-notificaciones-terremotos-mundiales-design.md`, y el sistema base en `docs/superpowers/specs/2026-07-15-push-notifications-design.md`) **solo funcionan si la app está agregada a inicio** — sin eso, un usuario de iPhone que activa notificaciones nunca las va a recibir, sin ninguna explicación visible del motivo.

No debe ser obligatorio ni bloquear el uso normal — "puede que a alguien no le funcione así" — solo motivar, con una forma fácil de hacerlo cuando el usuario quiera.

## Alcance

1. Detectar si la app ya corre en modo standalone (ya instalada) — en ese caso, ningún aviso se muestra nunca, ni automático ni en el menú.
2. Si se abre desde el navegador (no standalone): un modal automático aparece tras cierto tiempo de uso en la sesión, invitando a instalar.
3. Descartar el modal automático activa un cooldown (no vuelve a aparecer solo por un tiempo), pero la opción sigue disponible manualmente vía una entrada nueva en el menú lateral.
4. Camino de instalación distinto según plataforma: Android/Chrome/Edge tienen una API real (`beforeinstallprompt`); iOS Safari no tiene ninguna, solo instrucciones manuales.
5. Si no hay ningún camino de instalación disponible (ni `beforeinstallprompt` ni iOS Safari), no se muestra nada — ni el modal automático ni la entrada del menú.

Fuera de alcance: forzar o bloquear funcionalidad por no estar instalada; onboarding/tour más allá de este modal; detectar instalación en plataformas sin ninguna señal fiable (se asume "no instalada" si no hay evidencia de standalone).

## Diseño

### Detección de modo standalone

```ts
function estaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true // iOS Safari legacy
  );
}
```

### `apps/web/lib/use-instalar-app.ts` (nuevo hook)

```ts
interface EstadoInstalarApp {
  puedeInstalar: boolean;       // hay algún camino de instalación disponible
  plataforma: "android" | "ios" | null;
  visible: boolean;             // el modal automático debe mostrarse ahora
  instalar: () => Promise<void>; // dispara beforeinstallprompt (Android); no-op en iOS
  descartar: () => void;        // cierra y arma el cooldown
  abrirManual: () => void;      // fuerza visible=true, ignorando el timer/cooldown (desde el menú)
}
```

Comportamiento:
- Si `estaStandalone()` → `puedeInstalar: false`, `visible` siempre `false`, no arma timer ni listeners.
- Si no standalone: detecta plataforma por UA (`/iPad|iPhone|iPod/` sin `MSStream` → `"ios"`) y escucha `beforeinstallprompt` en `window` (`preventDefault()`, guarda el evento en un `ref`) → si llega, `plataforma: "android"`, `puedeInstalar: true`. Si es iOS y no standalone, `puedeInstalar: true` sin esperar ningún evento (no existe API, las instrucciones manuales siempre están disponibles). Si no es iOS y `beforeinstallprompt` nunca llega (navegador sin soporte, o ya instalada de otra forma), `puedeInstalar: false`.
- Timer: si `puedeInstalar`, arranca un `setTimeout` de 45s al montar; si no fue descartado dentro del cooldown (`localStorage: sismos:instalar-dismiss`, timestamp, cooldown de 14 días) y no se instaló ya (`localStorage: sismos:instalada`), marca `visible: true`.
- `instalar()`: en Android, llama a `deferredPrompt.prompt()`, espera `userChoice`; si `outcome === "accepted"`, guarda `sismos:instalada` y `visible: false`. En iOS es un no-op (el botón de acción no existe ahí, ver UI).
- Evento `appinstalled` en `window`: guarda `sismos:instalada = true` y `visible: false`, sin importar cómo se instaló.
- `descartar()`: guarda `sismos:instalar-dismiss = Date.now()`, `visible: false`.
- `abrirManual()`: `visible: true` directo, sin chequear cooldown (para la entrada del menú).

### `apps/web/components/instalar/ModalInstalarApp.tsx` (nuevo)

Mismo patrón visual que `ModalConfiguracion` (card centrada `neutral-900`, `rounded-2xl`, overlay). Contenido según `plataforma`:

- **Android/Chrome/Edge**: copy breve + botón "Instalar" (llama `instalar()`) + "Ahora no" (llama `descartar()`).
- **iOS**: copy explicando el paso manual — "Tocá el ícono Compartir (⬆️) en la barra del navegador y elegí 'Agregar a inicio'" — sin botón de acción real, solo "Entendido" (llama `descartar()`).

Copy honesto en ambos casos: menciona que en iOS las notificaciones push solo funcionan así, y que en general se siente como una app real (pantalla completa, ícono propio) — sin prometer nada que no sea cierto, y dejando claro que es opcional.

### `apps/web/components/menu/MenuLateral.tsx`

Nueva entrada "Instalar app" (ícono simple, ej. flecha hacia una casilla) debajo de "Notificaciones", visible solo si `puedeInstalar` es `true` (oculta si ya está standalone o si no hay ningún camino de instalación). `onClick` llama `abrirManual()`.

### Integración

`ModalInstalarApp` se monta una vez a nivel de `MapaConHistorial.tsx` (o el componente raíz que ya orquesta los otros modales/paneles), controlado por el hook `useInstalarApp()` compartido con `MenuLateral` (mismo patrón que `useUbicacionUsuario` se comparte hoy entre `ModalConfiguracion` y `MapaSismos`).

## Testing / verificación

- Chrome desktop/Android, sin instalar: a los 45s de uso aparece el modal; "Instalar" dispara el prompt nativo del navegador; aceptarlo oculta el modal y hace desaparecer la entrada del menú en la siguiente carga.
- Abrir ya instalada (standalone): el modal nunca aparece automáticamente, y la entrada del menú tampoco existe.
- Safari iOS, no instalada: a los 45s aparece el modal con instrucciones manuales, sin botón de instalación real; "Entendido" lo descarta.
- Descartar el modal automático → no reaparece solo en la misma sesión ni en cargas subsecuentes hasta pasado el cooldown; la entrada "Instalar app" del menú sigue abriendo el modal manualmente en cualquier momento.
- Navegador sin `beforeinstallprompt` y no-iOS (ej. Firefox desktop): ni el modal ni la entrada del menú aparecen.
