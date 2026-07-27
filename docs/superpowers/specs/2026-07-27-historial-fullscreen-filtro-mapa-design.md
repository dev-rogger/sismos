# Historial en pantalla completa + filtro de mapa persistente

## Contexto

El panel de historial en mobile era un bottom sheet arrastrable (`PanelHistorial.tsx`). Después de arreglar varios bugs de arrastre (composición `transform`/`translate` de Tailwind v4), sigue teniendo un problema de interacción: si el panel está expandido y se abre otro panel (el drawer del menú, un modal), el historial no se cierra — queda "atascado" abierto detrás. En vez de seguir parcheando ese mecanismo, se reemplaza por completo en mobile.

Además, el botón de engranaje que abría "Configuración" (Solo Chile + magnitud mínima) se movió al menú lateral en una iteración anterior, dejando el filtrado del mapa enterrado dos niveles de navegación. Se pide traerlo de vuelta como acceso directo en el mapa, y ampliarlo con más dimensiones de filtro (rangos de magnitud, ventana de tiempo), con persistencia entre sesiones.

## Alcance

1. Historial en mobile pasa de bottom sheet a pantalla completa. Desktop no cambia (sigue como panel lateral fijo).
2. Nuevo botón de filtro en el mapa (reemplaza el espacio donde estaba el engranaje), con Solo Chile + magnitud por rangos + ventana de tiempo, persistido en `localStorage`.
3. El historial obtiene su propio filtro (Solo Chile + magnitud), con estado independiente del filtro del mapa — no se comparten, no se persiste el del historial.
4. El menú lateral (`MenuLateral.tsx`) queda con dos ítems: Historial y Notificaciones. Se quita "Configuración".

Fuera de alcance: cambiar el comportamiento en desktop, agregar nuevas fuentes de datos, cambiar la cadencia de polling del mapa, tocar el pipeline de notificaciones (ya resuelto en trabajo previo).

## Arquitectura

### Componentes nuevos

- **`components/historial/PantallaHistorial.tsx`** (mobile): pantalla completa (`fixed inset-0 z-40`, sin transform/drag). Header con botón atrás + selector de tipo (reutiliza las mismas opciones: Últimos 10 días / Top 10 últimos 10 años / Histórico). Debajo, sus propios controles de filtro (Solo Chile + magnitud por rangos, ver "Filtro compartido" abajo) y la lista de eventos. Reemplaza el rol de `PanelHistorial.tsx` en mobile.
- **`components/mapa/BotonFiltroMapa.tsx`**: botón en el cluster superior derecho del mapa (mismo lugar/estilo donde vivía `BotonConfiguracion`, junto a "Ver todo Chile"). Abre `ModalFiltroMapa`.
- **`components/mapa/ModalFiltroMapa.tsx`**: modal centrado (mismo patrón visual que los modales existentes) con Solo Chile, magnitud por rangos, ventana de tiempo.
- **`components/filtro/SelectorMagnitudRangos.tsx`**: control reutilizable de selección múltiple de rangos de magnitud (chips/checkboxes), usado tanto por `ModalFiltroMapa` (mapa) como por `PantallaHistorial` (historial), ya que ambos necesitan la misma UI aunque con estado independiente. Recibe `seleccionados` y `onChange` como props — no sabe nada de dónde vive el estado.
- **`lib/use-filtro-mapa.ts`**: hook que encapsula estado del filtro del mapa + sincronización con `localStorage`. Única pieza con conocimiento de la clave de storage y el shape persistido.

### Componentes que cambian

