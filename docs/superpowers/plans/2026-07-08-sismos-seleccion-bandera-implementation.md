# Selection Pulse Animation + Country Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current bounce-ring selection animation with an expanding-ring pulse (matching the existing "new sismo" visual language, in a distinct cyan color), and show each historial card's real country flag.

**Architecture:** Country flag is computed once, server-side, at normalization time (not per-request) — `@rapideditor/country-coder` resolves lat/lon to an emoji flag offline (no API calls), stored as a `bandera` field alongside every other normalized field. CSN and `sismos_historicos` are always Chile (hardcoded, no geocoding needed since both sources are Chile-only by construction); only USGS events need real geocoding.

**Tech Stack:** TypeScript, `@rapideditor/country-coder` 5.6.1 (offline lat/lon → ISO/emoji, verified working), Mongoose 9.7.4, Tailwind v4/CSS animations.

## Global Constraints

- `@rapideditor/country-coder` requires `@types/geojson` as a devDependency wherever it's type-checked, even though it's not declared as `@rapideditor/country-coder`'s own dependency — **verified**: without it, `tsc` fails with `Cannot find module 'geojson'`. Both packages go in `packages/shared` (`country-coder` as a runtime dependency, `@types/geojson` as a devDependency).
- No client-side geocoding — the map/`apps/web` client code never imports `country-coder`; it only ever reads the already-computed `bandera` string from data that already flowed through `packages/shared`'s normalization.
- The new selection animation must look meaningfully different from a generic "bounce" — an expanding, fading ring (visually consistent with the existing `pulso-sismo` keyframe already used for new live events), just in a distinct color (cyan `#38bdf8`, already established for selection in this app).
- Existing data migration is in scope (Task 5): the ~84 already-ingested `fuente: "csn"` documents and the 10 `sismos_historicos` documents predate this field and need it backfilled; a couple of already-ingested `fuente: "usgs"` documents may remain without a flag (acceptable — see Task 5's notes) until they're naturally re-ingested or age out of the 10-day map window.
- Workspace scope `@sismos/*`, pnpm only, Node >=24. No automated test framework in this monorepo.

## Repo Context (read this if you have no prior context)

- `packages/shared/src/types.ts` defines `SismoNormalizado` (currently: `fuente`, `externalId`, `fecha`, `magnitud`, `profundidadKm`, `latitud`, `longitud`, `lugar`) and is consumed by `packages/shared/src/normalize/csn.ts` (`normalizeCsnSismo`) and `normalize/usgs.ts` (`normalizeUsgsFeature`), both of which build and return a `SismoNormalizado`.
- `packages/db/src/models/sismo.ts` (`SismoModel`, collection `sismos`) and `models/sismo-historico.ts` (`SismoHistoricoModel`, collection `sismos_historicos`) mirror `SismoNormalizado`'s fields in their Mongoose schemas. `packages/db/src/queries/sismo.ts`'s `upsertSismo` does `SismoModel.findOneAndUpdate(..., { $set: evento }, { upsert: true, new: true })` — it blindly `$set`s whatever fields are on the passed object, so once `SismoNormalizado` includes `bandera`, `upsertSismo` will persist it with **no code change needed in that file**. `packages/db/src/queries/sismo-historico.ts` defines its own separate `SismoHistoricoInput` interface (not `SismoNormalizado`) that `upsertSismoHistorico` uses the same way — that interface needs `bandera` added explicitly.
- `apps/ingestor/scripts/backfill-historicos.ts` builds its own `SismoHistoricoInput`-shaped object per event (field by field, not by spreading `normalizeUsgsFeature`'s full result) — it needs an explicit `bandera: "🇨🇱"` line added.
- `apps/web/app/api/historial/route.ts` and `app/api/sismos/route.ts` just `NextResponse.json({ eventos })` / `NextResponse.json({ sismos })` straight from the Mongoose query results — **no route code changes needed**; once `bandera` exists in the DB documents, it's already in the JSON response.
- `apps/web/components/historial/PanelHistorial.tsx`'s `ItemHistorial` interface currently has `externalId`, `fecha`, `magnitud`, `lugar`, `latitud`, `longitud` — needs `bandera: string | null` added, and the card's title line needs to render it.
- `apps/web/app/globals.css` has `.marcador-seleccion` (currently a static ring with a `rebote-seleccion` bounce keyframe) and `.marcador-sismo--pulso`/`@keyframes pulso-sismo` (the existing expanding-ring pattern for new live events) — `apps/web/components/mapa/marcador.ts`'s `crearElementoSeleccion()` just creates a `<div class="marcador-seleccion">` and does **not** need any code change; only the CSS behind that class name changes.
- Local MongoDB runs via the repo-root `docker-compose.yml` (`mongo:8`, port 27017); `apps/ingestor/.env.local` and `apps/web/.env.local` both already point at `mongodb://localhost:27017/sismos`.

---

### Task 1: `packages/shared` — `bandera` field + real geocoding for USGS

**Files:**
- Modify: `packages/shared/package.json`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/normalize/csn.ts`
- Modify: `packages/shared/src/normalize/usgs.ts`

**Interfaces:**
- Produces: `SismoNormalizado` now includes `bandera: string | null`. `normalizeCsnSismo` always sets it to `"🇨🇱"`. `normalizeUsgsFeature` sets it via `@rapideditor/country-coder`'s `emojiFlag([longitud, latitud])` (or `null` if unresolvable, e.g. open ocean). Task 2 and Task 3 rely on this field existing on every `SismoNormalizado`.

- [ ] **Step 1: Add the new dependencies**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/package.json` with:

```json
{
  "name": "@sismos/shared",
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
    "@rapideditor/country-coder": "^5.6.1"
  },
  "devDependencies": {
    "@sismos/eslint-config": "workspace:*",
    "@sismos/typescript-config": "workspace:*",
    "@types/geojson": "^7946.0.16",
    "eslint": "^9.39.1",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 2: Add `bandera` to the shared type**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/types.ts` with:

```ts
export type SismoFuente = "csn" | "usgs";

export interface SismoNormalizado {
  fuente: SismoFuente;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
}
```

- [ ] **Step 3: Set `bandera` in the CSN normalizer (always Chile)**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize/csn.ts` with:

```ts
import type { SismoNormalizado } from "../types";

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
    bandera: "🇨🇱",
  };
}
```

- [ ] **Step 4: Set `bandera` in the USGS normalizer (real geocoding)**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize/usgs.ts` with:

