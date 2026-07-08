# Mapa/UI Real (apps/web) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `apps/web`'s placeholder page with the real UI: a MapLibre GL map showing live earthquakes (with a pulse animation for newly-detected ones), a historial panel (3 selectable views), and a responsive layout (sidebar on desktop, bottom sheet on mobile/tablet).

**Architecture:** `app/page.tsx` is a Server Component that reads the last 10 days of `sismos` directly via `@sismos/db` (through a new `apps/web/lib/fetch-sismos.ts` facade) and passes them to a Client Component (`MapaSismos`) that renders the map and polls `GET /api/sismos?since=` every 30s for new events. A second Client Component (`PanelHistorial`) independently fetches `GET /api/historial?tipo=` on mount and whenever its selector changes.

**Tech Stack:** TypeScript, Next.js 16 (App Router, Server + Client Components), MapLibre GL 5.24.0, Tailwind v4, Mongoose 9.7.4 (via `@sismos/db`).

## Global Constraints

- No clustering, no push notifications, no bottom-sheet drag physics — all explicitly deferred per the spec.
- Map only pins the **last 10 days** of `sismos` — `sismos_historicos` never appears as map pins, only in the historial panel.
- Polling interval: 30 seconds. Historial has 3 fixed views: `historico`, `top10anios`, `ultimos10dias`.
- Responsive breakpoint: Tailwind's `lg` (1024px). Below `lg` = bottom sheet (covers mobile + tablet). `lg` and above = fixed sidebar.
- Map style: OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) — no API key needed, already verified live.
- Workspace scope `@sismos/*`, pnpm only, Node >=24. `apps/web` currently depends only on `@sismos/shared` — this plan adds `@sismos/db` and `maplibre-gl`.
- No automated test framework in this monorepo — verification is real builds/lints/typechecks plus manual browser confirmation (this plan cannot drive a real browser; the final task says so explicitly and asks the human to confirm visually).
- Spec reference: `docs/superpowers/specs/2026-07-08-sismos-mapa-ui-design.md`.

## Repo Context (read this if you have no prior context)

pnpm + Turborepo monorepo. Relevant existing pieces (already implemented, do not recreate):
- `@sismos/db` exports `getMongooseConnection()`, `SismoModel`/`Sismo` type, `SismoHistoricoModel`/`SismoHistorico` type, and query helpers in `packages/db/src/queries/sismo.ts` (`findRecentByFuente`, `upsertSismo`, `setRefCruzada`, `replaceWithCsn`) and `packages/db/src/queries/sismo-historico.ts` (`upsertSismoHistorico`). `Sismo` has fields `{ fuente, externalId, fecha (Date), magnitud, profundidadKm, latitud, longitud, lugar, refCruzada? }`. `SismoHistorico` has `{ externalId, fecha (Date), magnitud, profundidadKm, latitud, longitud, lugar }` (no `fuente`, no `refCruzada`).
- `apps/web` today: `app/page.tsx` is a placeholder (`<h1>Sismos — próximamente</h1>`), `app/layout.tsx` sets `<html lang="es">`/metadata/PWA manifest (do not touch), `app/globals.css` has Tailwind v4 import + a `@theme` block with `--color-background: #0a0a0a` / `--color-foreground: #ededed` applied unconditionally on `body` (this app has one fixed dark theme, not an OS-adaptive light/dark toggle — new components in this plan should NOT use `dark:` Tailwind variants, just pick colors that fit this fixed dark theme directly).
- `apps/web`'s `tsconfig.json`/`eslint.config.js` already extend `@sismos/typescript-config/nextjs.json` / `@sismos/eslint-config/next-js` — `moduleResolution: "Bundler"`, so relative imports do NOT need `.js` extensions.
- Local MongoDB runs via the repo-root `docker-compose.yml` (`mongo:8`, port 27017). `apps/web` will need its own `apps/web/.env.local` (gitignored) with `MONGODB_URI=mongodb://localhost:27017/sismos` to run/build against real data locally — it doesn't exist yet (only `apps/ingestor/.env.local` does).

---

### Task 1: `packages/db` — read query helpers for the map/historial

