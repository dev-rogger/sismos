# sismos

PWA gratuita e informativa que muestra sismos de Chile (CSN, con fallback GAEL Cloud) y del mundo (USGS) en un mapa en tiempo real, con historial, estadísticas y notificaciones push. Documentación detallada en `/vault/` (ver sección al final).

## Stack

- **Monorepo**: Turborepo + pnpm workspaces (`apps/*`, `packages/*`)
- **apps/web**: Next.js 16 App Router (Webpack, no Turbopack), React 19, TypeScript, Tailwind v4, MapLibre GL (mapa), Serwist (PWA/service worker), NextAuth v5 beta (Google + Credentials), next-intl (es/en)
- **apps/ingestor**: Next.js 16, function serverless en Vercel, consulta CSN + GAEL (fallback) + USGS y guarda en Postgres, dispara Web Push
- **packages/db**: PostgreSQL vía **Drizzle ORM** (`drizzle-orm/node-postgres` + `pg`) — **no MongoDB/Mongoose**, pese a lo que dice el CLAUDE.md del workspace (`~/Sites/CLAUDE.md`), que quedó desactualizado tras la migración (ver `docs/superpowers/plans/2026-07-15-sismos-postgres-migration.md`)
- **packages/shared**: tipos y normalización de datos entre las 3 fuentes externas

## Estructura

```
apps/web        La PWA (mapa, historial, estadísticas, admin, auth)
apps/ingestor   Recolector serverless (CSN + GAEL + USGS → Postgres → push)
packages/db     Conexión, schema Drizzle, queries — @sismos/db
packages/shared Normalización entre fuentes, utils geográficos — @sismos/shared
docs/superpowers/  Historial de specs y planes de features (no confundir con /vault/)
vault/          Base de conocimiento Obsidian del estado actual del proyecto
```

## Comandos

```bash
nvm use && pnpm install   # setup
pnpm dev                  # turbo run dev — web:3000, ingestor:3001
pnpm build                # turbo run build
pnpm lint                 # turbo run lint
pnpm check-types          # turbo run check-types
pnpm test                 # turbo run test
pnpm docker:dev           # docker compose up --build (Postgres local + web + ingestor + poller)
```

Detalle completo de comandos y convenciones en `vault/04 - Guías de Desarrollo.md`.

## Agentes de Claude Code (`.claude/agents/`)

| Agente | Rol |
|---|---|
| `ui-guardian` | Revisa calidad visual/UX de `apps/web` tras cambios en componentes/layouts/`globals.css`. Audita y propone, no edita salvo aprobación explícita. |
| `animation-guardian` | Diseña y audita animaciones/microinteracciones (splash, marcadores, transiciones). Audita y propone, no edita salvo aprobación explícita. |
| `sismologia-guardian` | Revisa modelos numéricos sísmicos reales (ej. radio de percepción) contra literatura científica. Audita y propone, no edita salvo aprobación explícita. |
| `docs-agent` | Mantiene al día `CLAUDE.md`, `README.md` y `/vault/` tras cambios significativos — detecta y corrige desfases, no solo agrega. |

## Obsidian Vault

Base de conocimiento del proyecto en `/vault/` (carpeta del repo, se accede con Read/Write normales — sin MCP server). Se puede abrir directo en Obsidian apuntando a esa carpeta. Se commitea al repo.

| Nota | Contenido |
|---|---|
| `00 - Índice.md` | Índice y navegación del vault |
| `01 - Arquitectura del Sistema.md` | Stack, estructura del monorepo, agentes de Claude Code |
| `02 - Base de Datos.md` | Schema Postgres/Drizzle, tablas, queries |
| `03 - API Reference.md` | Endpoints de `apps/web` y `apps/ingestor` |
| `04 - Guías de Desarrollo.md` | Setup local, comandos, convenciones |
| `05 - Infra y CI.md` | Vercel, crons del ingestor (2 capas: Vercel diario + GitHub Actions cada 5 min), GitHub Actions |
| `Pendientes/` | Ideas diferidas, bugs en seguimiento, convenciones del vault |

**Mantenimiento**: invocar `docs-agent` tras cambios significativos de código (features, fixes relevantes, cambios de schema/API/infra) para que la doc no se desactualice. No es necesario tras cambios triviales. Ver `vault/Pendientes/00 - Convenciones del Vault.md`.
