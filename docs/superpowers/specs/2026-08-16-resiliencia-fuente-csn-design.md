# Resiliencia de la fuente CSN — design

## Propósito

`api.xor.cl` (el proxy no oficial que usamos para leer datos del CSN — sismos de Chile) lleva desde el 2026-08-15 09:58 UTC sin responder (Cloudflare 522 / timeout). Es un proyecto de un tercero marcado como `[DEPRECATED]` en el catálogo comunitario de APIs públicas de Chile, sin mantenimiento activo. Mientras estuvo caído, la app no mostró al menos dos sismos reales y sentidos en Santiago (M4.9 Quintero y M4.6 Valparaíso, ambos ~12:30-13:00 hora local del 2026-08-16, confirmados por prensa citando al CSN).

El CSN no tiene una API pública oficial para desarrolladores (confirmado revisando `sismologia.cl/accesos/uso-de-datos.html` y `evtdb.csn.uchile.cl` — este último es un catálogo revisado por sismólogos con semanas de rezago, no sirve como feed en vivo). Las únicas alternativas vivas encontradas son, igual que `xor.cl`, proyectos no oficiales de terceros.

Este spec agrega resiliencia a la ingesta de datos CSN sin depender de una única fuente:
1. Reintentos cortos ante fallos transitorios.
2. Una fuente de respaldo (GAEL Cloud) cuando `xor.cl` falla, con ubicación geocodificada de forma aproximada (GAEL no entrega coordenadas).
3. Reconciliación automática: cuando `xor.cl` vuelve, corrige los eventos aproximados con los datos precisos.
4. Una alerta push al admin (Rodrigo) cuando `xor.cl` lleva mucho tiempo sin responder, para enterarse antes que un usuario.

Decisiones de scope (de la conversación de brainstorming):
- Solo Chile (CSN) — no aplica a USGS, que ya viene funcionando sin interrupciones.
- `xor.cl` sigue siendo la fuente primaria; GAEL Cloud es respaldo, nunca al revés.
- La ubicación aproximada de GAEL se muestra como tal en la UI — no se presenta con la misma confianza que una coordenada real, dado que es una app de uso en contexto de seguridad.
- Fuera de alcance (explícitamente descartado en la conversación): sumar `evtdb.csn.uchile.cl` como fuente (es catálogo histórico revisado, no en vivo — queda anotado para cuando se retome el modelo predictivo, ver conversación previa sobre pronóstico regional); validar contra la base de datos los links de notificaciones push (se mencionó como hallazgo pero no fue aprobado, queda fuera).

## Fuente de respaldo: GAEL Cloud

`https://api.gael.cloud/general/public/sismos` — vivo, responde JSON con los últimos ~15 sismos de Chile a nivel nacional (sin filtro de fecha/región), actualizado con frecuencia similar a CSN. Forma de la respuesta:

```json
{
  "Fecha": "2026-08-16 15:08:08",       // UTC (confirmado cruzando con FechaUpdate)
  "Profundidad": "228",
  "Magnitud": "3.7",
  "RefGeografica": "63 km al E de Socaire",
  "FechaUpdate": "2026-08-16T16:00:00.533Z"
}
```

No trae `latitud`/`longitud` ni un ID estable — solo texto libre en `RefGeografica` con el patrón `"{distancia} km al {dirección} de {localidad}"` (direcciones en 8 puntos cardinales en español: N, NE, E, SE, S, SO, O, NO).

## Geocodificación aproximada

Nuevo módulo puro en `packages/shared/src/geocodificacion-aproximada.ts`:

- `parsearReferenciaGeografica(texto: string): { distanciaKm: number; direccion: DireccionCardinal; localidad: string } | null` — parsea el patrón de `RefGeografica` con una regexp. Si no matchea el patrón esperado, devuelve `null`.
- `DICCIONARIO_LOCALIDADES: Record<string, { lat: number; lon: number }>` — diccionario sembrado con las localidades ya vistas en el feed de GAEL durante esta investigación (Valparaíso, Quintero, Socaire, Pica, Pichidangui, Quillota, Ollagüe, Linares, Calama, Mina Collahuasi, Mina La Escondida) más las capitales regionales y ciudades grandes de Chile para cubrir razonablemente el resto de las referencias que use CSN. Vive como dato versionado en el repo (no en la base), se amplía a mano cuando aparezca una localidad nueva no reconocida.
- `calcularDestino(origen: { lat, lon }, direccion: DireccionCardinal, distanciaKm: number): { lat, lon }` — fórmula estándar de "punto destino dado rumbo y distancia" sobre una esfera (complementa a `haversineDistanceKm`, que ya existe en `dedupe.ts` para el caso inverso).
- `geocodificarAproximado(refGeografica: string): { lat: number; lon: number } | null` — combina las tres funciones anteriores; devuelve `null` si el texto no matchea el patrón o la localidad no está en el diccionario. Ese `null` se propaga y ese evento puntual se descarta (no se inventa una ubicación sin base).

Test unitarios con casos conocidos (ej. `"38 km al O de Valparaíso"` con la coordenada real de Valparaíso, verificar que el resultado cae a ~38km de distancia en dirección oeste dentro de una tolerancia razonable).

## Modelo de datos

Nueva columna en `sismos` (`packages/db/src/schema.ts`):

