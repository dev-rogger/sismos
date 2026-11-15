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
      inert={!abierto}
      data-abierto={abierto}
      className="pantalla-overlay"
    >
      <div className="cabecera-pantalla">
        <button
          type="button"
          onClick={onCerrar}
          aria-label={tc("volver")}
          className="btn-icono"
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
        <h1 className="titulo-pantalla">
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
              className="btn"
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
