# Capa de fallas geológicas en el mapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un toggle en el mapa principal que muestre/oculte las fallas geológicas de Chile como capa de contexto visual, con datos abiertos (GEM Global Active Faults) preprocesados una sola vez y bundleados como asset estático.

**Architecture:** Un script de preprocesamiento genera un GeoJSON chico (~108KB, 237 fallas) a partir del dataset global de GEM (~12MB), commiteado como asset público. Un hook (`useCapaFallas`) persiste el estado on/off en localStorage, igual que `useFiltroMapa`. Un botón nuevo (`BotonFallasMapa`) vive junto a los demás controles del mapa. `MapaSismos.tsx` hace `fetch` del asset la primera vez que se activa el toggle, agrega una `source`+`layer` tipo `line` a MapLibre, y muestra/oculta la layer en togglees subsiguientes sin volver a pedir el archivo.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + MapLibre GL JS + Tailwind v4. Sin dependencias nuevas — el script de preprocesamiento es Node plano (usa `fetch` nativo, disponible desde Node 18+; el repo requiere Node ≥24).

## Global Constraints

- No agregar dependencias npm nuevas al runtime de `apps/web` (spec: "no tiene sentido bundlear ese peso" / "no se agrega ninguna dependencia nueva").
- El GeoJSON preprocesado solo conserva la propiedad `name` de cada falla (se descartan buzamiento, tasa de deslizamiento, catálogo de origen, etc.).
- El toggle se persiste en `localStorage` bajo la clave `sismos:capa-fallas`, siguiendo el patrón exacto de `useFiltroMapa` (`apps/web/lib/use-filtro-mapa.ts`).
- Este proyecto no tiene suite de tests automatizados (solo `pnpm --filter web check-types` y `pnpm --filter web lint`). Cada tarea de código se verifica con esos dos comandos; el comportamiento interactivo se verifica manualmente en el navegador, seleccionando `mcp__claude-in-chrome` (u otro navegador manual) como en el resto del proyecto.
- Color de la capa: `#b45309` (ámbar oscuro), `line-width: 1.5`, `line-dasharray: [2, 1.5]`, `line-opacity: 0.7` — elegido para no competir visualmente con la paleta de magnitud de sismos (`facc15`/`f59e0b`/`ea580c`/`dc2626`) ni con el azul de selección/ubicación (`#38bdf8`).

---

### Task 1: Script de preprocesamiento + datos generados

**Files:**
- Create: `apps/web/scripts/generar-fallas-chile.mjs`
- Modify: `apps/web/package.json` (nuevo script `"generar-fallas-chile"`)
- Create (generado por el script, luego commiteado): `apps/web/public/data/fallas-chile.geojson`

**Interfaces:**
- Produces: `apps/web/public/data/fallas-chile.geojson` — `FeatureCollection` de `LineString`, cada `Feature.properties` con exactamente `{ name: string | null }`. Este es el contrato que consume Task 4 (`fetch("/data/fallas-chile.geojson")`).

- [ ] **Step 1: Escribir el script de preprocesamiento**

```js
// apps/web/scripts/generar-fallas-chile.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BOUNDS = { minLon: -76, maxLon: -66, minLat: -56, maxLat: -17.3 };
const URL_GEM =
  "https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults.geojson";
const SALIDA = path.join("public", "data", "fallas-chile.geojson");

function dentroDeChile(coords) {
  if (Array.isArray(coords) && typeof coords[0] === "number") {
    const [lon, lat] = coords;
    return (
      lon >= BOUNDS.minLon &&
      lon <= BOUNDS.maxLon &&
      lat >= BOUNDS.minLat &&
      lat <= BOUNDS.maxLat
    );
  }
  if (Array.isArray(coords)) {
    return coords.some((c) => dentroDeChile(c));
  }
  return false;
}

async function main() {
  console.log(`Descargando ${URL_GEM}...`);
  const res = await fetch(URL_GEM);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = await res.json();

  const features = data.features
    .filter((f) => dentroDeChile(f.geometry.coordinates))
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { name: f.properties.name ?? null },
    }));

  const geojson = { type: "FeatureCollection", features };
  mkdirSync(path.dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(geojson));
  console.log(`${features.length} fallas escritas en ${SALIDA}`);
}

main();
```

- [ ] **Step 2: Agregar el script a `apps/web/package.json`**

En la sección `"scripts"` (junto a `"dev"`, `"build"`, etc.):

