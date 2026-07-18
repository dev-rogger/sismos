# Zoom automático a sismos nuevos — design

## Propósito

Cuando el usuario tiene la app/página abierta y llega un sismo nuevo (detectado por el polling que ya existe cada 30s en `MapaSismos.tsx`), la cámara del mapa debe alejarse (dar contexto), acercarse al epicentro, y mostrar la info del sismo (lugar, magnitud, hora) automáticamente — sin que el usuario tenga que clickear nada. Es la contraparte "app abierta" de lo que las notificaciones push ya resuelven para "app cerrada".

Decisiones de scope (de la conversación de brainstorming):
- Alcance configurable: **todo el mundo** o **mi país** (detectado por geolocalización), default **mi país**.
- Umbral de magnitud: **se reusa el mismo valor M4-M7** que ya usan las notificaciones push (una sola fuente de verdad, un solo slider en el modal), porque el feed CSN no tiene piso propio y dispara con cualquier temblor chico de Chile.
- Toggle maestro "Zoom automático": **activado por defecto**.
- Si no hay geolocalización disponible (rechazada o no soportada) mientras el alcance es "Mi país": el zoom automático sigue funcionando pero sin filtrar por país (equivalente a "todo el mundo"), sin bloquear la función ni pisar la preferencia guardada.
- El popup de selección (hoy lugar + magnitud) se enriquece con la hora, y ese enriquecimiento aplica a **toda** selección de sismo (click en marcador, click en historial, deep-link de push, zoom automático) — no solo al caso nuevo.
- Efecto de cámara: **alejar a vista amplia, pausa breve, acercar al epicentro** (no un flyTo directo).

## Detección de país por coordenadas

`@rapideditor/country-coder` ya es dependencia del monorepo (usada en `packages/shared/src/normalize/usgs.ts` vía `emojiFlag()` para ponerle bandera a los sismos USGS). Es una librería pesada (~700KB sin comprimir, con datos geográficos) — no conviene bundlearla en el cliente solo para resolver la bandera del usuario una vez.

En su lugar, nueva ruta server-side:

**`apps/web/app/api/geo/country/route.ts`**
```ts
import { NextResponse } from "next/server";
import { emojiFlag } from "@rapideditor/country-coder";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return NextResponse.json({ error: "Invalid lat/lon" }, { status: 400 });
  }

  const bandera = emojiFlag([lon, lat]) ?? null;
  return NextResponse.json({ bandera });
}
```

`apps/web/package.json` agrega `@rapideditor/country-coder` como dependencia directa (mismo patrón que `apps/ingestor` agregó `web-push` directamente aunque sea parte del monorepo).

## Dónde viven los hooks (evitar el problema de `localStorage` same-tab)

`localStorage` no dispara el evento `storage` para cambios hechos desde la misma pestaña (solo entre pestañas/ventanas distintas). Si `MapaSismos` y `ModalConfiguracion` llamaran cada uno a su propia instancia de `useUmbralMagnitud`/`useZoomAutomatico`, cambiar el toggle en el modal no actualizaría el comportamiento del mapa hasta recargar la página.

Para evitar esto, ambos hooks se llaman **una sola vez, en `MapaSismos.tsx`** (que ya es el ancestro común: renderiza `BotonConfiguracion`, que renderiza `ModalConfiguracion`). Los valores y setters bajan como props:

`MapaSismos` → `BotonConfiguracion` (nuevas props: `umbralMagnitud`, `onUmbralMagnitudChange`, `zoomAutomaticoActivo`, `onZoomAutomaticoActivoChange`, `zoomAutomaticoAlcance`, `onZoomAutomaticoAlcanceChange`) → `ModalConfiguracion` (mismas props, ya no llama a `useUmbralMagnitud`/`useZoomAutomatico` por su cuenta).

`usePushNotifications` se sigue llamando dentro de `ModalConfiguracion` (no tiene el problema de sync porque su estado vive en el servidor vía `endpoint`, no en `localStorage`), pero ahora recibe `umbralMagnitud` por prop en vez de manejar su propio default interno para la UI.

## Umbral de magnitud compartido

Hoy `magnitudMinima` para push vive como estado interno de `usePushNotifications` (default 4, solo se actualiza al llamar `activar`/`actualizarUmbral`, no se persiste en el cliente). Pasa a ser una única fuente de verdad persistida en `localStorage`, consumida por ambas features (instanciada en `MapaSismos`, ver sección anterior):

**`apps/web/lib/use-umbral-magnitud.ts`** (nuevo, pequeño):
```ts
"use client";
import { useState, useEffect } from "react";

const STORAGE_KEY = "sismos:magnitudMinima";
const DEFAULT_UMBRAL = 4;

export function useUmbralMagnitud() {
  const [umbral, setUmbralState] = useState(DEFAULT_UMBRAL);

  useEffect(() => {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado) setUmbralState(Number(guardado));
  }, []);

  function setUmbral(valor: number) {
    setUmbralState(valor);
    localStorage.setItem(STORAGE_KEY, String(valor));
  }

  return { umbral, setUmbral };
}
```

