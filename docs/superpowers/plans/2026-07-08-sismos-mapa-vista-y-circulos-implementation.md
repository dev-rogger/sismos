# Map Follows Sidebar View + Geographic Impact Circles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the map show whatever historial view is currently selected (not always "últimos 10 días"), and add a real geographic circle per sismo showing an illustrative estimated impact radius.

**Architecture:** `tipo` (the historial view selector) and its fetched `eventos` move from `PanelHistorial`'s local state up to `MapaConHistorial`, which now owns the single `/api/historial?tipo=` fetch and hands the same data to both the list and the map. `MapaSismos` treats `eventos` as its live "current dataset" (replacing wholesale on every change, not just accumulating) and only polls `/api/sismos?since=` for brand-new events when the active view is `"ultimos10dias"`. A second GeoJSON layer (independent of the existing clickable point markers) renders a translucent geodesic circle per visible sismo, radius computed by a simple illustrative formula.

**Tech Stack:** TypeScript, React (Client Components), MapLibre GL 5.24.0 (GeoJSON source/layers), `@types/geojson` (new devDependency, same fix already applied to `packages/shared` for `@rapideditor/country-coder`).

## Global Constraints

- No new runtime dependencies — only a devDependency (`@types/geojson`) for type-checking our own GeoJSON usage (verified: without it, `tsc` fails with `Cannot find namespace 'GeoJSON'` on both our code and, silently, inside `maplibre-gl`'s own `.d.ts` — the latter is only hidden today by `skipLibCheck: true`).
- The impact-radius formula (`radioKm = 5 * 2^(magnitud - 2)`) is an explicitly illustrative approximation, not a scientific standard — document it as such in the code comment, don't present it to the user as authoritative.
- The existing clickable point markers (click → select, popup, "new sismo" pulse) must keep working exactly as before — the circle layer is purely additive and non-interactive.
- Live polling (`/api/sismos?since=`) and the "new sismo" pulse animation only run when the active view is `"ultimos10dias"`. Switching to `"top10anios"`/`"historico"` shows those fixed pins/circles with no polling.
- Switching `tipo` replaces the map's dataset (old pins/circles not in the new view's data are removed), it does not accumulate across views.
- Fault-line viewing button: explicitly out of scope for this plan (the user asked for it later).
- Workspace scope `@sismos/*`, pnpm only, Node >=24. No automated test framework — verification is build/lint/typecheck plus a manual browser confirmation.

## Repo Context (read this if you have no prior context)

