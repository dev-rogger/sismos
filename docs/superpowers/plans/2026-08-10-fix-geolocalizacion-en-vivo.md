# Fix: ubicación en vivo (no pegada a un lugar viejo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the bug where the user's saved location never refreshes after the first successful GPS read — every explicit "get my location" action (the map's "📍 Mi ubicación" button, opening Configuración without "Mundial" mode) must fetch a fresh device position instead of reusing whatever was cached in `localStorage`, potentially days or hundreds of kilometers old.

**Architecture:** No new files, no schema/API changes — this is a pure bug fix in existing client-side code. `useUbicacionUsuario().pedirUbicacion()` already calls `navigator.geolocation.getCurrentPosition` correctly; the bug is that its two call sites (`MapaSismos.tsx`'s button, `ModalConfiguracion.tsx`'s auto-fetch effect) both skip calling it whenever a cached `centro` already exists. Removing that skip condition — plus switching `enableHighAccuracy` to `true` for a more precise GPS fix instead of a coarse network-based one — is the entire fix.

**Tech Stack:** Next.js 16 App Router (`apps/web`), Geolocation Web API, React hooks.

## Global Constraints

- Do not change the push-notification radius/centro behavior (`packages/db`, `apps/ingestor`) — this fix is client-only, about how often the browser is asked for a fresh position, not about how that position is used downstream.
- Do not add a "refresh location" button or any new UI element — the existing actions (tap "📍 Mi ubicación", open Configuración without "Mundial") become the refresh mechanism themselves, per the approved spec.
- The browser's permission dialog must never show more than once per session for the same origin — calling `getCurrentPosition()` repeatedly after `"granted"` never re-prompts, so removing the cache-skip does not regress this.
- Every edited file in `apps/web` must pass `pnpm --filter web check-types` and `pnpm --filter web lint`.
- No automated test suite exists in this repo — verification is manual, via a browser script that overrides `navigator.geolocation.getCurrentPosition` to simulate movement (since a real GPS device can't be physically relocated for a test).

---

### Task 1: Fresh, high-accuracy reads in `useUbicacionUsuario`

**Files:**
- Modify: `apps/web/lib/use-ubicacion-usuario.ts:71`

**Interfaces:**
- No signature changes — `pedirUbicacion(): Promise<{ lat: number; lon: number } | null>` keeps its exact existing shape. Consumed unchanged by Task 2 and Task 3.

- [ ] **Step 1: Switch to high-accuracy geolocation**

In `apps/web/lib/use-ubicacion-usuario.ts`, change:

```ts
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
```

to:

```ts
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
        { enableHighAccuracy: true, timeout: 8000 },
      );
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/use-ubicacion-usuario.ts
git commit -m "fix(web): use high-accuracy GPS reads for user location"
```

---

### Task 2: Always fetch a fresh position from the "📍 Mi ubicación" button

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx:577-598`

**Interfaces:**
- Consumes: `onPedirUbicacion: () => Promise<{ lat: number; lon: number } | null>` (existing prop, unchanged), `ubicacion.centro` (existing prop, unchanged).

- [ ] **Step 1: Always call `onPedirUbicacion`, falling back to the cached point only on failure**

In `apps/web/components/mapa/MapaSismos.tsx`, change:

```tsx
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
```

to:

```tsx
        <button
          type="button"
          onClick={async () => {
            const map = mapRef.current;
            if (!map) return;
            const centro = await onPedirUbicacion();
            const destino = centro ?? ubicacion.centro;
            if (destino) {
              map.flyTo({
                center: [destino.lon, destino.lat],
                zoom: Math.max(map.getZoom(), 10),
                speed: 1.2,
              });
            }
          }}
          aria-label="Mi ubicación"
```

This removes the shortcut that skipped `onPedirUbicacion()` entirely whenever a cached point existed. Now every tap requests a fresh reading; if that reading fails (permission denied mid-session, timeout), it falls back to the last known `ubicacion.centro` instead of doing nothing.

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "fix(web): always fetch a fresh position from the Mi ubicación button"
```

---

### Task 3: Always re-fetch on Configuración open

**Files:**
- Modify: `apps/web/components/configuracion/ModalConfiguracion.tsx:105-127`

**Interfaces:**
- No prop/signature changes to `ModalConfiguracion` or `ModalConfiguracionContenido`.

- [ ] **Step 1: Remove `ubicacion.centro` from the skip condition**

In `apps/web/components/configuracion/ModalConfiguracion.tsx`, change:

```ts
  // Pide geolocalización solo si el modal está abierto y el usuario
  // desactivó "Mundial" — nunca de forma automática al montar la app.
  // `ubicacionFallo` evita reintentar en loop cuando el usuario ya rechazó
  // el permiso o el navegador no soporta geolocalización.
  useEffect(() => {
    if (
      !abierto ||
      mundialLocal ||
      ubicacion.centro ||
      pidiendoUbicacion ||
      ubicacionFallo
    ) {
      return;
    }
    setPidiendoUbicacion(true);
    onPedirUbicacion().then((centro) => {
      setPidiendoUbicacion(false);
      setUbicacionFallo(centro === null);
    });
  }, [
    abierto,
    mundialLocal,
    ubicacion.centro,
    pidiendoUbicacion,
    ubicacionFallo,
    onPedirUbicacion,
  ]);
```

to:

```ts
  // Pide una ubicación fresca cada vez que el modal se abre en modo no
  // "Mundial" — no solo la primera vez, para que un dispositivo que se
  // movió refleje su posición actual y no una guardada de otra sesión.
  // `ubicacionFallo` evita reintentar en loop cuando el usuario ya rechazó
  // el permiso o el navegador no soporta geolocalización en esta apertura.
  useEffect(() => {
    if (!abierto || mundialLocal || pidiendoUbicacion || ubicacionFallo) {
      return;
    }
    setPidiendoUbicacion(true);
    onPedirUbicacion().then((centro) => {
      setPidiendoUbicacion(false);
      setUbicacionFallo(centro === null);
    });
  }, [abierto, mundialLocal, pidiendoUbicacion, ubicacionFallo, onPedirUbicacion]);
```

- [ ] **Step 2: Show the last known position while a fresh one loads, instead of an empty state**

The mini-map block only renders `SelectorRadioMapa` when `!pidiendoUbicacion && ubicacion.centro` — since `pidiendoUbicacion` is now `true` on every open (not just the first), this would blank out the mini-map on every reopen for a fraction of a second even when a perfectly good last-known `ubicacion.centro` already exists. Change:

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
```

to:

```tsx
                {!mundialLocal && (
                  <div className="mt-3">
                    {pidiendoUbicacion && !ubicacion.centro && (
                      <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-800/50 text-xs text-neutral-400">
                        Buscando tu ubicación…
                      </div>
                    )}

                    {ubicacion.centro && (
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

                    {!pidiendoUbicacion && !ubicacion.centro && ubicacionFallo && (
                      <p className="mt-3 text-xs text-neutral-400">
                        No pudimos acceder a tu ubicación, así que las
                        notificaciones quedan sin límite de distancia.
                      </p>
                    )}
                  </div>
                )}
```

Now: if there's already a known `ubicacion.centro` (from a prior session or an earlier reading), the mini-map shows it immediately and silently updates in place once the fresh read resolves and `ubicacion.centro` changes — no loading flash. Only a user with no known position yet sees "Buscando tu ubicación…". The failure message only shows when there's truly no position at all (fresh attempt failed AND nothing cached).

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/configuracion/ModalConfiguracion.tsx
git commit -m "fix(web): re-fetch location on every Configuración open, not just the first"
```

---

### Task 4: End-to-end verification

**Files:**
- None — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-3.

- [ ] **Step 1: Full lint and type-check**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 2: Start the web dev server**

Run: `pnpm --filter web dev`
Expected: web on `:3000`.

- [ ] **Step 3: Open the app and grant geolocation permission once**

Using the claude-in-chrome browser tool: open `http://localhost:3000`. Use the browser's `javascript_tool` to inject a geolocation override BEFORE any click, so the test doesn't depend on the machine's real GPS/network location:

```js
let __callCount = 0;
navigator.geolocation.getCurrentPosition = (success) => {
  __callCount += 1;
  // Each call returns a different, clearly-distinguishable coordinate,
  // simulating the device having moved between calls.
  const puntos = [
    { latitude: -33.45, longitude: -70.66 }, // Santiago Centro
    { latitude: -33.02, longitude: -71.55 }, // Valparaíso
    { latitude: -36.83, longitude: -73.05 }, // Concepción
  ];
  const punto = puntos[(__callCount - 1) % puntos.length];
  success({ coords: { ...punto, accuracy: 10 } });
};
window.__geoCallCount = () => __callCount;
```

Grant the browser's real permission prompt if one appears when the app first calls geolocation (it may not, since we've overridden the function itself).

- [ ] **Step 4: Confirm the "📍 Mi ubicación" button re-fetches on every click, not just the first**

Click the "📍 Mi ubicación" button (the pin icon next to "Ver todo Chile"). Read `window.__geoCallCount()` via `javascript_tool` — expect `1`. Confirm the map flew to Santiago Centro (~-33.45, -70.66).

Click the same button again. Read `window.__geoCallCount()` again — expect `2` (proving the second click made a fresh call instead of reusing the cached point from the first click). Confirm the map flew to Valparaíso (~-33.02, -71.55) this time — a different location than the first click, which is only possible if the button actually re-requested the position instead of reusing `ubicacion.centro`.

- [ ] **Step 5: Confirm Configuración re-fetches on every open, not just the first**

Open the side menu, click "Notificaciones" to open Configuración with "🌎 Mundial, sin rango" toggled OFF (if it's currently on, toggle it off first and note the current `window.__geoCallCount()` value as the baseline). Wait for the mini-map to appear, then close the modal.

Read `window.__geoCallCount()` — note the value (should have incremented by 1 from the open).

Reopen Configuración (same non-mundial state). Read `window.__geoCallCount()` again — expect it to have incremented by 1 again from the previous reading, confirming the modal's effect fetched fresh on this second open too, not skipped because `ubicacion.centro` was already set.

- [ ] **Step 6: Confirm the failure fallback still works**

Using `javascript_tool`, override geolocation again to always fail:
```js
navigator.geolocation.getCurrentPosition = (_success, error) => {
  error({ code: 1, message: "denied" });
};
```
Click "📍 Mi ubicación" again. Expected: the map flies to the last successfully-fetched point from Step 4/5 (the fallback to `ubicacion.centro`), not a no-op — confirming Task 2's fallback logic works when a fresh read fails.

- [ ] **Step 7: Stop the dev server**

Stop the background dev server started in Step 2. Run: `git status --short`
Expected: clean (everything already committed in Tasks 1-3).
