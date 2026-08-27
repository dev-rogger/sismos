"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface PantallaReportesProps {
  abierto: boolean;
  onCerrar: () => void;
}

type EstadoError = "denegado" | "otro" | null;

export default function PantallaReportes({
  abierto,
  onCerrar,
}: PantallaReportesProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("comun");
  useOverlayAccesible(abierto, onCerrar);

  // Todavía no hay contenido real acá (ver "proximamente" abajo), pero igual
  // pegamos al endpoint para no confiar solo en que el menú ocultó esta
  // opción a los no-admins — mismo criterio que PantallaUsuarios.
  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EstadoError>(null);
  const [reintentos, setReintentos] = useState(0);

  useEffect(() => {
    if (!huboApertura) return;
    let cancelado = false;
    setLoading(true);
    setError(null);

    fetch("/api/admin/reportes")
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          throw new Error("denegado");
        }
        if (!res.ok) throw new Error("otro");
      })
      .then(() => {
        if (cancelado) return;
        setLoading(false);
      })
      .catch((err) => {
        console.error("[PantallaReportes] fetch error:", err);
        if (cancelado) return;
        setError(err instanceof Error && err.message === "denegado" ? "denegado" : "otro");
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [huboApertura, reintentos]);

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 flex flex-col bg-neutral-950 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        abierto ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label={tc("volver")}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-neutral-100">
          {t("reportes")}
        </h1>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 text-center">
        {loading ? (
          <p className="text-sm text-neutral-500">{t("cargando")}</p>
        ) : error === "denegado" ? (
          <p className="text-sm text-neutral-500">{t("accesoDenegado")}</p>
        ) : error ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-neutral-500">{t("errorCarga")}</p>
            <button
              type="button"
              onClick={() => setReintentos((n) => n + 1)}
              className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
            >
              {t("reintentar")}
            </button>
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{t("proximamente")}</p>
        )}
      </div>
    </div>
  );
}
