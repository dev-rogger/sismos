# Sismos Monorepo Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the `sismos` Turborepo monorepo (apps/web, apps/ingestor, packages/db, packages/shared, plus shared eslint/typescript config packages) with no business logic — only structure, tooling, and typed stubs, per the approved design spec.

**Architecture:** pnpm workspaces + Turborepo. `create-turbo@latest` generates the root + a base Next.js app + shared config packages in a throwaway sibling directory; we cherry-pick and rename what we need into the real project, then hand-write `apps/ingestor`, `packages/db`, and `packages/shared` (which create-turbo doesn't generate) to match the spec. Both apps are Next.js 16 (App Router) so they share the same build/lint/typecheck pipeline via Turborepo; `apps/ingestor` has no pages, only a route handler.

**Tech Stack:** TypeScript, Next.js 16.2.0, React 19.2.x, Tailwind CSS 4.3.2, Serwist 9.5.11 (PWA), Mongoose 9.7.4, ESLint 9.39.1 (flat config), Prettier 3.7.4, pnpm 10.33.0, Turborepo 2.10.4, Node 24.

## Global Constraints

- Package manager: pnpm only (no npm/yarn/bun lockfiles).
- Node version floor: >=24 (`.nvmrc` = `24`, `engines.node` = `>=24` in every package.json that has one).
- No business logic: no real Mongo schemas, no real CSN/USGS fetch calls, no dedupe, no map, no push notifications. Every such function is a typed stub that throws or returns a placeholder, marked with a `TODO` comment.
- No new external dependencies beyond what's listed in this plan (no map library, no testing framework, no state management library) — those are explicitly deferred per the spec.
- Workspace package scope: `@sismos/*`.
- Every workspace package/app that runs code needs `lint` and `check-types` npm scripts so `turbo run lint` / `turbo run check-types` cover it.
- Spec reference: `docs/superpowers/specs/2026-07-07-sismos-monorepo-design.md` — do not contradict decisions recorded there without checking with the user first.

---

### Task 1: Root Turborepo scaffold + shared config packages

**Files:**
- Create (via create-turbo, then moved): `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `packages/eslint-config/*`, `packages/typescript-config/*`
- Create: `.npmrc`, `.nvmrc`
- Modify: `README.md` (already exists as a stray default if any; otherwise create)

**Interfaces:**
- Produces: workspace package `@sismos/eslint-config` exporting `./base` (array `config`) and `./next-js` (array `nextJsConfig`, which spreads `./base` and adds Next/React rules).
- Produces: workspace package `@sismos/typescript-config` exporting `base.json` (strict TS base) and `nextjs.json` (extends `base.json`, adds Next plugin + bundler resolution).
- Produces: root scripts `build`, `dev`, `lint`, `format`, `check-types` that fan out via `turbo run <task>` to every workspace package that defines that script.

- [ ] **Step 1: Make sure Node 24 is available and active**

```bash
nvm install 24
nvm use 24
node -v
```

Expected: prints `v24.x.x`.

- [ ] **Step 2: Scaffold a throwaway Turborepo starter next to the real project**

```bash
cd /Users/rodrigoguerrero/Sites
pnpm dlx create-turbo@latest sismos-scaffold-tmp -m pnpm --skip-install
```

Expected: output ends with `>>> Success! Created your Turborepo at sismos-scaffold-tmp` and lists `apps/docs`, `apps/web`, `packages/eslint-config`, `packages/typescript-config`, `packages/ui`.

- [ ] **Step 3: Strip out the pieces we don't want from the scaffold**

```bash
cd /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp
rm -rf .git apps/docs packages/ui packages/typescript-config/react-library.json packages/eslint-config/react-internal.js
```

- [ ] **Step 4: Move the pieces we do want into the real project**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps /Users/rodrigoguerrero/Sites/sismos/packages
mv /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp/apps/web /Users/rodrigoguerrero/Sites/sismos/apps/web
mv /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp/packages/eslint-config /Users/rodrigoguerrero/Sites/sismos/packages/eslint-config
mv /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp/packages/typescript-config /Users/rodrigoguerrero/Sites/sismos/packages/typescript-config
mv /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp/package.json /Users/rodrigoguerrero/Sites/sismos/package.json
mv /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp/pnpm-workspace.yaml /Users/rodrigoguerrero/Sites/sismos/pnpm-workspace.yaml
mv /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp/turbo.json /Users/rodrigoguerrero/Sites/sismos/turbo.json
rm -rf /Users/rodrigoguerrero/Sites/sismos-scaffold-tmp
```

- [ ] **Step 5: Rewrite the root `package.json`**

Replace `/Users/rodrigoguerrero/Sites/sismos/package.json` with:

```json
{
  "name": "sismos",
  "private": true,
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "format": "prettier --write \"**/*.{ts,tsx,md}\"",
    "check-types": "turbo run check-types"
  },
  "devDependencies": {
    "prettier": "^3.7.4",
    "turbo": "^2.10.4",
    "typescript": "5.9.2"
  },
  "packageManager": "pnpm@10.33.0",
  "engines": {
    "node": ">=24"
  }
}
```

- [ ] **Step 6: Add `.npmrc` and `.nvmrc`**

`/Users/rodrigoguerrero/Sites/sismos/.npmrc`:

```
auto-install-peers=true
```

`/Users/rodrigoguerrero/Sites/sismos/.nvmrc`:

```
24
```

- [ ] **Step 7: Rename the `@repo/*` scope to `@sismos/*` in the config packages**

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/typescript-config/package.json` with:

```json
{
  "name": "@sismos/typescript-config",
  "version": "0.0.0",
  "private": true,
  "license": "MIT",
  "publishConfig": {
    "access": "public"
  }
}
```

Replace `/Users/rodrigoguerrero/Sites/sismos/packages/eslint-config/package.json` with:

```json
{
  "name": "@sismos/eslint-config",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "exports": {
    "./base": "./base.js",
    "./next-js": "./next.js"
  },
  "devDependencies": {
    "@eslint/js": "^9.39.1",
    "@next/eslint-plugin-next": "^16.2.0",
    "eslint": "^9.39.1",
    "eslint-config-prettier": "^10.1.1",
    "eslint-plugin-only-warn": "^1.1.0",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^5.2.0",
    "eslint-plugin-turbo": "^2.7.1",
    "globals": "^16.5.0",
    "typescript": "^5.9.2",
    "typescript-eslint": "^8.50.0"
  }
}
```

Leave `packages/eslint-config/base.js`, `packages/eslint-config/next.js`, `packages/typescript-config/base.json`, and `packages/typescript-config/nextjs.json` exactly as generated — they contain no `@repo` references.

- [ ] **Step 8: Write the root `README.md`**

Replace `/Users/rodrigoguerrero/Sites/sismos/README.md` with:

```markdown
# sismos

PWA gratuita e informativa que muestra sismos de Chile (CSN) y del mundo (USGS) en un mapa en tiempo real, con historial y notificaciones.

## Estructura

- `apps/web` — Next.js 16 App Router, PWA instalable
- `apps/ingestor` — Function serverless en Vercel que consulta CSN + USGS y guarda los eventos
- `packages/db` — Conexión y modelos de MongoDB (Mongoose)
- `packages/shared` — Tipos compartidos y normalización de datos entre fuentes
- `packages/eslint-config`, `packages/typescript-config` — configuración compartida

## Desarrollo

\`\`\`bash
nvm use
pnpm install
pnpm dev
\`\`\`

Ver `docs/superpowers/specs/` para las decisiones de diseño.
```

- [ ] **Step 9: Verify the structure**

```bash
find /Users/rodrigoguerrero/Sites/sismos -maxdepth 3 -not -path '*/node_modules/*' -not -path '*/.git/*' | sort
cat /Users/rodrigoguerrero/Sites/sismos/package.json
```

Expected: shows `apps/web/...`, `packages/eslint-config/{base.js,next.js,package.json}`, `packages/typescript-config/{base.json,nextjs.json,package.json}`, `docs/...`, plus the root files from steps 5-8. No `apps/docs`, no `packages/ui`, no `react-library.json`, no `react-internal.js`.

- [ ] **Step 10: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add package.json pnpm-workspace.yaml turbo.json .npmrc .nvmrc README.md apps/web packages/eslint-config packages/typescript-config
git commit -m "feat: scaffold turborepo root and shared config packages"
```

---

### Task 2: `packages/shared` — types + normalization stubs

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/eslint.config.js`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/normalize/csn.ts`
- Create: `packages/shared/src/normalize/usgs.ts`
- Create: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `@sismos/eslint-config` (`./base` export → `config`), `@sismos/typescript-config` (`base.json`).
- Produces: `SismoNormalizado` type, `SismoFuente` type, `normalizeCsnSismo(raw: CsnSismoRaw): SismoNormalizado`, `normalizeUsgsFeature(raw: UsgsFeatureRaw): SismoNormalizado` — all exported from `@sismos/shared`. Later tasks (`packages/db`, `apps/web`, `apps/ingestor`) import from this package name.

- [ ] **Step 1: Create the package directory and manifest**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize
```

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/package.json`:

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
  "devDependencies": {
    "@sismos/eslint-config": "workspace:*",
    "@sismos/typescript-config": "workspace:*",
    "eslint": "^9.39.1",
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 2: Add `tsconfig.json` and `eslint.config.js`**

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/tsconfig.json`:

```json
{
  "extends": "@sismos/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/eslint.config.js`:

```js
import { config } from "@sismos/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default config;
```

- [ ] **Step 3: Write the shared types**

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/types.ts`:

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
}
```

- [ ] **Step 4: Write the normalization stubs**

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize/csn.ts`:

```ts
import type { SismoNormalizado } from "../types";

// TODO: definir el tipo de entrada real una vez se confirme la forma
// de la respuesta de sismologia.cl / api-sismologia-chile.
export type CsnSismoRaw = Record<string, unknown>;

// TODO: implementar la normalización real del formato CSN.
export function normalizeCsnSismo(_raw: CsnSismoRaw): SismoNormalizado {
  throw new Error("normalizeCsnSismo: not implemented yet");
}
```

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/normalize/usgs.ts`:

```ts
import type { SismoNormalizado } from "../types";

// TODO: reemplazar por el tipo real de un Feature del GeoJSON de USGS.
export type UsgsFeatureRaw = Record<string, unknown>;

// TODO: implementar la normalización real del formato USGS GeoJSON.
export function normalizeUsgsFeature(_raw: UsgsFeatureRaw): SismoNormalizado {
  throw new Error("normalizeUsgsFeature: not implemented yet");
}
```

- [ ] **Step 5: Write the barrel file**

`/Users/rodrigoguerrero/Sites/sismos/packages/shared/src/index.ts`:

```ts
export * from "./types";
export * from "./normalize/csn";
export * from "./normalize/usgs";
```

- [ ] **Step 6: Verify the files are in place**

```bash
find /Users/rodrigoguerrero/Sites/sismos/packages/shared -type f | sort
```

Expected: `eslint.config.js`, `package.json`, `src/index.ts`, `src/normalize/csn.ts`, `src/normalize/usgs.ts`, `src/types.ts`, `tsconfig.json`. (Full type-check/lint verification happens in Task 6 after `pnpm install`.)

- [ ] **Step 7: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/shared
git commit -m "feat: add packages/shared with normalization stubs"
```

---

### Task 3: `packages/db` — Mongoose connection + model stubs

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/eslint.config.js`
- Create: `packages/db/src/connection.ts`
- Create: `packages/db/src/models/sismo.ts`
- Create: `packages/db/src/models/sismo-historico.ts`
- Create: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `@sismos/eslint-config`, `@sismos/typescript-config`, `mongoose`.
- Produces: `getMongooseConnection(): Promise<typeof mongoose>`, `SismoModel`, `SismoHistoricoModel` — exported from `@sismos/db`. `apps/ingestor` will import these later.

- [ ] **Step 1: Create the package directory and manifest**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/packages/db/src/models
```

`/Users/rodrigoguerrero/Sites/sismos/packages/db/package.json`:

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

- [ ] **Step 2: Add `tsconfig.json` and `eslint.config.js`**

`/Users/rodrigoguerrero/Sites/sismos/packages/db/tsconfig.json`:

```json
{
  "extends": "@sismos/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

`/Users/rodrigoguerrero/Sites/sismos/packages/db/eslint.config.js`:

```js
import { config } from "@sismos/eslint-config/base";

/** @type {import("eslint").Linter.Config[]} */
export default config;
```

- [ ] **Step 3: Write the connection stub**

`/Users/rodrigoguerrero/Sites/sismos/packages/db/src/connection.ts`:

```ts
import mongoose from "mongoose";

