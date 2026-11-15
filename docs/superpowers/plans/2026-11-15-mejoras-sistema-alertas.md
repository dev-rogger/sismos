# Mejoras del sistema de detección y alerta — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que ningún sismo relevante se quede sin aviso, que el aviso llegue lo más rápido posible, y que nos enteremos cuando el sistema deje de funcionar.

**Architecture:** Se agrega estado persistente de notificación (`notificado_at`, `magnitud_notificada`) para que la decisión de avisar sea una función pura sobre datos de BD y no dependa de `esNuevo`. Se endurece el endpoint de suscripción, se mejora el envío push (TTL, tag, 404/410, concurrencia), se agrega observabilidad de la ingesta (heartbeat + estado por fuente) y se cubre la ruta crítica con tests unitarios con mocks.

**Tech Stack:** Next.js 16, Drizzle ORM + Postgres (Neon), web-push, vitest, pnpm/Turborepo.

**Spec:** auditoría del subagente (sesión del 2026-11-15, hallazgos A1–A4, M1–M7, B1–B5). Informe resumido en este documento; no hay spec separada. Arquitectura base: `vault/01 - Arquitectura del Sistema.md`, `vault/05 - Infra y CI.md`.

## Global Constraints

- Rama de trabajo: worktree desde `develop` (`feat/mejoras-alertas`). Commit → push `develop` → merge a `main` → push solo al final y con revisión (ver memoria `workflow_branch`).
- Copy en español neutro con "tú". Prohibido voseo argentino y modismos chilenos.
- Drizzle: migraciones con `pnpm --filter @sismos/db` (revisar scripts de `packages/db/package.json`); nunca editar a mano migraciones ya aplicadas (`drizzle/0000`–`0006`).
- No hay precedente de tests de integración con Postgres: los tests son unitarios con mocks de `@sismos/db` y `web-push`.
- Umbrales vigentes que no se cambian sin decisión explícita: piso CSN M>=4, `UMBRAL_MAGNITUD_MUNDIAL`, `UMBRAL_TERREMOTO = 6.5`, `TOPE_ANTIGUEDAD_PUSH_MS = 60 min`.
- Verificación por tarea: `pnpm lint && pnpm check-types && pnpm test` en los paquetes tocados.
- No se llama a servicios externos reales en tests. Las fuentes nuevas (M4) requieren verificar disponibilidad y licencia antes de adoptarlas.
- Pasos manuales fuera del repo (cron-job.org, healthchecks, secrets de GitHub/Vercel) los hace Rodrigo; el plan los marca `[MANUAL]`.

## Review Focus

- Sismo que sube de M3.9 a M4.1 en una relectura: debe avisar una vez (hoy nunca avisa).
- Sismo ya avisado como M4.2 que se revisa a M5.8: debe re-avisar y reemplazar la notificación anterior (mismo `tag`).
- Sismo que USGS ve primero y CSN reemplaza después: los suscriptores de Chile deben recibir aviso una sola vez.
- Falla del envío push a mitad de la ingesta: el sismo no queda marcado como notificado y se reintenta en la siguiente corrida (dentro del tope de 60 min).
- `endpoint` de suscripción con host no permitido, `http://`, o de longitud absurda: se rechaza con 400 y no llega a la BD.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `apps/web/app/api/push/subscribe/route.ts` | Validar endpoint (allowlist, https, tamaños), rate limit |
| `apps/web/lib/push-endpoint.ts` (nuevo) | `esEndpointPushPermitido(url: string): boolean` y constantes de límites |
| `packages/db/src/schema` (export `../schema`) | Columnas `notificadoAt`, `magnitudNotificada` en `sismos`; tabla `ingestaEstado` |
| `packages/db/drizzle/0007_*.sql` | Migración generada |
| `packages/db/src/queries/sismo.ts` | `marcarNotificado`, ajuste de `replaceWithCsn`/`upsertSismo` para exponer estado, `findRecentByFuentes` batch |
| `packages/shared/src/decision-notificacion.ts` (nuevo) | `decidirNotificacion(...)` función pura |
| `packages/shared/src/dedupe.ts` | `findDuplicate` elige mejor candidato (distancia+tiempo) |
| `apps/ingestor/lib/ingest.ts` | Usar decisión pura, batch de candidatos, registrar heartbeat |
| `apps/ingestor/lib/send-push.ts` | 404/410, TTL, topic, concurrencia, hora con zona, contadores, texto honesto |
| `apps/web/app/sw.ts` | `tag`, `timestamp`, `actions` en la notificación |
| `packages/db/src/queries/ingesta-estado.ts` (nuevo) | `registrarIngestaOk`, `registrarIngestaError`, `getEstadoIngesta` |
| `apps/ingestor/app/api/health/route.ts` (nuevo) | Estado de salud para monitores externos |
| `apps/ingestor/app/api/ingest/route.ts` | `timingSafeEqual` |
| `packages/shared/src/radio-percepcion.ts` | Movido desde `apps/web/lib/radio-percepcion.ts` (Tarea 7) |

