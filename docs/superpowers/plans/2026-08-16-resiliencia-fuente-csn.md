# Resiliencia de la fuente CSN — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la app no deje de mostrar sismos de Chile cuando `api.xor.cl` (nuestra fuente CSN) se cae, y que no se manden ráfagas de notificaciones push por eventos atrasados cuando la fuente se recupera.

**Architecture:** `apps/ingestor/lib/ingest.ts` intenta `xor.cl` primero; si falla, usa GAEL Cloud como respaldo con geocodificación aproximada (GAEL no da coordenadas). Cuando `xor.cl` vuelve, reconcilia los eventos aproximados con datos precisos sin re-notificar. Un tope de antigüedad evita notificar sismos viejos, y una alerta push avisa al admin cuando `xor.cl` lleva mucho tiempo caído.

**Tech Stack:** TypeScript, Drizzle ORM (Postgres/Neon), Next.js (apps/web, apps/ingestor), pnpm workspaces + Turborepo, web-push, vitest (nuevo en este plan).

**Spec:** `docs/superpowers/specs/2026-08-16-resiliencia-fuente-csn-design.md`

## Global Constraints

- Solo Chile (CSN) — no toca la ingesta de USGS.
- `xor.cl` sigue siendo la fuente primaria; GAEL Cloud es respaldo, nunca al revés.
- Si `geocodificarAproximado` no reconoce la localidad, el evento se descarta — nunca se inventa una coordenada sin base.
- El tope de antigüedad para push es de 60 minutos, medido desde `evento.fecha`.
- El umbral para la alerta al admin es 2 horas sin una fila `fuente='csn'` con `ubicacionAproximada=false`.
- **Ajuste sobre el spec**: el repo no tiene ningún framework de testing instalado (no hay `vitest`/`jest` en ningún `package.json`, no hay tests existentes). Este plan agrega `vitest` solo en `packages/shared` para la lógica pura de geocodificación (Tarea 2). Las piezas que tocan la base de datos (`reemplazarConPrecision`, la reconciliación en `runIngest`) se verifican manualmente contra el Postgres local de `docker-compose.yml`, igual que el resto del código de `packages/db` en este repo (ninguna función de `packages/db` tiene tests hoy).

---

### Task 1: Tipo `ubicacionAproximada` en `SismoNormalizado`

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/normalize/csn.ts`
- Modify: `packages/shared/src/normalize/usgs.ts`

**Interfaces:**
- Produces: `SismoNormalizado.ubicacionAproximada: boolean` (campo nuevo, obligatorio) — todas las tareas que construyen un `SismoNormalizado` deben setearlo explícitamente.

- [ ] **Paso 1: Agregar el campo al tipo**

En `packages/shared/src/types.ts`, agregar `ubicacionAproximada` al final de la interfaz:

```ts
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
  ubicacionAproximada: boolean;
}
```

- [ ] **Paso 2: Actualizar `normalizeCsnSismo`**

En `packages/shared/src/normalize/csn.ts`, en el `return` de `normalizeCsnSismo`, agregar `ubicacionAproximada: false,` al final del objeto (los datos de `xor.cl` siempre traen coordenadas reales).

- [ ] **Paso 3: Actualizar `normalizeUsgsFeature`**

En `packages/shared/src/normalize/usgs.ts`, en el `return` de `normalizeUsgsFeature`, agregar `ubicacionAproximada: false,` al final del objeto.

- [ ] **Paso 4: Verificar tipos**

Run: `cd packages/shared && pnpm run check-types`
Expected: sin errores. Si `tsc` marca los dos `return` como incompletos, revisar que el campo se agregó en ambos archivos.

- [ ] **Paso 5: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/normalize/csn.ts packages/shared/src/normalize/usgs.ts
git commit -m "feat(shared): agregar campo ubicacionAproximada a SismoNormalizado"
```

---

### Task 2: Geocodificación aproximada (con setup de vitest)

**Files:**
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/geocodificacion-aproximada.ts`
- Create: `packages/shared/src/geocodificacion-aproximada.test.ts`
- Modify: `packages/shared/package.json`
- Modify: `turbo.json`
- Modify: `package.json` (raíz)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `DireccionCardinal`, `parsearReferenciaGeografica(texto: string): { distanciaKm: number; direccion: DireccionCardinal; localidad: string } | null`, `calcularDestino(origen: { lat: number; lon: number }, direccion: DireccionCardinal, distanciaKm: number): { lat: number; lon: number }`, `geocodificarAproximado(refGeografica: string): { lat: number; lon: number } | null` — usados por la Tarea 3.

- [ ] **Paso 1: Instalar vitest en packages/shared**

Run: `pnpm add -D vitest --filter @sismos/shared`

Agregar el script de test en `packages/shared/package.json` (dentro de `"scripts"`, junto a `"lint"` y `"check-types"`):

```json
"test": "vitest run"
```

- [ ] **Paso 2: Config de vitest**

Crear `packages/shared/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Paso 3: Registrar la task `test` en Turborepo**

En `turbo.json`, agregar dentro de `"tasks"` (junto a `"check-types"`):

```json
"test": {
  "dependsOn": ["^test"]
}
```

En el `package.json` raíz, agregar en `"scripts"` (junto a `"check-types"`):

```json
"test": "turbo run test"
```

- [ ] **Paso 4: Escribir los tests (deben fallar primero, el módulo no existe)**