let cached: Promise<typeof mongoose> | null = null;

// TODO: agregar manejo de reintentos/estado de conexión una vez que
// se implemente la lógica real de lectura/escritura.
export function getMongooseConnection(): Promise<typeof mongoose> {
  if (!cached) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    cached = mongoose.connect(uri);
  }
  return cached;
}
```

- [ ] **Step 4: Write the model stubs**

`/Users/rodrigoguerrero/Sites/sismos/packages/db/src/models/sismo.ts`:

```ts
import { Schema, model, models, type InferSchemaType } from "mongoose";

// TODO: definir el schema real (fuente, externalId, fecha, magnitud,
// profundidad, coordenadas, lugar, etc.) alineado con SismoNormalizado
// de @sismos/shared. Usado para el top 10 de los últimos 10 años y los
// últimos 10 días.
const sismoSchema = new Schema({}, { strict: false, timestamps: true });

export type Sismo = InferSchemaType<typeof sismoSchema>;

export const SismoModel =
  models.Sismo ?? model("Sismo", sismoSchema, "sismos");
```

`/Users/rodrigoguerrero/Sites/sismos/packages/db/src/models/sismo-historico.ts`:

```ts
import { Schema, model, models, type InferSchemaType } from "mongoose";

// TODO: definir el schema real, incluyendo soporte para ajuste manual
// de coordenadas en eventos antiguos mal geolocalizados (ej. Valdivia 1960).
const sismoHistoricoSchema = new Schema({}, { strict: false, timestamps: true });

