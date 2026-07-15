# Diseño: migración de Mongoose/MongoDB a Postgres/Neon (Drizzle)

**Fecha:** 2026-07-15
**Alcance:** Reemplazar la capa de datos de `packages/db` (Mongoose + MongoDB) por Drizzle ORM sobre Postgres (Neon en producción, Postgres local en Docker Compose para desarrollo). Cubre ambos modelos existentes (`Sismo`, `SismoHistorico`), sus funciones de query, y los call-sites en `apps/ingestor` y `apps/web` que dependen de `@sismos/db`.

**Motivo:** Vercel no ofrece MongoDB Atlas como integración nativa del Marketplace (verificado con `vercel integration discover`), y la producción nunca llegó a tener `MONGODB_URI` configurada. Como no hay datos reales en producción todavía, se aprovecha para migrar a Postgres/Neon, que sí tiene soporte de primera clase en Vercel.

**Fuera de alcance de esta ronda:** tests automatizados (ya estaba fuera de alcance en el spec original del ingestor), mapa/UI, dedupe/lógica de negocio de `apps/ingestor/lib/ingest.ts` (no cambia, solo las funciones de `@sismos/db` que consume).

## Contexto

`packages/db` hoy expone:
- `getMongooseConnection()`: conexión cacheada a nivel de módulo, requiere `MONGODB_URI`.
- `SismoModel` / `SismoHistorico`: schemas Mongoose con `{ timestamps: true }`.
- Funciones de query en `src/queries/sismo.ts` y `src/queries/sismo-historico.ts`: `findRecentByFuente`, `upsertSismo`, `setRefCruzada`, `replaceWithCsn`, `findUltimos10Dias`, `findSismosSince`, `findTop10UltimosAnios`, `upsertSismoHistorico`, `findTopHistoricos`.

Consumen `@sismos/db`:
- `apps/ingestor/app/api/ingest/route.ts` (llama `getMongooseConnection()` antes de `runIngest()`)
- `apps/ingestor/lib/ingest.ts` (lógica de negocio, usa las funciones de query)
- `apps/ingestor/scripts/backfill-historicos.ts` (usa `upsertSismoHistorico`)
- `apps/web/lib/fetch-sismos.ts` (llama `getMongooseConnection()` antes de cada read)

No hay datos reales en producción (Mongo nunca estuvo configurado ahí), así que esta migración es una recreación de schema, no una migración de datos existentes.

## Arquitectura y flujo de datos

`packages/db` deja de exportar una función de conexión explícita. Internamente, un módulo crea una sola vez un cliente Drizzle usando el driver estándar de Postgres (`drizzle-orm/node-postgres` + `pg`), con un `Pool` de tamaño chico (`max: 1`, apropiado para funciones serverless con cold starts frecuentes). Las funciones de query lo usan directamente como singleton de módulo.

**Nota de corrección (post-aprobación del spec):** la primera versión de este diseño proponía `drizzle-orm/neon-http` + `@neondatabase/serverless`. Ese driver solo funciona contra la infraestructura HTTP propia de Neon, no contra un Postgres genérico — habría roto la decisión de usar Postgres local en Docker Compose para desarrollo. `node-postgres` (`pg`) funciona igual contra ambos: el Postgres local de Docker Compose y Neon en producción (usando el connection string "pooler" de Neon, pensado para este patrón de conexión desde funciones serverless).

Las firmas públicas de todas las funciones de query se mantienen idénticas (mismo nombre, mismos parámetros, misma forma de retorno) para que `apps/ingestor/lib/ingest.ts` no necesite cambios de lógica de negocio. Los call-sites que hoy hacen `await getMongooseConnection()` antes de leer/escribir (`route.ts`, `fetch-sismos.ts`, `backfill-historicos.ts`) eliminan esa línea — ya no existe un paso de conexión separado.

La variable de entorno pasa de `MONGODB_URI` a `DATABASE_URL` (convención estándar Postgres/Neon). Afecta: `.env.example`, `.env.local` de `apps/ingestor`, `turbo.json` (`globalEnv`), `docker-compose.yml`.

## ORM: Drizzle

Elegido sobre Prisma (más pesado, requiere paso `prisma generate` en build — otra fuente de fallos de deploy como el del cron) y sobre SQL crudo sin ORM (pierde migraciones versionadas y type-safety). Drizzle es TypeScript-first, sin engine binario separado, y es la combinación más común con Neon en templates de Vercel.

Dependencias en `packages/db`:
- Se elimina `mongoose`.
- Se agregan `drizzle-orm` y `pg` (dependencies).
- Se agrega `drizzle-kit` y `@types/pg` (devDependencies) para generar/correr migraciones y tipar el driver.

