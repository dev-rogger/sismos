"use client";

import { useCallback, useEffect, useState } from "react";

type PermisoNotificacion = "granted" | "denied" | "default" | "unsupported";

const MAGNITUD_DEFAULT = 4;

interface PreferenciaRadio {
  centro: { lat: number; lon: number } | null;
  radioKm: number | null;
}

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
  preferenciaRadio: PreferenciaRadio,
  alcanceMundial: boolean,
): Promise<void> {
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      magnitudMinima,
      centro: preferenciaRadio.centro,
      radioKm: preferenciaRadio.radioKm,
      alcanceMundial,
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
  const [radioKm, setRadioKm] = useState<number | null>(null);
  const [centro, setCentro] = useState<{ lat: number; lon: number } | null>(
    null,
  );
  const [alcanceMundial, setAlcanceMundial] = useState(false);

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

      if (existente) {
        try {
          const res = await fetch(
            `/api/push/subscribe?endpoint=${encodeURIComponent(existente.endpoint)}`,
          );
          if (res.ok) {
            const data = (await res.json()) as {
              subscription: {
                magnitudMinima: number;
                centro: { lat: number; lon: number } | null;
                radioKm: number | null;
                alcanceMundial: boolean;
              } | null;
            };
            if (data.subscription && !cancelado) {
              setMagnitudMinima(data.subscription.magnitudMinima);
              setRadioKm(data.subscription.radioKm);
              setCentro(data.subscription.centro);
              setAlcanceMundial(data.subscription.alcanceMundial);
            }
          }
        } catch (error) {
          console.error("[usePushNotifications] hydrate failed:", error);
        }
      }

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

  const activar = useCallback(
    async (
      nuevaMagnitudMinima: number,
      preferenciaRadio: PreferenciaRadio,
      nuevoAlcanceMundial: boolean,
      mensajePrueba?: { titulo: string; cuerpo: string },
    ) => {
      setLoading(true);
      try {
        const permisoActual = await Notification.requestPermission();
        setPermission(permisoActual as PermisoNotificacion);
        if (permisoActual !== "granted") return false;

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
        await enviarSuscripcion(
          subscription,
          nuevaMagnitudMinima,
          preferenciaRadio,
          nuevoAlcanceMundial,
        );
        setMagnitudMinima(nuevaMagnitudMinima);
        setRadioKm(preferenciaRadio.radioKm);
        setCentro(preferenciaRadio.centro);
        setAlcanceMundial(nuevoAlcanceMundial);
        setSuscrito(true);

        // El permiso del navegador, una vez concedido, no se puede volver a
        // pedir por API — si el usuario ya lo había aceptado antes (aunque
        // haya desactivado y reactivado dentro de la app), este flujo no
        // muestra ningún diálogo del sistema y activar "no hace nada"
        // visible. Esta notificación de prueba es la confirmación de que sí
        // funcionó, independiente de si hubo diálogo de permiso o no.
        if (mensajePrueba) {
          registration
            .showNotification(mensajePrueba.titulo, {
              body: mensajePrueba.cuerpo,
              icon: "/icons/icon-192.png",
              badge: "/icons/icon-192.png",
            })
            .catch(() => {});
        }

        return true;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

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

  const actualizarUmbral = useCallback(
    async (
      nuevaMagnitudMinima: number,
      preferenciaRadio: PreferenciaRadio,
      nuevoAlcanceMundial: boolean,
    ) => {
      setLoading(true);
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) throw new Error("No active subscription to update");
        await enviarSuscripcion(
          subscription,
          nuevaMagnitudMinima,
          preferenciaRadio,
          nuevoAlcanceMundial,
        );
        setMagnitudMinima(nuevaMagnitudMinima);
        setRadioKm(preferenciaRadio.radioKm);
        setCentro(preferenciaRadio.centro);
        setAlcanceMundial(nuevoAlcanceMundial);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    radioKm,
    centro,
    alcanceMundial,
    activar,
    desactivar,
    actualizarUmbral,
  };
}
