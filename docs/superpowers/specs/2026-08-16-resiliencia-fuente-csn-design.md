# Resiliencia de la fuente CSN — design

## Propósito

`api.xor.cl` (el proxy no oficial que usamos para leer datos del CSN — sismos de Chile) lleva desde el 2026-08-15 09:58 UTC sin responder (Cloudflare 522 / timeout). Es un proyecto de un tercero marcado como `[DEPRECATED]` en el catálogo comunitario de APIs públicas de Chile, sin mantenimiento activo. Mientras estuvo caído, la app no mostró al menos dos sismos reales y sentidos en Santiago (M4.9 Quintero y M4.6 Valparaíso, ambos ~12:30-13:00 hora local del 2026-08-16, confirmados por prensa citando al CSN).

El CSN no tiene una API pública oficial para desarrolladores (confirmado revisando `sismologia.cl/accesos/uso-de-datos.html` y `evtdb.csn.uchile.cl` — este último es un catálogo revisado por sismólogos con semanas de rezago, no sirve como feed en vivo). Las únicas alternativas vivas encontradas son, igual que `xor.cl`, proyectos no oficiales de terceros.

Este spec agrega resiliencia a la ingesta de datos CSN sin depender de una única fuente:
1. Reintentos cortos ante fallos transitorios.
2. Una fuente de respaldo (GAEL Cloud) cuando `xor.cl` falla, con ubicación geocodificada de forma aproximada (GAEL no entrega coordenadas).
3. Reconciliación automática: cuando `xor.cl` vuelve, corrige los eventos aproximados con los datos precisos, sin volver a notificar.
4. Una alerta push al admin (Rodrigo) cuando `xor.cl` lleva mucho tiempo sin responder, para enterarse antes que un usuario.
5. Un tope de antigüedad para el push de sismos, para que una recuperación con atraso (`xor.cl` u otra causa) no dispare una ráfaga de notificaciones de eventos de hace horas.

**Nota agregada 2026-08-16 (post-diseño):** mientras se escribía este spec, `xor.cl` efectivamente volvió y confirmó el problema del punto 5 en vivo — al recuperar el servicio, devolvió de golpe ~11 sismos atrasados (hasta 1.5 días de antigüedad), y como el código actual no filtra por antigüedad, se dispararon push notifications para todos los que calificaban por magnitud (≥4), incluyendo uno de hace más de un día. Confirma que el punto 5 no es un nice-to-have, es necesario incluso sin considerar el fallback de GAEL.

Decisiones de scope (de la conversación de brainstorming):
- Solo Chile (CSN) — no aplica a USGS, que ya viene funcionando sin interrupciones.
- `xor.cl` sigue siendo la fuente primaria; GAEL Cloud es respaldo, nunca al revés.
- La ubicación aproximada de GAEL se muestra como tal en la UI — no se presenta con la misma confianza que una coordenada real, dado que es una app de uso en contexto de seguridad.
- Fuera de alcance (explícitamente descartado en la conversación): sumar `evtdb.csn.uchile.cl` como fuente (es catálogo histórico revisado, no en vivo — queda anotado para cuando se retome el modelo predictivo, ver conversación previa sobre pronóstico regional); validar contra la base de datos los links de notificaciones push (se mencionó como hallazgo pero no fue aprobado, queda fuera).

## Fuente de respaldo: GAEL Cloud

`https://api.gael.cloud/general/public/sismos` — vivo, responde JSON con los últimos ~15 sismos de Chile a nivel nacional (sin filtro de fecha/región), actualizado con frecuencia similar a CSN. Forma de la respuesta:

```json
{
  "Fecha": "2026-08-16 15:08:08",       // hora local de Chile (America/Santiago), NO UTC
  "Profundidad": "228",
  "Magnitud": "3.7",
  "RefGeografica": "63 km al E de Socaire",
  "FechaUpdate": "2026-08-16T16:00:00.533Z"
}
```