Crear `packages/shared/src/geocodificacion-aproximada.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parsearReferenciaGeografica,
  calcularDestino,
  geocodificarAproximado,
} from "./geocodificacion-aproximada";
import { haversineDistanceKm } from "./dedupe";

describe("parsearReferenciaGeografica", () => {
  it("parsea distancia, dirección y localidad", () => {
    expect(parsearReferenciaGeografica("38 km al O de Valparaíso")).toEqual({
      distanciaKm: 38,
      direccion: "O",
      localidad: "Valparaíso",
    });
  });

  it("parsea localidades de dos palabras", () => {
    expect(parsearReferenciaGeografica("54 km al SO de Mina Collahuasi")).toEqual({
      distanciaKm: 54,
      direccion: "SO",
      localidad: "Mina Collahuasi",
    });
  });

  it("devuelve null si el texto no matchea el patrón", () => {
    expect(parsearReferenciaGeografica("South Atlantic Ocean")).toBeNull();
  });
});

describe("calcularDestino", () => {
  it("el punto calculado queda a la distancia esperada del origen", () => {
    const origen = { lat: -33.047, lon: -71.612 }; // Valparaíso
    const destino = calcularDestino(origen, "O", 38);
    const distancia = haversineDistanceKm(
      origen.lat,
      origen.lon,
      destino.lat,
      destino.lon,
    );
    expect(distancia).toBeCloseTo(38, 0);
    expect(destino.lon).toBeLessThan(origen.lon);
  });

  it("una distancia al norte aumenta la latitud", () => {
    const origen = { lat: -33.047, lon: -71.612 };
    const destino = calcularDestino(origen, "N", 20);
    expect(destino.lat).toBeGreaterThan(origen.lat);
  });
});

describe("geocodificarAproximado", () => {
  it("geocodifica una referencia conocida", () => {
    expect(geocodificarAproximado("38 km al O de Valparaíso")).not.toBeNull();
  });

  it("devuelve null si la localidad no está en el diccionario", () => {
    expect(geocodificarAproximado("100 km al N de Narnia")).toBeNull();
  });

  it("devuelve null si el texto no matchea el patrón", () => {
    expect(geocodificarAproximado("South Atlantic Ocean")).toBeNull();
  });
});
```

- [ ] **Paso 5: Correr los tests para confirmar que fallan**

Run: `cd packages/shared && pnpm run test`
Expected: FAIL — `Cannot find module './geocodificacion-aproximada'`

- [ ] **Paso 6: Implementar el módulo**

Crear `packages/shared/src/geocodificacion-aproximada.ts`:

```ts
export type DireccionCardinal = "N" | "NE" | "E" | "SE" | "S" | "SO" | "O" | "NO";

const RUMBOS: Record<DireccionCardinal, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SO: 225,
  O: 270,
  NO: 315,
};

const EARTH_RADIUS_KM = 6371;

const PATRON_REFERENCIA =
  /^(\d+(?:\.\d+)?)\s*km\s+al\s+(N|NE|E|SE|S|SO|O|NO)\s+de\s+(.+)$/i;

export interface ReferenciaGeografica {
  distanciaKm: number;
  direccion: DireccionCardinal;
  localidad: string;
}

export function parsearReferenciaGeografica(
  texto: string,
): ReferenciaGeografica | null {
  const match = PATRON_REFERENCIA.exec(texto.trim());
  if (!match) return null;
  const [, distanciaStr, direccionStr, localidad] = match;
  return {
    distanciaKm: Number(distanciaStr),
    direccion: direccionStr.toUpperCase() as DireccionCardinal,
    localidad: localidad.trim(),
  };
}

// Coordenadas aproximadas (centro urbano) de las localidades que CSN usa
// como referencia. Se amplía a mano cuando aparezca una localidad nueva no
// reconocida en el feed de GAEL Cloud.
export const DICCIONARIO_LOCALIDADES: Record<string, { lat: number; lon: number }> = {
  "Arica": { lat: -18.478, lon: -70.323 },
  "Iquique": { lat: -20.213, lon: -70.152 },
  "Pica": { lat: -20.489, lon: -69.325 },
  "Mina Collahuasi": { lat: -20.983, lon: -68.683 },
  "Calama": { lat: -22.456, lon: -68.929 },
  "Antofagasta": { lat: -23.65, lon: -70.4 },
  "Socaire": { lat: -23.593, lon: -67.884 },
  "Mina La Escondida": { lat: -24.267, lon: -69.067 },
  "Ollagüe": { lat: -21.225, lon: -68.257 },
  "Copiapó": { lat: -27.367, lon: -70.332 },
  "La Serena": { lat: -29.907, lon: -71.252 },
  "Coquimbo": { lat: -29.953, lon: -71.339 },
  "Pichidangui": { lat: -32.117, lon: -71.533 },
  "Valparaíso": { lat: -33.047, lon: -71.612 },
  "Quintero": { lat: -32.777, lon: -71.531 },
  "Quillota": { lat: -32.883, lon: -71.249 },
  "Viña del Mar": { lat: -33.024, lon: -71.552 },
  "Santiago": { lat: -33.447, lon: -70.673 },
  "Rancagua": { lat: -34.17, lon: -70.744 },
  "Talca": { lat: -35.426, lon: -71.666 },
  "Linares": { lat: -35.847, lon: -71.594 },
  "Chillán": { lat: -36.606, lon: -72.103 },
  "Concepción": { lat: -36.827, lon: -73.05 },
  "Temuco": { lat: -38.735, lon: -72.59 },
  "Valdivia": { lat: -39.814, lon: -73.246 },
  "Puerto Montt": { lat: -41.469, lon: -72.942 },
  "Coyhaique": { lat: -45.571, lon: -72.068 },
  "Punta Arenas": { lat: -53.163, lon: -70.917 },
};

export function calcularDestino(
  origen: { lat: number; lon: number },
  direccion: DireccionCardinal,
  distanciaKm: number,
): { lat: number; lon: number } {
  const rumboRad = (RUMBOS[direccion] * Math.PI) / 180;
  const distanciaAngular = distanciaKm / EARTH_RADIUS_KM;
  const lat1 = (origen.lat * Math.PI) / 180;
  const lon1 = (origen.lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanciaAngular) +
      Math.cos(lat1) * Math.sin(distanciaAngular) * Math.cos(rumboRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(rumboRad) * Math.sin(distanciaAngular) * Math.cos(lat1),
      Math.cos(distanciaAngular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

export function geocodificarAproximado(
  refGeografica: string,
): { lat: number; lon: number } | null {
  const referencia = parsearReferenciaGeografica(refGeografica);
  if (!referencia) return null;
  const origen = DICCIONARIO_LOCALIDADES[referencia.localidad];
  if (!origen) return null;
  return calcularDestino(origen, referencia.direccion, referencia.distanciaKm);
}
```

