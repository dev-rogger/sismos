# Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push notifications for Chilean (CSN) earthquakes M4+, with a settings button/modal to opt in and choose a magnitude threshold (4-7), and a deep link so tapping the notification flies the map straight to that earthquake with details visible, as fast as possible (no extra fetch on open).

**Architecture:** A `PushSubscription` Mongoose model (anonymous, keyed by `endpoint`, no user accounts) lives in `packages/db`. `apps/web` exposes a `POST`/`DELETE /api/push/subscribe` route, a `usePushNotifications` client hook, and a settings button/modal built on top of it. `apps/web/app/sw.ts` (Serwist) gets manual `push`/`notificationclick` listeners added alongside Serwist's own. `apps/ingestor`, after inserting a new CSN earthquake with `magnitud >= 4`, calls `web-push` directly against matching subscriptions. The push payload embeds the earthquake's full details in the notification's target URL, so opening the app on tap requires zero extra network round-trip — it reuses the existing `sismoSeleccionado` map-selection state/flyTo mechanism already in `MapaConHistorial`/`MapaSismos`.

**Tech Stack:** Next.js 16 App Router (both apps), Mongoose, `web-push` (apps/ingestor only), Serwist (apps/web service worker), maplibre-gl.

## Global Constraints

- No user accounts in this project — subscriptions are anonymous, keyed only by `endpoint`. Do not add a `userId` field.
- Geographic scope is Chile-only (CSN) for v1 — do not trigger push for USGS events, regardless of magnitude.
- Magnitude threshold range is **4 to 7** (not 2-7 like the historial filter) — 4 is the fixed floor, never lower.
- The repo has only one shared `.env.example` at the root (no per-app example files exist) — add new env var placeholders there, not new per-app example files.
- `apps/web/lint` and `apps/ingestor/lint` both run `eslint --max-warnings 0` with the `turbo/no-undeclared-env-vars` rule active — every new env var (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) MUST be added to `turbo.json`'s `globalEnv` array or lint will fail.
- Push sending in `apps/ingestor` must be `await`-ed (not truly fire-and-forget) inside a `try/catch` — on Vercel serverless the process can be frozen right after the HTTP response is sent, so unawaited async work can be silently dropped. A failed push send must never fail the ingest itself.
- Follow existing code patterns exactly: Mongoose models/queries mirror `packages/db/src/models/sismo.ts` + `packages/db/src/queries/sismo.ts`; API routes mirror `apps/web/app/api/sismos/route.ts` (validate input, `try/catch` around DB calls, `console.error` + 500 on failure); DB-calling lib wrappers in `apps/web/lib/` call `getMongooseConnection()` before the query, mirroring `apps/web/lib/fetch-sismos.ts`.
- Every edited/created file in `apps/web` and `apps/ingestor` must pass that app's `lint` and `check-types` scripts, and `packages/db`'s `check-types`.
- Do not add a new UI toggle/switch component library — reuse the existing `aria-pressed` + conditional-class button pattern already used for the "Solo Chile" toggle.
- Do not add an icon library — the settings gear icon is a hand-written inline SVG.

---

### Task 1: Generate VAPID keys and wire env vars

**Files:**
- Modify: `apps/web/.env.local` (not committed — gitignored)
- Modify: `apps/ingestor/.env.local` (not committed — gitignored)
- Modify: `.env.example` (root, committed)
- Modify: `turbo.json`
- Modify: `.gitignore`
- Create: `vercel-env-push.txt` (root, not committed — gitignored)

**Interfaces:**
- Produces: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (read by Task 5's hook), `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` (read by Task 8's `send-push.ts`).

- [ ] **Step 1: Generate the VAPID key pair**

Run: `npx web-push generate-vapid-keys`
Expected: prints a `Public Key:` and `Private Key:` line. Copy both values for the next steps.

- [ ] **Step 2: Add the public key to apps/web/.env.local**

Append to `apps/web/.env.local` (currently just `MONGODB_URI=mongodb://localhost:27017/sismos`):
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key from step 1>
```

- [ ] **Step 3: Add all three VAPID vars to apps/ingestor/.env.local**

Append to `apps/ingestor/.env.local` (currently just `MONGODB_URI=mongodb://localhost:27017/sismos`):
```
VAPID_PUBLIC_KEY=<the public key from step 1>
VAPID_PRIVATE_KEY=<the private key from step 1>
VAPID_SUBJECT=mailto:roguerrero.go@gmail.com
```

