---
tags: [api]
---

# API Reference

## apps/web (`apps/web/app/api/`)

### `GET /api/sismos?since=<ISO date>`
Sismos ocurridos desde `since` (requerido, se valida como fecha parseable). `400` si falta o es inválida. Fuente: `getSismosDesde` (`lib/fetch-sismos.ts` → `@sismos/db`).

### `GET /api/historial?tipo=<historico|top10anios|ultimos10dias>&soloChile=<true|false>`
`tipo` requerido (enum validado, `400` si no matchea). `soloChile` solo aplica a `tipo=historico`. Tres queries distintas según `tipo`: `getTopHistoricos(soloChile)`, `getTop10UltimosAnios()`, `getUltimos10Dias()`.

### `GET /api/estadisticas?granularidad=<GranularidadConteo>&soloChile=<true|false>`
Devuelve resumen del período (ventana fija según granularidad: 7 días / 8 semanas / 365 días / 5 años) + conteo agrupado para el gráfico de barras. Listado individual acotado a `LIMITE_LISTADO = 200` filas (el conteo total de arriba de la pantalla no está acotado). Ver comentarios en el propio archivo para el razonamiento de las ventanas — no son arbitrarias, decisión explícita del producto.

### `POST /api/push/subscribe`
Body: `{ subscription: { endpoint, keys: { p256dh, auth } }, magnitudMinima, centro?: {lat, lon} | null, radioKm?, alcanceMundial? }`. Valida `magnitudMinima` en `[4, 7]` (`esMagnitudValida`) y el centro/radio (`esCentroValido`/`esRadioKmValido` de `lib/radio-notificacion.ts`). Guarda con `guardarSuscripcion`.

### `GET /api/push/subscribe`
Lee la suscripción del usuario/endpoint actual (`obtenerSuscripcion`).

### `DELETE /api/push/subscribe`
Da de baja una suscripción (`eliminarSuscripcion`).

### `POST /api/auth/register`
Body: `{ email, password, name? }`. Valida email (contiene `@`) y password (mínimo 8 caracteres) antes de crear el usuario con `createUserConPassword` (`bcryptjs` para el hash).

### `GET|POST /api/auth/[...nextauth]`
Handlers de NextAuth v5 (`handlers` exportado desde `lib/auth.ts`) — login/logout/callback de Google, sesión JWT.

### `GET /api/admin/usuarios`
Requiere admin (`requireAdminApi()` — `403`/`401` si no). Devuelve `id, name, email, role, createdAt` de todos los usuarios (`listUsers()`). Nunca expone `passwordHash` (mapeo manual a propósito, no spread).

### `GET /api/admin/reportes`
Requiere admin. Hoy solo devuelve `{ ok: true }` — la pantalla de reportes en el admin todavía muestra "Próximamente", no hay datos reales aún. Ver [[Pendientes/Panel de Salud - Admin]].

## apps/ingestor (`apps/ingestor/app/api/`)

### `GET /api/ingest`
Protegido con `CRON_SECRET` — acepta `Authorization: Bearer <secret>` **o** header `x-cron-secret: <secret>` (dos formas porque el cron externo de GitHub Actions usa `x-cron-secret` y el cron nativo de Vercel usa `Bearer`). `401` si falta o no matchea. Ejecuta `runIngest()` (`lib/ingest.ts`): fetch CSN (+ fallback GAEL) y USGS → normaliza → dedupe → guarda en Postgres → dispara push a suscriptores que matchean magnitud/radio. Devuelve el resumen de la corrida.

Ver [[05 - Infra y CI]] para quién llama a este endpoint y con qué frecuencia real (no coincide con lo que dice el cron nativo de Vercel).