`usePushNotifications` deja de manejar su propio `magnitudMinima` interno como fuente de verdad de UI — `ModalConfiguracion` pasa el valor de `useUmbralMagnitud()` a `activar(umbral)` / `actualizarUmbral(umbral)`. El hook de push conserva su estado interno solo como reflejo de "lo último que se mandó al servidor" (no cambia su interfaz pública).

## Hook de zoom automático

**`apps/web/lib/use-zoom-automatico.ts`** (nuevo):

```ts
"use client";
import { useState, useEffect, useCallback } from "react";

type Alcance = "mundial" | "mi-pais";

const KEY_ACTIVO = "sismos:zoomAutomaticoActivo";
const KEY_ALCANCE = "sismos:zoomAutomaticoAlcance";
const KEY_BANDERA = "sismos:miPaisBandera";

export function useZoomAutomatico() {
  const [activo, setActivoState] = useState(true);
  const [alcance, setAlcanceState] = useState<Alcance>("mi-pais");
  const [miPaisBandera, setMiPaisBandera] = useState<string | null>(null);

  // init desde localStorage (activo default true, alcance default "mi-pais")
  useEffect(() => {
    const activoGuardado = localStorage.getItem(KEY_ACTIVO);
    if (activoGuardado !== null) setActivoState(activoGuardado === "true");
    const alcanceGuardado = localStorage.getItem(KEY_ALCANCE) as Alcance | null;
    if (alcanceGuardado) setAlcanceState(alcanceGuardado);
    const banderaGuardada = localStorage.getItem(KEY_BANDERA);
    if (banderaGuardada) setMiPaisBandera(banderaGuardada);
  }, []);

  // si alcance es "mi-pais" y no hay bandera cacheada, pedir geolocalización
  useEffect(() => {
    if (alcance !== "mi-pais" || miPaisBandera || !("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch(`/api/geo/country?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`)
          .then((res) => res.json())
          .then((data: { bandera: string | null }) => {
            if (data.bandera) {
              setMiPaisBandera(data.bandera);
              localStorage.setItem(KEY_BANDERA, data.bandera);
            }
          })
          .catch((error) => console.error("[useZoomAutomatico] country lookup failed:", error));
      },
      (error) => console.error("[useZoomAutomatico] geolocation failed:", error),
    );
  }, [alcance, miPaisBandera]);

  const setActivo = useCallback((valor: boolean) => {
    setActivoState(valor);
    localStorage.setItem(KEY_ACTIVO, String(valor));
  }, []);

  const setAlcance = useCallback((valor: Alcance) => {
    setAlcanceState(valor);
    localStorage.setItem(KEY_ALCANCE, valor);
  }, []);

  return { activo, alcance, miPaisBandera, setActivo, setAlcance };
}
```

Nota: si `alcance === "mi-pais"` pero `miPaisBandera` sigue `null` (permiso rechazado, geolocalización no soportada, o falló la llamada a la API), la función de match (ver más abajo) trata el caso como "sin filtro de país" — no se persiste ningún cambio de alcance, solo se degrada el comportamiento en runtime.

## Disparador (en `MapaSismos.tsx`)

`MapaSismos` llama directamente a `useZoomAutomatico()` y `useUmbralMagnitud()` (ver sección "Dónde viven los hooks"), obteniendo `{ activo: zoomAutomaticoActivo, alcance: zoomAutomaticoAlcance, miPaisBandera }` y `{ umbral: umbralMagnitud }`. No son props — nacen ahí y bajan a `BotonConfiguracion`/`ModalConfiguracion`. La prop existente `magnitudMinima` de `MapaSismos` sigue siendo la del **filtro de visualización** (historial) — no se toca ni se confunde con `umbralMagnitud` (el del zoom automático/push).

Función de match (nueva, junto a `pasaFiltro`):
```ts
function calificaParaZoomAutomatico(
  sismo: SismoMapa,
  alcance: "mundial" | "mi-pais",
  miPaisBandera: string | null,
  umbral: number,
): boolean {
  if (sismo.magnitud < umbral) return false;
  if (alcance === "mi-pais" && miPaisBandera && sismo.bandera !== miPaisBandera) return false;
  return true;
}
```

En el `.then` del polling (donde hoy se hace `nuevosRef.current.add(sismo.externalId)`), para cada sismo verdaderamente nuevo (no visto antes en `todosSismosRef`) que califica, se agrega a un estado `colaZoom: SismoMapa[]` (estado de React, no ref — así el efecto de abajo se re-ejecuta solo al encolar, sin necesitar un "tick" artificial):

```ts
const [colaZoom, setColaZoom] = useState<SismoMapa[]>([]);
const procesandoZoomRef = useRef(false);

// dentro del .then() del polling, junto al resto del procesamiento de cada sismo nuevo:
if (calificaParaZoomAutomatico(sismo, zoomAutomaticoAlcance, miPaisBandera, umbralMagnitud)) {
  setColaZoom((cola) => [...cola, sismo]);
}
```

Efecto que consume la cola de a uno (evita animaciones solapadas si llegan varios calificados en el mismo poll):