Current relevant files (all already implemented and working — this plan modifies them, doesn't create the feature from scratch):

- `apps/web/lib/tipos-sismo.ts` exports `SismoMapa` (`{ externalId, fecha, magnitud, latitud, longitud, lugar, bandera }`) and `SismoSeleccionado` (`{ externalId, latitud, longitud, magnitud, lugar }`). Note `SismoMapa`'s 7 fields are structurally identical to `PanelHistorial.tsx`'s current local `ItemHistorial` interface — this plan removes that duplicate and uses `SismoMapa` everywhere.
- `apps/web/lib/magnitud.ts` exports `colorPorMagnitud(magnitud): string` and `tamanoPorMagnitud(magnitud): number`.
- `apps/web/components/mapa/marcador.ts` exports `crearElementoMarcador(magnitud, { pulsando }): HTMLDivElement` and `crearElementoSeleccion(): HTMLDivElement` — both unchanged by this plan.
- `apps/web/components/mapa/MapaSismos.tsx` currently takes `{ sismosIniciales: SismoMapa[]; sismoSeleccionado; onSeleccionarDesdeMapa; soloChile; magnitudMinima }`, always treats its dataset as "últimos 10 días, live, polling every 30s". This plan replaces `sismosIniciales` with `eventos` + a new `esVistaEnVivo: boolean` prop, and adds the circle layer.
- `apps/web/components/historial/PanelHistorial.tsx` currently owns `tipo` and `eventos` as local state, with its own fetch effect. This plan moves both to props.
- `apps/web/components/MapaConHistorial.tsx` currently owns `sismoSeleccionado`, `soloChile`, `magnitudMinima` and passes `sismosIniciales` straight through to `MapaSismos`. This plan adds `tipo`/`eventos` ownership here, including the historial fetch (moved from `PanelHistorial`).
- `apps/web/app/page.tsx` is unaffected by this plan — it still does one SSR fetch of "últimos 10 días" via `getUltimos10Dias()` and passes it as `sismosIniciales` to `MapaConHistorial`, which now uses it to seed the initial `eventos` state (for the default `"ultimos10dias"` view) without an extra client-side fetch on first load.
- `apps/web`'s `tsconfig.json`/`eslint.config.js` use `moduleResolution: "Bundler"` — relative imports never need `.js` extensions.

---

### Task 1: Shared helpers — impact radius formula + geodesic circle generator + `@types/geojson`

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/lib/magnitud.ts`
- Create: `apps/web/lib/circulo-geografico.ts`

**Interfaces:**
- Produces: `radioKmPorMagnitud(magnitud: number): number` (added to `apps/web/lib/magnitud.ts`, alongside the existing `colorPorMagnitud`/`tamanoPorMagnitud`) and `crearCirculoGeografico(centro: [number, number], radioKm: number, puntos?: number): GeoJSON.Feature<GeoJSON.Polygon>` (from the new `apps/web/lib/circulo-geografico.ts`). Task 4 imports both by name.

- [ ] **Step 1: Add `@types/geojson`**

In `/Users/rodrigoguerrero/Sites/sismos/apps/web/package.json`, add `"@types/geojson": "^7946.0.16"` to `devDependencies`, so the file becomes:

```json
{
  "name": "web",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000 --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "lint": "eslint --max-warnings 0",
    "check-types": "next typegen && tsc --noEmit"
  },
  "dependencies": {
    "@sismos/db": "workspace:*",
    "@sismos/shared": "workspace:*",
    "@serwist/next": "^9.5.11",
    "maplibre-gl": "^5.24.0",
    "next": "16.2.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@sismos/eslint-config": "workspace:*",
    "@sismos/typescript-config": "workspace:*",
    "@tailwindcss/postcss": "^4.3.2",
    "@types/geojson": "^7946.0.16",
    "@types/node": "^26.1.0",
    "@types/react": "19.2.2",
    "@types/react-dom": "19.2.2",
    "eslint": "^9.39.1",
    "serwist": "^9.5.11",
    "tailwindcss": "^4.3.2",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 2: Add the radius formula**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/magnitud.ts` with:

```ts
export function colorPorMagnitud(magnitud: number): string {
  if (magnitud < 3) return "#facc15";
  if (magnitud < 5) return "#fb923c";
  if (magnitud < 7) return "#f97316";
  return "#dc2626";
}

export function tamanoPorMagnitud(magnitud: number): number {
  if (magnitud < 3) return 14;
  if (magnitud < 5) return 20;
  if (magnitud < 7) return 28;
  return 36;
}

// Aproximación ilustrativa (no un estándar científico): el radio se
// duplica por cada punto de magnitud, calibrado en ~5km para M2.
export function radioKmPorMagnitud(magnitud: number): number {
  return 5 * Math.pow(2, magnitud - 2);
}
```

- [ ] **Step 3: Add the geodesic circle generator**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/circulo-geografico.ts`:

```ts
const RADIO_TIERRA_KM = 6371;

export function crearCirculoGeografico(
  centro: [number, number],
  radioKm: number,
  puntos = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const [lon, lat] = centro;
  const distanciaAngular = radioKm / RADIO_TIERRA_KM;
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const coords: [number, number][] = [];
  for (let i = 0; i <= puntos; i++) {
    const angulo = (i / puntos) * 2 * Math.PI;
    const latDestino = Math.asin(
      Math.sin(latRad) * Math.cos(distanciaAngular) +
        Math.cos(latRad) * Math.sin(distanciaAngular) * Math.cos(angulo),
    );
    const lonDestino =
      lonRad +
      Math.atan2(
        Math.sin(angulo) * Math.sin(distanciaAngular) * Math.cos(latRad),
        Math.cos(distanciaAngular) - Math.sin(latRad) * Math.sin(latDestino),
      );
    coords.push([(lonDestino * 180) / Math.PI, (latDestino * 180) / Math.PI]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [coords],
    },
  };
}
```

(Standard great-circle "destination point given distance and bearing" formula, swept across a full 360° to trace a circle — this is the correct way to draw a real-world-scaled circle on a Mercator map, unlike a fixed-pixel `circle-radius` paint property.)

- [ ] **Step 4: Install and spot-check**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm install
```

```bash
cd apps/web
node --experimental-strip-types -e '
import { crearCirculoGeografico } from "./lib/circulo-geografico.ts";
import { radioKmPorMagnitud } from "./lib/magnitud.ts";

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const centro = [-71.5, -35.5];
const radioKm = radioKmPorMagnitud(9.5);
console.log("radioKmPorMagnitud(9.5) =", radioKm.toFixed(1), "km");
const circulo = crearCirculoGeografico(centro, radioKm, 8);
const [lon0, lat0] = circulo.geometry.coordinates[0][0];
const distanciaReal = haversineKm(centro[1], centro[0], lat0, lon0);
console.log("distancia real del primer punto del círculo:", distanciaReal.toFixed(1), "km (debe ser ≈", radioKm.toFixed(1), ")");
'
```

Expected: `radioKmPorMagnitud(9.5) = 905.1 km` and the measured distance of the generated circle point back to center is within ~1% of that value (confirms the geodesic math is correct, not just "runs without crashing").

- [ ] **Step 5: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/package.json apps/web/lib/magnitud.ts apps/web/lib/circulo-geografico.ts pnpm-lock.yaml
git commit -m "feat: add impact-radius formula and geodesic circle generator"
```

---

### Task 2: `MapaConHistorial` — lift `tipo`/`eventos`, own the historial fetch

**Files:**
- Modify: `apps/web/components/MapaConHistorial.tsx`
- Modify: `apps/web/lib/tipos-sismo.ts`

**Interfaces:**
- Consumes: `SismoMapa` (now the single shared shape for a list/map item).
- Produces: `TipoHistorial` type (`"historico" | "top10anios" | "ultimos10dias"`), now exported from `apps/web/lib/tipos-sismo.ts` — Task 3 and this task both import it from there instead of each declaring their own copy.

- [ ] **Step 1: Move `TipoHistorial` into the shared types file**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/tipos-sismo.ts` with:

```ts
export type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

export interface SismoMapa {
  externalId: string;
  fecha: string;
  magnitud: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
}

export interface SismoSeleccionado {
  externalId: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  lugar: string;
}
```

- [ ] **Step 2: Rewrite `MapaConHistorial`**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/MapaConHistorial.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import type {
  SismoMapa,
  SismoSeleccionado,
  TipoHistorial,
} from "../lib/tipos-sismo";

interface MapaConHistorialProps {
  sismosIniciales: SismoMapa[];
}

export default function MapaConHistorial({
  sismosIniciales,
}: MapaConHistorialProps) {
  const [sismoSeleccionado, setSismoSeleccionado] =
    useState<SismoSeleccionado | null>(null);
  const [soloChile, setSoloChile] = useState(false);
  const [magnitudMinima, setMagnitudMinima] = useState(5);
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<SismoMapa[]>(sismosIniciales);
  const primerRenderRef = useRef(true);

  useEffect(() => {
    if (primerRenderRef.current) {
      primerRenderRef.current = false;
      return;
    }
    let cancelado = false;
    fetch(`/api/historial?tipo=${tipo}`)
      .then((res) => {
        if (!res.ok) throw new Error(`historial fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { eventos: SismoMapa[] }) => {
        if (!cancelado) setEventos(data.eventos ?? []);
      })
      .catch((error) => {
        console.error("[MapaConHistorial] fetch failed:", error);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo]);

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          eventos={eventos}
          esVistaEnVivo={tipo === "ultimos10dias"}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={setSismoSeleccionado}
          soloChile={soloChile}
          magnitudMinima={magnitudMinima}
        />
      </div>
      <PanelHistorial
        tipo={tipo}
        onTipoChange={setTipo}
        eventos={eventos}
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
        soloChile={soloChile}
        onSoloChileChange={setSoloChile}
        magnitudMinima={magnitudMinima}
        onMagnitudMinimaChange={setMagnitudMinima}
      />
    </>
  );
}
```

(`primerRenderRef` skips the very first `tipo`-change effect run, since the default `"ultimos10dias"` data already arrived via SSR in `sismosIniciales` — avoids a redundant fetch on first paint.)

- [ ] **Step 3: Typecheck**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
```

