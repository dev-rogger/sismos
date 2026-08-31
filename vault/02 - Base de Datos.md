---
tags: [base-de-datos]
---

# Base de Datos

> ⚠️ **Corrección**: el `CLAUDE.md` del workspace (`~/Sites/CLAUDE.md`) y el `README.md` de este repo describen la base de datos como "MongoDB (Mongoose)". Eso está **desactualizado**. El código real de `packages/db` usa **PostgreSQL** vía **Drizzle ORM** (`drizzle-orm/node-postgres` + `pg`). No hay Mongoose ni MongoDB en ningún `package.json` del monorepo.

## Motor y conexión

- `packages/db/src/connection.ts` — pool `pg.Pool` (max 1 conexión, pensado para entorno serverless) envuelto en `drizzle()`. `DATABASE_URL` es la env var requerida (definida global en `turbo.json`).
- Nota deliberada en el código: `sslmode=require` se reescribe a `sslmode=no-verify` porque `pg` con `sslmode=require` ahora se comporta como `verify-full` y rechaza la cadena de certificados del proveedor (Neon/Supabase-style); mantiene la conexión encriptada pero sin validar la cadena.
- Local: `docker-compose.yml` levanta `postgres:16` con DB `sismos`, user/pass `postgres/postgres`, puerto 5432.

## Migraciones

- Drizzle Kit. Config en `packages/db/drizzle.config.ts`.
- Migraciones SQL versionadas en `packages/db/drizzle/000N_*.sql` (6 migraciones al momento de escribir esto, `0000` a `0006`).
- Scripts: `pnpm --filter @sismos/db db:generate` (genera migración desde el schema) y `db:migrate` (aplica).

## Schema (`packages/db/src/schema.ts`)

### `sismos`
Eventos activos/recientes. Columnas clave: `fuente`, `externalId` (unique compuesto con `fuente`), `fecha`, `magnitud`, `profundidadKm`, `latitud`/`longitud`, `lugar`, `bandera`, `refCruzadaFuente`/`refCruzadaExternalId` (para dedupe entre CSN/GAEL y USGS cuando el mismo sismo aparece en ambas fuentes), `ubicacionAproximada` (bool — cuando se geocodificó de forma aproximada).

### `sismosHistoricos`
Top históricos. Tiene `alcance` (`"mundial" | "chile"`, default `"mundial"`) — un mismo evento puede existir una vez por alcance (ej. Valdivia 1960 aparece en el top mundial y en el top de Chile como dos filas). Unique compuesto `(externalId, alcance)`.

### `users`
`id` UUID generado en la app (`crypto.randomUUID()`, no `serial`), `email` unique, `passwordHash` (nullable — null cuando el usuario entró solo por Google), `role` (`"user" | "admin"`, default `"user"`).

### `pushSubscriptions`
Suscripción Web Push: `endpoint`/`p256dh`/`auth` (credenciales del navegador), `magnitudMinima` (default 4), filtro geográfico opcional (`centroLat`/`centroLon`/`radioKm`) o `alcanceMundial`, `userId` (FK opcional a `users`, nullable — se puede suscribir sin cuenta).

### `estadoIngesta`
Una fila por `fuente` (PK), guarda `ultimaAlertaEnviada` — throttling de notificaciones para no re-alertar el mismo tipo de evento repetidamente.

## Queries (`packages/db/src/queries/`)

| Archivo | Qué expone |
|---|---|
| `sismo.ts` | CRUD/lecturas de `sismos` (usado por `apps/web` para el mapa/API `/api/sismos` y por el ingestor para guardar) |
| `sismo-historico.ts` | Lecturas de `sismosHistoricos` (usado por `/api/historial`), incluye `GranularidadConteo` para agrupar conteos (día/semana/mes/año) usado en `/api/estadisticas` |
| `push-subscription.ts` | Alta/baja/lectura de `pushSubscriptions` |
| `estado-ingesta.ts` | `getUltimaAlertaEnviada` / `marcarAlertaEnviada` — throttling de alertas por fuente |
| `user.ts` | `findUserByEmail`, `createUserConPassword`, `upsertUsuarioGoogle`, `listUsers` |

Todo se re-exporta desde `packages/db/src/index.ts` (schema + todas las queries), consumido como `@sismos/db` desde `apps/web` y `apps/ingestor`.

## Pendiente de verificar

No se confirmó si hay un proveedor Postgres gestionado en producción (Neon, Supabase, RDS, etc.) — el comentario sobre `sslmode=no-verify` en `connection.ts` sugiere un proveedor tipo Neon/Supabase, pero el nombre exacto no está en el código explorado. Si se necesita, revisar `.vercel/project.json` o el dashboard de Vercel (env vars del proyecto).