**Files:**
- Modify: `packages/db/src/queries/sismo.ts`
- Modify: `packages/db/src/queries/sismo-historico.ts`

**Interfaces:**
- Produces: `findUltimos10Dias(): Promise<Sismo[]>`, `findSismosSince(since: Date): Promise<Sismo[]>`, `findTop10UltimosAnios(anios: number): Promise<Sismo[]>` (all in `@sismos/db`, alongside the existing `findRecentByFuente`/`upsertSismo`/etc.), and `findTopHistoricos(): Promise<SismoHistorico[]>`. Task 2's `lib/fetch-sismos.ts` imports all four by name.

- [ ] **Step 1: Add the three new `Sismo` read queries**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/queries/sismo.ts` with:

```ts
import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { SismoModel, type Sismo } from "../models/sismo";

export async function findRecentByFuente(
  fuente: SismoFuente,
  since: Date,
): Promise<Sismo[]> {
  return SismoModel.find({ fuente, fecha: { $gte: since } }).lean();
}

export async function upsertSismo(evento: SismoNormalizado): Promise<Sismo> {
  const result = await SismoModel.findOneAndUpdate(
    { fuente: evento.fuente, externalId: evento.externalId },
    { $set: evento },
    { upsert: true, new: true },
  ).lean();
  if (!result) {
    throw new Error("upsertSismo: findOneAndUpdate returned null unexpectedly");
  }
  return result;
}

export async function setRefCruzada(
  fuente: SismoFuente,
  externalId: string,
  refCruzada: { fuente: SismoFuente; externalId: string },
): Promise<Sismo | null> {
  return SismoModel.findOneAndUpdate(
    { fuente, externalId },
    { $set: { refCruzada } },
    { new: true },
  ).lean();
}

export async function replaceWithCsn(
  usgsExternalId: string,
  csnEvento: SismoNormalizado,
): Promise<Sismo | null> {
  return SismoModel.findOneAndUpdate(
    { fuente: "usgs", externalId: usgsExternalId },
    {
      $set: {
        ...csnEvento,
        refCruzada: { fuente: "usgs", externalId: usgsExternalId },
      },
    },
    { new: true },
  ).lean();
}

export async function findUltimos10Dias(): Promise<Sismo[]> {
  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  return SismoModel.find({ fecha: { $gte: since } })
    .sort({ fecha: -1 })
    .lean();
}

export async function findSismosSince(since: Date): Promise<Sismo[]> {
  return SismoModel.find({ fecha: { $gt: since } })
    .sort({ fecha: 1 })
    .lean();
}

export async function findTop10UltimosAnios(anios: number): Promise<Sismo[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - anios);
  return SismoModel.find({ fecha: { $gte: since } })
    .sort({ magnitud: -1 })
    .limit(10)
    .lean();
}
```

- [ ] **Step 2: Add the historical read query**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/queries/sismo-historico.ts` with:

```ts
import {
  SismoHistoricoModel,
  type SismoHistorico,
} from "../models/sismo-historico";

export interface SismoHistoricoInput {
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
}

export async function upsertSismoHistorico(
  evento: SismoHistoricoInput,
): Promise<SismoHistorico> {
  const result = await SismoHistoricoModel.findOneAndUpdate(
    { externalId: evento.externalId },
    { $set: evento },
    { upsert: true, new: true },
  ).lean();
  if (!result) {
    throw new Error(
      "upsertSismoHistorico: findOneAndUpdate returned null unexpectedly",
    );
  }
  return result;
}

export async function findTopHistoricos(): Promise<SismoHistorico[]> {
  return SismoHistoricoModel.find({}).sort({ magnitud: -1 }).lean();
}
```

`packages/db/src/index.ts` already has `export * from "./queries/sismo"` and `export * from "./queries/sismo-historico"` — no change needed there.

- [ ] **Step 3: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter @sismos/db check-types
pnpm --filter @sismos/db lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/db
git commit -m "feat: add read query helpers for the map and historial views"
```

---

### Task 2: `apps/web` — dependencies + data-fetching facade

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/lib/fetch-sismos.ts`