- [ ] **Paso 7: Correr los tests para confirmar que pasan**

Run: `cd packages/shared && pnpm run test`
Expected: PASS (9 tests)

- [ ] **Paso 8: Exportar el módulo nuevo**

En `packages/shared/src/index.ts`, agregar la línea (junto a las demás `export *`):

```ts
export * from "./geocodificacion-aproximada";
```

- [ ] **Paso 9: Lint y tipos**

Run: `cd packages/shared && pnpm run lint && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 10: Commit**

```bash
git add packages/shared/vitest.config.ts packages/shared/src/geocodificacion-aproximada.ts packages/shared/src/geocodificacion-aproximada.test.ts packages/shared/src/index.ts packages/shared/package.json turbo.json package.json pnpm-lock.yaml
git commit -m "feat(shared): geocodificación aproximada para referencias de texto de GAEL Cloud"
```

---

### Task 3: Normalización de eventos GAEL Cloud

**Files:**
- Create: `packages/shared/src/normalize/gael.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `geocodificarAproximado` (Tarea 2), `SismoNormalizado` (Tarea 1).
- Produces: `GaelSismoRaw` (tipo del payload crudo de GAEL), `normalizeGaelSismo(raw: GaelSismoRaw): SismoNormalizado | null` — usado por `apps/ingestor/lib/fetch-gael.ts` (Tarea 7) e `ingest.ts` (Tarea 9).

- [ ] **Paso 1: Implementar la normalización**

Crear `packages/shared/src/normalize/gael.ts`:

```ts
import { geocodificarAproximado } from "../geocodificacion-aproximada";
import type { SismoNormalizado } from "../types";

export interface GaelSismoRaw {
  Fecha: string;
  Profundidad: string;
  Magnitud: string;
  RefGeografica: string;
  FechaUpdate: string;
}

function idSinteticoGael(raw: GaelSismoRaw): string {
  return `gael-${raw.Fecha}-${raw.Magnitud}-${raw.RefGeografica}`.replace(
    /\s+/g,
    "-",
  );
}

export function normalizeGaelSismo(raw: GaelSismoRaw): SismoNormalizado | null {
  const ubicacion = geocodificarAproximado(raw.RefGeografica);
  if (!ubicacion) return null;

  return {
    fuente: "csn",
    externalId: idSinteticoGael(raw),
    fecha: new Date(`${raw.Fecha.replace(" ", "T")}Z`),
    magnitud: Number(raw.Magnitud),
    profundidadKm: Number(raw.Profundidad),
    latitud: ubicacion.lat,
    longitud: ubicacion.lon,
    lugar: raw.RefGeografica,
    bandera: "🇨🇱",
    ubicacionAproximada: true,
  };
}
```

- [ ] **Paso 2: Exportar**

En `packages/shared/src/index.ts`, agregar:

```ts
export * from "./normalize/gael";
```

- [ ] **Paso 3: Verificar tipos**

Run: `cd packages/shared && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add packages/shared/src/normalize/gael.ts packages/shared/src/index.ts
git commit -m "feat(shared): normalizar eventos de GAEL Cloud a SismoNormalizado"
```

---

### Task 4: Schema de base de datos

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: migración Drizzle generada en `packages/db/drizzle/`

**Interfaces:**
- Produces: columna `sismos.ubicacionAproximada` (boolean, default false), tabla `estadoIngesta` — usados por la Tarea 5.

- [ ] **Paso 1: Agregar la columna a `sismos`**

En `packages/db/src/schema.ts`, dentro de la definición de columnas de `sismos` (antes del cierre del objeto de columnas, junto a `updatedAt`):

```ts
ubicacionAproximada: boolean("ubicacion_aproximada").notNull().default(false),
```

- [ ] **Paso 2: Agregar la tabla `estadoIngesta`**

Al final de `packages/db/src/schema.ts`, después de `pushSubscriptions`:

