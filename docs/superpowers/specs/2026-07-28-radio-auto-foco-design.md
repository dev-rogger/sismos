# Radio geográfico para el auto-foco del mapa + ubicación del usuario visible

## Contexto

El foco automático en tiempo real (`docs/superpowers/specs/2026-07-27-foco-automatico-tiempo-real-design.md`) usa el `FiltroMapa` existente (Solo Chile / rango de magnitud / ventana de tiempo) como único criterio de "me interesa este evento" para decidir si un sismo nuevo dispara el `flyTo`+popup automático. Ese spec dejó explícitamente fuera de alcance un filtro de radio en km, "pendiente para después, mencionado por el usuario".

Por otro lado, `docs/superpowers/specs/2026-07-27-radio-notificaciones-design.md` (implementado, commit `a97ab0d`) ya agregó un concepto de radio + ubicación para las push notifications: `centro`/`radioKm` en `push_subscriptions`, capturados vía Geolocation API dentro de `SelectorRadioMapa.tsx`, un mini-mapa que sólo vive dentro de `ModalConfiguracion`. Ese `centro`/`radioKm` hoy es efímero en el cliente — sólo existe en el estado de `usePushNotifications` mientras dura la sesión donde se activó/actualizó, y no se muestra en ningún lado fuera de ese mini-mapa.

Este trabajo: (1) reusa ese mismo radio/ubicación para decidir qué sismos disparan el auto-foco del mapa, y (2) convierte la ubicación del usuario en un dato compartido, persistente y visible en el mapa principal, en vez de un detalle interno del flujo de push.

## Alcance

1. Nuevo hook `useUbicacionUsuario()` que centraliza `centro`/`radioKm`, persistidos en `localStorage` (mismo patrón que `useFiltroMapa`). Es la única fuente de verdad para "mi ubicación" en toda la app.
2. `SelectorRadioMapa` (Configuración) y un nuevo botón "📍 Mi ubicación" en el mapa principal usan ese mismo hook — la geolocalización se pide una sola vez, desde cualquiera de los dos lugares, y se reusa en el otro.
3. Botón "📍 Mi ubicación" en `MapaSismos.tsx`, junto a `BotonFiltroMapa` y "Ver todo Chile": sin ubicación conocida, pedirla y centrar el mapa al obtenerla; con ubicación ya conocida, simplemente recentra (patrón de botón de recentrado tipo Google Maps/Waze).
4. Marcador "estás aquí" en el mapa principal una vez que hay `centro` (independiente de si hay `radioKm` configurado) — solo el punto, sin dibujar el círculo del radio permanentemente (para no competir visualmente con los marcadores de sismos).
5. El auto-foco (polling en `MapaSismos.tsx`) agrega distancia como criterio adicional (AND) sobre el `pasaFiltro` existente: si `radioKm` no es `null`, un sismo nuevo solo dispara `flyTo`+popup si además está dentro de ese radio del `centro` guardado.

Fuera de alcance: radio independiente para auto-foco distinto al de push (se usa el mismo valor para ambos); ajustar el radio desde el mapa principal (el slider sigue viviendo solo en Configuración); dibujar el círculo del radio en el mapa principal; elegir un punto distinto a la ubicación real del dispositivo.

## Diseño

### Estado compartido (`apps/web/lib/use-ubicacion-usuario.ts`, nuevo)

```ts
interface UbicacionUsuario {
  centro: { lat: number; lon: number } | null;
  radioKm: number | null; // null = mundial / sin radio configurado
}
```

Mismo patrón que `use-filtro-mapa.ts`: se lee de `localStorage` (clave `sismos:ubicacion`) al montar, se persiste en cada cambio. Expone:

- `ubicacion: UbicacionUsuario`
- `pedirUbicacion(): Promise<{ lat: number; lon: number } | null>` — llama `navigator.geolocation.getCurrentPosition`, guarda `centro` en el hook/localStorage si tiene éxito, devuelve `null` si falla o no hay soporte (mismo manejo de error silencioso que ya usa `SelectorRadioMapa` hoy).
- `setRadioKm(radioKm: number | null)`.