Expected: errors in `PanelHistorial.tsx` and `MapaSismos.tsx` about missing/mismatched props (`tipo`, `onTipoChange`, `eventos`, `esVistaEnVivo` not yet accepted) — that's expected, fixed in Tasks 3-4. Confirm `MapaConHistorial.tsx` and `lib/tipos-sismo.ts` themselves show no errors of their own.

- [ ] **Step 4: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/MapaConHistorial.tsx apps/web/lib/tipos-sismo.ts
git commit -m "feat: lift tipo/eventos state into MapaConHistorial, own the historial fetch"
```

---

### Task 3: `PanelHistorial` — receive `tipo`/`eventos` as props, drop the duplicate type

**Files:**
- Modify: `apps/web/components/historial/PanelHistorial.tsx`

**Interfaces:**
- Consumes: `SismoMapa`, `TipoHistorial` from `../../lib/tipos-sismo` (Task 2).
- Produces: `PanelHistorial` now takes `{ tipo, onTipoChange, eventos, sismoSeleccionado, onSeleccionar, soloChile, onSoloChileChange, magnitudMinima, onMagnitudMinimaChange }`. Task 2's `MapaConHistorial` already passes all of these.

- [ ] **Step 1: Replace the component**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/historial/PanelHistorial.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { formatearCoordenadas } from "../../lib/coordenadas";
import { colorPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "../../lib/region-chile";
import type {
  SismoMapa,
  SismoSeleccionado,
  TipoHistorial,
} from "../../lib/tipos-sismo";

interface PanelHistorialProps {
  tipo: TipoHistorial;
  onTipoChange: (tipo: TipoHistorial) => void;
  eventos: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado | null) => void;
  soloChile: boolean;
  onSoloChileChange: (soloChile: boolean) => void;
  magnitudMinima: number;
  onMagnitudMinimaChange: (magnitudMinima: number) => void;
}

const OPCIONES: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Histórico" },
];

export default function PanelHistorial({
  tipo,
  onTipoChange,
  eventos,
  sismoSeleccionado,
  onSeleccionar,
  soloChile,
  onSoloChileChange,
  magnitudMinima,
  onMagnitudMinimaChange,
}: PanelHistorialProps) {
  const [expandido, setExpandido] = useState(false);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (!sismoSeleccionado) return;
    const el = itemRefs.current.get(sismoSeleccionado.externalId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sismoSeleccionado, eventos]);

  const eventosFiltrados = eventos.filter((evento) => {
    if (soloChile && evento.bandera !== "🇨🇱") return false;
    if (evento.magnitud < magnitudMinima) return false;
    return true;
  });

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[80vh] flex-col rounded-t-2xl bg-neutral-900 shadow-lg transition-transform duration-300 lg:static lg:h-full lg:max-h-none lg:w-[360px] lg:translate-y-0 lg:rounded-none lg:border-l lg:border-neutral-800 lg:shadow-none lg:transition-none ${
        expandido ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full shrink-0 items-center justify-center py-3 lg:hidden"
        aria-expanded={expandido}
      >
        <span className="h-1.5 w-10 rounded-full bg-neutral-600" />
      </button>

      <div className="shrink-0 border-b border-neutral-800 px-4 pb-3">
        <h2 className="mb-2 text-base font-semibold text-neutral-100">
          Historial de sismos
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={tipo}
              onChange={(e) => onTipoChange(e.target.value as TipoHistorial)}
              className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-8 text-sm text-neutral-100 transition-colors hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
            >
              {OPCIONES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
              ▾
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSoloChileChange(!soloChile)}
            aria-pressed={soloChile}
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              soloChile
                ? "border-sky-500 bg-sky-500/10 text-sky-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            🇨🇱 Solo Chile
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="magnitud-minima"
            className="shrink-0 text-xs text-neutral-400"
          >
            M{magnitudMinima}+
          </label>
          <input
            id="magnitud-minima"
            type="range"
            min={2}
            max={7}
            step={1}
            value={magnitudMinima}
            onChange={(e) => onMagnitudMinimaChange(Number(e.target.value))}
            className="flex-1 accent-sky-500"
          />
        </div>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {eventosFiltrados.map((evento) => {
          const seleccionado =
            evento.externalId === sismoSeleccionado?.externalId;
          const region =
            evento.bandera === "🇨🇱"
              ? regionChilePorLatitud(evento.latitud)
              : null;
          return (
            <li
              key={evento.externalId}
              ref={(el) => {
                if (el) itemRefs.current.set(evento.externalId, el);
              }}
            >
              <button
                type="button"
                onClick={() =>
                  onSeleccionar(
                    seleccionado
                      ? null
                      : {
                          externalId: evento.externalId,
                          latitud: evento.latitud,
                          longitud: evento.longitud,
                          magnitud: evento.magnitud,
                          lugar: evento.lugar,
                        },
                  )
                }
                style={{ borderLeftColor: colorPorMagnitud(evento.magnitud) }}
                className={`w-full rounded-lg border border-l-4 px-3 py-2 text-left text-sm transition-colors ${
                  seleccionado
                    ? "border-neutral-600 bg-neutral-800"
                    : "border-neutral-800 bg-neutral-900 hover:bg-neutral-800/60"
                }`}
              >
                <div className="font-semibold text-neutral-100">
                  {evento.bandera ?? "🌎"} {evento.lugar}
                </div>
                {region && (
                  <div className="text-xs text-neutral-500">{region}</div>
                )}
                <div className="text-xs text-neutral-500">
                  {formatearCoordenadas(evento.latitud, evento.longitud)}
                </div>
                <div className="text-neutral-400">
                  M{evento.magnitud} —{" "}
                  {new Date(evento.fecha).toLocaleString("es-CL")}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
```

