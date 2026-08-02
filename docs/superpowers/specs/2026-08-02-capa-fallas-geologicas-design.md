# Capa de fallas geológicas de Chile en el mapa

## Contexto

El mapa principal (`MapaSismos.tsx`) hoy solo muestra sismos (marcadores por magnitud, círculo de percepción del sismo seleccionado, marcador de "mi ubicación"). No hay ninguna capa de contexto geológico. El usuario pidió poder activar, desde la vista del mapa, una capa que muestre las fallas geológicas de Chile — dato de contexto informativo, no otro filtro de sismos.

No existe en el proyecto ninguna fuente de datos de fallas. Se investigó y se eligió el [GEM Global Active Faults Database](https://github.com/GEMScienceTools/gem-global-active-faults) (CC-BY-SA 4.0, ~13.500 fallas mundiales en GeoJSON). Filtrando por el mismo bounding box que ya usa `CHILE_BOUNDS` en `MapaSismos.tsx` (`[-76,-56]` a `[-66,-17.3]`) quedan 237 fallas (todas `LineString`, ~108 KB), 162 de ellas con nombre (ej. "San Ramon 01a", la falla de Santiago), 75 sin nombre. El archivo original completo pesa ~12 MB y no tiene un campo de país, así que no es viable consumirlo tal cual — hay que preprocesarlo una vez y commitear el resultado ya filtrado.

## Alcance

1. Script de preprocesamiento (`apps/web/scripts/generar-fallas-chile.mjs`) que descarga el GeoJSON global de GEM, filtra a las fallas dentro de `CHILE_BOUNDS`, y escribe `apps/web/public/data/fallas-chile.geojson`. Se corre a mano cuando se quiera refrescar el dato (no en cada build ni en runtime) y el resultado se commitea al repo.
2. Nuevo hook `useCapaFallas()` (`apps/web/lib/use-capa-fallas.ts`): boolean `fallasVisibles` persistido en `localStorage`, mismo patrón que `useFiltroMapa`.
3. Nuevo botón `BotonFallasMapa.tsx`, mismo estilo/tamaño que `BotonFiltroMapa` y el botón "Ver todo Chile", agregado al grupo de controles flotantes del mapa. Ícono SVG de línea quebrada (representa una falla). Estado activo remarcado igual que "Solo Chile" (borde + fondo `sky-500`).
4. `MapaSismos.tsx` recibe un nuevo prop `fallasVisibles: boolean`. Al activarse por primera vez, hace `fetch("/data/fallas-chile.geojson")`, agrega una `source` + `layer` tipo `line` a MapLibre. Apagar el toggle oculta la layer (no la remueve ni descarta el fetch cacheado); volver a prenderla la muestra al instante, sin pedir el archivo de nuevo.
5. Click sobre una línea de falla abre un popup chico (mismo componente visual que el popup de sismos, sin badge de magnitud): nombre de la falla si `properties.name` existe, o "Falla sin nombre registrado" si no.
6. Atribución "GEM Global Active Faults" agregada junto a la atribución de MapLibre/OpenStreetMap que ya se muestra abajo del mapa (requisito de la licencia CC-BY-SA 4.0).

Fuera de alcance: fallas fuera de Chile o cinturones sísmicos mundiales (Cinturón de Fuego, etc.) — solo fallas geológicas de Chile por ahora; actualización automática del dataset (el script es manual); mostrar atributos adicionales de la falla (tipo de deslizamiento, buzamiento, etc.) en el popup — solo el nombre; permitir filtrar/buscar fallas por nombre.

## Diseño

### Script de preprocesamiento (`apps/web/scripts/generar-fallas-chile.mjs`)

Node script standalone (usa `fetch` nativo, sin dependencias nuevas):

```js
const BOUNDS = { minLon: -76, maxLon: -66, minLat: -56, maxLat: -17.3 };
const URL_GEM =
  "https://raw.githubusercontent.com/GEMScienceTools/gem-global-active-faults/master/geojson/gem_active_faults.geojson";

const data = await fetch(URL_GEM).then((r) => r.json());
const dentroDeChile = (coords, found = { si: false }) => {
  if (typeof coords[0] === "number") {
    const [lon, lat] = coords;
    if (lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon && lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat) {
      found.si = true;
    }
    return found.si;
  }
  for (const c of coords) {
    dentroDeChile(c, found);
    if (found.si) break;
  }
  return found.si;
};

const features = data.features
  .filter((f) => dentroDeChile(f.geometry.coordinates))
  .map((f) => ({
    type: "Feature",
    geometry: f.geometry,
    properties: { name: f.properties.name ?? null },
  }));

fs.writeFileSync(
  "apps/web/public/data/fallas-chile.geojson",
  JSON.stringify({ type: "FeatureCollection", features }),
);
```

Se descartan todas las propiedades salvo `name` (buzamiento, tasa de deslizamiento, catálogo de origen, etc. no se usan en la UI — no tiene sentido bundlear ese peso).

### Hook de estado (`apps/web/lib/use-capa-fallas.ts`)

Mismo patrón que `use-filtro-mapa.ts`, pero un boolean simple en vez de un objeto:

```ts
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

### Botón (`apps/web/components/mapa/BotonFallasMapa.tsx`)

Botón simple sin modal propio (a diferencia de `BotonFiltroMapa`, que abre `ModalFiltroMapa`): un solo click alterna `fallasVisibles`. Mismas clases base que el botón "Ver todo Chile" (`min-h-11`, `border-neutral-700`, `bg-neutral-900/90`), con el mismo tratamiento de estado activo que usa "Solo Chile" en `ModalFiltroMapa.tsx` (`border-sky-500 bg-sky-500/10 text-sky-400` cuando `fallasVisibles` es `true`).

Se agrega al grupo de controles existente en `MapaSismos.tsx`, entre `BotonFiltroMapa` y "Ver todo Chile".

### Flujo de props

`useCapaFallas()` se instancia en `MapaConHistorial.tsx` (mismo nivel que `useFiltroMapa`/`useUbicacionUsuario`), y `fallasVisibles`/`setFallasVisibles` bajan a `MapaSismos` como props nuevos (`fallasVisibles`, `onFallasVisiblesChange`), igual que `filtro`/`onFiltroChange` hoy. Dentro de `MapaSismos.tsx`, `BotonFallasMapa` recibe esos mismos dos props sin transformarlos (lee `fallasVisibles` para su estado visual, llama `onFallasVisiblesChange(!fallasVisibles)` al click). El `useEffect` que carga/oculta la layer de fallas (ver más abajo) también vive en `MapaSismos.tsx` y usa `onFallasVisiblesChange(false)` como único punto de "apagado forzado" ante un error de fetch.

### Capa en el mapa (`MapaSismos.tsx`)

Nuevo prop `fallasVisibles: boolean`. Un ref `fallasCargadasRef` evita pedir el archivo más de una vez:

```ts
const FUENTE_FALLAS = "fallas-chile";
const fallasCargadasRef = useRef(false);

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
    .then((geojson) => {
      map.addSource(FUENTE_FALLAS, { type: "geojson", data: geojson });
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
        const nombre = e.features?.[0]?.properties?.name;
        new maplibregl.Popup({ className: "popup-sismo" })
          .setLngLat(e.lngLat)
          .setHTML(
            `<div class="popup-sismo-titulo">${nombre ?? "Falla sin nombre registrado"}</div>`,
          )
          .addTo(map);
      });
      fallasCargadasRef.current = true;
    })
    .catch((error) => {
      console.error("[MapaSismos] fallas fetch error:", error);
      onFallasVisiblesChange(false);
    });
}, [fallasVisibles]);
```

El color `#b45309` (ámbar oscuro) se eligió por ser visualmente distinto de la paleta de magnitud de sismos (`facc15`/`f59e0b`/`ea580c`/`dc2626`) y del azul de selección/ubicación (`#38bdf8`), para que las fallas se lean como capa de fondo y no compitan con los datos de sismos.

