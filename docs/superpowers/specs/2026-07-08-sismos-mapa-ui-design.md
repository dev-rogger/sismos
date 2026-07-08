# Diseño: mapa/UI real (apps/web)

**Fecha:** 2026-07-08
**Alcance:** Reemplazar el placeholder de `apps/web` por la UI real: mapa con sismos en vivo, panel de historial, responsive en PC/celular/iPad. Consume las colecciones `sismos` y `sismos_historicos` ya pobladas por el ingestor y el backfill histórico.

**Fuera de alcance de esta ronda:** notificaciones push (subsistema aparte, se diseña después), clustering de marcadores (diferido — bajo volumen hoy), dedupe/normalización (ya implementado en el ingestor), backfill histórico (ya implementado en paralelo).

## Arquitectura de datos

- **Carga inicial:** Server Component en `app/page.tsx` lee directo de Mongo vía `@sismos/db` (nueva dependencia de `apps/web`, que hoy solo depende de `@sismos/shared`) — trae los sismos de los **últimos 10 días** de la colección `sismos`. Sin roundtrip cliente-servidor extra en la carga inicial.
- **Tiempo real:** el cliente hace polling a `GET /api/sismos?since=<ISO date>` cada 30 segundos, trayendo solo eventos con `fecha` posterior al último visto (no re-trae todo el set). Estos eventos nuevos se agregan al mapa con la animación de pulso.
- **Historial:** panel con un dropdown/selector de 3 opciones — **Histórico** (`sismos_historicos`, ya ordenado por magnitud desde el backfill), **Top 10 últimos 10 años** (`sismos`, `magnitud` DESC, `fecha > hoy - 10 años`, límite 10), **Últimos 10 días** (`sismos`, orden cronológico, sin filtro de magnitud). Cada cambio de selector pide a `GET /api/historial?tipo=historico|top10anios|ultimos10dias`.
- **Qué se pinea en el mapa:** solo los sismos de los **últimos 10 días** (misma colección `sismos`, no hay filtro de magnitud adicional). Los eventos de `sismos_historicos` **no** aparecen como pines — solo viven en el panel de historial (son de hace décadas/siglos, no tiene sentido mostrarlos como si fueran recientes).

## Mapa (MapLibre GL)

- **Librería:** MapLibre GL (WebGL, sin API key, fork open-source de Mapbox GL).
- **Estilo/tiles:** OpenFreeMap (`https://tiles.openfreemap.org/styles/liberty`) — verificado en vivo (200 OK), gratis, sin necesidad de API key ni token.
- **Vista inicial:** centrada en Chile con un zoom que muestre el país completo. El usuario puede hacer zoom/pan libremente para ver sismos de otras partes del mundo.
- **Marcadores:** HTML markers de MapLibre (`maplibregl.Marker` con elemento DOM custom, no capas GL/symbol layers) — más simple de animar con CSS que una capa GL. Color y tamaño según magnitud:
  - `< 3`: amarillo, marcador chico
  - `3 – 5`: naranja, marcador mediano
  - `5 – 7`: rojo-naranja, marcador grande
  - `≥ 7`: rojo intenso, marcador más grande
- **Animación de pulso:** un evento recién detectado por el polling (es decir, no presente en el fetch inicial ni en un poll anterior) recibe una animación CSS `@keyframes` de pulso concéntrico (círculo expandiéndose y desvaneciéndose) durante ~10-15 segundos: pasado ese tiempo, el marcador pasa a su estilo estático (color/tamaño fijo, sin pulso) sin necesidad de que el usuario haga nada.
- **Sin clustering** en esta ronda — bajo volumen esperado (CSN reciente + USGS 4.5+/hora de los últimos 10 días). Si el volumen crece a futuro, clustering queda como mejora diferida.

## Panel de historial

- Un solo panel (no 3 tabs separados) con un selector que cambia entre las 3 vistas descritas arriba.
- Cada ítem de la lista muestra: `lugar`, `magnitud`, `fecha` — lista simple de texto, sin mapa embebido ni interacción adicional.

## Responsive

Dos variantes de layout, usando el breakpoint `lg` de Tailwind v4 (≥1024px = desktop):

- **Desktop (`lg` y superior):** sidebar fijo a un costado con el panel de historial (ancho fijo, ej. 360px); el mapa ocupa el resto del viewport.
- **Mobile/tablet (`<lg`, cubre celular e iPad):** el mapa ocupa todo el viewport; el historial vive en un **bottom sheet** con dos posiciones fijas — colapsado (asoma un handle + quizás 1 línea de preview) y expandido (~80% de la altura de pantalla). Se alterna con un tap en el handle. Implementado con estado de React (`"colapsado" | "expandido"`) + CSS `transition` sobre `transform: translateY(...)` — sin librería de gestos ni arrastre libre con física.

## Estructura de archivos (`apps/web`)

```
apps/web/
├── app/
│   ├── page.tsx                    # Server Component: fetch inicial (últimos 10 días) + render del mapa
│   ├── api/
│   │   ├── sismos/route.ts         # GET ?since=<ISO> — polling de eventos nuevos
│   │   └── historial/route.ts      # GET ?tipo=historico|top10anios|ultimos10dias
│   └── globals.css                 # + @keyframes de pulso
├── components/
│   ├── mapa/
│   │   ├── MapaSismos.tsx          # Client Component: instancia MapLibre, polling cada 30s, maneja marcadores
│   │   └── marcador.ts             # helper: crea el HTML marker según magnitud (color/tamaño/pulso)
│   └── historial/
│       └── PanelHistorial.tsx      # Client Component: selector + lista; sidebar en desktop, bottom sheet en mobile/tablet
└── lib/
    └── fetch-sismos.ts             # queries a @sismos/db reutilizadas por page.tsx y las API routes
```

`apps/web/package.json` agrega `@sismos/db` como dependency (ya tiene `@sismos/shared`), más `maplibre-gl` como dependency nueva.

## Manejo de errores

- **Polling fallido** (red, 500, timeout): se reintenta en el próximo ciclo de 30s sin romper el mapa ya renderizado — se loguea en consola (`console.error`), no se muestra un error bloqueante al usuario.
- **`getMongooseConnection()` falla en una API route:** la ruta responde `500` con un JSON `{ error: "..." }`.
- **`getMongooseConnection()` falla en el Server Component (`page.tsx`):** se captura el error y la página igual renderiza con un estado vacío (`sismos: []`, historial vacío) en vez de tirar la página entera con un error 500 de Next — mejor degradar a "sin datos por ahora" que romper la carga completa.

## Fuera de alcance / diferido

- Notificaciones push (spec/plan separado, a futuro)
- Clustering de marcadores en el mapa
- Bottom sheet con arrastre libre/física (queda como mejora futura si se justifica)
- Cualquier ajuste de estilo/branding más allá de lo descrito acá (colores exactos, tipografía, etc. — se resuelven en implementación dentro de lo razonable, siguiendo Tailwind v4 por defecto)
