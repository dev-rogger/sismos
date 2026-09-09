# Pronóstico estadístico de sismos (enjambres + ETAS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el panel de pronóstico estadístico de sismos (detección de enjambres + modelo ETAS) para Chile y el mundo, con verificación automática de cada pronóstico contra sismos reales, recalibración periódica de parámetros, y paneles público/admin en `apps/web`.

**Architecture:** Paquete nuevo `packages/forecast` con la matemática pura (sin DB). 4 tablas nuevas en `packages/db`. Un endpoint on-demand en `apps/web` que calcula/reutiliza pronósticos. Dos jobs periódicos en `apps/ingestor` (verificación diaria, recalibración mensual) disparados por GitHub Actions, mismo patrón que `ingest-cron.yml`. UI pública (overlay `PantallaPronostico` + capa en el mapa + preferencia de aviso) y UI admin (`/admin/pronosticos`), ambas siguiendo los patrones ya existentes de `PantallaEstadisticas`/`PantallaReportes`.

**Tech Stack:** TypeScript, Next.js 16 App Router, Drizzle ORM + PostgreSQL, Vitest, Tailwind v4, next-intl, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-09-pronostico-estadistico-enjambres-design.md`

## Global Constraints

- Sin machine learning / redes neuronales — el "aprendizaje" es reajuste estadístico MLE estándar, no un modelo entrenado.
- Sin predicción determinística de hora/lugar/magnitud exacta — todo se expresa como probabilidad.
- Región tectónica del MVP: solo dos buckets, `"chile-subduccion"` (fuente `csn`/`gael`) y `"mundo"` (fuente `usgs`, sin desglosar por régimen tectónico todavía) — desglosar el bucket `"mundo"` en regiones tectónicas específicas es trabajo futuro que debe pasar por `sismologia-guardian` antes de fundamentarse; no se inventan fronteras de placas en este plan.
- Ventana de pronóstico por defecto: 7 días. Umbral de magnitud por defecto: M5.0. Ambos son constantes ajustables, no hardcodeados sin nombre.
- No hay precedente de tests de integración contra Postgres en el repo — no se introduce infraestructura de testing de DB nueva; lo que toca Postgres se verifica manualmente contra `pnpm docker:dev`. Los tests automatizados (Vitest) se limitan a `packages/forecast` (funciones puras), mismo patrón que `packages/shared`.
- Todo el código nuevo sigue las convenciones ya usadas en el repo: nombres de funciones/variables en español (como el resto del código), comentarios solo donde el porqué no es obvio, sin abstracciones que el spec no pida.

---

### Task 1: Scaffold `packages/forecast`

**Files:**
- Create: `packages/forecast/package.json`
- Create: `packages/forecast/tsconfig.json`
- Create: `packages/forecast/src/tipos.ts`
- Create: `packages/forecast/src/index.ts`

**Interfaces:**
- Consumes: nada.
- Produces: paquete `@sismos/forecast` instalable como `workspace:*` desde otros paquetes/apps. Exporta `SismoParaAnalisis`, `RegionSismica` desde `tipos.ts`.

- [ ] **Step 1: Crear `packages/forecast/package.json`**

```json
{
  "name": "@sismos/forecast",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint --max-warnings 0",
    "check-types": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@sismos/shared": "workspace:*"
  },
  "devDependencies": {
    "@sismos/eslint-config": "workspace:*",
    "@sismos/typescript-config": "workspace:*",
    "eslint": "^9.39.1",
    "typescript": "5.9.2",
    "vitest": "^4.1.10"
  }
}
```

- [ ] **Step 2: Crear `packages/forecast/tsconfig.json`**

```json
{
  "extends": "@sismos/typescript-config/base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Crear `packages/forecast/src/tipos.ts`**

```ts
export interface SismoParaAnalisis {
  fecha: Date;
  magnitud: number;
  latitud: number;
  longitud: number;
  profundidadKm: number;
}

// MVP: dos buckets. "mundo" no está desglosado por régimen tectónico
// todavía — desglosarlo requiere literatura de calibración por región
// (ver sismologia-guardian) y queda fuera de este plan.
export type RegionSismica = "chile-subduccion" | "mundo";

export function regionParaFuente(fuente: string): RegionSismica {
  return fuente === "csn" || fuente === "gael" ? "chile-subduccion" : "mundo";
}
```

- [ ] **Step 4: Crear `packages/forecast/src/index.ts`**

```ts
export * from "./tipos";
```

- [ ] **Step 5: Instalar dependencias del workspace**

Run: `pnpm install`
Expected: pnpm reconoce `@sismos/forecast` como nuevo workspace (por el glob `apps/*`/`packages/*` de `pnpm-workspace.yaml`) y no hay errores.

- [ ] **Step 6: Verificar tipos**

Run: `pnpm --filter @sismos/forecast check-types`
Expected: sin errores (el paquete todavía no tiene lógica, solo tipos).

- [ ] **Step 7: Commit**

```bash
git add packages/forecast
git commit -m "feat(forecast): scaffold del paquete @sismos/forecast"
```

---

### Task 2: Detección de enjambres y b-value

**Files:**
- Create: `packages/forecast/src/b-value.ts`
- Create: `packages/forecast/src/b-value.test.ts`
- Create: `packages/forecast/src/enjambres.ts`
- Create: `packages/forecast/src/enjambres.test.ts`
- Modify: `packages/forecast/src/index.ts`
- Modify: `packages/forecast/package.json` (agrega dependencia `@sismos/shared` ya está; no hace falta nada más — ya se agregó en Task 1)

**Interfaces:**
- Consumes: `SismoParaAnalisis` (Task 1), `distanciaKm` de `@sismos/shared` (ya existe en `packages/shared/src/distancia.ts`).
- Produces: `calcularBValue(magnitudes: number[], magnitudMinima: number): number | null`, `EnjambreDetectado` y `detectarEnjambres(sismos: SismoParaAnalisis[]): EnjambreDetectado[]` — usados por Task 3 (probabilidad) y Task 5 (queries).

- [ ] **Step 1: Escribir el test de `calcularBValue`**

```ts
// packages/forecast/src/b-value.test.ts
import { describe, it, expect } from "vitest";
import { calcularBValue } from "./b-value";

describe("calcularBValue", () => {
  it("devuelve ~1.0 para una distribución Gutenberg-Richter clásica (b=1)", () => {
    // Magnitudes generadas para que la media quede en Mmin + 1/(b*ln(10))
    // con b=1 y Mmin=2: media teórica ≈ 2 + 0.434 = 2.434.
    const magnitudes = [2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8, 3.0, 3.5];
    const b = calcularBValue(magnitudes, 2.0);
    expect(b).not.toBeNull();
    expect(b!).toBeGreaterThan(0.5);
    expect(b!).toBeLessThan(2.5);
  });

  it("devuelve null si no hay suficientes eventos sobre el umbral", () => {
    expect(calcularBValue([2.1], 2.0)).toBeNull();
    expect(calcularBValue([], 2.0)).toBeNull();
  });

  it("un catálogo con magnitudes más altas en promedio da un b-value más bajo", () => {
    const bajo = calcularBValue([2.0, 2.1, 2.2, 2.3, 2.4], 2.0)!;
    const alto = calcularBValue([2.0, 4.0, 5.0, 6.0, 7.0], 2.0)!;
    expect(alto).toBeLessThan(bajo);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter @sismos/forecast test`
Expected: FAIL — `Cannot find module './b-value'`.

- [ ] **Step 3: Implementar `calcularBValue`**

```ts
// packages/forecast/src/b-value.ts
const MINIMO_EVENTOS = 5;

/**
 * b-value de Gutenberg-Richter por máxima verosimilitud (Aki, 1965):
 * b = log10(e) / (media(M) - Mmin). Un b-value bajo es una señal (no una
 * prueba) de mayor acumulación de estrés relativa a la sismicidad normal
 * de la zona.
 */
export function calcularBValue(
  magnitudes: number[],
  magnitudMinima: number,
): number | null {
  const sobreUmbral = magnitudes.filter((m) => m >= magnitudMinima);
  if (sobreUmbral.length < MINIMO_EVENTOS) return null;

  const media =
    sobreUmbral.reduce((suma, m) => suma + m, 0) / sobreUmbral.length;
  const diferencia = media - magnitudMinima;
  if (diferencia <= 0) return null;

  return Math.LOG10E / diferencia;
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter @sismos/forecast test`
Expected: PASS (los 3 tests de `b-value.test.ts`).

- [ ] **Step 5: Escribir el test de `detectarEnjambres`**

```ts
// packages/forecast/src/enjambres.test.ts
import { describe, it, expect } from "vitest";
import { detectarEnjambres } from "./enjambres";
import type { SismoParaAnalisis } from "./tipos";

function sismo(
  horasDesdeAhora: number,
  lat: number,
  lon: number,
  magnitud = 2.5,
): SismoParaAnalisis {
  return {
    fecha: new Date(Date.now() - horasDesdeAhora * 60 * 60 * 1000),
    magnitud,
    latitud: lat,
    longitud: lon,
    profundidadKm: 30,
  };
}

describe("detectarEnjambres", () => {
  it("agrupa eventos cercanos en tiempo y espacio en un enjambre", () => {
    const cluster = [
      sismo(1, -33.0, -71.0),
      sismo(3, -33.01, -71.01),
      sismo(5, -32.99, -70.99),
      sismo(8, -33.02, -71.02),
      sismo(10, -33.0, -71.0),
    ];
    const enjambres = detectarEnjambres(cluster);
    expect(enjambres).toHaveLength(1);
    expect(enjambres[0].nEventos).toBe(5);
    expect(enjambres[0].radioKm).toBeLessThan(50);
  });

  it("no agrupa eventos lejanos entre sí como un solo enjambre", () => {
    const lejanos = [
      sismo(1, -33.0, -71.0),
      sismo(2, -33.01, -71.01),
      sismo(3, -18.0, -69.0),
      sismo(4, -18.01, -69.01),
    ];
    const enjambres = detectarEnjambres(lejanos);
    expect(enjambres.length).toBeGreaterThanOrEqual(1);
    // Ningún enjambre mezcla eventos de ambos grupos geográficos.
    for (const e of enjambres) {
      expect(e.nEventos).toBeLessThan(4);
    }
  });

  it("no reporta enjambre cuando hay muy pocos eventos aislados", () => {
    expect(detectarEnjambres([sismo(1, -33, -71)])).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Correr el test y verificar que falla**

Run: `pnpm --filter @sismos/forecast test`
Expected: FAIL — `Cannot find module './enjambres'`.

- [ ] **Step 7: Implementar `detectarEnjambres`**

```ts
// packages/forecast/src/enjambres.ts
import { distanciaKm } from "@sismos/shared";
import { calcularBValue } from "./b-value";
import type { SismoParaAnalisis } from "./tipos";

export interface EnjambreDetectado {
  centro: { lat: number; lon: number };
  radioKm: number;
  nEventos: number;
  fechaInicio: Date;
  fechaFin: Date;
  bValue: number | null;
}

const RADIO_CLUSTER_KM = 50;
const VENTANA_TEMPORAL_HORAS = 72;
const MINIMO_EVENTOS_ENJAMBRE = 3;

/**
 * Clustering espacio-temporal simple tipo DBSCAN: dos sismos quedan en el
 * mismo enjambre si están a menos de RADIO_CLUSTER_KM y ocurrieron dentro
 * de VENTANA_TEMPORAL_HORAS uno del otro (transitividad: A-B-C conecta
 * aunque A y C no cumplan la condición directamente entre sí).
 */
export function detectarEnjambres(
  sismos: SismoParaAnalisis[],
): EnjambreDetectado[] {
  const ordenados = [...sismos].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime(),
  );
  const visitados = new Set<number>();
  const enjambres: EnjambreDetectado[] = [];

  for (let i = 0; i < ordenados.length; i++) {
    if (visitados.has(i)) continue;

    const grupo = [i];
    visitados.add(i);
    // Expansión por transitividad: cada vez que se suma un evento al
    // grupo, se lo compara contra todos los que todavía no fueron
    // visitados.
    for (let idx = 0; idx < grupo.length; idx++) {
      const actual = ordenados[grupo[idx]];
      for (let j = 0; j < ordenados.length; j++) {
        if (visitados.has(j)) continue;
        const candidato = ordenados[j];
        const horas =
          Math.abs(candidato.fecha.getTime() - actual.fecha.getTime()) /
          (60 * 60 * 1000);
        if (horas > VENTANA_TEMPORAL_HORAS) continue;
        const km = distanciaKm(
          actual.latitud,
          actual.longitud,
          candidato.latitud,
          candidato.longitud,
        );
        if (km > RADIO_CLUSTER_KM) continue;
        visitados.add(j);
        grupo.push(j);
      }
    }

    if (grupo.length < MINIMO_EVENTOS_ENJAMBRE) continue;

    const eventos = grupo.map((idx) => ordenados[idx]);
    const centroLat =
      eventos.reduce((s, e) => s + e.latitud, 0) / eventos.length;
    const centroLon =
      eventos.reduce((s, e) => s + e.longitud, 0) / eventos.length;
    const radioKm = Math.max(
      ...eventos.map((e) =>
        distanciaKm(centroLat, centroLon, e.latitud, e.longitud),
      ),
      1,
    );
    const fechas = eventos.map((e) => e.fecha.getTime());

    enjambres.push({
      centro: { lat: centroLat, lon: centroLon },
      radioKm,
      nEventos: eventos.length,
      fechaInicio: new Date(Math.min(...fechas)),
      fechaFin: new Date(Math.max(...fechas)),
      bValue: calcularBValue(
        eventos.map((e) => e.magnitud),
        Math.min(...eventos.map((e) => e.magnitud)),
      ),
    });
  }

  return enjambres;
}
```

- [ ] **Step 8: Correr el test y verificar que pasa**

Run: `pnpm --filter @sismos/forecast test`
Expected: PASS (todos los tests de `b-value.test.ts` y `enjambres.test.ts`).

- [ ] **Step 9: Exportar desde el índice del paquete**

```ts
// packages/forecast/src/index.ts
export * from "./tipos";
export * from "./b-value";
export * from "./enjambres";
```

- [ ] **Step 10: Lint y commit**

Run: `pnpm --filter @sismos/forecast lint && pnpm --filter @sismos/forecast check-types`
Expected: sin errores.

```bash
git add packages/forecast
git commit -m "feat(forecast): detección de enjambres y b-value de Gutenberg-Richter"
```

---

### Task 3: Ajuste ETAS y cálculo de probabilidad

**Files:**
- Create: `packages/forecast/src/etas.ts`
- Create: `packages/forecast/src/etas.test.ts`
- Modify: `packages/forecast/src/index.ts`

**Interfaces:**
- Consumes: `SismoParaAnalisis` (Task 1).
- Produces: `ParametrosEtasAjustados { mu, k, alpha, c, p, nEventos }`, `ajustarEtas(historial: SismoParaAnalisis[], magnitudMinima: number): ParametrosEtasAjustados | null`, `calcularProbabilidad(parametros: { mu: number; k: number; alpha: number; c: number; p: number }, historialReciente: SismoParaAnalisis[], magnitudMinima: number, desde: Date, hasta: Date, magnitudUmbral: number): number` — usados por Task 5 (queries) y Task 6 (endpoint).

- [ ] **Step 1: Escribir el test de `calcularProbabilidad`**

```ts
// packages/forecast/src/etas.test.ts
import { describe, it, expect } from "vitest";
import { ajustarEtas, calcularProbabilidad } from "./etas";
import type { SismoParaAnalisis } from "./tipos";