Orden de dependencias: T1 ∥ T2 → T3 → T4 → T5 → T6 → T7 → T8 (docs). T1 y T2 no comparten archivos y pueden ir en paralelo.

---

### Task 1: Endurecer `/api/push/subscribe` (A4)

**Files:**
- Create: `apps/web/lib/push-endpoint.ts`, `apps/web/lib/push-endpoint.test.ts`
- Modify: `apps/web/app/api/push/subscribe/route.ts`, `apps/web/package.json` (script `test` con vitest si no existe)

**Interfaces:**
- Produces: `esEndpointPushPermitido(endpoint: string): boolean`; constantes `MAX_ENDPOINT_LENGTH = 1024`, `MAX_KEY_LENGTH = 256`.

- [ ] **Step 1: Tests** en `push-endpoint.test.ts`: acepta `https://fcm.googleapis.com/fcm/send/abc`, `https://updates.push.services.mozilla.com/wpush/v2/x`, `https://web.push.apple.com/x`, `https://wns2-par02p.notify.windows.com/x`; rechaza `http://fcm.googleapis.com/x`, `https://evil.com/x`, `https://fcm.googleapis.com.evil.com/x`, `https://127.0.0.1/x`, string no-URL, endpoint de 2000 caracteres.
- [ ] **Step 2:** Ejecutar `pnpm --filter web test` y ver que falla.
- [ ] **Step 3:** Implementar `esEndpointPushPermitido` con `new URL`, `protocol === "https:"` y allowlist de sufijos de host (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `push.apple.com`, `notify.windows.com`), comparando por `host === s || host.endsWith("." + s)`.
- [ ] **Step 4:** En `route.ts` POST: rechazar con 400 si el endpoint no es permitido o si `endpoint`/`keys` exceden los máximos. Rate limit por IP en POST/DELETE (memoria en proceso, 20 req/min; documentar en comentario que es best-effort en serverless). Envolver `request.json()` en try/catch → 400.
- [ ] **Step 5:** Verificar tests, `pnpm --filter web lint check-types`. Commit `fix(web): valida el endpoint de suscripción push (allowlist, https, tamaños)`.

---

### Task 2: Infra de tests del ingestor y `findDuplicate` robusto (M5)

**Files:**
- Modify: `apps/ingestor/package.json` (script `test`, devDependency `vitest`), `packages/shared/src/dedupe.ts`
- Create: `apps/ingestor/vitest.config.ts`, `packages/shared/src/dedupe.test.ts`

**Interfaces:**
- Produces: `findDuplicate(candidate, others)` mantiene firma; ahora devuelve el candidato con menor puntaje `distanciaKm/MAX_DISTANCE_KM + dtMs/TIME_WINDOW_MS` entre los que cumplen los tres filtros.

- [ ] **Step 1: Tests** en `dedupe.test.ts`: (a) dos candidatos válidos, devuelve el más cercano aunque venga segundo; (b) fuera de ventana de 2 min → null; (c) >100 km → null; (d) diferencia de magnitud >0.5 → null; (e) lista vacía → null.
- [ ] **Step 2:** Correr y ver fallar (a).
- [ ] **Step 3:** Implementar selección del mejor candidato en `dedupe.ts`.
- [ ] **Step 4:** Agregar vitest al ingestor (script `"test": "vitest run"`), config mínima con `environment: "node"`. Un test de humo trivial para confirmar que corre.
- [ ] **Step 5:** `pnpm test` verde. Commit `test: infra de tests del ingestor; findDuplicate elige el mejor candidato`.

---

### Task 3: Estado de notificación en BD (base de A2/A3)

**Files:**
- Modify: schema de `packages/db` (tabla `sismos`), `packages/db/src/queries/sismo.ts`, `packages/db/src/index.ts` (exports)
- Create: migración `0007_*.sql` generada con drizzle-kit