```ts
import { emojiFlag } from "@rapideditor/country-coder";
import type { SismoNormalizado } from "../types";

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
    bandera: emojiFlag([longitud, latitud]) ?? null,
  };
}
```

- [ ] **Step 5: Install and verify**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm install
pnpm --filter @sismos/shared check-types
pnpm --filter @sismos/shared lint
```

Expected: both exit 0. If `check-types` fails with `Cannot find module 'geojson'`, `@types/geojson` didn't install correctly — re-run `pnpm install` and check `packages/shared/node_modules` (or the hoisted root `node_modules`) contains `@types/geojson`.

- [ ] **Step 6: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/shared pnpm-lock.yaml
git commit -m "feat: compute real country flag per sismo (CSN/historico hardcoded CL, USGS via country-coder)"
```

---

### Task 2: `packages/db` — persist `bandera` in both schemas

**Files:**
- Modify: `packages/db/src/models/sismo.ts`
- Modify: `packages/db/src/models/sismo-historico.ts`
- Modify: `packages/db/src/queries/sismo-historico.ts`

**Interfaces:**
- Consumes: nothing new (schema-only change).
- Produces: `Sismo` and `SismoHistorico` types now include `bandera: string | null | undefined` (optional in Mongoose terms — not `required`, since some historical/edge-case documents may lack it). `SismoHistoricoInput` (used by `upsertSismoHistorico`) now includes `bandera?: string | null`. Task 3 passes `bandera` when constructing that input.

- [ ] **Step 1: Add `bandera` to `SismoModel`'s schema**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/models/sismo.ts` with:

```ts
import mongoose, {
  Schema,
  model,
  type InferSchemaType,
  type Model,
} from "mongoose";

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
    bandera: { type: String, default: null },
    refCruzada: {
      fuente: { type: String, enum: ["csn", "usgs"] },
      externalId: String,
    },
  },
  { timestamps: true },
);

sismoSchema.index({ fuente: 1, externalId: 1 }, { unique: true });

export type Sismo = InferSchemaType<typeof sismoSchema>;

export const SismoModel: Model<Sismo> =
  (mongoose.models.Sismo as Model<Sismo>) ??
  model<Sismo>("Sismo", sismoSchema, "sismos");
```

- [ ] **Step 2: Add `bandera` to `SismoHistoricoModel`'s schema**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/models/sismo-historico.ts` with:

```ts
import mongoose, {
  Schema,
  model,
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
    bandera: { type: String, default: null },
  },
  { timestamps: true },
);

export type SismoHistorico = InferSchemaType<typeof sismoHistoricoSchema>;

export const SismoHistoricoModel: Model<SismoHistorico> =
  (mongoose.models.SismoHistorico as Model<SismoHistorico>) ??
  model<SismoHistorico>(
    "SismoHistorico",
    sismoHistoricoSchema,
    "sismos_historicos",
  );
```

