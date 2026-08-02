# Agente `ui-guardian` — diseño

## Contexto

`sismos` es un monorepo Turborepo/pnpm con `apps/web` (PWA Next.js 16 App
Router, React 19, Tailwind v4, MapLibre GL para el mapa) y `apps/ingestor`
(serverless, sin UI). Hasta ahora el proyecto no tiene agentes propios en
`.claude/agents/`; solo hay agentes globales y built-in.

Queremos un primer agente propio del proyecto encargado de que la app se vea
bien: consistente, responsive (es mobile-first, PWA), accesible, y con buena
legibilidad en los overlays sobre el mapa.

## Objetivo

Un subagente `ui-guardian` que:

1. Se invoca proactivamente (por la sesión principal de Claude) después de
   editar componentes UI, layouts o `globals.css` dentro de `apps/web`.
2. También puede invocarse manualmente para revisiones ad-hoc o para diseñar
   pantallas/componentes nuevos.

## Flujo de trabajo

**Fase 1 — Revisión y propuesta (siempre primero):**

- Revisa lo tocado: estructura JSX, clases Tailwind, breakpoints responsive,
  atributos de accesibilidad, consistencia con patrones ya usados en el
  proyecto (`components/configuracion`, `components/filtro`,
  `components/historial`, `components/menu`), legibilidad de overlays sobre
  el mapa, tamaño de touch targets mobile, estados vacíos/carga.
- Si el problema no se puede juzgar solo leyendo código (overlap real,
  contraste percibido, comportamiento en viewport mobile real), usa
  herramientas de Chrome (`navigate`, `computer`, `read_page`, etc.) para
  levantar/usar el dev server y tomar screenshots reales.
- Entrega una lista priorizada de hallazgos con propuestas concretas de
  cambio (archivo:línea cuando aplique). **No edita código en esta fase.**

**Fase 2 — Aplicación (solo si se aprueba explícitamente):**

- El agente aplica las propuestas solo cuando la invocación indica
  explícitamente que fueron aprobadas (ej. "aplica los cambios 1 y 3 de tu
  propuesta anterior").

## Herramientas

`Read, Grep, Glob, Bash, Edit, Write` más las herramientas de Chrome
(`mcp__claude-in-chrome__navigate`, `computer`, `read_page`,
`read_console_messages`, `tabs_context_mcp`, `tabs_create_mcp`) para cuando
decida que necesita inspección visual real. El uso del navegador es
condicional, no obligatorio en cada corrida.

## Alcance

Vive solo en este proyecto: `.claude/agents/ui-guardian.md`. No es un agente
global (no aplica a otros proyectos del workspace).

## Fuera de alcance

- No reemplaza revisión de código funcional/lógica (eso es tarea de
  `/code-review` u otros agentes).
- No corre en CI ni vía hooks automáticos de git; la invocación proactiva la
  decide la sesión de Claude en curso, no un mecanismo del sistema.