**Interfaces:**
- Consumes: `getMongooseConnection`, `findUltimos10Dias`, `findSismosSince`, `findTop10UltimosAnios`, `findTopHistoricos`, `Sismo`, `SismoHistorico` from `@sismos/db` (Task 1).
- Produces: `getUltimos10Dias(): Promise<Sismo[]>`, `getSismosDesde(since: Date): Promise<Sismo[]>`, `getTop10UltimosAnios(): Promise<Sismo[]>`, `getTopHistoricos(): Promise<SismoHistorico[]>` — all exported from `apps/web/lib/fetch-sismos.ts`. Task 3 (API routes) and Task 6 (`page.tsx`) import these by name.

- [ ] **Step 1: Add `@sismos/db` and `maplibre-gl` to `apps/web/package.json`**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/package.json` with:

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

(Only the `dependencies` block changed — `@sismos/db` and `maplibre-gl` added. Scripts/devDependencies are unchanged from the current file.)

- [ ] **Step 2: Add the data-fetching facade**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/web/lib
```

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/lib/fetch-sismos.ts`:

```ts
import { getMongooseConnection } from "@sismos/db";
import {
  findUltimos10Dias,
  findSismosSince,
  findTop10UltimosAnios,
  findTopHistoricos,
  type Sismo,
  type SismoHistorico,
} from "@sismos/db";

export async function getUltimos10Dias(): Promise<Sismo[]> {
  await getMongooseConnection();
  return findUltimos10Dias();
}

export async function getSismosDesde(since: Date): Promise<Sismo[]> {
  await getMongooseConnection();
  return findSismosSince(since);
}

export async function getTop10UltimosAnios(): Promise<Sismo[]> {
  await getMongooseConnection();
  return findTop10UltimosAnios(10);
}

export async function getTopHistoricos(): Promise<SismoHistorico[]> {
  await getMongooseConnection();
  return findTopHistoricos();
}
```

- [ ] **Step 3: Install and typecheck/lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm install
pnpm --filter web check-types
pnpm --filter web lint
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web pnpm-lock.yaml
git commit -m "feat: add @sismos/db and maplibre-gl to apps/web, add fetch-sismos facade"
```

---

### Task 3: API routes (`/api/sismos`, `/api/historial`)

**Files:**
- Create: `apps/web/app/api/sismos/route.ts`
- Create: `apps/web/app/api/historial/route.ts`

**Interfaces:**
- Consumes: `getSismosDesde`, `getUltimos10Dias`, `getTop10UltimosAnios`, `getTopHistoricos` from `apps/web/lib/fetch-sismos` (Task 2).
- Produces: `GET /api/sismos?since=<ISO date>` → `{ sismos: Sismo[] }` (400 if `since` missing/invalid, 500 on DB error). `GET /api/historial?tipo=historico|top10anios|ultimos10dias` → `{ eventos: (Sismo | SismoHistorico)[] }` (400 if `tipo` missing/invalid, 500 on DB error). Task 5 (`MapaSismos`) polls the first; Task 6 (`PanelHistorial`) calls the second.

- [ ] **Step 1: Add the polling route**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/web/app/api/sismos
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/web/app/api/historial
```

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/app/api/sismos/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSismosDesde } from "../../../lib/fetch-sismos";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");

  if (!sinceParam) {
    return NextResponse.json(
      { error: "Missing required query param: since" },
      { status: 400 },
    );
  }

  const since = new Date(sinceParam);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: "Invalid date in query param: since" },
      { status: 400 },
    );
  }

  try {
    const sismos = await getSismosDesde(since);
    return NextResponse.json({ sismos });
  } catch (error) {
    console.error("[api/sismos] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Add the historial route**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/app/api/historial/route.ts`:

