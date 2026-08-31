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

Ver `docs/superpowers/specs/2026-07-07-sismos-monorepo-design.md` para el razonamiento original de esta arquitectura de 3 capas.

## Docker (solo desarrollo local)

`docker-compose.yml` — no se usa en producción, es exclusivamente para desarrollo local. Servicios: `postgres`, `web`, `ingestor`, `poller` (simula el cron pegándole a `/api/ingest` cada 60s vía `scripts/poll.sh`). Ver [[04 - Guías de Desarrollo]].

## Historial de decisiones de diseño

`docs/superpowers/specs/` y `docs/superpowers/plans/` (generados con el flujo `superpowers:writing-plans`) tienen el registro histórico completo de features implementadas, con fecha y diseño/plan de cada una — incluye, entre otras: migración a Postgres (`2026-07-15-sismos-postgres-migration-design.md`, explica por qué se dejó Mongo), notificaciones push, capa de fallas geológicas, i18n, cuentas de usuario, panel admin de usuarios, resiliencia de la fuente CSN (por eso existe el fallback GAEL).

**No dupliques ese contenido en el vault.** Si necesitas el "por qué" de una decisión ya tomada, hay que revisar el spec/plan correspondiente en `docs/superpowers/` antes de re-explorarlo desde cero o de asumir algo distinto.
