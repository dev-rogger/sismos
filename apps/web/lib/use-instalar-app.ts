"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CLAVE_DISMISS = "sismos:instalar-dismiss";
const CLAVE_INSTALADA = "sismos:instalada";
const COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 días
const AUTO_SHOW_DELAY_MS = 45 * 1000;

type Plataforma = "android" | "ios" | null;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function estaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function esIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function yaFueInstalada(): boolean {
  try {
    return window.localStorage.getItem(CLAVE_INSTALADA) === "true";
  } catch {
    return false;
  }
}

function dentroDeCooldown(): boolean {
  try {
    const raw = window.localStorage.getItem(CLAVE_DISMISS);
    if (!raw) return false;
    const dismissedAt = Number(raw);
    if (Number.isNaN(dismissedAt)) return false;
    return Date.now() - dismissedAt < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function marcarInstalada(): void {
  try {
    window.localStorage.setItem(CLAVE_INSTALADA, "true");
  } catch {
    // localStorage puede fallar (Safari privado, cuota excedida); no
    // bloquea el resto del flujo, solo no persiste la preferencia.
  }
}

export function useInstalarApp(bloqueado = false) {
  const [puedeInstalar, setPuedeInstalar] = useState(false);
  const [plataforma, setPlataforma] = useState<Plataforma>(null);
  const [visible, setVisible] = useState(false);
  const [pendiente, setPendiente] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (estaStandalone()) return;

    if (esIOS()) {
      setPlataforma("ios");
      setPuedeInstalar(true);
    }

    const manejarBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      setPlataforma("android");
      setPuedeInstalar(true);
    };

    const manejarAppInstalled = () => {
      marcarInstalada();
      setVisible(false);
      setPuedeInstalar(false);
    };

    window.addEventListener("beforeinstallprompt", manejarBeforeInstallPrompt);
    window.addEventListener("appinstalled", manejarAppInstalled);
    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        manejarBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", manejarAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!puedeInstalar || dentroDeCooldown() || yaFueInstalada()) return;
    const timer = window.setTimeout(() => setPendiente(true), AUTO_SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [puedeInstalar]);

  // Si el timer de arriba se cumple mientras hay otro modal/pantalla
  // abierto (`bloqueado`), no mostramos el aviso todavía — quedaría
  // encima de lo que el usuario está haciendo — pero tampoco lo
  // descartamos: en cuanto se desbloquea, se muestra una sola vez.
  useEffect(() => {
    if (pendiente && !bloqueado) {
      setVisible(true);
      setPendiente(false);
    }
  }, [pendiente, bloqueado]);

  const descartar = useCallback(() => {
    try {
      window.localStorage.setItem(CLAVE_DISMISS, String(Date.now()));
    } catch {
      // localStorage puede fallar; el modal igual se cierra en memoria.
    }
    setVisible(false);
  }, []);

  const instalar = useCallback(async () => {
    const deferredPrompt = deferredPromptRef.current;
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        marcarInstalada();
        setVisible(false);
        setPuedeInstalar(false);
      } else {
        descartar();
      }
    } catch (error) {
      console.error("[useInstalarApp] instalar failed:", error);
      descartar();
    } finally {
      deferredPromptRef.current = null;
    }
  }, [descartar]);

  const abrirManual = useCallback(() => {
    setVisible(true);
  }, []);

  return { puedeInstalar, plataforma, visible, instalar, descartar, abrirManual };
}