Expected: no more errors in `PanelHistorial.tsx` itself. `MapaSismos.tsx` and `MapaConHistorial.tsx` may still show errors related to `MapaSismos`'s old prop shape — that's Task 4.

- [ ] **Step 3: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/historial/PanelHistorial.tsx
git commit -m "feat: PanelHistorial receives tipo/eventos as props, drop duplicate ItemHistorial type"
```

---

### Task 4: `MapaSismos` — view-aware dataset, conditional polling, impact-circle layer

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `crearElementoMarcador`, `crearElementoSeleccion` from `./marcador`; `colorPorMagnitud`, `radioKmPorMagnitud` from `../../lib/magnitud` (Task 1); `crearCirculoGeografico` from `../../lib/circulo-geografico` (Task 1); `SismoMapa`, `SismoSeleccionado` from `../../lib/tipos-sismo`.
- Produces: `MapaSismos` now takes `{ eventos: SismoMapa[]; esVistaEnVivo: boolean; sismoSeleccionado: SismoSeleccionado | null; onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void; soloChile: boolean; magnitudMinima: number }` — matches exactly what Task 2's `MapaConHistorial` passes.

- [ ] **Step 1: Replace the component**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/mapa/MapaSismos.tsx` with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador, crearElementoSeleccion } from "./marcador";
import { colorPorMagnitud, radioKmPorMagnitud } from "../../lib/magnitud";
import { crearCirculoGeografico } from "../../lib/circulo-geografico";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";

