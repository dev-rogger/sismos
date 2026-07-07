# Ingestor Real (CSN + USGS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `packages/shared`/`packages/db` stubs and the `apps/ingestor` placeholder route with a working ingestion pipeline that fetches CSN + USGS, normalizes, deduplicates across sources, and upserts into MongoDB.

**Architecture:** `apps/ingestor`'s `GET /api/ingest` calls a thin orchestration function (`lib/ingest.ts`) that fetches both sources in parallel (each independently fault-tolerant), normalizes via `@sismos/shared`, checks Mongo for cross-source duplicates via `@sismos/db` query helpers, and upserts. Local development runs against a Dockerized MongoDB instead of Atlas.

**Tech Stack:** TypeScript, Mongoose 9.7.4, Next.js 16 route handlers, native `fetch`, Docker Compose (MongoDB 8).

## Global Constraints

- No automated tests this round (per spec — Vitest was explicitly declined).
- No changes to `packages/db/src/models/sismo-historico.ts` (backfill is out of scope).
- No changes to `apps/ingestor/vercel.ts` (production cron cadence is deferred, already documented as a known risk).
- CSN source: `https://api.xor.cl/sismo/recent` (the originally-referenced `api-sismologia-chile` API is dead — confirmed 404).
- USGS source: `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson`.
- Dedupe: same event if within ±2 minutes AND ≤100km (haversine) AND ±0.5 magnitude of an event from the *other* source. On match, CSN data wins.
- Every relative import inside `packages/shared` and `packages/db` must use an explicit `.js` extension (NodeNext module resolution — this bit Task 6 of the scaffold plan already, don't reintroduce it).
- Workspace scope `@sismos/*` throughout.
- Spec reference: `docs/superpowers/specs/2026-07-07-sismos-ingestor-design.md`.

---

### Task 1: `packages/shared` — real normalization + dedupe matcher

**Files:**
- Modify: `packages/shared/src/normalize/csn.ts`
- Modify: `packages/shared/src/normalize/usgs.ts`
- Create: `packages/shared/src/dedupe.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `SismoNormalizado`, `SismoFuente` from `./types.js` (already defined, unchanged).
- Produces: `CsnSismoRaw` (real shape, replaces `Record<string, unknown>`), `normalizeCsnSismo(raw: CsnSismoRaw): SismoNormalizado`, `UsgsFeatureRaw` (real shape), `normalizeUsgsFeature(raw: UsgsFeatureRaw): SismoNormalizado`, `haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number`, `findDuplicate(candidate: SismoNormalizado, others: SismoNormalizado[]): SismoNormalizado | null` — all exported from `@sismos/shared`. Task 2 and Task 3 import these by name.

- [ ] **Step 1: Replace the CSN normalization stub**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize/csn.ts` with:

```ts
import type { SismoNormalizado } from "../types.js";

export interface CsnSismoRaw {
  id: string;
  url: string;
  map_url: string;
  local_date: string;
  utc_date: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: { value: number; measure_unit: string };
  geo_reference: string;
}

export function normalizeCsnSismo(raw: CsnSismoRaw): SismoNormalizado {
  return {
    fuente: "csn",
    externalId: raw.id,
    fecha: new Date(`${raw.utc_date.replace(" ", "T")}Z`),
    magnitud: raw.magnitude.value,
    profundidadKm: raw.depth,
    latitud: raw.latitude,
    longitud: raw.longitude,
    lugar: raw.geo_reference,
  };
}
```

- [ ] **Step 2: Replace the USGS normalization stub**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize/usgs.ts` with:

```ts
import type { SismoNormalizado } from "../types.js";

export interface UsgsFeatureRaw {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
  };
  geometry: {
    coordinates: [number, number, number];
  };
}

export function normalizeUsgsFeature(raw: UsgsFeatureRaw): SismoNormalizado {
  const [longitud, latitud, profundidadKm] = raw.geometry.coordinates;
  return {
    fuente: "usgs",
    externalId: raw.id,
    fecha: new Date(raw.properties.time),
    magnitud: raw.properties.mag,
    profundidadKm,
    latitud,
    longitud,
    lugar: raw.properties.place,
  };
}
```

- [ ] **Step 3: Add the dedupe matcher**

Create `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/dedupe.ts`:

```ts
import type { SismoNormalizado } from "./types.js";

