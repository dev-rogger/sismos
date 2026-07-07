# Diseño: backfill histórico (`sismos_historicos`)

**Fecha:** 2026-07-07
**Alcance:** Script one-off que carga el top 10 de los sismos más grandes de la historia de Chile en la colección `sismos_historicos`, con soporte de ajuste manual para eventos mal geolocalizados. Reemplaza el schema stub de `SismoHistoricoModel`.

**Fuera de alcance:** mapa/UI, disparo automático (es un script manual, no un cron), cualquier lectura de esta colección desde `apps/web` (eso es parte del subsistema de mapa/UI, se diseña aparte).

## Fuente de datos

USGS FDSN Event Query API: `https://earthquake.usgs.gov/fdsnws/event/1/query`

Parámetros:
- `format=geojson`
- `starttime=1900-01-01` (antes de esta fecha los registros instrumentales de magnitud no son confiables)
- `minlatitude=-56&maxlatitude=-17&minlongitude=-76&maxlongitude=-66` (bounding box de Chile continental)
- `orderby=magnitude`
- `limit=15` (buffer — se toman los primeros 10 resultados después de normalizar; el buffer permite margen si algún evento del buffer se excluye a futuro)

Verificado en vivo — top resultados reales (2026-07-07):

| Evento | Magnitud | Fecha | USGS id |
|---|---|---|---|
| Valdivia | 9.5 | 1960-05-22 | `official19600522191120_30` |
| Maule | 8.8 | 2010-02-27 | `official20100227063411530_30` |
| Vallenar | 8.5 | 1922-11-11 | `official19221111043251_30` |
| Illapel | 8.3 | 2015-09-16 | `us20003k7a` |
| Valparaíso | 8.2 | 1906-08-17 | `iscgemsup16957911` |
| San Pedro de Atacama | 8.2 | 1950-12-09 | `iscgem896170` |
| Iquique | 8.2 | 2014-04-01 | `usc000nzvd` |
| Illapel (1943) | 8.1 | 1943-04-06 | `iscgem899789` |
| Cañete (foreshock de Valdivia) | 8.1 | 1960-05-21 | `iscgem879106` |
| Diego de Almagro | 8.01 | 1918-12-04 | `iscgem913362` |

Nota: se verificaron las coordenadas actuales que USGS tiene para Valdivia 1960 (-38.143, -73.407) — están razonablemente bien ubicadas hoy (los catálogos se han refinado con los años). No se aplica ningún override al momento de escribir este spec; el mecanismo queda listo para usarse cuando haga falta.

## Script: `apps/ingestor/scripts/backfill-historicos.ts`

Ejecutado manualmente vía `pnpm --filter ingestor backfill-historicos` (usa `tsx` como runner — nueva devDependency de `apps/ingestor`). No es un endpoint HTTP: es deliberadamente un script CLI para que nadie lo dispare por accidente vía la web.

Flujo:
1. Fetch a la URL de arriba.
2. Normalizar cada `Feature` con `normalizeUsgsFeature` (de `@sismos/shared` — reutiliza la lógica ya implementada para el ingestor en vivo, mismo shape GeoJSON).
3. Aplicar overrides desde `apps/ingestor/data/historical-overrides.json` (ver abajo) — merge shallow sobre el evento normalizado, por `externalId`.
4. Tomar los primeros 10 eventos (ya vienen ordenados por magnitud desde la API).
5. Upsert en `sismos_historicos` por `externalId` (idempotente — correr el script de nuevo actualiza en vez de duplicar).
6. Loguear un resumen: cuántos se insertaron/actualizaron, y qué overrides se aplicaron.

## Archivo de overrides: `apps/ingestor/data/historical-overrides.json`

Clave = `externalId` (el id de USGS, ej. `official19600522191120_30`). Valor = objeto parcial con cualquiera de `latitud`, `longitud`, `magnitud`, `lugar`, `fecha` (ISO string) a pisar. Arranca como `{}` (sin overrides activos hoy).

Ejemplo de forma (no se aplica actualmente, solo ilustra el mecanismo):
```json
{
  "official19600522191120_30": {
    "lugar": "Valdivia, Chile (ajustado manualmente)"
  }
}
```

## Schema real de `SismoHistoricoModel`

Reemplaza el stub `strict: false`:

```ts
{
  externalId: { type: String, required: true, unique: true },
  fecha: { type: Date, required: true },
  magnitud: { type: Number, required: true },
  profundidadKm: { type: Number, required: true },
  latitud: { type: Number, required: true },
  longitud: { type: Number, required: true },
  lugar: { type: String, required: true },
}
```

No incluye `fuente` (siempre USGS para esta colección, no aporta valor de query) ni `refCruzada` (no aplica dedupe acá — cada evento histórico es único por definición).

## Fuera de alcance / diferido

- Lectura de `sismos_historicos` desde `apps/web` (subsistema de mapa/UI, diseño separado)
- Automatización del backfill (sigue siendo manual, no hay cron)
- Overrides activos (el archivo arranca vacío; se llena si en el futuro se detecta un evento mal geolocalizado)