## Schema (`packages/db/src/schema.ts`)

### Tabla `sismos`

| columna | tipo Drizzle | notas |
|---|---|---|
| `id` | `serial` PK | surrogate key |
| `fuente` | `text` (`"csn" \| "usgs"`) | not null |
| `external_id` | `text` | not null |
| `fecha` | `timestamp` | not null |
| `magnitud` | `real` | not null |
| `profundidad_km` | `real` | not null |
| `latitud` | `double precision` | not null |
| `longitud` | `double precision` | not null |
| `lugar` | `text` | not null |
| `bandera` | `text` | nullable, default null |
| `ref_cruzada_fuente` | `text` | nullable — antes era `refCruzada.fuente` (objeto anidado en Mongo, aplanado acá) |
| `ref_cruzada_external_id` | `text` | nullable — antes era `refCruzada.externalId` |
| `created_at` | `timestamp` | default `now()` |
| `updated_at` | `timestamp` | default `now()`, seteado explícitamente en cada upsert (ver "Manejo de errores") |

Constraint único: `(fuente, external_id)` — reemplaza el índice único compuesto `{ fuente: 1, externalId: 1 }` de Mongoose.

Los tipos `Sismo`/`SismoNormalizado` en `@sismos/shared` que usan `refCruzada: { fuente, externalId }` como objeto anidado se mantienen igual a nivel de API pública de `@sismos/db` — las funciones de query hacen el mapeo entre las dos columnas planas de Postgres y el objeto anidado que espera `apps/ingestor/lib/ingest.ts`.

### Tabla `sismos_historicos`

| columna | tipo Drizzle | notas |
|---|---|---|
| `id` | `serial` PK | |
| `external_id` | `text`, unique | not null |
| `fecha` | `timestamp` | not null |
| `magnitud` | `real` | not null |
| `profundidad_km` | `real` | not null |
| `latitud` / `longitud` | `double precision` | not null |
| `lugar` | `text` | not null |
| `bandera` | `text` | nullable |
| `created_at` / `updated_at` | `timestamp` | default `now()` |

## Migraciones

- El schema se define en TypeScript (`packages/db/src/schema.ts`).
- `drizzle-kit generate` produce archivos SQL versionados en `packages/db/drizzle/`, comiteados al repo.
- Correr las migraciones es un paso manual explícito (script `pnpm --filter db db:migrate`), tanto contra Postgres local como contra Neon — no se automatiza dentro del build de Vercel, para evitar el tipo de sorpresa de deploy que ya tuvimos con el cron.

## Desarrollo local (Docker Compose)

- El servicio `mongo` de `docker-compose.yml` se reemplaza por `postgres:16` (puerto `5432`, volumen `postgres-data`, env `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`).
- Los servicios `web` e `ingestor` pasan de `MONGODB_URI=mongodb://mongo:27017/sismos` a `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/sismos`.
- El servicio `poller` no cambia (no depende de la base de datos directamente).

## Producción (Neon)

- El usuario crea el proyecto/branch en Neon (plan gratuito) manualmente en el dashboard de Neon, ya que Vercel no tiene esta integración nativa en el Marketplace.
- La connection string resultante se carga como `DATABASE_URL` en Vercel (mismo mecanismo ya usado para `CRON_SECRET`: archivo `.env.*.local` gitignored + import por dashboard).

## Manejo de errores

- Con `node-postgres`, el `Pool` se crea de forma perezosa (singleton a nivel de módulo) pero no valida la conexión hasta la primera query — ya no hay un paso explícito de "conectar" antes de cada request como con `getMongooseConnection()`. El `try/catch` en `apps/ingestor/app/api/ingest/route.ts` pasa a envolver la llamada real a `runIngest()`, y el mensaje de error de fallo pasa a describir un fallo de query, no de conexión.
- Drizzle no auto-actualiza `updated_at` en cada `UPDATE` (a diferencia de `{ timestamps: true }` de Mongoose) — las funciones de upsert (`upsertSismo`, `upsertSismoHistorico`, `setRefCruzada`, `replaceWithCsn`) setean `updated_at: new Date()` explícitamente en cada `$set`/`SET`.
- Fallos de red/parseo por fuente (CSN/USGS) en `ingest.ts` no cambian — ese manejo ya es correcto y no depende de la capa de datos.

## Fuera de alcance / diferido

- Tests automatizados (ya estaba fuera de alcance desde el spec original del ingestor)
- Cambios a la lógica de dedupe/normalización de `apps/ingestor/lib/ingest.ts` (solo cambian las funciones de `@sismos/db` que consume, no su comportamiento)
- Mapa/UI en `apps/web` (subsistema separado)
- Migración de datos existentes (no aplica — no hay datos reales en producción)
