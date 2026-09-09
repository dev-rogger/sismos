# Pronóstico estadístico de sismos (enjambres + ETAS)

## Contexto

Chile ha tenido varios sismos (mayormente <M2) en los últimos días — un enjambre sísmico. La idea original era "predecir terremotos", pero eso no es posible: la sismología no puede predecir hora/lugar/magnitud exactos de un sismo mayor (consenso científico, no limitación técnica). Lo que sí es ciencia sólida y se usa operacionalmente (USGS, GNS Science) es el **pronóstico probabilístico** (Operational Earthquake Forecasting): dado un enjambre, estimar cómo cambia la probabilidad de un sismo M≥umbral en una zona durante una ventana de tiempo, usando modelos estadísticos reconocidos.

Ya existe la base necesaria:
- La tabla `sismos` (`packages/db/src/schema.ts`) tiene fecha, magnitud, profundidad y lat/lon de CSN/GAEL y USGS — suficiente para detectar clusters espacio-temporales.
- El subagente `sismologia-guardian` ya existe en el proyecto para revisar modelos numéricos sísmicos contra literatura real (hoy solo audita el radio de percepción) — es el mecanismo natural para validar la calibración de este modelo.
- El patrón de cron ya establecido (`.github/workflows/ingest-cron.yml` llamando a un endpoint de `apps/ingestor` protegido con `x-cron-secret` cada 5 min) es el mismo patrón a reutilizar para los jobs periódicos de este feature.

Decisiones ya tomadas con el usuario:
- Alcance geográfico: Chile **y** mundo (sin fases) — requiere parámetros de modelo distintos por región tectónica.
- Modelo: ETAS completo (Epidemic-Type Aftershock Sequence), no una versión simplificada.
- Cómputo: on-demand (se calcula al abrir la pantalla, no precomputado por el ingestor).
- El modelo se "reentrena" periódicamente con resultados verificados (no es aprendizaje automático tipo red neuronal — es reajuste estadístico estándar MLE con más datos).
- Público desde el día uno, con panel de admin para ver el detalle de cada pronóstico y su verificación.

## Alcance

1. **`packages/forecast`** — paquete nuevo con la matemática pura (sin DB): detección de enjambres, b-value de Gutenberg-Richter, ajuste ETAS (MLE), cálculo de probabilidad.
2. **4 tablas nuevas** en `packages/db/src/schema.ts`: `parametrosEtas`, `enjambresDetectados`, `pronosticos`, `verificacionesPronostico`.
3. **Endpoint on-demand** `apps/web/app/api/pronostico/route.ts` — calcula (o reutiliza) el pronóstico vigente por región al abrir el panel.
4. **Job de verificación** (diario) — nuevo endpoint en `apps/ingestor` + workflow de GitHub Actions, mismo patrón que `ingest-cron.yml`.
5. **Job de recalibración** (mensual) — mismo patrón, reajusta parámetros ETAS con MLE cuando hay suficientes datos nuevos.
6. **Auditoría de `sismologia-guardian`** — proceso recurrente (no automatizable vía cron, es un subagente de Claude Code): se invoca periódicamente para auditar `parametrosEtas` contra literatura.
7. **UI pública**: ítem nuevo en `MenuLateral` → `PantallaPronostico`; indicador de enjambre activo en `MapaSismos`; preferencia nueva en `ModalConfiguracion` para avisos push de enjambre cercano.
8. **UI admin**: `/admin/pronosticos` con detalle de pronósticos activos/verificados y score de confiabilidad del modelo.

**Fuera de alcance**: predicción determinística de hora/lugar/magnitud exacta (no existe); machine learning / redes neuronales (el "aprendizaje" es reajuste estadístico MLE, no ML); regiones tectónicas sin literatura de calibración disponible (se arranca con las principales: subducción chilena, y las que `sismologia-guardian` pueda fundamentar para el resto del mundo — no se inventan parámetros sin respaldo).

## Diseño

### `packages/forecast`

Paquete nuevo, mismo patrón que `packages/shared` (sin dependencia de DB, funciones puras y testeables):

- `detectarEnjambres(sismos, region)`: clustering espacio-temporal (ventana deslizante por distancia Haversine + proximidad temporal) sobre sismos recientes de una región.
- `calcularBValue(magnitudes, magnitudMinima)`: estimador de máxima verosimilitud de Aki (1965) — `b = log10(e) / (media(M) - Mmin)`. Un b-value bajo es una señal (no una prueba) de acumulación de estrés.
- `ajustarEtas(historialSismos, region)`: ajuste MLE de los 5 parámetros ETAS (μ, K, α, c, p — Ogata 1988) sobre el historial de una región. Requiere un mínimo de eventos históricos para converger; si no hay suficientes, devuelve `null` en vez de forzar un ajuste con datos insuficientes.
- `calcularProbabilidad(parametrosEtas, ventanaInicio, ventanaFin, magnitudUmbral)`: integra la tasa esperada λ(t) del modelo ETAS en la ventana y la convierte a probabilidad de al menos un evento vía proceso de Poisson: `P = 1 - e^(-Λ)`.