`SelectorRadioMapa.tsx` deja de manejar su propio `centroRef`/geolocalización interna: recibe `centro` desde este hook (vía props o usándolo directo) y solo dibuja el mini-mapa + círculo con lo que ya tiene. `usePushNotifications.activar`/`actualizarUmbral` dejan de recibir `centro`/`radioKm` como parámetros externos capturados ad-hoc — los toman de `useUbicacionUsuario()` en el componente que los llama (`ModalConfiguracion`).

### Botón y marcador en el mapa (`MapaSismos.tsx`)

Se agrega al grupo de botones flotantes existente (mismo estilo visual que "Ver todo Chile"):

```tsx
<button
  type="button"
  onClick={async () => {
    if (ubicacion.centro) {
      mapRef.current?.flyTo({ center: [ubicacion.centro.lon, ubicacion.centro.lat], zoom: 10 });
      return;
    }
    const centro = await pedirUbicacion();
    if (centro) mapRef.current?.flyTo({ center: [centro.lon, centro.lat], zoom: 10 });
  }}
>
  📍 Mi ubicación
</button>
```

El marcador "estás aquí" se agrega/actualiza en un `useEffect` que reacciona a `ubicacion.centro`: un `maplibregl.Marker` simple con un elemento de color distinto al de los sismos (p. ej. círculo sólido `sky-500`, sin la animación de pulso que usan los sismos), sin capa de círculo asociada.

### Filtro de radio en el auto-foco

Dentro del callback de polling (`MapaSismos.tsx`, junto a la línea donde hoy se calcula `nuevosQuePasanFiltro`):

```ts
const nuevosQuePasanFiltro = data.sismos.filter((s) => {
  if (!pasaFiltro(s, filtroRef.current)) return false;
  const { centro, radioKm } = ubicacionRef.current;
  if (radioKm === null || centro === null) return true; // mundial, sin cambio de comportamiento
  return distanciaKm(centro.lat, centro.lon, s.latitud, s.longitud) <= radioKm;
});
```

Se agrega un `ubicacionRef` (mismo patrón que `filtroRef`) para que el closure del `setInterval` vea siempre el valor actual sin recrear el intervalo. Reusa `distanciaKm` de `packages/shared` (ya existe, agregada para el filtro de push).

### Qué NO cambia

- El slider de radio (25–1000 km) y el toggle "Mundial, sin rango" siguen viviendo solo en `ModalConfiguracion` — no se duplican en el mapa principal.
- El círculo del radio (relleno + borde) sigue dibujándose solo en el mini-mapa de Configuración, no en el mapa principal.
- El filtro de push notifications (`findSubscripcionesParaSismo` en el ingestor) no cambia — sigue leyendo `centro`/`radioKm` desde `push_subscriptions` en la base, sin relación directa con este hook del cliente (que solo alimenta lo que se envía al guardar la suscripción, igual que hoy).
- El `FiltroMapa` (Solo Chile / magnitud / ventana) no cambia de forma; el radio se suma como criterio adicional, no lo reemplaza.

## Testing / verificación

- Denegar el permiso de geolocalización al tocar "📍 Mi ubicación" → no rompe nada, sin marcador, botón queda operable para reintentar.
- Conceder el permiso → aparece el marcador "estás aquí", el mapa vuela ahí; tocar el botón de nuevo solo recentra (sin volver a pedir permiso).
- Recargar la página con ubicación ya guardada en `localStorage` → el marcador aparece solo al cargar, sin pedir permiso de nuevo.
- Configurar un radio chico en Configuración con un sismo de prueba fuera de ese radio pero con magnitud suficiente para pasar el `FiltroMapa` → el auto-foco NO se dispara (el sismo se agrega igual a marcadores/historial, solo sin `flyTo`+popup automático). Con un sismo dentro del radio → sí se dispara.
- Modo "Mundial, sin rango" (o ubicación nunca configurada) → el auto-foco se comporta exactamente igual que antes de este cambio.