```ts
useEffect(() => {
  const map = mapRef.current;
  if (!zoomAutomaticoActivo || !map || procesandoZoomRef.current || colaZoom.length === 0) return;

  procesandoZoomRef.current = true;
  const [siguiente, ...resto] = colaZoom;

  map.flyTo({ zoom: 2, speed: 0.8 }); // alejar: da contexto geográfico
  map.once("moveend", () => {
    map.flyTo({
      center: [siguiente.longitud, siguiente.latitud],
      zoom: Math.max(6, map.getZoom()),
      speed: 1.2,
    }); // acercar: vuela al epicentro
    onSeleccionarDesdeMapaRef.current({
      externalId: siguiente.externalId,
      latitud: siguiente.latitud,
      longitud: siguiente.longitud,
      magnitud: siguiente.magnitud,
      lugar: siguiente.lugar,
      fecha: siguiente.fecha,
    });
    procesandoZoomRef.current = false;
    setColaZoom(resto);
  });
}, [colaZoom, zoomAutomaticoActivo]);
```

`setColaZoom(resto)` al final del `moveend` dispara el efecto de nuevo si quedaban más sismos encolados, procesándolos uno detrás del otro.

## Popup enriquecido con hora (aplica en todos lados)

`SismoSeleccionado` (en `apps/web/lib/tipos-sismo.ts`) agrega `fecha: string`:

```ts
export interface SismoSeleccionado {
  externalId: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  lugar: string;
  fecha: string;
}
```

Puntos que arman este objeto y necesitan agregar `fecha`:
- `MapaSismos.tsx`: click en marcador normal (`crearMarcador`'s click handler) — ya tiene `sismo.fecha` disponible (viene de `SismoMapa`).
- `PanelHistorial.tsx`: click en item del historial — ya tiene `evento.fecha` disponible.
- `apps/web/app/page.tsx`: `parseSismoDesdeQuery` — agrega parseo de un nuevo query param `fecha`.
- `apps/ingestor/lib/send-push.ts`: el `url` que arma `enviarPushParaSismo` agrega `&fecha=${encodeURIComponent(evento.fecha.toISOString())}`.
- Zoom automático nuevo (arriba) — ya usa `sismo.fecha` del `SismoMapa` polleado.

El popup en el efecto de `sismoSeleccionado` (`MapaSismos.tsx`) pasa de:
```html
<strong>${lugar}</strong><br/>M${magnitud}
```
a:
```html
<strong>${lugar}</strong><br/>M${magnitud} — ${new Date(fecha).toLocaleString("es-CL")}
```

## UI en `ModalConfiguracion.tsx`

Nueva sección **"Zoom automático"**, arriba de la sección "Notificaciones" existente (no depende de push). `ModalConfiguracion` recibe estos valores por prop (ver sección "Dónde viven los hooks" — ya no llama a los hooks por su cuenta):

- Toggle `aria-pressed` (mismo patrón visual que "Solo Chile" / "Activar notificaciones") ligado a `zoomAutomaticoActivo`/`onZoomAutomaticoActivoChange`.
- Selector de alcance: dos botones pill mutuamente excluyentes, "Todo el mundo" / "Mi país", ligados a `zoomAutomaticoAlcance`/`onZoomAutomaticoAlcanceChange`.
- El slider M4-M7 (hoy solo visible si `suscrito`) se saca de ese condicional y pasa a estar siempre visible en su propia sub-sección "Umbral mínimo", ligado a `umbralMagnitud`/`onUmbralMagnitudChange`. Tanto la sección de push (al activar/actualizar, vía `usePushNotifications`) como la de zoom automático leen de este mismo valor.

No se agrega ícono ni librería nueva de UI — mismo patrón de botones existente.

## Manejo de errores

- Geolocalización rechazada/no soportada → zoom automático sigue activo, sin filtro de país (equivalente a "mundial"), sin tocar el `alcance` guardado.
- Falla la llamada a `/api/geo/country` (red, 400, 500) → mismo comportamiento, se loguea con `console.error`, no bloquea nada.
- El feed CSN sin piso de magnitud queda cubierto por el umbral compartido (nunca hay "modo sin umbral" para Chile).

## Testing

Validación manual (sin test suite automatizado en el proyecto, mismo criterio que push notifications):
- El toggle y el alcance persisten en reloads (localStorage).
- Con alcance "Mi país": aceptar el permiso de geolocalización dispara la detección de país; un sismo nuevo de mi país dispara el zoom, uno de otro país no.
- Rechazar el permiso de geolocalización no rompe nada — el zoom automático sigue funcionando como si fuera "mundial".
- Simular un sismo nuevo (vía script directo a la DB o mock del endpoint de polling) que supera el umbral: se ve la secuencia alejar → pausa → acercar → popup con lugar + magnitud + hora.
- Un sismo bajo el umbral no dispara la secuencia, solo aparece como marcador pulsante normal (comportamiento ya existente, sin cambios).
- El popup enriquecido con hora aparece igual en: click de marcador, click de historial, apertura por deep-link de push, y zoom automático.