### Tablas nuevas (`packages/db/src/schema.ts`)

```ts
export const parametrosEtas = pgTable("parametros_etas", {
  id: serial("id").primaryKey(),
  region: text("region").notNull().unique(), // ej. "chile-subduccion"
  mu: real("mu").notNull(),
  k: real("k").notNull(),
  alpha: real("alpha").notNull(),
  c: real("c").notNull(),
  p: real("p").notNull(),
  nEventosCalibracion: integer("n_eventos_calibracion").notNull(),
  fechaCalibracion: timestamp("fecha_calibracion").notNull().defaultNow(),
  auditadoPorGuardian: boolean("auditado_por_guardian").notNull().default(false),
  fechaUltimaAuditoriaGuardian: timestamp("fecha_ultima_auditoria_guardian"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const enjambresDetectados = pgTable("enjambres_detectados", {
  id: serial("id").primaryKey(),
  region: text("region").notNull(),
  centroLat: doublePrecision("centro_lat").notNull(),
  centroLon: doublePrecision("centro_lon").notNull(),
  radioKm: real("radio_km").notNull(),
  nEventos: integer("n_eventos").notNull(),
  bValue: real("b_value"),
  fechaInicio: timestamp("fecha_inicio").notNull(),
  fechaFin: timestamp("fecha_fin"), // null mientras está activo
  estado: text("estado").notNull().default("activo"), // "activo" | "resuelto"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const pronosticos = pgTable("pronosticos", {
  id: serial("id").primaryKey(),
  region: text("region").notNull(),
  magnitudUmbral: real("magnitud_umbral").notNull(),
  ventanaInicio: timestamp("ventana_inicio").notNull(),
  ventanaFin: timestamp("ventana_fin").notNull(),
  probabilidad: real("probabilidad").notNull(),
  parametrosEtasId: integer("parametros_etas_id")
    .notNull()
    .references(() => parametrosEtas.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const verificacionesPronostico = pgTable("verificaciones_pronostico", {
  id: serial("id").primaryKey(),
  pronosticoId: integer("pronostico_id")
    .notNull()
    .unique()
    .references(() => pronosticos.id),
  resultado: text("resultado").notNull(), // "acierto" | "fallo" | "parcial"
  sismoRealId: integer("sismo_real_id").references(() => sismos.id),
  distanciaKm: real("distancia_km"),
  diferenciaMagnitud: real("diferencia_magnitud"),
  fechaVerificacion: timestamp("fecha_verificacion").notNull().defaultNow(),
});
```

`resultado`: `"acierto"` (hubo un sismo M≥umbral dentro de la zona y ventana predichas), `"fallo"` (no hubo nada que se acerque), `"parcial"` (hubo un sismo relevante pero fuera de la zona/umbral exactos — se guarda `distanciaKm`/`diferenciaMagnitud` contra ese evento).

### Flujo on-demand (`apps/web/app/api/pronostico/route.ts`)

1. Recibe región (o la calcula a partir de lat/lon del usuario).
2. Busca en `pronosticos` si ya hay uno vigente para esa región (ventana que todavía no cerró) — si existe, lo devuelve directo, sin recalcular.
3. Si no, lee `sismos` recientes de la región, corre `detectarEnjambres` + `ajustarEtas`/reutiliza `parametrosEtas` vigente + `calcularProbabilidad`, guarda el resultado en `pronosticos` y lo devuelve.

Esto evita que cada visita a la pantalla dispare un cómputo (y una fila) nueva — el pronóstico se recicla mientras su ventana siga abierta.

### Job de verificación (diario, `apps/ingestor`)

Nuevo endpoint (ej. `apps/ingestor/app/api/verificar-pronosticos/route.ts`), protegido con el mismo header `x-cron-secret`, y un workflow nuevo `.github/workflows/verificar-pronosticos-cron.yml` (`schedule: cron: "0 12 * * *"`, mismo patrón que `ingest-cron.yml` pero apuntando a este endpoint). Busca pronósticos con `ventanaFin` pasada y sin fila en `verificacionesPronostico`, cruza contra `sismos`/`sismosHistoricos` de esa región/ventana, y escribe el resultado (acierto/fallo/parcial + distancia/diferencia si aplica).

