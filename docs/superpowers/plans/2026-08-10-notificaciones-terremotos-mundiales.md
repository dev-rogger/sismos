# Notificaciones push para terremotos mundiales (USGS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing push-notification system (currently Chile/CSN-only) so users can opt in to a separate "Alcance mundial" toggle that notifies them of M7.0+ earthquakes anywhere in the world, with no distance limit, independent of the existing Chile magnitude/radius filter.

**Architecture:** A new `alcanceMundial` boolean column on `pushSubscriptions` (default `false`, opt-in). `findSubscripcionesParaSismo` in `packages/db` branches on the event's `fuente`: CSN events keep today's `magnitudMinima` + optional radius filter untouched; non-CSN (USGS/world) events are filtered by `alcanceMundial = true` and a fixed `UMBRAL_MAGNITUD_MUNDIAL = 7` floor, ignoring radius entirely. The ingestor's USGS loop (which today never sends push) gets wired to `enviarPushParaSismo` the same way the CSN loop already is. The frontend (`usePushNotifications` hook + `ModalConfiguracion`) gains a new, visually separate toggle so it's never confused with the existing Chile-only "🌎 Mundial, sin rango" radius toggle.

**Tech Stack:** Next.js 16 App Router (`apps/web`), Drizzle ORM (`drizzle-orm/node-postgres`) + `pg` (`packages/db`), `web-push` (`apps/ingestor`), Postgres via Docker Compose for local dev.

## Global Constraints

- The world-scope magnitude floor is fixed at **7.0**, not user-configurable — no slider for this value, unlike the existing 4-7 Chile slider.
- World-scope notifications ignore `radioKm`/`centro` entirely — no distance limit once `alcanceMundial` is on.
- The Chile/CSN filter path (`magnitudMinima` + optional radius) must not change behavior for existing subscriptions — `alcanceMundial` defaults to `false` on the new column.
- Follow existing code patterns exactly: Drizzle table changes mirror `packages/db/src/schema.ts` (snake_case columns, flattened fields); query changes mirror the `toX` row-mapper + `onConflictDoUpdate` pattern already in `packages/db/src/queries/push-subscription.ts`; API route changes mirror the validate-then-try/catch pattern already in `apps/web/app/api/push/subscribe/route.ts`.
- Every edited/created file in `apps/web` and `apps/ingestor` must pass that app's `lint` and `check-types` scripts, and `packages/db`'s `check-types`.
- Do not add a new UI toggle/switch component library — reuse the existing `aria-pressed` + conditional-class button pattern already used for "🌎 Mundial, sin rango".
- No automated test suite exists in this repo (no vitest/jest config anywhere) — verification is manual (DB queries via `psql`, `curl` against the ingest endpoint, browser checks), matching every prior plan in `docs/superpowers/plans/`.

---

### Task 1: Shared magnitude-floor constant

**Files:**
- Create: `packages/shared/src/umbral-mundial.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Produces: `UMBRAL_MAGNITUD_MUNDIAL: number` (value `7`), consumed by Task 2 (query filter) and Task 4 (ingestor loop).

- [ ] **Step 1: Create the constant file**

Create `packages/shared/src/umbral-mundial.ts`:

```ts
/** Magnitud mínima para que un evento fuera de Chile dispare una notificación push. */
export const UMBRAL_MAGNITUD_MUNDIAL = 7;
```

- [ ] **Step 2: Export it from the package index**

In `packages/shared/src/index.ts`, change:

```ts
export * from "./types";
export * from "./normalize/csn";
export * from "./normalize/usgs";
export * from "./dedupe";
export * from "./region-chile";
export * from "./distancia";
```

to:

```ts
export * from "./types";
export * from "./normalize/csn";
export * from "./normalize/usgs";
export * from "./dedupe";
export * from "./region-chile";
export * from "./distancia";
export * from "./umbral-mundial";
```

- [ ] **Step 3: Verify types**

Run: `pnpm --filter @sismos/shared check-types`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/umbral-mundial.ts packages/shared/src/index.ts
git commit -m "feat(shared): add UMBRAL_MAGNITUD_MUNDIAL constant"
```