export type SismoHistorico = InferSchemaType<typeof sismoHistoricoSchema>;

export const SismoHistoricoModel =
  models.SismoHistorico ??
  model("SismoHistorico", sismoHistoricoSchema, "sismos_historicos");
```

- [ ] **Step 5: Write the barrel file**

`/Users/rodrigoguerrero/Sites/sismos/packages/db/src/index.ts`:

```ts
export * from "./connection";
export * from "./models/sismo";
export * from "./models/sismo-historico";
```

- [ ] **Step 6: Verify the files are in place**

```bash
find /Users/rodrigoguerrero/Sites/sismos/packages/db -type f | sort
```

Expected: `eslint.config.js`, `package.json`, `src/connection.ts`, `src/index.ts`, `src/models/sismo-historico.ts`, `src/models/sismo.ts`, `tsconfig.json`.

- [ ] **Step 7: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add packages/db
git commit -m "feat: add packages/db with Mongoose connection and model stubs"
```

---

### Task 4: `apps/web` — Tailwind v4 + Serwist PWA wiring

**Files:**
- Modify: `apps/web/package.json`
- Delete: `apps/web/next.config.js`
- Create: `apps/web/next.config.ts`
- Modify: `apps/web/tsconfig.json`
- Modify: `apps/web/eslint.config.js`
- Create: `apps/web/postcss.config.mjs`
- Modify: `apps/web/app/globals.css`
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/app/sw.ts`
- Create: `apps/web/public/manifest.json`
- Delete: `apps/web/app/fonts/GeistMonoVF.woff`, `apps/web/app/fonts/GeistVF.woff`, `apps/web/app/page.module.css`, `apps/web/public/file-text.svg`, `apps/web/public/globe.svg`, `apps/web/public/next.svg`, `apps/web/public/turborepo-dark.svg`, `apps/web/public/turborepo-light.svg`, `apps/web/public/vercel.svg`, `apps/web/public/window.svg`

**Interfaces:**
- Consumes: `@sismos/shared` (workspace dep, unused by code yet but wired so future pages can import types), `@sismos/eslint-config/next-js`, `@sismos/typescript-config/nextjs.json`.
- Produces: installable PWA shell at `apps/web` — `/manifest.json` and `/sw.js` (generated by Serwist from `app/sw.ts` at build time).

- [ ] **Step 1: Delete the unused default-template assets**

```bash
cd /Users/rodrigoguerrero/Sites/sismos/apps/web
rm -f next.config.js app/page.module.css
rm -rf app/fonts
rm -f public/file-text.svg public/globe.svg public/next.svg public/turborepo-dark.svg public/turborepo-light.svg public/vercel.svg public/window.svg
```

- [ ] **Step 2: Rewrite `package.json`**

Replace `/Users/rodrigoguerrero/Sites/sismos/apps/web/package.json` with:

```json
{
  "name": "web",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3000",
    "build": "next build",
    "start": "next start",
    "lint": "eslint --max-warnings 0",
    "check-types": "next typegen && tsc --noEmit"
  },
  "dependencies": {
    "@sismos/shared": "workspace:*",
    "@serwist/next": "^9.5.11",
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

- [ ] **Step 3: Add `next.config.ts` with Serwist wiring**

`/Users/rodrigoguerrero/Sites/sismos/apps/web/next.config.ts`:

```ts
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
});

const nextConfig: NextConfig = {};

export default withSerwist(nextConfig);
```

- [ ] **Step 4: Update `tsconfig.json` and `eslint.config.js` to the `@sismos` scope**

`/Users/rodrigoguerrero/Sites/sismos/apps/web/tsconfig.json`:

```json
{
  "extends": "@sismos/typescript-config/nextjs.json",
  "compilerOptions": {
    "plugins": [
      {
        "name": "next"
      }
    ],
    "strictNullChecks": true
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "next-env.d.ts",
    "next.config.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`/Users/rodrigoguerrero/Sites/sismos/apps/web/eslint.config.js`:

```js
import { nextJsConfig } from "@sismos/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default nextJsConfig;
```

- [ ] **Step 5: Add Tailwind v4 wiring**

`/Users/rodrigoguerrero/Sites/sismos/apps/web/postcss.config.mjs`:

```js
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
```

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
```

- [ ] **Step 6: Replace the placeholder layout and page**

`/Users/rodrigoguerrero/Sites/sismos/apps/web/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sismos",
  description: "Sismos de Chile y el mundo en tiempo real",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

`/Users/rodrigoguerrero/Sites/sismos/apps/web/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">Sismos — próximamente</h1>
    </main>
  );
}
```

- [ ] **Step 7: Add the Serwist service worker source**

`/Users/rodrigoguerrero/Sites/sismos/apps/web/app/sw.ts`:

```ts
import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();
```

- [ ] **Step 8: Add the PWA manifest**

`/Users/rodrigoguerrero/Sites/sismos/apps/web/public/manifest.json`:

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

Note: `icons` is intentionally empty — real app icons are a deferred decision per the spec, not part of this scaffold.

- [ ] **Step 9: Verify the files are in place**

```bash
find /Users/rodrigoguerrero/Sites/sismos/apps/web -type f -not -path '*/node_modules/*' | sort
```

Expected: no `next.config.js`, no `app/fonts/`, no `app/page.module.css`, no default template SVGs in `public/`. Present: `next.config.ts`, `postcss.config.mjs`, `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/sw.ts`, `public/manifest.json`, plus unchanged `app/favicon.ico`.

- [ ] **Step 10: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/web
git commit -m "feat: wire Tailwind v4 and Serwist PWA into apps/web"
```