- [ ] **Step 4: Add placeholders to the root .env.example**

Change `.env.example` from:
```
MONGODB_URI=
```
to:
```
MONGODB_URI=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
```

- [ ] **Step 5: Register the new env vars in turbo.json**

Change `turbo.json`'s top-level `"globalEnv"` from:
```json
  "globalEnv": ["MONGODB_URI"],
```
to:
```json
  "globalEnv": [
    "MONGODB_URI",
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "VAPID_SUBJECT"
  ],
```

- [ ] **Step 6: Add vercel-env-push.txt to .gitignore**

In `.gitignore`, under the existing `# Env` section (which already lists `.env`, `.env.local`, `.env.*.local`), add a new line:
```
vercel-env-push.txt
```

- [ ] **Step 7: Create vercel-env-push.txt with all 4 variables**

Create `/Users/rodrigoguerrero/Sites/sismos/vercel-env-push.txt`:
```
# Paste into Vercel project env vars.
# web project needs: NEXT_PUBLIC_VAPID_PUBLIC_KEY
# ingestor project needs: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<the public key from step 1>
VAPID_PUBLIC_KEY=<the public key from step 1>
VAPID_PRIVATE_KEY=<the private key from step 1>
VAPID_SUBJECT=mailto:roguerrero.go@gmail.com
```

- [ ] **Step 8: Verify the gitignored files won't be committed**

Run: `git status --short`
Expected: `apps/web/.env.local`, `apps/ingestor/.env.local`, and `vercel-env-push.txt` do NOT appear (already gitignored, or newly ignored after step 6). Only `.env.example`, `turbo.json`, `.gitignore` should show as modified.

- [ ] **Step 9: Commit the tracked changes**

```bash
git add .env.example turbo.json .gitignore
git commit -m "chore: add VAPID env var placeholders for push notifications"
```

---

### Task 2: PushSubscription model and queries in packages/db

**Files:**
- Create: `packages/db/src/models/push-subscription.ts`
- Create: `packages/db/src/queries/push-subscription.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `PushSubscriptionModel`, `PushSubscriptionDoc` type, `upsertPushSubscription(input)`, `deletePushSubscription(endpoint)`, `findSubscripcionesParaMagnitud(magnitud)` — all exported from `@sismos/db`, consumed by Task 3 (API route) and Task 8 (`send-push.ts`).

- [ ] **Step 1: Create the Mongoose model**

Create `packages/db/src/models/push-subscription.ts`:

```ts
import mongoose, {
  Schema,
  model,
  type InferSchemaType,
  type Model,
} from "mongoose";

const pushSubscriptionSchema = new Schema(
  {
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    magnitudMinima: { type: Number, required: true, default: 4 },
  },
  { timestamps: true },
);

export type PushSubscriptionDoc = InferSchemaType<typeof pushSubscriptionSchema>;

export const PushSubscriptionModel: Model<PushSubscriptionDoc> =
  (mongoose.models.PushSubscription as Model<PushSubscriptionDoc>) ??
  model<PushSubscriptionDoc>(
    "PushSubscription",
    pushSubscriptionSchema,
    "pushsubscriptions",
  );
```

- [ ] **Step 2: Create the queries**

Create `packages/db/src/queries/push-subscription.ts`:

```ts
import {
  PushSubscriptionModel,
  type PushSubscriptionDoc,
} from "../models/push-subscription";

interface SuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
}

export async function upsertPushSubscription(
  input: SuscripcionInput,
): Promise<PushSubscriptionDoc> {
  const result = await PushSubscriptionModel.findOneAndUpdate(
    { endpoint: input.endpoint },
    { $set: input },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!result) {
    throw new Error(
      "upsertPushSubscription: findOneAndUpdate returned null unexpectedly",
    );
  }
  return result;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await PushSubscriptionModel.deleteOne({ endpoint });
}