**Corrección (2026-08-17, post-implementación):** la afirmación original de este spec ("UTC, confirmado cruzando con `FechaUpdate`") era incorrecta — se basaba en una inferencia indirecta sobre qué representa `FechaUpdate`, no en una comparación directa. La implementación cruzó `Fecha` de GAEL contra el campo `local_date` de la respuesta cruda de `xor.cl` (`CsnSismoRaw.local_date`, distinto de `utc_date`) para el mismo evento físico y confirmó una coincidencia exacta en múltiples eventos: **`Fecha` es hora local de Chile**, con cambio de horario (DST) incluido. El parseo (`packages/shared/src/normalize/gael.ts`) convierte explícitamente desde `America/Santiago` a UTC, no trata el string como UTC directamente.

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

`packages/db/src/queries/sismo.ts`: agregar `ubicacionAproximada` a `Sismo`, `toSismo()`, y a los `values`/`set` de `upsertSismo`. Nueva función `reemplazarConPrecision(externalIdAproximado: string, eventoPreciso: SismoNormalizado)`: mismo patrón que `replaceWithCsn`, con una diferencia — `replaceWithCsn` cambia `fuente` de `'usgs'` a `'csn'`; acá `fuente` ya es `'csn'` en ambos lados (el aproximado y el preciso son los dos CSN, solo cambia el transporte), así que el UPDATE es `WHERE fuente='csn' AND external_id=externalIdAproximado`, pisando `external_id` (pasa a ser el ID real de `xor.cl`), lat/lon/fecha/magnitud/lugar, y `ubicacionAproximada = false`.

## Backend — ingesta

**Reintentos** en `apps/ingestor/lib/fetch-csn.ts`: envolver el `fetch` en hasta 3 intentos con backoff corto (ej. 1s, 3s) antes de lanzar el error que hoy se captura en `runIngest`.

**`apps/ingestor/lib/fetch-gael.ts`** (nuevo): `fetchGaelRecent()` — GET a GAEL, parsea la respuesta. Por cada item, intenta `geocodificarAproximado(item.RefGeografica)`; si devuelve `null`, descarta ese evento (con un log). El ID sintético para el upsert (GAEL no trae uno estable) se genera determinísticamente a partir de `fecha + magnitud + RefGeografica` (mismo evento en dos polls sucesivos produce el mismo ID, evitando duplicados mientras `xor.cl` sigue caído).

**`packages/shared/src/normalize/gael.ts`** (nuevo): normaliza al mismo `SismoNormalizado` que `csn.ts`/`usgs.ts`, con `fuente: "csn"` (sigue siendo data del CSN, solo que vía otro transporte) y un campo adicional `ubicacionAproximada: true` que se propaga hasta el `upsertSismo`.

**`apps/ingestor/lib/ingest.ts`** — cambios en `runIngest()`:
1. Igual que hoy, intenta `fetchCsnRecent()` (ahora con reintentos incluidos).
2. Si falla (los reintentos se agotaron), intenta `fetchGaelRecent()` como respaldo, usando el mismo flujo de upsert + dedupe contra USGS que ya existe para CSN. Si GAEL también falla, se comporta igual que hoy cuando la única fuente falla: no hay datos de Chile en esta corrida, `summary.csn.errors` queda marcado, y se sigue con USGS. La alerta al admin (más abajo) sigue funcionando igual porque mide el tiempo desde la última fila **precisa** — si `xor.cl` está caído, el reloj corre aunque GAEL esté cubriendo el hueco; es intencional, seguimos queriendo saber que la fuente primaria necesita atención aunque el respaldo esté funcionando.
3. Cuando `fetchCsnRecent()` sí funciona, cada evento se revisa en este orden antes de decidir qué hacer: primero, ¿matchea (mismo `findDuplicate` de `packages/shared/src/dedupe.ts`, reutilizado tal cual) con una fila existente `fuente='csn'` y `ubicacionAproximada=true`? Si sí, es un evento que ya habíamos guardado vía GAEL — se llama `reemplazarConPrecision` y **no se envía push** (ese sismo ya se notificó cuando se guardó por primera vez, vía GAEL). Si no matchea ningún aproximado, sigue el flujo actual sin cambios (dedupe contra USGS, insertar si es realmente nuevo, push si corresponde).