---

### Task 5: `apps/ingestor` — minimal Next.js app with a cron-triggered route handler

**Files:**
- Create: `apps/ingestor/package.json`
- Create: `apps/ingestor/next.config.ts`
- Create: `apps/ingestor/next-env.d.ts`
- Create: `apps/ingestor/tsconfig.json`
- Create: `apps/ingestor/eslint.config.js`
- Create: `apps/ingestor/vercel.ts`
- Create: `apps/ingestor/app/api/ingest/route.ts`
- Create: `.env.example` (repo root)

**Interfaces:**
- Consumes: `@sismos/db` (`getMongooseConnection`, `SismoModel`, `SismoHistoricoModel` — not called yet), `@sismos/shared` (`normalizeCsnSismo`, `normalizeUsgsFeature` — not called yet), `@sismos/eslint-config/next-js`, `@sismos/typescript-config/nextjs.json`, `@vercel/config`.
- Produces: `GET /api/ingest` route (placeholder JSON response), scheduled via `vercel.ts` crons.

- [ ] **Step 1: Create the directory structure**

```bash
mkdir -p /Users/rodrigoguerrero/Sites/sismos/apps/ingestor/app/api/ingest
```

- [ ] **Step 2: Write `package.json`**

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/package.json`:

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
    "check-types": "next typegen && tsc --noEmit"
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
    "typescript": "5.9.2"
  }
}
```

