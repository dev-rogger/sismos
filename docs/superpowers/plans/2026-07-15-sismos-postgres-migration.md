# Migración Mongoose → Postgres/Neon (Drizzle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la capa de datos de `packages/db` (Mongoose + MongoDB) por Drizzle ORM sobre Postgres, usable tanto contra un Postgres local en Docker Compose como contra Neon en producción, sin romper las firmas públicas que consumen `apps/ingestor` y `apps/web`.

**Architecture:** `packages/db` expone un singleton de módulo (`getDb()`) que crea un `Pool` de `node-postgres` perezosamente (falla solo al primer uso si falta `DATABASE_URL`, no al importar el módulo). Las funciones de query (`upsertSismo`, `findRecentByFuente`, etc.) usan ese pool directamente vía Drizzle. Los call-sites en `apps/ingestor` y `apps/web` dejan de llamar a un paso de conexión explícito.

**Tech Stack:** Drizzle ORM (`drizzle-orm/node-postgres`), `pg` (node-postgres), `drizzle-kit` para migraciones, Postgres 16 (Docker Compose local / Neon en producción).

## Global Constraints

- No se agregan tests automatizados — el repo no tiene ningún framework de testing configurado (Vitest, Jest, etc.); la verificación de cada tarea es manual (comandos `psql`, `curl`, `check-types`), igual que el resto del proyecto hasta ahora.
- Las firmas públicas de las funciones de `@sismos/db` (nombres, parámetros, forma de retorno) deben mantenerse idénticas a las actuales — no se toca la lógica de negocio de `apps/ingestor/lib/ingest.ts`.
- La variable de entorno pasa de `MONGODB_URI` a `DATABASE_URL` en todos los lugares donde aparece (excepto docs históricos ya escritos, que no se tocan).
- No se automatiza la corrida de migraciones dentro del build de Vercel — es un paso manual explícito.

---

### Task 1: Postgres local en Docker Compose

**Files:**
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces: servicio `postgres` alcanzable en `localhost:5432` (desde el host) y `postgres:5432` (desde otros servicios de compose), credenciales `postgres`/`postgres`, base `sismos`.

- [ ] **Step 1: Reemplazar el servicio `mongo` por `postgres` y actualizar envs**

Reemplazar el contenido completo de `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sismos
    volumes:
      - postgres-data:/var/lib/postgresql/data

  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: pnpm --filter web dev
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/sismos
    depends_on:
      - postgres
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/ingestor/node_modules
      - /app/packages/db/node_modules
      - /app/packages/shared/node_modules
      - /app/packages/eslint-config/node_modules
      - /app/packages/typescript-config/node_modules

  ingestor:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: pnpm --filter ingestor dev
    ports:
      - "3001:3001"
    environment:
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/sismos
    depends_on:
      - postgres
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/ingestor/node_modules
      - /app/packages/db/node_modules
      - /app/packages/shared/node_modules
      - /app/packages/eslint-config/node_modules
      - /app/packages/typescript-config/node_modules

  poller:
    image: alpine:3.20
    depends_on:
      - ingestor
    environment:
      INGEST_URL: http://ingestor:3001/api/ingest
    volumes:
      - ./apps/ingestor/scripts:/scripts:ro
    entrypoint: ["sh", "-c", "apk add --no-cache curl bash >/dev/null && exec bash /scripts/poll.sh"]

volumes:
  postgres-data:
```

- [ ] **Step 2: Levantar el servicio y verificar que responde**

Run: `docker compose up -d postgres`
Expected: contenedor `sismos-postgres-1` (o similar) en estado running.

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c '\dt'`
Expected: se conecta sin error y muestra `Did not find any relations.` (todavía no hay tablas — eso es correcto en este punto).

- [ ] **Step 3: Apagar el contenedor (se vuelve a levantar en la Task 2)**

Run: `docker compose down`

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: replace Mongo with Postgres in docker-compose"
```

---

### Task 2: Dependencias, schema y migración inicial en `packages/db`

