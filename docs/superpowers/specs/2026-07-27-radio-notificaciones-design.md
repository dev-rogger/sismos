# Radio geográfico para notificaciones push

## Contexto

Hoy una suscripción push solo filtra por magnitud mínima (`magnitudMinima`, en `push_subscriptions`). El usuario quiere poder acotar además por distancia: "avisame solo de sismos a menos de X km de donde estoy", con la opción de dejarlo en "Mundial" (sin restricción de distancia, el comportamiento actual). La UI debe sentirse como ajustar un círculo sobre un mapa, no un número suelto en un input.

## Alcance

1. Nueva columna `radio_km` (nullable) + `centro_lat`/`centro_lon` (nullable) en `push_subscriptions`. `radio_km IS NULL` = mundial, sin restricción (compatible con todas las suscripciones existentes sin tocar sus filas).
2. El centro es la ubicación del dispositivo (Geolocation API del navegador), no un punto elegible a mano.
3. UI nueva dentro de `ModalConfiguracion`: mini-mapa centrado en la ubicación del usuario con un círculo semitransparente que representa el radio actual, slider de 25 km a 1000 km (default 200 km) debajo, y un toggle "Mundial, sin rango" que desactiva el mini-mapa/slider.
4. Si no hay permiso o soporte de geolocalización, cae a "Mundial" automáticamente con un aviso explicando por qué.
5. El ingestor filtra por magnitud Y (si `radio_km` no es nulo) por distancia — ambos criterios aplican juntos (AND).

Fuera de alcance: elegir un punto distinto a la ubicación actual, guardar múltiples ubicaciones/reglas, notificaciones basadas en más de un círculo.

## Diseño

### Esquema (`packages/db`)

```ts
// schema.ts — push_subscriptions
centroLat: real("centro_lat"),   // nullable
centroLon: real("centro_lon"),   // nullable
radioKm: real("radio_km"),       // nullable; NULL = mundial
```

Migración generada con `drizzle-kit generate` (columnas nuevas, todas nullable — no requiere backfill ni rompe filas existentes).

`upsertPushSubscription` acepta `centro: { lat: number; lon: number } | null` y `radioKm: number | null` opcionales junto a lo que ya recibe.

### Distancia geográfica (`packages/shared`)

Nueva función `distanciaKm(lat1, lon1, lat2, lon2): number` con la fórmula de Haversine — vive junto a `regionChilePorLatitud` en `packages/shared`, ya que es el paquete de utilidades geográficas compartidas entre `apps/web` y `apps/ingestor`.

### Filtro del ingestor (`packages/db` + `apps/ingestor`)

`findSubscripcionesParaMagnitud(magnitud)` pasa a `findSubscripcionesParaSismo(evento: { magnitud, latitud, longitud })`:

```ts
export async function findSubscripcionesParaSismo(
  evento: { magnitud: number; latitud: number; longitud: number },
): Promise<PushSubscription[]> {
  const candidatas = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(lte(pushSubscriptions.magnitudMinima, evento.magnitud));

  return candidatas
    .map(toPushSubscription)
    .filter((sub) => {
      if (sub.radioKm === null) return true; // mundial
      if (sub.centroLat === null || sub.centroLon === null) return true; // dato incompleto, no filtramos por distancia
      return (
        distanciaKm(sub.centroLat, sub.centroLon, evento.latitud, evento.longitud) <=
        sub.radioKm
      );
    });
}
```

El filtro de distancia se hace en JS después de la consulta SQL (no en la query): la cantidad de suscripciones es chica, y evita escribir Haversine en SQL crudo por una optimización que no hace falta.

### UI (`apps/web`)

**`components/configuracion/SelectorRadioMapa.tsx`** (nuevo): mini-mapa MapLibre (mismo estilo oscuro que el mapa principal), sin controles de navegación (no interactivo más que mostrar el círculo), centrado vía Geolocation API. El círculo se dibuja como un layer `fill` + `line` sobre un GeoJSON `Polygon` generado a mano (función `circuloGeografico(centro, radioKm, puntos=64)`, trigonometría simple de "punto de destino" a distancia/rumbo — sin agregar turf ni otra librería). Recibe `radioKm` y se re-renderiza el polígono cuando cambia, sin recrear el mapa.

Props: `radioKm: number`, `onUbicacionLista: (centro: {lat, lon} | null) => void` (informa al padre si la geolocalización funcionó o no, para decidir si mostrar el fallback a "Mundial").

**`ModalConfiguracion.tsx`**: agrega, debajo del umbral de magnitud (solo si `suscrito`):
- Toggle "🌎 Mundial, sin rango" (mismo estilo visual que "Solo Chile" en otros filtros de la app — botón con estado activo/inactivo).
- Si no está en modo mundial: `SelectorRadioMapa` + slider de radio (25–1000 km) + texto "Avisar hasta a {radioKm} km de tu ubicación".
- Si la geolocalización falla/se niega: fuerza modo mundial y muestra `"No pudimos acceder a tu ubicación, así que las notificaciones quedan sin límite de distancia."`.
- El botón "Guardar" existente pasa a incluir `radioKm` (o `null` si es mundial) y el centro capturado.

**`lib/use-push-notifications.ts`**: `activar`/`actualizarUmbral` reciben además `{ radioKm: number | null; centro: {lat, lon} | null }` y lo mandan en el body de `/api/push/subscribe`.

**`app/api/push/subscribe/route.ts`**: valida y persiste los campos nuevos (todos opcionales; si vienen ausentes, se guardan como `null` = mundial, compatible con clientes viejos).

### Estilo visual

Paleta y proporciones consistentes con el resto de la app (fondo `neutral-900`, acento `sky-500`): el círculo se pinta con relleno `sky-500` a baja opacidad y borde `sky-500` sólido, sobre el mismo estilo de mapa oscuro (`ESTILO_URL`) que ya usa `MapaSismos`. El mini-mapa no lleva atribución/controles de zoom visibles (versión "de solo lectura", enfocada en mostrar el círculo, no en navegar).

## Testing / verificación

- Migración aplicada contra Postgres local; confirmar que filas existentes quedan con `radio_km = NULL` (mundial, sin cambio de comportamiento).
- Insertar una suscripción de prueba con centro + radio chico, y un sismo de prueba fuera de ese radio pero con magnitud suficiente → confirmar que `findSubscripcionesParaSismo` la excluye. Con un sismo dentro del radio → la incluye.
- Verificar en el navegador: denegar permiso de geolocalización → cae a mundial con el aviso; aceptar permiso → el círculo se dibuja y el slider lo redibuja en vivo.