```ts
import { NextResponse } from "next/server";
import {
  getUltimos10Dias,
  getTop10UltimosAnios,
  getTopHistoricos,
} from "../../../lib/fetch-sismos";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

function esTipoValido(valor: string | null): valor is TipoHistorial {
  return (
    valor === "historico" ||
    valor === "top10anios" ||
    valor === "ultimos10dias"
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo");

  if (!esTipoValido(tipo)) {
    return NextResponse.json(
      {
        error:
          "Invalid or missing query param: tipo (expected historico | top10anios | ultimos10dias)",
      },
      { status: 400 },
    );
  }

  try {
    if (tipo === "historico") {
      const eventos = await getTopHistoricos();
      return NextResponse.json({ eventos });
    }
    if (tipo === "top10anios") {
      const eventos = await getTop10UltimosAnios();
      return NextResponse.json({ eventos });
    }
    const eventos = await getUltimos10Dias();
    return NextResponse.json({ eventos });
  } catch (error) {
    console.error("[api/historial] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
```

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
git add apps/web/app/api
git commit -m "feat: add /api/sismos and /api/historial route handlers"
```

---

### Task 4: Marker helper + pulse animation CSS

**Files:**
- Create: `apps/web/components/mapa/marcador.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Produces: `colorPorMagnitud(magnitud: number): string`, `tamanoPorMagnitud(magnitud: number): number`, `crearElementoMarcador(magnitud: number, opciones: { pulsando: boolean }): HTMLDivElement` — all exported from `apps/web/components/mapa/marcador.ts`. Task 5 (`MapaSismos.tsx`) imports `crearElementoMarcador` by name. Also produces the CSS classes `marcador-sismo` / `marcador-sismo--pulso` and the `pulso-sismo` keyframe, which `crearElementoMarcador`'s output relies on.

- [ ] **Step 1: Add the marker helper**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/web/components/mapa
```

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/mapa/marcador.ts`:

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
```

- [ ] **Step 2: Add the pulse animation CSS**

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
```

(8 iterations × 1.5s = 12s total pulse, inside the spec's 10-15s range. `animation-fill-mode: forwards` keeps the pseudo-element invisible/scaled-up after it finishes, instead of snapping back to a visible overlapping circle.)

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
git add apps/web/components/mapa apps/web/app/globals.css
git commit -m "feat: add magnitude-based marker styling and pulse animation"
```

---

### Task 5: `MapaSismos` Client Component (MapLibre GL + polling)

**Files:**
- Create: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `crearElementoMarcador` from `./marcador` (Task 4). Calls `GET /api/sismos?since=` (Task 3).
- Produces: default-exported `MapaSismos` component and the named type `SismoMapa` (`{ externalId: string; fecha: string; magnitud: number; latitud: number; longitud: number; lugar: string }`), both from `apps/web/components/mapa/MapaSismos.tsx`. Task 6 (`page.tsx`) imports both by name.

- [ ] **Step 1: Write the component**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/mapa/MapaSismos.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador } from "./marcador";

export interface SismoMapa {
  externalId: string;
  fecha: string;
  magnitud: number;
  latitud: number;
  longitud: number;
  lugar: string;
}

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
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
) {
  if (marcadores.has(sismo.externalId)) return;

  const el = crearElementoMarcador(sismo.magnitud, opciones);
  const marker = new maplibregl.Marker({ element: el })
    .setLngLat([sismo.longitud, sismo.latitud])
    .setPopup(
      new maplibregl.Popup({ offset: 12 }).setHTML(
        `<strong>${sismo.lugar}</strong><br/>M${sismo.magnitud} — ${new Date(
          sismo.fecha,
        ).toLocaleString("es-CL")}`,
      ),
    )
    .addTo(map);

  marcadores.set(sismo.externalId, marker);
}

export default function MapaSismos({ sismosIniciales }: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ultimaFechaRef = useRef<string>(
    sismosIniciales.reduce(
      (max, s) => (s.fecha > max ? s.fecha : max),
      sismosIniciales[0]?.fecha ?? new Date(0).toISOString(),
    ),
  );

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
      agregarMarcador(map, marcadoresRef.current, sismo, { pulsando: false });
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
            agregarMarcador(map, marcadoresRef.current, sismo, {
              pulsando: true,
            });
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

  return <div ref={mapContainerRef} className="h-full w-full" />;
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
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat: add MapaSismos client component (MapLibre GL + 30s polling)"
```

---

### Task 6: `PanelHistorial` + wire everything into `page.tsx`

**Files:**
- Create: `apps/web/components/historial/PanelHistorial.tsx`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `getUltimos10Dias` from `../lib/fetch-sismos` (Task 2); `MapaSismos`, `SismoMapa` from `../components/mapa/MapaSismos` (Task 5); calls `GET /api/historial?tipo=` (Task 3).
- Produces: the final rendered page — no further tasks depend on this one.

- [ ] **Step 1: Write the historial panel**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/web/components/historial
```

Create `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/historial/PanelHistorial.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
}

