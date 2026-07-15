# Mobile-Responsive PWA Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `apps/web` production-ready as a mobile PWA before Vercel deploy — real home-screen icons, safe-area-aware layout, and bigger tap targets — without touching the existing mobile-first layout structure that already works.

**Architecture:** Generate PWA icon PNGs from hand-written SVG sources via a temporary `sharp` script, wire them into `manifest.json` and the Next.js `app/apple-icon.png` convention, add `env(safe-area-inset-*)` handling via inline styles (no Tailwind plugin needed for two usages), and widen touch targets on specific buttons/markers identified in the design spec.

**Tech Stack:** Next.js 16 App Router, Tailwind v4, maplibre-gl, sharp (temporary, dev-only, removed after icon generation).

## Global Constraints

- Scope is "fixes críticos" only — do NOT add `md:` breakpoints or a drag-gesture bottom sheet (explicitly out of scope per `docs/superpowers/specs/2026-07-15-mobile-responsive-pwa-design.md`).
- Icon visual: seismic waveform, stroke `#f97316`, on `#0a0a0a` background — matches `colorPorMagnitud` mid-magnitude color and existing `theme_color`/`background_color`.
- Do not change `tamanoPorMagnitud` visual dot sizes (14/20/28/36px) — only add an invisible tap-target wrapper around the existing dot.
- `sharp` is added as a devDependency only to generate icons once, then removed from `package.json` — it must not remain a project dependency.
- Use inline `style={{ ... }}` for `env(safe-area-inset-*)`, not a new Tailwind plugin.
- Every edited file must still pass `pnpm --filter web lint` and `pnpm --filter web check-types`.

---

### Task 1: Generate PWA icon assets

**Files:**
- Create (generated, committed): `apps/web/public/icons/icon-192.png`
- Create (generated, committed): `apps/web/public/icons/icon-512.png`
- Create (generated, committed): `apps/web/public/icons/icon-maskable-512.png`
- Create (generated, committed): `apps/web/app/apple-icon.png`
- Temporary (not committed): a generation script, removed after use; `sharp` devDependency, removed after use

**Interfaces:**
- Produces: 4 PNG files at fixed paths, consumed by Task 2 (`manifest.json`) and Next.js's automatic `apple-icon.png` file convention (no code references it directly).

- [ ] **Step 1: Add sharp as a temporary devDependency**

Run: `pnpm add -D -w sharp`
Expected: `package.json` at repo root gains `sharp` under `devDependencies`; exits 0.

- [ ] **Step 2: Write the generation script**

Create `/private/tmp/claude-501/-Users-rodrigoguerrero-Sites-sismos/2cc30bea-3ac2-4cad-9f15-3c07cb312396/scratchpad/generate-icons.mjs`:

```js
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <path d="M 76 256 L 166 256 L 196 166 L 256 346 L 316 136 L 346 256 L 436 256" fill="none" stroke="#f97316" stroke-width="28" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const MASKABLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0a0a0a"/>
  <path d="M 144 256 L 200 256 L 219 200 L 256 312 L 293 182 L 312 256 L 368 256" fill="none" stroke="#f97316" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

await mkdir("apps/web/public/icons", { recursive: true });

await sharp(Buffer.from(ICON_SVG))
  .resize(192, 192)
  .png()
  .toFile("apps/web/public/icons/icon-192.png");

await sharp(Buffer.from(ICON_SVG))
  .resize(512, 512)
  .png()
  .toFile("apps/web/public/icons/icon-512.png");

await sharp(Buffer.from(MASKABLE_SVG))
  .resize(512, 512)
  .png()
  .toFile("apps/web/public/icons/icon-maskable-512.png");

await sharp(Buffer.from(ICON_SVG))
  .resize(180, 180)
  .png()
  .toFile("apps/web/app/apple-icon.png");

console.log("icons generated");
```

- [ ] **Step 3: Run the script from the repo root**

Run: `node /private/tmp/claude-501/-Users-rodrigoguerrero-Sites-sismos/2cc30bea-3ac2-4cad-9f15-3c07cb312396/scratchpad/generate-icons.mjs`
Expected: prints `icons generated`, exit code 0. Verify with `file apps/web/public/icons/*.png apps/web/app/apple-icon.png` — each line should report a PNG image with the expected dimensions (192x192, 512x512, 512x512, 180x180).

- [ ] **Step 4: Remove the temporary sharp devDependency**

Run: `pnpm remove -D -w sharp`
Expected: `sharp` no longer appears in root `package.json`; exits 0.