- [ ] **Step 3: Write `next.config.ts`, `next-env.d.ts`, `tsconfig.json`, `eslint.config.js`**

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
```

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/tsconfig.json`:

```json
{
  "extends": "@sismos/typescript-config/nextjs.json",
  "compilerOptions": {
    "plugins": [
      {
        "name": "next"
      }
    ],
    "strictNullChecks": true
  },
  "include": [
    "**/*.ts",
    "**/*.tsx",
    "next-env.d.ts",
    "next.config.ts",
    ".next/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
```

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/eslint.config.js`:

```js
import { nextJsConfig } from "@sismos/eslint-config/next-js";

/** @type {import("eslint").Linter.Config[]} */
export default nextJsConfig;
```

- [ ] **Step 4: Write the placeholder route handler**

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/app/api/ingest/route.ts`:

```ts
import { NextResponse } from "next/server";

// TODO: reemplazar por la consulta real a CSN + USGS, normalización
// (vía @sismos/shared) y guardado con dedupe (vía @sismos/db).
export async function GET() {
  return NextResponse.json({ status: "not implemented yet" });
}
```

- [ ] **Step 5: Write `vercel.ts` with the cron config**

`/Users/rodrigoguerrero/Sites/sismos/apps/ingestor/vercel.ts`:

```ts
import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  crons: [
    {
      path: "/api/ingest",
      // Vercel Cron: mínimo 1x/minuto, y en plan Hobby (gratis) máximo
      // 1x/día. La cadencia real de 30-60s pedida en el spec no es
      // alcanzable así en el plan gratuito — ver spec, "Riesgos conocidos".
      schedule: "*/1 * * * *",
    },
  ],
};
```

