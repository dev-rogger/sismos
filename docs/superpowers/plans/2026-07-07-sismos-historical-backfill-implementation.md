# Historical Backfill (sismos_historicos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-off CLI script that backfills the top 10 largest historical Chilean earthquakes (from the USGS historical catalog) into the `sismos_historicos` MongoDB collection, replacing its schema stub, with a manual-override mechanism for mis-geolocated events.

**Architecture:** A standalone TypeScript script (`apps/ingestor/scripts/backfill-historicos.ts`), run via `tsx` (not through Next.js), fetches the USGS FDSN Event Query API, normalizes results with the already-implemented `normalizeUsgsFeature` from `@sismos/shared`, applies optional manual overrides from a checked-in JSON file, and upserts into a new real `SismoHistoricoModel` schema in `@sismos/db`.

**Tech Stack:** TypeScript, Mongoose 9.7.4, `tsx` (script runner), native `fetch`, MongoDB (local via the repo's existing `docker-compose.yml`).

## Global Constraints

- This is a manual, one-off script — NOT an HTTP endpoint, NOT wired into `apps/ingestor/vercel.ts` crons.
- Reuse `normalizeUsgsFeature` from `@sismos/shared` — do not reimplement USGS GeoJSON parsing.
- `SismoHistoricoModel` has no `fuente` field and no `refCruzada` field (unlike `SismoModel`) — every row in this collection is USGS-sourced by definition, and there's no cross-source dedupe for historical data.
- Idempotent: re-running the script must upsert (update in place), never duplicate, keyed on `externalId`.
- No automated test framework (matches the rest of this monorepo — verification is a real run against a real local MongoDB, per Task 3).
- Workspace scope `@sismos/*`, pnpm only, Node >=24.
- Spec reference: `docs/superpowers/specs/2026-07-07-sismos-historical-backfill-design.md`.

## Repo Context (read this if you have no prior context)

This is a pnpm + Turborepo monorepo. Relevant existing pieces this plan builds on (already implemented, do not recreate):
- `@sismos/shared` exports `normalizeUsgsFeature(raw: UsgsFeatureRaw): SismoNormalizado` — `SismoNormalizado` has fields `{ fuente, externalId, fecha, magnitud, profundidadKm, latitud, longitud, lugar }`.
- `@sismos/db` exports `getMongooseConnection(): Promise<typeof mongoose>` (reads `MONGODB_URI` from the environment, throws if unset).
- `packages/db/src/models/sismo-historico.ts` currently has a stub schema: `new Schema({}, { strict: false, timestamps: true })` — this plan replaces it with a real schema.
- `packages/db/src/queries/sismo.ts` already has a working pattern for upsert-by-key query helpers (`upsertSismo`) — this plan adds an equivalent file for historicals.
- Local MongoDB runs via `docker-compose.yml` at the repo root (`mongo:8` image, port 27017). `apps/ingestor/.env.local` (gitignored, not present in a fresh worktree checkout) holds `MONGODB_URI=mongodb://localhost:27017/sismos`.
- All packages use `moduleResolution: "Bundler"` (via `@sismos/typescript-config/base.json`) — relative imports do NOT need `.js` extensions in this repo.

---

### Task 1: `packages/db` — real `SismoHistoricoModel` schema + upsert query helper

**Files:**
- Modify: `packages/db/src/models/sismo-historico.ts`
- Create: `packages/db/src/queries/sismo-historico.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `SismoHistorico` type, `SismoHistoricoModel` (Mongoose model), `SismoHistoricoInput` type (`{ externalId: string; fecha: Date; magnitud: number; profundidadKm: number; latitud: number; longitud: number; lugar: string }`), `upsertSismoHistorico(evento: SismoHistoricoInput): Promise<SismoHistorico>` — all exported from `@sismos/db`. Task 2 imports `upsertSismoHistorico` and `SismoHistoricoInput` by name.

- [ ] **Step 0: Confirm the workspace installs cleanly**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
nvm use
pnpm install
```

Expected: exits 0 (this is a fresh worktree checkout — `node_modules` needs to be created even though pnpm's content-addressable store makes this fast).

- [ ] **Step 1: Replace the `SismoHistoricoModel` stub with a real schema**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/models/sismo-historico.ts` with:

```ts
import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose";

const sismoHistoricoSchema = new Schema(
  {
    externalId: { type: String, required: true, unique: true },
    fecha: { type: Date, required: true },
    magnitud: { type: Number, required: true },
    profundidadKm: { type: Number, required: true },
    latitud: { type: Number, required: true },
    longitud: { type: Number, required: true },
    lugar: { type: String, required: true },
  },
  { timestamps: true },
);

export type SismoHistorico = InferSchemaType<typeof sismoHistoricoSchema>;

export const SismoHistoricoModel: Model<SismoHistorico> =
  (models.SismoHistorico as Model<SismoHistorico>) ??
  model<SismoHistorico>(
    "SismoHistorico",
    sismoHistoricoSchema,
    "sismos_historicos",
  );
```

Note the explicit `Model<SismoHistorico>` typing on both sides of the `??` — without it, `tsc` widens the type and later query helpers (Step 2) fail to typecheck against real field names (this exact issue was hit and fixed for `SismoModel` in the ingestor plan; apply the same pattern here from the start).

- [ ] **Step 2: Add the upsert query helper**

Create `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/queries/sismo-historico.ts`:

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
```

- [ ] **Step 3: Export the new query helper from the barrel**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/index.ts` with:

```ts
export * from "./connection";
export * from "./models/sismo";
export * from "./models/sismo-historico";
export * from "./queries/sismo";
export * from "./queries/sismo-historico";
```

- [ ] **Step 4: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter @sismos/db check-types
pnpm --filter @sismos/db lint
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/db
git commit -m "feat: implement real SismoHistorico schema and upsert query helper"
```

---

### Task 2: `apps/ingestor` — backfill script + overrides file

**Files:**
- Create: `apps/ingestor/data/historical-overrides.json`
- Create: `apps/ingestor/scripts/backfill-historicos.ts`
- Modify: `apps/ingestor/package.json`

**Interfaces:**
- Consumes: `normalizeUsgsFeature`, `UsgsFeatureRaw` from `@sismos/shared`; `getMongooseConnection`, `upsertSismoHistorico`, `SismoHistoricoInput` from `@sismos/db` (Task 1).
- Produces: `pnpm --filter ingestor backfill-historicos` — a CLI command with no other consumers (this is the terminal deliverable of this plan; Task 3 only runs it, it doesn't import anything from it).

- [ ] **Step 1: Add the overrides file**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/ingestor/data
```

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/data/historical-overrides.json`:

```json
{}
```

- [ ] **Step 2: Add `tsx` as a dev dependency and the `backfill-historicos` script**

In `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/package.json`, add `"tsx": "^4.23.0"` to `devDependencies`, and add `"backfill-historicos": "tsx --env-file=.env.local scripts/backfill-historicos.ts"` to `scripts`, so the file becomes:

```json
{
  "name": "ingestor",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start",
    "lint": "eslint --max-warnings 0",
    "check-types": "next typegen && tsc --noEmit",
    "poll": "bash scripts/poll.sh",
    "backfill-historicos": "tsx --env-file=.env.local scripts/backfill-historicos.ts"
  },
  "dependencies": {
    "@sismos/db": "workspace:*",
    "@sismos/shared": "workspace:*",
    "next": "16.2.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@sismos/eslint-config": "workspace:*",
    "@sismos/typescript-config": "workspace:*",
    "@types/node": "^26.1.0",
    "@types/react": "19.2.2",
    "@types/react-dom": "19.2.2",
    "@vercel/config": "^0.5.5",
    "eslint": "^9.39.1",
    "tsx": "^4.23.0",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 3: Write the backfill script**

Create `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/scripts/backfill-historicos.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeUsgsFeature,
  type UsgsFeatureRaw,
} from "@sismos/shared";
import {
  getMongooseConnection,
  upsertSismoHistorico,
  type SismoHistoricoInput,
} from "@sismos/db";

const USGS_HISTORICAL_URL =
  "https://earthquake.usgs.gov/fdsnws/event/1/query" +
  "?format=geojson" +
  "&starttime=1900-01-01" +
  "&minlatitude=-56&maxlatitude=-17&minlongitude=-76&maxlongitude=-66" +
  "&orderby=magnitude" +
  "&limit=15";

const TOP_N = 10;

interface UsgsQueryResponse {
  features: UsgsFeatureRaw[];
}

interface Override {
  latitud?: number;
  longitud?: number;
  magnitud?: number;
  lugar?: string;
  fecha?: string;
}

function loadOverrides(): Record<string, Override> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const overridesPath = path.join(
    __dirname,
    "../data/historical-overrides.json",
  );
  const raw = readFileSync(overridesPath, "utf-8");
  return JSON.parse(raw) as Record<string, Override>;
}

async function fetchTopHistoricos(
  overrides: Record<string, Override>,
): Promise<SismoHistoricoInput[]> {
  const res = await fetch(USGS_HISTORICAL_URL);
  if (!res.ok) {
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as UsgsQueryResponse;

  return data.features.slice(0, TOP_N).map((feature) => {
    const normalizado = normalizeUsgsFeature(feature);
    const override = overrides[normalizado.externalId] ?? {};
    if (Object.keys(override).length > 0) {
      console.log(`Applying override for ${normalizado.externalId}:`, override);
    }
    return {
      externalId: normalizado.externalId,
      fecha: override.fecha ? new Date(override.fecha) : normalizado.fecha,
      magnitud: override.magnitud ?? normalizado.magnitud,
      profundidadKm: normalizado.profundidadKm,
      latitud: override.latitud ?? normalizado.latitud,
      longitud: override.longitud ?? normalizado.longitud,
      lugar: override.lugar ?? normalizado.lugar,
    };
  });
}

async function main() {
  const overrides = loadOverrides();
  console.log(`Fetching top ${TOP_N} historical Chilean earthquakes from USGS...`);
  const eventos = await fetchTopHistoricos(overrides);

  await getMongooseConnection();

  let count = 0;
  for (const evento of eventos) {
    await upsertSismoHistorico(evento);
    count += 1;
    console.log(
      `Upserted ${evento.externalId} — ${evento.lugar} (M${evento.magnitud}, ${evento.fecha.toISOString()})`,
    );
  }

  console.log(`Done. Upserted ${count} historical events.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("[backfill-historicos] failed:", error);
  process.exit(1);
});
```

- [ ] **Step 4: Install the new dependency, then typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm install
pnpm --filter ingestor check-types
pnpm --filter ingestor lint
```

(`pnpm install` is needed because Step 2 added a new dependency, `tsx`.)

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/ingestor pnpm-lock.yaml
git commit -m "feat: add historical backfill script for sismos_historicos"
```

---

### Task 3: Integration verification (real USGS fetch + real MongoDB)

**Files:**
- None created or modified — this task only runs commands, plus (if missing) creates the gitignored local env file needed to run it.

**Interfaces:**
- Consumes: everything from Tasks 1-2.
- Produces: confirmation that `pnpm --filter ingestor backfill-historicos` populates 10 real documents in `sismos_historicos`, and that re-running it is idempotent (no duplicates).

- [ ] **Step 1: Make sure `apps/ingestor/.env.local` exists**

This file is gitignored, so a fresh worktree checkout won't have it. Check first:

```bash
cat /Users/rodrigoguerrero/Sites/sismos/apps/ingestor/.env.local 2>/dev/null || echo "MISSING"
```

If it prints `MISSING`, create it:

```bash
echo "MONGODB_URI=mongodb://localhost:27017/sismos" > /Users/rodrigoguerrero/Sites/sismos/apps/ingestor/.env.local
```

- [ ] **Step 2: Make sure local MongoDB is running (don't start a second one if it already is)**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
if nc -z localhost 27017 2>/dev/null; then
  echo "Mongo already reachable on 27017, not starting a new one"
else
  pnpm db:up
  sleep 3
fi
docker compose ps
```

Expected: some Mongo container is listed as `running`/`Up` (either one you just started, or one already running from elsewhere).

- [ ] **Step 3: Run the backfill script**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter ingestor backfill-historicos
```

Expected: prints `Fetching top 10 historical Chilean earthquakes from USGS...`, then 10 lines like `Upserted official19600522191120_30 — 1960 Great Chilean Earthquake (Valdivia Earthquake) (M9.5, 1960-05-22T19:11:20.000Z)`, then `Done. Upserted 10 historical events.`, and exits 0.

- [ ] **Step 4: Inspect what landed in MongoDB**

```bash
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos_historicos.countDocuments({})'
docker compose exec -T mongo mongosh sismos --quiet --eval 'printjson(db.sismos_historicos.find({}, { externalId: 1, magnitud: 1, lugar: 1, _id: 0 }).sort({ magnitud: -1 }).toArray())'
docker compose exec -T mongo mongosh sismos --quiet --eval 'printjson(db.sismos_historicos.getIndexes())'
```

Expected: count is `10`; the list is sorted from magnitude 9.5 (Valdivia) down to roughly 8.0; the index list includes a unique index on `externalId`.

- [ ] **Step 5: Verify idempotency — run it again**

```bash
pnpm --filter ingestor backfill-historicos
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos_historicos.countDocuments({})'
```

Expected: still exits 0, and the count is still `10` (not 20) — confirms the upsert-by-`externalId` doesn't duplicate.

- [ ] **Step 6: Full monorepo build/lint/check-types (make sure nothing else broke)**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm build
pnpm lint
pnpm check-types
```

Expected: all exit 0 across all 6 packages/apps.

- [ ] **Step 7: Clean up**

Only stop Mongo if you were the one who started it in Step 2 of this task (check your own note from that step — if it was already running before you began, leave it running for whoever else is using it):

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git status --short
```

Expected: clean (this task only ran commands and, at most, created the gitignored `.env.local` — nothing to commit).

## Self-Review Notes

- **Spec coverage:** USGS fetch with the exact bounding-box/ordering/limit from the spec (Task 2), reuse of `normalizeUsgsFeature` (Task 2), overrides file + merge logic (Task 2), real `SismoHistoricoModel` schema without `fuente`/`refCruzada` (Task 1), idempotent upsert (Task 1 + verified in Task 3), CLI-only execution via `tsx` (Task 2). Nothing from the spec is left unaddressed — map/UI and automation are explicitly out of scope and untouched.
- **No placeholders:** every step shows literal file content; the overrides file is intentionally `{}` (empty), which is the spec's actual starting value, not a TBD.
- **Type consistency:** `SismoHistoricoInput` (Task 1) is used with identical field names in Task 2's script (`externalId`, `fecha`, `magnitud`, `profundidadKm`, `latitud`, `longitud`, `lugar`). `upsertSismoHistorico` signature matches its Task 2 call site exactly.
