# Country Filter + Chile Region Name Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Solo Chile / Todo el mundo" toggle to the historial panel, and show the approximate Chilean region under the place name for Chile-sourced events.

**Architecture:** Both features are pure client-side additions to `PanelHistorial.tsx` — no API, schema, or ingestion changes. The country toggle filters the already-fetched `eventos` array in memory by the `bandera` field that already exists on every item. The region name comes from a new small, dependency-free lookup table keyed by latitude (Chile is a narrow north-south strip, so latitude alone gives a reasonable approximation — verified that `@rapideditor/country-coder`, already used for the country flag, only models country-level data, not sub-national regions).

**Tech Stack:** TypeScript, React (Client Component), no new dependencies.

## Global Constraints

- No new dependencies, no API/route changes, no schema changes, no re-ingestion needed — everything reads fields (`bandera`, `latitud`) that already exist on every historial item today.
- Scope is the sidebar (`PanelHistorial`) only. The map's marker popups (`MapaSismos.tsx`) are explicitly out of scope for this round.
- The country filter is a client-side filter over whatever the current `tipo` view already returned. For `top10anios` specifically, this means "Solo Chile" filters *after* the server already limited results to the top 10 by magnitude (mixed countries) — so enabling the filter there can show fewer than 10 items. This is an accepted, documented limitation, not a bug to fix in this plan.
- The region lookup is a latitude-only approximation (Chile's regions run roughly north-to-south) — it will occasionally misattribute a place within ~50km of a regional boundary. Acceptable for a descriptive subtitle, not a precise legal designation.
- Workspace scope `@sismos/*`, pnpm only, Node >=24. No automated test framework in this monorepo — verification is build/lint/typecheck plus a manual browser confirmation from the human.

## Repo Context (read this if you have no prior context)

`apps/web/components/historial/PanelHistorial.tsx` (current full content, to be modified in Task 2):

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
  bandera: string | null;
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
                  {evento.bandera ?? "🌎"} {evento.lugar}
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

`bandera` is always exactly `"🇨🇱"` for Chile-sourced events (both `fuente: "csn"` live events and all `sismos_historicos` entries — set as a literal string in `packages/shared`'s normalizers and the backfill script), so `evento.bandera === "🇨🇱"` is a reliable Chile check with no ambiguity.

---

### Task 1: Chile region lookup

**Files:**
- Create: `apps/web/lib/region-chile.ts`

**Interfaces:**
- Produces: `regionChilePorLatitud(latitud: number): string | null` — exported from `apps/web/lib/region-chile.ts`. Task 2 imports it by name.

- [ ] **Step 1: Write the lookup table and function**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/region-chile.ts`:

```ts
interface RegionChile {
  hasta: number;
  nombre: string;
}

const REGIONES_CHILE: RegionChile[] = [
  { hasta: -19.2, nombre: "Arica y Parinacota" },
  { hasta: -21.0, nombre: "Tarapacá" },
  { hasta: -25.8, nombre: "Antofagasta" },
  { hasta: -29.0, nombre: "Atacama" },
  { hasta: -32.0, nombre: "Coquimbo" },
  { hasta: -33.1, nombre: "Valparaíso" },
  { hasta: -34.0, nombre: "Metropolitana de Santiago" },
  { hasta: -35.0, nombre: "Libertador General Bernardo O'Higgins" },
  { hasta: -36.2, nombre: "Maule" },
  { hasta: -37.1, nombre: "Ñuble" },
  { hasta: -38.0, nombre: "Biobío" },
  { hasta: -39.3, nombre: "La Araucanía" },
  { hasta: -40.1, nombre: "Los Ríos" },
  { hasta: -43.4, nombre: "Los Lagos" },
  { hasta: -49.0, nombre: "Aysén del General Carlos Ibáñez del Campo" },
  { hasta: -Infinity, nombre: "Magallanes y de la Antártica Chilena" },
];

export function regionChilePorLatitud(latitud: number): string | null {
  if (latitud > -17.0 || latitud < -56.0) return null;
  for (const region of REGIONES_CHILE) {
    if (latitud > region.hasta) return region.nombre;
  }
  return null;
}
```

(Approximate real regional boundary latitudes, ordered north to south. Chile's regions run roughly perpendicular to latitude lines, so a latitude-only lookup is a reasonable approximation for a descriptive subtitle — not precise at the ~50km scale near a boundary.)

- [ ] **Step 2: Spot-check with real coordinates**

```bash
cd /Users/rodrigoguerrero/Sites/sismos/apps/web
node --experimental-strip-types -e '
import { regionChilePorLatitud } from "./lib/region-chile.ts";
console.log("Huasco (-28.47):", regionChilePorLatitud(-28.47));
console.log("Valdivia (-39.8):", regionChilePorLatitud(-39.8));
console.log("Santiago (-33.45):", regionChilePorLatitud(-33.45));
console.log("Punta Arenas (-53.16):", regionChilePorLatitud(-53.16));
console.log("Out of range (-10):", regionChilePorLatitud(-10));
'
```

Expected: `Atacama`, `Los Ríos`, `Metropolitana de Santiago`, `Magallanes y de la Antártica Chilena`, `null`.

- [ ] **Step 3: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/lib/region-chile.ts
git commit -m "feat: add Chile region lookup by latitude"
```

---

### Task 2: Country toggle + region subtitle in `PanelHistorial`

**Files:**
- Modify: `apps/web/components/historial/PanelHistorial.tsx`

**Interfaces:**
- Consumes: `regionChilePorLatitud` from `../../lib/region-chile` (Task 1).
- Produces: no new exports — this is the final consumer.

- [ ] **Step 1: Replace the component**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/historial/PanelHistorial.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { colorPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "../../lib/region-chile";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
  latitud: number;
  longitud: number;
  bandera: string | null;
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
  const [soloChile, setSoloChile] = useState(false);
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

  const eventosFiltrados = soloChile
    ? eventos.filter((evento) => evento.bandera === "🇨🇱")
    : eventos;

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
          <button
            type="button"
            onClick={() => setSoloChile((v) => !v)}
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
                  {evento.bandera ?? "🌎"} {evento.lugar}
                </div>
                {region && (
                  <div className="text-xs text-neutral-500">{region}</div>
                )}
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

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web/components/historial/PanelHistorial.tsx
git commit -m "feat: add Solo Chile toggle and region subtitle to historial panel"
```

---

### Task 3: Verification

**Files:**
- None created or modified — this task only runs commands.

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: confirmation that the whole monorepo builds/lints/typechecks, and (from the human) that the toggle and region subtitle work and look right.

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

> "Please refresh http://localhost:3000 and confirm: (1) there's a '🇨🇱 Solo Chile' toggle next to the view selector, and clicking it filters the list to only Chile events (and clicking again shows everyone), (2) Chile events now show a small region name (e.g. 'Atacama', 'Los Ríos') under the place name, world events don't show a region line."

- [ ] **Step 3: Clean up**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git status --short
```

Expected: clean (no files besides what Tasks 1-2 already committed).

## Self-Review Notes

- **Coverage:** country toggle (Task 2, filters by the already-existing `bandera` field, no server round-trip needed), region subtitle (Task 1's lookup + Task 2's conditional rendering, Chile-only). Map popup explicitly untouched per the approved scope.
- **No placeholders:** every step shows literal file content; the two accepted limitations (client-side filter after `top10anios`'s server-side limit; latitude-only region approximation) are explicitly named as accepted, not left vague.
- **Type consistency:** `regionChilePorLatitud(latitud: number): string | null` (Task 1) is called with `evento.latitud` (a `number`, matching `ItemHistorial`) in Task 2, and its `string | null` return is used directly in a `{region && (...)}` conditional — no type mismatch.