```ts
export const estadoIngesta = pgTable("estado_ingesta", {
  fuente: text("fuente").primaryKey(),
  ultimaAlertaEnviada: timestamp("ultima_alerta_enviada"),
});
```

- [ ] **Paso 3: Generar la migración**

Asegurarse que Postgres local está arriba: `docker compose up -d postgres` (desde la raíz del repo).

Run: `cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm run db:generate`
Expected: crea un archivo nuevo en `packages/db/drizzle/` (ej. `0005_algo.sql`) con `ALTER TABLE "sismos" ADD COLUMN "ubicacion_aproximada" boolean DEFAULT false NOT NULL;` y `CREATE TABLE "estado_ingesta" (...)`.

- [ ] **Paso 4: Aplicar la migración localmente**

Run: `cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm run db:migrate`
Expected: termina sin error. Verificar con:

```bash
docker exec -it $(docker compose ps -q postgres) psql -U postgres -d sismos -c "\d sismos" -c "\d estado_ingesta"
```

Debe mostrar la columna `ubicacion_aproximada` en `sismos` y la tabla `estado_ingesta` con columna `fuente` (PK) y `ultima_alerta_enviada`.

- [ ] **Paso 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle/
git commit -m "feat(db): agregar ubicacionAproximada a sismos y tabla estado_ingesta"
```

---

### Task 5: Queries de base de datos

**Files:**
- Modify: `packages/db/src/queries/sismo.ts`
- Create: `packages/db/src/queries/estado-ingesta.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: schema de la Tarea 4, `SismoNormalizado` de la Tarea 1.
- Produces: `Sismo.ubicacionAproximada: boolean`, `reemplazarConPrecision(externalIdAproximado: string, eventoPreciso: SismoNormalizado): Promise<Sismo | null>`, `findRecentAproximados(since: Date): Promise<Sismo[]>`, `findUltimoCsnPreciso(): Promise<Date | null>`, `getUltimaAlertaEnviada(fuente: string): Promise<Date | null>`, `marcarAlertaEnviada(fuente: string): Promise<void>` — usados por `ingest.ts` (Tarea 9).

- [ ] **Paso 1: Agregar el campo a `Sismo` y `toSismo`**

En `packages/db/src/queries/sismo.ts`, en la interfaz `Sismo` (después de `updatedAt: Date;`):

```ts
ubicacionAproximada: boolean;
```

En `toSismo()`, agregar dentro del `return`:

```ts
ubicacionAproximada: row.ubicacionAproximada,
```

- [ ] **Paso 2: Propagar el campo en `upsertSismo`**

En `upsertSismo`, agregar `ubicacionAproximada: evento.ubicacionAproximada,` tanto en el objeto de `.values({...})` como en el de `.set({...})` (mismo lugar donde están `bandera` y `lugar`).

- [ ] **Paso 3: Agregar `reemplazarConPrecision`**

Después de la función `replaceWithCsn` existente, agregar:

```ts
export async function reemplazarConPrecision(
  externalIdAproximado: string,
  eventoPreciso: SismoNormalizado,
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      externalId: eventoPreciso.externalId,
      fecha: eventoPreciso.fecha,
      magnitud: eventoPreciso.magnitud,
      profundidadKm: eventoPreciso.profundidadKm,
      latitud: eventoPreciso.latitud,
      longitud: eventoPreciso.longitud,
      lugar: eventoPreciso.lugar,
      bandera: eventoPreciso.bandera,
      ubicacionAproximada: false,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sismos.fuente, "csn"), eq(sismos.externalId, externalIdAproximado)),
    )
    .returning();
  return row ? toSismo(row) : null;
}
```

- [ ] **Paso 4: Agregar `findRecentAproximados`**

Después de `findRecentByFuente`, agregar:

```ts
export async function findRecentAproximados(since: Date): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(
      and(
        eq(sismos.fuente, "csn"),
        eq(sismos.ubicacionAproximada, true),
        gte(sismos.fecha, since),
      ),
    );
  return rows.map(toSismo);
}
```

- [ ] **Paso 5: Agregar `findUltimoCsnPreciso`**

Al final del archivo, agregar:

```ts
export async function findUltimoCsnPreciso(): Promise<Date | null> {
  const [row] = await getDb()
    .select({ actualizado: sismos.updatedAt })
    .from(sismos)
    .where(and(eq(sismos.fuente, "csn"), eq(sismos.ubicacionAproximada, false)))
    .orderBy(desc(sismos.updatedAt))
    .limit(1);
  return row?.actualizado ?? null;
}
```

- [ ] **Paso 6: Crear `estado-ingesta.ts`**

Crear `packages/db/src/queries/estado-ingesta.ts`:

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../connection";
import { estadoIngesta } from "../schema";

export async function getUltimaAlertaEnviada(
  fuente: string,
): Promise<Date | null> {
  const [row] = await getDb()
    .select()
    .from(estadoIngesta)
    .where(eq(estadoIngesta.fuente, fuente));
  return row?.ultimaAlertaEnviada ?? null;
}

