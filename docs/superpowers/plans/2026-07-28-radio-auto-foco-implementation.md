# Radio geográfico para el auto-foco del mapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reusar el radio/ubicación ya configurado para las push notifications como filtro adicional del auto-foco del mapa, y convertir la ubicación del usuario en un dato compartido, persistente (localStorage) y visible como marcador en el mapa principal, con un botón para pedirla/recentrar.

**Architecture:** Un hook nuevo `useUbicacionUsuario()` (mismo patrón que `useFiltroMapa`, localStorage-backed) se instancia **una sola vez** en `MapaConHistorial.tsx` y se pasa por props tanto a `MapaSismos` (mapa principal: botón, marcador, filtro de auto-foco) como a `ModalConfiguracion` (push notifications) — evita que dos instancias independientes del hook queden desincronizadas dentro de la misma sesión, ya que ambos componentes están siempre montados.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + MapLibre GL + `@sismos/shared` (Haversine `distanciaKm`, ya existe).

## Global Constraints

- No hay test runner en el repo (`apps/web` no tiene Jest/Vitest configurado) — verificación vía `pnpm --filter web check-types`, `pnpm --filter web lint`, y verificación manual en navegador. No agregar infraestructura de testing nueva; seguir el patrón existente del repo.
- El radio/ubicación es un único valor compartido entre push notifications y auto-foco del mapa — no se duplica UI de slider en el mapa principal.
- En el mapa principal solo se dibuja el punto "estás aquí"; el círculo del radio sigue viviendo solo en el mini-mapa de Configuración.
- El permiso de geolocalización solo se pide por una acción explícita del usuario (abrir Configuración y desactivar "Mundial", o tocar "📍 Mi ubicación" en el mapa) — nunca automáticamente al cargar la app.
- El botón "📍 Mi ubicación": sin ubicación conocida pide permiso y centra; con ubicación ya conocida, solo recentra (no vuelve a pedir permiso).
- Si `radioKm` es `null` (o nunca se configuró ubicación), el comportamiento del auto-foco no cambia respecto a hoy.

---

### Task 1: Hook compartido `useUbicacionUsuario`

**Files:**
- Create: `apps/web/lib/use-ubicacion-usuario.ts`

**Interfaces:**
- Consumes: `esCentroValido`, `esRadioKmValido` de `apps/web/lib/radio-notificacion.ts` (ya existen, sin cambios).
- Produces: `useUbicacionUsuario(): { ubicacion: UbicacionUsuario; pedirUbicacion: () => Promise<{ lat: number; lon: number } | null>; setRadioKm: (radioKm: number | null) => void }` y el tipo exportado `UbicacionUsuario = { centro: { lat: number; lon: number } | null; radioKm: number | null }`. Usado por Task 3 (`ModalConfiguracion`, `MapaConHistorial`) y Task 4 (`MapaSismos`, `MapaConHistorial`).

- [ ] **Step 1: Crear el hook**

```ts
// apps/web/lib/use-ubicacion-usuario.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { esCentroValido, esRadioKmValido } from "./radio-notificacion";

const CLAVE_STORAGE = "sismos:ubicacion";

export interface UbicacionUsuario {
  centro: { lat: number; lon: number } | null;
  radioKm: number | null;
}

const UBICACION_DEFAULT: UbicacionUsuario = { centro: null, radioKm: null };

function esUbicacionValida(valor: unknown): valor is UbicacionUsuario {
  if (!valor || typeof valor !== "object") return false;
  const v = valor as Record<string, unknown>;
  const centroOk = v.centro === null || esCentroValido(v.centro);
  const radioOk = v.radioKm === null || esRadioKmValido(v.radioKm);
  return centroOk && radioOk;
}

function leerUbicacionGuardada(): UbicacionUsuario {
  try {
    const raw = window.localStorage.getItem(CLAVE_STORAGE);
    if (!raw) return UBICACION_DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    return esUbicacionValida(parsed) ? parsed : UBICACION_DEFAULT;
  } catch {
    return UBICACION_DEFAULT;
  }
}

export function useUbicacionUsuario() {
  const [ubicacion, setUbicacion] = useState<UbicacionUsuario>(UBICACION_DEFAULT);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    setUbicacion(leerUbicacionGuardada());
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(ubicacion));
    } catch {
      // localStorage puede fallar (Safari privado, cuota excedida); seguimos
      // funcionando en memoria para esta sesión.
    }
  }, [ubicacion, cargado]);

  const pedirUbicacion = useCallback((): Promise<
    { lat: number; lon: number } | null
  > => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          const centro = {
            lat: posicion.coords.latitude,
            lon: posicion.coords.longitude,
          };
          setUbicacion((actual) => ({ ...actual, centro }));
          resolve(centro);
        },
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 8000 },
      );
    });
  }, []);

  const setRadioKm = useCallback((radioKm: number | null) => {
    setUbicacion((actual) => ({ ...actual, radioKm }));
  }, []);

  return { ubicacion, pedirUbicacion, setRadioKm };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web check-types`
