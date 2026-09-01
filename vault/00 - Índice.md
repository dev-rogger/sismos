---
tags: [índice]
---

# Vault — sismos

Base de conocimiento del proyecto `sismos` (PWA de sismos Chile + mundo). Se abre directo en Obsidian apuntando a esta carpeta (`/vault/`), y se accede desde Claude Code con Read/Write normales — sin MCP server dedicado.

## Notas

- [[01 - Arquitectura del Sistema]] — stack, estructura del monorepo, patrones de código
- [[02 - Base de Datos]] — schema Postgres/Drizzle, tablas, queries
- [[03 - API Reference]] — endpoints de `apps/web` y `apps/ingestor`
- [[04 - Guías de Desarrollo]] — setup local, comandos, convenciones, docker-compose
- [[05 - Infra y CI]] — Vercel, cron del ingestor, GitHub Actions
- `Pendientes/` — ideas diferidas, bugs en auditoría, convenciones del vault

## Cómo mantener esto al día

Ver [[Pendientes/00 - Convenciones del Vault]]. Resumen: el agente `docs-agent` (`.claude/agents/docs-agent.md`) es responsable de detectar y corregir desfases entre esta documentación y el código real después de cambios significativos.

## Corrección importante vs. el CLAUDE.md del workspace (`~/Sites/CLAUDE.md`)

El CLAUDE.md del workspace describía `sismos` con **"MongoDB (Mongoose)"**. Eso estaba desactualizado: el código real usa **PostgreSQL + Drizzle ORM** (ver [[02 - Base de Datos]]). Ya se corrigió tanto ahí como en el `README.md` de este repo (2026-08-29).

## Cómo depurar la PWA en modo standalone

El splash y varios bugs de viewport solo se manifiestan con `(display-mode: standalone)`, que **no** se puede emular desde DevTools. La receta que sí funciona (ventana `--app=` de Chrome + `Emulation.setSafeAreaInsetsOverride` por CDP) está documentada en [[Pendientes/Bug - Intro Splash (banda negra + doble render)]]. Vale la pena leerla antes de tocar cualquier cosa de alturas de pantalla.