export async function findSubscripcionesParaMagnitud(
  magnitud: number,
): Promise<PushSubscriptionDoc[]> {
  return PushSubscriptionModel.find({
    magnitudMinima: { $lte: magnitud },
  }).lean();
}
```

- [ ] **Step 3: Export from the package index**

In `packages/db/src/index.ts`, change:

```ts
export * from "./connection";
export * from "./models/sismo";
export * from "./models/sismo-historico";
export * from "./queries/sismo";
export * from "./queries/sismo-historico";
```

to:

```ts
export * from "./connection";
export * from "./models/sismo";
export * from "./models/sismo-historico";
export * from "./models/push-subscription";
export * from "./queries/sismo";
export * from "./queries/sismo-historico";
export * from "./queries/push-subscription";
```

- [ ] **Step 4: Verify types**

Run: `pnpm --filter @sismos/db check-types`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/models/push-subscription.ts packages/db/src/queries/push-subscription.ts packages/db/src/index.ts
git commit -m "feat: add PushSubscription model and queries"
```

---

### Task 3: Subscribe API route in apps/web

**Files:**
- Create: `apps/web/lib/push-subscriptions.ts`
- Create: `apps/web/app/api/push/subscribe/route.ts`

**Interfaces:**
- Consumes: `upsertPushSubscription`, `deletePushSubscription`, `getMongooseConnection` from `@sismos/db` (Task 2).
- Produces: `POST /api/push/subscribe` and `DELETE /api/push/subscribe`, consumed by Task 5's hook.

- [ ] **Step 1: Create the lib wrapper**

Create `apps/web/lib/push-subscriptions.ts` (mirrors the `getMongooseConnection()`-then-query pattern in `apps/web/lib/fetch-sismos.ts`):

```ts
import {
  getMongooseConnection,
  upsertPushSubscription,
  deletePushSubscription,
  type PushSubscriptionDoc,
} from "@sismos/db";

interface GuardarSuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
}

export async function guardarSuscripcion(
  input: GuardarSuscripcionInput,
): Promise<PushSubscriptionDoc> {
  await getMongooseConnection();
  return upsertPushSubscription(input);
}

export async function eliminarSuscripcion(endpoint: string): Promise<void> {
  await getMongooseConnection();
  return deletePushSubscription(endpoint);
}
```

- [ ] **Step 2: Create the API route**

Create `apps/web/app/api/push/subscribe/route.ts` (mirrors the validate-then-try/catch pattern in `apps/web/app/api/historial/route.ts`):

```ts
import { NextResponse } from "next/server";
import { guardarSuscripcion, eliminarSuscripcion } from "../../../../lib/push-subscriptions";

interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  magnitudMinima?: number;
}

function esMagnitudValida(valor: unknown): valor is number {
  return typeof valor === "number" && valor >= 4 && valor <= 7;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SubscribeBody;
  const endpoint = body.subscription?.endpoint;
  const keys = body.subscription?.keys;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Missing subscription endpoint or keys" },
      { status: 400 },
    );
  }
  if (!esMagnitudValida(body.magnitudMinima)) {
    return NextResponse.json(
      { error: "magnitudMinima must be a number between 4 and 7" },
      { status: 400 },
    );
  }

  try {
    await guardarSuscripcion({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      magnitudMinima: body.magnitudMinima,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/push/subscribe] POST failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  try {
    await eliminarSuscripcion(body.endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/push/subscribe] DELETE failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/push-subscriptions.ts apps/web/app/api/push/subscribe/route.ts
git commit -m "feat: add push subscription API route"
```

---

### Task 4: Service worker push handlers

**Files:**
- Modify: `apps/web/app/sw.ts`

**Interfaces:**
- Consumes: `apps/web/public/icons/icon-192.png` (already exists from the mobile-responsive-PWA work).
- Produces: browser-level `push`/`notificationclick` behavior — no code-level interface, verified manually in Task 10.

- [ ] **Step 1: Add the push and notificationclick listeners**

In `apps/web/app/sw.ts`, change:

```ts
serwist.addEventListeners();
```

to:

```ts
serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Sismos", {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data.url;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0. (If TypeScript complains about `event.data`/`showNotification`/`clients` types, this file already runs in the `ServiceWorkerGlobalScope` context declared at the top of `sw.ts` — no new type declarations should be needed since these are standard service worker globals.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/sw.ts
git commit -m "feat: handle push and notificationclick events in service worker"
```

