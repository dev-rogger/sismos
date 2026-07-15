# Push notifications — design

## Propósito

Agregar notificaciones push para sismos chilenos (CSN) de magnitud significativa, con un botón de configuración en el mapa que abre un modal para activar/desactivar y elegir el umbral de magnitud. Referencia de patrón: implementación existente en `/Users/rodrigoguerrero/Sites/kick-flow` (`usePushNotifications`, `/api/push/subscribe`, `web-push`), adaptada a que sismos no tiene sistema de usuarios (suscripciones anónimas, sin `userId`).

Decisiones de scope (de la conversación de brainstorming):
- Alcance geográfico: **solo Chile (CSN)** — sismos USGS/mundo no disparan push, por ahora ("es una app gratuita").
- Umbral: **configurable por suscripción**, rango 4–7, default M4 — el piso global es M4 (no se puede bajar de ahí).
- Ubicación del botón: junto a "Ver todo Chile" en `MapaSismos.tsx`.
- VAPID keys: generadas ahora, guardadas en `.env.local` (gitignored) de ambas apps, más un archivo `vercel-env-push.txt` en la raíz (gitignored) listo para copiar a Vercel.

## Modelo de datos

Nuevo modelo en `packages/db`, mismo patrón que `models/sismo.ts` + `queries/sismo.ts`:

**`packages/db/src/models/push-subscription.ts`**:
```ts
{
  endpoint: string;        // unique, identifica la suscripción del navegador
  keys: {
    p256dh: string;
    auth: string;
  };
  magnitudMinima: number;  // 4-7, default 4
}
```
Sin `userId` — la app no tiene autenticación, las suscripciones son anónimas por dispositivo/navegador.

**`packages/db/src/queries/push-subscription.ts`**:
- `upsertPushSubscription({ endpoint, keys, magnitudMinima })` — upsert por `endpoint`
- `deletePushSubscription(endpoint)` — elimina por `endpoint`
- `findSubscripcionesParaMagnitud(magnitud)` — devuelve suscripciones con `magnitudMinima <= magnitud`

Exportado desde `packages/db/src/index.ts` igual que los módulos existentes.

## Backend — API de suscripción

**`apps/web/app/api/push/subscribe/route.ts`**:
- `POST` — body `{ subscription: PushSubscriptionJSON, magnitudMinima: number }` → `upsertPushSubscription`. Rechaza si `magnitudMinima` no está en `[4,7]`.
- `DELETE` — body `{ endpoint: string }` → `deletePushSubscription`.

## Backend — disparo de notificaciones

`apps/ingestor/lib/ingest.ts` ya inserta sismos CSN nuevos en el loop de la línea 59-69 (`upsertSismo(evento)` cuando no hay duplicado con USGS). Se agrega, para cada `evento` CSN insertado con `evento.magnitud >= 4`, una llamada a `enviarPushParaSismo(evento)`.

**`apps/ingestor/lib/send-push.ts`** (nuevo, patrón equivalente a `sendPushToUsers` de kick-flow pero sin `userId`):
```ts
export async function enviarPushParaSismo(evento: SismoNormalizado): Promise<void> {
  // 1. configura VAPID (lazy, una sola vez por proceso)
  // 2. findSubscripcionesParaMagnitud(evento.magnitud)
  // 3. Promise.allSettled sobre webpush.sendNotification(sub, JSON.stringify({
  //      title: `Sismo M${evento.magnitud} en ${evento.lugar}`,
  //      body: new Date(evento.fecha).toLocaleString("es-CL"),
  //      url: "/",
  //    }))
  // 4. si un resultado falla con statusCode 410, deletePushSubscription(endpoint) de esa suscripción
}
```
Se llama de forma fire-and-forget (no debe bloquear ni fallar el ingest si el envío de push falla) — errores se loguean con `console.error`, igual que el resto de `ingest.ts`.

`apps/ingestor` agrega dependencias: `web-push` (runtime), `@types/web-push` (dev).

## Frontend — Service Worker

