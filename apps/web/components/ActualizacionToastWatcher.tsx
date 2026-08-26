"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// Solo tiene sentido en la PWA instalada (standalone): en una pestaña
// normal de navegador, cualquier recarga real (F5, cerrar/reabrir,
// clickear un link) ya pide el HTML fresco de la red y queda al día sola.
// La PWA en cambio se trata como una app nativa — la gente la deja abierta
// o la cambia de foco, pero casi nunca la "recarga" a mano — así que ahí sí
// hace falta avisar.
function esStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const porMediaQuery = window.matchMedia?.(
    "(display-mode: standalone)",
  ).matches;
  const porIosLegacy =
    (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(porMediaQuery || porIosLegacy);
}

// Con skipWaiting + clientsClaim (ver app/sw.ts), un service worker nuevo
// activa y toma control de las pestañas abiertas SOLO, sin esperar a que se
// cierren. Eso dispara "controllerchange" acá, pero el JS/HTML que ya está
// corriendo en esta pestaña sigue siendo el viejo hasta que se recarga —
// por eso avisamos en vez de asumir que ya se actualizó.
export default function ActualizacionToastWatcher() {
  const t = useTranslations("actualizacion");
  const tc = useTranslations("comun");

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    if (!esStandalone()) return;

    // Si la pestaña ya tenía un controlador al montar, cualquier cambio
    // posterior es una actualización real. Si todavía no tenía ninguno
    // (primera instalación), el primer "controllerchange" es solo el SW
    // tomando control por primera vez, no una versión nueva — lo ignoramos.
    let yaTeniaControlador = Boolean(navigator.serviceWorker.controller);

    function avisarNuevaVersion() {
      toast.custom(
        (id) => (
          <div className="flex w-full flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-lg shadow-black/40">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-2.64-6.36" />
                  <path d="M21 3v6h-6" />
                </svg>
              </span>
              <p className="flex-1 text-sm font-medium text-neutral-100">
                {t("nuevaVersion")}
              </p>
              <button
                type="button"
                onClick={() => toast.dismiss(id)}
                aria-label={tc("cerrar")}
                className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-300"
              >
                ✕
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                toast.dismiss(id);
                window.location.reload();
              }}
              className="min-h-11 w-full touch-manipulation rounded-lg bg-emerald-500 text-sm font-semibold text-neutral-950 transition active:scale-[0.97] active:brightness-95 hover:bg-emerald-400"
            >
              {t("actualizar")}
            </button>
          </div>
        ),
        { duration: Infinity },
      );
    }

    function alCambiarControlador() {
      if (!yaTeniaControlador) {
        yaTeniaControlador = true;
        return;
      }
      avisarNuevaVersion();
    }

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      alCambiarControlador,
    );

    // Los navegadores chequean actualizaciones del SW al navegar, pero una
    // PWA puede quedar horas en background sin ninguna navegación nueva —
    // esto lo adelanta apenas la app vuelve a primer plano.
    function alVolverAPrimerPlano() {
      if (document.visibilityState !== "visible") return;
      navigator.serviceWorker.getRegistration().then((registro) => {
        registro?.update();
      });
    }
    document.addEventListener("visibilitychange", alVolverAPrimerPlano);

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        alCambiarControlador,
      );
      document.removeEventListener("visibilitychange", alVolverAPrimerPlano);
    };
  }, [t, tc]);

  return null;
}