Expected: sin errores (el archivo no está importado por nadie todavía, así que solo valida que compile en sí mismo).

- [ ] **Step 3: Lint**

Run: `pnpm --filter web lint`
Expected: sin errores ni warnings sobre este archivo.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/use-ubicacion-usuario.ts
git commit -m "feat(web): add shared useUbicacionUsuario hook"
```

---

### Task 2: Marcador "estás aquí" (elemento + estilos)

**Files:**
- Modify: `apps/web/components/mapa/marcador.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `crearElementoUbicacion(): HTMLDivElement` desde `marcador.ts`, usado por Task 4 en `MapaSismos.tsx`. Clase CSS `.marcador-ubicacion`.

- [ ] **Step 1: Agregar `crearElementoUbicacion` a `marcador.ts`**

Agregar al final de `apps/web/components/mapa/marcador.ts` (después de `crearElementoSeleccion`):

```ts
export function crearElementoUbicacion(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-ubicacion";
  return el;
}
```

- [ ] **Step 2: Agregar el estilo en `globals.css`**

En `apps/web/app/globals.css`, agregar después del bloque `@keyframes pulso-seleccion` (línea 67-76 actual) y antes de `.popup-sismo .maplibregl-popup-content`:

```css
.marcador-ubicacion {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background-color: #38bdf8;
  border: 2px solid rgba(255, 255, 255, 0.9);
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.25);
}
```

Sin animación de pulso (a diferencia de `.marcador-seleccion`) — es un punto fijo, no algo que requiera atención puntual.

- [ ] **Step 3: Typecheck y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores (función exportada sin uso todavía no genera error de lint, solo de "no usada" si fuera una variable local — al ser export, no aplica).

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/mapa/marcador.ts apps/web/app/globals.css
git commit -m "feat(web): add estás-aquí marker element and styles"
```

---

### Task 3: Rewire de Configuración sobre el hook compartido

**Files:**
- Modify: `apps/web/components/configuracion/SelectorRadioMapa.tsx`
- Modify: `apps/web/components/configuracion/ModalConfiguracion.tsx`
- Modify: `apps/web/components/MapaConHistorial.tsx`

**Interfaces:**
- Consumes: `useUbicacionUsuario` (Task 1), `UbicacionUsuario` type (Task 1).
- Produces: `ModalConfiguracionProps` gana `ubicacion: UbicacionUsuario`, `onPedirUbicacion: () => Promise<{lat,lon}|null>`, `onSetRadioKm: (radioKm: number | null) => void`. `SelectorRadioMapaProps` cambia de `{ radioKm, onUbicacionLista }` a `{ centro: {lat,lon}, radioKm }`.

- [ ] **Step 1: Simplificar `SelectorRadioMapa` — recibe `centro` en vez de geolocalizar internamente**

Reemplazar el contenido completo de `apps/web/components/configuracion/SelectorRadioMapa.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { generarCirculoGeografico } from "../../lib/circulo-geografico";

const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";
const FUENTE_CIRCULO = "circulo-radio";

interface SelectorRadioMapaProps {
  centro: { lat: number; lon: number };
  radioKm: number;
}