**Files:**
- Modify: `packages/db/package.json`
- Create: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/drizzle/` (generado por `drizzle-kit generate`, no se escribe a mano)

**Interfaces:**
- Produces: `sismos` y `sismosHistoricos` (tablas Drizzle, `pgTable`) importables desde `./schema` — usadas por la Task 3.

- [ ] **Step 1: Quitar `mongoose` y agregar las dependencias de Drizzle/Postgres**

Run: `pnpm --filter @sismos/db remove mongoose`
Run: `pnpm --filter @sismos/db add drizzle-orm pg`
Run: `pnpm --filter @sismos/db add -D drizzle-kit @types/pg`

Expected: `packages/db/package.json` queda con `dependencies: { "@sismos/shared": "workspace:*", "drizzle-orm": "^X", "pg": "^X" }` y `devDependencies` incluyendo `drizzle-kit` y `@types/pg` además de lo que ya tenía.

- [ ] **Step 2: Agregar los scripts de migración a `packages/db/package.json`**

Editar el bloque `"scripts"` de `packages/db/package.json` para que quede:

```json
  "scripts": {
    "lint": "eslint --max-warnings 0",
    "check-types": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  },
```

- [ ] **Step 3: Escribir el schema Drizzle**

Crear `packages/db/src/schema.ts`:

```ts
import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  doublePrecision,
  unique,
} from "drizzle-orm/pg-core";

export const sismos = pgTable(
  "sismos",
  {
    id: serial("id").primaryKey(),
    fuente: text("fuente").notNull(),
    externalId: text("external_id").notNull(),
    fecha: timestamp("fecha").notNull(),
    magnitud: real("magnitud").notNull(),
    profundidadKm: real("profundidad_km").notNull(),
    latitud: doublePrecision("latitud").notNull(),
    longitud: doublePrecision("longitud").notNull(),
    lugar: text("lugar").notNull(),
    bandera: text("bandera"),
    refCruzadaFuente: text("ref_cruzada_fuente"),
    refCruzadaExternalId: text("ref_cruzada_external_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    unique("sismos_fuente_external_id_unique").on(
      table.fuente,
      table.externalId,
    ),
  ],
);