**Interfaces:**
- Produces: columnas `notificado_at timestamptz null`, `magnitud_notificada double precision null` en `sismos`; el tipo `Sismo` suma `notificadoAt: Date | null`, `magnitudNotificada: number | null`; `marcarNotificado(fuente: SismoFuente, externalId: string, magnitud: number): Promise<void>`; `findRecentByFuentes(fuentes: SismoFuente[], since: Date): Promise<Sismo[]>`.

- [ ] **Step 1:** Agregar columnas al schema y a `toSismo`. Generar migración con el script de drizzle del paquete; revisar el SQL (solo `ALTER TABLE ... ADD COLUMN`, nullable, sin backfill destructivo).
- [ ] **Step 2:** Backfill documentado en la migración o en el commit: las filas existentes quedan `notificado_at = NULL`. Riesgo: tras desplegar, la primera corrida podría re-avisar sismos recientes. Mitigación: la regla de decisión (T4) ignora sismos con antigüedad > `TOPE_ANTIGUEDAD_PUSH_MS`, así que el único riesgo es la última hora; la migración hace `UPDATE sismos SET notificado_at = updated_at, magnitud_notificada = magnitud WHERE magnitud >= 4` para marcar lo existente como ya avisado.
- [ ] **Step 3:** `replaceWithCsn` y `actualizarFilaCsn`/`reemplazarConPrecision` deben **conservar** `notificadoAt` y `magnitudNotificada` de la fila previa (no pisarlos). Test de forma mínima o revisión manual del SQL generado, dado que no hay tests con Postgres.
- [ ] **Step 4:** Implementar `marcarNotificado` y `findRecentByFuentes`; exportarlos.
- [ ] **Step 5:** `pnpm --filter @sismos/db lint check-types`. Commit `feat(db): estado de notificación por sismo (notificado_at, magnitud_notificada)`.
- [ ] **Step 6 [MANUAL]:** aplicar la migración en Neon antes de desplegar el ingestor (confirmar con Rodrigo el procedimiento actual, ver `vault/05`).

---

### Task 4: Decisión de notificar como función pura + refactor de `runIngest` (A2, A3, M6)

**Files:**
- Create: `packages/shared/src/decision-notificacion.ts`, `packages/shared/src/decision-notificacion.test.ts`, `apps/ingestor/lib/ingest.test.ts`
- Modify: `packages/shared/src/index.ts`, `apps/ingestor/lib/ingest.ts`

**Interfaces:**
- Consumes (T3): `Sismo.notificadoAt`, `Sismo.magnitudNotificada`, `marcarNotificado`, `findRecentByFuentes`.
- Produces: `decidirNotificacion(input: { magnitud: number; fecha: Date; fuente: SismoFuente; notificadoAt: Date | null; magnitudNotificada: number | null; ahora: Date }): { enviar: boolean; motivo: "nuevo" | "revision" | null }`.

Regla de `decidirNotificacion`: nunca si antigüedad > 60 min; umbral por fuente (csn: M>=4, no-csn: M>=`UMBRAL_MAGNITUD_MUNDIAL`); si `notificadoAt === null` y supera umbral → `nuevo`; si ya notificado y `magnitud - magnitudNotificada >= 0.5` → `revision`; en otro caso no.

- [ ] **Step 1: Tests** de `decidirNotificacion`: M3.9→M4.1 sin notificar (envía `nuevo`); M4.2 notificado→M5.8 (`revision`); M4.2→M4.4 (no); sismo de 90 min (no); USGS M6 (no), USGS M7 (sí); ya notificado sin cambio (no).
- [ ] **Step 2:** Implementar y exportar.
- [ ] **Step 3: Tests** de `runIngest` en `ingest.test.ts` con `vi.mock` de `@sismos/db`, `./fetch-*`, `./send-push`: (a) CSN nuevo M4.5 → 1 push y `marcarNotificado`; (b) mismo evento relecturado sin cambio → 0 push; (c) falla `enviarPushParaSismo` → NO se llama `marcarNotificado`; (d) USGS ya existente reemplazado por CSN y sin `notificadoAt` → 1 push (caso A2); (e) failover GAEL con match preciso existente → 0 push; (f) CSN cae y GAEL cae → no lanza, resumen con errors=1.
- [ ] **Step 4:** Refactor de `ingest.ts`: reemplazar `esNuevo && magnitud >= X` por `decidirNotificacion` sobre la fila resultante; llamar `marcarNotificado` solo tras envío exitoso (con al menos 0 destinatarios válidos o sin error). Cargar `findRecentByFuentes(["csn","usgs"], desdeReconciliacion)` y `findRecentAproximados` **una vez** antes de los bucles y filtrar en memoria (M6); actualizar la lista en memoria cuando se inserte/reemplace.
- [ ] **Step 5:** Todos los tests verdes, lint, types. Commit `feat(ingestor): decisión de notificar basada en estado de BD; elimina N+1`.

