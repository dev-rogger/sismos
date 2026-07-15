# Docker Dev Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full `docker compose up` dev environment for the sismos monorepo — mongo, web, ingestor, and automatic polling, replacing manual `pnpm dev` + `pnpm poll`.

**Architecture:** One shared `Dockerfile.dev` (node:24-alpine + pnpm via corepack) builds an image containing the whole pnpm workspace. `docker-compose.yml` runs `web` and `ingestor` as separate containers from that image with different `command`s and ports, bind-mounts the repo for hot reload while protecting `node_modules` with anonymous volumes, and adds a `poller` container that reuses the existing `apps/ingestor/scripts/poll.sh` against the `ingestor` service.

**Tech Stack:** Docker, Docker Compose v2.15.1 (no `develop.watch` support — classic bind mount + anonymous volumes), pnpm workspaces, Next.js 16.

## Global Constraints

- Docker Compose installed is v2.15.1 — do not use `develop.watch` (requires 2.22+).
- Node version per `.nvmrc` is 24 — base image must be `node:24-alpine`.
- Package manager is pnpm, pinned via `packageManager: "pnpm@10.33.0"` in root `package.json` — use `corepack enable`, not a manual pnpm install.
- `MONGODB_URI` inside containers must resolve mongo by Docker service name (`mongo`), not `localhost`.
- Do not modify `apps/web/.env.local` or `apps/ingestor/.env.local` — those stay for non-Docker dev.
- Do not touch anything under `apps/*/app` or production build/deploy config — this plan is dev-environment-only.

---

### Task 1: `.dockerignore`

**Files:**
- Create: `.dockerignore`

**Interfaces:**
- Produces: keeps `docker build` context small and prevents host `node_modules`/`.next` from being copied into the image.

- [ ] **Step 1: Create the file**

```
node_modules
**/node_modules
**/.next
.git
.turbo
```

- [ ] **Step 2: Commit**

```bash
git add .dockerignore
git commit -m "chore: add .dockerignore for docker dev build context"
```

---

### Task 2: `Dockerfile.dev`

**Files:**
- Create: `Dockerfile.dev`

**Interfaces:**
- Consumes: root `package.json` (`packageManager` field), `pnpm-lock.yaml`, full workspace source.
- Produces: an image with `/app` = full workspace, dependencies installed, default `WORKDIR /app`. Task 3's compose services build from this file and override `command`.

- [ ] **Step 1: Create the file**

```dockerfile
FROM node:24-alpine
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
```

- [ ] **Step 2: Build the image to verify it works**

Run: `docker build -f Dockerfile.dev -t sismos-dev-test .`
Expected: build completes with exit code 0, ends with `pnpm install` finishing without errors (no `ERR_PNPM_*` lines).

- [ ] **Step 3: Remove the test image**

Run: `docker rmi sismos-dev-test`

- [ ] **Step 4: Commit**

```bash
git add Dockerfile.dev
git commit -m "feat: add shared dev Dockerfile for web/ingestor"
```

---

### Task 3: `docker-compose.yml` — web, ingestor, poller services

**Files:**
- Modify: `docker-compose.yml` (currently only has `mongo`)

**Interfaces:**
- Consumes: `Dockerfile.dev` from Task 2; existing `apps/ingestor/scripts/poll.sh` (reads `INGEST_URL` env var, defaults to `http://localhost:3001/api/ingest`).
- Produces: services `mongo`, `web` (port 3000), `ingestor` (port 3001), `poller`. Task 4's `docker:dev` script depends on this file.

- [ ] **Step 1: Replace the file contents**

```yaml
services:
  mongo:
    image: mongo:8
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

  web:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: pnpm --filter web dev
    ports:
      - "3000:3000"
    environment:
      MONGODB_URI: mongodb://mongo:27017/sismos
    depends_on:
      - mongo
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/ingestor/node_modules
      - /app/packages/db/node_modules
      - /app/packages/shared/node_modules
      - /app/packages/eslint-config/node_modules
      - /app/packages/typescript-config/node_modules

  ingestor:
    build:
      context: .
      dockerfile: Dockerfile.dev
    command: pnpm --filter ingestor dev
    ports:
      - "3001:3001"
    environment:
      MONGODB_URI: mongodb://mongo:27017/sismos
    depends_on:
      - mongo
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/ingestor/node_modules
      - /app/packages/db/node_modules
      - /app/packages/shared/node_modules
      - /app/packages/eslint-config/node_modules
      - /app/packages/typescript-config/node_modules

  poller:
    image: alpine:3.20
    depends_on:
      - ingestor
    environment:
      INGEST_URL: http://ingestor:3001/api/ingest
    volumes:
      - ./apps/ingestor/scripts:/scripts:ro
    entrypoint: ["sh", "-c", "apk add --no-cache curl bash >/dev/null && exec bash /scripts/poll.sh"]

volumes:
  mongo-data:
```

- [ ] **Step 2: Validate compose file syntax**

Run: `docker compose config --quiet`
Expected: no output, exit code 0 (compose v2.15.1 supports `config --quiet` for validation without starting anything).

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat: add web, ingestor, poller services to docker-compose"
```

---

### Task 4: `package.json` scripts

**Files:**
- Modify: `package.json:6-9` (the `scripts` block containing `db:up`/`db:down`)

**Interfaces:**
- Consumes: `docker-compose.yml` from Task 3.
- Produces: `pnpm docker:dev` / `pnpm docker:down` commands for the user.

- [ ] **Step 1: Replace the `db:up`/`db:down` lines**

In `package.json`, change:

```json
    "db:up": "docker compose up -d",
    "db:down": "docker compose down"
```

to:

```json
    "docker:dev": "docker compose up --build",
    "docker:down": "docker compose down"
```

- [ ] **Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('package.json'))"`
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: replace db:up/db:down with docker:dev/docker:down scripts"
```

---

### Task 5: End-to-end verification

**Files:**
- None (manual verification of Tasks 1-4 working together).

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: confidence the full stack works before calling the plan done.

- [ ] **Step 1: Start the stack**

Run: `pnpm docker:dev`
Expected: all 4 containers build and start; `web` and `ingestor` logs show `Ready` from Next.js; `poller` logs show `Polling http://ingestor:3001/api/ingest every 60s`.

- [ ] **Step 2: Check web**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

- [ ] **Step 3: Check ingestor**

Run: `curl -s http://localhost:3001/api/ingest`
Expected: JSON response (ingest summary), not a connection error or 500.

- [ ] **Step 4: Check poller is hitting ingestor automatically**

Run: `docker compose logs poller --tail 5`
Expected: at least one `--- <timestamp> ---` line followed by a JSON response line, appearing without any manual action.

- [ ] **Step 5: Check mongo persistence**

Run: `docker compose down && docker compose up -d mongo && docker exec -it $(docker compose ps -q mongo) mongosh sismos --eval "db.getCollectionNames()"`
Expected: previously-ingested collections (e.g. `events` or similar, whatever `runIngest` writes to) are still listed — confirms `mongo-data` volume persisted data across the `down`.

- [ ] **Step 6: Tear down**

Run: `pnpm docker:down`
Expected: all containers stop and are removed, exit code 0.

- [ ] **Step 7: Commit final state (if any files changed during verification)**

```bash
git status
```

If clean, no commit needed — Tasks 1-4 already committed everything.
