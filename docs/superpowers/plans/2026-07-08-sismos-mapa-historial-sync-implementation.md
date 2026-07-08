# Mapa↔Historial Sync + Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bidirectional click-to-highlight between the historial panel and the map (with a dedicated, distinct highlight animation), fix the MapLibre popup's text-contrast bug, and restyle the historial panel's selector and cards.

**Architecture:** Selection state (`SismoSeleccionado | null`) is lifted into a new Client Component wrapper, `MapaConHistorial`, that renders both `MapaSismos` and `PanelHistorial` as siblings sharing that one piece of state. Clicking a card calls `onSeleccionar`; clicking a map marker calls `onSeleccionarDesdeMapa` — both just call the same `setSismoSeleccionado`. Each component reacts to the shared state independently (map flies to it + shows a highlight marker; panel scrolls to and highlights the matching card).

**Tech Stack:** TypeScript, Next.js 16 (Client Components), MapLibre GL 5.24.0, Tailwind v4.

## Global Constraints

- No new external dependencies — this is pure refinement of existing code with plain React state, MapLibre GL's existing API, and Tailwind utility classes.
- No `dark:` Tailwind variants — this app has one fixed dark theme (see `apps/web/app/globals.css`), not an OS-adaptive toggle.
- The highlight-on-selection animation must be visually distinct from the existing "new sismo" pulse (different color/motion), so a user can tell "this is new" apart from "this is what I clicked."
- Click-to-highlight must work for all 3 historial views, including `historico`/`top10anios` events that aren't part of the live map's last-10-days marker set — for those, a temporary marker appears at the clicked location (it does not need to persist after another selection replaces it).
- Workspace scope `@sismos/*`, pnpm only, Node >=24. No automated test framework in this monorepo — verification is real build/lint/typecheck plus a manual browser confirmation from the human (this plan cannot drive a browser).

## Repo Context (read this if you have no prior context)

`apps/web` currently has (all already implemented and working, do not recreate from scratch — modify in place):
- `app/page.tsx` — Server Component, fetches last-10-days `sismos` via `getUltimos10Dias()` from `../lib/fetch-sismos`, maps them to a plain-serializable shape, and renders `<MapaSismos sismosIniciales={...} />` and `<PanelHistorial />` as direct siblings inside `<main className="flex h-screen w-screen flex-col lg:flex-row">`.
- `components/mapa/MapaSismos.tsx` — Client Component, exports `default function MapaSismos({ sismosIniciales }: { sismosIniciales: SismoMapa[] })` and the type `SismoMapa` (`{ externalId, fecha (string, ISO), magnitud, latitud, longitud, lugar }`). Initializes a MapLibre GL map (OpenFreeMap `liberty` style, centered on Chile), plots one marker per initial sismo via a local `agregarMarcador` helper, and polls `GET /api/sismos?since=` every 30s to add new ones (with the pulse animation).
- `components/mapa/marcador.ts` — exports `colorPorMagnitud(magnitud): string`, `tamanoPorMagnitud(magnitud): number`, and `crearElementoMarcador(magnitud, { pulsando }): HTMLDivElement` (creates the colored circular `<div>` with the `marcador-sismo`/`marcador-sismo--pulso` CSS classes from `globals.css`).
- `components/historial/PanelHistorial.tsx` — Client Component, exports `default function PanelHistorial()`. Has local state for `tipo` (3-way selector) and `eventos`, fetches `GET /api/historial?tipo=` on mount/selector change, renders a responsive sidebar (desktop, `lg:`) / bottom sheet (mobile/tablet) with a `<select>` and a `<ul>` of cards.
- `app/globals.css` — Tailwind v4 import, fixed dark theme vars, and the `.marcador-sismo`/`.marcador-sismo--pulso`/`@keyframes pulso-sismo` rules for the "new sismo" animation.
- `apps/web`'s `tsconfig.json`/`eslint.config.js` extend `@sismos/typescript-config/nextjs.json`/`@sismos/eslint-config/next-js` — `moduleResolution: "Bundler"`, so relative imports never need `.js` extensions.

---

### Task 1: Shared modules — `lib/magnitud.ts`, `lib/tipos-sismo.ts`, selection marker + CSS fixes