- [ ] **Step 3: Add `bandera` to `SismoHistoricoInput`**

In `/Users/rodrigoguerrero/Sites/sismos/packages/db/src/queries/sismo-historico.ts`, replace the `SismoHistoricoInput` interface (leave `upsertSismoHistorico` and `findTopHistoricos` unchanged below it):

```ts
export interface SismoHistoricoInput {
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera?: string | null;
}
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
git commit -m "feat: add bandera field to Sismo and SismoHistorico schemas"
```

---

### Task 3: `apps/ingestor` — set `bandera` in the historical backfill script

**Files:**
- Modify: `apps/ingestor/scripts/backfill-historicos.ts`

**Interfaces:**
- Consumes: `SismoHistoricoInput` (Task 2, now with `bandera`).
- Produces: nothing new consumed elsewhere — this is the terminal producer for historical data.

- [ ] **Step 1: Add the hardcoded Chile flag to the constructed object**

In `/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/scripts/backfill-historicos.ts`, find the `return` statement inside `fetchTopHistoricos`'s `.map(...)` callback (currently ending with `lugar: override.lugar ?? normalizado.lugar,`) and add a `bandera` line, so the full function becomes:

```ts
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
      bandera: "🇨🇱",
    };
  });
}
```

(The rest of the file — imports, `USGS_HISTORICAL_URL`, `TOP_N`, `loadOverrides`, `main` — is unchanged. This hardcodes `"🇨🇱"` rather than using `normalizado.bandera` because the backfill's bounding box is Chile-only by construction — every event it fetches is geographically in Chile regardless of what `country-coder` would compute from the raw coordinates, and hardcoding avoids importing `country-coder` into a script that doesn't otherwise need it.)

- [ ] **Step 2: Typecheck and lint**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter ingestor check-types
pnpm --filter ingestor lint
```

Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/ingestor/scripts/backfill-historicos.ts
git commit -m "feat: set bandera on backfilled historical events"
```

---

### Task 4: `apps/web` — new pulse-style selection animation + render the flag

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/components/historial/PanelHistorial.tsx`

**Interfaces:**
- Consumes: nothing new from other tasks (CSS is self-contained; `bandera` arrives already-computed in the `/api/historial` JSON response, no route change needed).
- Produces: nothing consumed by later tasks — Task 5 only verifies.

- [ ] **Step 1: Replace the selection animation**

In `/Users/rodrigoguerrero/Sites/sismos/apps/web/app/globals.css`, replace the `.marcador-seleccion` rule and its `@keyframes rebote-seleccion` block with:

```css
.marcador-seleccion {
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #38bdf8;
}

.marcador-seleccion::before,
.marcador-seleccion::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background-color: #38bdf8;
  animation-name: pulso-seleccion;
  animation-duration: 1.5s;
  animation-timing-function: ease-out;
  animation-iteration-count: 4;
  animation-fill-mode: forwards;
}

.marcador-seleccion::after {
  animation-delay: 0.5s;
}

@keyframes pulso-seleccion {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(3);
    opacity: 0;
  }
}
```

So the complete file (all rules, in order) is:

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
  position: relative;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background-color: #38bdf8;
}

.marcador-seleccion::before,
.marcador-seleccion::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background-color: #38bdf8;
  animation-name: pulso-seleccion;
  animation-duration: 1.5s;
  animation-timing-function: ease-out;
  animation-iteration-count: 4;
  animation-fill-mode: forwards;
}

.marcador-seleccion::after {
  animation-delay: 0.5s;
}

@keyframes pulso-seleccion {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(3);
    opacity: 0;
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

(Two staggered rings — `::before` and a `::after` delayed by 0.5s — expanding and fading 4 times each, leaving a small solid cyan dot marking the last-selected spot once the animation ends via `animation-fill-mode: forwards`. `crearElementoSeleccion()` in `marcador.ts` needs no code change — it already just applies the `marcador-seleccion` class.)

- [ ] **Step 2: Add `bandera` to `ItemHistorial` and render it**

In `/Users/rodrigoguerrero/Sites/sismos/apps/web/components/historial/PanelHistorial.tsx`, update the `ItemHistorial` interface to:

```ts
interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
  latitud: number;
  longitud: number;
  bandera: string | null;
}
```

And update the card's title line (currently `<div className="font-semibold text-neutral-100">{evento.lugar}</div>`) to:

```tsx
<div className="font-semibold text-neutral-100">
  {evento.bandera ?? "🌎"} {evento.lugar}