export type { SismoMapa, SismoSeleccionado };

interface MapaSismosProps {
  eventos: SismoMapa[];
  esVistaEnVivo: boolean;
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void;
  soloChile: boolean;
  magnitudMinima: number;
}

const CHILE_CENTER: [number, number] = [-71.5, -35.5];
const CHILE_ZOOM = 4;
const POLL_INTERVAL_MS = 30 * 1000;
const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";
const FUENTE_CIRCULOS = "circulos-impacto";

function pasaFiltro(
  sismo: SismoMapa,
  soloChile: boolean,
  magnitudMinima: number,
): boolean {
  if (soloChile && sismo.bandera !== "🇨🇱") return false;
  if (sismo.magnitud < magnitudMinima) return false;
  return true;
}

export default function MapaSismos({
  eventos,
  esVistaEnVivo,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
  soloChile,
  magnitudMinima,
}: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const todosSismosRef = useRef<Map<string, SismoMapa>>(new Map());
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const nuevosRef = useRef<Set<string>>(new Set());
  const ultimaFechaRef = useRef<string>(
    eventos.reduce(
      (max, s) => (s.fecha > max ? s.fecha : max),
      eventos[0]?.fecha ?? new Date(0).toISOString(),
    ),
  );
  const onSeleccionarDesdeMapaRef = useRef(onSeleccionarDesdeMapa);
  onSeleccionarDesdeMapaRef.current = onSeleccionarDesdeMapa;
  const sismoSeleccionadoRef = useRef(sismoSeleccionado);
  sismoSeleccionadoRef.current = sismoSeleccionado;
  const soloChileRef = useRef(soloChile);
  soloChileRef.current = soloChile;
  const magnitudMinimaRef = useRef(magnitudMinima);
  magnitudMinimaRef.current = magnitudMinima;
  const esVistaEnVivoRef = useRef(esVistaEnVivo);
  esVistaEnVivoRef.current = esVistaEnVivo;

  function crearMarcador(
    map: maplibregl.Map,
    sismo: SismoMapa,
    pulsando: boolean,
  ): maplibregl.Marker {
    const el = crearElementoMarcador(sismo.magnitud, { pulsando });
    el.addEventListener("click", () => {
      if (sismoSeleccionadoRef.current?.externalId === sismo.externalId) {
        onSeleccionarDesdeMapaRef.current(null);
        return;
      }
      onSeleccionarDesdeMapaRef.current({
        externalId: sismo.externalId,
        latitud: sismo.latitud,
        longitud: sismo.longitud,
        magnitud: sismo.magnitud,
        lugar: sismo.lugar,
      });
    });

    return new maplibregl.Marker({ element: el })
      .setLngLat([sismo.longitud, sismo.latitud])
      .setPopup(
        new maplibregl.Popup({ offset: 12, className: "popup-sismo" }).setHTML(
          `<strong>${sismo.lugar}</strong><br/>M${sismo.magnitud} — ${new Date(
            sismo.fecha,
          ).toLocaleString("es-CL")}`,
        ),
      )
      .addTo(map);
  }

  function sincronizarMarcadores(map: maplibregl.Map) {
    const soloChileActual = soloChileRef.current;
    const magnitudMinimaActual = magnitudMinimaRef.current;

    for (const [externalId, marker] of marcadoresRef.current) {
      if (!todosSismosRef.current.has(externalId)) {
        marker.remove();
        marcadoresRef.current.delete(externalId);
      }
    }

    for (const sismo of todosSismosRef.current.values()) {
      const debeMostrarse = pasaFiltro(
        sismo,
        soloChileActual,
        magnitudMinimaActual,
      );
      const yaExiste = marcadoresRef.current.has(sismo.externalId);

      if (debeMostrarse && !yaExiste) {
        const pulsando = nuevosRef.current.has(sismo.externalId);
        const marker = crearMarcador(map, sismo, pulsando);
        marcadoresRef.current.set(sismo.externalId, marker);
        nuevosRef.current.delete(sismo.externalId);
      } else if (!debeMostrarse && yaExiste) {
        marcadoresRef.current.get(sismo.externalId)?.remove();
        marcadoresRef.current.delete(sismo.externalId);
      }
    }
  }

  function actualizarCirculos(map: maplibregl.Map) {
    const source = map.getSource(FUENTE_CIRCULOS) as
      | maplibregl.GeoJSONSource
      | undefined;
    if (!source) return;

    const soloChileActual = soloChileRef.current;
    const magnitudMinimaActual = magnitudMinimaRef.current;
    const features: GeoJSON.Feature<GeoJSON.Polygon>[] = [];

    for (const sismo of todosSismosRef.current.values()) {
      if (!pasaFiltro(sismo, soloChileActual, magnitudMinimaActual)) continue;
      const circulo = crearCirculoGeografico(
        [sismo.longitud, sismo.latitud],
        radioKmPorMagnitud(sismo.magnitud),
      );
      circulo.properties = { color: colorPorMagnitud(sismo.magnitud) };
      features.push(circulo);
    }

    source.setData({ type: "FeatureCollection", features });
  }

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: ESTILO_URL,
      center: CHILE_CENTER,
      zoom: CHILE_ZOOM,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(FUENTE_CIRCULOS, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "circulos-impacto-relleno",
        type: "fill",
        source: FUENTE_CIRCULOS,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": 0.12,
        },
      });
      map.addLayer({
        id: "circulos-impacto-borde",
        type: "line",
        source: FUENTE_CIRCULOS,
        paint: {
          "line-color": ["get", "color"],
          "line-width": 1,
          "line-opacity": 0.4,
        },
      });
      sincronizarMarcadores(map);
      actualizarCirculos(map);
    });

    const intervalId = setInterval(() => {
      if (!esVistaEnVivoRef.current) return;
      const desde = ultimaFechaRef.current;
      fetch(`/api/sismos?since=${encodeURIComponent(desde)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`poll failed: ${res.status}`);
          return res.json();
        })
        .then((data: { sismos: SismoMapa[] }) => {
          for (const sismo of data.sismos) {
            todosSismosRef.current.set(sismo.externalId, sismo);
            nuevosRef.current.add(sismo.externalId);
            if (sismo.fecha > ultimaFechaRef.current) {
              ultimaFechaRef.current = sismo.fecha;
            }
          }
          sincronizarMarcadores(map);
          actualizarCirculos(map);
        })
        .catch((error) => {
          console.error("[MapaSismos] poll error:", error);
        });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    todosSismosRef.current = new Map(eventos.map((e) => [e.externalId, e]));

    if (esVistaEnVivo) {
      const maxFecha = eventos.reduce(
        (max, e) => (e.fecha > max ? e.fecha : max),
        eventos[0]?.fecha ?? new Date(0).toISOString(),
      );
      ultimaFechaRef.current = maxFecha;
    }

    sincronizarMarcadores(map);
    actualizarCirculos(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos, esVistaEnVivo]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    sincronizarMarcadores(map);
    actualizarCirculos(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloChile, magnitudMinima]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sismoSeleccionado) return;

    map.flyTo({
      center: [sismoSeleccionado.longitud, sismoSeleccionado.latitud],
      zoom: Math.max(map.getZoom(), 6),
      speed: 1.2,
    });

    const el = crearElementoSeleccion();
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([sismoSeleccionado.longitud, sismoSeleccionado.latitud])
      .addTo(map);

    return () => {
      marker.remove();
    };
  }, [sismoSeleccionado]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() =>
          mapRef.current?.flyTo({
            center: CHILE_CENTER,
            zoom: CHILE_ZOOM,
            speed: 1.2,
          })
        }
        className="absolute top-3 right-3 z-10 rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        Ver todo Chile
      </button>
    </div>
  );
}
```

Key behavior notes for whoever implements/reviews this:
- The mount effect (`[]` deps) creates the map exactly once and never re-seeds `todosSismosRef` itself anymore — seeding is the `[eventos, esVistaEnVivo]` effect's job, which also runs on mount (after the map-creation effect, since effects run in declaration order within the same commit) so `mapRef.current` is already set by the time it runs.
- `actualizarCirculos` guards on `map.getSource(...)` existing — harmless no-op if called before the `"load"` event has added the source (the `"load"` handler's own call to it will populate it once ready).
- The poll `setInterval` always ticks every 30s regardless of view, but does nothing (`if (!esVistaEnVivoRef.current) return;`) unless the active view is `"ultimos10dias"` — this avoids needing to tear down/recreate the interval on every `tipo` change.
- Switching `tipo` replaces `todosSismosRef` wholesale (`new Map(eventos.map(...))`), so `sincronizarMarcadores`'s "remove markers whose sismo is no longer in the dataset at all" step correctly clears out the previous view's pins.

- [ ] **Step 2: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0 — this is the point where every prop-shape mismatch from Tasks 2-3 must be fully resolved.

- [ ] **Step 3: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat: map follows the active historial view, add geodesic impact-radius circles"
```

---

### Task 5: Verification

**Files:**
- None created or modified — this task only runs commands.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: confirmation that the whole monorepo builds/lints/typechecks, and (from the human) that the map now follows the sidebar view and shows impact circles correctly.

- [ ] **Step 1: Full monorepo build/lint/check-types**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
nvm use
pnpm build
pnpm lint
pnpm check-types
```

Expected: all exit 0 across all 6 packages/apps.

- [ ] **Step 2: Ask the human to confirm visually**

This plan has no way to drive a real browser. Report to the human:

> "Please refresh http://localhost:3000 and confirm: (1) selecting 'Histórico' in the sidebar makes the map show pins for those 10 historical events (e.g. Valdivia 1960) instead of the live last-10-days set, with no live polling happening while that view is active, (2) switching back to 'Últimos 10 días' resumes live polling/pulsing normally, (3) every pin now has a translucent colored circle around it whose size clearly grows with magnitude (Valdivia's circle should be dramatically larger than a small M2-3 event's), (4) the existing click-to-select / popup / 'Ver todo Chile' behavior still all work."

- [ ] **Step 3: Clean up**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git status --short
```

Expected: clean. If anything shows (e.g. a regenerated `next-env.d.ts`), commit it:

```bash
git add -A
git commit -m "chore: regenerate web route types" --allow-empty
```

## Self-Review Notes

- **Coverage:** map-follows-view (Tasks 2-4: lifted `tipo`/`eventos`, conditional polling via `esVistaEnVivo`, dataset-replace semantics in `sincronizarMarcadores`), impact circles (Task 1's formula + generator, Task 4's GeoJSON source/layers + `actualizarCirculos`, refreshed on every poll/filter/view change). Fault-line button explicitly untouched per scope.
- **No placeholders:** every step shows literal file content; the impact-radius formula is explicitly labeled illustrative, not scientific, both in the code comment and this plan's Global Constraints.
- **Type consistency:** `SismoMapa` (Task 2, now also replacing `PanelHistorial`'s old `ItemHistorial`) flows unchanged through `MapaConHistorial` → both `PanelHistorial` and `MapaSismos` (Task 4's `eventos: SismoMapa[]` prop). `TipoHistorial` is defined once (Task 2, in `lib/tipos-sismo.ts`) and imported by both consumers instead of being duplicated. `MapaSismos`'s new prop names (`eventos`, `esVistaEnVivo`) match exactly what `MapaConHistorial` passes.
