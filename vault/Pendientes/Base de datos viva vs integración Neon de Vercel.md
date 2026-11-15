---
tags: [infra, pendiente, neon, vercel]
---

# Base de datos viva vs integración Neon de Vercel

**Estado verificado el 2026-11-15.** Hay dos bases Neon en juego y no son la misma. Confundirlas lleva a migrar o inspeccionar la que no corresponde.

## Lo que se verificó

| Qué | Resultado |
|---|---|
| Sitio de producción (`https://sismos-web.vercel.app`) | Vivo: `/api/sismos?since=2026-11-01T00:00:00Z` devolvió 866 sismos, el último del 2026-11-15 21:42 UTC. |
| Base de la integración Neon de Vercel (`POSTGRES_URL*`, host `ep-young-glitter-…us-east-1`, proyecto `floral-thunder-92537031`) | **Vieja/abandonada**: 7 migraciones (0000–0006), 1.752 sismos, último del 2026-08-19, `estado_ingesta` vacía, 4 suscripciones push. |
| `DATABASE_URL` de producción en Vercel (web e ingestor) | Variable **sensible**: no se puede leer ni descargar con `vercel env pull` (llega como `[SENSITIVE]`). Es la que usa `packages/db/src/connection.ts`. |
| Cuenta Neon de Rodrigo (consola `console.neon.tech`) | Un solo proyecto, `asteria-co` (`green-smoke-80253764`, us-east-2, ~32 MB, activo hace horas). Candidato más probable a base viva; **no confirmado** (Chrome se colgó antes de abrir sus tablas). |

## Reglas

- **No usar `POSTGRES_URL*` / `NEON_PROJECT_ID` de Vercel como si fueran la base de la app.** Son de la integración y están desfasadas.
- **Antes de aplicar migraciones o hacer cambios que dependan del schema**, confirmar la base viva: que su `max(fecha)` de `sismos` sea de hoy (consola Neon → SQL Editor → `select max(fecha) from sismos;`).
- **Cómo comprobar rápido que producción está viva sin credenciales:** `curl "https://sismos-web.vercel.app/api/sismos?since=<fecha reciente>"` y mirar la `fecha` máxima.
- Las migraciones nuevas (0007, 0008, 0009) son aditivas, pero **hay que aplicarlas en la base viva ANTES de desplegar** (ver [[../05 - Infra y CI]]). Si el código nuevo corre sin ellas, la ingesta devuelve 500 y la web falla.
- Preview de Vercel y Producción comparten `DATABASE_URL` (ámbitos Production y Preview): un preview de `develop` escribe/lee la base viva. Para un QA aislado hace falta una rama Neon dedicada y `vercel env add DATABASE_URL preview develop`.

## Pendiente

- [ ] Confirmar que la base viva es `asteria-co` (o cuál es) y anotar aquí su identificación (nombre de proyecto, host sin credenciales).
- [ ] Decidir si se elimina o se reconecta la integración Neon de Vercel (`neon-yellow-magnet`), que hoy apunta a una base vieja.
- [ ] Aplicar migraciones 0007, 0008 y 0009 en la base viva y recién ahí desplegar a `main`.
- [ ] Crear una rama `qa` en la base viva si se quiere QA/preview aislado.