**Files:**
- Create: `apps/web/lib/magnitud.ts`
- Create: `apps/web/lib/tipos-sismo.ts`
- Modify: `apps/web/components/mapa/marcador.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `colorPorMagnitud(magnitud: number): string`, `tamanoPorMagnitud(magnitud: number): number` from `apps/web/lib/magnitud.ts`. `SismoMapa` and `SismoSeleccionado` (`{ externalId: string; latitud: number; longitud: number; magnitud: number; lugar: string }`) types from `apps/web/lib/tipos-sismo.ts`. `crearElementoMarcador` (unchanged signature) and new `crearElementoSeleccion(): HTMLDivElement` from `marcador.ts`. CSS classes `.marcador-seleccion` (with its bounce keyframe) and `.popup-sismo` (with readable-contrast popup styling). Tasks 2 and 3 import all of these by name.

- [ ] **Step 1: Extract the magnitude helpers**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/magnitud.ts`:

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
```

- [ ] **Step 2: Add the shared type definitions**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/tipos-sismo.ts`:

```ts
export interface SismoMapa {
  externalId: string;
  fecha: string;
  magnitud: number;
  latitud: number;
  longitud: number;
  lugar: string;
}

export interface SismoSeleccionado {
  externalId: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  lugar: string;
}
```

- [ ] **Step 3: Update `marcador.ts` to use the shared helpers and add the selection marker**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/mapa/marcador.ts` with:

```ts
import { colorPorMagnitud, tamanoPorMagnitud } from "../../lib/magnitud";

export function crearElementoMarcador(
  magnitud: number,
  opciones: { pulsando: boolean },
): HTMLDivElement {
  const size = tamanoPorMagnitud(magnitud);
  const color = colorPorMagnitud(magnitud);

  const el = document.createElement("div");
  el.className = opciones.pulsando
    ? "marcador-sismo marcador-sismo--pulso"
    : "marcador-sismo";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.backgroundColor = color;
  el.style.borderRadius = "50%";
  el.style.border = "2px solid rgba(255, 255, 255, 0.8)";

  return el;
}

export function crearElementoSeleccion(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-seleccion";
  return el;
}
```

- [ ] **Step 4: Add the selection-marker animation and fix the popup contrast bug**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/app/globals.css` with:

```css
@import "tailwindcss";

@theme {
  --color-background: #0a0a0a;
  --color-foreground: #ededed;
}

body {
  background: var(--color-background);
  color: var(--color-foreground);
}

.marcador-sismo {
  position: relative;
}

.marcador-sismo--pulso::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background-color: inherit;
  animation-name: pulso-sismo;
  animation-duration: 1.5s;
  animation-timing-function: ease-out;
  animation-iteration-count: 8;
  animation-fill-mode: forwards;
}

@keyframes pulso-sismo {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(2.5);
    opacity: 0;
  }
}

.marcador-seleccion {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 3px solid #38bdf8;
  background: transparent;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.35);
  animation-name: rebote-seleccion;
  animation-duration: 0.6s;
  animation-timing-function: ease-in-out;
  animation-iteration-count: 3;
}

@keyframes rebote-seleccion {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.4);
  }
}

.popup-sismo .maplibregl-popup-content {
  background-color: #171717;
  color: #ededed;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  line-height: 1.4;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.popup-sismo .maplibregl-popup-close-button {
  color: #ededed;
}
```