### Job de recalibración (mensual, `apps/ingestor`)

Mismo patrón: endpoint nuevo + workflow mensual. Por región, si hay suficientes eventos/verificaciones nuevas desde la última calibración, corre `ajustarEtas` de nuevo con todo el historial acumulado y actualiza la fila de `parametrosEtas` correspondiente (resetea `auditadoPorGuardian` a `false` — un cambio de parámetros invalida la última auditoría).

### Auditoría de `sismologia-guardian`

No es un componente de código: es un proceso recurrente. Periódicamente (sugerido: cuando se note `auditadoPorGuardian = false` en el panel de admin, o mensualmente), se invoca al subagente para que revise `parametrosEtas` contra literatura de cada región y marque si algún valor se fue a un rango no fundamentado. El job de recalibración nunca bloquea por esto (ya se decidió: automático + auditoría periódica, no auditoría previa obligatoria).

### UI pública

- **`MenuLateral`**: nuevo botón "Pronóstico" (mismo patrón que `onAbrirEstadisticas`/`IconoEstadisticas`) → abre `PantallaPronostico` (mismo patrón overlay que `PantallaEstadisticas`/`PantallaHistorial`, gestionado por el mismo "dueño del historial de overlays" que ya existe).
- **`PantallaPronostico`**: por región relevante (la del usuario, y globalmente las que tengan enjambre activo), muestra enjambres activos, probabilidad estimada, y el **score de confiabilidad histórico del modelo** (agregado de `verificacionesPronostico`: % de aciertos hasta ahora, global y por región) — para no presentar los números como certeza sin mostrar qué tan bien le ha ido al modelo.
- **`MapaSismos`**: capa nueva (mismo patrón que la capa de fallas geológicas) que dibuja un círculo sutil sobre `enjambresDetectados` activos visibles en el viewport; tap abre un popup resumen con link a `PantallaPronostico`.
- **`ModalConfiguracion`**: nueva preferencia "Avisarme si hay un enjambre cerca" — agrega un campo `avisarEnjambre: boolean` a `pushSubscriptions` (reutiliza los campos geográficos `centroLat`/`centroLon`/`radioKm`/`alcanceMundial` que ya existen ahí).

### UI admin (`/admin/pronosticos`)

Nueva ruta + `PantallaAdminPronosticos.tsx` (mismo patrón que `PantallaReportes.tsx`), agregada al submenú admin de `MenuLateral` junto a "Usuarios"/"Reportes":

- Tabla de pronósticos activos: región, umbral, ventana, probabilidad, tiempo restante.
- Tabla de pronósticos verificados: + resultado (acierto/fallo/parcial), y si es parcial, distancia y diferencia de magnitud contra el sismo real más cercano.
- Score de confiabilidad global y por región (histórico de aciertos).
- Parámetros ETAS vigentes por región, cuántos eventos se usaron para calibrarlos, y si están auditados por `sismologia-guardian` (con fecha).

## Qué NO cambia

- `sismos` y `sismosHistoricos`: sin cambios de schema, se leen como fuente de datos, no se escriben desde este feature.
- La lógica de marcadores/radio de percepción existente en `MapaSismos.tsx` no se toca — la capa de enjambres es independiente, mismo patrón que la capa de fallas.
- El sistema de notificaciones push existente (`pushSubscriptions`) se extiende con un campo, no se rediseña.

## Testing / verificación

> Nota: hoy no existe ningún test de integración contra Postgres en el repo (`packages/db` no tiene tests; el único precedente de testing automatizado son los unit tests puros con Vitest de `packages/shared`). Este feature no introduce infraestructura de testing de DB nueva — lo que toca la base de datos se verifica manualmente contra `pnpm docker:dev`, no con un suite automatizado.

- `packages/forecast`: unit tests (Vitest, mismo patrón que `packages/shared`) de `calcularBValue`, `detectarEnjambres`, `ajustarEtas` y `calcularProbabilidad` contra casos sintéticos con parámetros conocidos.
- Capa de datos (`packages/db`) y jobs que tocan Postgres: verificación manual contra `pnpm docker:dev` (crear filas de prueba, correr el endpoint/job, inspeccionar el resultado en la tabla) — no hay suite automatizada de integración que mantener.
- Endpoint on-demand: verificación manual de que una segunda visita dentro de la misma ventana reutiliza el pronóstico existente en vez de crear uno nuevo.
- Manual: abrir `PantallaPronostico` con datos reales y confirmar que el panel de admin refleja los mismos pronósticos con su estado correcto.
- La auditoría de `sismologia-guardian` es un proceso, no un test automatizado — se verifica invocándolo y revisando su reporte.
