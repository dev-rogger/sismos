---
tags: [arquitectura]
---

# Arquitectura del Sistema

## Qué es

PWA gratuita e informativa que muestra sismos de Chile (fuente primaria: CSN, respaldo: GAEL Cloud) y del mundo (USGS) en un mapa en tiempo real, con historial, estadísticas y notificaciones push por cercanía/magnitud.

## Monorepo (Turborepo + pnpm)

```
apps/
  web/        Next.js 16 App Router — la PWA que usa la gente
  ingestor/   Function serverless (Vercel) — consulta CSN+GAEL+USGS y guarda eventos
packages/
  db/               Conexión y schema Postgres (Drizzle) + queries — @sismos/db
  shared/           Tipos, normalización entre fuentes, utils — @sismos/shared
  eslint-config/    Config ESLint compartida
  typescript-config/ Config TS compartida
```

Workspaces declarados en `pnpm-workspace.yaml` (`apps/*`, `packages/*`). Orquestación de tasks (`build`, `dev`, `lint`, `check-types`, `test`) vía `turbo.json`.

## apps/web — la PWA

- Next.js 16 (App Router, Webpack — `next dev --webpack` / `next build --webpack`, no Turbopack), React 19, TypeScript, Tailwind v4.
- PWA vía **Serwist** (`@serwist/next`, `apps/web/app/sw.ts`) — no un service worker escrito a mano.
- Mapa: **MapLibre GL** (`maplibre-gl`), orquestado en `components/MapaConHistorial.tsx`.
- i18n: **next-intl**, mensajes en `apps/web/messages/{es,en}.json`.
- Auth: **NextAuth v5** (beta) — `lib/auth.config.ts` define pages/callbacks/estrategia JWT; los providers reales se agregan en `lib/auth.ts` (no en el config): **Google** OAuth (`upsertUsuarioGoogle` crea/actualiza el usuario al iniciar sesión) y **Credentials** (email+password propio, hash con `bcryptjs`).
- Roles: `users.role` (`"user" | "admin"`), propagado a la sesión JWT. Sección `/admin` protegida (`require-admin-api.ts`).
- Componentes organizados por dominio en `components/` (configuración, filtro, historial, menú, mapa) — no reinventar patrones paralelos, ver `.claude/agents/ui-guardian.md` para las convenciones de UI vigentes.
- Intro/splash (`components/SplashPWA.tsx` + `globals.css`): versión corta (~750 ms) si la intro completa se vio en las últimas 12 h (marca `sismos:intro-vista` en localStorage, leída por un script en `app/layout.tsx` que pone `data-intro="corta"` en `<html>` antes del primer paint) y con `prefers-reduced-motion` (~500 ms); completa ~1900 ms. `MapaSismos` deja `data-mapa-listo="1"` en `<html>` además del evento `sismos:mapa-listo`; al salir el splash se pone `data-intro-fin`.
- PWA manifest (`public/manifest.json`): `id`, `scope`, `lang` definidos; sin bloqueo de orientación.
- Tests: vitest en `apps/web`, `apps/ingestor` y `packages/shared`.
- Estilos: Tailwind v4 vía `@theme` en `app/globals.css` (tokens `--color-*`), tema oscuro por defecto.

## apps/ingestor — el recolector de datos

- Next.js 16 (sin Webpack forzado), corre como Vercel Function serverless, expone `GET /api/ingest` (protegido con `CRON_SECRET` vía header `Authorization: Bearer` o `x-cron-secret`, comparación en tiempo constante) y `GET /api/health` (watchdog, sin secreto).
- `lib/fetch-csn.ts`, `lib/fetch-gael.ts`, `lib/fetch-usgs.ts` — clientes de las 3 fuentes externas. GAEL Cloud (`api.gael.cloud`) es el respaldo de CSN, no una fuente independiente.
- `lib/ingest.ts` — orquesta fetch + normalización (`@sismos/shared`) + dedupe + guardado en Postgres + decisión de notificar según estado de BD y disparo de push (`lib/send-push.ts`, `web-push`). Detalle en [[03 - API Reference]].
- `scripts/backfill-historicos.ts`, `scripts/backfill-usgs-rango.ts` — scripts one-off de carga histórica (no se ejecutan en producción de forma recurrente).
- `data/historical-overrides.json` — correcciones manuales a datos históricos.

## packages/shared — normalización entre fuentes

- `normalize/csn.ts`, `normalize/usgs.ts`, `normalize/gael.ts` — mapean cada formato externo a un modelo común.
- `dedupe.ts` — evita duplicar el mismo sismo reportado por dos fuentes (ver `refCruzadaFuente`/`refCruzadaExternalId` en el schema).
- `distancia.ts`, `region-chile.ts`, `geocodificacion-aproximada.ts` — geografía: distancia entre puntos, mapeo a región chilena, geocodificación aproximada cuando falta lugar.
- `decision-notificacion.ts` (`decidirNotificacion`) y `destinatarios.ts` (`seleccionarDestinatarios`) — lógica pura de a qué sismos y a quién avisar; `radio-percepcion.ts` (`radioPercepcionKm`, `radioMmiKm`) — estimación de alcance de percepción, usada por el mapa y por la regla de rescate MMI IV.
- `umbral-mundial.ts` — umbral de magnitud para considerar un sismo "mundial" relevante.
- `types.ts` — tipos compartidos entre web e ingestor.

## Agentes de Claude Code del proyecto (`.claude/agents/`)

| Agente | Rol |
|---|---|
| `ui-guardian` | Revisa calidad visual/UX de `apps/web` (responsive, accesibilidad, consistencia, transiciones, copy) tras cambios en componentes/layouts/`globals.css`. No edita salvo aprobación explícita. |
| `animation-guardian` | Diseña y audita animaciones/microinteracciones (splash, marcadores, ondas de percepción, transiciones de overlays). No edita salvo aprobación explícita. |
| `sismologia-guardian` | Experto en sismología/matemática aplicada — revisa modelos numéricos reales (ej. `packages/shared/src/radio-percepcion.ts`) contra literatura (GMPE, MMI, atenuación subducción chilena), nunca ajusta constantes a ojo. No edita salvo aprobación explícita. |
| `docs-agent` | Mantiene `CLAUDE.md`, `README.md` y `/vault/` sincronizados con el estado real del código tras cambios significativos. Ver [[Pendientes/00 - Convenciones del Vault]]. |

## Decisiones de diseño

`docs/superpowers/specs/` guarda specs de decisiones de diseño puntuales (ej. `2026-07-07-sismos-monorepo-design.md`, referenciado desde `apps/ingestor/vercel.ts` para explicar por qué el cron real vive fuera de Vercel). `docs/superpowers/plans/` guarda planes de trabajo (ej. `2026-08-01-ui-guardian-agent.md`).
