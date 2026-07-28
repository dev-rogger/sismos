# Foco automático en tiempo real sobre nuevos sismos

## Contexto

`MapaSismos.tsx` ya hace polling cada 30s a `/api/sismos?since=...` para detectar sismos nuevos, y ya marca esos eventos como "pulsando" (animación de onda expansiva vía `.marcador-sismo--pulso`) cuando crea su marcador. Lo que falta: nada guía la atención del usuario hacia ese evento nuevo — hay que notar el marcador pulsando por cuenta propia y tocarlo. La selección manual (clic en marcador o en el historial) ya dispara todo lo necesario para "ver la info": `flyTo` + popup con lugar/región/magnitud/fecha (recién rediseñado). Este trabajo consiste en disparar ESA MISMA selección automáticamente cuando llega un sismo nuevo, no en construir un mecanismo nuevo de visualización.

## Alcance

1. Bajar el intervalo de polling de 30s a 15s.
2. Cuando el polling detecta sismo(s) nuevo(s) que pasan el filtro actual del mapa (`FiltroMapa`), seleccionar automáticamente uno (el de mayor magnitud si hay varios) usando el mismo callback que ya usa la selección manual.
3. Si el historial en pantalla completa (mobile) está abierto, se cierra para mostrar el mapa.

Fuera de alcance (pendiente para después, mencionado por el usuario): filtro de radio en km para decidir qué sismos disparan la interrupción — hoy se usa el `FiltroMapa` existente (Solo Chile / rango de magnitud / ventana de tiempo) como criterio de "me interesa este evento".

## Diseño

### Selección automática (`MapaSismos.tsx`)

Dentro del callback del `setInterval` de polling, después de mergear `data.sismos` en `todosSismosRef` y antes/después de `sincronizarMarcadores`:

```ts
const nuevosQuePasanFiltro = data.sismos.filter((s) => pasaFiltro(s, filtroRef.current));
if (nuevosQuePasanFiltro.length > 0) {
  const masSignificativo = nuevosQuePasanFiltro.reduce((a, b) =>
    b.magnitud > a.magnitud ? b : a,
  );
  onSeleccionarDesdeMapaRef.current({
    externalId: masSignificativo.externalId,
    latitud: masSignificativo.latitud,
    longitud: masSignificativo.longitud,
    magnitud: masSignificativo.magnitud,
    lugar: masSignificativo.lugar,
    fecha: masSignificativo.fecha,
    bandera: masSignificativo.bandera,
  });
}
```

Reutiliza `pasaFiltro` (ya existe) y `onSeleccionarDesdeMapaRef` (ya existe, mismo patrón que usan los marcadores al hacer clic). No se toca el efecto de selección (`flyTo` + popup) — ya reacciona a cambios en `sismoSeleccionado` sin importar el origen.

### Cerrar el historial en pantalla completa al interrumpir

`MapaConHistorial.tsx` pasa `setSismoSeleccionado` directo como `onSeleccionarDesdeMapa` hoy. Se cambia a un wrapper chico que también cierra `historialAbierto`:

```ts
const seleccionarDesdeMapa = (sismo: SismoSeleccionado | null) => {
  setSismoSeleccionado(sismo);
  setHistorialAbierto(false);
};
```

Es seguro incondicionalmente: `onSeleccionarDesdeMapa` solo puede dispararse desde un clic directo en el mapa (imposible si el historial fullscreen ya lo está tapando) o desde esta nueva selección automática — en ambos casos cerrar el historial es el comportamiento correcto.

### Qué NO cambia

- El popup, el `flyTo`, y la animación de pulso del marcador ya existen y no se tocan — la selección automática los dispara "gratis" al reutilizar el mismo flujo que la selección manual.
- El historial (lista) no se refresca en vivo con el evento nuevo — sigue mostrando lo que trajo su último fetch. Fuera de alcance para este cambio; el usuario pidió específicamente el comportamiento del mapa.
- Las notificaciones push (pipeline de `apps/ingestor`) no cambian — esto es un mecanismo puramente client-side, independiente, para cuando la app ya está abierta en primer plano.

## Testing / verificación

Sin datos reales en tiempo real disponibles para una prueba end-to-end perfecta, se verifica simulando: insertar manualmente un sismo nuevo en la base local (vía script de ingest) mientras la app está abierta, y confirmar que dentro del siguiente ciclo de poll (≤15s) el mapa vuela solo, aparece el popup correcto, y si el historial fullscreen estaba abierto se cierra.