**Tope de antigüedad para push** (`apps/ingestor/lib/send-push.ts`, dentro de `enviarPushParaSismo`): si `evento.fecha` tiene más de 60 minutos de antigüedad al momento de llamar la función, se retorna sin enviar nada (con un log). Este chequeo va en `enviarPushParaSismo` mismo, no en `ingest.ts`, para que valga también si en el futuro se agrega otro llamador — es la única fuente de verdad de "¿este sismo todavía es noticia?". Cubre tanto la ráfaga de atraso de `xor.cl` (como la que pasó hoy) como cualquier otra causa futura de un backlog (cron pausado, deploy caído, etc.), no solo el escenario de esta fuente puntual.

**Alerta al admin** — nueva tabla mínima `estado_ingesta` (`packages/db/src/schema.ts`):

```ts
export const estadoIngesta = pgTable("estado_ingesta", {
  fuente: text("fuente").primaryKey(), // "csn"
  ultimaAlertaEnviada: timestamp("ultima_alerta_enviada"),
});
```

Al final de cada `runIngest()`: se calcula el tiempo desde la última fila `fuente='csn'` con `ubicacionAproximada=false` (dato ya disponible en la tabla `sismos`, sin necesidad de trackear nada aparte). Si supera 2 horas **y** `ultimaAlertaEnviada` es `null` o tiene más de 2 horas, se dispara una notificación push a una suscripción "admin" y se actualiza `ultimaAlertaEnviada = now()` — así no se repite la alerta en cada corrida mientras siga caído, pero se vuelve a avisar si sigue caído mucho más tiempo después. Cuando `xor.cl` vuelve (aparece una fila nueva `ubicacionAproximada=false`), no hace falta resetear nada: el próximo cálculo del tiempo transcurrido ya da bajo el umbral solo.

- Variables de entorno nuevas (`ALERTA_PUSH_ENDPOINT`, `ALERTA_PUSH_P256DH`, `ALERTA_PUSH_AUTH`) con la suscripción push de Rodrigo. Paso manual al implementar: suscribirse normalmente desde la app una vez, después consultar `select endpoint, p256dh, auth from push_subscriptions order by created_at desc limit 1` en la base para obtener esos tres valores y copiarlos a Vercel.
- Reutiliza `webpush.sendNotification` (ya configurado en `send-push.ts`), con un mensaje tipo "CSN lleva Xh sin actualizar".

## Frontend — indicador de ubicación aproximada

- `Sismo`/`SismoMapa`/`SismoSeleccionado` (tipos en `apps/web/lib/tipos-sismo.ts` y afines): agregar `ubicacionAproximada: boolean`.
- `apps/web/components/mapa/marcador.ts`: cuando `ubicacionAproximada` es true, el marcador lleva un pequeño indicador visual (ej. borde punteado, ya usado en otras partes del mapa para "aproximado" — ver el círculo de percepción).
- `construirHtmlPopup` en `MapaSismos.tsx`: agrega una línea "📍 Ubicación aproximada" en el popup cuando corresponda.

## Testing

- Unit tests para `geocodificacion-aproximada.ts` (parseo de texto + cálculo de destino) con casos conocidos.
- Unit tests para `reemplazarConPrecision` (usando el mismo patrón de test que ya exista para `replaceWithCsn`, si lo hay).
- Unit test para el tope de antigüedad en `enviarPushParaSismo`: un evento con `fecha` de hace 2 horas no debe llamar `webpush.sendNotification`.
- Unit test para la reconciliación en `runIngest`: un evento `xor.cl` que matchea una fila `ubicacionAproximada=true` existente no debe disparar `enviarPushParaSismo`.
- Verificación manual en el navegador del indicador "ubicación aproximada" antes de mandar a producción.

## Fuera de alcance

- Modelo predictivo / catálogo histórico (conversación previa, queda pendiente).
- Validar los links de notificaciones push contra la base de datos.
- Cualquier fuente que no sea GAEL Cloud como respaldo (ChileAlerta requiere registro manual, evtdb tiene semanas de rezago).