---

### Task 5: Mejorar el envío push (M1, M2, M3, B1)

**Files:**
- Modify: `apps/ingestor/lib/send-push.ts`, `apps/web/app/sw.ts`
- Create: `apps/ingestor/lib/send-push.test.ts`

**Interfaces:**
- Consumes (T4): `enviarPushParaSismo(evento, opts?: { motivo: "nuevo" | "revision" })`.
- Produces: `enviarPushParaSismo(...): Promise<{ enviados: number; fallidos: number; eliminados: number }>`; el payload suma `tag: string` (`sismo-${externalId}`) y `timestamp: number` (ms del evento).

- [ ] **Step 1: Tests** con `vi.mock("web-push")`: (a) 404 y 410 borran la suscripción, 500 no; (b) `sendNotification` recibe `TTL: 3600` y `topic` derivado del externalId (≤32 chars, base64url seguro); (c) con 250 suscripciones nunca hay más de 50 envíos en vuelo; (d) el título para `motivo: "revision"` indica "actualizado"; (e) la hora usa `timeZone: "America/Santiago"`; (f) devuelve contadores correctos.
- [ ] **Step 2:** Implementar: TTL 3600, `topic`, concurrencia acotada (lotes de 50), borrado en 404/410, contadores, `timeZone` explícita, `console.log` con el resumen de envío.
- [ ] **Step 3:** Cuerpo del mensaje: agregar "aviso posterior al sismo" de forma breve, p.ej. `· hace N min · Aviso informativo`, sin prometer alerta temprana.
- [ ] **Step 4:** `sw.ts`: pasar `tag`, `timestamp`, `renotify: true` en revisiones; mantener click-through y verificar que `client.navigate` tenga fallback a `clients.openWindow`.
- [ ] **Step 5:** `pnpm --filter ingestor test lint check-types` y `pnpm --filter web lint check-types`. Commit `feat(push): TTL, tag, limpieza 404/410 y concurrencia acotada`.

---

### Task 6: Observabilidad de la ingesta y segundo disparador (A1, B3, B4, B5)

**Files:**
- Create: `packages/db/src/queries/ingesta-estado.ts`, `apps/ingestor/app/api/health/route.ts`, `apps/ingestor/app/api/health/route.test.ts`
- Modify: schema + migración `0008_*.sql`, `apps/ingestor/lib/ingest.ts`, `apps/ingestor/app/api/ingest/route.ts`, `.github/workflows/ingest-cron.yml`

**Interfaces:**
- Produces: tabla `ingesta_estado(fuente text pk, ultimo_ok timestamptz, ultimo_error timestamptz, ultimo_error_msg text)`; `registrarIngestaOk(fuente: "csn" | "usgs" | "gael" | "push")`, `registrarIngestaError(fuente, msg: string)`, `getEstadoIngesta(): Promise<EstadoFuente[]>`; `GET /api/health` → `200 { ok: true, fuentes }` si `ultimo_ok` de `csn` < 15 min, si no `503`.

- [ ] **Step 1:** Schema + migración + queries. Registrar OK/error por fuente al final de `runIngest` y en cada `catch` de fetch.
- [ ] **Step 2: Tests** del route `/api/health` (mock de `getEstadoIngesta`): fresco → 200; viejo → 503; sin filas → 503.
- [ ] **Step 3:** `/api/health` sin secreto (no expone datos sensibles: solo edades en segundos y nombres de fuente).
- [ ] **Step 4:** `/api/ingest`: comparación del secreto con `crypto.timingSafeEqual` (longitudes distintas → 401); mantener GET (lo exige Vercel Cron).
- [ ] **Step 5:** Workflow de GitHub: segundo job `watchdog` que consulta `/api/health` y falla con `exit 1` si responde 503 (GitHub avisa por correo). Mantener el job de ingesta.
- [ ] **Step 6:** `enviarAlertaAdmin`: además del push, agregar canal alterno por correo/webhook solo si hay env configurada (`ALERTA_WEBHOOK_URL`); sin env, no hace nada. Test de que no falla si falta la env.
- [ ] **Step 7:** Commit `feat(ingestor): estado de salud de la ingesta, /api/health y watchdog`.
- [ ] **Step 8 [MANUAL]:** (a) confirmar si cron-job.org sigue pegando cada 1 min y a qué URL; (b) crear un monitor externo (healthchecks.io/UptimeRobot, a elección) que pegue a `/api/health` cada 5 min y avise a Rodrigo; (c) agregar `ALERTA_WEBHOOK_URL` en Vercel si se desea canal alterno.

