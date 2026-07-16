# Push notifications — design

## Propósito

Agregar notificaciones push para sismos chilenos (CSN) de magnitud significativa, con un botón de configuración en el mapa que abre un modal para activar/desactivar y elegir el umbral de magnitud. Referencia de patrón: implementación existente en `/Users/rodrigoguerrero/Sites/kick-flow` (`usePushNotifications`, `/api/push/subscribe`, `web-push`), adaptada a que sismos no tiene sistema de usuarios (suscripciones anónimas, sin `userId`).

Decisiones de scope (de la conversación de brainstorming):
- Alcance geográfico: **solo Chile (CSN)** — sismos USGS/mundo no disparan push, por ahora ("es una app gratuita").
- Umbral: **configurable por suscripción**, rango 4–7, default M4 — el piso global es M4 (no se puede bajar de ahí).
- Ubicación del botón: junto a "Ver todo Chile" en `MapaSismos.tsx`.
- VAPID keys: generadas ahora, guardadas en `.env.local` (gitignored) de ambas apps, más un archivo `vercel-env-push.txt` en la raíz (gitignored) listo para copiar a Vercel.
- Al tocar la notificación, la app debe abrir/enfocar la página y mostrar en vivo dónde y qué sismo la disparó, priorizando velocidad de carga (agregado durante la implementación, ver sección "Deep link al tocar la notificación").

## Modelo de datos

**Nota (2026-07-16):** este spec se escribió originalmente sobre Mongoose/MongoDB. `packages/db` migró a Drizzle ORM sobre Postgres (Neon en producción) — ver `docs/superpowers/specs/2026-07-15-sismos-postgres-migration-design.md`. Esta sección ya refleja el modelo actualizado a Drizzle.

Nueva tabla en `packages/db/src/schema.ts`, mismo patrón que `sismos`/`sismosHistoricos` (columnas planas, sin objetos anidados):

```ts
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  magnitudMinima: real("magnitud_minima").notNull().default(4),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
```

El objeto anidado `keys: { p256dh, auth }` del payload de `PushSubscriptionJSON` del navegador se aplana a dos columnas (`p256dh`, `auth`), igual que se hizo con `refCruzada` en la tabla `sismos`. Las funciones de query reconstruyen el objeto `keys` al leer, para que el resto del código (que llama `web-push` con `{ endpoint, keys: { p256dh, auth } }`) no cambie.

Sin `userId` — la app no tiene autenticación, las suscripciones son anónimas por dispositivo/navegador.

**`packages/db/src/queries/push-subscription.ts`**:
- `upsertPushSubscription({ endpoint, keys, magnitudMinima })` — upsert por `endpoint` (`onConflictDoUpdate`, mismo patrón que `upsertSismo`)
- `deletePushSubscription(endpoint)` — elimina por `endpoint`
- `findSubscripcionesParaMagnitud(magnitud)` — devuelve suscripciones con `magnitudMinima <= magnitud`

Exportado desde `packages/db/src/index.ts` igual que los módulos existentes (`export * from "./queries/push-subscription"`).

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
Se llama con `await` dentro de un `try/catch` (no fire-and-forget real: en Vercel serverless el proceso puede cortarse apenas se responde el request, así que hay que esperar el envío antes de que `runIngest` termine) — un fallo de push nunca hace fallar el ingest, solo se loguea con `console.error`, igual que el resto de `ingest.ts`.