```json
"generar-fallas-chile": "node scripts/generar-fallas-chile.mjs"
```

- [ ] **Step 3: Correr el script y verificar el resultado**

Run: `pnpm --filter web generar-fallas-chile`
Expected: imprime algo como `237 fallas escritas en public/data/fallas-chile.geojson` (el número exacto puede variar levemente si GEM actualizó el dataset).

Verificar el archivo generado:

```bash
node -e '
const d = require("./apps/web/public/data/fallas-chile.geojson");
console.log("features:", d.features.length);
console.log("con nombre:", d.features.filter(f => f.properties.name).length);
console.log("San Ramon presente:", d.features.some(f => (f.properties.name||"").toLowerCase().includes("ramon")));
'
```

Expected: `features` entre 200-300, `con nombre` mayor a 100, `San Ramon presente: true`.

Verificar el tamaño:

Run: `ls -la apps/web/public/data/fallas-chile.geojson`
Expected: entre 50KB y 200KB (no varios MB — si el archivo pesa varios MB, el filtro de bounding box no está funcionando y hay que revisar el Step 1 antes de continuar).

- [ ] **Step 4: Commit**

```bash
git add apps/web/scripts/generar-fallas-chile.mjs apps/web/package.json apps/web/public/data/fallas-chile.geojson
git commit -m "feat(web): add Chile active-faults dataset (GEM, preprocessed)"
```

---

### Task 2: Hook de estado `useCapaFallas`

**Files:**
- Create: `apps/web/lib/use-capa-fallas.ts`

**Interfaces:**
- Consumes: nada (hook standalone, mismo patrón que `apps/web/lib/use-filtro-mapa.ts`).
- Produces: `useCapaFallas(): { fallasVisibles: boolean; setFallasVisibles: (v: boolean) => void }`. Task 4 instancia este hook en `MapaConHistorial.tsx` y pasa ambos valores como props a `MapaSismos`.

- [ ] **Step 1: Escribir el hook**

```ts
// apps/web/lib/use-capa-fallas.ts
"use client";

import { useEffect, useState } from "react";

const CLAVE_STORAGE = "sismos:capa-fallas";

export function useCapaFallas() {
  const [fallasVisibles, setFallasVisibles] = useState(false);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    setFallasVisibles(window.localStorage.getItem(CLAVE_STORAGE) === "true");
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(CLAVE_STORAGE, String(fallasVisibles));
    } catch {
      // localStorage puede fallar (Safari privado, cuota excedida); seguimos
      // funcionando en memoria para esta sesión.
    }
  }, [fallasVisibles, cargado]);

  return { fallasVisibles, setFallasVisibles };
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: ambos comandos terminan sin errores (el hook no se usa todavía en ningún componente, así que no debería haber errores de tipos relacionados).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/use-capa-fallas.ts
git commit -m "feat(web): add useCapaFallas hook for the faults layer toggle"
```

---

### Task 3: Botón `BotonFallasMapa`

**Files:**
- Create: `apps/web/components/mapa/BotonFallasMapa.tsx`

**Interfaces:**
- Consumes: nada externo (componente puro de presentación).
- Produces: `export default function BotonFallasMapa(props: { fallasVisibles: boolean; onFallasVisiblesChange: (visibles: boolean) => void }): JSX.Element`. Task 4 lo renderiza dentro de `MapaSismos.tsx`, pasándole `fallasVisibles`/`onFallasVisiblesChange` recibidos como props del propio `MapaSismos`.

- [ ] **Step 1: Escribir el componente**

```tsx
// apps/web/components/mapa/BotonFallasMapa.tsx
"use client";

interface BotonFallasMapaProps {
  fallasVisibles: boolean;
  onFallasVisiblesChange: (visibles: boolean) => void;
}

export default function BotonFallasMapa({
  fallasVisibles,
  onFallasVisiblesChange,
}: BotonFallasMapaProps) {
  return (
    <button
      type="button"
      onClick={() => onFallasVisiblesChange(!fallasVisibles)}
      aria-pressed={fallasVisibles}
      aria-label={
        fallasVisibles
          ? "Ocultar fallas geológicas"
          : "Mostrar fallas geológicas"
      }
      className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-xs font-medium shadow-lg transition-colors ${
        fallasVisibles
          ? "border-sky-500 bg-sky-500/10 text-sky-400"
          : "border-neutral-700 bg-neutral-900/90 text-neutral-100 hover:bg-neutral-800"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M3 12l4-7 4 9 4-9 4 9 2-4" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 2: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: ambos comandos terminan sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/mapa/BotonFallasMapa.tsx
git commit -m "feat(web): add BotonFallasMapa button component"
```