const EARTH_RADIUS_KM = 6371;
const TIME_WINDOW_MS = 2 * 60 * 1000;
const MAX_DISTANCE_KM = 100;
const MAX_MAGNITUDE_DIFF = 0.5;

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function findDuplicate(
  candidate: SismoNormalizado,
  others: SismoNormalizado[],
): SismoNormalizado | null {
  for (const other of others) {
    const timeDiffMs = Math.abs(
      candidate.fecha.getTime() - other.fecha.getTime(),
    );
    if (timeDiffMs > TIME_WINDOW_MS) continue;

    const distanceKm = haversineDistanceKm(
      candidate.latitud,
      candidate.longitud,
      other.latitud,
      other.longitud,
    );
    if (distanceKm > MAX_DISTANCE_KM) continue;

    const magnitudeDiff = Math.abs(candidate.magnitud - other.magnitud);
    if (magnitudeDiff > MAX_MAGNITUDE_DIFF) continue;

    return other;
  }
  return null;
}
```

- [ ] **Step 4: Export the dedupe module from the barrel**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/index.ts` with:

```ts
export * from "./types.js";
export * from "./normalize/csn.js";
export * from "./normalize/usgs.js";
export * from "./dedupe.js";
```

- [ ] **Step 5: Typecheck and lint this package**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter @sismos/shared check-types
pnpm --filter @sismos/shared lint
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/shared
git commit -m "feat: implement real CSN/USGS normalization and cross-source dedupe matcher"
```

---

### Task 2: `packages/db` — real `SismoModel` schema + query helpers

**Files:**
- Modify: `packages/db/src/models/sismo.ts`
- Create: `packages/db/src/queries/sismo.ts`
- Modify: `packages/db/src/index.ts`
- Modify: `packages/db/package.json`

**Interfaces:**
- Consumes: `SismoNormalizado`, `SismoFuente` from `@sismos/shared` (Task 1).
- Produces: `SismoModel` (real schema, unique index on `(fuente, externalId)`), `findRecentByFuente(fuente: SismoFuente, since: Date): Promise<Sismo[]>`, `upsertSismo(evento: SismoNormalizado): Promise<Sismo>`, `setRefCruzada(fuente: SismoFuente, externalId: string, refCruzada: { fuente: SismoFuente; externalId: string }): Promise<Sismo | null>`, `replaceWithCsn(usgsExternalId: string, csnEvento: SismoNormalizado): Promise<Sismo | null>` — all exported from `@sismos/db`. Task 3 imports these by name.

- [ ] **Step 1: Add `@sismos/shared` as a runtime dependency**

In `/Users/rodrigoguerrero/Sites/sismos/packages/db/package.json`, add `"@sismos/shared": "workspace:*"` to `dependencies` (alongside the existing `"mongoose": "^9.7.4"`), so the file becomes:

```json
{
  "name": "@sismos/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint --max-warnings 0",
    "check-types": "tsc --noEmit"
  },
  "dependencies": {
    "@sismos/shared": "workspace:*",
    "mongoose": "^9.7.4"
  },
  "devDependencies": {
    "@sismos/eslint-config": "workspace:*",
    "@sismos/typescript-config": "workspace:*",
    "@types/node": "^26.1.0",
    "eslint": "^9.39.1",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 2: Replace the `SismoModel` stub with the real schema**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/models/sismo.ts` with:

```ts
import { Schema, model, models, type InferSchemaType } from "mongoose";

const sismoSchema = new Schema(
  {
    fuente: { type: String, enum: ["csn", "usgs"], required: true },
    externalId: { type: String, required: true },
    fecha: { type: Date, required: true },
    magnitud: { type: Number, required: true },
    profundidadKm: { type: Number, required: true },
    latitud: { type: Number, required: true },
    longitud: { type: Number, required: true },
    lugar: { type: String, required: true },
    refCruzada: {
      fuente: { type: String, enum: ["csn", "usgs"] },
      externalId: String,
    },
  },
  { timestamps: true },
);

sismoSchema.index({ fuente: 1, externalId: 1 }, { unique: true });

export type Sismo = InferSchemaType<typeof sismoSchema>;

export const SismoModel =
  models.Sismo ?? model("Sismo", sismoSchema, "sismos");
```

- [ ] **Step 3: Add the query helpers**

Create `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/queries/sismo.ts`:

```ts
import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { SismoModel, type Sismo } from "../models/sismo.js";

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
```

- [ ] **Step 4: Export the query helpers from the barrel**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/index.ts` with:

```ts
export * from "./connection.js";
export * from "./models/sismo.js";
export * from "./models/sismo-historico.js";
export * from "./queries/sismo.js";
```

- [ ] **Step 5: Typecheck and lint this package**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm install
pnpm --filter @sismos/db check-types
pnpm --filter @sismos/db lint
```

(`pnpm install` is needed here because Step 1 added a new workspace dependency edge.)

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/db pnpm-lock.yaml
git commit -m "feat: implement real Sismo schema with unique index and dedupe query helpers"
```

---

### Task 3: `apps/ingestor` — fetch CSN/USGS and wire the real route handler

**Files:**
- Create: `apps/ingestor/lib/fetch-csn.ts`
- Create: `apps/ingestor/lib/fetch-usgs.ts`
- Create: `apps/ingestor/lib/ingest.ts`
- Modify: `apps/ingestor/app/api/ingest/route.ts`

**Interfaces:**
- Consumes: `CsnSismoRaw`, `UsgsFeatureRaw`, `normalizeCsnSismo`, `normalizeUsgsFeature`, `findDuplicate`, `SismoNormalizado` from `@sismos/shared` (Task 1); `getMongooseConnection`, `findRecentByFuente`, `upsertSismo`, `setRefCruzada`, `replaceWithCsn` from `@sismos/db` (Task 2).
- Produces: `fetchCsnRecent(): Promise<CsnSismoRaw[]>`, `fetchUsgsRecent(): Promise<UsgsFeatureRaw[]>`, `runIngest(): Promise<IngestSummary>`, and the `GET /api/ingest` route response shape `{ csn: { fetched, inserted, errors }, usgs: { fetched, inserted, errors }, deduped }`.

- [ ] **Step 1: Add the CSN fetcher**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/lib/fetch-csn.ts`:

```ts
import type { CsnSismoRaw } from "@sismos/shared";

const CSN_URL = "https://api.xor.cl/sismo/recent";

interface CsnResponse {
  status_code: number;
  status_description: string;
  events: CsnSismoRaw[];
}

export async function fetchCsnRecent(): Promise<CsnSismoRaw[]> {
  const res = await fetch(CSN_URL);
  if (!res.ok) {
    throw new Error(`CSN fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as CsnResponse;
  return data.events;
}
```

- [ ] **Step 2: Add the USGS fetcher**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/lib/fetch-usgs.ts`:

```ts
import type { UsgsFeatureRaw } from "@sismos/shared";

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson";

interface UsgsResponse {
  features: UsgsFeatureRaw[];
}

export async function fetchUsgsRecent(): Promise<UsgsFeatureRaw[]> {
  const res = await fetch(USGS_URL);
  if (!res.ok) {
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as UsgsResponse;
  return data.features;
}
```

- [ ] **Step 3: Add the orchestration function**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/lib/ingest.ts`:

```ts
import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  type SismoNormalizado,
} from "@sismos/shared";
import {
  findRecentByFuente,
  replaceWithCsn,
  setRefCruzada,
  upsertSismo,
} from "@sismos/db";
import { fetchCsnRecent } from "./fetch-csn";
import { fetchUsgsRecent } from "./fetch-usgs";

interface SourceResult {
  fetched: number;
  inserted: number;
  errors: number;
}

export interface IngestSummary {
  csn: SourceResult;
  usgs: SourceResult;
  deduped: number;
}

const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

export async function runIngest(): Promise<IngestSummary> {
  const summary: IngestSummary = {
    csn: { fetched: 0, inserted: 0, errors: 0 },
    usgs: { fetched: 0, inserted: 0, errors: 0 },
    deduped: 0,
  };

  let csnEventos: SismoNormalizado[] = [];
  try {
    const raw = await fetchCsnRecent();
    csnEventos = raw.map(normalizeCsnSismo);
    summary.csn.fetched = csnEventos.length;
  } catch (error) {
    console.error("[ingest] CSN fetch failed:", error);
    summary.csn.errors = 1;
  }

  let usgsEventos: SismoNormalizado[] = [];
  try {
    const raw = await fetchUsgsRecent();
    usgsEventos = raw.map(normalizeUsgsFeature);
    summary.usgs.fetched = usgsEventos.length;
  } catch (error) {
    console.error("[ingest] USGS fetch failed:", error);
    summary.usgs.errors = 1;
  }

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS);

  for (const evento of csnEventos) {
    const usgsCandidatos = await findRecentByFuente("usgs", since);
    const match = findDuplicate(evento, usgsCandidatos as SismoNormalizado[]);
    if (match) {
      await replaceWithCsn(match.externalId, evento);
      summary.deduped += 1;
    } else {
      await upsertSismo(evento);
      summary.csn.inserted += 1;
    }
  }

  for (const evento of usgsEventos) {
    const csnCandidatos = await findRecentByFuente("csn", since);
    const match = findDuplicate(evento, csnCandidatos as SismoNormalizado[]);
    if (match) {
      await setRefCruzada(match.fuente, match.externalId, {
        fuente: evento.fuente,
        externalId: evento.externalId,
      });
      summary.deduped += 1;
    } else {
      await upsertSismo(evento);
      summary.usgs.inserted += 1;
    }
  }

  return summary;
}
```

- [ ] **Step 4: Wire the route handler**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/app/api/ingest/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getMongooseConnection } from "@sismos/db";
import { runIngest } from "../../../lib/ingest";

export async function GET() {
  try {
    await getMongooseConnection();
  } catch (error) {
    console.error("[ingest] Mongo connection failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }

  const summary = await runIngest();
  return NextResponse.json(summary);
}
```

- [ ] **Step 5: Typecheck and lint this app**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter ingestor check-types
pnpm --filter ingestor lint
```

Expected: both exit 0. (This does not require a running Mongo — `check-types`/`lint` are static.)

- [ ] **Step 6: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/ingestor
git commit -m "feat: wire real CSN/USGS fetch, normalization, and dedupe into /api/ingest"
```

---

### Task 4: Local dev tooling — Dockerized MongoDB + polling script

**Files:**
- Create: `docker-compose.yml` (repo root)
- Create: `apps/ingestor/.env.local` (gitignored — not committed)
- Create: `apps/ingestor/scripts/poll.sh`
- Modify: `apps/ingestor/package.json` (add `poll` script)
- Modify: `package.json` (repo root — add `db:up`/`db:down` scripts)

**Interfaces:**
- Consumes: nothing from prior tasks.
- Produces: a local MongoDB reachable at `mongodb://localhost:27017/sismos`; `pnpm db:up` / `pnpm db:down` at the repo root; `pnpm --filter ingestor poll` to hit `/api/ingest` every 60s.

- [ ] **Step 1: Add the Docker Compose file**

Create `/Users/rodrigoguerrero/Sites/sismos/docker-compose.yml`:

```yaml
services:
  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

- [ ] **Step 2: Add the local env file for `apps/ingestor`**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/.env.local`:

```
MONGODB_URI=mongodb://localhost:27017/sismos
```

Verify it's gitignored (the root `.gitignore` already has an `.env.local` pattern):

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git check-ignore -v apps/ingestor/.env.local
```

Expected: prints the matching `.gitignore` rule (confirms it won't be committed).

- [ ] **Step 3: Add the polling script**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/scripts/poll.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="${INGEST_URL:-http://localhost:3001/api/ingest}"

echo "Polling $URL every 60s (Ctrl+C to stop)..."
while true; do
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
  curl -s "$URL"
  echo
  sleep 60
done
```

Make it executable:

```bash
chmod +x /Users/rodrigoguerrero/Sites/sismos/apps/ingestor/scripts/poll.sh
```

- [ ] **Step 4: Add npm scripts**

In `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/package.json`, add `"poll": "bash scripts/poll.sh"` to `scripts`, so the `scripts` block becomes:

```json
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start",
    "lint": "eslint --max-warnings 0",
    "check-types": "next typegen && tsc --noEmit",
    "poll": "bash scripts/poll.sh"
  },
```

In `/Users/rodrigoguerrero/Sites/sismos/package.json` (repo root), add `"db:up"` and `"db:down"` to `scripts`, so the block becomes:

```json
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "check-types": "turbo run check-types",
    "db:up": "docker compose up -d",
    "db:down": "docker compose down"
  },
```

- [ ] **Step 5: Verify the compose file is valid**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
docker compose config --quiet
```

Expected: no output, exit code 0 (means the YAML is valid and resolvable).

- [ ] **Step 6: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add docker-compose.yml apps/ingestor/scripts apps/ingestor/package.json package.json
git commit -m "chore: add local MongoDB via Docker Compose and an ingest polling script"
```

(`apps/ingestor/.env.local` is intentionally NOT staged — it's gitignored local config.)

---

### Task 5: Integration verification (Mongo + ingest end-to-end)

**Files:**
- None created or modified — this task only runs commands.

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: confirmation that a real `GET /api/ingest` call against a real local MongoDB inserts real CSN + USGS documents, and that a second call is idempotent (no duplicate inserts).

- [ ] **Step 1: Start local MongoDB**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm db:up
sleep 3
docker compose ps
```

Expected: `mongo` service listed as `running`/`Up`.

- [ ] **Step 2: Full monorepo build/lint/check-types**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
nvm use
pnpm install
pnpm build
pnpm lint
pnpm check-types
```

Expected: all exit 0 (6 packages/apps, same as the scaffold's baseline, now with real logic instead of stubs).

- [ ] **Step 3: Start the ingestor dev server**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter ingestor dev > /tmp/sismos-ingestor-dev.log 2>&1 &
echo $! > /tmp/sismos-ingestor.pid
sleep 4
cat /tmp/sismos-ingestor-dev.log
```

Expected: `✓ Ready in <N>ms` with no errors.

- [ ] **Step 4: Call the ingest endpoint and inspect the summary**

```bash
curl -s http://localhost:3001/api/ingest | tee /tmp/ingest-summary-1.json
echo
```

Expected: JSON like `{"csn":{"fetched":N,"inserted":N,"errors":0},"usgs":{"fetched":N,"inserted":N,"errors":0},"deduped":N}` with `errors: 0` for both sources (network permitting) and `fetched >= inserted` (fetched can exceed inserted only if some events were deduped or already existed from a prior run).

- [ ] **Step 5: Inspect what actually landed in MongoDB**

```bash
docker compose exec -T mongo mongosh sismos --quiet --eval '
db.sismos.countDocuments({});
db.sismos.find({}, { fuente: 1, externalId: 1, magnitud: 1, lugar: 1, refCruzada: 1, _id: 0 }).limit(5).toArray();
db.sismos.getIndexes();
'
```

Expected: a document count matching the first summary's total inserted count, sample documents with populated `fuente`/`externalId`/`magnitud`/`lugar` (no `undefined`/`null` on required fields), and an index list that includes a unique index on `{ fuente: 1, externalId: 1 }`.

- [ ] **Step 6: Verify idempotency — call it again immediately**

```bash
curl -s http://localhost:3001/api/ingest | tee /tmp/ingest-summary-2.json
echo
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos.countDocuments({});'
```

Expected: the document count is the same as (or only slightly higher than, if new real-world events occurred in between) after Step 5 — running the same fetch twice in quick succession must not create duplicate documents for the same `(fuente, externalId)` pair, because `upsertSismo` uses `findOneAndUpdate` with `upsert: true` keyed on that pair.

- [ ] **Step 7: Stop the dev server and tear down Mongo**

```bash
kill "$(cat /tmp/sismos-ingestor.pid)" 2>/dev/null || true
pkill -f "next dev --port 3001" 2>/dev/null || true
cd /Users/rodrigoguerrero/Sites/sismos
pnpm db:down
```

Expected: no orphan `next dev` process left (`ps aux | grep "next dev"` comes back empty), Mongo container stopped.

- [ ] **Step 8: Final status check**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git status --short
```

Expected: clean (nothing to commit — this task only ran verification commands, no files were created/modified). If `next typegen` regenerated `apps/ingestor/next-env.d.ts` with a trivial diff, commit just that:

```bash
git add apps/ingestor/next-env.d.ts
git commit -m "chore: regenerate ingestor route types" --allow-empty
```

---

## Self-Review Notes

- **Spec coverage:** fetch (Task 3), normalization (Task 1), dedupe (Task 1 matcher + Task 3 orchestration), real schema + unique index (Task 2), idempotent upsert (Task 2 + verified in Task 5), local Mongo via Docker (Task 4), polling script (Task 4), per-source error isolation (Task 3's `runIngest` — each fetch has its own try/catch). `sismos_historicos`, tests, and production cron are explicitly out of scope per the spec and untouched by every task above.
- **No placeholders:** every step shows literal file content; the only "TODO"-shaped things removed are the stubs this plan replaces — nothing new is left as TBD.
- **Type consistency:** `SismoNormalizado`/`SismoFuente` (Task 1, unchanged from the scaffold) are used identically in Task 2's query helpers and Task 3's orchestration. `findRecentByFuente`, `upsertSismo`, `setRefCruzada`, `replaceWithCsn` (defined in Task 2) are called with matching names and argument order in Task 3's `lib/ingest.ts`. `findDuplicate`/`haversineDistanceKm` (Task 1) signatures match their Task 3 call site.