---

### Task 2: `alcanceMundial` column, migration, and query changes

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/<generated>.sql` (via `drizzle-kit generate`, not written by hand)
- Modify: `packages/db/src/queries/push-subscription.ts`

**Interfaces:**
- Consumes: `UMBRAL_MAGNITUD_MUNDIAL`, `SismoFuente` from `@sismos/shared` (Task 1).
- Produces: `PushSubscription.alcanceMundial: boolean`, `SuscripcionInput.alcanceMundial?: boolean`, `findSubscripcionesParaSismo(evento: { magnitud, latitud, longitud, fuente })` — consumed by Task 3 (API route) and Task 4 (`send-push.ts`).

- [ ] **Step 1: Add the column to the Drizzle schema**

In `packages/db/src/schema.ts`, add `boolean` to the import:

```ts
import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  doublePrecision,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
```

Then change the `pushSubscriptions` table from:

```ts
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  magnitudMinima: real("magnitud_minima").notNull().default(4),
  centroLat: doublePrecision("centro_lat"),
  centroLon: doublePrecision("centro_lon"),
  radioKm: real("radio_km"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

to:

```ts
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  magnitudMinima: real("magnitud_minima").notNull().default(4),
  centroLat: doublePrecision("centro_lat"),
  centroLon: doublePrecision("centro_lon"),
  radioKm: real("radio_km"),
  alcanceMundial: boolean("alcance_mundial").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate and apply the migration**

Run: `docker compose up -d postgres` (if not already running)
Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:generate`
Expected: a new file appears under `packages/db/drizzle/` containing `ALTER TABLE "push_subscriptions" ADD COLUMN "alcance_mundial" boolean DEFAULT false NOT NULL`.

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:migrate`
Expected: exits 0, `[✓] migrations applied successfully!`.

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c '\d push_subscriptions'`
Expected: shows the new `alcance_mundial` column (`boolean`, not null, default `false`) alongside the existing columns.

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c 'SELECT count(*) FROM push_subscriptions WHERE alcance_mundial = false;'`
Expected: count equals the total row count (every pre-existing row defaulted to `false`).

- [ ] **Step 3: Update the queries**

Replace the full contents of `packages/db/src/queries/push-subscription.ts` with:

```ts
import { eq, lte } from "drizzle-orm";
import { distanciaKm, UMBRAL_MAGNITUD_MUNDIAL, type SismoFuente } from "@sismos/shared";
import { getDb } from "../connection";
import { pushSubscriptions } from "../schema";

export interface PushSubscription {
  id: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro: { lat: number; lon: number } | null;
  radioKm: number | null;
  alcanceMundial: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
  alcanceMundial?: boolean;
}

function toPushSubscription(
  row: typeof pushSubscriptions.$inferSelect,
): PushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    magnitudMinima: row.magnitudMinima,
    centro:
      row.centroLat !== null && row.centroLon !== null
        ? { lat: row.centroLat, lon: row.centroLon }
        : null,
    radioKm: row.radioKm,
    alcanceMundial: row.alcanceMundial,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertPushSubscription(
  input: SuscripcionInput,
): Promise<PushSubscription> {
  const now = new Date();
  const centro = input.centro ?? null;
  const radioKm = input.radioKm ?? null;
  const alcanceMundial = input.alcanceMundial ?? false;
  const [row] = await getDb()
    .insert(pushSubscriptions)
    .values({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      magnitudMinima: input.magnitudMinima,
      centroLat: centro?.lat ?? null,
      centroLon: centro?.lon ?? null,
      radioKm,
      alcanceMundial,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        magnitudMinima: input.magnitudMinima,
        centroLat: centro?.lat ?? null,
        centroLon: centro?.lon ?? null,
        radioKm,
        alcanceMundial,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertPushSubscription: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toPushSubscription(row);
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function findSubscripcionesParaSismo(evento: {
  magnitud: number;
  latitud: number;
  longitud: number;
  fuente: SismoFuente;
}): Promise<PushSubscription[]> {
  if (evento.fuente !== "csn") {
    if (evento.magnitud < UMBRAL_MAGNITUD_MUNDIAL) return [];
    const rows = await getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.alcanceMundial, true));
    return rows.map(toPushSubscription);
  }

  const rows = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(lte(pushSubscriptions.magnitudMinima, evento.magnitud));

  return rows.map(toPushSubscription).filter((sub) => {
    if (sub.radioKm === null || sub.centro === null) return true;
    return (
      distanciaKm(
        sub.centro.lat,
        sub.centro.lon,
        evento.latitud,
        evento.longitud,
      ) <= sub.radioKm
    );
  });
}
```

- [ ] **Step 4: Verify types**

Run: `pnpm --filter @sismos/db check-types`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle packages/db/src/queries/push-subscription.ts
git commit -m "feat(db): add alcanceMundial column and world-scope push filter"
```

---

### Task 3: Wire `alcanceMundial` through the web API route

**Files:**
- Modify: `apps/web/lib/push-subscriptions.ts`
- Modify: `apps/web/app/api/push/subscribe/route.ts`

**Interfaces:**
- Consumes: `SuscripcionInput.alcanceMundial` from `@sismos/db` (Task 2).
- Produces: `POST /api/push/subscribe` accepts `alcanceMundial: boolean` in its body — consumed by Task 5's hook.

- [ ] **Step 1: Accept the field in the lib wrapper**

In `apps/web/lib/push-subscriptions.ts`, change:

```ts
interface GuardarSuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
}
```

to:

```ts
interface GuardarSuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
  alcanceMundial?: boolean;
}
```

- [ ] **Step 2: Accept and validate the field in the API route**

In `apps/web/app/api/push/subscribe/route.ts`, change:

```ts
interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  magnitudMinima?: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
}
```

to:

```ts
interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  magnitudMinima?: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
  alcanceMundial?: boolean;
}
```

Then change the body of `POST` from:

```ts
  if (body.centro != null && !esCentroValido(body.centro)) {
    return NextResponse.json(
      { error: "centro must be null or { lat, lon }" },
      { status: 400 },
    );
  }

  try {
    await guardarSuscripcion({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      magnitudMinima: body.magnitudMinima,
      centro: body.centro ?? null,
      radioKm: body.radioKm ?? null,
    });
    return NextResponse.json({ ok: true });
```

to:

```ts
  if (body.centro != null && !esCentroValido(body.centro)) {
    return NextResponse.json(
      { error: "centro must be null or { lat, lon }" },
      { status: 400 },
    );
  }
  if (body.alcanceMundial != null && typeof body.alcanceMundial !== "boolean") {
    return NextResponse.json(
      { error: "alcanceMundial must be a boolean" },
      { status: 400 },
    );
  }

  try {
    await guardarSuscripcion({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      magnitudMinima: body.magnitudMinima,
      centro: body.centro ?? null,
      radioKm: body.radioKm ?? null,
      alcanceMundial: body.alcanceMundial ?? false,
    });
    return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/push-subscriptions.ts apps/web/app/api/push/subscribe/route.ts
git commit -m "feat(web): accept alcanceMundial in the push subscribe API"
```

---

### Task 4: Trigger push for M7+ USGS earthquakes in the ingestor

**Files:**
- Modify: `apps/ingestor/lib/send-push.ts:54-58`
- Modify: `apps/ingestor/lib/ingest.ts`

**Interfaces:**
- Consumes: `UMBRAL_MAGNITUD_MUNDIAL` from `@sismos/shared` (Task 1); updated `findSubscripcionesParaSismo` signature from `@sismos/db` (Task 2).
- Produces: `runIngest()` now calls `enviarPushParaSismo` for new M7+ USGS events, same as it already does for M4+ CSN events.

- [ ] **Step 1: Pass `fuente` through in send-push.ts**

In `apps/ingestor/lib/send-push.ts`, change:

```ts
  const suscripciones = await findSubscripcionesParaSismo({
    magnitud: evento.magnitud,
    latitud: evento.latitud,
    longitud: evento.longitud,
  });
```

to:

```ts
  const suscripciones = await findSubscripcionesParaSismo({
    magnitud: evento.magnitud,
    latitud: evento.latitud,
    longitud: evento.longitud,
    fuente: evento.fuente,
  });
```

- [ ] **Step 2: Import the constant in ingest.ts**

In `apps/ingestor/lib/ingest.ts`, change:

```ts
import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  type SismoNormalizado,
} from "@sismos/shared";
```

to:

```ts
import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  UMBRAL_MAGNITUD_MUNDIAL,
  type SismoNormalizado,
} from "@sismos/shared";
```

- [ ] **Step 3: Send push for new M7+ USGS events**

In `apps/ingestor/lib/ingest.ts`, change the USGS insertion branch from:

```ts
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
```

to:

```ts
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
      const { esNuevo } = await upsertSismo(evento);
      summary.usgs.inserted += 1;
      if (esNuevo && evento.magnitud >= UMBRAL_MAGNITUD_MUNDIAL) {
        try {
          await enviarPushParaSismo(evento);
        } catch (error) {
          console.error("[ingest] push notification failed:", error);
        }
      }
    }
  }
```

- [ ] **Step 4: Verify types and lint**

Run: `pnpm --filter ingestor check-types && pnpm --filter ingestor lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/ingestor/lib/send-push.ts apps/ingestor/lib/ingest.ts
git commit -m "feat(ingestor): send push for new M7+ world earthquakes"
```

---

### Task 5: Extend `usePushNotifications` with `alcanceMundial`

**Files:**
- Modify: `apps/web/lib/use-push-notifications.ts`

**Interfaces:**
- Consumes: `POST /api/push/subscribe` accepting `alcanceMundial` (Task 3).
- Produces: `usePushNotifications()` returns `alcanceMundial: boolean`; `activar`/`actualizarUmbral` accept a third `alcanceMundial: boolean` argument — consumed by Task 6's `ModalConfiguracion`.

- [ ] **Step 1: Thread `alcanceMundial` through the request helper**

In `apps/web/lib/use-push-notifications.ts`, change:

```ts
async function enviarSuscripcion(
  subscription: PushSubscription,
  magnitudMinima: number,
  preferenciaRadio: PreferenciaRadio,
): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      magnitudMinima,
      centro: preferenciaRadio.centro,
      radioKm: preferenciaRadio.radioKm,
    }),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
}
```

to:

```ts
async function enviarSuscripcion(
  subscription: PushSubscription,
  magnitudMinima: number,
  preferenciaRadio: PreferenciaRadio,
  alcanceMundial: boolean,
): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      magnitudMinima,
      centro: preferenciaRadio.centro,
      radioKm: preferenciaRadio.radioKm,
      alcanceMundial,
    }),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
}
```

- [ ] **Step 2: Add state and thread it through the hook**

In `apps/web/lib/use-push-notifications.ts`, change:

```ts
  const [magnitudMinima, setMagnitudMinima] = useState(MAGNITUD_DEFAULT);
  const [radioKm, setRadioKm] = useState<number | null>(null);
  const [centro, setCentro] = useState<{ lat: number; lon: number } | null>(
    null,
  );
```

to:

```ts
  const [magnitudMinima, setMagnitudMinima] = useState(MAGNITUD_DEFAULT);
  const [radioKm, setRadioKm] = useState<number | null>(null);
  const [centro, setCentro] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [alcanceMundial, setAlcanceMundial] = useState(false);
```

Then change `activar` from:

```ts
  const activar = useCallback(
    async (nuevaMagnitudMinima: number, preferenciaRadio: PreferenciaRadio) => {
      setLoading(true);
      try {
        const permisoActual = await Notification.requestPermission();
        setPermission(permisoActual as PermisoNotificacion);
        if (permisoActual !== "granted") return false;

        const registration = await navigator.serviceWorker.ready;
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              vapidPublicKey,
            ) as BufferSource,
          });
        }
        await enviarSuscripcion(
          subscription,
          nuevaMagnitudMinima,
          preferenciaRadio,
        );
        setMagnitudMinima(nuevaMagnitudMinima);
        setRadioKm(preferenciaRadio.radioKm);
        setCentro(preferenciaRadio.centro);
        setSuscrito(true);
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );
```

to:

```ts
  const activar = useCallback(
    async (
      nuevaMagnitudMinima: number,
      preferenciaRadio: PreferenciaRadio,
      nuevoAlcanceMundial: boolean,
    ) => {
      setLoading(true);
      try {
        const permisoActual = await Notification.requestPermission();
        setPermission(permisoActual as PermisoNotificacion);
        if (permisoActual !== "granted") return false;

        const registration = await navigator.serviceWorker.ready;
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
        }

        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(
              vapidPublicKey,
            ) as BufferSource,
          });
        }
        await enviarSuscripcion(
          subscription,
          nuevaMagnitudMinima,
          preferenciaRadio,
          nuevoAlcanceMundial,
        );
        setMagnitudMinima(nuevaMagnitudMinima);
        setRadioKm(preferenciaRadio.radioKm);
        setCentro(preferenciaRadio.centro);
        setAlcanceMundial(nuevoAlcanceMundial);
        setSuscrito(true);
        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );
```

Then change `actualizarUmbral` from:

```ts
  const actualizarUmbral = useCallback(
    async (nuevaMagnitudMinima: number, preferenciaRadio: PreferenciaRadio) => {
      setLoading(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error("No active subscription to update");
        await enviarSuscripcion(
          subscription,
          nuevaMagnitudMinima,
          preferenciaRadio,
        );
        setMagnitudMinima(nuevaMagnitudMinima);
        setRadioKm(preferenciaRadio.radioKm);
        setCentro(preferenciaRadio.centro);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    radioKm,
    centro,
    activar,
    desactivar,
    actualizarUmbral,
  };
}
```

to:

```ts
  const actualizarUmbral = useCallback(
    async (
      nuevaMagnitudMinima: number,
      preferenciaRadio: PreferenciaRadio,
      nuevoAlcanceMundial: boolean,
    ) => {
      setLoading(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error("No active subscription to update");
        await enviarSuscripcion(
          subscription,
          nuevaMagnitudMinima,
          preferenciaRadio,
          nuevoAlcanceMundial,
        );
        setMagnitudMinima(nuevaMagnitudMinima);
        setRadioKm(preferenciaRadio.radioKm);
        setCentro(preferenciaRadio.centro);
        setAlcanceMundial(nuevoAlcanceMundial);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    radioKm,
    centro,
    alcanceMundial,
    activar,
    desactivar,
    actualizarUmbral,
  };
}
```

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/use-push-notifications.ts
git commit -m "feat(web): add alcanceMundial to usePushNotifications"
```

---

### Task 6: UI toggle in `ModalConfiguracion`

**Files:**
- Modify: `apps/web/components/configuracion/ModalConfiguracion.tsx`

**Interfaces:**
- Consumes: `alcanceMundial`, updated `activar`/`actualizarUmbral` signatures from `usePushNotifications` (Task 5).

- [ ] **Step 1: Read `alcanceMundial` from the hook and add local state**

In `apps/web/components/configuracion/ModalConfiguracion.tsx`, change:

```ts
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
```

to:

```ts
  const {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    alcanceMundial,
    activar,
    desactivar,
    actualizarUmbral,
  } = usePushNotifications();
  const [umbralLocal, setUmbralLocal] = useState(magnitudMinima);
  const [mundialLocal, setMundialLocal] = useState(ubicacion.radioKm === null);
  const [radioKmLocal, setRadioKmLocal] = useState(
    ubicacion.radioKm ?? RADIO_KM_DEFAULT,
  );
  const [alcanceMundialLocal, setAlcanceMundialLocal] = useState(alcanceMundial);
```

- [ ] **Step 2: Include it in the dirty-check and the activar/desactivar handlers**

Change:

```ts
  const hayFormaCambios =
    umbralLocal !== magnitudMinima ||
    mundialLocal !== (ubicacion.radioKm === null) ||
    (!mundialLocal && radioKmLocal !== ubicacion.radioKm);
```

to:

```ts
  const hayFormaCambios =
    umbralLocal !== magnitudMinima ||
    mundialLocal !== (ubicacion.radioKm === null) ||
    (!mundialLocal && radioKmLocal !== ubicacion.radioKm) ||
    alcanceMundialLocal !== alcanceMundial;
```

Change the activation button's `onClick`:

```tsx
            onClick={() => {
              if (suscrito) {
                desactivar();
                onSetRadioKm(null);
                return;
              }
              const preferencia = preferenciaRadio();
              activar(umbralLocal, preferencia).then((exito) => {
                if (exito) onSetRadioKm(preferencia.radioKm);
              });
            }}
```

to:

```tsx
            onClick={() => {
              if (suscrito) {
                desactivar();
                onSetRadioKm(null);
                return;
              }
              const preferencia = preferenciaRadio();
              activar(umbralLocal, preferencia, alcanceMundialLocal).then((exito) => {
                if (exito) onSetRadioKm(preferencia.radioKm);
              });
            }}
```

And the "Guardar" button:

```tsx
                onClick={() => {
                  const preferencia = preferenciaRadio();
                  actualizarUmbral(umbralLocal, preferencia).then(() => {
                    onSetRadioKm(preferencia.radioKm);
                  });
                }}
```

to:

```tsx
                onClick={() => {
                  const preferencia = preferenciaRadio();
                  actualizarUmbral(umbralLocal, preferencia, alcanceMundialLocal).then(() => {
                    onSetRadioKm(preferencia.radioKm);
                  });
                }}
```

- [ ] **Step 3: Add the new section**

Change (the closing of the Chile radio/"Alcance" block, right before the "Guardar" button):

```tsx
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

                    {!pidiendoUbicacion && ubicacionFallo && (
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
                  actualizarUmbral(umbralLocal, preferencia, alcanceMundialLocal).then(() => {
                    onSetRadioKm(preferencia.radioKm);
                  });
                }}
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          )}
```

to:

```tsx
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

                    {!pidiendoUbicacion && ubicacionFallo && (
                      <p className="mt-3 text-xs text-neutral-400">
                        No pudimos acceder a tu ubicación, así que las
                        notificaciones quedan sin límite de distancia.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-neutral-800 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">
                    Terremotos en el mundo
                  </span>
                  <button
                    type="button"
                    onClick={() => setAlcanceMundialLocal((v) => !v)}
                    aria-pressed={alcanceMundialLocal}
                    className={`flex min-h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors ${
                      alcanceMundialLocal
                        ? "border-sky-500 bg-sky-500/10 text-sky-400"
                        : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
                    }`}
                  >
                    Avisarme
                  </button>
                </div>
                <p className="text-xs text-neutral-400">
                  Terremotos grandes (M7.0+) en cualquier país, sin importar
                  la distancia.
                </p>
              </div>

              <button
                type="button"
                disabled={loading || !hayFormaCambios}
                onClick={() => {
                  const preferencia = preferenciaRadio();
                  actualizarUmbral(umbralLocal, preferencia, alcanceMundialLocal).then(() => {
                    onSetRadioKm(preferencia.radioKm);
                  });
                }}
                className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          )}
