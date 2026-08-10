# Fix: la ubicación del usuario queda "pegada" a un lugar viejo — design

## Contexto / bug

Reporte: "estuve en Santiago Centro y mi ubicación seguía siendo mi casa". El pedido es explícito: activar la ubicación debe decir dónde está el dispositivo *ahora*, no reusar un lugar guardado.

Causa raíz (confirmada leyendo el código, no solo el síntoma): `useUbicacionUsuario().pedirUbicacion()` (`apps/web/lib/use-ubicacion-usuario.ts:53-74`) sí consulta `navigator.geolocation.getCurrentPosition` correctamente, pero **solo se invoca la primera vez**. Los dos puntos de entrada tienen un guard que salta la consulta si ya existe una ubicación guardada:

- `apps/web/components/mapa/MapaSismos.tsx:582` — el botón "📍 Mi ubicación": `if (ubicacion.centro) { flyTo(cached); return; }`, nunca vuelve a pedir la posición si ya hay una guardada.
- `apps/web/components/configuracion/ModalConfiguracion.tsx:103-125` — el `useEffect` que pide ubicación al abrir el modal se salta por completo si `ubicacion.centro` ya es verdadero.

Como `ubicacion.centro` se persiste en `localStorage` (`apps/web/lib/use-ubicacion-usuario.ts:6`, clave `sismos:ubicacion`), una vez capturada una posición queda fija para siempre — el dispositivo puede moverse cientos de kilómetros y la app nunca vuelve a preguntar.

Esto fue intencional en el spec anterior (`docs/superpowers/specs/2026-07-28-radio-auto-foco-design.md`) para evitar volver a pedir el *permiso* del navegador en cada carga — pero confló "no repetir el diálogo de permiso" con "no volver a leer la posición", que son cosas distintas: una vez que el permiso está en `"granted"`, `getCurrentPosition()` no vuelve a mostrar ningún diálogo, solo devuelve la posición actual en silencio.

## Alcance

1. Cada acción explícita del usuario (tocar "📍 Mi ubicación", o abrir Configuración sin modo "Mundial") dispara una lectura fresca de `getCurrentPosition`, en vez de reusar el `centro` cacheado indefinidamente.
2. El valor persistido en `localStorage` pasa a ser solo "última ubicación conocida" — útil para mostrar el marcador/mini-mapa al instante mientras llega la lectura nueva, pero se sobreescribe en cuanto esa lectura resuelve.
3. `enableHighAccuracy` pasa de `false` a `true` — fuerza una lectura GPS en vez de una posición aproximada por red/Wi-Fi, más precisa para "dónde estoy ahora mismo".

Fuera de alcance: cambiar el comportamiento de `radioKm`/`centro` para las notificaciones push (feature separada, ya diseñada en `docs/superpowers/specs/2026-07-27-radio-notificaciones-design.md`); agregar un botón de "refrescar ubicación" nuevo — la lectura fresca pasa a ser el comportamiento normal de las acciones que ya existen.

## Diseño

### `apps/web/lib/use-ubicacion-usuario.ts`

`pedirUbicacion` cambia `enableHighAccuracy: false` → `true`. Sin otros cambios en la función — ya hace lo correcto (consulta y actualiza `centro`), el problema está en quién la llama.

```ts
navigator.geolocation.getCurrentPosition(
  (posicion) => { /* sin cambios */ },
  () => resolve(null),
  { enableHighAccuracy: true, timeout: 8000 },
);
```

### `apps/web/components/mapa/MapaSismos.tsx` — botón "📍 Mi ubicación"

Antes: si `ubicacion.centro` existe, solo hace `flyTo` al punto cacheado, sin volver a consultar el GPS. Después: siempre llama a `pedirUbicacion()` al tocar el botón; el `centro` cacheado deja de ser un atajo que evita la consulta.

```tsx
onClick={async () => {
  const centro = await pedirUbicacion();
  if (centro) {
    mapRef.current?.flyTo({ center: [centro.lon, centro.lat], zoom: 10 });
  } else if (ubicacion.centro) {
    // fallback: la lectura fresca falló (denegado/timeout), usar la última conocida
    mapRef.current?.flyTo({ center: [ubicacion.centro.lon, ubicacion.centro.lat], zoom: 10 });
  }
}}
```

El marcador "estás aquí" (líneas 320-335) no cambia — sigue reaccionando a `ubicacion.centro` vía `useEffect`, y ahora se actualiza solo porque `pedirUbicacion()` escribe en ese mismo estado cada vez que se llama.

### `apps/web/components/configuracion/ModalConfiguracion.tsx`

El `useEffect` que pide ubicación (líneas 103-125) deja de incluir `ubicacion.centro` en la condición de salto — solo se salta si el modal está cerrado, el modo es "Mundial", ya se está pidiendo, o ya falló en esta sesión:

```ts
useEffect(() => {
  if (!abierto || mundialLocal || pidiendoUbicacion || ubicacionFallo) {
    return;
  }
  setPidiendoUbicacion(true);
  onPedirUbicacion().then((centro) => {
    setPidiendoUbicacion(false);
    setUbicacionFallo(centro === null);
  });
}, [abierto, mundialLocal, pidiendoUbicacion, ubicacionFallo, onPedirUbicacion]);
```

Mientras la lectura fresca está en curso, la UI puede seguir mostrando el mini-mapa con la última posición conocida (`ubicacion.centro`, si existe) en vez del estado "Buscando tu ubicación…", para no parpadear a vacío en cada apertura — se actualiza en cuanto la lectura nueva resuelve.

### Por qué no rompe "no pedir permiso de nuevo"

El permiso del navegador (`Notification`/`Geolocation` permission state) es independiente de si se llama a `getCurrentPosition()` una o cien veces: una vez `"granted"`, cada llamada devuelve la posición sin mostrar ningún diálogo. El requisito del spec anterior ("no pedir permiso de nuevo") sigue cumplido — lo que cambia es que ahora sí se vuelve a *leer la posición*, que es justamente lo que faltaba.

## Testing / verificación

- Con permiso ya concedido y una ubicación vieja guardada en `localStorage`: mover el dispositivo (o simular otras coordenadas vía devtools) y tocar "📍 Mi ubicación" → el mapa vuela a la posición nueva, no a la vieja.
- Abrir Configuración (sin modo "Mundial") con una ubicación vieja guardada → se dispara una lectura fresca al abrir, sin mostrar ningún diálogo de permiso (ya estaba concedido).
- Denegar el permiso (o simular timeout) al tocar "📍 Mi ubicación" con una ubicación vieja ya guardada → usa el fallback a la última conocida en vez de no hacer nada.
- Primera vez, sin ubicación guardada ni permiso: comportamiento sin cambios (pide permiso, si se concede obtiene y guarda la posición).
- Confirmar visualmente que la precisión mejora con `enableHighAccuracy: true` (coordenadas más cercanas a la posición real reportada por el dispositivo).