---

### Task 5: usePushNotifications hook

**Files:**
- Create: `apps/web/lib/use-push-notifications.ts`

**Interfaces:**
- Consumes: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` env var (Task 1), `POST`/`DELETE /api/push/subscribe` (Task 3).
- Produces: `usePushNotifications()` hook returning `{ permission, suscrito, loading, magnitudMinima, activar, desactivar, actualizarUmbral }`, consumed by Task 6's `ModalConfiguracion`.

- [ ] **Step 1: Create the hook**

Create `apps/web/lib/use-push-notifications.ts`:

```ts
"use client";

import { useCallback, useEffect, useState } from "react";

type PermisoNotificacion = "granted" | "denied" | "default" | "unsupported";

const MAGNITUD_DEFAULT = 4;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function enviarSuscripcion(
  subscription: PushSubscription,
  magnitudMinima: number,
): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      magnitudMinima,
    }),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
}

export function usePushNotifications() {
  const [permission, setPermission] =
    useState<PermisoNotificacion>("unsupported");
  const [suscrito, setSuscrito] = useState(false);
  const [loading, setLoading] = useState(true);
  const [magnitudMinima, setMagnitudMinima] = useState(MAGNITUD_DEFAULT);

  useEffect(() => {
    let cancelado = false;

    async function inicializar() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setPermission("unsupported");
        setLoading(false);
        return;
      }
      setPermission(Notification.permission as PermisoNotificacion);
      const registration = await navigator.serviceWorker.ready;
      const existente = await registration.pushManager.getSubscription();
      if (!cancelado) {
        setSuscrito(existente !== null);
        setLoading(false);
      }
    }

    inicializar().catch((error) => {
      console.error("[usePushNotifications] init failed:", error);
      if (!cancelado) setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  const activar = useCallback(async (nuevaMagnitudMinima: number) => {
    setLoading(true);
    try {
      const permisoActual = await Notification.requestPermission();
      setPermission(permisoActual as PermisoNotificacion);
      if (permisoActual !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }
      await enviarSuscripcion(subscription, nuevaMagnitudMinima);
      setMagnitudMinima(nuevaMagnitudMinima);
      setSuscrito(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSuscrito(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const actualizarUmbral = useCallback(async (nuevaMagnitudMinima: number) => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("No active subscription to update");
      await enviarSuscripcion(subscription, nuevaMagnitudMinima);
      setMagnitudMinima(nuevaMagnitudMinima);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    activar,
    desactivar,
    actualizarUmbral,
  };
}
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/use-push-notifications.ts
git commit -m "feat: add usePushNotifications hook"
```

---

### Task 6: Settings button and modal

**Files:**
- Create: `apps/web/components/configuracion/BotonConfiguracion.tsx`
- Create: `apps/web/components/configuracion/ModalConfiguracion.tsx`

**Interfaces:**
- Consumes: `usePushNotifications()` from Task 5.
- Produces: `BotonConfiguracion` (no props), consumed by Task 7 in `MapaSismos.tsx`.

- [ ] **Step 1: Create the modal**

Create `apps/web/components/configuracion/ModalConfiguracion.tsx`:

```tsx
"use client";

import { useState } from "react";
import { usePushNotifications } from "../../lib/use-push-notifications";

interface ModalConfiguracionProps {
  abierto: boolean;
  onCerrar: () => void;
}

export default function ModalConfiguracion({
  abierto,
  onCerrar,
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

  if (!abierto) return null;

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
              onClick={() => (suscrito ? desactivar() : activar(umbralLocal))}
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
                <button
                  type="button"
                  disabled={loading || umbralLocal === magnitudMinima}
                  onClick={() => actualizarUmbral(umbralLocal)}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-50"
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

- [ ] **Step 2: Create the button**

Create `apps/web/components/configuracion/BotonConfiguracion.tsx`:

```tsx
"use client";

import { useState } from "react";
import ModalConfiguracion from "./ModalConfiguracion";

export default function BotonConfiguracion() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Configuración de notificaciones"
        className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82V9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </button>
      <ModalConfiguracion abierto={abierto} onCerrar={() => setAbierto(false)} />
    </>
  );
}
```

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/configuracion/BotonConfiguracion.tsx apps/web/components/configuracion/ModalConfiguracion.tsx
git commit -m "feat: add push notification settings button and modal"
```

---

### Task 7: Wire the settings button into the map

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx:190-208`

**Interfaces:**
- Consumes: `BotonConfiguracion` from Task 6.

- [ ] **Step 1: Wrap the existing button and add BotonConfiguracion**

In `apps/web/components/mapa/MapaSismos.tsx`, add the import at the top (after the existing `marcador` import):

```ts
import { crearElementoMarcador, crearElementoSeleccion } from "./marcador";
import BotonConfiguracion from "../configuracion/BotonConfiguracion";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";
```

Then change the returned JSX from:

```tsx
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
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="absolute right-3 z-10 flex min-h-11 items-center rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        Ver todo Chile
      </button>
    </div>
  );
```

to:

```tsx
  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <div
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="absolute right-3 z-10 flex items-center gap-2"
      >
        <BotonConfiguracion />
        <button
          type="button"
          onClick={() =>
            mapRef.current?.flyTo({
              center: CHILE_CENTER,
              zoom: CHILE_ZOOM,
              speed: 1.2,
            })
          }
          className="flex min-h-11 items-center rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
        >
          Ver todo Chile
        </button>
      </div>
    </div>
  );
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat: add settings button next to Ver todo Chile"
```

---

### Task 8: Send push from the ingestor

**Files:**
- Modify: `apps/ingestor/package.json`
- Create: `apps/ingestor/lib/send-push.ts`
- Modify: `apps/ingestor/lib/ingest.ts:59-69`

**Interfaces:**
- Consumes: `findSubscripcionesParaMagnitud`, `deletePushSubscription` from `@sismos/db` (Task 2); `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` env vars (Task 1); `SismoNormalizado` from `@sismos/shared`.
- Produces: `enviarPushParaSismo(evento: SismoNormalizado): Promise<void>`, called from `runIngest()`.

- [ ] **Step 1: Add the web-push dependency**

Run: `pnpm add web-push --filter ingestor && pnpm add -D @types/web-push --filter ingestor`
Expected: `apps/ingestor/package.json` gains `web-push` under `dependencies` and `@types/web-push` under `devDependencies`; exits 0.

- [ ] **Step 2: Create the send-push module**

Create `apps/ingestor/lib/send-push.ts`:

```ts
import webpush from "web-push";
import {
  findSubscripcionesParaMagnitud,
  deletePushSubscription,
} from "@sismos/db";
import type { SismoNormalizado } from "@sismos/shared";

let vapidConfigurado = false;

function configurarVapid(): void {
  if (vapidConfigurado) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigurado = true;
}

function esErrorConStatusCode(
  error: unknown,
): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  );
}

export async function enviarPushParaSismo(
  evento: SismoNormalizado,
): Promise<void> {
  configurarVapid();

  const suscripciones = await findSubscripcionesParaMagnitud(evento.magnitud);
  if (suscripciones.length === 0) return;

  const url = `/?sismo=${evento.externalId}&lat=${evento.latitud}&lon=${evento.longitud}&mag=${evento.magnitud}&lugar=${encodeURIComponent(evento.lugar)}`;
  const payload = JSON.stringify({
    title: `Sismo M${evento.magnitud} en ${evento.lugar}`,
    body: evento.fecha.toLocaleString("es-CL"),
    url,
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
      ),
    ),
  );

  await Promise.all(
    resultados.map((resultado, i) => {
      if (
        resultado.status === "rejected" &&
        esErrorConStatusCode(resultado.reason) &&
        resultado.reason.statusCode === 410
      ) {
        return deletePushSubscription(suscripciones[i].endpoint);
      }
      return undefined;
    }),
  );
}
```

- [ ] **Step 3: Call it from the ingest loop**

In `apps/ingestor/lib/ingest.ts`, add the import:

```ts
import { fetchCsnRecent } from "./fetch-csn";
import { fetchUsgsRecent } from "./fetch-usgs";
import { enviarPushParaSismo } from "./send-push";
```

Then change the CSN insertion branch from:

```ts
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
```

to:

```ts
  for (const evento of csnEventos) {
    const usgsCandidatos = await findRecentByFuente("usgs", since);
    const match = findDuplicate(evento, usgsCandidatos as SismoNormalizado[]);
    if (match) {
      await replaceWithCsn(match.externalId, evento);
      summary.deduped += 1;
    } else {
      await upsertSismo(evento);
      summary.csn.inserted += 1;
      if (evento.magnitud >= 4) {
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
git add apps/ingestor/package.json pnpm-lock.yaml apps/ingestor/lib/send-push.ts apps/ingestor/lib/ingest.ts
git commit -m "feat: send push notifications for new M4+ CSN earthquakes"
```

---

### Task 9: Deep link on notification open

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/components/MapaConHistorial.tsx`
- Modify: `apps/web/components/mapa/MapaSismos.tsx` (the `sismoSeleccionado` effect, around line 170-188)

**Interfaces:**
- Consumes: the `url` query params set in Task 8's `send-push.ts` (`sismo`, `lat`, `lon`, `mag`, `lugar`).
- Produces: `MapaConHistorial` gains a `sismoInicial: SismoSeleccionado | null` prop, used as the initial value of its existing `sismoSeleccionado` state.

- [ ] **Step 1: Parse the query params in page.tsx**

Change `apps/web/app/page.tsx` from:

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
      bandera: s.bandera ?? null,
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

to:

```tsx
import { getUltimos10Dias } from "../lib/fetch-sismos";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";
import MapaConHistorial from "../components/MapaConHistorial";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function parseSismoDesdeQuery(params: {
  [key: string]: string | string[] | undefined;
}): SismoSeleccionado | null {
  const externalId = typeof params.sismo === "string" ? params.sismo : null;
  const lugar = typeof params.lugar === "string" ? params.lugar : null;
  const lat = typeof params.lat === "string" ? Number(params.lat) : NaN;
  const lon = typeof params.lon === "string" ? Number(params.lon) : NaN;
  const mag = typeof params.mag === "string" ? Number(params.mag) : NaN;

  if (
    !externalId ||
    !lugar ||
    Number.isNaN(lat) ||
    Number.isNaN(lon) ||
    Number.isNaN(mag)
  ) {
    return null;
  }
  return { externalId, latitud: lat, longitud: lon, magnitud: mag, lugar };
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const sismoInicial = parseSismoDesdeQuery(params);

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
      bandera: s.bandera ?? null,
    }));
  } catch (error) {
    console.error("[page] failed to load initial sismos:", error);
  }

  return (
    <main className="flex h-screen w-screen flex-col lg:flex-row">
      <MapaConHistorial
        sismosIniciales={sismosIniciales}
        sismoInicial={sismoInicial}
      />
    </main>
  );
}
```

- [ ] **Step 2: Accept the prop in MapaConHistorial**

In `apps/web/components/MapaConHistorial.tsx`, change:

```tsx
interface MapaConHistorialProps {
  sismosIniciales: SismoMapa[];
}

export default function MapaConHistorial({
  sismosIniciales,
}: MapaConHistorialProps) {
  const [sismoSeleccionado, setSismoSeleccionado] =
    useState<SismoSeleccionado | null>(null);
```

to:

```tsx
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
```

- [ ] **Step 3: Show a popup with details on the selection marker**

In `apps/web/components/mapa/MapaSismos.tsx`, change the `sismoSeleccionado` effect from:

```tsx
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
```

to:

```tsx
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
      .setPopup(
        new maplibregl.Popup({ offset: 12, className: "popup-sismo" }).setHTML(
          `<strong>${sismoSeleccionado.lugar}</strong><br/>M${sismoSeleccionado.magnitud}`,
        ),
      )
      .addTo(map);
    marker.togglePopup();

    return () => {
      marker.remove();
    };
  }, [sismoSeleccionado]);
```

- [ ] **Step 4: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0. (`check-types` runs `next typegen` first, which validates the async `searchParams` prop signature against Next.js 16's generated page types — if the signature is wrong, this step fails here rather than at runtime.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx apps/web/components/MapaConHistorial.tsx apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat: deep-link to a specific sismo when opening from a notification"
```

---

### Task 10: End-to-end verification

**Files:**
- None — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-9.

- [ ] **Step 1: Full lint and type-check across all affected packages**

Run: `pnpm --filter @sismos/db check-types && pnpm --filter web lint && pnpm --filter web check-types && pnpm --filter ingestor lint && pnpm --filter ingestor check-types`
Expected: all exit 0.

- [ ] **Step 2: Confirm the VAPID env vars are actually set**

Run: `grep -c VAPID apps/web/.env.local apps/ingestor/.env.local`
Expected: `apps/web/.env.local:1` and `apps/ingestor/.env.local:3`.

- [ ] **Step 3: Start mongo, web, and ingestor**

Run: `pnpm docker:dev` (background), or if mongo is already running via Docker from earlier, run `pnpm --filter web dev` and `pnpm --filter ingestor dev` directly against it.
Expected: web on `:3000`, ingestor on `:3001`.

- [ ] **Step 4: Subscribe via the UI**

Using the claude-in-chrome browser tool: open `http://localhost:3000`, click the new gear icon button next to "Ver todo Chile", click "Activar notificaciones", grant the browser permission prompt.
Expected: modal shows "Desactivar notificaciones" (now in the active/sky-blue state) and a magnitude slider defaulting to M4.

- [ ] **Step 5: Confirm the subscription landed in MongoDB**

Run: `docker exec -i sismos-mongo-1 mongosh sismos --quiet --eval "db.pushsubscriptions.find().toArray()"` (adjust container name if not using the docker-compose setup)
Expected: one document with a non-empty `endpoint`, `keys.p256dh`, `keys.auth`, and `magnitudMinima: 4`.

- [ ] **Step 6: Trigger a manual ingest and confirm a push is attempted**

Run: `curl -s http://localhost:3001/api/ingest` and watch the ingestor's dev server logs.
Expected: if any CSN event M4+ was newly inserted in this run, no `[ingest] push notification failed` error appears in the logs. (If no M4+ event happens to be new at test time, this step may show nothing to send — that's expected, not a failure; rely on Step 7 for an unconditional check.)

- [ ] **Step 7: Directly test the deep-link URL**

Using the claude-in-chrome browser tool: navigate to `http://localhost:3000/?sismo=test123&lat=-33.45&lon=-70.6&mag=5.2&lugar=Santiago%20de%20prueba`.
Expected: the map flies to the given coordinates and a popup showing "Santiago de prueba" / "M5.2" is already open, without needing any click.

- [ ] **Step 8: Directly test enviarPushParaSismo against the real subscription**

Run a one-off script to confirm the send path works end-to-end without waiting for a real earthquake:
```bash
cd apps/ingestor && node --env-file=.env.local -e "
import('./lib/send-push.ts').then(async ({ enviarPushParaSismo }) => {
  await enviarPushParaSismo({
    fuente: 'csn',
    externalId: 'test-manual',
    fecha: new Date(),
    magnitud: 5,
    profundidadKm: 10,
    latitud: -33.45,
    longitud: -70.6,
    lugar: 'Prueba manual',
    bandera: '🇨🇱',
  });
  console.log('done');
});
"
```
Expected: a system-level push notification appears (if the browser/OS is set up to receive it); no thrown error; log prints `done`. If TypeScript/ESM loading via `node -e` fails, run the equivalent logic through `tsx --env-file=.env.local` instead, since `tsx` is already a dependency of `apps/ingestor` (used by `backfill-historicos`).

- [ ] **Step 9: Click the test notification**

Click the system notification from Step 8.
Expected: the browser tab (if already open) navigates in place (not a new tab) to the deep-link URL and shows the map flown to the test coordinates with the popup open.

- [ ] **Step 10: Clean up the test subscription**

Run: `docker exec -i sismos-mongo-1 mongosh sismos --quiet --eval "db.pushsubscriptions.deleteMany({})"`
Expected: test subscriptions removed so they don't linger in the dev database.

- [ ] **Step 11: Stop dev servers and final status check**

Stop any background dev servers started in Step 3. Run: `git status --short`
Expected: clean (everything already committed in Tasks 1-9).
