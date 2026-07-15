# Docker dev environment — design

## Propósito

Dockerizar el entorno de desarrollo local completo (hoy solo mongo está dockerizado vía `docker-compose.yml`). Objetivo: `docker compose up` levanta mongo, `web`, `ingestor` y el polling automático, sin pasos manuales (`pnpm dev` + `pnpm poll` en terminales separadas).

Fuera de alcance: imágenes de producción / self-hosting (no se necesita por ahora — el deploy real es Vercel).

## Servicios

- **mongo** — sin cambios (`mongo:8`, puerto 27017, volumen `mongo-data`)
- **web** — Next.js dev server (`apps/web`), puerto 3000, hot reload
- **ingestor** — Next.js dev server (`apps/ingestor`), puerto 3001, hot reload
- **poller** — contenedor alpine con curl/bash que corre el `apps/ingestor/scripts/poll.sh` existente contra `http://ingestor:3001/api/ingest` cada 60s, reemplazando el `pnpm poll` manual

## Build

Un único `Dockerfile.dev` en la raíz, compartido por `web` e `ingestor` (mismo workspace pnpm):

```dockerfile
FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
```

Cada servicio sobreescribe `command` (`pnpm --filter web dev` / `pnpm --filter ingestor dev`).

Nota: Docker Compose instalado es v2.15.1, no soporta `develop.watch` (requiere 2.22+) — se usa el enfoque clásico de bind mount + volúmenes anónimos.

## Hot reload / node_modules

`docker-compose.yml` monta el repo completo (`.:/app`) en `web` e `ingestor`, más volúmenes anónimos sobre cada `node_modules` del workspace (raíz, `apps/web`, `apps/ingestor`, `packages/db`, `packages/shared`, `packages/eslint-config`, `packages/typescript-config`) para que las dependencias instaladas dentro del contenedor (binarios Linux) no se pisen con las del host (Mac).

Consecuencia: agregar una dependencia nueva requiere `docker compose build` (no hay rebuild automático).

## Variables de entorno

`web` e `ingestor` reciben `MONGODB_URI=mongodb://mongo:27017/sismos` vía `environment:` en compose (resolución por nombre de servicio en la red de Docker). No se tocan los `.env.local` existentes, que siguen usándose para correr fuera de Docker.

## Scripts (`package.json` raíz)

Reemplaza `db:up` / `db:down`:

```json
"docker:dev": "docker compose up --build",
"docker:down": "docker compose down"
```

## Archivos nuevos/modificados

- `Dockerfile.dev` (nuevo)
- `docker-compose.yml` (reemplaza el actual — agrega `web`, `ingestor`, `poller`)
- `.dockerignore` (nuevo — excluye `node_modules`, `.next`, `.git`, `.turbo`)
- `package.json` (raíz — scripts `docker:dev` / `docker:down`)

## Testing

Validación manual (no aplica testing automatizado a config de infra):

- `pnpm docker:dev` levanta los 4 servicios sin error
- `localhost:3000` sirve la PWA
- `localhost:3001/api/ingest` responde con el summary de ingesta
- logs de `poller` muestran curls cada 60s
- datos persisten en el volumen `mongo-data` entre restarts