```ts
ubicacionAproximada: boolean("ubicacion_aproximada").notNull().default(false),
```

Migración Drizzle nueva en `packages/db/drizzle/`.

`packages/db/src/queries/sismo.ts`: agregar `ubicacionAproximada` a `Sismo`, `toSismo()`, y a los `values`/`set` de `upsertSismo`. Nueva función `reemplazarConPrecision(externalIdAproximado: string, eventoPreciso: SismoNormalizado)`: mismo patrón que `replaceWithCsn` (UPDATE en la fila existente por `external_id`, pisa lat/lon/fecha/magnitud/lugar con los datos precisos y pone `ubicacionAproximada = false`).

## Backend — ingesta

**Reintentos** en `apps/ingestor/lib/fetch-csn.ts`: envolver el `fetch` en hasta 3 intentos con backoff corto (ej. 1s, 3s) antes de lanzar el error que hoy se captura en `runIngest`.

**`apps/ingestor/lib/fetch-gael.ts`** (nuevo): `fetchGaelRecent()` — GET a GAEL, parsea la respuesta. Por cada item, intenta `geocodificarAproximado(item.RefGeografica)`; si devuelve `null`, descarta ese evento (con un log). El ID sintético para el upsert (GAEL no trae uno estable) se genera determinísticamente a partir de `fecha + magnitud + RefGeografica` (mismo evento en dos polls sucesivos produce el mismo ID, evitando duplicados mientras `xor.cl` sigue caído).

**`packages/shared/src/normalize/gael.ts`** (nuevo): normaliza al mismo `SismoNormalizado` que `csn.ts`/`usgs.ts`, con `fuente: "csn"` (sigue siendo data del CSN, solo que vía otro transporte) y un campo adicional `ubicacionAproximada: true` que se propaga hasta el `upsertSismo`.

**`apps/ingestor/lib/ingest.ts`** — cambios en `runIngest()`:
1. Igual que hoy, intenta `fetchCsnRecent()` (ahora con reintentos incluidos).
2. Si falla (los reintentos se agotaron), intenta `fetchGaelRecent()` como respaldo, usando el mismo flujo de upsert + dedupe contra USGS que ya existe para CSN.
3. Antes de insertar un evento nuevo (de cualquier fuente), si matchea por tiempo/ubicación/magnitud con una fila existente marcada `ubicacionAproximada = true`, se llama `reemplazarConPrecision` en vez de insertar una fila nueva — así cuando `xor.cl` vuelve, corrige en el momento los eventos que se habían guardado aproximados.

**Alerta al admin** — nueva tabla mínima `estado_ingesta` (`packages/db/src/schema.ts`):

```ts
export const estadoIngesta = pgTable("estado_ingesta", {
  fuente: text("fuente").primaryKey(), // "csn"
  ultimaAlertaEnviada: timestamp("ultima_alerta_enviada"),
});
```

Al final de cada `runIngest()`: se calcula el tiempo desde la última fila `fuente='csn'` con `ubicacionAproximada=false` (dato ya disponible en la tabla `sismos`, sin necesidad de trackear nada aparte). Si supera 2 horas **y** `ultimaAlertaEnviada` es `null` o tiene más de 2 horas, se dispara una notificación push a una suscripción "admin" y se actualiza `ultimaAlertaEnviada = now()` — así no se repite la alerta en cada corrida mientras siga caído, pero se vuelve a avisar si sigue caído mucho más tiempo después. Cuando `xor.cl` vuelve (aparece una fila nueva `ubicacionAproximada=false`), no hace falta resetear nada: el próximo cálculo del tiempo transcurrido ya da bajo el umbral solo.

- Variables de entorno nuevas (`ALERTA_PUSH_ENDPOINT`, `ALERTA_PUSH_P256DH`, `ALERTA_PUSH_AUTH`) con la suscripción push de Rodrigo — se obtienen suscribiéndose normalmente desde la app una vez y copiando esos valores a Vercel.
- Reutiliza `webpush.sendNotification` (ya configurado en `send-push.ts`), con un mensaje tipo "CSN lleva Xh sin actualizar".

## Frontend — indicador de ubicación aproximada

- `Sismo`/`SismoMapa`/`SismoSeleccionado` (tipos en `apps/web/lib/tipos-sismo.ts` y afines): agregar `ubicacionAproximada: boolean`.
- `apps/web/components/mapa/marcador.ts`: cuando `ubicacionAproximada` es true, el marcador lleva un pequeño indicador visual (ej. borde punteado, ya usado en otras partes del mapa para "aproximado" — ver el círculo de percepción).
- `construirHtmlPopup` en `MapaSismos.tsx`: agrega una línea "📍 Ubicación aproximada" en el popup cuando corresponda.

## Testing

- Unit tests para `geocodificacion-aproximada.ts` (parseo de texto + cálculo de destino) con casos conocidos.
- Unit tests para `reemplazarConPrecision` (usando el mismo patrón de test que ya exista para `replaceWithCsn`, si lo hay).
- Verificación manual en el navegador del indicador "ubicación aproximada" antes de mandar a producción.

## Fuera de alcance

- Modelo predictivo / catálogo histórico (conversación previa, queda pendiente).
- Validar los links de notificaciones push contra la base de datos.
- Cualquier fuente que no sea GAEL Cloud como respaldo (ChileAlerta requiere registro manual, evtdb tiene semanas de rezago).
