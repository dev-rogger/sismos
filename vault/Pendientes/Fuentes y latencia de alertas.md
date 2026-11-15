---
tags: [pendiente, investigacion, ingestor, alertas]
---

# Fuentes y latencia de alertas (Task 8 / M4)

Investigación de solo lectura del 2026-11-15 (plan `docs/superpowers/plans/2026-11-15-mejoras-sistema-alertas.md`, Task 8). Pocas peticiones GET, sin escribir en BD ni tocar código. Todo lo que no se pudo comprobar está marcado **no verificado**.

## 1. Latencia: qué se pudo medir y qué no

**Hallazgo principal: no se puede medir directamente la latencia de `api.xor.cl` con este método.**

- `api.xor.cl/sismo/recent` respondió **HTTP 522 (Cloudflare, timeout al origen)** en 3 intentos seguidos (~20 s cada uno, 22:36–22:37 UTC). Es el mismo modo de falla que ya documenta `apps/ingestor/lib/fetch-csn.ts` (reintentos y timeout de 8 s). Por eso no hay comparación `xor.cl` vs. otras fuentes: **no verificado**. Hoy ese caso lo cubre el respaldo GAEL (`fetch-gael.ts`).
- Ninguna fuente expone "primera aparición" de un evento. Los campos disponibles son `time` (origen) y `updated`/`lastupdate` (última revisión, no primera publicación), así que solo dan una **cota superior** de la latencia, y se contaminan con revisiones posteriores.

### Datos observados (2026-11-15, eventos Chile)

**EMSC (`lastupdate` − `time`)**, 12 eventos consecutivos, casi todos con `auth: CSN` (es decir, EMSC reexpone el catálogo del CSN):

| Evento (UTC) | Mag | `lastupdate` − `time` |
|---|---|---|
| 21:43:47 Antofagasta | 2.5 | 8 min 23 s |
| 21:42:24 | 2.7 | 7 min 00 s |
| 21:37:57 | 2.6 | 8 min 01 s |
| 21:02:13 | 3.5 | 5 min 12 s |
| 20:54:12 | 3.0 | 5 min 15 s |
| 19:37:51 Tarapacá | 2.5 | 4 min 44 s |
| 18:52:24 (Sur de Perú) | 4.2 | 6 min 40 s |
| 18:49:12 Tarapacá | 2.8 | 4 min 50 s |
| 18:14:29 | 2.5 | 5 min 20 s |
| 16:36:11 Valparaíso | 3.0 | 8 min 34 s |
| 15:48:12 San Juan (ARG) | 2.8 | 12 min 37 s |

Rango 4,7 a 12,6 min, típico 5 a 8 min. Esta cifra **incluye** la demora propia del CSN (localización/revisión) más la del reenvío a EMSC; no sirve para saber cuánto se demora `xor.cl` por separado.

**USGS** (`all_day`, 189 eventos mundiales; solo 4 de Chile): `updated` − `time` fue de 20 min a 3 h (p. ej. M4.1 La Tirana: origen 11:23:56, `updated` 14:28:08). Son revisiones, no la primera aparición. USGS solo publica Chile desde ~M4 (consulta FDSN con `minmagnitude=4` devolvió 8 eventos regionales en 2 días), así que **no sirve como fuente rápida ni completa para Chile**.

**CSN oficial (`https://www.sismologia.cl/`)**: sí es pública. Es HTML estático servido desde S3 + CloudFront (`age: 18`, `x-cache: Hit from cloudfront`, `last-modified` 22:10:42Z con el evento más nuevo de 21:43:47Z). Lista los últimos ~15 sismos con hora **local** (UTC-3 ese día), lugar, profundidad y magnitud, con enlace a `/sismicidad/informes/AAAA/MM/<id>.html`. Los eventos coinciden con los de EMSC (misma hora de origen). El `last-modified` es de regeneración de la página, no por evento, así que tampoco da la primera aparición. **Cuándo aparece cada evento en la página: no verificado.** Ojo: la magnitud/región difieren a veces (EMSC 4.2 "Southern Peru" vs. CSN 4.0 "Visviri"), señal de que las fuentes revisan por separado.

### Cómo medirlo de verdad en producción

Lo único que mide latencia real es guardar cuándo lo vimos por primera vez:

1. Columna `first_seen_at timestamptz default now()` en la tabla de sismos (se escribe solo en el INSERT, nunca en el upsert de actualización) y, por fuente, `fuente_vista_en`.
2. Latencia de detección = `first_seen_at - fecha_origen`. Consultarla por fuente y por hora del día tras unos días.
3. Para comparar fuentes sin tocar producción: un script de lectura corriendo cada 1 min que registre en un archivo local `(id, fuente, primera_vez_visto)` de `xor.cl`, `sismologia.cl` y EMSC; la diferencia entre fuentes para el mismo evento es la latencia relativa real.
4. El campo `ultimo_ok` de `ingesta_estado` (T6) ya da la cadencia efectiva de la ingesta, no la latencia de la fuente.

## 2. Fuentes candidatas