(The old popup had no explicit text/background color, so it inherited the page's light foreground color with no contrasting background underneath in some positions — nearly invisible text. This gives the popup its own explicit dark background + light text, and makes the `×` close button visible too, same root cause.)

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
git add apps/web/lib/magnitud.ts apps/web/lib/tipos-sismo.ts apps/web/components/mapa/marcador.ts apps/web/app/globals.css
git commit -m "refactor: extract shared magnitude/type helpers, add selection marker + fix popup contrast"
```

---

### Task 2: `MapaSismos.tsx` — selection prop, marker click handler, flyTo + highlight

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `colorPorMagnitud`/`tamanoPorMagnitud` (indirectly, via `marcador.ts`), `crearElementoMarcador`, `crearElementoSeleccion` from `./marcador`; `SismoMapa`, `SismoSeleccionado` from `../../lib/tipos-sismo` (Task 1).
- Produces: `MapaSismos` now takes `{ sismosIniciales: SismoMapa[]; sismoSeleccionado: SismoSeleccionado | null; onSeleccionarDesdeMapa: (sismo: SismoSeleccionado) => void }`. No longer defines `SismoMapa` itself — re-exports it from `../../lib/tipos-sismo` so existing importers keep working. Task 4 (`MapaConHistorial`) passes all three props.

- [ ] **Step 1: Replace the component**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/mapa/MapaSismos.tsx` with:

```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador, crearElementoSeleccion } from "./marcador";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";

export type { SismoMapa, SismoSeleccionado };

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado) => void;
}

const CHILE_CENTER: [number, number] = [-71.5, -35.5];
const CHILE_ZOOM = 4;
const POLL_INTERVAL_MS = 30 * 1000;
const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";

function agregarMarcador(
  map: maplibregl.Map,
  marcadores: Map<string, maplibregl.Marker>,
  sismo: SismoMapa,
  opciones: { pulsando: boolean },
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado) => void,
) {
  if (marcadores.has(sismo.externalId)) return;

  const el = crearElementoMarcador(sismo.magnitud, opciones);
  el.addEventListener("click", () => {
    onSeleccionarDesdeMapa({
      externalId: sismo.externalId,
      latitud: sismo.latitud,
      longitud: sismo.longitud,
      magnitud: sismo.magnitud,
      lugar: sismo.lugar,
    });
  });

  const marker = new maplibregl.Marker({ element: el })
    .setLngLat([sismo.longitud, sismo.latitud])
    .setPopup(
      new maplibregl.Popup({ offset: 12, className: "popup-sismo" }).setHTML(
        `<strong>${sismo.lugar}</strong><br/>M${sismo.magnitud} — ${new Date(
          sismo.fecha,
        ).toLocaleString("es-CL")}`,
      ),
    )
    .addTo(map);

  marcadores.set(sismo.externalId, marker);
}

export default function MapaSismos({
  sismosIniciales,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
}: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ultimaFechaRef = useRef<string>(
    sismosIniciales.reduce(
      (max, s) => (s.fecha > max ? s.fecha : max),
      sismosIniciales[0]?.fecha ?? new Date(0).toISOString(),
    ),
  );
  const onSeleccionarDesdeMapaRef = useRef(onSeleccionarDesdeMapa);
  onSeleccionarDesdeMapaRef.current = onSeleccionarDesdeMapa;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: ESTILO_URL,
      center: CHILE_CENTER,
      zoom: CHILE_ZOOM,
    });
    mapRef.current = map;

    for (const sismo of sismosIniciales) {
      agregarMarcador(map, marcadoresRef.current, sismo, { pulsando: false }, (s) =>
        onSeleccionarDesdeMapaRef.current(s),
      );
    }

    const intervalId = setInterval(() => {
      const desde = ultimaFechaRef.current;
      fetch(`/api/sismos?since=${encodeURIComponent(desde)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`poll failed: ${res.status}`);
          return res.json();
        })
        .then((data: { sismos: SismoMapa[] }) => {
          for (const sismo of data.sismos) {
            agregarMarcador(
              map,
              marcadoresRef.current,
              sismo,
              { pulsando: true },
              (s) => onSeleccionarDesdeMapaRef.current(s),
            );
            if (sismo.fecha > ultimaFechaRef.current) {
              ultimaFechaRef.current = sismo.fecha;
            }
          }
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
  }, [sismosIniciales]);

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

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
```

Note the `onSeleccionarDesdeMapaRef` pattern: the map-initialization effect only re-runs when `sismosIniciales` changes (it must not reinitialize the whole map just because the parent passed a new function reference), so it reads the latest callback through a ref instead of listing it as a dependency — this avoids a stale closure without triggering unnecessary map teardown/recreation.

- [ ] **Step 2: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0. (This will show errors about `page.tsx` passing the wrong props — that's expected and fixed in Task 4. If Task 4 hasn't run yet, `check-types` failing on `page.tsx` specifically is fine to note in your report and move on; just confirm `MapaSismos.tsx` itself has no errors of its own by reading the `tsc` output carefully.)

- [ ] **Step 3: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat: add selection flyTo/highlight and marker-click handling to MapaSismos"
```

