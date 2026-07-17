"use client";

import { useCallback, useEffect, useState } from "react";

type PermisoNotificacion = "granted" | "denied" | "default" | "unsupported";

const MAGNITUD_DEFAULT = 4;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function enviarSuscripcion(
  subscription: PushSubscription,
  magnitudMinima: number,
): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      magnitudMinima,
    }),
  });
  if (!res.ok) throw new Error(`subscribe failed: ${res.status}`);
}

export function usePushNotifications() {
  const [permission, setPermission] =
    useState<PermisoNotificacion>("unsupported");
  const [suscrito, setSuscrito] = useState(false);
  const [loading, setLoading] = useState(true);
  const [magnitudMinima, setMagnitudMinima] = useState(MAGNITUD_DEFAULT);

  useEffect(() => {
    let cancelado = false;

    async function inicializar() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        setPermission("unsupported");
        setLoading(false);
        return;
      }
      setPermission(Notification.permission as PermisoNotificacion);
      const registration = await navigator.serviceWorker.ready;
      const existente = await registration.pushManager.getSubscription();
      if (!cancelado) {
        setSuscrito(existente !== null);
        setLoading(false);
      }
    }

    inicializar().catch((error) => {
      console.error("[usePushNotifications] init failed:", error);
      if (!cancelado) setLoading(false);
    });

    return () => {
      cancelado = true;
    };
  }, []);

  const activar = useCallback(async (nuevaMagnitudMinima: number) => {
    setLoading(true);
    try {
      const permisoActual = await Notification.requestPermission();
      setPermission(permisoActual as PermisoNotificacion);
      if (permisoActual !== "granted") return;

      const registration = await navigator.serviceWorker.ready;
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
      }

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(
            vapidPublicKey,
          ) as BufferSource,
        });
      }
      await enviarSuscripcion(subscription, nuevaMagnitudMinima);
      setMagnitudMinima(nuevaMagnitudMinima);
      setSuscrito(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setSuscrito(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const actualizarUmbral = useCallback(async (nuevaMagnitudMinima: number) => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) throw new Error("No active subscription to update");
      await enviarSuscripcion(subscription, nuevaMagnitudMinima);
      setMagnitudMinima(nuevaMagnitudMinima);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    activar,
    desactivar,
    actualizarUmbral,
  };
}
