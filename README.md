# sismos

PWA gratuita e informativa que muestra sismos de Chile (CSN) y del mundo (USGS) en un mapa en tiempo real, con historial y notificaciones.

## Estructura

- `apps/web` — Next.js 16 App Router, PWA instalable
- `apps/ingestor` — Function serverless en Vercel que consulta CSN + USGS y guarda los eventos
- `packages/db` — Conexión y modelos de MongoDB (Mongoose)
- `packages/shared` — Tipos compartidos y normalización de datos entre fuentes
- `packages/eslint-config`, `packages/typescript-config` — configuración compartida

## Desarrollo

```bash
nvm use
pnpm install
pnpm dev
```

Ver `docs/superpowers/specs/` para las decisiones de diseño.