| Fuente | URL | Formato | Cobertura Chile | Latencia | Términos / límites | Riesgo |
|---|---|---|---|---|---|---|
| **api.xor.cl** (actual) | `https://api.xor.cl/sismo/recent` | JSON `{status_code, events[]}` | Catálogo CSN | No medida (522 durante la prueba) | Término de uso **no verificado**; API comunitaria, sin SLA | Alto: caídas 522 frecuentes, un solo mantenedor |
| **GAEL Cloud** (respaldo actual) | `https://api.gael.cloud/general/public/sismos` | JSON array | Catálogo CSN (no verificado cuál) | No medida | **No verificado** | Medio: servicio privado sin SLA |
| **CSN oficial** | `https://www.sismologia.cl/` | HTML estático (requiere parsear) | Fuente primaria, todo Chile (lista últimos ~15, no filtrable) | Página regenerada cada pocos minutos, tras CloudFront; frescura exacta no verificada | Licencia/términos **no verificados** (no se halló página de términos; `robots.txt` responde 403 de S3, no hay política legible). Los datos son del CSN (U. de Chile) | Medio: scraping de HTML frágil ante cambios de diseño; atribución obligatoria por buena práctica |
| **EMSC / SeismicPortal** | `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlat=-56&maxlat=-17&minlon=-77&maxlon=-65&orderby=time&limit=30` | GeoJSON FDSN (`time`, `lastupdate`, `mag`, `flynn_region`, `auth`) | Reexpone el catálogo CSN (`auth: CSN`) con eventos pequeños (M2.5+) | 5 a 12 min tras el origen (medido, ver arriba) | Respuesta 200 en ~2,5 s. Límites y licencia **no verificados** (EMSC pide atribución; revisar términos antes de producción) | Bajo a medio: estable, estándar FDSN, pero depende del CSN igual que `xor.cl` |
| **USGS `all_hour` / `significant_hour`** | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson` | GeoJSON | Solo ~M4+ en Chile | Feed con `cache-control: public, max-age=60`; publicado por USGS: eventos de EE. UU. en minutos, internacionales más lentos (revisiones de 20 min a 3 h observadas) | Dominio público (política USGS; confirmar texto antes de citar). Sin límite formal, pero pide no sobreconsultar: respetar 60 s de caché | Bajo, pero poca utilidad para Chile |
| **USGS FDSN** | `https://earthquake.usgs.gov/fdsnws/event/1/query` | GeoJSON/QuakeML | Igual (M4+) | Igual | Igual; límite de 20.000 eventos por consulta | Bajo |

El proyecto ya consume USGS (`apps/ingestor`); `all_hour` solo reduciría el payload, no la latencia.

## 3. Recomendación

1. **No agregar USGS como fuente rápida para Chile.** Publica solo desde ~M4 y con revisiones de minutos a horas; no mejora la latencia de aviso. Ya lo usas para el mundo.
2. **Agregar EMSC FDSN como respaldo adicional (tercer escalón tras `xor.cl` y GAEL), no como primaria.**
   - Por qué: es la única alternativa estable que cubre M2.5+ de Chile, formato estándar y respondió bien durante la caída de `xor.cl`. Su latencia (5 a 12 min) incluye el rezago del CSN, así que no se espera que adelante a una `xor.cl` sana; su valor es disponibilidad, no velocidad.
   - Cadencia: la misma de la ingesta (1 a 5 min), solo cuando fallen `xor.cl` y GAEL (evita consultas inútiles y respeta a EMSC).
   - Cambio de código: nuevo `apps/ingestor/lib/fetch-emsc.ts` (fetch con timeout 8 s, mismo patrón de `fetch-gael.ts`), tipo `EmscSismoRaw` y normalizador en `packages/shared` (mapear `time`→fecha UTC, `mag`, `lat/lon`, `depth`, y `unid`/`source_id` como id estable), y un tercer `catch` en la cascada de `apps/ingestor/lib/ingest.ts`. Deduplicar contra el id CSN (EMSC trae `auth: CSN`; hay que decidir cómo cruzar ids con `xor.cl`: **no verificado**, requiere comparar un evento en ambas fuentes). Tests con respuesta fijada como los de GAEL.
3. **Evaluar el scraping de `sismologia.cl` como respaldo de mayor fidelidad (la fuente primaria)**, pero solo tras confirmar términos con el CSN. Es HTML estático rápido (0,06 s) sin los 522 de `xor.cl`; el costo es un parser frágil y la hora local a convertir (UTC-3 en horario de verano chileno; ojo con el cambio de hora). Su valor real sería evitar depender de un intermediario, no ganar minutos. Cambio de código: `fetch-csn-oficial.ts` con parser HTML (sin dependencias nuevas si se usa regex acotada sobre filas `<tr>`, o `node-html-parser`), más pruebas con HTML fijado.
4. **Antes de invertir en cualquiera de las anteriores, medir con `first_seen_at`** (sección 1) durante unos días. Sin esa medición no hay evidencia de que cambiar de fuente acorte el aviso; la cadencia (cron a 1 min, Task 8 step 3 manual) probablemente aporta más que cambiar de fuente.
5. Task 8 step 3 (manual): confirmar si cron-job.org sigue activo a 1 min; hoy el vault solo documenta GitHub Actions cada 5 min. Revisar `ultimo_ok` en `/api/health` para ver la cadencia efectiva.

## Pendiente / no verificado

- Latencia real de `api.xor.cl` (estaba caída durante la prueba) y su campo de actualización.
- Términos de uso de `api.xor.cl`, GAEL, EMSC y CSN oficial.
- Momento de primera aparición de eventos en `sismologia.cl`.
- Mapeo de ids entre EMSC y `xor.cl`/CSN.