export async function marcarAlertaEnviada(fuente: string): Promise<void> {
  await getDb()
    .insert(estadoIngesta)
    .values({ fuente, ultimaAlertaEnviada: new Date() })
    .onConflictDoUpdate({
      target: estadoIngesta.fuente,
      set: { ultimaAlertaEnviada: new Date() },
    });
}
```

- [ ] **Paso 7: Exportar el módulo nuevo**

En `packages/db/src/index.ts`, agregar:

```ts
export * from "./queries/estado-ingesta";
```

- [ ] **Paso 8: Verificar tipos**

Run: `cd packages/db && pnpm run check-types`
Expected: sin errores.

- [ ] **Paso 9: Verificación manual contra Postgres local**

Con el Postgres local arriba y migrado (Tarea 4), desde `packages/db`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { upsertSismo, reemplazarConPrecision, findRecentAproximados } from "./src/index.ts";

const aproximado = {
  fuente: "csn" as const,
  externalId: "test-aproximado-1",
  fecha: new Date(),
  magnitud: 4.2,
  profundidadKm: 20,
  latitud: -32.9,
  longitud: -71.9,
  lugar: "48 km al NO de Valparaíso",
  bandera: "🇨🇱",
  ubicacionAproximada: true,
};

await upsertSismo(aproximado);
const candidatos = await findRecentAproximados(new Date(Date.now() - 60 * 60 * 1000));
console.log("candidatos aproximados:", candidatos.length);

const preciso = { ...aproximado, externalId: "379999", latitud: -32.777, longitud: -71.531, ubicacionAproximada: false };
const actualizado = await reemplazarConPrecision("test-aproximado-1", preciso);
console.log("reemplazado:", actualizado?.externalId, actualizado?.ubicacionAproximada, actualizado?.latitud);
process.exit(0);
'
```

Expected: `candidatos aproximados: 1`, luego `reemplazado: 379999 false -32.777`.

- [ ] **Paso 10: Commit**

```bash
git add packages/db/src/queries/sismo.ts packages/db/src/queries/estado-ingesta.ts packages/db/src/index.ts
git commit -m "feat(db): queries para reconciliación de ubicación aproximada y alertas de ingesta"
```

---

### Task 6: Reintentos en `fetch-csn.ts`

**Files:**
- Modify: `apps/ingestor/lib/fetch-csn.ts`

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `fetchCsnRecent()` con el mismo tipo de retorno de siempre (`Promise<CsnSismoRaw[]>`), ahora con reintentos internos.

- [ ] **Paso 1: Implementar el reintento**

Reemplazar el contenido completo de `apps/ingestor/lib/fetch-csn.ts`:

```ts
import type { CsnSismoRaw } from "@sismos/shared";

const CSN_URL = "https://api.xor.cl/sismo/recent";
const REINTENTOS = 3;
const ESPERA_MS = [1000, 3000];

interface CsnResponse {
  status_code: number;
  status_description: string;
  events: CsnSismoRaw[];
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchCsnRecent(): Promise<CsnSismoRaw[]> {
  let ultimoError: unknown;
  for (let intento = 0; intento < REINTENTOS; intento++) {
    try {
      const res = await fetch(CSN_URL);
      if (!res.ok) {
        throw new Error(`CSN fetch failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as CsnResponse;
      return data.events;
    } catch (error) {
      ultimoError = error;
      if (intento < REINTENTOS - 1) {
        await esperar(ESPERA_MS[intento]);
      }
    }
  }
  throw ultimoError;
}
```

- [ ] **Paso 2: Verificar tipos**

Run: `cd apps/ingestor && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add apps/ingestor/lib/fetch-csn.ts
git commit -m "fix(ingestor): reintentos con backoff antes de dar por caído a xor.cl"
```

---

### Task 7: Fetch de GAEL Cloud

**Files:**
- Create: `apps/ingestor/lib/fetch-gael.ts`

**Interfaces:**
- Consumes: `GaelSismoRaw` (Tarea 3, vía `@sismos/shared`).
- Produces: `fetchGaelRecent(): Promise<GaelSismoRaw[]>` — usado por `ingest.ts` (Tarea 9).

- [ ] **Paso 1: Implementar**

Crear `apps/ingestor/lib/fetch-gael.ts`:

```ts
import type { GaelSismoRaw } from "@sismos/shared";

const GAEL_URL = "https://api.gael.cloud/general/public/sismos";

