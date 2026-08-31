---
tags: [convenciones]
---

# Convenciones del Vault

**Cuándo actualizar**: tras features nuevas, fixes de bugs relevantes, o cambios de schema/API/infra — no por cada commit trivial (un typo, un ajuste de estilo no lo amerita).

**Quién es responsable**: invocar el agente `docs-agent` (`.claude/agents/docs-agent.md`) después de un cambio significativo, o actualizar manualmente si el cambio es pequeño y ya se tiene el contexto fresco. `docs-agent` verifica contra el código real y corrige desfases — no solo agrega, también borra/corrige lo que ya no es cierto.

**Objetivo**: que cada sesión futura de Claude Code arranque con contexto real y actualizado (leyendo `CLAUDE.md` + `/vault/`) en vez de tener que re-explorar todo el monorepo desde cero para entender el stack, el schema o los endpoints.

**No duplicar** `docs/superpowers/specs/` y `docs/superpowers/plans/` — ese es el historial de decisiones de diseño feature por feature (ver [[../05 - Infra y CI]]). El vault es el estado actual condensado, no el historial completo.
