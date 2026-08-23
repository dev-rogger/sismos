import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// TypeScript's DOM lib no incluye `vibrate` en NotificationOptions, aunque es
// parte de la spec de push notifications y todos los navegadores relevantes
// lo soportan (se ignora en los que no).
interface NotificationOptionsConVibracion extends NotificationOptions {
  vibrate?: number[];
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  const opciones: NotificationOptionsConVibracion = {
    body: data.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    vibrate: data.severo ? [200, 100, 200, 100, 300] : [150, 80, 150],
    requireInteraction: Boolean(data.severo),
    data: { url: data.url ?? "/" },
  };
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Sismos", opciones),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data.url;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