const OPCIONES: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Histórico" },
];

export default function PanelHistorial() {
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<ItemHistorial[]>([]);
  const [expandido, setExpandido] = useState(false);

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

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[80vh] flex-col rounded-t-2xl bg-neutral-900 shadow-lg transition-transform duration-300 lg:static lg:h-full lg:max-h-none lg:w-[360px] lg:translate-y-0 lg:rounded-none lg:shadow-none lg:transition-none ${
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

      <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-6 lg:h-full lg:pt-4">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoHistorial)}
          className="rounded border border-neutral-700 bg-transparent px-2 py-1 text-sm"
        >
          {OPCIONES.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>

        <ul className="flex flex-col gap-2">
          {eventos.map((evento) => (
            <li
              key={evento.externalId}
              className="rounded border border-neutral-800 px-3 py-2 text-sm"
            >
              <div className="font-semibold">{evento.lugar}</div>
              <div className="text-neutral-400">
                M{evento.magnitud} —{" "}
                {new Date(evento.fecha).toLocaleString("es-CL")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the map, panel, and initial data fetch into `page.tsx`**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/app/page.tsx` with:

```tsx
import { getUltimos10Dias } from "../lib/fetch-sismos";
import MapaSismos, { type SismoMapa } from "../components/mapa/MapaSismos";
import PanelHistorial from "../components/historial/PanelHistorial";

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
      <div className="relative flex-1">
        <MapaSismos sismosIniciales={sismosIniciales} />
      </div>
      <PanelHistorial />
    </main>
  );
}
```

`export const dynamic = "force-dynamic"` prevents Next from trying to statically prerender this page at build time (it always needs a fresh DB read) — without it, `next build` would attempt to pre-render `/` once at build time and cache that result.

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
git add apps/web/components/historial apps/web/app/page.tsx
git commit -m "feat: add PanelHistorial and wire map + historial into the home page"
```

---

### Task 7: Integration verification (real MongoDB + real browser confirmation)

**Files:**
- None created or modified — this task only runs commands, plus (if missing) creates the gitignored local env file needed to run it.

**Interfaces:**
- Consumes: everything from Tasks 1-6.
- Produces: confirmation that `apps/web` builds/lints/typechecks, that both API routes respond correctly against real data, and (manually, by a human) that the map and historial panel actually render and work in a browser.

- [ ] **Step 1: Make sure `apps/web/.env.local` exists**

```bash
cat /Users/rodrigoguerrero/Sites/sismos/apps/web/.env.local 2>/dev/null || echo "MISSING"
```

If it prints `MISSING`:

```bash
echo "MONGODB_URI=mongodb://localhost:27017/sismos" > /Users/rodrigoguerrero/Sites/sismos/apps/web/.env.local
```

- [ ] **Step 2: Make sure local MongoDB is running**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
if nc -z localhost 27017 2>/dev/null; then
  echo "Mongo already reachable on 27017"
else
  pnpm db:up
  sleep 3
fi
```

- [ ] **Step 3: Make sure there's real data to look at**

```bash
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos.countDocuments({ fecha: { $gte: new Date(Date.now() - 10*24*60*60*1000) } })'
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos_historicos.countDocuments({})'
```

If the first count is 0, run the ingestor once to populate recent data (from the repo root):

```bash
cd /Users/rodrigoguerrero/Sites/sismos/apps/ingestor
pnpm dev > /tmp/sismos-ingestor-verify.log 2>&1 &
INGESTOR_PID=$!
sleep 4
curl -s http://localhost:3001/api/ingest
echo
kill $INGESTOR_PID 2>/dev/null || true
cd /Users/rodrigoguerrero/Sites/sismos
```

If the second count (`sismos_historicos`) is 0, something is wrong with the already-merged historical backfill — stop and report BLOCKED rather than re-running backfill scripts speculatively.

- [ ] **Step 4: Full monorepo build/lint/check-types**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm build
pnpm lint
pnpm check-types
```

Expected: all exit 0 across all 6 packages/apps.

- [ ] **Step 5: Start `apps/web` and hit both API routes directly**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web dev > /tmp/sismos-web-verify.log 2>&1 &
WEB_PID=$!
sleep 4
curl -s "http://localhost:3000/api/sismos?since=$(date -u -v-10d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '10 days ago' +%Y-%m-%dT%H:%M:%SZ)"
echo
curl -s "http://localhost:3000/api/historial?tipo=ultimos10dias"
echo
curl -s "http://localhost:3000/api/historial?tipo=top10anios"
echo
curl -s "http://localhost:3000/api/historial?tipo=historico"
echo
curl -s -o /dev/null -w "homepage: %{http_code}\n" http://localhost:3000/
kill $WEB_PID 2>/dev/null || true
```

Expected: `/api/sismos?since=...` returns `{"sismos":[...]}` (an array, possibly matching what Step 3 counted); all three `/api/historial` calls return `{"eventos":[...]}` with `historico` giving exactly 10 items sorted by descending magnitude (Valdivia M9.5 first); homepage returns `200`.

- [ ] **Step 6: Ask the human to confirm visually**

This plan has no way to drive a real browser to confirm the map actually renders, markers appear in the right places, the pulse animation plays, or the bottom sheet/sidebar responsive behavior looks right — Steps 3-5 only prove the data layer and HTTP surface work. Report to the human:

> "Backend verified end-to-end (real Mongo data, both API routes, build/lint/check-types all green). I can't visually confirm the map/animations/responsive layout render correctly — please run `pnpm --filter web dev` and open http://localhost:3000 yourself (and try resizing below/above 1024px width) to confirm the map, markers, and historial panel look right."

- [ ] **Step 7: Clean up**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
ps aux | grep "next dev" | grep -v grep || echo "no orphan next dev processes"
git status --short
```

Do NOT run `pnpm db:down` (leave MongoDB running — it's a shared local resource other work may depend on). If `git status --short` shows anything beyond what earlier tasks already committed (e.g. a regenerated `next-env.d.ts`), commit it:

```bash
git add -A
git commit -m "chore: regenerate web route types" --allow-empty
```

## Self-Review Notes

- **Spec coverage:** data architecture (Task 1 + 2: Server Component initial load, 30s polling, 3-view historial — all present), map (Task 4 + 5: MapLibre GL, OpenFreeMap style, Chile-centered initial view, magnitude color/size, pulse animation on new events, no clustering), historial panel (Task 6: single panel with selector, not 3 tabs), responsive (Task 6: `lg` breakpoint, fixed sidebar vs. 2-position bottom sheet, no drag physics), error handling (Task 3 + 6: polling retries silently next cycle, API routes 500 on DB failure, Server Component degrades to empty state — all match the spec's "Manejo de errores" section verbatim). Push notifications and clustering are correctly absent from every task.
- **No placeholders:** every step shows literal file content. Task 7's Step 6 explicitly hands off visual confirmation to the human rather than falsely claiming the map "works" — that's an honest capability limit, not a placeholder.
- **Type consistency:** `Sismo`/`SismoHistorico` (Task 1, from `@sismos/db`) flow through `apps/web/lib/fetch-sismos.ts` (Task 2) unchanged, then get explicitly mapped to the plain-serializable `SismoMapa` shape in `page.tsx` (Task 6) before reaching the client — `SismoMapa`'s field names (`externalId`, `fecha`, `magnitud`, `latitud`, `longitud`, `lugar`) match exactly what `MapaSismos.tsx` (Task 5) and the `/api/sismos` route (Task 3) both produce/consume. `ItemHistorial` in `PanelHistorial.tsx` (Task 6) uses the same field names as what `/api/historial` (Task 3) returns for all three `tipo` values (both `Sismo` and `SismoHistorico` share `externalId`/`fecha`/`magnitud`/`lugar`, which is all `ItemHistorial` reads).
