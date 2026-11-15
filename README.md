# sismos

PWA gratuita e informativa que muestra sismos de Chile (CSN) y del mundo (USGS) en un mapa en tiempo real, con historial y notificaciones.

## Estructura

- `apps/web` — Next.js 16 App Router, PWA instalable
- `apps/ingestor` — Function serverless en Vercel que consulta CSN + USGS y guarda los eventos
- `packages/db` — Conexión y schema de PostgreSQL (Drizzle ORM)
- `packages/shared` — Tipos compartidos y normalización de datos entre fuentes
- `packages/eslint-config`, `packages/typescript-config` — configuración compartida

## Desarrollo

```bash
nvm use
pnpm install
pnpm dev
```

Copia `.env.example` a `.env.local` y completa las variables (solo nombres en el repo, nunca valores). `pnpm dev` levanta web (3000) e ingestor (3001).

Scripts raíz: `pnpm build`, `pnpm lint`, `pnpm check-types`, `pnpm test` (vitest), `pnpm docker:dev` (Postgres local + web + ingestor + poller).

Ver `docs/superpowers/specs/` para las decisiones de diseño y `/vault/` (abrible en Obsidian) para la documentación de referencia del estado actual del proyecto.