---

### Task 4: Integración completa en el mapa

**Files:**
- Modify: `apps/web/components/MapaConHistorial.tsx`
- Modify: `apps/web/components/mapa/MapaSismos.tsx`

**Interfaces:**
- Consumes: `useCapaFallas()` (Task 2), `BotonFallasMapa` (Task 3), `apps/web/public/data/fallas-chile.geojson` (Task 1, vía `fetch("/data/fallas-chile.geojson")`).
- Produces: comportamiento end-to-end completo — no hay tareas posteriores que dependan de esto.

- [ ] **Step 1: Instanciar el hook en `MapaConHistorial.tsx`**

En `apps/web/components/MapaConHistorial.tsx`, agregar el import junto a los demás hooks (después de la línea `import { useUbicacionUsuario } from "../lib/use-ubicacion-usuario";`):

```tsx
import { useCapaFallas } from "../lib/use-capa-fallas";
```

Dentro del componente, junto a las demás llamadas a hooks (después de la línea `const { ubicacion, pedirUbicacion, setRadioKm } = useUbicacionUsuario();`):

```tsx
const { fallasVisibles, setFallasVisibles } = useCapaFallas();
```

En el JSX, agregar dos props nuevos al `<MapaSismos ... />` existente (junto a `onPedirUbicacion={pedirUbicacion}`):

```tsx
fallasVisibles={fallasVisibles}
onFallasVisiblesChange={setFallasVisibles}
```

- [ ] **Step 2: Agregar los props nuevos a `MapaSismosProps` en `MapaSismos.tsx`**

En la interface `MapaSismosProps` (después de `onPedirUbicacion: () => Promise<{ lat: number; lon: number } | null>;`):

```tsx
fallasVisibles: boolean;
onFallasVisiblesChange: (visibles: boolean) => void;
```

Y en la firma del componente (después de `onPedirUbicacion,` en la desestructuración de props):

```tsx
fallasVisibles,
onFallasVisiblesChange,
```

- [ ] **Step 3: Importar `BotonFallasMapa` y agregar las constantes/refs de la capa**

Junto al import de `BotonFiltroMapa` (línea 11):

```tsx
import BotonFallasMapa from "./BotonFallasMapa";
```

Junto a la constante `FUENTE_ONDA` (línea 44):

```tsx
const FUENTE_FALLAS = "fallas-chile";
```

Junto a `marcadorUbicacionRef` (línea 126, dentro del componente):

```tsx
const fallasCargadasRef = useRef(false);
const popupFallaRef = useRef<maplibregl.Popup | null>(null);
```

- [ ] **Step 4: Agregar el efecto que carga/muestra/oculta la capa de fallas**

Agregar este `useEffect` nuevo después del efecto de `sismoSeleccionado` (después de la línea 419, `}, [sismoSeleccionado]);`), antes del `return (`:

```tsx
useEffect(() => {
  const map = mapRef.current;
  if (!map) return;

  if (!fallasVisibles) {
    if (map.getLayer(`${FUENTE_FALLAS}-linea`)) {
      map.setLayoutProperty(`${FUENTE_FALLAS}-linea`, "visibility", "none");
    }
    return;
  }

  if (fallasCargadasRef.current) {
    map.setLayoutProperty(`${FUENTE_FALLAS}-linea`, "visibility", "visible");
    return;
  }

  fetch("/data/fallas-chile.geojson")
    .then((res) => {
      if (!res.ok) throw new Error(`fallas fetch failed: ${res.status}`);
      return res.json();
    })
    .then((geojson: GeoJSON.FeatureCollection) => {
      map.addSource(FUENTE_FALLAS, {
        type: "geojson",
        data: geojson,
        attribution:
          '<a href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noreferrer">GEM Global Active Faults</a>',
      });
      map.addLayer({
        id: `${FUENTE_FALLAS}-linea`,
        type: "line",
        source: FUENTE_FALLAS,
        paint: {
          "line-color": "#b45309",
          "line-width": 1.5,
          "line-dasharray": [2, 1.5],
          "line-opacity": 0.7,
        },
      });
      map.on("click", `${FUENTE_FALLAS}-linea`, (e) => {
        const props = e.features?.[0]?.properties as
          | { name: string | null }
          | undefined;
        popupFallaRef.current?.remove();
        popupFallaRef.current = new maplibregl.Popup({
          className: "popup-sismo",
        })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="popup-sismo-titulo">${props?.name ?? "Falla sin nombre registrado"}</div>`,
          )
          .addTo(map);
      });
      fallasCargadasRef.current = true;
    })
    .catch((error) => {
      console.error("[MapaSismos] fallas fetch error:", error);
      onFallasVisiblesChange(false);
    });
}, [fallasVisibles, onFallasVisiblesChange]);
```

- [ ] **Step 5: Renderizar el botón**

En el JSX, agregar `<BotonFallasMapa />` entre `<BotonFiltroMapa .../>` y el botón "Ver todo Chile" (dentro del `<div className="absolute right-3 ...">`):

```tsx
<BotonFallasMapa
  fallasVisibles={fallasVisibles}
  onFallasVisiblesChange={onFallasVisiblesChange}
