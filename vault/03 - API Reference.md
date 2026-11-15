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
Body: `{ subscription: { endpoint, keys: { p256dh, auth } }, magnitudMinima, centro?: {lat, lon} | null, radioKm?, alcanceMundial? }`. Valida `magnitudMinima` en `[4, 7]` (`esMagnitudValida`) y el centro/radio (`esCentroValido`/`esRadioKmValido` de `lib/radio-notificacion.ts`). Guarda con `guardarSuscripcion`. Endurecido: rate limit en memoria por IP (20 req/min, best-effort — en serverless cada instancia tiene su contador; `429`), JSON inválido → `400`, y el `endpoint` debe ser `https` con host en allowlist (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `push.apple.com`, `notify.windows.com` y subdominios) con tamaños máximos (endpoint 1024, claves 256 caracteres) y sin puerto explícito ni credenciales (`user:pass@`) en la URL — ver `esEndpointPushPermitido` en `packages/shared/src/push-endpoint.ts`. El ingestor vuelve a validar al enviar y borra las suscripciones antiguas con endpoint no permitido.

### `GET /api/push/subscribe`
Lee la suscripción del usuario/endpoint actual (`obtenerSuscripcion`).

### `DELETE /api/push/subscribe`
Da de baja una suscripción (`eliminarSuscripcion`). Mismo rate limit y manejo de JSON inválido que el POST.

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
Protegido con `CRON_SECRET` — acepta `Authorization: Bearer <secret>` **o** header `x-cron-secret: <secret>` (dos formas porque el cron externo de GitHub Actions usa `x-cron-secret` y el cron nativo de Vercel usa `Bearer`). `401` si falta o no matchea (o si `CRON_SECRET` no está definido); la comparación es en tiempo constante (`timingSafeEqual`). Ejecuta `runIngest()` (`lib/ingest.ts`): fetch CSN (+ fallback GAEL) y USGS → normaliza → dedupe → guarda en Postgres → decide y dispara push (ver abajo). Devuelve el resumen de la corrida.

**Notificación basada en estado de BD**: tras cada escritura, `notificarSiCorresponde` llama a `decidirNotificacion` (`@sismos/shared`) con `notificadoAt`/`magnitudNotificada` de la fila, no con "es nuevo". Reglas: no avisa sismos de más de 1 h; una fila CSN M>=4 avisada solo con otra fuente (`fuenteNotificada` distinta de `csn`, p. ej. un M7+ visto antes por USGS) se avisa una vez más a la audiencia de Chile, omitiendo a los de `alcanceMundial` si ya habían recibido el aviso mundial (`omitirAlcanceMundial`); sin aviso previo avisa si `magnitud >=` umbral (4 para CSN, `UMBRAL_MAGNITUD_MUNDIAL` para el resto); ya avisado, re-avisa solo si la magnitud subió `>= 0.5` (motivo `revision`). Si CSN reemplaza una fila USGS o reconcilia una aproximada, la fila conserva su estado, así que avisa una sola vez. Si el push lanza, la fila no se marca y la siguiente corrida reintenta (dentro de la hora); `enviarPushParaSismo` lanza si todos los envíos fallan con 5xx/red (los 404/410 no cuentan), pero con fallo parcial el sismo se marca igual para no duplicar. El cruce CSN↔USGS usa los candidatos de 24 h y lo decide `findDuplicate`. Los candidatos se cargan una sola vez por ciclo (`findRecentByFuentes`), sin N+1.

**Destinatarios** (`seleccionarDestinatarios`, `packages/shared/src/destinatarios.ts`): fuentes no-CSN → solo `alcanceMundial` con magnitud mínima mundial. CSN → regla A (`magnitudMinima <= magnitud` y dentro del círculo si lo hay) o regla B de **rescate**: evento bajo su `magnitudMinima` pero `M >= 5.0` (`PISO_RESCATE_MAG`), profundidad válida, dentro de su círculo y dentro del radio donde se estima MMI >= IV (`radioMmiKm`, `radio-percepcion.ts`, movido a `packages/shared`).

**Envío** (`lib/send-push.ts`): TTL 1 h, `topic` (hash corto del `externalId`, el servicio de push reemplaza el aviso pendiente del mismo sismo), payload con `tag`/`timestamp`/`renotify` (solo en revisiones; el service worker `app/sw.ts` los usa), lotes de 50 envíos concurrentes, borra la suscripción ante `404`/`410`, y el texto aclara "Aviso informativo posterior al sismo, no es una alerta temprana". Registra `push` en `ingesta_estado`.

### `GET /api/health`
Sin secreto. `200` si `csn` tiene `ultimoOk` de hace menos de 15 min; `503` si no, o si la BD no responde. Body: `{ ok, fuentes: { <fuente>: { edadSegundos } } }` — nunca expone mensajes de error ni timestamps. "csn ok" = la ingesta completa corrió hasta el final (CSN preciso o respaldo GAEL). Lo consulta el job `watchdog` del workflow. Estado en `ingesta_estado` ([[02 - Base de Datos]]).

Ver [[05 - Infra y CI]] para quién llama a este endpoint y con qué frecuencia real (no coincide con lo que dice el cron nativo de Vercel).
