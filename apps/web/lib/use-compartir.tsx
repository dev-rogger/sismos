"use client";

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

// Mismo toast que el de éxito (mismo layout/estilo), pero con ícono y texto
// de error — única confirmación visual disponible para el botón flotante
// del mapa, que no tiene label visible (solo ícono).
function mostrarErrorCompartir(mensaje: string) {
  toast.custom(() => (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg shadow-black/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-red-400">
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      </span>
      <p className="text-sm font-medium text-neutral-100">{mensaje}</p>
    </div>
  ));
}

// Extraído de MenuLateral para que también lo use el botón flotante de
// "Compartir" sobre el mapa (MapaSismos): misma lógica compartir/share con
// fallback a portapapeles, sin duplicarla entre los dos triggers.
export function useCompartir() {
  const t = useTranslations("compartir");
  const [enlaceCopiado, setEnlaceCopiado] = useState(false);

  const compartir = useCallback(async () => {
    const url = window.location.origin;
    const mensajeCompartir = t("mensaje");

    if (navigator.share) {
      try {
        await navigator.share({ title: "Sismos", text: mensajeCompartir, url });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[useCompartir] compartir error:", error);
          mostrarErrorCompartir(t("errorCompartir"));
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${mensajeCompartir} ${url}`);
      setEnlaceCopiado(true);
      // MenuLateral usa `enlaceCopiado` para reemplazar su propio texto
      // ("Compartir" -> "Enlace copiado"), pero el botón flotante del mapa
      // no tiene label visible (solo ícono) — este toast es la única
      // confirmación visual para ese caso, y aparece igual desde cualquiera
      // de los dos triggers gracias al <Toaster /> global.
      toast.custom(() => (
        <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 shadow-lg shadow-black/40">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-emerald-400">
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
          <p className="text-sm font-medium text-neutral-100">
            {t("enlaceCopiado")}
          </p>
        </div>
      ));
      setTimeout(() => setEnlaceCopiado(false), 2000);
    } catch (error) {
      console.error("[useCompartir] clipboard error:", error);
      mostrarErrorCompartir(t("errorCompartir"));
    }
  }, [t]);

  return { compartir, enlaceCopiado };
}