/>
```

- [ ] **Step 6: Verificar tipos y lint**

Run: `pnpm --filter web check-types && pnpm --filter web lint`
Expected: ambos comandos terminan sin errores. Si `check-types` se queja de que `GeoJSON` no está definido, confirmar que `@types/geojson` está disponible transitivamente (ya lo usa `circulo-geografico.ts` con `GeoJSON.Feature<GeoJSON.Polygon>` sin import explícito — mismo patrón, no debería requerir un import nuevo).

- [ ] **Step 7: Verificación manual en el navegador**

Levantar el dev server (`pnpm --filter web dev`) y con el mapa abierto:

1. Click en el botón nuevo (ícono de línea quebrada) → aparecen líneas ámbar punteadas sobre el mapa de Chile. El botón queda remarcado en azul (`sky-500`), igual que "Solo Chile" cuando está activo.
2. Click de nuevo (apagar) → las líneas desaparecen, el botón vuelve a su estado normal.
3. Prender de nuevo → las líneas reaparecen instantáneamente (verificar en la pestaña Network del navegador que NO hay un segundo `fetch` a `fallas-chile.geojson`).
4. Zoom a la zona de Santiago y click sobre una línea de falla cercana (la Falla San Ramón corre al pie de la cordillera, borde este de Santiago) → aparece un popup con su nombre.
5. Click en una línea de falla sin nombre (cualquier zona con menos densidad de nombres, ej. el norte) → popup "Falla sin nombre registrado".
6. Recargar la página completa con el toggle activado → la capa se activa sola al cargar (localStorage persistió `true`), sin que el usuario tenga que volver a tocar el botón.
7. Abrir las herramientas de desarrollador → Application → Local Storage → confirmar que existe la clave `sismos:capa-fallas` con valor `"true"`/`"false"` acorde al último estado.
8. Simular un fetch fallido: renombrar temporalmente `apps/web/public/data/fallas-chile.geojson` a otro nombre, apagar y volver a prender el toggle → el botón vuelve solo a su estado apagado (sin quedar "prendido" sin datos), y aparece un error en la consola del navegador (`[MapaSismos] fallas fetch error: ...`). Restaurar el nombre del archivo después de la prueba.
9. Verificar que el control de atribución del mapa (esquina inferior derecha, el ícono "i" / texto de atribución) incluye "GEM Global Active Faults" después de haber activado la capa al menos una vez.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/MapaConHistorial.tsx apps/web/components/mapa/MapaSismos.tsx
git commit -m "feat(web): wire up the Chile active-faults map layer toggle"
```

---

## Spec Coverage Checklist

- Script de preprocesamiento + asset commiteado → Task 1.
- Hook `useCapaFallas` con persistencia en localStorage → Task 2.
- Botón `BotonFallasMapa` con estilo consistente → Task 3.
- Prop `fallasVisibles` en `MapaSismos`, fetch lazy + cache, mostrar/ocultar sin refetch → Task 4, Steps 2-4.
- Popup al click (con nombre / sin nombre) → Task 4, Step 4.
- Atribución GEM en el control de MapLibre → Task 4, Step 4.
- Manejo de error de fetch (vuelve a `false`, loguea a consola) → Task 4, Step 4 y Step 7.9.
- Verificación manual de todos los casos del spec (toggle, persistencia, popups, error) → Task 4, Step 7.
