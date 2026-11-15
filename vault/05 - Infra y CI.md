---
tags: [infra, ci]
---

# Infra y CI

## Vercel

Dos proyectos Vercel separados dentro del mismo team (`orgId team_f75a1AAODmNnFLMCEmyXl917`):

| Proyecto Vercel | App | `projectId` |
|---|---|---|
| `sismos-web` | `apps/web` (la PWA, dominio público) | `prj_eubiucIAc3O5YKQSwU2i3lLdKJGj` |
| `sismos` | `apps/ingestor` — desplegado en `sismos-realtime.vercel.app` | `prj_9SRgW5Wf3CgVPpgbHYA3EM6lmxnj` |

Config vía `vercel.ts` (el nuevo formato TypeScript, no `vercel.json`) en `apps/ingestor/vercel.ts`.

## Cron del ingestor — dos capas, no una

Esto es importante y fácil de malinterpretar leyendo solo `apps/ingestor/vercel.ts`:

1. **Cron nativo de Vercel** (`vercel.ts` → `crons: [{ path: "/api/ingest", schedule: "0 0 * * *" }]`): solo **1 vez al día**. El plan Hobby de Vercel limita el cron nativo a esa cadencia. Esto es una **red de seguridad**, no la cadencia real de ingesta.
2. **GitHub Actions** (`.github/workflows/ingest-cron.yml`): corre cada **5 minutos** (`cron: "*/5 * * * *"`), pega a `https://sismos-realtime.vercel.app/api/ingest` con header `x-cron-secret` (secret de GitHub Actions `CRON_SECRET`), falla el job si la respuesta no es `200`.
3. El comentario en `vercel.ts` menciona además un **cron externo (cron-job.org)** pegándole a `/api/ingest` cada 1 minuto como la cadencia "real" — no se verificó su configuración desde este repo (vive fuera del código, en el dashboard de cron-job.org). **Confirmar si ese cron externo sigue activo o si GitHub Actions lo reemplazó** — puede haber redundancia o el dato puede estar desactualizado.
4. **Watchdog y salud**: el workflow tiene un segundo job `watchdog` (`needs: ingest` + `if: always()`: corre después de la ingesta, también si esta falla) que consulta `GET /api/health` (sin secreto; devuelve solo `ok` y la edad en segundos por fuente) y falla con `exit 1` si no responde `200`, lo que dispara el correo de GitHub. `/api/health` responde `503` si `csn` no tiene `ultimo_ok` o es mayor a 15 min, o si la BD no responde. "csn ok" significa que la ingesta corrió hasta el final y CSN o el respaldo GAEL respondieron (si ambos fallan se registra error de `csn`, no ok): detecta que el cron dejó de correr o la BD cayó; que CSN esté desactualizado lo cubre la alerta de 2 h. Estado en la tabla `ingesta_estado` (migración 0008). `enviarAlertaAdmin` suma un canal alterno opcional por webhook (`ALERTA_WEBHOOK_URL`, POST JSON `{text}`, timeout 5 s).

Ver `docs/superpowers/specs/2026-07-07-sismos-monorepo-design.md` para el razonamiento original de esta arquitectura de 3 capas.

## Docker (solo desarrollo local)

`docker-compose.yml` — no se usa en producción, es exclusivamente para desarrollo local. Servicios: `postgres`, `web`, `ingestor`, `poller` (simula el cron pegándole a `/api/ingest` cada 60s vía `scripts/poll.sh`). Ver [[04 - Guías de Desarrollo]].

## Orden de despliegue

**Desde 2026-11-15 el build del ingestor aplica las migraciones solo** (`apps/ingestor/vercel.ts` → `buildCommand: pnpm --filter @sismos/db db:migrate:deploy && next build`; el script es `packages/db/scripts/migrate.mjs`, idempotente, con el migrador de Drizzle y la misma regla SSL de `connection.ts`). Si la migración falla, el build falla y Vercel sigue sirviendo el deploy anterior (fallo seguro). Ya se aplicaron `0007`, `0008` y `0009` en la base viva así (build del preview de `develop`, verificado: el preview de web devolvió `notificadoAt`, `magnitudNotificada` y `fuenteNotificada`).

**Ojo:** Preview y Producción comparten `DATABASE_URL`, así que un build de preview del ingestor también migra la base viva. Es seguro mientras las migraciones sean aditivas; una migración destructiva exigiría revisar este flujo antes de empujar a cualquier rama. El web no migra, y el orden "schema primero, código después" lo garantiza el build del ingestor.

Antes de este cambio el paso era manual y bloqueante: las migraciones son aditivas, así que el código viejo funciona con el schema nuevo; el orden inverso no es seguro.

Si se despliega el código nuevo sin migrar, los `select` de `sismos` piden columnas inexistentes (`notificado_at`, `magnitud_notificada`, `fuente_notificada`): la ingesta responde `500`, la web muestra error y `/api/health` responde `503` (falta la tabla `ingesta_estado`).

## Historial de decisiones de diseño

`docs/superpowers/specs/` y `docs/superpowers/plans/` (generados con el flujo `superpowers:writing-plans`) tienen el registro histórico completo de features implementadas, con fecha y diseño/plan de cada una — incluye, entre otras: migración a Postgres (`2026-07-15-sismos-postgres-migration-design.md`, explica por qué se dejó Mongo), notificaciones push, capa de fallas geológicas, i18n, cuentas de usuario, panel admin de usuarios, resiliencia de la fuente CSN (por eso existe el fallback GAEL).

**No dupliques ese contenido en el vault.** Si necesitas el "por qué" de una decisión ya tomada, hay que revisar el spec/plan correspondiente en `docs/superpowers/` antes de re-explorarlo desde cero o de asumir algo distinto.