</div>
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
git add apps/web/app/globals.css apps/web/components/historial/PanelHistorial.tsx
git commit -m "feat: replace selection bounce with expanding-ring pulse, show country flag in historial"
```

---

### Task 5: Verification + data migration for already-ingested documents

**Files:**
- None created or modified — this task runs commands (build/lint/typecheck, the backfill script, and one direct Mongo update for pre-existing documents).

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: confirmation that the whole monorepo builds/lints/typechecks, that historical documents and existing CSN documents now have `bandera` populated, and (from the human) that the new animation and flags look right.

- [ ] **Step 1: Full monorepo build/lint/check-types**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
nvm use
pnpm build
pnpm lint
pnpm check-types
```

Expected: all exit 0 across all 6 packages/apps.

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

- [ ] **Step 3: Re-run the historical backfill (idempotent — populates `bandera` on the 10 existing documents)**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter ingestor backfill-historicos
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos_historicos.countDocuments({ bandera: "🇨🇱" })'
```

Expected: the script prints 10 "Upserted ..." lines same as before, and the count query returns `10`.

- [ ] **Step 4: Migrate already-ingested CSN documents directly (no geocoding needed — CSN is always Chile)**

```bash
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos.updateMany({ fuente: "csn", bandera: { $exists: false } }, { $set: { bandera: "🇨🇱" } })'
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos.countDocuments({ fuente: "csn", bandera: { $exists: false } })'
```

Expected: the `updateMany` result reports `matchedCount`/`modifiedCount` around 84 (however many CSN documents currently exist), and the follow-up count query returns `0`.

- [ ] **Step 5: Re-ingest once to populate `bandera` on current USGS documents (best-effort — see note)**

```bash
cd /Users/rodrigoguerrero/Sites/sismos/apps/ingestor
pnpm dev > /tmp/sismos-ingestor-migrate.log 2>&1 &
INGESTOR_PID=$!
sleep 4
curl -s http://localhost:3001/api/ingest
echo
kill $INGESTOR_PID 2>/dev/null || true
cd /Users/rodrigoguerrero/Sites/sismos
docker compose exec -T mongo mongosh sismos --quiet --eval 'db.sismos.countDocuments({ fuente: "usgs", bandera: { $exists: false } })'
```

This re-fetches USGS's current past-hour feed and upserts it — any USGS event that's still in that live window gets `bandera` set via `country-coder`. A USGS document ingested earlier that has since scrolled out of the "past hour" feed window won't be touched by this and may still lack `bandera`; that's an accepted gap (Global Constraints) — `PanelHistorial`'s `evento.bandera ?? "🌎"` fallback handles it gracefully in the UI, and the document ages out of the 10-day map/historial window naturally within days.

- [ ] **Step 6: Ask the human to confirm visually**

This plan has no way to drive a real browser. Report to the human:

> "Migration done: historicos and existing CSN sismos now have `bandera` populated (verified via direct MongoDB counts). Please refresh http://localhost:3000 and confirm: (1) the historial cards now show a flag next to the place name (🇨🇱 for Chile, real country flags for world events, 🌎 for any not-yet-migrated ones), (2) clicking a card or a map marker now shows a nicer pulsing cyan ring (two staggered expanding circles) instead of the old bounce, leaving a small dot where you last selected."

- [ ] **Step 7: Clean up**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
ps aux | grep "next dev --port 3001" | grep -v grep || echo "no orphan ingestor dev process"
git status --short
```

Do NOT run `pnpm db:down` or kill the `apps/web` dev server (port 3000) — it may be in active use. If `git status --short` shows anything, commit it:

```bash
git add -A
git commit -m "chore: regenerate route types" --allow-empty
```

## Self-Review Notes

- **Coverage:** country flag computed at normalization time for both sources (Task 1), persisted in both schemas (Task 2), backfill script updated (Task 3), UI renders it with a sane fallback (Task 4), existing data migrated (Task 5). New animation replaces the old one entirely (Task 4), visually distinct from the existing new-sismo pulse (different color, dot-remains-after behavior). Nothing from the approved scope is missing.
- **No placeholders:** every step shows literal file content or literal commands; the one deliberately-accepted gap (some old USGS docs may lack a flag) is explicitly labeled as an accepted limitation with a concrete UI fallback, not a vague TODO.
- **Type consistency:** `bandera: string | null` (Task 1's `SismoNormalizado`) flows unchanged through `packages/db`'s `$set: evento` (Task 2, no query-code change needed) and into `ItemHistorial` (Task 4) with the same type. `SismoHistoricoInput.bandera` (Task 2, optional) matches how Task 3 always supplies it as `"🇨🇱"`.
