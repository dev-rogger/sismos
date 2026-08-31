---
tags: [desarrollo]
---

# Guías de Desarrollo

## Requisitos

- Node **24** (`.nvmrc` → `nvm use`)
- pnpm **10.33.0** (`packageManager` en `package.json` raíz)
- Docker (opcional, para Postgres local vía `docker-compose.yml`)

## Setup local

```bash
nvm use
pnpm install
cp .env.example .env.local   # completar valores reales
pnpm dev                     # turbo run dev — levanta web (3000) e ingestor (3001) en paralelo
```

### Variables de entorno (`.env.example`)

`DATABASE_URL`, `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET`, `ADMIN_EMAIL`, `ALERTA_PUSH_ENDPOINT`, `ALERTA_PUSH_P256DH`, `ALERTA_PUSH_AUTH`. Listadas por nombre solamente — nunca commitear valores reales (`.env*` está en `.gitignore`, excepto `.env.example`).

### Con Docker

```bash
pnpm docker:dev   # docker compose up --build
pnpm docker:down
```

Levanta `postgres` (puerto 5432), `web` (3000), `ingestor` (3001) y un servicio `poller` que hace polling manual a `/api/ingest` cada 60s (simula el cron externo que en producción corre fuera de Docker — ver `apps/ingestor/scripts/poll.sh` y [[05 - Infra y CI]]).

## Comandos raíz (turbo)

| Comando | Qué hace |
|---|---|
| `pnpm dev` | `turbo run dev` — dev server de todas las apps |
| `pnpm build` | `turbo run build` |
| `pnpm lint` | `turbo run lint` (ESLint, `--max-warnings 0` en cada app) |
| `pnpm check-types` | `turbo run check-types` (`next typegen && tsc --noEmit` en cada app Next) |
| `pnpm test` | `turbo run test` |
| `pnpm format` | `prettier --write "**/*.{ts,tsx,md}"` |

## Comandos específicos

- `pnpm --filter web generar-fallas-chile` — regenera datos de fallas geológicas de Chile (capa del mapa).
- `pnpm --filter ingestor backfill-historicos` — carga histórica one-off (`tsx --env-file=.env.local`).
- `pnpm --filter ingestor poll` — corre `scripts/poll.sh` localmente sin Docker.
- `pnpm --filter @sismos/db db:generate` / `db:migrate` — Drizzle Kit (ver [[02 - Base de Datos]]).

## Convenciones de código a respetar

- **Nombres e identificadores en español** (`sismosHistoricos`, `radio-percepcion.ts`, `require-admin-api.ts`, etc.) — sigue ese idioma, no mezcles inglés en nombres nuevos dentro de este repo.
- **Comentarios "por qué", no "qué"** — el código ya tiene ejemplos densos de esto (ver `connection.ts`, `estadisticas/route.ts`, `vercel.ts` del ingestor). Sigue ese patrón: explica decisiones no obvias, no describas lo que ya es legible.
- Tailwind v4 vía `@theme` en `apps/web/app/globals.css` — no introducir un sistema de diseño paralelo.
- `apps/web` usa `next dev/build --webpack` explícito (no Turbopack) — no quitar el flag sin verificar por qué se fijó así.
- Componentes de `apps/web` organizados por dominio (`components/configuracion/`, `components/filtro/`, `components/historial/`, `components/menu/`).

## Agentes de Claude Code disponibles

Ver tabla completa en [[01 - Arquitectura del Sistema]] y en el `CLAUDE.md` raíz. Los agentes de dominio (`ui-guardian`, `animation-guardian`, `sismologia-guardian`) **auditan y proponen, no editan** salvo aprobación explícita en la invocación. `docs-agent` mantiene esta documentación al día — ver [[Pendientes/00 - Convenciones del Vault]].