- [ ] **Step 5: Commit the generated icons**

```bash
git add apps/web/public/icons apps/web/app/apple-icon.png package.json pnpm-lock.yaml
git commit -m "feat: add PWA home-screen icons"
```

---

### Task 2: Wire icons into manifest.json

**Files:**
- Modify: `apps/web/public/manifest.json`

**Interfaces:**
- Consumes: the 3 icon PNGs from Task 1 (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`).

- [ ] **Step 1: Replace the empty icons array**

Change `apps/web/public/manifest.json` from:

```json
{
  "name": "Sismos",
  "short_name": "Sismos",
  "description": "Sismos de Chile y el mundo en tiempo real",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": []
}
```

to:

```json
{
  "name": "Sismos",
  "short_name": "Sismos",
  "description": "Sismos de Chile y el mundo en tiempo real",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#0a0a0a",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Validate JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/web/public/manifest.json'))"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/public/manifest.json
git commit -m "feat: register PWA icons in manifest.json"
```

---

### Task 3: Enable safe-area on the viewport

**Files:**
- Modify: `apps/web/app/layout.tsx:10-12`

**Interfaces:**
- Produces: real (non-zero) values for `env(safe-area-inset-*)` on iOS, consumed by Tasks 4 and 5.

- [ ] **Step 1: Add viewportFit to the viewport export**

In `apps/web/app/layout.tsx`, change:

```ts
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};
```

to:

```ts
export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  viewportFit: "cover",
};
```

- [ ] **Step 2: Verify types**

Run: `pnpm --filter web check-types`
Expected: exits 0, no type errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat: enable viewport-fit cover for safe-area support"
```

---

### Task 4: Safe-area padding on the historial bottom sheet

**Files:**
- Modify: `apps/web/components/historial/PanelHistorial.tsx:79-84`

**Interfaces:**
- Consumes: `viewportFit: "cover"` from Task 3 (without it, this padding is always 0).

- [ ] **Step 1: Add inline safe-area padding to the sheet container**

In `apps/web/components/historial/PanelHistorial.tsx`, change:

```tsx
  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[80vh] flex-col rounded-t-2xl bg-neutral-900 shadow-lg transition-transform duration-300 lg:static lg:h-full lg:max-h-none lg:w-[360px] lg:translate-y-0 lg:rounded-none lg:border-l lg:border-neutral-800 lg:shadow-none lg:transition-none ${
        expandido ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
      }`}
    >