- **`components/historial/PanelHistorial.tsx`**: se elimina en mobile. En desktop (`lg:`) se simplifica — ya no necesita ninguna de las mecánicas de arrastre/expandido (`arrastreTranslateY`, `infoArrastreRef`, pointer handlers, etc.), porque en desktop siempre estuvo visible como columna estática. Se convierte en un componente puramente de "columna con lista", compartiendo la lógica de fetch/filtrado con `PantallaHistorial` mobile a través de un hook común (ver abajo) para no duplicar el `useEffect` de fetch.
- **`components/menu/MenuLateral.tsx`**: se quita el ítem "Configuración" (el pinneado abajo) y su icono de engranaje. Queda con Historial y Notificaciones como ítems normales, sin sección separada abajo.
- **`components/mapa/MapaSismos.tsx`**: `pasaFiltro()` cambia de `(soloChile: boolean, magnitudMinima: number)` a recibir el objeto `FiltroMapa` completo (agrega chequeo de ventana de tiempo contra `sismo.fecha`). Se agrega `<BotonFiltroMapa />` en el cluster de controles, en el lugar donde antes iba `<BotonConfiguracion />`.
- **`components/MapaConHistorial.tsx`**: dejar de pasar `soloChile`/`magnitudMinima` como estado propio — ahora viene de `useFiltroMapa()`. Se agrega el estado `historialAbierto` (reemplaza a `historialExpandido`) y se quita `configuracionAbierta` + el render de `ModalFiltros` viejo (se borra ese archivo, reemplazado por `ModalFiltroMapa`).
- **`components/configuracion/ModalFiltros.tsx`**: se elimina (su contenido se reparte entre `ModalFiltroMapa` y el filtro propio de `PantallaHistorial`).

### Lógica compartida de historial: `lib/use-historial.ts`

Para no duplicar el fetch (`/api/historial?tipo=...`) y el filtrado entre `PantallaHistorial` (mobile) y el `PanelHistorial` simplificado (desktop), se extrae un hook `useHistorial()` que maneja: estado de `tipo`, fetch con cleanup de carrera, y filtrado por el estado de filtro que reciba (Solo Chile + magnitud, propio de cada uno). Cada componente (`PantallaHistorial`, `PanelHistorial` desktop) mantiene su propio estado de filtro local y se lo pasa al hook — así se cumple "estado independiente, misma lógica".

## Modelo de datos del filtro

```ts
type RangoMagnitud = "leve" | "moderado" | "fuerte"; // leve: M2–3.9, moderado: M4–5.9, fuerte: M6+
type VentanaTiempo = "6h" | "24h" | "3d" | "5d" | "10d"; // 10d = todo lo cargado (sin restricción adicional)

interface FiltroMapa {
  soloChile: boolean;
  rangos: Set<RangoMagnitud>; // default: {"moderado", "fuerte"} (~M4+, similar al default actual de M5)
  ventana: VentanaTiempo; // default: "10d" (sin restricción, igual que el comportamiento actual)
}
```

El filtro del historial reutiliza `soloChile: boolean` + `rangos: Set<RangoMagnitud>` (sin `ventana`, no aplica ahí), con su propio default (todos los rangos seleccionados, `soloChile: false` — mostrar todo, sin restricción, ya que el historial es para explorar el archivo completo).

## Persistencia

`useFiltroMapa()` lee de `localStorage["sismos:filtro-mapa"]` en el primer render (guardado detrás de un check de `typeof window !== "undefined"` para SSR) y escribe en cada cambio. Si no hay nada guardado o el JSON es inválido/de un shape viejo, usa los defaults — no se rompe la app por un valor corrupto o de una versión anterior del shape.

## Manejo de errores

- `localStorage` puede fallar (Safari en modo privado, cuota excedida): el hook envuelve lectura/escritura en try/catch y sigue funcionando en memoria si falla, sin romper la UI.
- Filtrado client-side puro (nada de red nueva), así que no hay estados de carga/error adicionales que manejar más allá de los que ya existen para el fetch del historial.

## Testing / verificación

No hay framework de tests en el repo (confirmado en trabajo previo). Verificación manual en navegador (Chrome DevTools + viewport mobile forzado, dado que el redimensionado de ventana no afecta el viewport real en este entorno) cubriendo:
- Abrir historial pantalla completa, seleccionar un sismo → cierra y el mapa muestra el marcador correcto.
- Volver a abrir historial vía menú → funciona sin estado colgado.
- Cambiar filtro de mapa (cada dimensión) → marcadores se actualizan.
- Cerrar la app (recargar) → filtro de mapa persiste; filtro de historial NO persiste (vuelve a default).
- Confirmar que abrir el drawer o un modal mientras el historial está abierto no dejan estados encimados (ya no debería ser posible que ambos estén "abiertos" a la vez, al ser pantalla completa con su propio botón atrás).
- Desktop: confirmar que el layout de columna fija sigue funcionando igual que antes.