El `url` del payload incluye los datos del sismo como query params, para que el deep-link (ver sección más abajo) no dependa de una consulta adicional a la API al abrir la app:
```
url: `/?sismo=${evento.externalId}&lat=${evento.latitud}&lon=${evento.longitud}&mag=${evento.magnitud}&lugar=${encodeURIComponent(evento.lugar)}`
```

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
  const url = event.notification.data.url;
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return clients.openWindow(url);
      }),
  );
});
```

Si ya hay una ventana/tab abierta (PWA en foreground), navega esa en vez de abrir una nueva — evita el arranque en frío completo, más rápido. Reutiliza los íconos PWA ya generados (`icon-192.png`) — sin assets nuevos.

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

## Deep link al tocar la notificación

Al tocar la notificación, la app debe abrir mostrando en vivo dónde y qué sismo la disparó, priorizando velocidad — sin esperar ningún fetch adicional, ya que los datos (`externalId`, `lat`, `lon`, `mag`, `lugar`) ya viajan en la URL del payload de push (ver sección de disparo, más arriba).

Se reutiliza casi por completo el mecanismo de selección de sismo que ya existe (`sismoSeleccionado` en `MapaConHistorial.tsx`, que dispara `flyTo` + marcador de selección en `MapaSismos.tsx`) — no se agrega infraestructura nueva de selección, solo una forma adicional de poblar el estado inicial:

1. **`apps/web/app/page.tsx`** (Server Component) — recibe `searchParams`, parsea `sismo`/`lat`/`lon`/`mag`/`lugar` y arma un `SismoSeleccionado` inicial (o `null` si faltan/son inválidos). Esto pasa antes del primer render, sin esperar ningún fetch de historial.
2. **`apps/web/components/MapaConHistorial.tsx`** — recibe un nuevo prop `sismoInicial: SismoSeleccionado | null`, usado como valor inicial de `useState(sismoInicial)` en vez de `useState(null)`.
3. **`apps/web/components/mapa/MapaSismos.tsx`** — sin cambios en la lógica de `flyTo` (ya reacciona a `sismoSeleccionado` en un `useEffect`, y como ambos `useEffect` corren en el mismo commit inicial, el mapa ya existe cuando este se dispara). Se le agrega un `.setPopup(...)` + `.togglePopup()` al marcador de selección (`crearElementoSeleccion`) para mostrar lugar y magnitud inmediatamente, sin que el usuario tenga que tocar nada — hoy ese marcador no mostraba popup (solo los marcadores normales lo tienen). Esto aplica a toda selección (deep-link, click en mapa, click en historial), no solo al caso de push.

No se agrega ningún fetch, loading state, ni componente nuevo para esto — es composición de piezas que ya existen.

## VAPID keys

Generadas con `npx web-push generate-vapid-keys`. Se guardan en:
- `apps/web/.env.local` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `apps/ingestor/.env.local` → `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:roguerrero.go@gmail.com`
- `.env.example` de ambas apps → mismas claves, valores vacíos, sí versionado
- `vercel-env-push.txt` en la raíz del repo (nuevo, agregado a `.gitignore`) con las 3 variables en formato `KEY=value` listas para pegar en la configuración de Vercel

## Testing

Validación manual (no hay tests automatizados de UI/push en el proyecto):
- El modal abre/cierra correctamente y refleja el estado real de `Notification.permission`
- Activar notificaciones registra una fila en Postgres (`SELECT * FROM push_subscriptions;`)
- Cambiar el slider de umbral actualiza `magnitud_minima` en la fila existente (mismo `endpoint`, no crea una nueva)
- Desactivar elimina la fila de Postgres
- Con una suscripción activa en M4, insertar manualmente (o esperar) un sismo CSN de M4+ dispara una notificación visible del sistema operativo
- Un sismo CSN por debajo del umbral de la suscripción no dispara notificación
- Un sismo USGS (no-Chile) nunca dispara notificación, sin importar magnitud
- Simular un 410 de `web-push` (endpoint inválido) confirma que la suscripción se borra de Postgres
- Abrir manualmente `http://localhost:3000/?sismo=test123&lat=-33.45&lon=-70.6&mag=5.2&lugar=Santiago` hace que el mapa vuele directo a esas coordenadas y muestre el popup con lugar+magnitud, sin esperar el fetch del historial
- Tocar la notificación con la PWA ya abierta en una pestaña reutiliza esa pestaña (navega) en vez de abrir una nueva