```

- [ ] **Step 4: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/configuracion/ModalConfiguracion.tsx
git commit -m "feat(web): add world-scope earthquake toggle to notification settings"
```

---

### Task 7: End-to-end verification

**Files:**
- None — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-6.

- [ ] **Step 1: Full lint and type-check across all affected packages**

Run: `pnpm --filter @sismos/shared check-types && pnpm --filter @sismos/db check-types && pnpm --filter web lint && pnpm --filter web check-types && pnpm --filter ingestor lint && pnpm --filter ingestor check-types`
Expected: all exit 0.

- [ ] **Step 2: Start postgres, web, and ingestor**

Run: `docker compose up -d postgres` (if not already running), then `pnpm --filter web dev` and `pnpm --filter ingestor dev`.
Expected: web on `:3000`, ingestor on `:3001`.

- [ ] **Step 3: Subscribe with world scope on via the UI**

Using the claude-in-chrome browser tool: open `http://localhost:3000`, open the menu, click "Notificaciones", click "Activar notificaciones", grant the browser permission prompt, then toggle "Avisarme" under "Terremotos en el mundo" and click "Guardar".
Expected: the toggle shows the active/sky-blue state; "Guardar" becomes enabled then disabled again after saving (no pending changes).

- [ ] **Step 4: Confirm the subscription landed in Postgres with alcance_mundial = true**

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c 'SELECT endpoint, magnitud_minima, alcance_mundial FROM push_subscriptions;'`
Expected: one row with `alcance_mundial = t`.

- [ ] **Step 5: Confirm a sub-threshold world event does NOT match**

Run:
```bash
cd apps/ingestor && npx tsx --env-file=.env.local -e "
import('./lib/send-push.ts').then(async ({ enviarPushParaSismo }) => {
  await enviarPushParaSismo({
    fuente: 'usgs',
    externalId: 'test-mundial-bajo',
    fecha: new Date(),
    magnitud: 6.5,
    profundidadKm: 10,
    latitud: 4.6,
    longitud: -74.1,
    lugar: 'Prueba Colombia M6.5',
    bandera: null,
  });
  console.log('done');
});
"
```
Expected: prints `done`, no system notification appears (below the M7.0 floor).

- [ ] **Step 6: Confirm a qualifying world event DOES match, regardless of distance**

Run the same script with `magnitud: 7.2` and `externalId: 'test-mundial-alto'`.
Expected: a system-level push notification appears titled with the M7.2 event and "Prueba Colombia M7.2" (or whatever `lugar` was used), even though the subscription's Chile `centro`/`radioKm` (if any) is nowhere near Colombia.

- [ ] **Step 7: Confirm Chile filtering is unaffected**

Run the same script with `fuente: 'csn'`, `magnitud: 3`, `lugar: 'Prueba Chile bajo umbral'`.
Expected: prints `done`, no notification (below the Chile `magnitudMinima` default of 4) — confirms the CSN path still uses `magnitudMinima`, unrelated to `alcanceMundial`.

- [ ] **Step 8: Confirm the ingest loop only pushes for new events**

Run: `curl -s -H "x-cron-secret: $(grep CRON_SECRET apps/ingestor/.env.local | cut -d= -f2)" http://localhost:3001/api/ingest` twice in a row, watching the ingestor dev server logs between runs.
Expected: the second run logs no new `[ingest] push notification failed` errors and (if the same USGS event was already inserted in the first run) does not attempt to resend for it — only newly inserted M7+ USGS events trigger `enviarPushParaSismo`.

- [ ] **Step 9: Clean up test subscriptions**

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c 'DELETE FROM push_subscriptions;'`
Expected: test subscriptions removed so they don't linger in the dev database.

- [ ] **Step 10: Stop dev servers and final status check**

Stop any background dev servers started in Step 2. Run: `git status --short`
Expected: clean (everything already committed in Tasks 1-6).