```

to:

```tsx
  return (
    <div
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[80vh] flex-col rounded-t-2xl bg-neutral-900 shadow-lg transition-transform duration-300 lg:static lg:h-full lg:max-h-none lg:w-[360px] lg:translate-y-0 lg:rounded-none lg:border-l lg:border-neutral-800 lg:shadow-none lg:transition-none ${
        expandido ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
      }`}
    >
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/historial/PanelHistorial.tsx
git commit -m "feat: add safe-area padding to historial bottom sheet"
```

---

### Task 5: Safe-area offset and bigger tap target for "Ver todo Chile" button

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx:193-205`

**Interfaces:**
- Consumes: `viewportFit: "cover"` from Task 3.

- [ ] **Step 1: Update the button's positioning and sizing**

In `apps/web/components/mapa/MapaSismos.tsx`, change:

```tsx
      <button
        type="button"
        onClick={() =>
          mapRef.current?.flyTo({
            center: CHILE_CENTER,
            zoom: CHILE_ZOOM,
            speed: 1.2,
          })
        }
        className="absolute top-3 right-3 z-10 rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        Ver todo Chile
      </button>
```

to:

```tsx
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
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat: widen tap target and add safe-area offset to map reset button"
```

---

### Task 6: Bigger tap target for "Solo Chile" toggle

**Files:**
- Modify: `apps/web/components/historial/PanelHistorial.tsx:115-126`

**Interfaces:**
- None beyond this file — self-contained style change.

- [ ] **Step 1: Update the toggle button's classes**

In `apps/web/components/historial/PanelHistorial.tsx`, change:

```tsx
          <button
            type="button"
            onClick={() => onSoloChileChange(!soloChile)}
            aria-pressed={soloChile}
            className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
              soloChile
                ? "border-sky-500 bg-sky-500/10 text-sky-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            🇨🇱 Solo Chile
          </button>
```

to:

```tsx
          <button
            type="button"
            onClick={() => onSoloChileChange(!soloChile)}
            aria-pressed={soloChile}
            className={`flex min-h-11 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
              soloChile
                ? "border-sky-500 bg-sky-500/10 text-sky-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            🇨🇱 Solo Chile
          </button>
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/historial/PanelHistorial.tsx
git commit -m "feat: widen tap target for Solo Chile toggle"
```

---

### Task 7: Invisible tap-target wrapper for map markers

**Files:**
- Modify: `apps/web/components/mapa/marcador.ts`

**Interfaces:**
- Produces: `crearElementoMarcador` still returns an `HTMLDivElement` (same signature) — callers in `apps/web/components/mapa/MapaSismos.tsx` (`crearMarcador`, which does `el.addEventListener("click", ...)` then passes `el` to `new maplibregl.Marker({ element: el })`) need no changes, since maplibregl centers the marker on whatever element it's given.

- [ ] **Step 1: Wrap the colored dot in a minimum-size tap-target container**

Replace the full contents of `apps/web/components/mapa/marcador.ts`:

```ts
import { colorPorMagnitud, tamanoPorMagnitud } from "../../lib/magnitud";

const TAP_TARGET_MIN_PX = 28;

export function crearElementoMarcador(
  magnitud: number,
  opciones: { pulsando: boolean },
): HTMLDivElement {
  const size = tamanoPorMagnitud(magnitud);
  const color = colorPorMagnitud(magnitud);
  const tapSize = Math.max(size, TAP_TARGET_MIN_PX);

  const wrapper = document.createElement("div");
  wrapper.style.width = `${tapSize}px`;
  wrapper.style.height = `${tapSize}px`;
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";

  const dot = document.createElement("div");
  dot.className = opciones.pulsando
    ? "marcador-sismo marcador-sismo--pulso"
    : "marcador-sismo";
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.backgroundColor = color;
  dot.style.borderRadius = "50%";
  dot.style.border = "2px solid rgba(255, 255, 255, 0.8)";

  wrapper.appendChild(dot);
  return wrapper;
}

export function crearElementoSeleccion(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-seleccion";
  return el;
}
```

- [ ] **Step 2: Verify types and lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: both exit 0.

- [ ] **Step 3: Manually verify the pulse animation still targets the dot, not the wrapper**

Run: `grep -n "marcador-sismo--pulso" apps/web/app/globals.css apps/web/components/mapa/marcador.ts`
Expected: `globals.css` shows the `::before` rule using `background-color: inherit`, and `marcador.ts` shows the class applied to `dot` (not `wrapper`) — confirms the pulse still inherits color from the dot element itself, unaffected by the new wrapper.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/mapa/marcador.ts
git commit -m "feat: add invisible tap-target padding to map markers"
```

---

### Task 8: End-to-end verification

**Files:**
- None — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Full lint and type-check across the web app**

Run: `pnpm --filter web lint && pnpm --filter web check-types`
Expected: both exit 0.

- [ ] **Step 2: Start the dev server**

Run: `pnpm --filter web dev` (background)
Expected: Next.js reports `Ready` on `http://localhost:3000`.

- [ ] **Step 3: Verify the 4 icon files are served correctly**

Run:
```bash
curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/icons/icon-192.png
curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/icons/icon-512.png
curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/icons/icon-maskable-512.png
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/apple-icon.png
```
Expected: `200 200 200 200`

- [ ] **Step 4: Verify manifest.json serves the icons array**

Run: `curl -s http://localhost:3000/manifest.json | node -e "const d=JSON.parse(require('fs').readFileSync(0)); if(d.icons.length!==3) throw new Error('expected 3 icons, got '+d.icons.length); console.log('ok:', d.icons.map(i=>i.sizes).join(', '))"`
Expected: `ok: 192x192, 512x512, 512x512`

- [ ] **Step 5: Visual check in a mobile viewport with a notch**

Using the claude-in-chrome browser tool: navigate to `http://localhost:3000`, resize/emulate an iPhone-with-notch viewport (e.g. via device toolbar sizing, ~393×852), and screenshot:
- the collapsed bottom sheet handle is fully visible and not clipped at the bottom edge
- the "Ver todo Chile" button is not flush against the very top edge (should have visible clearance)
- tap the "Solo Chile" toggle and a small-magnitude marker to confirm both register a click reliably

Expected: no visual overlap/clipping; both taps register (map flies / list filters).

- [ ] **Step 6: Stop the dev server**

Stop the background `pnpm --filter web dev` process.

- [ ] **Step 7: Final status check**

Run: `git status --short`
Expected: clean (everything already committed in Tasks 1-7).
