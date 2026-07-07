# Diseño: scaffold del monorepo `sismos`

**Fecha:** 2026-07-07
**Alcance:** Inicializar la estructura del monorepo Turborepo y los esqueletos de apps/packages. Sin lógica de negocio (sin queries reales, sin conexión a Mongo Atlas, sin mapa, sin dedupe, sin notificaciones).

## Contexto del producto

PWA gratuita e informativa que muestra sismos de Chile (fuente CSN vía `sismologia.cl` / API comunitaria `api-sismologia-chile`) y a nivel mundial (feed GeoJSON de USGS), en un mapa con animaciones de alerta según magnitud, historial, e instalable. Prioridad: velocidad y eficiencia. Nada de scraping de redes sociales.

## Decisiones tomadas

| Decisión | Elección | Motivo |
|---|---|---|
| Nombre del proyecto | `sismos` (no `sismos-chile`) | El feed mundial (USGS) es parte del alcance desde el día 1, no un agregado futuro |
| Carpeta | Renombrada de `sismo-app` a `sismos` | Consistencia con el nombre del proyecto |
| Package manager | pnpm | Estándar de facto para monorepos Turborepo, instalación rápida, buen soporte de workspaces |
| Scaffolding | `create-turbo@latest` (no-interactivo) adaptado a la estructura pedida | Reutiliza la base oficial de Vercel en vez de reconstruirla a mano |
| Node | 24 LTS (`.nvmrc` + `engines`) | Alineado con Vercel Fluid Compute y Next.js 16 |
| Lint/format | ESLint + Prettier, compartidos vía `packages/eslint-config` y `packages/typescript-config` | Estándar del ecosistema Next.js, mejor cobertura de reglas específicas de Next/App Router que alternativas más nuevas |
| PWA (apps/web) | Serwist (`@serwist/next`) | Sucesor mantenido de next-pwa, compatible con App Router/Turbopack |
| Stack apps/ingestor | TypeScript + Next.js mínimo (solo route handlers), NO Python | Debe reutilizar `packages/db` y `packages/shared` (TypeScript). Un ingestor en Python obligaría a duplicar modelos Mongoose y lógica de normalización en Python, rompiendo el propósito de esos packages compartidos |
| Control de versiones | git init + primer commit del esqueleto | Punto de partida versionado desde el inicio |

## Estructura del monorepo

```
sismos/
├── apps/
│   ├── web/                     # Next.js 16 App Router, Tailwind v4, PWA (Serwist)
│   └── ingestor/                # Next.js 16 mínimo, solo route handlers + vercel.ts (crons)
├── packages/
│   ├── db/                      # Conexión Mongoose + modelos (stubs)
│   ├── shared/                  # Tipos TS + normalización CSN/USGS (stubs)
│   ├── eslint-config/           # Config ESLint compartida
│   └── typescript-config/       # tsconfig base compartido
├── docs/superpowers/specs/      # Specs de diseño (este archivo)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json                 # nombre: "sismos"
├── .nvmrc                       # 24
├── .gitignore
└── README.md
```

## Detalle por unidad

### apps/web
- Next.js 16, App Router, TypeScript, Tailwind v4 (vía create-turbo template oficial de Next.js)
- PWA: `@serwist/next` configurado (manifest.json + service worker generado), sin estrategias de cache/push todavía — solo el wiring base para que la app sea instalable
- Una página placeholder (sin mapa, sin historial, sin animaciones)
- Depende de `packages/shared` (tipos) y, más adelante, `packages/db` para lecturas

### apps/ingestor
- Next.js 16 mínimo: sin páginas, solo `app/api/ingest/route.ts` como placeholder (responde algo mínimo, sin consultar CSN/USGS todavía)
- `vercel.ts` con `crons` apuntando al endpoint placeholder
- Depende de `packages/db` (para futura escritura) y `packages/shared` (para futura normalización)
- **Riesgo conocido, no bloquea el scaffold:** Vercel Cron tiene un mínimo de 1 minuto entre ejecuciones, y en el plan Hobby (gratis) los cron jobs solo corren 1 vez al día. La cadencia deseada de 30-60s no es alcanzable con Vercel Cron en el plan gratuito. A revisar cuando se implemente la lógica real: opciones son plan Pro, o un disparador externo (ej. cron-job.org / GitHub Actions) llamando a un endpoint protegido.

### packages/db
- `src/connection.ts`: stub de conexión a MongoDB Atlas vía Mongoose (sin URI real, sin lógica de reintento todavía)
- `src/models/sismo.ts`: stub de modelo para la colección `sismos` (TODO: schema real)
- `src/models/sismo-historico.ts`: stub de modelo para la colección `sismos_historicos` (TODO: schema real, incluyendo soporte para ajuste manual de coordenadas)
- `src/index.ts`: exports públicos del package

### packages/shared
- `src/types.ts`: tipos placeholder para un evento sísmico normalizado (forma común entre CSN y USGS, a refinar)
- `src/normalize/csn.ts`: stub con firma de función de normalización CSN → tipo común (TODO: implementación)
- `src/normalize/usgs.ts`: stub con firma de función de normalización USGS GeoJSON → tipo común (TODO: implementación)
- `src/index.ts`: exports públicos del package

## Decisiones diferidas (fuera de alcance de este scaffold)

- **Librería de mapa** (Leaflet vs Mapbox GL vs MapLibre GL): recomendación a evaluar cuando se implemente el mapa — MapLibre GL (fork open-source de Mapbox GL, renderizado WebGL, sin necesidad de API key/token, buen soporte de animaciones y clustering) es probablemente el mejor balance entre "veloz, útil y atractivo" para este caso de uso, pero no se decide ni se instala ahora.
- Schema real de Mongo para ambas colecciones
- Lógica de dedupe entre fuentes CSN/USGS
- Notificaciones push
- Estrategia de cache/offline del service worker
- Mecanismo real de disparo del ingestor dado el límite de Vercel Cron en plan gratuito

## Fuera de alcance / no incluido

- No se instalan dependencias de mapas, notificaciones push, ni testing todavía
- No hay CI/CD configurado
- No hay conexión real a MongoDB Atlas ni variables de entorno reales (solo `.env.example` con placeholders)