---

### Task 7: Destinatarios por radio de percepción (M7)

**Files:**
- Move: `apps/web/lib/radio-percepcion.ts` → `packages/shared/src/radio-percepcion.ts` (+ su test si existe); re-exportar desde `@sismos/shared`; actualizar imports en `apps/web/components/mapa/MapaSismos.tsx`
- Modify: `packages/db/src/queries/push-subscription.ts` (`findSubscripcionesParaSismo` recibe `profundidadKm`)
- Create: tests de selección de destinatarios (función pura `seleccionarDestinatarios` extraída)

**Interfaces:**
- Consumes: `radioPercepcionKm(magnitud: number, profundidadKm: number): number` (firma real a confirmar leyendo el archivo).
- Produces: `seleccionarDestinatarios(subs: PushSubscription[], evento: { magnitud; latitud; longitud; profundidadKm; fuente }): PushSubscription[]` (pura, en `packages/shared` o `packages/db/src/lib`).

Regla propuesta: se mantiene el filtro actual por `magnitudMinima` y círculo del usuario; se **suma** que suscriptores con centro definido dentro de `radioPercepcionKm` del sismo reciben aviso aunque el sismo sea ≥ 1 punto menor a su `magnitudMinima`... **No se implementa sin aprobación del usuario y revisión del `sismologia-guardian`**: es un cambio de producto que altera a quién se avisa.

- [ ] **Step 1:** Invocar `sismologia-guardian` (solo propuesta) para validar el modelo y la regla con números antes/después. Presentar resultado a Rodrigo y esperar decisión.
- [ ] **Step 2 (tras aprobación):** mover módulo, extraer función pura, tests (usuario dentro del radio de percepción sí; fuera no; sin centro = recibe según `magnitudMinima`; profundidad grande reduce el radio).
- [ ] **Step 3:** Commit `feat(push): destinatarios según radio de percepción estimado`.

---

### Task 8: Fuentes y cadencia más rápidas (M4) — investigación

**Files:** ninguno al inicio; produce nota en `vault/Pendientes/`.

- [ ] **Step 1:** Medir demora real de `api.xor.cl` vs. publicación oficial CSN y vs. USGS/EMSC para 5–10 sismos recientes de Chile (script de lectura, sin escribir en BD). Reportar latencias.
- [ ] **Step 2:** Evaluar EMSC/FDSN y `all_hour` de USGS: disponibilidad, términos/licencia, formato. Entregar recomendación con evidencia; no adoptar sin aprobación.
- [ ] **Step 3 [MANUAL]:** subir cron-job.org a 1 min (si no está) y confirmar cadencia efectiva con el campo `ultimo_ok` de T6.

---

### Task 9: Documentación y revisión final

- [ ] **Step 1:** Invocar `docs-agent` para actualizar `CLAUDE.md`, `README.md` y `vault/` (schema nuevo, `/api/health`, flujo de notificación, nuevas env).
- [ ] **Step 2:** Revisión de rama completa con `superpowers:requesting-code-review` (reviewer fresco) contra este plan; checklist del Review Focus verificada una por una con su test.
- [ ] **Step 3:** `pnpm lint && pnpm check-types && pnpm test && pnpm build` en la raíz, con salida pegada en el informe.

---

## Self-review

- Cobertura de la auditoría: A1→T6, A2/A3→T3+T4, A4→T1, M1/M2/M3→T5, M4→T8, M5→T2, M6→T4, M7→T7, B1→T5, B3/B4/B5→T6, tests→T2/T4/T5/T6. **B2 (iOS)** queda fuera: requiere prueba en dispositivo; se anota como pendiente en `vault/Pendientes/`.
- Consistencia de nombres: `marcarNotificado`, `findRecentByFuentes`, `decidirNotificacion`, `esEndpointPushPermitido`, `registrarIngestaOk` se usan igual en todas las tareas.
- Riesgo principal: T3 migración (re-aviso masivo si se despliega sin el `UPDATE` de backfill) → ya mitigado en Step 2.