- [ ] **Step 6: Add the root `.env.example`**

`/Users/rodrigoguerrero/Sites/sismos/.env.example`:

```
MONGODB_URI=
```

- [ ] **Step 7: Verify the files are in place**

```bash
find /Users/rodrigoguerrero/Sites/sismos/apps/ingestor -type f | sort
cat /Users/rodrigoguerrero/Sites/sismos/.env.example
```

Expected: `app/api/ingest/route.ts`, `eslint.config.js`, `next-env.d.ts`, `next.config.ts`, `package.json`, `tsconfig.json`, `vercel.ts`. No `app/page.tsx`, no `app/layout.tsx` (this app has no pages by design).

- [ ] **Step 8: Commit**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add apps/ingestor .env.example
git commit -m "feat: add apps/ingestor with placeholder cron route"
```

---

### Task 6: Install, build, lint, typecheck, smoke-test, final commit

**Files:**
- None created — this task only runs commands and, if any generated files (e.g. `next-env.d.ts` for `apps/web`, `pnpm-lock.yaml`) need to be added to git, stages them.

**Interfaces:**
- Consumes: every workspace package/app produced in Tasks 1-5.
- Produces: `pnpm-lock.yaml`, working `pnpm build` / `pnpm lint` / `pnpm check-types` pipelines, confirmation that both apps boot in dev mode.

- [ ] **Step 1: Make sure Node 24 is active**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
nvm use
node -v
```