### Atribución

`ESTILO_URL` ya trae su propio control de atribución de MapLibre (visible abajo a la derecha, "MapLibre | OpenFreeMap © OpenMapTiles Data from OpenStreetMap"). Se agrega un `attribution` extra a la `source` de fallas:

```ts
map.addSource(FUENTE_FALLAS, {
  type: "geojson",
  data: geojson,
  attribution: '<a href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank">GEM Global Active Faults</a>',
});
```

MapLibre la agrega automáticamente al control de atribución existente cuando la source está activa.

### Qué NO cambia

- `PanelHistorial`, `PantallaHistorial`, `ModalFiltroMapa`, filtro de sismos: sin cambios. Las fallas son una capa de contexto visual, no interactúan con el filtro de magnitud/ventana/Solo Chile.
- El popup de fallas es un componente/estilo separado del popup de sismos (`construirHtmlPopup`) — no tiene badge de magnitud ni fecha, solo el nombre.
- No se agrega ninguna dependencia nueva (ni turf, ni librerías de simplificación geométrica) — el archivo filtrado ya es lo bastante chico sin necesitar simplificar geometría.

## Testing / verificación

- Toggle apagado → prendido: aparecen las líneas de falla en el mapa, sin recargar la página ni bloquear la interacción con los marcadores de sismos.
- Toggle prendido → apagado → prendido de nuevo: la segunda vez no dispara un nuevo `fetch` (verificar en network tab / logs) y las líneas reaparecen al instante.
- Click en una falla con nombre (ej. buscar visualmente "San Ramón" cerca de Santiago) → popup con ese nombre.
- Click en una falla sin nombre → popup "Falla sin nombre registrado".
- Recargar la página con el toggle en `true` guardado en localStorage → la capa se activa sola al cargar (fetch se dispara igual, ya que es la primera vez en esa carga de página).
- Simular fetch fallido (ej. renombrar temporalmente el archivo estático) → el toggle vuelve a `false` solo, sin quedar en un estado "activado pero sin datos", y se loguea el error a consola.
- Verificar que la atribución de GEM aparece en el control de atribución del mapa una vez que la capa se activó al menos una vez.