export default function SelectorRadioMapa({
  centro,
  radioKm,
}: SelectorRadioMapaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const actualizarCirculo = (radio: number) => {
    const map = mapRef.current;
    if (!map) return;
    const circulo = generarCirculoGeografico(centro, radio);
    const fuente = map.getSource(FUENTE_CIRCULO) as
      | maplibregl.GeoJSONSource
      | undefined;
    fuente?.setData(circulo);

    const lngs = circulo.geometry.coordinates[0]!.map((c) => c[0]!);
    const lats = circulo.geometry.coordinates[0]!.map((c) => c[1]!);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 24, duration: 300 },
    );
  };

  useEffect(() => {
    if (!contenedorRef.current) return;

    const map = new maplibregl.Map({
      container: contenedorRef.current,
      style: ESTILO_URL,
      center: [centro.lon, centro.lat],
      zoom: 6,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(FUENTE_CIRCULO, {
        type: "geojson",
        data: generarCirculoGeografico(centro, radioKm),
      });
      map.addLayer({
        id: `${FUENTE_CIRCULO}-relleno`,
        type: "fill",
        source: FUENTE_CIRCULO,
        paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: `${FUENTE_CIRCULO}-borde`,
        type: "line",
        source: FUENTE_CIRCULO,
        paint: { "line-color": "#38bdf8", "line-width": 2 },
      });
      map.addLayer({
        id: `${FUENTE_CIRCULO}-centro`,
        type: "circle",
        source: FUENTE_CIRCULO,
        filter: ["==", "$type", "Point"],
        paint: { "circle-color": "#38bdf8", "circle-radius": 5 },
      });
      actualizarCirculo(radioKm);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    actualizarCirculo(radioKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioKm]);

  return (
    <div
      ref={contenedorRef}
      className="h-40 w-full overflow-hidden rounded-xl border border-neutral-800"
    />
  );
}
```

Se elimina toda la lógica de geolocalización interna (`estado`, `centroRef`, el primer `useEffect` que llamaba `navigator.geolocation`) — ahora es un componente puramente presentacional que asume que `centro` ya es válido (el padre decide cuándo renderizarlo).

- [ ] **Step 2: Reescribir `ModalConfiguracion` sobre el hook compartido**

Reemplazar el contenido completo de `apps/web/components/configuracion/ModalConfiguracion.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { usePushNotifications } from "../../lib/use-push-notifications";
import SelectorRadioMapa from "./SelectorRadioMapa";
import {
  RADIO_KM_MIN,
  RADIO_KM_MAX,
  RADIO_KM_DEFAULT,
} from "../../lib/radio-notificacion";
import type { UbicacionUsuario } from "../../lib/use-ubicacion-usuario";

interface ModalConfiguracionProps {
  abierto: boolean;
  onCerrar: () => void;
  ubicacion: UbicacionUsuario;
  onPedirUbicacion: () => Promise<{ lat: number; lon: number } | null>;
  onSetRadioKm: (radioKm: number | null) => void;
}

export default function ModalConfiguracion({
  abierto,
  onCerrar,
  ubicacion,
  onPedirUbicacion,
  onSetRadioKm,
}: ModalConfiguracionProps) {
  const {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    activar,
    desactivar,
    actualizarUmbral,
  } = usePushNotifications();
  const [umbralLocal, setUmbralLocal] = useState(magnitudMinima);
  const [mundialLocal, setMundialLocal] = useState(ubicacion.radioKm === null);
  const [radioKmLocal, setRadioKmLocal] = useState(
    ubicacion.radioKm ?? RADIO_KM_DEFAULT,
  );
  const [pidiendoUbicacion, setPidiendoUbicacion] = useState(false);

  // Pide geolocalización solo si el modal está abierto y el usuario
  // desactivó "Mundial" — nunca de forma automática al montar la app
  // (ModalConfiguracion siempre está montado, solo oculto vía `abierto`).
  useEffect(() => {
    if (!abierto || mundialLocal || ubicacion.centro || pidiendoUbicacion) {
      return;
    }
    setPidiendoUbicacion(true);
    onPedirUbicacion().then(() => setPidiendoUbicacion(false));
  }, [abierto, mundialLocal, ubicacion.centro, pidiendoUbicacion, onPedirUbicacion]);

  if (!abierto) return null;

  const preferenciaRadio = () =>
    mundialLocal || !ubicacion.centro
      ? { centro: null, radioKm: null }
      : { centro: ubicacion.centro, radioKm: radioKmLocal };

  const hayFormaCambios =
    umbralLocal !== magnitudMinima ||
    mundialLocal !== (ubicacion.radioKm === null) ||
    (!mundialLocal && radioKmLocal !== ubicacion.radioKm);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            Notificaciones
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        {permission === "unsupported" && (
          <p className="text-sm text-neutral-400">
            Tu navegador o dispositivo no soporta notificaciones push. En
            iPhone, primero agregá esta app a la pantalla de inicio.
          </p>
        )}

        {permission === "denied" && (
          <p className="text-sm text-neutral-400">
            Bloqueaste las notificaciones para este sitio. Para activarlas,
            cambiá el permiso desde la configuración de notificaciones de tu
            navegador.
          </p>
        )}

        {(permission === "default" || permission === "granted") && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                if (suscrito) {
                  desactivar();
                  return;
                }
                const preferencia = preferenciaRadio();
                onSetRadioKm(preferencia.radioKm);
                activar(umbralLocal, preferencia);
              }}
              aria-pressed={suscrito}
              className={`flex min-h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                suscrito
                  ? "border-sky-500 bg-sky-500/10 text-sky-400"
                  : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
              }`}
            >
              {loading
                ? "..."
                : suscrito
                  ? "Desactivar notificaciones"
                  : "Activar notificaciones"}
            </button>

            {suscrito && (
              <div className="mt-4">
                <label
                  htmlFor="umbral-push"
                  className="mb-2 block text-xs text-neutral-400"
                >
                  Avisar desde M{umbralLocal}+
                </label>
                <input
                  id="umbral-push"
                  type="range"
                  min={4}
                  max={7}
                  step={1}
                  value={umbralLocal}
                  onChange={(e) => setUmbralLocal(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />

                <div className="mt-4 border-t border-neutral-800 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-neutral-400">Alcance</span>
                    <button
                      type="button"
                      onClick={() => setMundialLocal((v) => !v)}
                      aria-pressed={mundialLocal}
                      className={`flex min-h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors ${
                        mundialLocal
                          ? "border-sky-500 bg-sky-500/10 text-sky-400"
                          : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
                      }`}
                    >
                      🌎 Mundial, sin rango
                    </button>
                  </div>

                  {!mundialLocal && (
                    <div className="mt-3">
                      {pidiendoUbicacion && (
                        <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-800/50 text-xs text-neutral-400">
                          Buscando tu ubicación…
                        </div>
                      )}

                      {!pidiendoUbicacion && ubicacion.centro && (
                        <>
                          <SelectorRadioMapa
                            centro={ubicacion.centro}
                            radioKm={radioKmLocal}
                          />
                          <p className="mt-3 text-xs text-neutral-400">
                            Avisar hasta a {radioKmLocal} km de tu ubicación
                          </p>
                          <input
                            type="range"
                            min={RADIO_KM_MIN}
                            max={RADIO_KM_MAX}
                            step={25}
                            value={radioKmLocal}
                            onChange={(e) =>
                              setRadioKmLocal(Number(e.target.value))
                            }
                            className="mt-2 w-full accent-sky-500"
                          />
                        </>
                      )}

                      {!pidiendoUbicacion && !ubicacion.centro && (
                        <p className="mt-3 text-xs text-neutral-400">
                          No pudimos acceder a tu ubicación, así que las
                          notificaciones quedan sin límite de distancia.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={loading || !hayFormaCambios}
                  onClick={() => {
                    const preferencia = preferenciaRadio();
                    onSetRadioKm(preferencia.radioKm);
                    actualizarUmbral(umbralLocal, preferencia);
                  }}
                  className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Instanciar el hook en `MapaConHistorial` y pasarlo a `ModalConfiguracion`**

En `apps/web/components/MapaConHistorial.tsx`, agregar el import y la llamada al hook, y pasar las nuevas props a `ModalConfiguracion` (todavía NO a `MapaSismos` — eso es Task 4):

```tsx
"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import PantallaHistorial from "./historial/PantallaHistorial";
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import { useFiltroMapa } from "../lib/use-filtro-mapa";
import { useUbicacionUsuario } from "../lib/use-ubicacion-usuario";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";

interface MapaConHistorialProps {
  sismosIniciales: SismoMapa[];
  sismoInicial: SismoSeleccionado | null;
}

export default function MapaConHistorial({
  sismosIniciales,
  sismoInicial,
}: MapaConHistorialProps) {
  const [sismoSeleccionado, setSismoSeleccionado] =
    useState<SismoSeleccionado | null>(sismoInicial);
  const { filtro, setFiltro } = useFiltroMapa();
  const { ubicacion, pedirUbicacion, setRadioKm } = useUbicacionUsuario();
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false);

  const seleccionarDesdeMapa = (sismo: SismoSeleccionado | null) => {
    setSismoSeleccionado(sismo);
    setHistorialAbierto(false);
  };

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          sismosIniciales={sismosIniciales}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={seleccionarDesdeMapa}
          filtro={filtro}
          onFiltroChange={setFiltro}
        />
      </div>
      <PanelHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
      />
      {historialAbierto && (
        <PantallaHistorial
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionar={setSismoSeleccionado}
          onCerrar={() => setHistorialAbierto(false)}
        />
      )}
      <MenuLateral
        onAbrirHistorial={() => setHistorialAbierto(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
      />
      <ModalConfiguracion
        abierto={notificacionesAbiertas}
        onCerrar={() => setNotificacionesAbiertas(false)}
        ubicacion={ubicacion}
        onPedirUbicacion={pedirUbicacion}
        onSetRadioKm={setRadioKm}
      />
    </>
  );
}
```

- [ ] **Step 4: Typecheck y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Run: `pnpm --filter web dev`, abrir la app en el navegador.
1. Abrir Configuración (ícono del menú lateral) → Activar notificaciones → desactivar "Mundial, sin rango".
2. Conceder el permiso de geolocalización cuando lo pida el navegador.
3. Confirmar que aparece "Buscando tu ubicación…" brevemente y luego el mini-mapa con el círculo centrado en tu ubicación.
4. Mover el slider de radio → el círculo se redibuja en vivo.
5. Tocar "Guardar" → cerrar el modal → volver a abrirlo → confirmar que el radio y el estado de "Mundial" quedan como los dejaste (ya no se resetea).
6. Recargar la página completa (F5) → abrir Configuración de nuevo → confirmar que el radio configurado sigue ahí y NO vuelve a pedir permiso de geolocalización.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/configuracion/SelectorRadioMapa.tsx apps/web/components/configuracion/ModalConfiguracion.tsx apps/web/components/MapaConHistorial.tsx
git commit -m "refactor(web): source push-notification radius/location from shared hook"
```

---

### Task 4: Botón "📍 Mi ubicación" + marcador en el mapa principal

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`
- Modify: `apps/web/components/MapaConHistorial.tsx`

**Interfaces:**
- Consumes: `UbicacionUsuario` (Task 1), `crearElementoUbicacion` (Task 2).
- Produces: `MapaSismosProps` gana `ubicacion: UbicacionUsuario`, `onPedirUbicacion: () => Promise<{lat,lon}|null>`. Task 5 lee `ubicacion` desde dentro de `MapaSismos` (ya prop-drilled por esta task) para el filtro de auto-foco.

- [ ] **Step 1: Agregar las nuevas props y el `ubicacionRef`**

En `apps/web/components/mapa/MapaSismos.tsx`, actualizar el import (línea 6) y la interfaz de props (líneas 18-24):

```tsx
import {
  crearElementoMarcador,
  crearElementoSeleccion,
  crearElementoUbicacion,
} from "./marcador";
```

```tsx
import type { UbicacionUsuario } from "../../lib/use-ubicacion-usuario";

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void;
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
  ubicacion: UbicacionUsuario;
  onPedirUbicacion: () => Promise<{ lat: number; lon: number } | null>;
}
```

Dentro del componente, agregar los parámetros nuevos y un ref para el marker de ubicación (junto a los refs existentes, después de `filtroRef`):

```tsx
export default function MapaSismos({
  sismosIniciales,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
  filtro,
  onFiltroChange,
  ubicacion,
  onPedirUbicacion,
}: MapaSismosProps) {
  // ... refs existentes sin cambios ...
  const marcadorUbicacionRef = useRef<maplibregl.Marker | null>(null);
```

- [ ] **Step 2: Dibujar/actualizar el marcador "estás aquí" cuando cambia `ubicacion.centro`**

Agregar un nuevo `useEffect` en `MapaSismos.tsx`, después del `useEffect` que reacciona a `[filtro]` (línea 225-230) y antes del que reacciona a `[sismoSeleccionado]`:

```tsx
useEffect(() => {
  const map = mapRef.current;
  if (!map || !ubicacion.centro) return;

  if (marcadorUbicacionRef.current) {
    marcadorUbicacionRef.current.setLngLat([
      ubicacion.centro.lon,
      ubicacion.centro.lat,
    ]);
    return;
  }

  marcadorUbicacionRef.current = new maplibregl.Marker({
    element: crearElementoUbicacion(),
  })
    .setLngLat([ubicacion.centro.lon, ubicacion.centro.lat])
    .addTo(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [ubicacion.centro]);
```

El mapa se crea de forma asíncrona en el primer `useEffect` (línea 157+); si `ubicacion.centro` ya está disponible en el primer render (ubicación guardada de una sesión previa), este efecto corre después de que `mapRef.current` exista porque React ejecuta los efectos en orden tras el commit — no hace falta lógica adicional de espera.

- [ ] **Step 3: Agregar el botón "📍 Mi ubicación"**

En el JSX final de `MapaSismos.tsx` (líneas 316-338), agregar el botón al grupo flotante existente, después de "Ver todo Chile":

```tsx
return (
  <div className="relative h-full w-full">
    <div ref={mapContainerRef} className="h-full w-full" />
    <div
      style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
      className="absolute right-3 z-10 flex items-center gap-2"
    >
      <BotonFiltroMapa filtro={filtro} onFiltroChange={onFiltroChange} />
      <button
        type="button"
        onClick={() =>
          mapRef.current?.fitBounds(CHILE_BOUNDS, {
            padding: CHILE_BOUNDS_PADDING,
            speed: 1.2,
          })
        }
        className="flex min-h-11 items-center rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        Ver todo Chile
      </button>
      <button
        type="button"
        onClick={async () => {
          const map = mapRef.current;
          if (!map) return;
          if (ubicacion.centro) {
            map.flyTo({
              center: [ubicacion.centro.lon, ubicacion.centro.lat],
              zoom: Math.max(map.getZoom(), 10),
              speed: 1.2,
            });
            return;
          }
          const centro = await onPedirUbicacion();
          if (centro) {
            map.flyTo({
              center: [centro.lon, centro.lat],
              zoom: Math.max(map.getZoom(), 10),
              speed: 1.2,
            });
          }
        }}
        aria-label="Mi ubicación"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        📍
      </button>
    </div>
  </div>
);
```

- [ ] **Step 4: Pasar las nuevas props desde `MapaConHistorial`**

En `apps/web/components/MapaConHistorial.tsx`, agregar `ubicacion` y `onPedirUbicacion` al `<MapaSismos>` (el resto del archivo ya quedó correcto desde Task 3):

```tsx
<MapaSismos
  sismosIniciales={sismosIniciales}
  sismoSeleccionado={sismoSeleccionado}
  onSeleccionarDesdeMapa={seleccionarDesdeMapa}
  filtro={filtro}
  onFiltroChange={setFiltro}
  ubicacion={ubicacion}
  onPedirUbicacion={pedirUbicacion}
/>
```

- [ ] **Step 5: Typecheck y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 6: Verificación manual**

Run: `pnpm --filter web dev` (si no sigue corriendo de la task anterior).
1. Recargar con `localStorage` limpio (o modo incógnito) → tocar "📍 Mi ubicación" en el mapa → conceder permiso → confirmar que aparece el marcador celeste "estás aquí" y el mapa vuela ahí.
2. Tocar el botón de nuevo → confirmar que solo recentra, sin volver a pedir permiso.
3. Recargar la página → confirmar que el marcador aparece solo al cargar, sin tocar el botón.
4. Abrir Configuración → confirmar que el mini-mapa de radio usa la MISMA ubicación (no pide permiso de nuevo ahí tampoco).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx apps/web/components/MapaConHistorial.tsx
git commit -m "feat(web): add my-location button and marker to the main map"
```

---

### Task 5: Filtro de radio en el auto-foco

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `distanciaKm` de `@sismos/shared` (ya existe), `ubicacion` prop (Task 4).

- [ ] **Step 1: Importar `distanciaKm` y agregar el `ubicacionRef`**

En `apps/web/components/mapa/MapaSismos.tsx`, actualizar el import de `@sismos/shared` (línea 11):

```tsx
import { regionChilePorLatitud, distanciaKm } from "@sismos/shared";
```

Agregar un ref junto a `filtroRef` (línea 107-108) para que el closure del `setInterval` vea el valor actual de `ubicacion` sin recrear el intervalo:

```tsx
const filtroRef = useRef(filtro);
filtroRef.current = filtro;
const ubicacionRef = useRef(ubicacion);
ubicacionRef.current = ubicacion;
```

- [ ] **Step 2: Sumar el criterio de distancia al cálculo de `nuevosQuePasanFiltro`**

Reemplazar el bloque en el callback de polling (líneas 194-196 actuales):

```tsx
const nuevosQuePasanFiltro = data.sismos.filter((s) =>
  pasaFiltro(s, filtroRef.current),
);
```

por:

```tsx
const nuevosQuePasanFiltro = data.sismos.filter((s) => {
  if (!pasaFiltro(s, filtroRef.current)) return false;
  const { centro, radioKm } = ubicacionRef.current;
  if (radioKm === null || centro === null) return true; // mundial
  return distanciaKm(centro.lat, centro.lon, s.latitud, s.longitud) <= radioKm;
});
```

El resto del callback (selección del más significativo, `onSeleccionarDesdeMapaRef.current(...)`) no cambia.

- [ ] **Step 3: Typecheck y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 4: Verificación manual con datos simulados**

Con el servidor local corriendo y una base de datos local (`pnpm docker:dev` si hace falta Postgres local):

1. En Configuración, configurar un radio chico (25 km) con tu ubicación real.
2. Insertar manualmente (vía el ingestor o un insert directo a la base local) un sismo de prueba con magnitud suficiente para pasar el `FiltroMapa` actual pero con lat/lon a más de 25 km de tu ubicación.
3. Esperar el siguiente ciclo de poll (≤15s) → confirmar que el sismo aparece como marcador nuevo (con pulso) pero el mapa NO vuela solo ni abre popup — el auto-foco no se disparó.
4. Insertar otro sismo de prueba, esta vez dentro del radio de 25 km → confirmar que esta vez sí se dispara el `flyTo` + popup automático.
5. Cambiar a "Mundial, sin rango" en Configuración → repetir el paso 2 → confirmar que esta vez SÍ se dispara el auto-foco (comportamiento igual al de antes de este cambio).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat(web): filter map auto-focus by the configured radius"
```

---

### Task 6: Verificación final end-to-end y limpieza

**Files:** Ninguno nuevo — solo verificación sobre lo ya implementado en Tasks 1-5.

- [ ] **Step 1: Build y typecheck completos del monorepo**

Run: `pnpm check-types && pnpm lint && pnpm build`
Expected: los tres comandos terminan sin errores en todos los packages/apps del monorepo (no solo `web`).

- [ ] **Step 2: Recorrido manual completo (spec `docs/superpowers/specs/2026-07-28-radio-auto-foco-design.md`, sección "Testing / verificación")**

Con `pnpm --filter web dev` corriendo:

1. Denegar el permiso de geolocalización al tocar "📍 Mi ubicación" → confirmar que no rompe nada, no aparece marcador, el botón sigue operable para reintentar (tocarlo de nuevo vuelve a pedir permiso, ya que `ubicacion.centro` sigue `null`).
2. Conceder el permiso → aparece el marcador "estás aquí", el mapa vuela ahí; tocar el botón de nuevo solo recentra.
3. Recargar la página con ubicación ya guardada en `localStorage` → el marcador aparece solo al cargar, sin pedir permiso de nuevo.
4. Radio chico configurado + sismo de prueba fuera del radio pero con magnitud suficiente → auto-foco NO se dispara (el sismo igual aparece como marcador/historial).
5. Mismo caso pero sismo dentro del radio → auto-foco SÍ se dispara.
6. Modo "Mundial, sin rango" (o ubicación nunca configurada) → auto-foco se comporta igual que antes de este trabajo.
7. Confirmar visualmente que en el mapa principal solo se ve el punto "estás aquí" — NO se dibuja el círculo del radio ahí (el círculo sigue solo en el mini-mapa de Configuración).

- [ ] **Step 3: Push de la rama y confirmación con el usuario**

Preguntar al usuario si quiere pushear la rama / abrir PR en este punto (no hacerlo automáticamente).