export async function fetchGaelRecent(): Promise<GaelSismoRaw[]> {
  const res = await fetch(GAEL_URL);
  if (!res.ok) {
    throw new Error(`GAEL fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GaelSismoRaw[];
}
```

- [ ] **Paso 2: Verificación manual contra la API real**

Run: `cd apps/ingestor && npx tsx -e '
import { fetchGaelRecent } from "./lib/fetch-gael.ts";
const eventos = await fetchGaelRecent();
console.log("eventos:", eventos.length, eventos[0]);
'`
Expected: imprime un número > 0 y el primer evento con campos `Fecha`, `Magnitud`, `RefGeografica`.

- [ ] **Paso 3: Verificar tipos**

Run: `cd apps/ingestor && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/ingestor/lib/fetch-gael.ts
git commit -m "feat(ingestor): fetch de GAEL Cloud como fuente de respaldo"
```

---

### Task 8: Tope de antigüedad y alerta admin en `send-push.ts`

**Files:**
- Modify: `apps/ingestor/lib/send-push.ts`

**Interfaces:**
- Consumes: nada nuevo (usa `webpush`/`configurarVapid` ya existentes en el archivo).
- Produces: `enviarPushParaSismo` ahora omite sismos con `fecha` de más de 60 minutos; `enviarAlertaAdmin(mensaje: string): Promise<void>` — usado por `ingest.ts` (Tarea 9).

- [ ] **Paso 1: Agregar el tope de antigüedad**

En `apps/ingestor/lib/send-push.ts`, agregar la constante junto a `UMBRAL_TERREMOTO`:

```ts
const TOPE_ANTIGUEDAD_PUSH_MS = 60 * 60 * 1000;
```

Al inicio del cuerpo de `enviarPushParaSismo`, antes de `configurarVapid();`, agregar:

```ts
const antiguedadMs = Date.now() - evento.fecha.getTime();
if (antiguedadMs > TOPE_ANTIGUEDAD_PUSH_MS) {
  console.log(
    `[send-push] omitiendo push para ${evento.externalId}: antigüedad ${Math.round(antiguedadMs / 60000)}min supera el tope de 60min`,
  );
  return;
}
```

- [ ] **Paso 2: Agregar `enviarAlertaAdmin`**

Al final del archivo, agregar:

```ts
export async function enviarAlertaAdmin(mensaje: string): Promise<void> {
  const endpoint = process.env.ALERTA_PUSH_ENDPOINT;
  const p256dh = process.env.ALERTA_PUSH_P256DH;
  const auth = process.env.ALERTA_PUSH_AUTH;
  if (!endpoint || !p256dh || !auth) {
    console.warn(
      "[send-push] alerta admin no configurada (faltan ALERTA_PUSH_ENDPOINT/P256DH/AUTH)",
    );
    return;
  }

  configurarVapid();
  const payload = JSON.stringify({
    title: "Sismos — alerta de ingesta",
    body: mensaje,
    url: "/",
  });

  try {
    await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload);
  } catch (error) {
    console.error("[send-push] error enviando alerta admin:", error);
  }
}
```

- [ ] **Paso 3: Verificación manual del tope de antigüedad**

Run: `cd apps/ingestor && npx tsx -e '
import { enviarPushParaSismo } from "./lib/send-push.ts";
const eventoViejo = {
  fuente: "csn" as const,
  externalId: "test-viejo",
  fecha: new Date(Date.now() - 2 * 60 * 60 * 1000),
  magnitud: 5,
  profundidadKm: 10,
  latitud: -33,
  longitud: -71,
  lugar: "test",
  bandera: "🇨🇱",
  ubicacionAproximada: false,
};
await enviarPushParaSismo(eventoViejo);
console.log("terminó sin lanzar excepción");
'`
Expected: imprime el log `[send-push] omitiendo push...` seguido de `terminó sin lanzar excepción` (no debe intentar `configurarVapid`, así que no falla aunque falten las variables VAPID en el entorno local).

- [ ] **Paso 4: Verificar tipos**

Run: `cd apps/ingestor && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add apps/ingestor/lib/send-push.ts
git commit -m "feat(ingestor): tope de antigüedad para push y alerta push al admin"
```

---

### Task 9: Orquestación en `ingest.ts`

**Files:**
- Modify: `apps/ingestor/lib/ingest.ts`

**Interfaces:**
- Consumes: `fetchGaelRecent` (Tarea 7), `normalizeGaelSismo` (Tarea 3), `reemplazarConPrecision`, `findRecentAproximados`, `findUltimoCsnPreciso`, `getUltimaAlertaEnviada`, `marcarAlertaEnviada` (Tarea 5), `enviarAlertaAdmin` (Tarea 8).
- Produces: `runIngest()` con el mismo tipo de retorno de siempre (`Promise<IngestSummary>`), ahora con fallback, reconciliación y alerta.

- [ ] **Paso 1: Actualizar imports**

En `apps/ingestor/lib/ingest.ts`, reemplazar los imports del inicio del archivo por:

```ts
import {
  findDuplicate,
  normalizeCsnSismo,
  normalizeUsgsFeature,
  normalizeGaelSismo,
  UMBRAL_MAGNITUD_MUNDIAL,
  type SismoNormalizado,
} from "@sismos/shared";
import {
  findRecentByFuente,
  findRecentAproximados,
  findUltimoCsnPreciso,
  replaceWithCsn,
  reemplazarConPrecision,
  setRefCruzada,
  upsertSismo,
  getUltimaAlertaEnviada,
  marcarAlertaEnviada,
} from "@sismos/db";
import { fetchCsnRecent } from "./fetch-csn";
import { fetchGaelRecent } from "./fetch-gael";
import { fetchUsgsRecent } from "./fetch-usgs";
import { enviarPushParaSismo, enviarAlertaAdmin } from "./send-push";
```

- [ ] **Paso 2: Reemplazar el bloque de fetch de CSN**

Reemplazar:

```ts
  let csnEventos: SismoNormalizado[] = [];
  try {
    const raw = await fetchCsnRecent();
    csnEventos = raw.map(normalizeCsnSismo);
    summary.csn.fetched = csnEventos.length;
  } catch (error) {
    console.error("[ingest] CSN fetch failed:", error);
    summary.csn.errors = 1;
  }
```

por:

```ts
  let csnEventos: SismoNormalizado[] = [];
  let csnPreciso = true;
  try {
    const raw = await fetchCsnRecent();
    csnEventos = raw.map(normalizeCsnSismo);
    summary.csn.fetched = csnEventos.length;
  } catch (error) {
    console.error("[ingest] CSN fetch failed, intentando respaldo GAEL:", error);
    summary.csn.errors = 1;
    csnPreciso = false;
    try {
      const rawGael = await fetchGaelRecent();
      csnEventos = rawGael
        .map(normalizeGaelSismo)
        .filter((evento): evento is SismoNormalizado => evento !== null);
      summary.csn.fetched = csnEventos.length;
    } catch (gaelError) {
      console.error("[ingest] GAEL fetch failed:", gaelError);
    }
  }
```

- [ ] **Paso 3: Agregar la reconciliación al loop de eventos CSN**

Reemplazar el `for (const evento of csnEventos) { ... }` existente por:

```ts
  for (const evento of csnEventos) {
    if (csnPreciso) {
      const aproximadoCandidatos = await findRecentAproximados(since);
      const matchAproximado = findDuplicate(
        evento,
        aproximadoCandidatos as SismoNormalizado[],
      );
      if (matchAproximado) {
        await reemplazarConPrecision(matchAproximado.externalId, evento);
        summary.csn.inserted += 1;
        continue;
      }
    }

    const usgsCandidatos = await findRecentByFuente("usgs", since);
    const match = findDuplicate(evento, usgsCandidatos as SismoNormalizado[]);
    if (match) {
      await replaceWithCsn(match.externalId, evento);
      summary.deduped += 1;
    } else {
      const { esNuevo } = await upsertSismo(evento);
      summary.csn.inserted += 1;
      if (esNuevo && evento.magnitud >= 4) {
        try {
          await enviarPushParaSismo(evento);
        } catch (error) {
          console.error("[ingest] push notification failed:", error);
        }
      }
    }
  }
```

(La variable `since` ya existe más arriba en la función, sin cambios.)

- [ ] **Paso 4: Agregar la revisión de alerta al final de `runIngest`**

Antes del `return summary;` final de la función, agregar:

```ts
  await revisarAlertaCsn();

  return summary;
```

- [ ] **Paso 5: Agregar la función `revisarAlertaCsn`**

Al final del archivo, después de `runIngest`, agregar:

```ts
const UMBRAL_ALERTA_CSN_MS = 2 * 60 * 60 * 1000;

async function revisarAlertaCsn(): Promise<void> {
  const ultimoPreciso = await findUltimoCsnPreciso();
  const antiguedadMs = ultimoPreciso
    ? Date.now() - ultimoPreciso.getTime()
    : Infinity;
  if (antiguedadMs < UMBRAL_ALERTA_CSN_MS) return;

  const ultimaAlerta = await getUltimaAlertaEnviada("csn");
  if (
    ultimaAlerta &&
    Date.now() - ultimaAlerta.getTime() < UMBRAL_ALERTA_CSN_MS
  ) {
    return;
  }

  const horas = Math.round(antiguedadMs / (60 * 60 * 1000));
  await enviarAlertaAdmin(`CSN (xor.cl) lleva ${horas}h sin actualizar datos precisos.`);
  await marcarAlertaEnviada("csn");
}
```

- [ ] **Paso 6: Verificar tipos**

Run: `cd apps/ingestor && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 7: Verificación manual end-to-end**

Con Postgres local arriba y migrado, y las envs de `apps/ingestor/.env.local` cargadas (`DATABASE_URL` apuntando a local):

```bash
cd apps/ingestor && npx tsx --env-file=.env.local -e '
import { runIngest } from "./lib/ingest.ts";
const resumen = await runIngest();
console.log(JSON.stringify(resumen, null, 2));
'
```

Expected: termina sin lanzar excepción y muestra un resumen con `csn`, `usgs`, `deduped`. Si `xor.cl` está arriba en ese momento, `csn.errors` debería ser 0; si está caído, debería intentar GAEL y `csn.fetched` reflejar los eventos de GAEL que sí geocodificaron.

- [ ] **Paso 8: Commit**

```bash
git add apps/ingestor/lib/ingest.ts
git commit -m "feat(ingestor): fallback a GAEL, reconciliación y alerta de ingesta en runIngest"
```

---

### Task 10: Tipos y mapeo en el frontend

**Files:**
- Modify: `apps/web/lib/tipos-sismo.ts`
- Modify: `apps/web/app/page.tsx`

**Interfaces:**
- Consumes: `Sismo.ubicacionAproximada` (Tarea 5).
- Produces: `SismoMapa.ubicacionAproximada: boolean`, `SismoSeleccionado.ubicacionAproximada?: boolean` — usados por las Tareas 11 y 12.

- [ ] **Paso 1: Agregar el campo a los tipos**

En `apps/web/lib/tipos-sismo.ts`, agregar `ubicacionAproximada: boolean;` al final de `SismoMapa`, y `ubicacionAproximada?: boolean;` al final de `SismoSeleccionado` (mismo estilo opcional que `bandera?`/`profundidadKm?` en esa interfaz).

- [ ] **Paso 2: Propagar en el mapeo de `page.tsx`**

En `apps/web/app/page.tsx`, dentro del `.map((s) => ({ ... }))` que construye `sismosIniciales`, agregar al final del objeto:

```ts
ubicacionAproximada: s.ubicacionAproximada,
```

- [ ] **Paso 3: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add apps/web/lib/tipos-sismo.ts apps/web/app/page.tsx
git commit -m "feat(web): propagar ubicacionAproximada a los tipos del frontend"
```

---

### Task 11: Indicador visual en el marcador

**Files:**
- Modify: `apps/web/components/mapa/marcador.ts`

**Interfaces:**
- Consumes: nada nuevo (parámetro opcional agregado a una función existente).
- Produces: `crearElementoMarcador` acepta ahora `opciones.ubicacionAproximada?: boolean` — usado por la Tarea 12.

- [ ] **Paso 1: Agregar el parámetro y el estilo**

En `apps/web/components/mapa/marcador.ts`, cambiar la firma de `crearElementoMarcador`:

```ts
export function crearElementoMarcador(
  magnitud: number,
  opciones: {
    pulsando: boolean;
    lugar: string;
    fecha: string;
    ubicacionAproximada?: boolean;
  },
): HTMLDivElement {
```

Cambiar el `aria-label` del `wrapper`:

```ts
  wrapper.setAttribute(
    "aria-label",
    `Sismo M${magnitud} en ${opciones.lugar}${opciones.ubicacionAproximada ? " (ubicación aproximada)" : ""}, ${new Date(opciones.fecha).toLocaleString("es-CL")}`,
  );
```

Cambiar la línea del borde del `dot`:

```ts
  dot.style.border = opciones.ubicacionAproximada
    ? "2px dashed rgba(255, 255, 255, 0.8)"
    : "2px solid rgba(255, 255, 255, 0.8)";
```

- [ ] **Paso 2: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add apps/web/components/mapa/marcador.ts
git commit -m "feat(web): borde punteado en el marcador para sismos de ubicación aproximada"
```

---

### Task 12: Wiring en `MapaSismos.tsx`

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `SismoMapa.ubicacionAproximada`, `SismoSeleccionado.ubicacionAproximada` (Tarea 10), `crearElementoMarcador` con el nuevo parámetro (Tarea 11).

- [ ] **Paso 1: Pasar el flag al crear el marcador**

En `crearMarcador`, dentro de la llamada a `crearElementoMarcador`, agregar `ubicacionAproximada: sismo.ubicacionAproximada,` al objeto de opciones (junto a `lugar` y `fecha`).

- [ ] **Paso 2: Agregar la línea en el popup**

En `construirHtmlPopup`, dentro de `<div class="popup-sismo-info">`, después del bloque que muestra `fechaTexto`/`profundidadKm`, agregar:

```ts
        ${
          sismo.ubicacionAproximada
            ? `<div class="popup-sismo-region">📍 Ubicación aproximada</div>`
            : ""
        }
```

(Reutiliza la clase `popup-sismo-region` ya existente en `globals.css`, sin agregar CSS nuevo.)

- [ ] **Paso 3: Pasar el flag también en el marcador de selección**

En el `useEffect` que maneja `sismoSeleccionado` (el que crea `crearElementoSeleccion`), no hace falta cambio — `crearElementoSeleccion` no dibuja el punto de color, solo el marcador de foco; el indicador visual relevante es el de `construirHtmlPopup`, ya cubierto en el Paso 2.

- [ ] **Paso 4: Verificar tipos**

Run: `cd apps/web && pnpm exec tsc --noEmit`
Expected: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat(web): mostrar indicador de ubicación aproximada en el mapa"
```

---

### Task 13: Verificación manual end-to-end

**Files:** ninguno nuevo — solo verificación.

- [ ] **Paso 1: Lint y tipos en todo el monorepo**

Run (desde la raíz): `pnpm run lint && pnpm run check-types`
Expected: sin errores en ningún paquete.

- [ ] **Paso 2: Suite de tests**

Run (desde la raíz): `pnpm run test`
Expected: los 9 tests de `packages/shared` pasan.

- [ ] **Paso 3: Sembrar un sismo aproximado en la base local**

Con Postgres local arriba y migrado:

```bash
cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { upsertSismo } from "./src/index.ts";
await upsertSismo({
  fuente: "csn",
  externalId: "test-visual-aproximado",
  fecha: new Date(),
  magnitud: 4.5,
  profundidadKm: 15,
  latitud: -32.9,
  longitud: -71.9,
  lugar: "48 km al NO de Valparaíso",
  bandera: "🇨🇱",
  ubicacionAproximada: true,
});
console.log("sembrado");
process.exit(0);
'
```

- [ ] **Paso 4: Levantar el frontend local apuntando a la base local**

Run: `cd apps/web && pnpm exec next dev --webpack -p 3050` (Postgres local ya debe estar arriba desde el Paso 3; usar `--webpack` porque Turbopack no soporta el config de `@serwist/next` que usa este proyecto).

- [ ] **Paso 5: Verificar visualmente en el navegador**

Abrir `http://localhost:3050`, ubicar el pin sembrado en el Paso 3 (cerca de Valparaíso) y confirmar:
- El punto tiene borde punteado (no sólido).
- Al hacer click, el popup muestra la línea "📍 Ubicación aproximada".

- [ ] **Paso 6: Limpiar el dato de prueba**

```bash
cd packages/db && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos npx tsx -e '
import { getDb } from "./src/connection.ts";
import { sismos } from "./src/schema.ts";
import { eq } from "drizzle-orm";
await getDb().delete(sismos).where(eq(sismos.externalId, "test-visual-aproximado"));
console.log("limpiado");
process.exit(0);
'
```

- [ ] **Paso 7: Apagar el entorno local**

```bash
docker compose down
```

Este es el único paso del plan que no termina en un commit — es verificación, no cambia código.
