# Diseño: ingestor real (CSN + USGS → Mongo)

**Fecha:** 2026-07-07
**Alcance:** Implementar la lógica real de `apps/ingestor` (`GET /api/ingest`): fetch a CSN y USGS, normalización real, dedupe entre fuentes, guardado idempotente en MongoDB. Reemplaza los stubs de `packages/shared` (normalización) y `packages/db` (schema de `SismoModel`).

**Fuera de alcance de esta ronda:** backfill de `sismos_historicos`, tests automatizados, mecanismo de disparo en producción (sigue pendiente el problema de cadencia de Vercel Cron, ver spec del scaffold), mapa/UI (`apps/web`).

## Contexto y hallazgo importante

La API "api-sismologia-chile" mencionada en el spec original del scaffold (`https://api-sismologia-chile.herokuapp.com/`) **está muerta** (Heroku eliminó el free tier en 2022; el endpoint devuelve 404 "No such app"). Se investigaron alternativas y se confirmó una viva y funcional:

- **CSN (Chile):** `https://api.xor.cl/sismo/recent` — proyecto comunitario open-source (`xorcl/api-sismo`, Go) que scrapea `sismologia.cl`. Verificado en vivo: responde 200, JSON limpio, sin auth, CORS abierto (`access-control-allow-origin: *`), sin rate limit documentado. Response shape:
  ```json
  {
    "status_code": 0,
    "status_description": "...",
    "events": [
      {
        "id": "373466",
        "url": "http://sismologia.cl/sismicidad/informes/2026/07/373466.html",
        "map_url": "http://sismologia.cl/sismicidad/informes/2026/07/map_img/373466.jpeg",
        "local_date": "2026-07-07 16:17:05",
        "utc_date": "2026-07-07 20:17:05",
        "latitude": -32.685,
        "longitude": -71.722,
        "depth": 16,
        "magnitude": { "value": 2.9, "measure_unit": "Mlv" },
        "geo_reference": "21 km al NO de Quintero"
      }
    ]
  }
  ```
- **Mundo:** `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson` — feed nativo de USGS (magnitud 4.5+, última hora), confirmado vivo. Formato GeoJSON estándar: cada `feature` tiene `id`, `properties.mag`, `properties.place`, `properties.time` (epoch ms), `geometry.coordinates` = `[lon, lat, depth]`.

## Mapeo a `SismoNormalizado`

| Campo | CSN (`api.xor.cl`) | USGS (GeoJSON feature) |
|---|---|---|
| `fuente` | `"csn"` | `"usgs"` |
| `externalId` | `id` | `feature.id` |
| `fecha` | `utc_date` (parsear como UTC) | `properties.time` (epoch ms) |
| `magnitud` | `magnitude.value` | `properties.mag` |
| `profundidadKm` | `depth` | `geometry.coordinates[2]` |
| `latitud` | `latitude` | `geometry.coordinates[1]` |
| `longitud` | `longitude` | `geometry.coordinates[0]` |
| `lugar` | `geo_reference` | `properties.place` |

## Flujo de ingesta (`GET /api/ingest`)

1. Fetch CSN y USGS **en paralelo**, cada uno en su propio try/catch — si una fuente falla (red, formato inesperado, etc.), la otra sigue su curso normalmente.
2. Normalizar cada resultado a `SismoNormalizado[]` (implementación real de `normalizeCsnSismo`/`normalizeUsgsFeature`, ya no stubs que lanzan error).
3. **Dedupe entre fuentes:** para cada evento normalizado, buscar en Mongo eventos de **la fuente contraria** en los últimos 10 minutos que cumplan las tres condiciones simultáneamente:
   - Ventana de tiempo: `±2 minutos`
   - Distancia: `≤100km` (fórmula haversine sobre `latitud`/`longitud`)
   - Magnitud: `±0.5`

   Si hay match: no se inserta un evento nuevo. Se prioriza el dato de CSN (más preciso para eventos en Chile) — si el evento entrante es de USGS y hace match con uno de CSN ya guardado, se actualiza el documento de CSN agregando `refCruzada: { fuente: "usgs", externalId }`. Si el evento entrante es de CSN y hace match con uno de USGS ya guardado, el documento de USGS se **reemplaza** por los datos de CSN (conservando `refCruzada` hacia el USGS original).

   Si no hay match: se inserta como evento nuevo.
4. **Idempotencia por fuente:** upsert por `(fuente, externalId)` — índice único compuesto. Volver a fetchear el mismo evento CSN/USGS en un run posterior actualiza el documento existente en vez de duplicarlo.
5. La respuesta del endpoint reporta un resumen: `{ csn: { fetched, inserted, errors }, usgs: { fetched, inserted, errors }, deduped }`.

## Schema real de `SismoModel` (`packages/db`)

Reemplaza el stub `strict: false`:

```ts
{
  fuente: { type: String, enum: ["csn", "usgs"], required: true },
  externalId: { type: String, required: true },
  fecha: { type: Date, required: true },
  magnitud: { type: Number, required: true },
  profundidadKm: { type: Number, required: true },
  latitud: { type: Number, required: true },
  longitud: { type: Number, required: true },
  lugar: { type: String, required: true },
  refCruzada: {
    fuente: { type: String, enum: ["csn", "usgs"] },
    externalId: String,
  },
}
```

Índice único compuesto: `{ fuente: 1, externalId: 1 }`.

`SismoHistoricoModel` no se toca en esta ronda (sigue siendo el stub `strict: false` — pertenece al backfill, fuera de alcance).

## Desarrollo local

- **MongoDB local vía Docker:** `docker-compose.yml` en la raíz del monorepo con un servicio `mongo` (imagen oficial `mongo`, puerto `27017`, volumen persistente). `.env.example` y el `.env` local de `apps/ingestor` apuntan a `mongodb://localhost:27017/sismos`. No depende de Atlas ni de internet para desarrollar.
- **Trigger local repetido:** script (`apps/ingestor/scripts/poll.sh` o similar) que hace `curl` a `http://localhost:3001/api/ingest` cada 1 minuto mientras corre `pnpm --filter ingestor dev`, simulando la cadencia del cron real sin necesidad de configurar nada en Vercel todavía.

## Manejo de errores

- Fallo de red/parseo en una fuente: se loguea (`console.error`), se cuenta en `errors` de esa fuente en la respuesta, y el proceso continúa con la otra fuente. No se lanza una excepción no controlada que tire el endpoint entero.
- Fallo de conexión a Mongo: si `getMongooseConnection()` falla, el endpoint responde con status 500 y un mensaje de error (no hay retry automático en esta ronda).

## Fuera de alcance / diferido

- Backfill de `sismos_historicos` (script one-off separado, con ajuste manual para eventos como Valdivia 1960)
- Tests automatizados (no se agrega Vitest ni ningún framework en esta ronda)
- Mecanismo real de disparo en producción (Vercel Pro vs. cron externo cada 1 min vs. relajar cadencia) — sigue como riesgo conocido documentado en el spec del scaffold
- Mapa/UI en `apps/web` (subsistema separado, se diseña después)
