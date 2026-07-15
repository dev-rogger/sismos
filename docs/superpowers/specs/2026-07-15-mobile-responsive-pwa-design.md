# Mobile-responsive PWA polish — design

## Propósito

El usuario planea desplegar `apps/web` en Vercel y usarlo en su celular (instalado como PWA). El layout ya es mobile-first (stack vertical en mobile, sidebar en `lg:`, bottom sheet para el historial), pero faltan detalles críticos para que se sienta y funcione bien como app instalada en un teléfono real:

1. `manifest.json` tiene `icons: []` — sin esto, "Agregar a pantalla de inicio" no genera un ícono ni splash screen correctos.
2. No hay manejo de `env(safe-area-inset-*)` — el bottom sheet y el botón flotante pueden quedar tapados por el notch/home-indicator en iPhone.
3. Tap targets chicos — botones con `text-xs py-1.5` y marcadores de sismos de hasta 14px de diámetro son difíciles de tocar con precisión.

Fuera de alcance (descartado en brainstorming): breakpoints intermedios (`md:`) para tablets, y convertir el bottom sheet a gesto de arrastre — el usuario eligió "fixes críticos" solamente.

## Ícono PWA

Dirección visual aprobada: onda sísmica estilo sismograma, color `#f97316` (el mismo naranja que ya usa `colorPorMagnitud` para magnitud media, en `apps/web/lib/magnitud.ts`), sobre fondo circular `#0a0a0a` (mismo color que `background_color`/`theme_color` del manifest actual).

**Generación:** un SVG fuente se rasteriza a PNG con `sharp` (ya presente en el lockfile como dependencia transitiva de Next — se agrega temporalmente como devDependency de la raíz solo para correr el script de generación, y se remueve del `package.json` una vez generados los assets; los PNG resultantes quedan commiteados).

**Archivos generados:**
- `apps/web/public/icons/icon-192.png` (192×192, ícono estándar)
- `apps/web/public/icons/icon-512.png` (512×512, ícono estándar)
- `apps/web/public/icons/icon-maskable-512.png` (512×512, con ~20% de padding de zona segura alrededor del diseño, para `purpose: "maskable"` — evita que Android recorte el diseño con su máscara de forma)
- `apps/web/app/apple-icon.png` (180×180 — convención de Next.js App Router, se detecta automáticamente sin tocar `metadata`, no lleva fondo transparente)

**`apps/web/public/manifest.json`** — se actualiza el array `icons`:

```json
"icons": [
  { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

## Safe-area (notch / home indicator)

`apps/web/app/layout.tsx` — el export `viewport` agrega `viewportFit: "cover"` para que el contenido pueda extenderse bajo el notch y los `env(safe-area-inset-*)` tengan valores reales (sin esto, iOS los reporta como 0).

Padding con `env(safe-area-inset-*)` en:
- `apps/web/components/historial/PanelHistorial.tsx` — el contenedor del bottom sheet (clase `fixed inset-x-0 bottom-0`) suma `paddingBottom: env(safe-area-inset-bottom)` para que el drag-handle y el contenido no queden bajo el home-indicator.
- `apps/web/components/mapa/MapaSismos.tsx` — el botón flotante "Ver todo Chile" suma `paddingTop`/margen equivalente a `env(safe-area-inset-top)` en su posicionamiento, para no quedar bajo notch/isla dinámica.

Se implementa con `style={{ paddingBottom: "env(safe-area-inset-bottom)" }}` inline (Tailwind no tiene utilidades built-in para `env()` sin plugin adicional, y no se justifica agregar un plugin para dos usos).

## Tap targets

- Botones interactivos actualmente en `text-xs py-1.5` (ej. "Ver todo Chile" en `MapaSismos.tsx:202`, toggles de filtro en `PanelHistorial.tsx`) pasan a `min-h-11` (44px) manteniendo el `text-xs`/`text-sm` visual — el padding vertical crece, no el texto.
- Marcadores del mapa (`apps/web/components/mapa/marcador.ts`): el punto visual mantiene su tamaño actual por magnitud (14–36px, sin cambios en `tamanoPorMagnitud`). Se envuelve el elemento del marcador en un contenedor con `min-width`/`min-height` de 28px, centrado sobre el punto real (el punto se posiciona centrado dentro de esa área invisible más grande), ampliando el área táctil sin cambiar la lectura visual de magnitud ni aumentar el riesgo de solapamiento visual entre marcadores cercanos.

## Testing

Validación manual (no hay tests automatizados de UI en el proyecto):

- `manifest.json` válido y los 3 íconos cargan (`curl -I` a cada URL en `/icons/*` sirve 200)
- Lighthouse PWA audit (o Chrome DevTools > Application > Manifest) no marca "no maskable icon" ni "no icon"
- En un dispositivo/simulador con notch (o Chrome DevTools device toolbar con "iPhone 14 Pro"), el bottom sheet y el botón "Ver todo Chile" no quedan tapados por la barra de simulación del notch/home-indicator
- Botones táctiles miden ≥44px de alto en el inspector
- Los marcadores de magnitud baja (14px visual) responden al tap en un área ~28px sin necesitar precisión de píxel