Expected: `v24.x.x`.

- [ ] **Step 2: Install all workspace dependencies**

```bash
pnpm install
```

Expected: resolves all `workspace:*` references (`@sismos/db`, `@sismos/shared`, `@sismos/eslint-config`, `@sismos/typescript-config`) with no errors, creates `pnpm-lock.yaml`.

- [ ] **Step 3: Run the full build**

```bash
pnpm build
```

Expected: `apps/web` and `ingestor` both build successfully (Next.js prints a route summary for each, including `/api/ingest` for ingestor and `/` for web). `packages/db` and `packages/shared` have no `build` script, so Turborepo skips them for this task (only `check-types`/`lint` apply to them).

- [ ] **Step 4: Run lint across the whole monorepo**

```bash
pnpm lint
```

Expected: exits 0, no errors (warnings are fine — `eslint-plugin-only-warn` downgrades most base rules to warnings).

- [ ] **Step 5: Run typecheck across the whole monorepo**

```bash
pnpm check-types
```

Expected: exits 0 for `web`, `ingestor`, `@sismos/db`, `@sismos/shared`.

- [ ] **Step 6: Smoke-test both apps in dev mode**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
pnpm --filter web dev &
WEB_PID=$!
pnpm --filter ingestor dev &
INGESTOR_PID=$!
sleep 5
curl -sf http://localhost:3000/ -o /dev/null && echo "web OK"
curl -sf http://localhost:3001/api/ingest && echo
kill $WEB_PID $INGESTOR_PID
```

Expected: `web OK` printed, and the ingestor curl prints `{"status":"not implemented yet"}`.

- [ ] **Step 7: Stage and commit the lockfile plus any tool-generated files**

```bash
cd /Users/rodrigoguerrero/Sites/sismos
git add -A
git status
```

Review the output — it should only contain `pnpm-lock.yaml` and possibly `apps/web/next-env.d.ts` / `.next/types` artifacts (the latter should already be git-ignored; if `.next/` shows up, add `.next/` to `.gitignore` before committing instead of committing build output).

```bash
git commit -m "chore: install dependencies and verify build/lint/typecheck"
```

---

## Self-Review Notes

- **Spec coverage:** every unit in the spec (`apps/web`, `apps/ingestor`, `packages/db`, `packages/shared`, shared eslint/typescript config, pnpm, Node 24, git already initialized) maps to a task above. The one spec item intentionally not actioned is the map library and real Mongo schema — both explicitly deferred in the spec's "Decisiones diferidas" section.
- **No placeholders in the plan itself:** every step shows the literal file content to write; the `TODO` comments that appear *inside* that content are the stubs the spec asked for, not gaps in this plan.
- **Type consistency check:** `SismoNormalizado`/`SismoFuente` (Task 2) are the only shared type referenced by name elsewhere, and no other task re-declares it. `@sismos/eslint-config` export paths (`./base`, `./next-js`) and `@sismos/typescript-config` paths (`base.json`, `nextjs.json`) are used identically across Tasks 2-5.