export const sismosHistoricos = pgTable("sismos_historicos", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  fecha: timestamp("fecha").notNull(),
  magnitud: real("magnitud").notNull(),
  profundidadKm: real("profundidad_km").notNull(),
  latitud: doublePrecision("latitud").notNull(),
  longitud: doublePrecision("longitud").notNull(),
  lugar: text("lugar").notNull(),
  bandera: text("bandera"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

- [ ] **Step 4: Escribir la config de drizzle-kit**

Crear `packages/db/drizzle.config.ts`:

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Levantar Postgres y generar la migración**

Run: `docker compose up -d postgres`
Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:generate`
Expected: se crea un archivo `.sql` nuevo bajo `packages/db/drizzle/` (nombre autogenerado, ej. `0000_xxx.sql`).

Run: `grep -l "CREATE TABLE \"sismos\"" packages/db/drizzle/*.sql`
Expected: encuentra el archivo generado.

Run: `grep "sismos_fuente_external_id_unique\|CREATE TABLE \"sismos_historicos\"" packages/db/drizzle/*.sql`
Expected: ambas líneas aparecen (la constraint única compuesta y la tabla histórica).

- [ ] **Step 6: Aplicar la migración y verificar las tablas**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:migrate`
Expected: termina sin error, log de drizzle-kit indicando la migración aplicada.

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c '\dt'`
Expected: lista `sismos` y `sismos_historicos`.

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c '\d sismos'`
Expected: muestra las columnas definidas en el schema (`fuente`, `external_id`, `fecha`, `magnitud`, `profundidad_km`, `latitud`, `longitud`, `lugar`, `bandera`, `ref_cruzada_fuente`, `ref_cruzada_external_id`, `created_at`, `updated_at`) y el constraint único `sismos_fuente_external_id_unique`.

- [ ] **Step 7: Commit**

```bash
git add packages/db/package.json packages/db/src/schema.ts packages/db/drizzle.config.ts packages/db/drizzle pnpm-lock.yaml
git commit -m "feat(db): add Drizzle schema and initial Postgres migration"
```

---

### Task 3: Reescribir la capa de conexión y queries de `packages/db`

**Files:**
- Modify: `packages/db/src/connection.ts`
- Modify: `packages/db/src/queries/sismo.ts`
- Modify: `packages/db/src/queries/sismo-historico.ts`
- Modify: `packages/db/src/index.ts`
- Delete: `packages/db/src/models/sismo.ts`
- Delete: `packages/db/src/models/sismo-historico.ts`

**Interfaces:**
- Consumes: `sismos`, `sismosHistoricos` de `./schema` (Task 2).
- Produces: `getDb()` (interno, no exportado desde `index.ts`); `upsertSismo`, `findRecentByFuente`, `setRefCruzada`, `replaceWithCsn`, `findUltimos10Dias`, `findSismosSince`, `findTop10UltimosAnios`, `type Sismo` (todo desde `./queries/sismo`); `upsertSismoHistorico`, `findTopHistoricos`, `type SismoHistorico`, `type SismoHistoricoInput` (desde `./queries/sismo-historico`) — mismas firmas que las funciones Mongoose que reemplazan.

- [ ] **Step 1: Reescribir la conexión**

Reemplazar el contenido completo de `packages/db/src/connection.ts`:

```ts
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

let cached: NodePgDatabase | null = null;

export function getDb(): NodePgDatabase {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({ connectionString, max: 1 });
    cached = drizzle(pool);
  }
  return cached;
}
```

- [ ] **Step 2: Reescribir las queries de `sismos`**

Reemplazar el contenido completo de `packages/db/src/queries/sismo.ts`:

```ts
import { and, desc, eq, gt, gte, asc } from "drizzle-orm";
import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { getDb } from "../connection";
import { sismos } from "../schema";

export interface Sismo {
  id: number;
  fuente: SismoFuente;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  refCruzada: { fuente: SismoFuente; externalId: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSismo(row: typeof sismos.$inferSelect): Sismo {
  return {
    id: row.id,
    fuente: row.fuente as SismoFuente,
    externalId: row.externalId,
    fecha: row.fecha,
    magnitud: row.magnitud,
    profundidadKm: row.profundidadKm,
    latitud: row.latitud,
    longitud: row.longitud,
    lugar: row.lugar,
    bandera: row.bandera,
    refCruzada:
      row.refCruzadaFuente && row.refCruzadaExternalId
        ? {
            fuente: row.refCruzadaFuente as SismoFuente,
            externalId: row.refCruzadaExternalId,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findRecentByFuente(
  fuente: SismoFuente,
  since: Date,
): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(and(eq(sismos.fuente, fuente), gte(sismos.fecha, since)));
  return rows.map(toSismo);
}

export async function upsertSismo(evento: SismoNormalizado): Promise<Sismo> {
  const now = new Date();
  const [row] = await getDb()
    .insert(sismos)
    .values({
      fuente: evento.fuente,
      externalId: evento.externalId,
      fecha: evento.fecha,
      magnitud: evento.magnitud,
      profundidadKm: evento.profundidadKm,
      latitud: evento.latitud,
      longitud: evento.longitud,
      lugar: evento.lugar,
      bandera: evento.bandera,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sismos.fuente, sismos.externalId],
      set: {
        fecha: evento.fecha,
        magnitud: evento.magnitud,
        profundidadKm: evento.profundidadKm,
        latitud: evento.latitud,
        longitud: evento.longitud,
        lugar: evento.lugar,
        bandera: evento.bandera,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertSismo: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toSismo(row);
}

export async function setRefCruzada(
  fuente: SismoFuente,
  externalId: string,
  refCruzada: { fuente: SismoFuente; externalId: string },
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      refCruzadaFuente: refCruzada.fuente,
      refCruzadaExternalId: refCruzada.externalId,
      updatedAt: new Date(),
    })
    .where(and(eq(sismos.fuente, fuente), eq(sismos.externalId, externalId)))
    .returning();
  return row ? toSismo(row) : null;
}

export async function replaceWithCsn(
  usgsExternalId: string,
  csnEvento: SismoNormalizado,
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      fuente: csnEvento.fuente,
      externalId: csnEvento.externalId,
      fecha: csnEvento.fecha,
      magnitud: csnEvento.magnitud,
      profundidadKm: csnEvento.profundidadKm,
      latitud: csnEvento.latitud,
      longitud: csnEvento.longitud,
      lugar: csnEvento.lugar,
      bandera: csnEvento.bandera,
      refCruzadaFuente: "usgs",
      refCruzadaExternalId: usgsExternalId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sismos.fuente, "usgs"), eq(sismos.externalId, usgsExternalId)),
    )
    .returning();
  return row ? toSismo(row) : null;
}

export async function findUltimos10Dias(): Promise<Sismo[]> {
  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gte(sismos.fecha, since))
    .orderBy(desc(sismos.fecha));
  return rows.map(toSismo);
}

export async function findSismosSince(since: Date): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gt(sismos.fecha, since))
    .orderBy(asc(sismos.fecha));
  return rows.map(toSismo);
}

export async function findTop10UltimosAnios(anios: number): Promise<Sismo[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - anios);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gte(sismos.fecha, since))
    .orderBy(desc(sismos.magnitud))
    .limit(10);
  return rows.map(toSismo);
}
```

- [ ] **Step 3: Reescribir las queries de `sismos_historicos`**

Reemplazar el contenido completo de `packages/db/src/queries/sismo-historico.ts`:

```ts
import { desc } from "drizzle-orm";
import { getDb } from "../connection";
import { sismosHistoricos } from "../schema";

export interface SismoHistorico {
  id: number;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  createdAt: Date;
  updatedAt: Date;
}

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

function toSismoHistorico(
  row: typeof sismosHistoricos.$inferSelect,
): SismoHistorico {
  return {
    id: row.id,
    externalId: row.externalId,
    fecha: row.fecha,
    magnitud: row.magnitud,
    profundidadKm: row.profundidadKm,
    latitud: row.latitud,
    longitud: row.longitud,
    lugar: row.lugar,
    bandera: row.bandera,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertSismoHistorico(
  evento: SismoHistoricoInput,
): Promise<SismoHistorico> {
  const now = new Date();
  const [row] = await getDb()
    .insert(sismosHistoricos)
    .values({
      externalId: evento.externalId,
      fecha: evento.fecha,
      magnitud: evento.magnitud,
      profundidadKm: evento.profundidadKm,
      latitud: evento.latitud,
      longitud: evento.longitud,
      lugar: evento.lugar,
      bandera: evento.bandera ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sismosHistoricos.externalId,
      set: {
        fecha: evento.fecha,
        magnitud: evento.magnitud,
        profundidadKm: evento.profundidadKm,
        latitud: evento.latitud,
        longitud: evento.longitud,
        lugar: evento.lugar,
        bandera: evento.bandera ?? null,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertSismoHistorico: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toSismoHistorico(row);
}

export async function findTopHistoricos(): Promise<SismoHistorico[]> {
  const rows = await getDb()
    .select()
    .from(sismosHistoricos)
    .orderBy(desc(sismosHistoricos.magnitud));
  return rows.map(toSismoHistorico);
}
```

- [ ] **Step 4: Actualizar los exports del package**

Reemplazar el contenido completo de `packages/db/src/index.ts`:

```ts
export * from "./schema";
export * from "./queries/sismo";
export * from "./queries/sismo-historico";
```

- [ ] **Step 5: Borrar los modelos Mongoose**

Run: `rm packages/db/src/models/sismo.ts packages/db/src/models/sismo-historico.ts && rmdir packages/db/src/models`

- [ ] **Step 6: Verificar que el package compila**

Run: `pnpm --filter @sismos/db check-types`
Expected: termina sin errores (0 exit code).

- [ ] **Step 7: Commit**

```bash
git add packages/db/src
git commit -m "feat(db): replace Mongoose models/queries with Drizzle"
```

---

### Task 4: Actualizar `apps/ingestor` (endpoint, envs, turbo)

**Files:**
- Modify: `apps/ingestor/app/api/ingest/route.ts`
- Modify: `apps/ingestor/.env.local`
- Modify: `.env.example`
- Modify: `turbo.json`

**Interfaces:**
- Consumes: `runIngest()` de `../../../lib/ingest` (sin cambios); ya no consume `getMongooseConnection` de `@sismos/db` (eliminado en Task 3).

- [ ] **Step 1: Simplificar el endpoint**

Reemplazar el contenido completo de `apps/ingestor/app/api/ingest/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "../../../lib/ingest";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;

  if (!cronSecret || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runIngest();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[ingest] Ingest failed:", error);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Actualizar las variables de entorno**

En `apps/ingestor/.env.local`, reemplazar la línea `MONGODB_URI=mongodb://localhost:27017/sismos` por:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos
```

(la línea `CRON_SECRET=...` que ya existe se deja igual).

En `.env.example` (raíz del repo), reemplazar `MONGODB_URI=` por `DATABASE_URL=` — queda:

```
DATABASE_URL=
CRON_SECRET=
```

- [ ] **Step 3: Actualizar `turbo.json`**

En `turbo.json`, cambiar:

```json
  "globalEnv": ["MONGODB_URI", "CRON_SECRET"],
```

por:

```json
  "globalEnv": ["DATABASE_URL", "CRON_SECRET"],
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter ingestor check-types`
Expected: termina sin errores.

- [ ] **Step 5: Verificación funcional end-to-end**

Run: `docker compose up -d postgres` (si no sigue corriendo de la Task 2)
Run: `pnpm --filter ingestor dev &` (o en una terminal aparte)
Run (esperar ~3s a que arranque, luego):
```bash
curl -s -w "\nstatus: %{http_code}\n" \
  -H "x-cron-secret: $(grep CRON_SECRET apps/ingestor/.env.local | cut -d= -f2)" \
  http://localhost:3001/api/ingest
```
Expected: `status: 200` y un JSON con la forma `{"csn":{...},"usgs":{...},"deduped":N}`.

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c 'SELECT count(*) FROM sismos;'`
Expected: un número mayor a 0 (asumiendo que CSN/USGS respondieron datos).

Detener el servidor de dev (`kill %1` o Ctrl+C en su terminal).

- [ ] **Step 6: Commit**

```bash
git add apps/ingestor/app/api/ingest/route.ts apps/ingestor/.env.local .env.example turbo.json
git commit -m "feat(ingestor): switch ingest endpoint to Postgres"
```

---

### Task 5: Actualizar `apps/web`

**Files:**
- Modify: `apps/web/lib/fetch-sismos.ts`

**Interfaces:**
- Consumes: `findUltimos10Dias`, `findSismosSince`, `findTop10UltimosAnios`, `findTopHistoricos`, `type Sismo`, `type SismoHistorico` de `@sismos/db` (Task 3) — mismas firmas que antes.

- [ ] **Step 1: Quitar la conexión explícita**

Reemplazar el contenido completo de `apps/web/lib/fetch-sismos.ts`:

```ts
import {
  findUltimos10Dias,
  findSismosSince,
  findTop10UltimosAnios,
  findTopHistoricos,
  type Sismo,
  type SismoHistorico,
} from "@sismos/db";

export async function getUltimos10Dias(): Promise<Sismo[]> {
  return findUltimos10Dias();
}

export async function getSismosDesde(since: Date): Promise<Sismo[]> {
  return findSismosSince(since);
}

export async function getTop10UltimosAnios(): Promise<Sismo[]> {
  return findTop10UltimosAnios(10);
}

export async function getTopHistoricos(): Promise<SismoHistorico[]> {
  return findTopHistoricos();
}
```

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter web check-types`
Expected: termina sin errores.

- [ ] **Step 3: Verificación funcional**

Requiere que la Task 4 ya haya insertado al menos un registro en `sismos` (sirve la misma corrida de Postgres local).

Run: `pnpm --filter web dev &`
Run (esperar ~3s, luego):
```bash
curl -s -w "\nstatus: %{http_code}\n" "http://localhost:3000/api/historial?tipo=ultimos10dias"
```
Expected: `status: 200` y `{"eventos":[...]}` con al menos un elemento.

Detener el servidor de dev.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/fetch-sismos.ts
git commit -m "feat(web): drop explicit db connect call, now unnecessary with Drizzle pool"
```

---

### Task 6: Actualizar el script de backfill histórico

**Files:**
- Modify: `apps/ingestor/scripts/backfill-historicos.ts`

**Interfaces:**
- Consumes: `upsertSismoHistorico`, `type SismoHistoricoInput` de `@sismos/db` (Task 3).

- [ ] **Step 1: Quitar la conexión explícita**

En `apps/ingestor/scripts/backfill-historicos.ts`, cambiar el import (líneas 8-12):

```ts
import {
  getMongooseConnection,
  upsertSismoHistorico,
  type SismoHistoricoInput,
} from "@sismos/db";
```

por:

```ts
import {
  upsertSismoHistorico,
  type SismoHistoricoInput,
} from "@sismos/db";
```

Y en la función `main()`, borrar la línea:

```ts
  await getMongooseConnection();

```

(queda `fetchTopHistoricos` seguido directo del `for (const evento of eventos)`).

- [ ] **Step 2: Verificar tipos**

Run: `pnpm --filter ingestor check-types`
Expected: termina sin errores.

- [ ] **Step 3: Verificación funcional**

Run: `docker compose up -d postgres` (si no sigue corriendo)
Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter ingestor backfill-historicos`

Nota: el script actual carga `.env.local` vía `tsx --env-file=.env.local`, que ya tiene `DATABASE_URL` seteada desde la Task 4 — no hace falta pasarla a mano si `.env.local` está actualizado; se incluye acá solo como respaldo explícito.

Expected: logs `Upserted <externalId> — ...` por cada uno de los 10 eventos históricos, terminando en `Done. Upserted 10 historical events.`

Run: `docker compose exec -T postgres psql -U postgres -d sismos -c 'SELECT count(*) FROM sismos_historicos;'`
Expected: `10`.

- [ ] **Step 4: Commit**

```bash
git add apps/ingestor/scripts/backfill-historicos.ts
git commit -m "feat(ingestor): drop explicit db connect call in backfill script"
```

---

### Task 7: Verificación end-to-end del stack completo en Docker Compose

**Files:** (ninguno — solo verificación)

- [ ] **Step 1: Levantar todo el stack**

Run: `docker compose down -v` (limpia el volumen de Postgres para partir de cero)
Run: `docker compose up -d`
Expected: los 4 servicios (`postgres`, `web`, `ingestor`, `poller`) arrancan sin errores de build.

- [ ] **Step 2: Aplicar la migración contra el Postgres de compose**

Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:migrate`
Expected: termina sin error (el volumen es nuevo, así que aplica la migración desde cero).

- [ ] **Step 3: Verificar logs del poller**

Run: `docker compose logs poller --tail 20`
Expected: se ven líneas `--- <timestamp> ---` con respuestas JSON del ingestor (no errores de conexión).

- [ ] **Step 4: Verificar el endpoint de web**

Run: `curl -s -w "\nstatus: %{http_code}\n" "http://localhost:3000/api/historial?tipo=ultimos10dias"`
Expected: `status: 200`, `{"eventos":[...]}` con datos.

- [ ] **Step 5: Apagar el stack**

Run: `docker compose down`
