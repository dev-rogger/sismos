# Invitar a instalar la app (agregar a inicio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invite browser users (not already running the PWA standalone) to add the app to their home screen — automatically after 45s of use, or any time via a new menu entry — with platform-specific copy (real "Instalar" button on Android/Chrome via `beforeinstallprompt`, manual instructions on iOS Safari where no such API exists), never blocking normal use.

**Architecture:** A single new hook, `useInstalarApp()`, owns all detection (standalone check, iOS UA sniff, `beforeinstallprompt`/`appinstalled` listeners), the 45s auto-show timer, and the 14-day dismiss cooldown (all via `localStorage`, same pattern as `useUbicacionUsuario`). A new `ModalInstalarApp` component renders platform-specific copy from that hook's state. `MenuLateral` gets a new conditional entry that opens the same modal manually. Everything mounts once in `MapaConHistorial.tsx`, mirroring how `ModalConfiguracion`/`useUbicacionUsuario` are already wired there.

**Tech Stack:** Next.js 16 App Router (`apps/web`), React hooks, `localStorage`, the `beforeinstallprompt`/`appinstalled` browser APIs.

## Global Constraints

- If the app is already running standalone (`display-mode: standalone` or iOS's legacy `navigator.standalone`), nothing shows automatically or manually — no timer, no listeners, no menu entry.
- The world-scope-style automatic modal only appears once per session flow: 45 seconds after mount, only if a real install path exists (`beforeinstallprompt` captured, or iOS Safari detected) and the 14-day dismiss cooldown (`localStorage: sismos:instalar-dismiss`) and "already installed" flag (`localStorage: sismos:instalada`) both allow it.
- Do not add a new UI toggle/modal component library — reuse the existing overlay pattern (`useOverlayAccesible`, the fade+scale `ModalConfiguracion`-style markup) and the hand-written inline-SVG icon convention already used in `MenuLateral.tsx`.
- Copy must stay honest: never claim installation is required, and the iOS copy should mention that push notifications specifically depend on it (this is factually true for this app, already documented in the push-notifications specs).
- Every edited/created file in `apps/web` must pass `pnpm --filter web check-types` and `pnpm --filter web lint`.
- No automated test suite exists in this repo — verification is manual, via a browser script that simulates `beforeinstallprompt`, standalone mode, and iOS UA, since these can't be reliably triggered organically on localhost.

---

### Task 1: `useInstalarApp` hook

**Files:**
- Create: `apps/web/lib/use-instalar-app.ts`

**Interfaces:**
- Produces: `useInstalarApp()` returning `{ puedeInstalar: boolean; plataforma: "android" | "ios" | null; visible: boolean; instalar: () => Promise<void>; descartar: () => void; abrirManual: () => void }` — consumed by Task 2 (`ModalInstalarApp` props) and Task 3 (`MenuLateral`/`MapaConHistorial` wiring).

- [ ] **Step 1: Create the hook**

Create `apps/web/lib/use-instalar-app.ts`:

```ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CLAVE_DISMISS = "sismos:instalar-dismiss";
const CLAVE_INSTALADA = "sismos:instalada";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 días
const AUTO_SHOW_DELAY_MS = 45 * 1000;

type Plataforma = "android" | "ios" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function estaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function yaFueInstalada(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_INSTALADA) === "true";
  } catch {
    return false;
  }
}

function dentroDeCooldown(): boolean {
  try {
    const raw = window.localStorage.getItem(CLAVE_DISMISS);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (Number.isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function marcarInstalada(): void {
  try {
    window.localStorage.setItem(CLAVE_INSTALADA, "true");
  } catch {
    // localStorage puede fallar (Safari privado, cuota excedida); no
    // bloquea el resto del flujo, solo no persiste la preferencia.
  }
}

export function useInstalarApp() {
  const [puedeInstalar, setPuedeInstalar] = useState(false);
  const [plataforma, setPlataforma] = useState<Plataforma>(null);
  const [visible, setVisible] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (estaStandalone()) return;

    if (esIOS()) {
      setPlataforma("ios");
      setPuedeInstalar(true);
    }

    const manejarBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setPlataforma("android");
      setPuedeInstalar(true);
    };

    const manejarAppInstalled = () => {
      marcarInstalada();
      setVisible(false);
      setPuedeInstalar(false);
    };

    window.addEventListener("beforeinstallprompt", manejarBeforeInstallPrompt);
    window.addEventListener("appinstalled", manejarAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        manejarBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", manejarAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!puedeInstalar || dentroDeCooldown() || yaFueInstalada()) return;
    const timer = window.setTimeout(() => setVisible(true), AUTO_SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [puedeInstalar]);

  const instalar = useCallback(async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPromptRef.current = null;
    if (outcome === "accepted") {
      marcarInstalada();
      setVisible(false);
      setPuedeInstalar(false);
    }
  }, []);

  const descartar = useCallback(() => {
    try {
      window.localStorage.setItem(CLAVE_DISMISS, String(Date.now()));
    } catch {
      // localStorage puede fallar; el modal igual se cierra en memoria.
    }
    setVisible(false);
  }, []);

  const abrirManual = useCallback(() => {
    setVisible(true);
  }, []);

  return { puedeInstalar, plataforma, visible, instalar, descartar, abrirManual };
}
```

Note on `marcarInstalada()` also setting `puedeInstalar: false` inside `manejarAppInstalled`/`instalar`: the spec doesn't say this explicitly, but it follows directly from the stated intent ("si no hay ningún camino de instalación disponible... no se muestra nada") — right after a successful install there's no more install path to offer for the rest of that session, so the menu entry (gated on `puedeInstalar`) correctly disappears without a page reload.

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/use-instalar-app.ts
git commit -m "feat(web): add useInstalarApp hook for the PWA install prompt"
```

---

### Task 2: `ModalInstalarApp` component

**Files:**
- Create: `apps/web/components/instalar/ModalInstalarApp.tsx`

**Interfaces:**
- Consumes: `visible`, `plataforma`, `instalar`, `descartar` shape from Task 1's `useInstalarApp()` (passed as props, not called directly inside this component).
- Produces: `ModalInstalarApp` component with props `{ visible: boolean; plataforma: "android" | "ios" | null; onInstalar: () => void; onDescartar: () => void }`, consumed by Task 3.

- [ ] **Step 1: Create the modal**

Create `apps/web/components/instalar/ModalInstalarApp.tsx`:

```tsx
"use client";

import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface ModalInstalarAppProps {
  visible: boolean;
  plataforma: "android" | "ios" | null;
  onInstalar: () => void;
  onDescartar: () => void;
}

export default function ModalInstalarApp({
  visible,
  plataforma,
  onInstalar,
  onDescartar,
}: ModalInstalarAppProps) {
  useOverlayAccesible(visible, onDescartar);

  return (
    <div
      aria-hidden={!visible}
      onClick={onDescartar}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-200 motion-reduce:transition-none ${
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Instalar app"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          visible ? "scale-100" : "scale-95"
        }`}
      >
        <h2 className="mb-3 text-base font-semibold text-neutral-100">
          Instalá la app
        </h2>

        {plataforma === "ios" ? (
          <>
            <p className="text-sm text-neutral-400">
              Tocá el ícono Compartir (⬆️) en la barra del navegador y elegí
              &quot;Agregar a inicio&quot;. En iPhone las notificaciones de
              sismos solo funcionan así — y en general se siente como una app
              real, a pantalla completa.
            </p>
            <button
              type="button"
              onClick={onDescartar}
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600"
            >
              Entendido
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              Agregá Sismos a tu pantalla de inicio: se abre a pantalla
              completa, con su propio ícono, y se siente como una app real.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onDescartar}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={onInstalar}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-sky-500 bg-sky-500/10 px-3 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
              >
                Instalar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Same visual pattern as `ModalConfiguracion.tsx` (fade+scale overlay, `role="dialog"`, backdrop click closes via the outer `onClick`/inner `stopPropagation`), so it looks consistent with the rest of the app without introducing new patterns.

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/instalar/ModalInstalarApp.tsx
git commit -m "feat(web): add ModalInstalarApp with platform-specific install copy"
```

---

### Task 3: Wire into the menu and mount the modal

**Files:**
- Modify: `apps/web/components/menu/MenuLateral.tsx`
- Modify: `apps/web/components/MapaConHistorial.tsx`

**Interfaces:**
- Consumes: `useInstalarApp()` from Task 1, `ModalInstalarApp` from Task 2.
- Produces: `MenuLateral` gains `puedeInstalarApp: boolean` and `onAbrirInstalarApp: () => void` props.

- [ ] **Step 1: Add the menu entry**

In `apps/web/components/menu/MenuLateral.tsx`, add a new icon function after `IconoNotificaciones` (around line 61):

```tsx
function IconoInstalar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}
```

Change the props interface from:

```ts
interface MenuLateralProps {
  onAbrirHistorial: () => void;
  onAbrirFallas: () => void;
  onAbrirNotificaciones: () => void;
}
```

to:

```ts
interface MenuLateralProps {
  onAbrirHistorial: () => void;
  onAbrirFallas: () => void;
  onAbrirNotificaciones: () => void;
  puedeInstalarApp: boolean;
  onAbrirInstalarApp: () => void;
}
```

Change the component signature from:

```tsx
export default function MenuLateral({
  onAbrirHistorial,
  onAbrirFallas,
  onAbrirNotificaciones,
}: MenuLateralProps) {
```

to:

```tsx
export default function MenuLateral({
  onAbrirHistorial,
  onAbrirFallas,
  onAbrirNotificaciones,
  puedeInstalarApp,
  onAbrirInstalarApp,
}: MenuLateralProps) {
```

Change the nav's closing section from:

```tsx
          <button
            type="button"
            onClick={() => elegir(onAbrirNotificaciones)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoNotificaciones />
            Notificaciones
          </button>
        </nav>
```

to:

```tsx
          <button
            type="button"
            onClick={() => elegir(onAbrirNotificaciones)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoNotificaciones />
            Notificaciones
          </button>
          {puedeInstalarApp && (
            <button
              type="button"
              onClick={() => elegir(onAbrirInstalarApp)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoInstalar />
              Instalar app
            </button>
          )}
        </nav>
```

- [ ] **Step 2: Wire the hook and modal into MapaConHistorial**

In `apps/web/components/MapaConHistorial.tsx`, change the imports from:

```tsx
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import { useFiltroMapa } from "../lib/use-filtro-mapa";
import { useUbicacionUsuario } from "../lib/use-ubicacion-usuario";
```

to:

```tsx
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import ModalInstalarApp from "./instalar/ModalInstalarApp";
import { useFiltroMapa } from "../lib/use-filtro-mapa";
import { useUbicacionUsuario } from "../lib/use-ubicacion-usuario";
import { useInstalarApp } from "../lib/use-instalar-app";
```

Add the hook call, right after the existing `useUbicacionUsuario()` call:

```tsx
  const { ubicacion, pedirUbicacion, setRadioKm } = useUbicacionUsuario();
  const {
    puedeInstalar,
    plataforma,
    visible: instalarVisible,
    instalar,
    descartar,
    abrirManual,
  } = useInstalarApp();
```

Change the `<MenuLateral>` element from:

```tsx
      <MenuLateral
        onAbrirHistorial={() => setHistorialAbierto(true)}
        onAbrirFallas={() => setPantallaFallasAbierta(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
      />
```

to:

```tsx
      <MenuLateral
        onAbrirHistorial={() => setHistorialAbierto(true)}
        onAbrirFallas={() => setPantallaFallasAbierta(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
        puedeInstalarApp={puedeInstalar}
        onAbrirInstalarApp={abrirManual}
      />
```

Add `<ModalInstalarApp>` right after the existing `<ModalConfiguracion>` element, before the closing `</>`:

```tsx
      <ModalConfiguracion
        abierto={notificacionesAbiertas}
        onCerrar={() => setNotificacionesAbiertas(false)}
        ubicacion={ubicacion}
        onPedirUbicacion={pedirUbicacion}
        onSetRadioKm={setRadioKm}
      />
      <ModalInstalarApp
        visible={instalarVisible}
        plataforma={plataforma}
        onInstalar={instalar}
        onDescartar={descartar}
      />
```

- [ ] **Step 3: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/menu/MenuLateral.tsx apps/web/components/MapaConHistorial.tsx
git commit -m "feat(web): wire the install-app prompt into the menu and map screen"
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

`beforeinstallprompt` only fires organically under Chrome's own engagement heuristics, which won't trigger reliably on a fresh localhost session — so this verification injects synthetic events via the browser's `javascript_tool` instead of waiting for the real one, same approach used for the geolocation-override tests in `docs/superpowers/plans/2026-08-10-fix-geolocalizacion-en-vivo.md`.

- [ ] **Step 3: Android/Chrome path — synthetic `beforeinstallprompt`, auto-show timer, and Instalar flow**

Using the claude-in-chrome browser tool: open `http://localhost:3000`. Before injecting anything, open the side menu and confirm "Instalar app" is ABSENT — a plain Chrome session on localhost doesn't fire `beforeinstallprompt` without real engagement signals, so this also covers the spec's "no install path available" case (e.g. Firefox desktop would behave the same way: no event, non-iOS, so `puedeInstalar` stays `false`). Close the menu, then inject via `javascript_tool`:

```js
class SimulatedBeforeInstallPrompt extends Event {
  constructor() {
    super("beforeinstallprompt", { cancelable: true });
  }
  prompt() {
    window.__promptCalled = true;
    return Promise.resolve();
  }
  get userChoice() {
    return Promise.resolve({ outcome: "accepted" });
  }
}
window.dispatchEvent(new SimulatedBeforeInstallPrompt());
"dispatched";
```

Expected: no visible change yet (modal only auto-shows after 45s). Open the side menu (hamburger icon) — expect a new "Instalar app" entry to be present (proves `puedeInstalar` became `true` from the synthetic event). Close the menu.

Wait 45 seconds (`computer` action `wait`, called multiple times if it exceeds the single-call max), then take a screenshot. Expected: `ModalInstalarApp` is now visible with the Android copy ("Agregá Sismos a tu pantalla de inicio...") and both "Ahora no"/"Instalar" buttons.

Click "Instalar". Read `window.__promptCalled` via `javascript_tool` — expect `true` (proves `deferredPrompt.prompt()` was actually called). Expected: the modal closes (since the mocked `userChoice` resolves `"accepted"`).

Reload the page (`navigate` to the same URL). Open the side menu again — expect NO "Instalar app" entry this time (proves `sismos:instalada` was persisted to `localStorage` and gates `puedeInstalar` correctly... note: per Task 1's design, `marcarInstalada()` only affects the auto-show timer's gate and the in-memory `puedeInstalar` set to `false` after accepting, but on a fresh reload `puedeInstalar` starts `false` again and only flips `true` if a NEW `beforeinstallprompt` fires — since this is a synthetic one-off event from Step 3 that won't refire automatically on reload, the entry's absence here also confirms this, not just the `sismos:instalada` flag. This is expected either way.).

- [ ] **Step 4: Dismiss + cooldown**

Using `javascript_tool`, clear prior state and start fresh:
```js
localStorage.removeItem("sismos:instalada");
localStorage.removeItem("sismos:instalar-dismiss");
"cleared";
```
Reload the page. Re-inject the synthetic `beforeinstallprompt` event from Step 3. Wait 45 seconds. Expected: the modal appears again (confirms clearing `localStorage` re-enabled the auto-show).

Click "Ahora no". Expected: modal closes. Verify via `javascript_tool`: `localStorage.getItem("sismos:instalar-dismiss")` returns a non-null timestamp string.

Reload the page, re-inject the synthetic event, wait 45 seconds again. Expected: the modal does NOT auto-appear this time (cooldown active) — but opening the side menu still shows "Instalar app", and clicking it manually opens the modal immediately (proves `abrirManual()` bypasses the cooldown as designed).

- [ ] **Step 5: iOS path**

Using `javascript_tool`, clear state and simulate iOS Safari:
```js
localStorage.removeItem("sismos:instalada");
localStorage.removeItem("sismos:instalar-dismiss");
Object.defineProperty(window.navigator, "userAgent", {
  value:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
  configurable: true,
});
"ios ua set";
```
Reload the page (the UA override must be re-applied after reload since it doesn't persist — reload first, THEN re-run the `Object.defineProperty` script before any further interaction, then optionally re-navigate to force effects to re-run, or simply reload once, immediately run the override script, and manually trigger a fresh mount by navigating again to be safe).

Open the side menu — expect "Instalar app" present (from `esIOS()` detection, no `beforeinstallprompt` needed). Wait 45 seconds. Expected: modal appears with the iOS copy ("Tocá el ícono Compartir...") and only an "Entendido" button, no "Instalar" button. Click "Entendido" — modal closes without calling any prompt.

- [ ] **Step 6: Standalone mode suppresses everything**

Using `javascript_tool`, restore a normal UA and simulate standalone mode:
```js
delete window.navigator.userAgent; // reverts the earlier override (own-property)
window.matchMedia = ((original) => (query) =>
  query === "(display-mode: standalone)"
    ? { matches: true, media: query, addListener() {}, removeListener() {} }
    : original(query))(window.matchMedia.bind(window));
"standalone forced";
```
Reload the page. Open the side menu — expect NO "Instalar app" entry. Wait 45 seconds — expect no modal ever appears. This confirms `estaStandalone()` suppresses the entire feature.

- [ ] **Step 7: Clean up**

Using `javascript_tool`: `localStorage.removeItem("sismos:instalada"); localStorage.removeItem("sismos:instalar-dismiss");` to leave the dev database/localStorage clean for future sessions.

Stop the dev server. Run: `git status --short`
Expected: clean (everything already committed in Tasks 1-3).