`apps/web/app/sw.ts` agrega, junto al `serwist.addEventListeners()` existente (Serwist no maneja push por sí solo, ambos coexisten sin conflicto):

```ts
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Sismos", {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

Reutiliza los íconos PWA ya generados (`icon-192.png`) — sin assets nuevos.

## Frontend — hook de suscripción

**`apps/web/lib/use-push-notifications.ts`** — único punto de la lógica de suscripción (a diferencia de kick-flow, donde estaba duplicada en 3 componentes). Expone:
```ts
{
  permission: "granted" | "denied" | "default" | "unsupported";
  suscrito: boolean;
  loading: boolean;
  magnitudMinima: number;
  activar: (magnitudMinima: number) => Promise<void>;
  desactivar: () => Promise<void>;
  actualizarUmbral: (magnitudMinima: number) => Promise<void>;
}
```
`activar`: `Notification.requestPermission()` → `navigator.serviceWorker.ready` (Serwist ya auto-registra el SW vía `next.config.ts`, no hace falta `register()` manual) → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })` → `POST /api/push/subscribe`.
`desactivar`: `registration.pushManager.getSubscription()` → `.unsubscribe()` → `DELETE /api/push/subscribe`.
`actualizarUmbral`: re-`POST` con el mismo `endpoint` (upsert) y el nuevo `magnitudMinima`.

## Frontend — UI

**`apps/web/components/mapa/MapaSismos.tsx`** — agrega `BotonConfiguracion` a la izquierda del botón "Ver todo Chile" existente, mismo estilo visual y mismo offset de safe-area (`top-3` + `env(safe-area-inset-top)`) que ya implementamos.

**`apps/web/components/configuracion/BotonConfiguracion.tsx`** — botón ícono de engranaje, abre `ModalConfiguracion` en estado local (`useState`).

**`apps/web/components/configuracion/ModalConfiguracion.tsx`** — overlay + card centrada (`bg-neutral-900 rounded-2xl`, consistente con el bottom sheet de historial). Contenido:
- Toggle "Activar notificaciones" (usa `activar`/`desactivar` del hook).
- Si `suscrito`: slider de magnitud mínima, min=4 max=7 step=1 (mismo componente visual que el slider de `PanelHistorial.tsx`, con piso en 4), `onChange` llama `actualizarUmbral`.
- Si `permission === "denied"`: mensaje indicando que debe habilitar notificaciones desde la configuración del navegador/sistema (no se puede volver a pedir el permiso desde JS).
- Si `permission === "unsupported"`: mensaje indicando que el navegador/dispositivo no soporta push (ej. Safari de escritorio en macOS viejo, o iOS sin la PWA instalada en pantalla de inicio).

## VAPID keys

Generadas con `npx web-push generate-vapid-keys`. Se guardan en:
- `apps/web/.env.local` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `apps/ingestor/.env.local` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:roguerrero.go@gmail.com`
- `.env.example` de ambas apps → mismas claves, valores vacíos, sí versionado
- `vercel-env-push.txt` en la raíz del repo (nuevo, agregado a `.gitignore`) con las 3 variables en formato `KEY=value` listas para pegar en la configuración de Vercel

## Testing

Validación manual (no hay tests automatizados de UI/push en el proyecto):
- El modal abre/cierra correctamente y refleja el estado real de `Notification.permission`
- Activar notificaciones registra una suscripción en MongoDB (`db.pushsubscriptions.find()`)
- Cambiar el slider de umbral actualiza `magnitudMinima` en el documento existente (mismo `endpoint`, no crea uno nuevo)
- Desactivar elimina el documento de MongoDB
- Con una suscripción activa en M4, insertar manualmente (o esperar) un sismo CSN de M4+ dispara una notificación visible del sistema operativo
- Un sismo CSN por debajo del umbral de la suscripción no dispara notificación
- Un sismo USGS (no-Chile) nunca dispara notificación, sin importar magnitud
- Simular un 410 de `web-push` (endpoint inválido) confirma que la suscripción se borra de MongoDB