---

### Task 3: `PanelHistorial.tsx` — selection props, redesigned selector/cards, scroll-to-selection

**Files:**
- Modify: `apps/web/components/historial/PanelHistorial.tsx`

**Interfaces:**
- Consumes: `colorPorMagnitud` from `../../lib/magnitud`; `SismoSeleccionado` from `../../lib/tipos-sismo` (Task 1).
- Produces: `PanelHistorial` now takes `{ sismoSeleccionado: SismoSeleccionado | null; onSeleccionar: (sismo: SismoSeleccionado) => void }`. Task 4 passes both.

- [ ] **Step 1: Replace the component**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/historial/PanelHistorial.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { colorPorMagnitud } from "../../lib/magnitud";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
  latitud: number;
  longitud: number;
}

interface PanelHistorialProps {
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado) => void;
}

const OPCIONES: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Histórico" },
];

export default function PanelHistorial({
  sismoSeleccionado,
  onSeleccionar,
}: PanelHistorialProps) {
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<ItemHistorial[]>([]);
  const [expandido, setExpandido] = useState(false);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/historial?tipo=${tipo}`)
      .then((res) => {
        if (!res.ok) throw new Error(`historial fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { eventos: ItemHistorial[] }) => {
        if (!cancelado) setEventos(data.eventos ?? []);
      })
      .catch((error) => {
        console.error("[PanelHistorial] fetch failed:", error);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo]);

  useEffect(() => {
    if (!sismoSeleccionado) return;
    const el = itemRefs.current.get(sismoSeleccionado.externalId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sismoSeleccionado, eventos]);

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
        <div className="relative">
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoHistorial)}
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
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {eventos.map((evento) => {
          const seleccionado =
            evento.externalId === sismoSeleccionado?.externalId;
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
                  onSeleccionar({
                    externalId: evento.externalId,
                    latitud: evento.latitud,
                    longitud: evento.longitud,
                    magnitud: evento.magnitud,
                    lugar: evento.lugar,
                  })
                }
                style={{ borderLeftColor: colorPorMagnitud(evento.magnitud) }}
                className={`w-full rounded-lg border border-l-4 px-3 py-2 text-left text-sm transition-colors ${
                  seleccionado
                    ? "border-neutral-600 bg-neutral-800"
                    : "border-neutral-800 bg-neutral-900 hover:bg-neutral-800/60"
                }`}
              >
                <div className="font-semibold text-neutral-100">
                  {evento.lugar}
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

- [ ] **Step 2: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0 for this file specifically (same caveat as Task 2 about `page.tsx` still being unfixed until Task 4 — don't let that block this task).

- [ ] **Step 3: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/historial/PanelHistorial.tsx
git commit -m "feat: redesign historial selector/cards and add click-to-select + scroll-to-selection"
```

---

### Task 4: `MapaConHistorial` wrapper + wire into `page.tsx`

**Files:**
- Create: `apps/web/components/MapaConHistorial.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `MapaSismos` (Task 2), `PanelHistorial` (Task 3), `SismoMapa`/`SismoSeleccionado` from `../lib/tipos-sismo` (Task 1).
- Produces: the final wired page — no further tasks depend on this one.

- [ ] **Step 1: Add the wrapper component**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/MapaConHistorial.tsx`:

```tsx
"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";

interface MapaConHistorialProps {
  sismosIniciales: SismoMapa[];
}

export default function MapaConHistorial({
  sismosIniciales,
}: MapaConHistorialProps) {
  const [sismoSeleccionado, setSismoSeleccionado] =
    useState<SismoSeleccionado | null>(null);

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          sismosIniciales={sismosIniciales}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={setSismoSeleccionado}
        />
      </div>
      <PanelHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
      />
    </>
  );
}
```

- [ ] **Step 2: Wire it into `page.tsx`**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/app/page.tsx` with:

```tsx
import { getUltimos10Dias } from "../lib/fetch-sismos";
import type { SismoMapa } from "../lib/tipos-sismo";
import MapaConHistorial from "../components/MapaConHistorial";

export const dynamic = "force-dynamic";

export default async function Home() {
  let sismosIniciales: SismoMapa[] = [];
  try {
    const sismos = await getUltimos10Dias();
    sismosIniciales = sismos.map((s) => ({
      externalId: s.externalId,
      fecha: s.fecha.toISOString(),
      magnitud: s.magnitud,
      latitud: s.latitud,
      longitud: s.longitud,
      lugar: s.lugar,
    }));
  } catch (error) {
    console.error("[page] failed to load initial sismos:", error);
  }

  return (
    <main className="flex h-screen w-screen flex-col lg:flex-row">
      <MapaConHistorial sismosIniciales={sismosIniciales} />
    </main>
  );
}
```

- [ ] **Step 3: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0 — this is the point where any leftover prop-mismatch errors from Tasks 2-3 must be fully resolved.

- [ ] **Step 4: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/MapaConHistorial.tsx apps/web/app/page.tsx
git commit -m "feat: wire MapaConHistorial to share selection state between map and historial"
```

---

### Task 5: Verification (build/lint/check-types + human visual confirmation)

**Files:**
- None created or modified — this task only runs commands.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: confirmation that the whole monorepo still builds/lints/typechecks, and (from the human) that the new interactions and visuals actually work.

- [ ] **Step 1: Full monorepo build/lint/check-types**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
nvm use
pnpm build
pnpm lint
pnpm check-types
```

Expected: all exit 0 across all 6 packages/apps.

- [ ] **Step 2: Confirm the dev server is serving the latest code**

If `apps/web`'s dev server is already running (check `ps aux | grep "next dev --port 3000"`), Next's file watcher should have hot-reloaded all changes automatically — do not kill or restart a dev server the human may be actively using. If no dev server is running at all, start one:

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web dev > /tmp/sismos-web-verify.log 2>&1 &
sleep 4
cat /tmp/sismos-web-verify.log
```

- [ ] **Step 3: Ask the human to confirm visually**

This plan has no way to drive a real browser. Report to the human:

> "Backend verified (build/lint/check-types all green). Please refresh http://localhost:3000 and confirm: (1) the view selector and historial cards look better (rounded cards with a colored left edge matching magnitude, a visible header), (2) clicking a card in the sidebar flies the map to that location and shows a bouncing cyan ring there (including for 'Histórico' entries like Valdivia 1960, which aren't normally pinned), (3) clicking a marker on the map highlights and scrolls to the matching card in the sidebar, (4) the map's popup text (from clicking a marker) is now clearly readable instead of nearly invisible."

- [ ] **Step 4: Clean up**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git status --short
```

Do NOT run `pnpm db:down` or kill any `next dev` process — both may be in active use. If `git status --short` shows anything (e.g. a regenerated `next-env.d.ts`), commit it:

```bash
git add -A
git commit -m "chore: regenerate web route types" --allow-empty
```

## Self-Review Notes

- **Coverage:** bidirectional sync (Task 2's marker click + Task 3's card click, both routed through Task 4's shared state), distinct highlight animation (Task 1's `.marcador-seleccion`/`rebote-seleccion`, visually different from the existing amber/red `pulso-sismo`), works for non-pinned historical events (Task 2's selection effect creates a marker directly from `sismoSeleccionado`'s coordinates regardless of whether that event exists in `marcadoresRef`), popup contrast fix (Task 1's `.popup-sismo` rules + Task 2 applying the `className`), redesigned selector/cards (Task 3). Nothing from the approved design is missing.
- **No placeholders:** every step shows literal file content, including the full replaced components (not diffs against an assumed base I can't verify token-for-token in a plan document) — safer given these files have been touched by prior work in this session.
- **Type consistency:** `SismoSeleccionado` (Task 1) fields (`externalId`, `latitud`, `longitud`, `magnitud`, `lugar`) are used identically in Task 2's marker-click handler, Task 2's selection effect, and Task 3's card-click handler. `MapaSismos`'s and `PanelHistorial`'s prop names (`sismoSeleccionado`, `onSeleccionarDesdeMapa`, `onSeleccionar`) match exactly what Task 4's `MapaConHistorial` passes.