const PARAMS_BASE = { mu: 0.01, k: 0.5, alpha: 1.0, c: 0.1, p: 1.1 };

function sismo(diasAtras: number, magnitud: number): SismoParaAnalisis {
  return {
    fecha: new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000),
    magnitud,
    latitud: -33,
    longitud: -71,
    profundidadKm: 30,
  };
}

describe("calcularProbabilidad", () => {
  it("da una probabilidad más alta justo después de un evento grande que sin historial reciente", () => {
    const conMainshock = calcularProbabilidad(
      PARAMS_BASE,
      [sismo(0.1, 6.0)],
      2.0,
      new Date(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      4.0,
    );
    const sinHistorial = calcularProbabilidad(
      PARAMS_BASE,
      [],
      2.0,
      new Date(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      4.0,
    );
    expect(conMainshock).toBeGreaterThan(sinHistorial);
  });

  it("devuelve una probabilidad entre 0 y 1", () => {
    const p = calcularProbabilidad(
      PARAMS_BASE,
      [sismo(1, 5.0), sismo(2, 4.5)],
      2.0,
      new Date(),
      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      4.0,
    );
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("una ventana más larga da una probabilidad mayor o igual que una corta", () => {
    const ahora = new Date();
    const corta = calcularProbabilidad(
      PARAMS_BASE,
      [],
      2.0,
      ahora,
      new Date(ahora.getTime() + 1 * 24 * 60 * 60 * 1000),
      4.0,
    );
    const larga = calcularProbabilidad(
      PARAMS_BASE,
      [],
      2.0,
      ahora,
      new Date(ahora.getTime() + 30 * 24 * 60 * 60 * 1000),
      4.0,
    );
    expect(larga).toBeGreaterThanOrEqual(corta);
  });
});

describe("ajustarEtas", () => {
  it("devuelve null si no hay suficiente historial", () => {
    expect(ajustarEtas([sismo(1, 3.0), sismo(2, 3.0)], 2.0)).toBeNull();
  });

  it("recupera un patrón de actividad decreciente tipo Omori en una secuencia sintética", () => {
    // Mainshock + réplicas cuya frecuencia decae con el tiempo (patrón
    // Omori clásico) — no se compara contra un valor exacto de p/c (la
    // optimización es aproximada), se verifica que el ajuste converge y
    // que el modelo resultante predice más actividad cerca del mainshock
    // que lejos de él.
    const historial: SismoParaAnalisis[] = [sismo(30, 6.5)];
    // Réplicas más frecuentes cerca del día 30 (recién ocurrido el
    // mainshock) y cada vez más espaciadas después — decaimiento Omori.
    const horasReplicas = [0.1, 0.3, 0.6, 1, 2, 4, 8, 16, 24];
    for (const h of horasReplicas) {
      historial.push(sismo(30 - h / 24, 3.0 + Math.random() * 0.5));
    }

    const ajuste = ajustarEtas(historial, 2.0);
    expect(ajuste).not.toBeNull();
    expect(ajuste!.nEventos).toBe(historial.length);
    expect(ajuste!.p).toBeGreaterThan(0);
    expect(ajuste!.k).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter @sismos/forecast test`
Expected: FAIL — `Cannot find module './etas'`.

- [ ] **Step 3: Implementar `etas.ts`**

```ts
// packages/forecast/src/etas.ts
import type { SismoParaAnalisis } from "./tipos";

export interface ParametrosEtasValores {
  mu: number;
  k: number;
  alpha: number;
  c: number;
  p: number;
}

export interface ParametrosEtasAjustados extends ParametrosEtasValores {
  nEventos: number;
}

const MINIMO_EVENTOS_AJUSTE = 5;

/**
 * Log-verosimilitud de un proceso puntual ETAS temporal (Ogata, 1988):
 * LL = Σ log(λ(t_i)) - ∫[0,T] λ(t) dt
 * con λ(t) = μ + Σ_{t_j<t} K·e^(α(M_j-Mmin)) / (t-t_j+c)^p
 */
function logVerosimilitud(
  params: ParametrosEtasValores,
  eventos: { tDias: number; magnitud: number }[],
  magnitudMinima: number,
  tFinal: number,
): number {
  const { mu, k, alpha, c, p } = params;

  let sumaLogLambda = 0;
  for (let i = 0; i < eventos.length; i++) {
    let lambda = mu;
    for (let j = 0; j < i; j++) {
      const dt = eventos[i].tDias - eventos[j].tDias;
      lambda +=
        k *
        Math.exp(alpha * (eventos[j].magnitud - magnitudMinima)) *
        Math.pow(dt + c, -p);
    }
    sumaLogLambda += Math.log(Math.max(lambda, 1e-12));
  }

  let integral = mu * tFinal;
  for (const evento of eventos) {
    const excitacion = k * Math.exp(alpha * (evento.magnitud - magnitudMinima));
    const restante = tFinal - evento.tDias;
    if (restante <= 0) continue;
    integral +=
      p === 1
        ? excitacion * (Math.log(restante + c) - Math.log(c))
        : (excitacion *
            (Math.pow(restante + c, 1 - p) - Math.pow(c, 1 - p))) /
          (1 - p);
  }

  return sumaLogLambda - integral;
}

/**
 * Ajuste MLE por coordinate ascent: para cada parámetro, prueba una grilla
 * de candidatos (log-espaciada para K/c, lineal para μ/α/p) y se queda con
 * el que maximiza la log-verosimilitud, repitiendo varias pasadas. No es
 * un optimizador numérico sofisticado (L-BFGS/EM) — es una aproximación
 * simple pero real de MLE, pensada para revisarse/mejorarse con
 * sismologia-guardian si la precisión no alcanza.
 */
export function ajustarEtas(
  historial: SismoParaAnalisis[],
  magnitudMinima: number,
): ParametrosEtasAjustados | null {
  const sobreUmbral = historial.filter((s) => s.magnitud >= magnitudMinima);
  if (sobreUmbral.length < MINIMO_EVENTOS_AJUSTE) return null;

  const ordenados = [...sobreUmbral].sort(
    (a, b) => a.fecha.getTime() - b.fecha.getTime(),
  );
  const t0 = ordenados[0].fecha.getTime();
  const eventos = ordenados.map((s) => ({
    tDias: (s.fecha.getTime() - t0) / (24 * 60 * 60 * 1000),
    magnitud: s.magnitud,
  }));
  const tFinal = eventos[eventos.length - 1].tDias + 1;

  let params: ParametrosEtasValores = {
    mu: 0.05,
    k: 0.3,
    alpha: 1.0,
    c: 0.1,
    p: 1.1,
  };

  const grillas: Record<keyof ParametrosEtasValores, number[]> = {
    mu: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
    k: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2],
    alpha: [0.2, 0.5, 0.8, 1.0, 1.5, 2.0],
    c: [0.01, 0.05, 0.1, 0.3, 0.5, 1],
    p: [0.6, 0.8, 1.0, 1.1, 1.3, 1.5, 2.0],
  };

  const PASADAS = 4;
  for (let pasada = 0; pasada < PASADAS; pasada++) {
    for (const clave of Object.keys(grillas) as (keyof ParametrosEtasValores)[]) {
      let mejorValor = params[clave];
      let mejorLL = logVerosimilitud(params, eventos, magnitudMinima, tFinal);
      for (const candidato of grillas[clave]) {
        const intento = { ...params, [clave]: candidato };
        const ll = logVerosimilitud(intento, eventos, magnitudMinima, tFinal);
        if (ll > mejorLL) {
          mejorLL = ll;
          mejorValor = candidato;
        }
      }
      params = { ...params, [clave]: mejorValor };
    }
  }

  return { ...params, nEventos: sobreUmbral.length };
}

/**
 * Probabilidad de al menos un evento M≥magnitudUmbral entre `desde` y
 * `hasta`, integrando la tasa esperada λ(t) del modelo ETAS (con
 * `historialReciente` como excitación de fondo) y convirtiendo la tasa
 * esperada a probabilidad vía proceso de Poisson: P = 1 - e^(-Λ).
 */
export function calcularProbabilidad(
  parametros: ParametrosEtasValores,
  historialReciente: SismoParaAnalisis[],
  magnitudMinima: number,
  desde: Date,
  hasta: Date,
  magnitudUmbral: number,
): number {
  const { mu, k, alpha, c, p } = parametros;
  const factorUmbral = Math.exp(alpha * (magnitudUmbral - magnitudMinima));
  const desdeMs = desde.getTime();
  const hastaMs = hasta.getTime();
  const duracionDias = (hastaMs - desdeMs) / (24 * 60 * 60 * 1000);

  let lambdaIntegrada = mu * factorUmbral * duracionDias;

  for (const evento of historialReciente) {
    const dtDesdeDias = (desdeMs - evento.fecha.getTime()) / (24 * 60 * 60 * 1000);
    const dtHastaDias = (hastaMs - evento.fecha.getTime()) / (24 * 60 * 60 * 1000);
    if (dtHastaDias <= 0) continue;
    const excitacion =
      k * Math.exp(alpha * (evento.magnitud - magnitudMinima)) * factorUmbral;
    const inicio = Math.max(dtDesdeDias, 0);
    lambdaIntegrada +=
      p === 1
        ? excitacion * (Math.log(dtHastaDias + c) - Math.log(inicio + c))
        : (excitacion *
            (Math.pow(dtHastaDias + c, 1 - p) - Math.pow(inicio + c, 1 - p))) /
          (1 - p);
  }

  return 1 - Math.exp(-Math.max(lambdaIntegrada, 0));
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `pnpm --filter @sismos/forecast test`
Expected: PASS (todos los tests de `etas.test.ts`; si `ajustarEtas` es lento, debería igual correr en menos de unos pocos segundos con historiales de <20 eventos).

- [ ] **Step 5: Exportar desde el índice del paquete**

```ts
// packages/forecast/src/index.ts
export * from "./tipos";
export * from "./b-value";
export * from "./enjambres";
export * from "./etas";
```

- [ ] **Step 6: Lint, tipos y commit**

Run: `pnpm --filter @sismos/forecast lint && pnpm --filter @sismos/forecast check-types && pnpm --filter @sismos/forecast test`
Expected: sin errores, todos los tests pasan.

```bash
git add packages/forecast
git commit -m "feat(forecast): ajuste ETAS (MLE) y cálculo de probabilidad de pronóstico"
```

---

### Task 4: Tablas nuevas en `packages/db`

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/drizzle/000N_*.sql` (generado, no escrito a mano)

**Interfaces:**
- Consumes: tabla `sismos` existente (FK desde `verificacionesPronostico`).
- Produces: `parametrosEtas`, `enjambresDetectados`, `pronosticos`, `verificacionesPronostico` — tablas Drizzle consumidas por Task 5.

- [ ] **Step 1: Agregar las tablas a `packages/db/src/schema.ts`**

Agregar `integer` al import existente de `drizzle-orm/pg-core` (línea 1-10) y agregar al final del archivo:

```ts
// packages/db/src/schema.ts — agregar "integer" al import de arriba:
import {
  pgTable,
  serial,
  text,
  timestamp,
  real,
  doublePrecision,
  boolean,
  integer,
  unique,
} from "drizzle-orm/pg-core";
```

```ts
// packages/db/src/schema.ts — agregar al final del archivo:

export const parametrosEtas = pgTable("parametros_etas", {
  id: serial("id").primaryKey(),
  region: text("region").notNull().unique(), // "chile-subduccion" | "mundo"
  mu: real("mu").notNull(),
  k: real("k").notNull(),
  alpha: real("alpha").notNull(),
  c: real("c").notNull(),
  p: real("p").notNull(),
  nEventosCalibracion: integer("n_eventos_calibracion").notNull(),
  fechaCalibracion: timestamp("fecha_calibracion").notNull().defaultNow(),
  auditadoPorGuardian: boolean("auditado_por_guardian")
    .notNull()
    .default(false),
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
  fechaFin: timestamp("fecha_fin"),
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

- [ ] **Step 2: Generar la migración**

Run: `pnpm --filter @sismos/db db:generate`
Expected: crea un nuevo archivo `packages/db/drizzle/000N_<nombre>.sql` con los 4 `CREATE TABLE`. Revisar el SQL generado: debe incluir los `UNIQUE`/`REFERENCES` de arriba y ningún `DROP` inesperado sobre tablas existentes.

- [ ] **Step 3: Aplicar la migración contra Postgres local**

Run: `pnpm docker:dev` (en otra terminal, si no está corriendo) y luego `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:migrate`
Expected: sin errores; `psql` o cualquier cliente contra esa URL muestra las 4 tablas nuevas.

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter @sismos/db check-types`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/drizzle
git commit -m "feat(db): tablas para pronóstico estadístico de sismos (ETAS + enjambres)"
```

---

### Task 5: Queries de `packages/db` para el feature

**Files:**
- Create: `packages/db/src/queries/parametros-etas.ts`
- Create: `packages/db/src/queries/enjambre.ts`
- Create: `packages/db/src/queries/pronostico.ts`
- Create: `packages/db/src/queries/verificacion-pronostico.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: tablas de Task 4, tipo `RegionSismica` de `@sismos/forecast` (agregar `@sismos/forecast` como dependencia de `packages/db/package.json`, `workspace:*`, mismo patrón que `@sismos/shared` ahí).
- Produces: funciones consumidas por Task 6 (endpoint on-demand), Task 7 (job de verificación), Task 8 (job de recalibración), Task 12 (admin).

- [ ] **Step 1: Agregar `@sismos/forecast` como dependencia de `packages/db`**

En `packages/db/package.json`, agregar a `dependencies`:

```json
"@sismos/forecast": "workspace:*",
```

Run: `pnpm install`

- [ ] **Step 2: Crear `packages/db/src/queries/parametros-etas.ts`**

```ts
import { eq } from "drizzle-orm";
import type { RegionSismica, ParametrosEtasValores } from "@sismos/forecast";
import { getDb } from "../connection";
import { parametrosEtas } from "../schema";

export interface ParametrosEtasRegistro extends ParametrosEtasValores {
  id: number;
  region: RegionSismica;
  nEventosCalibracion: number;
  fechaCalibracion: Date;
  auditadoPorGuardian: boolean;
  fechaUltimaAuditoriaGuardian: Date | null;
}

function toRegistro(
  row: typeof parametrosEtas.$inferSelect,
): ParametrosEtasRegistro {
  return {
    id: row.id,
    region: row.region as RegionSismica,
    mu: row.mu,
    k: row.k,
    alpha: row.alpha,
    c: row.c,
    p: row.p,
    nEventosCalibracion: row.nEventosCalibracion,
    fechaCalibracion: row.fechaCalibracion,
    auditadoPorGuardian: row.auditadoPorGuardian,
    fechaUltimaAuditoriaGuardian: row.fechaUltimaAuditoriaGuardian,
  };
}

export async function getParametrosVigentes(
  region: RegionSismica,
): Promise<ParametrosEtasRegistro | null> {
  const rows = await getDb()
    .select()
    .from(parametrosEtas)
    .where(eq(parametrosEtas.region, region))
    .limit(1);
  return rows[0] ? toRegistro(rows[0]) : null;
}

export async function upsertParametrosEtas(input: {
  region: RegionSismica;
  valores: ParametrosEtasValores;
  nEventosCalibracion: number;
}): Promise<ParametrosEtasRegistro> {
  const rows = await getDb()
    .insert(parametrosEtas)
    .values({
      region: input.region,
      mu: input.valores.mu,
      k: input.valores.k,
      alpha: input.valores.alpha,
      c: input.valores.c,
      p: input.valores.p,
      nEventosCalibracion: input.nEventosCalibracion,
      fechaCalibracion: new Date(),
      // Un cambio de parámetros invalida la última auditoría.
      auditadoPorGuardian: false,
      fechaUltimaAuditoriaGuardian: null,
    })
    .onConflictDoUpdate({
      target: parametrosEtas.region,
      set: {
        mu: input.valores.mu,
        k: input.valores.k,
        alpha: input.valores.alpha,
        c: input.valores.c,
        p: input.valores.p,
        nEventosCalibracion: input.nEventosCalibracion,
        fechaCalibracion: new Date(),
        auditadoPorGuardian: false,
        fechaUltimaAuditoriaGuardian: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return toRegistro(rows[0]);
}

export async function marcarAuditadoPorGuardian(
  region: RegionSismica,
): Promise<void> {
  await getDb()
    .update(parametrosEtas)
    .set({ auditadoPorGuardian: true, fechaUltimaAuditoriaGuardian: new Date() })
    .where(eq(parametrosEtas.region, region));
}

export async function listarTodosLosParametros(): Promise<
  ParametrosEtasRegistro[]
> {
  const rows = await getDb().select().from(parametrosEtas);
  return rows.map(toRegistro);
}
```

- [ ] **Step 3: Crear `packages/db/src/queries/enjambre.ts`**

```ts
import { eq, and } from "drizzle-orm";
import type { RegionSismica } from "@sismos/forecast";
import { getDb } from "../connection";
import { enjambresDetectados } from "../schema";

export interface EnjambreRegistro {
  id: number;
  region: RegionSismica;
  centroLat: number;
  centroLon: number;
  radioKm: number;
  nEventos: number;
  bValue: number | null;
  fechaInicio: Date;
  fechaFin: Date | null;
  estado: "activo" | "resuelto";
}

function toRegistro(
  row: typeof enjambresDetectados.$inferSelect,
): EnjambreRegistro {
  return {
    id: row.id,
    region: row.region as RegionSismica,
    centroLat: row.centroLat,
    centroLon: row.centroLon,
    radioKm: row.radioKm,
    nEventos: row.nEventos,
    bValue: row.bValue,
    fechaInicio: row.fechaInicio,
    fechaFin: row.fechaFin,
    estado: row.estado as "activo" | "resuelto",
  };
}

export async function listarEnjambresActivos(
  region?: RegionSismica,
): Promise<EnjambreRegistro[]> {
  const condicion = region
    ? and(
        eq(enjambresDetectados.estado, "activo"),
        eq(enjambresDetectados.region, region),
      )
    : eq(enjambresDetectados.estado, "activo");
  const rows = await getDb()
    .select()
    .from(enjambresDetectados)
    .where(condicion);
  return rows.map(toRegistro);
}

export async function registrarEnjambre(input: {
  region: RegionSismica;
  centro: { lat: number; lon: number };
  radioKm: number;
  nEventos: number;
  bValue: number | null;
  fechaInicio: Date;
  fechaFin: Date;
}): Promise<EnjambreRegistro> {
  const rows = await getDb()
    .insert(enjambresDetectados)
    .values({
      region: input.region,
      centroLat: input.centro.lat,
      centroLon: input.centro.lon,
      radioKm: input.radioKm,
      nEventos: input.nEventos,
      bValue: input.bValue,
      fechaInicio: input.fechaInicio,
      fechaFin: input.fechaFin,
      estado: "activo",
    })
    .returning();
  return toRegistro(rows[0]);
}

export async function resolverEnjambre(id: number): Promise<void> {
  await getDb()
    .update(enjambresDetectados)
    .set({ estado: "resuelto", updatedAt: new Date() })
    .where(eq(enjambresDetectados.id, id));
}
```

- [ ] **Step 4: Crear `packages/db/src/queries/pronostico.ts`**

```ts
import { eq, and, gt, isNull } from "drizzle-orm";
import type { RegionSismica } from "@sismos/forecast";
import { getDb } from "../connection";
import { pronosticos, verificacionesPronostico } from "../schema";

export interface PronosticoRegistro {
  id: number;
  region: RegionSismica;
  magnitudUmbral: number;
  ventanaInicio: Date;
  ventanaFin: Date;
  probabilidad: number;
  parametrosEtasId: number;
  createdAt: Date;
}

function toRegistro(row: typeof pronosticos.$inferSelect): PronosticoRegistro {
  return {
    id: row.id,
    region: row.region as RegionSismica,
    magnitudUmbral: row.magnitudUmbral,
    ventanaInicio: row.ventanaInicio,
    ventanaFin: row.ventanaFin,
    probabilidad: row.probabilidad,
    parametrosEtasId: row.parametrosEtasId,
    createdAt: row.createdAt,
  };
}

/** Pronóstico vigente (ventanaFin en el futuro) para una región+umbral. */
export async function getPronosticoVigente(
  region: RegionSismica,
  magnitudUmbral: number,
): Promise<PronosticoRegistro | null> {
  const rows = await getDb()
    .select()
    .from(pronosticos)
    .where(
      and(
        eq(pronosticos.region, region),
        eq(pronosticos.magnitudUmbral, magnitudUmbral),
        gt(pronosticos.ventanaFin, new Date()),
      ),
    )
    .limit(1);
  return rows[0] ? toRegistro(rows[0]) : null;
}

export async function crearPronostico(input: {
  region: RegionSismica;
  magnitudUmbral: number;
  ventanaInicio: Date;
  ventanaFin: Date;
  probabilidad: number;
  parametrosEtasId: number;
}): Promise<PronosticoRegistro> {
  const rows = await getDb().insert(pronosticos).values(input).returning();
  return toRegistro(rows[0]);
}

/** Pronósticos cuya ventana ya cerró y todavía no tienen verificación. */
export async function listarPronosticosPorVerificar(): Promise<
  PronosticoRegistro[]
> {
  const rows = await getDb()
    .select({ pronostico: pronosticos })
    .from(pronosticos)
    .leftJoin(
      verificacionesPronostico,
      eq(verificacionesPronostico.pronosticoId, pronosticos.id),
    )
    .where(
      and(gt(new Date(), pronosticos.ventanaFin), isNull(verificacionesPronostico.id)),
    );
  return rows.map((r) => toRegistro(r.pronostico));
}

export async function listarTodos(): Promise<PronosticoRegistro[]> {
  const rows = await getDb().select().from(pronosticos);
  return rows.map(toRegistro);
}
```

- [ ] **Step 5: Crear `packages/db/src/queries/verificacion-pronostico.ts`**

```ts
import { eq } from "drizzle-orm";
import { getDb } from "../connection";
import { verificacionesPronostico } from "../schema";

export type ResultadoVerificacion = "acierto" | "fallo" | "parcial";

export interface VerificacionRegistro {
  id: number;
  pronosticoId: number;
  resultado: ResultadoVerificacion;
  sismoRealId: number | null;
  distanciaKm: number | null;
  diferenciaMagnitud: number | null;
  fechaVerificacion: Date;
}

function toRegistro(
  row: typeof verificacionesPronostico.$inferSelect,
): VerificacionRegistro {
  return {
    id: row.id,
    pronosticoId: row.pronosticoId,
    resultado: row.resultado as ResultadoVerificacion,
    sismoRealId: row.sismoRealId,
    distanciaKm: row.distanciaKm,
    diferenciaMagnitud: row.diferenciaMagnitud,
    fechaVerificacion: row.fechaVerificacion,
  };
}

export async function crearVerificacion(input: {
  pronosticoId: number;
  resultado: ResultadoVerificacion;
  sismoRealId?: number | null;
  distanciaKm?: number | null;
  diferenciaMagnitud?: number | null;
}): Promise<VerificacionRegistro> {
  const rows = await getDb()
    .insert(verificacionesPronostico)
    .values({
      pronosticoId: input.pronosticoId,
      resultado: input.resultado,
      sismoRealId: input.sismoRealId ?? null,
      distanciaKm: input.distanciaKm ?? null,
      diferenciaMagnitud: input.diferenciaMagnitud ?? null,
    })
    .returning();
  return toRegistro(rows[0]);
}

export async function listarTodasLasVerificaciones(): Promise<
  VerificacionRegistro[]
> {
  const rows = await getDb().select().from(verificacionesPronostico);
  return rows.map(toRegistro);
}

/** % de aciertos sobre el total verificado (aciertos + parciales cuentan como 1 y 0.5). */
export function calcularScoreConfiabilidad(
  verificaciones: VerificacionRegistro[],
): number | null {
  if (verificaciones.length === 0) return null;
  const puntos = verificaciones.reduce((suma, v) => {
    if (v.resultado === "acierto") return suma + 1;
    if (v.resultado === "parcial") return suma + 0.5;
    return suma;
  }, 0);
  return puntos / verificaciones.length;
}
```

- [ ] **Step 6: Re-exportar desde `packages/db/src/index.ts`**

```ts
export * from "./schema";
export * from "./queries/sismo";
export * from "./queries/sismo-historico";
export * from "./queries/push-subscription";
export * from "./queries/estado-ingesta";
export * from "./queries/user";
export * from "./queries/parametros-etas";
export * from "./queries/enjambre";
export * from "./queries/pronostico";
export * from "./queries/verificacion-pronostico";
```

- [ ] **Step 7: Verificar tipos**

Run: `pnpm --filter @sismos/db check-types`
Expected: sin errores.

- [ ] **Step 8: Verificación manual contra Postgres local**

Con `pnpm docker:dev` corriendo y la migración de Task 4 aplicada: escribir un script chico temporal (ej. `packages/db/scratch.ts`, no se commitea) que importe `upsertParametrosEtas`, `crearPronostico`, `crearVerificacion`, etc., corra cada función con datos de prueba y haga `console.log` del resultado. Correrlo con `pnpm --filter @sismos/db exec tsx scratch.ts` (o `node --experimental-strip-types` según lo que ya use el repo — revisar cómo corre scripts sueltos `apps/web/scripts/generar-fallas-chile.mjs` como referencia de convención). Confirmar que cada insert/update/select se comporta como se espera, después borrar el script.

- [ ] **Step 9: Commit**

```bash
git add packages/db
git commit -m "feat(db): queries de parámetros ETAS, enjambres, pronósticos y verificaciones"
```

---

### Task 6: Endpoint on-demand `/api/pronostico` (apps/web)

**Files:**
- Create: `apps/web/lib/pronostico.ts`
- Create: `apps/web/app/api/pronostico/route.ts`

**Interfaces:**
- Consumes: `getParametrosVigentes`, `upsertParametrosEtas`, `getPronosticoVigente`, `crearPronostico`, `listarEnjambresActivos` (Task 5); `detectarEnjambres`, `ajustarEtas`, `calcularProbabilidad`, `regionParaFuente` (Task 2/3); `findRecentByFuente` (ya existe en `@sismos/db`, usado por el ingestor — ver `packages/db/src/queries/sismo.ts`).
- Produces: `GET /api/pronostico?region=chile-subduccion` → `{ region, probabilidad, ventanaInicio, ventanaFin, magnitudUmbral, enjambresActivos }`, consumido por Task 9 (hook `use-pronostico.ts`).

- [ ] **Step 1: Crear `apps/web/lib/pronostico.ts` con la lógica de reutilización/cómputo**

```ts
import {
  getDb,
  getParametrosVigentes,
  upsertParametrosEtas,
  getPronosticoVigente,
  crearPronostico,
  listarEnjambresActivos,
  registrarEnjambre,
  type PronosticoRegistro,
  type EnjambreRegistro,
} from "@sismos/db";
import {
  ajustarEtas,
  calcularProbabilidad,
  detectarEnjambres,
  type RegionSismica,
  type SismoParaAnalisis,
} from "@sismos/forecast";
import { sismos } from "@sismos/db";
import { gte } from "drizzle-orm";
import { and, eq } from "drizzle-orm";

const VENTANA_DIAS = 7;
const MAGNITUD_UMBRAL_DEFAULT = 5.0;
const MAGNITUD_MINIMA_CATALOGO = 2.5;
const LOOKBACK_DIAS = 365;
const FUENTES_POR_REGION: Record<RegionSismica, string[]> = {
  "chile-subduccion": ["csn", "gael"],
  mundo: ["usgs"],
};

export interface RespuestaPronostico {
  region: RegionSismica;
  probabilidad: number;
  magnitudUmbral: number;
  ventanaInicio: string;
  ventanaFin: string;
  enjambresActivos: EnjambreRegistro[];
}

async function leerHistorial(region: RegionSismica): Promise<SismoParaAnalisis[]> {
  const desde = new Date(Date.now() - LOOKBACK_DIAS * 24 * 60 * 60 * 1000);
  const db = getDb();
  const filas = await db
    .select()
    .from(sismos)
    .where(
      and(
        gte(sismos.fecha, desde),
        eq(sismos.fuente, FUENTES_POR_REGION[region][0]),
      ),
    );
  // Nota: si una región tiene más de una fuente (Chile: csn + gael), se
  // consulta cada una y se combinan — se deja explícito acá en vez de un
  // helper genérico porque solo Chile tiene 2 fuentes hoy.
  let combinadas = filas;
  if (FUENTES_POR_REGION[region].length > 1) {
    const extra = await db
      .select()
      .from(sismos)
      .where(
        and(
          gte(sismos.fecha, desde),
          eq(sismos.fuente, FUENTES_POR_REGION[region][1]),
        ),
      );
    combinadas = [...filas, ...extra];
  }
  return combinadas.map((s) => ({
    fecha: s.fecha,
    magnitud: s.magnitud,
    latitud: s.latitud,
    longitud: s.longitud,
    profundidadKm: s.profundidadKm,
  }));
}

export async function obtenerOCrearPronostico(
  region: RegionSismica,
): Promise<RespuestaPronostico> {
  const vigente = await getPronosticoVigente(region, MAGNITUD_UMBRAL_DEFAULT);
  const enjambresActivos = await listarEnjambresActivos(region);

  if (vigente) {
    return {
      region,
      probabilidad: vigente.probabilidad,
      magnitudUmbral: vigente.magnitudUmbral,
      ventanaInicio: vigente.ventanaInicio.toISOString(),
      ventanaFin: vigente.ventanaFin.toISOString(),
      enjambresActivos,
    };
  }

  const historial = await leerHistorial(region);

  let params = await getParametrosVigentes(region);
  if (!params) {
    const ajuste = ajustarEtas(historial, MAGNITUD_MINIMA_CATALOGO);
    if (!ajuste) {
      // No hay suficiente historial para calibrar: probabilidad 0 explícita
      // en vez de inventar parámetros sin datos.
      const ahora = new Date();
      const ventanaFin = new Date(ahora.getTime() + VENTANA_DIAS * 24 * 60 * 60 * 1000);
      return {
        region,
        probabilidad: 0,
        magnitudUmbral: MAGNITUD_UMBRAL_DEFAULT,
        ventanaInicio: ahora.toISOString(),
        ventanaFin: ventanaFin.toISOString(),
        enjambresActivos,
      };
    }
    params = await upsertParametrosEtas({
      region,
      valores: ajuste,
      nEventosCalibracion: ajuste.nEventos,
    });
  }

  const nuevosEnjambres = detectarEnjambres(historial).filter(
    (e) => Date.now() - e.fechaFin.getTime() < 48 * 60 * 60 * 1000,
  );
  for (const e of nuevosEnjambres) {
    const yaExiste = enjambresActivos.some(
      (existente) =>
        Math.abs(existente.centroLat - e.centro.lat) < 0.1 &&
        Math.abs(existente.centroLon - e.centro.lon) < 0.1,
    );
    if (!yaExiste) {
      await registrarEnjambre({
        region,
        centro: e.centro,
        radioKm: e.radioKm,
        nEventos: e.nEventos,
        bValue: e.bValue,
        fechaInicio: e.fechaInicio,
        fechaFin: e.fechaFin,
      });
    }
  }

  const ahora = new Date();
  const ventanaFin = new Date(ahora.getTime() + VENTANA_DIAS * 24 * 60 * 60 * 1000);
  const probabilidad = calcularProbabilidad(
    params,
    historial,
    MAGNITUD_MINIMA_CATALOGO,
    ahora,
    ventanaFin,
    MAGNITUD_UMBRAL_DEFAULT,
  );

  const creado: PronosticoRegistro = await crearPronostico({
    region,
    magnitudUmbral: MAGNITUD_UMBRAL_DEFAULT,
    ventanaInicio: ahora,
    ventanaFin,
    probabilidad,
    parametrosEtasId: params.id,
  });

  return {
    region,
    probabilidad: creado.probabilidad,
    magnitudUmbral: creado.magnitudUmbral,
    ventanaInicio: creado.ventanaInicio.toISOString(),
    ventanaFin: creado.ventanaFin.toISOString(),
    enjambresActivos: await listarEnjambresActivos(region),
  };
}
```

- [ ] **Step 2: Crear el route handler**

```ts
// apps/web/app/api/pronostico/route.ts
import { NextResponse } from "next/server";
import { obtenerOCrearPronostico } from "../../../lib/pronostico";
import type { RegionSismica } from "@sismos/forecast";

const REGIONES_VALIDAS: RegionSismica[] = ["chile-subduccion", "mundo"];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const region = searchParams.get("region");

  if (!region || !REGIONES_VALIDAS.includes(region as RegionSismica)) {
    return NextResponse.json(
      { error: `region must be one of: ${REGIONES_VALIDAS.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const pronostico = await obtenerOCrearPronostico(region as RegionSismica);
    return NextResponse.json(pronostico);
  } catch (error) {
    console.error("[api/pronostico] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 3: Verificar tipos**

Run: `pnpm --filter web check-types`
Expected: sin errores.

- [ ] **Step 4: Verificación manual**

Con `pnpm docker:dev` corriendo (o `pnpm dev` contra el Postgres local): `curl "http://localhost:3000/api/pronostico?region=chile-subduccion"` dos veces seguidas. Confirmar que la segunda respuesta trae el mismo `ventanaInicio`/`ventanaFin` que la primera (reutilizó el pronóstico, no creó uno nuevo) — revisar la tabla `pronosticos` para confirmar que solo hay una fila nueva, no dos.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/pronostico.ts apps/web/app/api/pronostico
git commit -m "feat(web): endpoint on-demand de pronóstico estadístico por región"
```

---

### Task 7: Job de verificación (apps/ingestor + GitHub Actions)

**Files:**
- Create: `apps/ingestor/lib/verificar-pronosticos.ts`
- Create: `apps/ingestor/app/api/verificar-pronosticos/route.ts`
- Create: `.github/workflows/verificar-pronosticos-cron.yml`

**Interfaces:**
- Consumes: `listarPronosticosPorVerificar`, `crearVerificacion` (Task 5); tabla `sismos`/queries existentes (`findRecentByFuente` o similar) para buscar el sismo real más cercano.
- Produces: endpoint `GET /api/verificar-pronosticos` (protegido con `x-cron-secret`, mismo patrón que `/api/ingest`).

- [ ] **Step 1: Crear `apps/ingestor/lib/verificar-pronosticos.ts`**

```ts
import {
  listarPronosticosPorVerificar,
  crearVerificacion,
  getDb,
  sismos,
} from "@sismos/db";
import type { RegionSismica } from "@sismos/forecast";
import { and, gte, lte, eq } from "drizzle-orm";

// El pronóstico es por región completa (ver Task 6: la probabilidad se
// calcula para toda "chile-subduccion" o "mundo", no para un punto), así
// que no hay una distancia geográfica significativa que calcular — el
// candidato ya está filtrado por región/fuente. "parcial" se decide solo
// por magnitud: hubo actividad relevante, pero no llegó al umbral.
const DIFERENCIA_MAGNITUD_PARCIAL = 1.0;

const FUENTES_POR_REGION: Record<RegionSismica, string[]> = {
  "chile-subduccion": ["csn", "gael"],
  mundo: ["usgs"],
};

export interface ResumenVerificacion {
  procesados: number;
  aciertos: number;
  parciales: number;
  fallos: number;
}

export async function verificarPronosticosVencidos(): Promise<ResumenVerificacion> {
  const pendientes = await listarPronosticosPorVerificar();
  const resumen: ResumenVerificacion = {
    procesados: 0,
    aciertos: 0,
    parciales: 0,
    fallos: 0,
  };

  for (const pronostico of pendientes) {
    const db = getDb();
    const fuentes = FUENTES_POR_REGION[pronostico.region];
    const candidatos = [];
    for (const fuente of fuentes) {
      const filas = await db
        .select()
        .from(sismos)
        .where(
          and(
            eq(sismos.fuente, fuente),
            gte(sismos.fecha, pronostico.ventanaInicio),
            lte(sismos.fecha, pronostico.ventanaFin),
          ),
        );
      candidatos.push(...filas);
    }

    // El sismo más grande dentro de la ventana es el más relevante para
    // decidir acierto/fallo/parcial.
    const masGrande = candidatos.sort((a, b) => b.magnitud - a.magnitud)[0];

    if (!masGrande || masGrande.magnitud < pronostico.magnitudUmbral - DIFERENCIA_MAGNITUD_PARCIAL) {
      await crearVerificacion({ pronosticoId: pronostico.id, resultado: "fallo" });
      resumen.fallos++;
    } else if (masGrande.magnitud >= pronostico.magnitudUmbral) {
      await crearVerificacion({
        pronosticoId: pronostico.id,
        resultado: "acierto",
        sismoRealId: masGrande.id,
        diferenciaMagnitud: 0,
      });
      resumen.aciertos++;
    } else {
      await crearVerificacion({
        pronosticoId: pronostico.id,
        resultado: "parcial",
        sismoRealId: masGrande.id,
        diferenciaMagnitud: pronostico.magnitudUmbral - masGrande.magnitud,
      });
      resumen.parciales++;
    }
    resumen.procesados++;
  }

  return resumen;
}
```

- [ ] **Step 2: Crear el route handler**

```ts
// apps/ingestor/app/api/verificar-pronosticos/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verificarPronosticosVencidos } from "../../../lib/verificar-pronosticos";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;

  if (!cronSecret || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resumen = await verificarPronosticosVencidos();
    return NextResponse.json(resumen);
  } catch (error) {
    console.error("[verificar-pronosticos] failed:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Crear el workflow de GitHub Actions**

```yaml
# .github/workflows/verificar-pronosticos-cron.yml
name: Verificar pronósticos cron

on:
  schedule:
    - cron: "0 12 * * *"
  workflow_dispatch:

jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - name: Call verificar-pronosticos endpoint
        run: |
          status=$(curl -s -o /tmp/verificar-response.json -w "%{http_code}" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            https://sismos-realtime.vercel.app/api/verificar-pronosticos)
          cat /tmp/verificar-response.json
          echo
          if [ "$status" != "200" ]; then
            echo "Verificar-pronosticos endpoint returned status $status"
            exit 1
          fi
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter ingestor check-types`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Con datos de prueba en `pronosticos` (ventana ya vencida, insertados a mano contra Postgres local) y `CRON_SECRET` seteado en el entorno local: `curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/verificar-pronosticos` y confirmar en la tabla `verificaciones_pronostico` que se creó la fila esperada con el `resultado` correcto.

- [ ] **Step 6: Commit**

```bash
git add apps/ingestor/lib/verificar-pronosticos.ts apps/ingestor/app/api/verificar-pronosticos .github/workflows/verificar-pronosticos-cron.yml
git commit -m "feat(ingestor): job diario de verificación de pronósticos"
```

---

### Task 8: Job de recalibración (apps/ingestor + GitHub Actions)

**Files:**
- Create: `apps/ingestor/lib/recalibrar-etas.ts`
- Create: `apps/ingestor/app/api/recalibrar-etas/route.ts`
- Create: `.github/workflows/recalibrar-etas-cron.yml`

**Interfaces:**
- Consumes: `listarTodosLosParametros`, `upsertParametrosEtas` (Task 5); `ajustarEtas` (Task 3).
- Produces: endpoint `GET /api/recalibrar-etas`, mismo patrón de auth que Task 7.

- [ ] **Step 1: Crear `apps/ingestor/lib/recalibrar-etas.ts`**

```ts
import { listarTodosLosParametros, upsertParametrosEtas, getDb, sismos } from "@sismos/db";
import { ajustarEtas, type RegionSismica } from "@sismos/forecast";
import { gte, eq, and } from "drizzle-orm";

const LOOKBACK_DIAS = 365;
const MAGNITUD_MINIMA_CATALOGO = 2.5;
// No recalibrar si no hay al menos este % más de eventos desde la última
// calibración — evita reajustar con ruido cuando casi no hay datos nuevos.
const MINIMO_EVENTOS_NUEVOS = 5;

const FUENTES_POR_REGION: Record<RegionSismica, string[]> = {
  "chile-subduccion": ["csn", "gael"],
  mundo: ["usgs"],
};

export interface ResumenRecalibracion {
  regionesRevisadas: number;
  regionesRecalibradas: string[];
}

export async function recalibrarTodasLasRegiones(): Promise<ResumenRecalibracion> {
  const regiones: RegionSismica[] = ["chile-subduccion", "mundo"];
  const parametrosActuales = await listarTodosLosParametros();
  const resumen: ResumenRecalibracion = {
    regionesRevisadas: 0,
    regionesRecalibradas: [],
  };

  for (const region of regiones) {
    resumen.regionesRevisadas++;
    const desde = new Date(Date.now() - LOOKBACK_DIAS * 24 * 60 * 60 * 1000);
    const db = getDb();
    let historial = [];
    for (const fuente of FUENTES_POR_REGION[region]) {
      const filas = await db
        .select()
        .from(sismos)
        .where(and(gte(sismos.fecha, desde), eq(sismos.fuente, fuente)));
      historial.push(...filas);
    }

    const actual = parametrosActuales.find((p) => p.region === region);
    const nEventosNuevos = historial.length - (actual?.nEventosCalibracion ?? 0);
    if (actual && nEventosNuevos < MINIMO_EVENTOS_NUEVOS) continue;

    const ajuste = ajustarEtas(
      historial.map((s) => ({
        fecha: s.fecha,
        magnitud: s.magnitud,
        latitud: s.latitud,
        longitud: s.longitud,
        profundidadKm: s.profundidadKm,
      })),
      MAGNITUD_MINIMA_CATALOGO,
    );
    if (!ajuste) continue;

    await upsertParametrosEtas({
      region,
      valores: ajuste,
      nEventosCalibracion: ajuste.nEventos,
    });
    resumen.regionesRecalibradas.push(region);
  }

  return resumen;
}
```

- [ ] **Step 2: Crear el route handler**

```ts
// apps/ingestor/app/api/recalibrar-etas/route.ts
import { NextRequest, NextResponse } from "next/server";
import { recalibrarTodasLasRegiones } from "../../../lib/recalibrar-etas";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;

  if (!cronSecret || !isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resumen = await recalibrarTodasLasRegiones();
    return NextResponse.json(resumen);
  } catch (error) {
    console.error("[recalibrar-etas] failed:", error);
    return NextResponse.json({ error: "Recalibration failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Crear el workflow de GitHub Actions (mensual)**

```yaml
# .github/workflows/recalibrar-etas-cron.yml
name: Recalibrar ETAS cron

on:
  schedule:
    - cron: "0 6 1 * *"
  workflow_dispatch:

jobs:
  recalibrar:
    runs-on: ubuntu-latest
    steps:
      - name: Call recalibrar-etas endpoint
        run: |
          status=$(curl -s -o /tmp/recalibrar-response.json -w "%{http_code}" \
            -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" \
            https://sismos-realtime.vercel.app/api/recalibrar-etas)
          cat /tmp/recalibrar-response.json
          echo
          if [ "$status" != "200" ]; then
            echo "Recalibrar-etas endpoint returned status $status"
            exit 1
          fi
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter ingestor check-types`
Expected: sin errores.

- [ ] **Step 5: Verificación manual**

Contra Postgres local con historial de sismos de prueba: `curl -H "x-cron-secret: $CRON_SECRET" http://localhost:3001/api/recalibrar-etas`, confirmar en `parametros_etas` que `fechaCalibracion` se actualizó y `auditadoPorGuardian` volvió a `false`. Correrlo una segunda vez sin agregar sismos nuevos y confirmar que NO recalibra (menos de `MINIMO_EVENTOS_NUEVOS` eventos nuevos).

- [ ] **Step 6: Commit**

```bash
git add apps/ingestor/lib/recalibrar-etas.ts apps/ingestor/app/api/recalibrar-etas .github/workflows/recalibrar-etas-cron.yml
git commit -m "feat(ingestor): job mensual de recalibración de parámetros ETAS"
```

---

### Task 9: `PantallaPronostico` pública + menú + traducciones

**Files:**
- Create: `apps/web/lib/use-pronostico.ts`
- Create: `apps/web/components/pronostico/PantallaPronostico.tsx`
- Modify: `apps/web/components/menu/MenuLateral.tsx`
- Modify: `apps/web/components/MapaConHistorial.tsx`
- Modify: `apps/web/messages/es.json`
- Modify: `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `GET /api/pronostico` (Task 6).
- Produces: overlay `PantallaPronostico` abierto desde `MenuLateral`, mismo patrón que `PantallaEstadisticas`.

- [ ] **Step 1: Crear el hook `use-pronostico.ts`** (mismo patrón que `use-estadisticas.ts`)

```ts
// apps/web/lib/use-pronostico.ts
"use client";

import { useEffect, useState } from "react";
import type { RegionSismica } from "@sismos/forecast";

interface EnjambreActivo {
  id: number;
  centroLat: number;
  centroLon: number;
  radioKm: number;
  nEventos: number;
  bValue: number | null;
}

interface RespuestaPronostico {
  region: RegionSismica;
  probabilidad: number;
  magnitudUmbral: number;
  ventanaInicio: string;
  ventanaFin: string;
  enjambresActivos: EnjambreActivo[];
}

export function usePronostico(region: RegionSismica, activo: boolean) {
  const [datos, setDatos] = useState<RespuestaPronostico | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reintentos, setReintentos] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setLoading(true);
    setError(false);

    fetch(`/api/pronostico?region=${region}`)
      .then((res) => {
        if (!res.ok) throw new Error(`pronostico fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: RespuestaPronostico) => {
        if (cancelado) return;
        setDatos(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[usePronostico] fetch failed:", err);
        if (cancelado) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [region, activo, reintentos]);

  return { datos, loading, error, reintentar: () => setReintentos((n) => n + 1) };
}
```

- [ ] **Step 2: Crear `PantallaPronostico.tsx`** (mismo patrón visual que `PantallaEstadisticas.tsx`: header con botón volver, estado loading/error/reintentar, contenido en `overflow-y-auto`)

```tsx
// apps/web/components/pronostico/PantallaPronostico.tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
import { usePronostico } from "../../lib/use-pronostico";
import type { RegionSismica } from "@sismos/forecast";

interface PantallaPronosticoProps {
  abierto: boolean;
  onCerrar: () => void;
}

export default function PantallaPronostico({
  abierto,
  onCerrar,
}: PantallaPronosticoProps) {
  const t = useTranslations("pronostico");
  const tc = useTranslations("comun");
  useOverlayAccesible(abierto, onCerrar);

  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  const [region, setRegion] = useState<RegionSismica>("chile-subduccion");
  const { datos, loading, error, reintentar } = usePronostico(
    region,
    huboApertura,
  );

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 flex flex-col bg-neutral-900 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        abierto ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label={tc("volver")}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-neutral-100">{t("titulo")}</h1>
      </div>

      <div className="flex shrink-0 gap-2 px-4 pt-3">
        <button
          type="button"
          onClick={() => setRegion("chile-subduccion")}
          aria-pressed={region === "chile-subduccion"}
          className={`min-h-11 flex-1 touch-manipulation rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] ${
            region === "chile-subduccion"
              ? "border-sky-500 bg-sky-500/10 text-sky-400"
              : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          {t("chile")}
        </button>
        <button
          type="button"
          onClick={() => setRegion("mundo")}
          aria-pressed={region === "mundo"}
          className={`min-h-11 flex-1 touch-manipulation rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] ${
            region === "mundo"
              ? "border-sky-500 bg-sky-500/10 text-sky-400"
              : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          {t("mundo")}
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          {t("cargando")}
        </div>
      ) : error || !datos ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>{t("errorCarga")}</p>
          <button
            type="button"
            onClick={reintentar}
            className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            {t("reintentar")}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-neutral-800 bg-neutral-800/40 p-4">
            <p className="text-3xl font-semibold text-neutral-100">
              {(datos.probabilidad * 100).toFixed(1)}%
            </p>
            <p className="text-sm text-neutral-400">
              {t("probabilidadDescripcion", { magnitud: datos.magnitudUmbral })}
            </p>
            <p className="mt-2 text-xs text-neutral-500">{t("disclaimer")}</p>
          </section>

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-neutral-200">
              {t("enjambresActivos")}
            </h2>
            {datos.enjambresActivos.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("sinEnjambres")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {datos.enjambresActivos.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300"
                  >
                    {t("enjambreDetalle", { n: e.nEventos, radio: Math.round(e.radioKm) })}
                    {e.bValue !== null && (
                      <span className="ml-2 text-neutral-500">
                        b-value: {e.bValue.toFixed(2)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Agregar el ítem al menú lateral**

En `apps/web/components/menu/MenuLateral.tsx`: agregar `onAbrirPronostico: () => void;` a `MenuLateralProps` (junto a `onAbrirEstadisticas`), un ícono `IconoPronostico` (misma convención SVG que los demás, ej. una onda: `<path d="M2 12h4l3-9 4 18 3-9h6" />`), y el botón en el `<nav>` entre el de Estadísticas y el de Compartir:

```tsx
<button
  type="button"
  onClick={() => elegir(onAbrirPronostico)}
  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
>
  <IconoPronostico />
  {t("pronostico")}
</button>
```

- [ ] **Step 4: Wirear en `MapaConHistorial.tsx`**

Agregar `const [pronosticoAbierto, setPronosticoAbierto] = useState(false);` junto a los demás `useState` de overlays, agregar `<PantallaPronostico abierto={pronosticoAbierto} onCerrar={() => setPronosticoAbierto(false)} />` junto a `<PantallaEstadisticas ... />`, pasar `onAbrirPronostico={() => setPronosticoAbierto(true)}` a `<MenuLateral>`, e incluir `pronosticoAbierto` en el `||` que calcula si `useInstalarApp` debe ocultar el prompt de instalación (línea con `historialAbierto || pantallaFallasAbierta || ...`).

- [ ] **Step 5: Agregar traducciones**

En `apps/web/messages/es.json`, agregar `"pronostico": "Pronóstico"` al namespace `menu`, y un namespace nuevo:

```json
"pronostico": {
  "titulo": "Pronóstico",
  "chile": "Chile",
  "mundo": "Mundo",
  "cargando": "Cargando…",
  "errorCarga": "No se pudo cargar el pronóstico.",
  "reintentar": "Reintentar",
  "probabilidadDescripcion": "Probabilidad de un sismo M{magnitud}+ en los próximos 7 días",
  "disclaimer": "Estimación estadística, no una predicción exacta de hora ni lugar. Se basa en el historial de sismos de esta zona.",
  "enjambresActivos": "Enjambres activos",
  "sinEnjambres": "No hay enjambres sísmicos activos en esta región.",
  "enjambreDetalle": "{n} sismos en un radio de {radio} km"
}
```

Replicar la misma estructura (traducida al inglés) en `apps/web/messages/en.json`, agregando `"pronostico": "Forecast"` al namespace `menu` y el namespace `pronostico` equivalente en inglés.

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 7: Verificación manual en el navegador**

Correr `pnpm dev`, abrir el menú lateral, click en "Pronóstico", confirmar que abre el overlay, muestra loading y después el porcentaje/enjambres (o el error+reintentar si el endpoint falla), y que cerrar con el botón volver funciona igual que Estadísticas.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/use-pronostico.ts apps/web/components/pronostico apps/web/components/menu/MenuLateral.tsx apps/web/components/MapaConHistorial.tsx apps/web/messages
git commit -m "feat(web): pantalla pública de pronóstico estadístico"
```

---

### Task 10: Capa de enjambres activos en el mapa

**Files:**
- Modify: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `GET /api/pronostico` (reutiliza el mismo endpoint de Task 6 para obtener `enjambresActivos`, o un fetch directo — ver Step 1), `generarCirculoGeografico` (ya existe en `apps/web/lib/circulo-geografico.ts`).
- Produces: capa visual nueva en el mapa, sin componente nuevo (se integra en `MapaSismos.tsx`, mismo patrón que la capa de fallas geológicas descrita en `docs/superpowers/specs/2026-08-02-capa-fallas-geologicas-design.md`).

- [ ] **Step 1: Leer `MapaSismos.tsx` completo antes de este task**

Antes de escribir código, leer el archivo completo (no solo las líneas de la capa de fallas citadas en la spec de fallas geológicas) para confirmar el nombre exacto del `useEffect` de inicialización del mapa, dónde se agregan otras `source`/`layer`, y cómo se limpian al desmontar — replicar esa estructura exacta en vez de asumir.

- [ ] **Step 2: Agregar el fetch de enjambres activos**

Agregar un `useEffect` que, cuando el mapa está listo, hace `fetch("/api/pronostico?region=chile-subduccion")` (y opcionalmente `region=mundo` si el viewport lo amerita — para el MVP alcanza con Chile, que es donde vive la mayoría de los usuarios) y guarda `enjambresActivos` en un `useState` local.

- [ ] **Step 3: Dibujar los círculos de enjambre**

Por cada enjambre activo, generar su polígono con `generarCirculoGeografico({ lat: e.centroLat, lon: e.centroLon }, e.radioKm)` y agregarlo como `source`+`layer` tipo `fill` (no `line`, para diferenciarse visualmente de la capa de fallas) con opacidad baja y color distinto tanto de la paleta de magnitud como del ámbar de fallas — usar un tono violeta/púrpura (ej. `#a855f7`) para que se lea como "señal estadística", no como sismo ni falla:

```ts
map.addSource(`enjambre-${e.id}`, {
  type: "geojson",
  data: generarCirculoGeografico({ lat: e.centroLat, lon: e.centroLon }, e.radioKm),
});
map.addLayer({
  id: `enjambre-${e.id}-fill`,
  type: "fill",
  source: `enjambre-${e.id}`,
  paint: { "fill-color": "#a855f7", "fill-opacity": 0.12 },
});
map.addLayer({
  id: `enjambre-${e.id}-borde`,
  type: "line",
  source: `enjambre-${e.id}`,
  paint: { "line-color": "#a855f7", "line-width": 1.5, "line-dasharray": [1, 1] },
});
```

- [ ] **Step 4: Popup al hacer click**

Click sobre el relleno abre un popup (mismo componente visual que el popup de fallas/sismos) con el texto `"{n} sismos detectados · radio {radio} km"` y un botón/link que dispare la apertura de `PantallaPronostico` (reusar el patrón de evento custom `window.dispatchEvent(new CustomEvent("sismos:abrir-notificaciones"))` que ya existe para notificaciones — ver `MapaConHistorial.tsx` — creando el evento equivalente `sismos:abrir-pronostico`, escuchado en `MapaConHistorial.tsx` para abrir `pronosticoAbierto`).

- [ ] **Step 5: Limpieza al desmontar/cambiar datos**

Antes de agregar las nuevas sources/layers de enjambre, remover las del render anterior (mismo cuidado que la capa de fallas: no dejar sources húerfanas si `enjambresActivos` cambia entre renders).

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 7: Verificación manual**

Con un enjambre de prueba insertado a mano en `enjambres_detectados` (estado `"activo"`, coordenadas dentro de Chile): abrir el mapa, confirmar que aparece el círculo púrpura, que el click abre el popup, y que el popup lleva a `PantallaPronostico`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/mapa/MapaSismos.tsx apps/web/components/MapaConHistorial.tsx
git commit -m "feat(web): capa de enjambres sísmicos activos en el mapa"
```

---

### Task 11: Preferencia "avisarme si hay un enjambre cerca"

**Files:**
- Modify: `packages/db/src/schema.ts` (campo nuevo en `pushSubscriptions`)
- Create: `packages/db/drizzle/000N_*.sql` (generado)
- Modify: `packages/db/src/queries/push-subscription.ts`
- Modify: `apps/web/lib/push-subscriptions.ts`
- Modify: `apps/web/app/api/push/subscribe/route.ts`
- Modify: `apps/web/lib/use-push-notifications.ts`
- Modify: `apps/web/components/configuracion/ModalConfiguracion.tsx`
- Modify: `apps/web/messages/es.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `pushSubscriptions` (existente).
- Produces: campo `avisarEnjambre: boolean` de punta a punta, consumido por el job de verificación/notificación de enjambres (fuera de alcance de este plan — ver "Qué no cambia" de la spec: el envío del push en sí para enjambres nuevos queda para un plan futuro; este task deja la preferencia guardable y visible, no el disparo del push).

- [ ] **Step 1: Agregar el campo a `pushSubscriptions` en `packages/db/src/schema.ts`**

```ts
// dentro de pushSubscriptions, junto a alcanceMundial:
avisarEnjambre: boolean("avisar_enjambre").notNull().default(false),
```

- [ ] **Step 2: Generar y aplicar la migración**

Run: `pnpm --filter @sismos/db db:generate` y revisar el SQL generado (debe ser un `ALTER TABLE push_subscriptions ADD COLUMN avisar_enjambre boolean NOT NULL DEFAULT false`).
Run: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/sismos pnpm --filter @sismos/db db:migrate`
Expected: sin errores.

- [ ] **Step 3: Extender `packages/db/src/queries/push-subscription.ts`**

Agregar `avisarEnjambre: boolean;` a la interface `PushSubscription`, `avisarEnjambre?: boolean;` a `SuscripcionInput`, mapear el campo en `toPushSubscription` (`avisarEnjambre: row.avisarEnjambre`), y pasarlo en el `insert`/`onConflictDoUpdate` de `upsertPushSubscription` (buscar esa función en el archivo — sigue el mismo patrón que `alcanceMundial` ya usa ahí, replicar línea por línea para el campo nuevo).

- [ ] **Step 4: Extender `apps/web/lib/push-subscriptions.ts`**

Agregar `avisarEnjambre?: boolean;` a `GuardarSuscripcionInput` y pasarlo tal cual a `upsertPushSubscription` (ya lo hace por spread/paso directo — confirmar que el campo llega).

- [ ] **Step 5: Extender `apps/web/app/api/push/subscribe/route.ts`**

Agregar `avisarEnjambre?: boolean;` a `SubscribeBody`, una validación (`typeof body.avisarEnjambre !== "boolean"` → 400, mismo patrón que `alcanceMundial`), pasarlo a `guardarSuscripcion` (`avisarEnjambre: body.avisarEnjambre ?? false`), y agregarlo a la respuesta del `GET` (`avisarEnjambre: suscripcion.avisarEnjambre`).

- [ ] **Step 6: Extender `apps/web/lib/use-push-notifications.ts`**

Agregar `const [avisarEnjambre, setAvisarEnjambre] = useState(false);`, pasarlo como parámetro nuevo de `enviarSuscripcion` (`avisarEnjambre: boolean`) y en el body del `fetch("/api/push/subscribe", ...)`, hidratarlo desde la respuesta del `GET` existente (mismo `useEffect` que ya hidrata `magnitudMinima`/`alcanceMundial`), y devolverlo en el `return` del hook (`avisarEnjambre, setAvisarEnjambre`) junto con una versión de `activar`/`actualizarUmbral` que lo reciba como parámetro adicional (seguir la firma exacta que ya usan esas dos funciones para `alcanceMundial` y replicarla para `avisarEnjambre`).

- [ ] **Step 7: Agregar el toggle a `ModalConfiguracion.tsx`**

Junto al switch existente de "M7+ en cualquier país" (buscar el bloque que renderiza `alcanceMundialLocal`/`checked={alcanceMundialLocal}`), agregar un switch equivalente para `avisarEnjambreLocal` (mismo `useState` local + sincronización en el `useEffect` que ya sincroniza `umbralLocal`/`alcanceMundialLocal` cuando cambian los valores hidratados), con el mismo componente visual de switch ya usado ahí. Incluir `avisarEnjambreLocal` en el cálculo de `hayCambios` (la variable que decide si mostrar el botón de guardar habilitado) y pasarlo en las llamadas a `activar`/`actualizarUmbral`.

- [ ] **Step 8: Traducciones**

En `apps/web/messages/es.json`, namespace `configuracion` (buscar dónde vive la traducción de "M7+ en cualquier país" para poner esta al lado): agregar `"avisarEnjambre": "Avisarme si hay un enjambre sísmico cerca"` (y su descripción si el patrón existente tiene una línea de ayuda debajo del switch). Replicar en `en.json`.

- [ ] **Step 9: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint && pnpm --filter @sismos/db check-types`
Expected: sin errores.

- [ ] **Step 10: Verificación manual**

Activar notificaciones en el navegador (`pnpm dev`), abrir "Notificaciones" desde el menú, activar el switch nuevo, guardar, recargar la página, reabrir el modal y confirmar que el switch sigue activado (se hidrató bien desde el backend). Revisar la fila en `push_subscriptions` y confirmar `avisar_enjambre = true`.

- [ ] **Step 11: Commit**

```bash
git add packages/db apps/web/lib/push-subscriptions.ts apps/web/app/api/push/subscribe apps/web/lib/use-push-notifications.ts apps/web/components/configuracion/ModalConfiguracion.tsx apps/web/messages
git commit -m "feat(web): preferencia de aviso por enjambre sísmico cercano"
```

---

### Task 12: Panel de admin `/admin/pronosticos`

**Files:**
- Create: `apps/web/app/api/admin/pronosticos/route.ts`
- Create: `apps/web/app/admin/pronosticos/page.tsx`
- Create: `apps/web/components/admin/PantallaAdminPronosticos.tsx`
- Modify: `apps/web/components/menu/MenuLateral.tsx`
- Modify: `apps/web/components/MapaConHistorial.tsx`
- Modify: `apps/web/messages/es.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `requireAdminApi` (ya existe en `apps/web/lib/require-admin-api.ts`), `listarTodos` (pronósticos, Task 5), `listarTodasLasVerificaciones` + `calcularScoreConfiabilidad` (Task 5), `listarTodosLosParametros` (Task 5).
- Produces: `GET /api/admin/pronosticos`, overlay `PantallaAdminPronosticos`, ítem nuevo en el submenú admin.

- [ ] **Step 1: Crear `apps/web/app/api/admin/pronosticos/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/require-admin-api";
import {
  listarTodos,
  listarTodasLasVerificaciones,
  calcularScoreConfiabilidad,
  listarTodosLosParametros,
} from "@sismos/db";

export async function GET() {
  const denegado = await requireAdminApi();
  if (denegado) return denegado;

  const [pronosticos, verificaciones, parametros] = await Promise.all([
    listarTodos(),
    listarTodasLasVerificaciones(),
    listarTodosLosParametros(),
  ]);

  const verificadosPorId = new Map(verificaciones.map((v) => [v.pronosticoId, v]));
  const ahora = Date.now();

  const activos = pronosticos
    .filter((p) => p.ventanaFin.getTime() > ahora)
    .map((p) => ({
      id: p.id,
      region: p.region,
      magnitudUmbral: p.magnitudUmbral,
      ventanaInicio: p.ventanaInicio.toISOString(),
      ventanaFin: p.ventanaFin.toISOString(),
      probabilidad: p.probabilidad,
    }));

  const verificados = pronosticos
    .filter((p) => verificadosPorId.has(p.id))
    .map((p) => {
      const v = verificadosPorId.get(p.id)!;
      return {
        id: p.id,
        region: p.region,
        magnitudUmbral: p.magnitudUmbral,
        ventanaFin: p.ventanaFin.toISOString(),
        probabilidad: p.probabilidad,
        resultado: v.resultado,
        distanciaKm: v.distanciaKm,
        diferenciaMagnitud: v.diferenciaMagnitud,
      };
    });

  const scoreGlobal = calcularScoreConfiabilidad(verificaciones);
  const scorePorRegion = ["chile-subduccion", "mundo"].map((region) => ({
    region,
    score: calcularScoreConfiabilidad(
      verificaciones.filter(
        (v) => pronosticos.find((p) => p.id === v.pronosticoId)?.region === region,
      ),
    ),
  }));

  return NextResponse.json({
    activos,
    verificados,
    scoreGlobal,
    scorePorRegion,
    parametros: parametros.map((p) => ({
      region: p.region,
      mu: p.mu,
      k: p.k,
      alpha: p.alpha,
      c: p.c,
      p: p.p,
      nEventosCalibracion: p.nEventosCalibracion,
      auditadoPorGuardian: p.auditadoPorGuardian,
      fechaUltimaAuditoriaGuardian: p.fechaUltimaAuditoriaGuardian?.toISOString() ?? null,
    })),
  });
}
```

- [ ] **Step 2: Crear la ruta de fallback**

```tsx
// apps/web/app/admin/pronosticos/page.tsx
import { redirect } from "next/navigation";

export default function AdminPronosticosPage() {
  redirect("/?admin=pronosticos");
}
```

(Seguir el mismo patrón de deep-link fallback que `app/admin/reportes/page.tsx` — revisar cómo `app/page.tsx` lee el query param `admin` y agregar `"pronosticos"` a esa lógica junto a `"usuarios"`/`"reportes"`.)

- [ ] **Step 3: Crear `PantallaAdminPronosticos.tsx`** (mismo patrón que `PantallaReportes.tsx`: fetch a `/api/admin/pronosticos` en la primera apertura, loading/error/denegado, pero con contenido real en vez de "Próximamente")

```tsx
"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface PronosticoActivo {
  id: number;
  region: string;
  magnitudUmbral: number;
  ventanaInicio: string;
  ventanaFin: string;
  probabilidad: number;
}

interface PronosticoVerificado extends PronosticoActivo {
  resultado: "acierto" | "fallo" | "parcial";
  distanciaKm: number | null;
  diferenciaMagnitud: number | null;
}

interface ParametrosRegion {
  region: string;
  mu: number;
  k: number;
  alpha: number;
  c: number;
  p: number;
  nEventosCalibracion: number;
  auditadoPorGuardian: boolean;
  fechaUltimaAuditoriaGuardian: string | null;
}

interface RespuestaAdminPronosticos {
  activos: PronosticoActivo[];
  verificados: PronosticoVerificado[];
  scoreGlobal: number | null;
  scorePorRegion: { region: string; score: number | null }[];
  parametros: ParametrosRegion[];
}

interface PantallaAdminPronosticosProps {
  abierto: boolean;
  onCerrar: () => void;
}

type EstadoError = "denegado" | "otro" | null;

export default function PantallaAdminPronosticos({
  abierto,
  onCerrar,
}: PantallaAdminPronosticosProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("comun");
  useOverlayAccesible(abierto, onCerrar);

  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  const [datos, setDatos] = useState<RespuestaAdminPronosticos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EstadoError>(null);
  const [reintentos, setReintentos] = useState(0);

  useEffect(() => {
    if (!huboApertura) return;
    let cancelado = false;
    setLoading(true);
    setError(null);

    fetch("/api/admin/pronosticos")
      .then((res) => {
        if (res.status === 401 || res.status === 403) throw new Error("denegado");
        if (!res.ok) throw new Error("otro");
        return res.json();
      })
      .then((data: RespuestaAdminPronosticos) => {
        if (cancelado) return;
        setDatos(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[PantallaAdminPronosticos] fetch error:", err);
        if (cancelado) return;
        setError(err instanceof Error && err.message === "denegado" ? "denegado" : "otro");
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [huboApertura, reintentos]);

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 flex flex-col bg-neutral-950 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        abierto ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label={tc("volver")}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-neutral-100">{t("pronosticos")}</h1>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          {t("cargando")}
        </div>
      ) : error === "denegado" ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          {t("accesoDenegado")}
        </div>
      ) : error || !datos ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>{t("errorCarga")}</p>
          <button
            type="button"
            onClick={() => setReintentos((n) => n + 1)}
            className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            {t("reintentar")}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-neutral-800 bg-neutral-800/40 p-4">
            <p className="text-sm font-semibold text-neutral-200">Score de confiabilidad</p>
            <p className="text-2xl font-semibold text-neutral-100">
              {datos.scoreGlobal === null ? "—" : `${(datos.scoreGlobal * 100).toFixed(0)}%`}
            </p>
            <div className="mt-2 flex gap-4 text-xs text-neutral-400">
              {datos.scorePorRegion.map((r) => (
                <span key={r.region}>
                  {r.region}: {r.score === null ? "—" : `${(r.score * 100).toFixed(0)}%`}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-neutral-200">Activos</h2>
            <ul className="flex flex-col gap-2">
              {datos.activos.map((p) => (
                <li key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
                  {p.region} · M{p.magnitudUmbral}+ · {(p.probabilidad * 100).toFixed(1)}% · vence {new Date(p.ventanaFin).toLocaleString()}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-neutral-200">Verificados</h2>
            <ul className="flex flex-col gap-2">
              {datos.verificados.map((p) => (
                <li key={p.id} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
                  {p.region} · M{p.magnitudUmbral}+ · {p.resultado}
                  {p.resultado === "parcial" && p.diferenciaMagnitud !== null && (
                    <span className="ml-1 text-neutral-500">
                      (diferencia magnitud: {p.diferenciaMagnitud.toFixed(1)})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-5">
            <h2 className="mb-2 text-sm font-semibold text-neutral-200">Parámetros ETAS vigentes</h2>
            <ul className="flex flex-col gap-2">
              {datos.parametros.map((p) => (
                <li key={p.region} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-300">
                  {p.region} · {p.nEventosCalibracion} eventos ·{" "}
                  {p.auditadoPorGuardian ? "auditado" : "sin auditar"}
                  {p.fechaUltimaAuditoriaGuardian && (
                    <span className="ml-1 text-neutral-500">
                      ({new Date(p.fechaUltimaAuditoriaGuardian).toLocaleDateString()})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Agregar traducciones**

En `apps/web/messages/es.json`, namespace `admin`: agregar `"pronosticos": "Pronósticos"`. Replicar en `en.json`.

- [ ] **Step 5: Wirear el submenú admin en `MenuLateral.tsx`**

Agregar `onAbrirPronosticosAdmin: () => void;` a `MenuLateralProps`, y un botón nuevo dentro del bloque `adminAbierto && (...)` (junto a Usuarios/Reportes):

```tsx
<button
  type="button"
  onClick={() => elegir(onAbrirPronosticosAdmin)}
  className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-medium text-neutral-400 touch-manipulation transition duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
>
  {t("pronosticos")}
</button>
```

- [ ] **Step 6: Wirear en `MapaConHistorial.tsx`**

Mismo patrón que `reportesAbierto`: `useState`, prop a `MenuLateral`, y el componente `<PantallaAdminPronosticos>` junto a `<PantallaReportes>`.

- [ ] **Step 7: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: sin errores.

- [ ] **Step 8: Verificación manual**

Como usuario admin (o en dev local, donde `esDevLocal` ya lo habilita — ver comentario en `MenuLateral.tsx`), abrir Admin → Pronósticos, confirmar que carga los datos reales insertados en tasks anteriores (activos, verificados, score, parámetros).

- [ ] **Step 9: Commit**

```bash
git add apps/web/app/api/admin/pronosticos apps/web/app/admin/pronosticos apps/web/components/admin/PantallaAdminPronosticos.tsx apps/web/components/menu/MenuLateral.tsx apps/web/components/MapaConHistorial.tsx apps/web/messages
git commit -m "feat(web): panel de admin de pronósticos (activos, verificados, score, parámetros)"
```

---

### Task 13: Extender `sismologia-guardian` para auditar parámetros ETAS

**Files:**
- Modify: `.claude/agents/sismologia-guardian.md`

**Interfaces:**
- Consumes: nada (es un archivo de definición de agente, no código de la app).
- Produces: el subagente `sismologia-guardian` queda habilitado para auditar `parametrosEtas` además del radio de percepción, cerrando el proceso recurrente descrito en la spec.

- [ ] **Step 1: Actualizar el frontmatter `description`**

Extender la descripción (línea 3) para mencionar la nueva responsabilidad, sin borrar la existente sobre radio de percepción — el agente ahora cubre dos modelos numéricos, no reemplaza uno por otro.

- [ ] **Step 2: Agregar una sección nueva al cuerpo del agente**

Después de la sección "Fuera de alcance" existente, agregar:

```markdown
## Segunda responsabilidad: auditoría de parámetros ETAS

Además del radio de percepción, este agente audita periódicamente la tabla
`parametros_etas` (`packages/db/src/schema.ts`), que guarda μ, K, α, c, p
por región (`chile-subduccion`, `mundo`) usados por el panel de pronóstico
estadístico de sismos (`packages/forecast`, `apps/web/lib/pronostico.ts`).
Estos parámetros se recalibran automáticamente cada mes vía
`apps/ingestor/lib/recalibrar-etas.ts` (ajuste MLE con el historial de
sismos) — tu trabajo es revisar que no se hayan ido a rangos no
fundamentados en literatura, no re-derivarlos vos mismo a mano.

### Cómo auditar

1. Leer los valores vigentes: `SELECT * FROM parametros_etas` (o pedir que
   se te pasen como contexto en la invocación).
2. Buscar (WebSearch/WebFetch) rangos típicos de μ, K, α, c, p reportados
   en la literatura ETAS para secuencias de subducción (para
   `chile-subduccion`) y compararlos contra los valores vigentes — ¿están
   dentro de un orden de magnitud razonable, o se fueron a un extremo que
   sugiere sobreajuste con pocos datos?
3. Revisar `nEventosCalibracion`: un ajuste con muy pocos eventos es más
   propenso a converger a valores extremos — señalarlo explícitamente si
   `nEventosCalibracion` es bajo (no hay un umbral universal en la
   literatura; usar criterio, documentando el razonamiento).
4. Para la región `"mundo"`: señalar explícitamente que hoy es un solo
   bucket sin desglosar por régimen tectónico (ver
   `docs/superpowers/specs/2026-09-09-pronostico-estadistico-enjambres-design.md`)
   — es la limitación más importante a mencionar en cualquier auditoría de
   esa región, no un detalle menor.
5. Entregar un veredicto por región: "parámetros razonables" o "parámetros
   sospechosos" con la razón y fuente. **No edita `parametros_etas`
   directamente** (Fase 1, igual que con el radio de percepción) — si se
   detecta un problema, la fase 2 (solo si se aprueba explícitamente)
   puede llamar a `marcarAuditadoPorGuardian` únicamente cuando el
   veredicto fue "parámetros razonables"; un veredicto "sospechoso" nunca
   se marca como auditado, queda pendiente de revisión humana.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/agents/sismologia-guardian.md
git commit -m "docs(agents): sismologia-guardian audita también parámetros ETAS"
```

---

## Nota final para quien ejecute este plan

Después de completar los 13 tasks, invocar al agente `docs-agent` (ver
`sismos/CLAUDE.md`) para que actualice `vault/01 - Arquitectura del
Sistema.md`, `vault/02 - Base de Datos.md`, `vault/03 - API Reference.md` y
`vault/05 - Infra y CI.md` con las 4 tablas nuevas, los 3 endpoints nuevos
y los 2 workflows de cron nuevos — no está incluido como task porque
`docs-agent` ya sabe cómo detectar y corregir desfases sin que se le
indique archivo por archivo.
