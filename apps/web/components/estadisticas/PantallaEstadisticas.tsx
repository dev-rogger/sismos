"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
import {
  useEstadisticas,
  OPCIONES_GRANULARIDAD,
} from "../../lib/use-estadisticas";
import { colorPorMagnitud, colorTextoPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "@sismos/shared";
import GraficoConteos from "./GraficoConteos";
import SkeletonLista from "../SkeletonLista";

interface PantallaEstadisticasProps {
  abierto: boolean;
  onCerrar: () => void;
}

// Mismos cortes que colorPorMagnitud (lib/magnitud.ts) — el desglose usa el
// mismo color que ya ve el usuario en los marcadores del mapa, en vez de
// inventar una paleta nueva para lo mismo.
const BANDAS_MAGNITUD = [
  { desde: 0, hasta: 3 },
  { desde: 3, hasta: 5 },
  { desde: 5, hasta: 7 },
  { desde: 7, hasta: Infinity },
];

export default function PantallaEstadisticas({
  abierto,
  onCerrar,
}: PantallaEstadisticasProps) {
  const t = useTranslations("estadisticas");
  const tc = useTranslations("comun");
  const locale = useLocale();
  const localeFecha = locale === "en" ? "en-US" : "es-CL";
  useOverlayAccesible(abierto, onCerrar);

  // Mismo patrón que PantallaHistorial/PantallaFallas: montada siempre para
  // poder animar el cierre, fetch pospuesto hasta la primera apertura real.
  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  const [soloChile, setSoloChile] = useState(true);
  const {
    granularidad,
    setGranularidad,
    resumen,
    conteos,
    loading,
    error,
    reintentar,
  } = useEstadisticas(soloChile, huboApertura);

  // El desglose real (por banda, sobre TODO el período, no solo la lista
  // acotada) viene calculado del servidor — ver ResumenPeriodo.porBanda en
  // @sismos/db. Acá solo se le pega el `hasta` (para el label "M3–5") que
  // el servidor no necesita mandar.
  const porBanda = BANDAS_MAGNITUD.map((banda) => ({
    ...banda,
    total:
      resumen.porBanda.find((b) => b.desde === banda.desde)?.total ?? 0,
  }));

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
          {t("titulo")}
        </h1>
      </div>

      <button
        type="button"
        onClick={() => setSoloChile((v) => !v)}
        aria-pressed={soloChile}
        className="chip mx-4 mt-3"
      >
        {t("soloChile")}
      </button>

      {loading ? (
        <SkeletonLista etiqueta={t("cargando")} filas={5} alto="h-24" className="px-4 py-4" />
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>{t("errorCarga")}</p>
          <button
            type="button"
            onClick={reintentar}
            className="btn"
          >
            {t("reintentar")}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-[var(--radius-tarjeta)] border border-neutral-800 bg-neutral-800/40 p-4">
            <p className="text-3xl font-semibold tabular-nums tracking-tight text-neutral-100">
              {resumen.total}
            </p>
            <p className="text-sm text-neutral-400">
              {t(`resumenVentana.${granularidad}`)}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {porBanda.map((banda) => (
                <span
                  key={banda.desde}
                  className="flex items-center gap-1.5 rounded-full border border-neutral-700 px-2.5 py-1 text-xs font-medium text-neutral-300"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorPorMagnitud(banda.desde) }}
                  />
                  M{banda.desde}
                  {banda.hasta !== Infinity ? `–${banda.hasta}` : "+"} ·{" "}
                  {banda.total}
                </span>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">
                {t("actividad")}
              </h2>
              <div
                role="group"
                aria-label={t("granularidadAria")}
                className="flex gap-1 rounded-lg border border-neutral-700 bg-neutral-800 p-0.5"
              >
                {OPCIONES_GRANULARIDAD.map((opcion) => (
                  <button
                    key={opcion}
                    type="button"
                    onClick={() => setGranularidad(opcion)}
                    aria-pressed={granularidad === opcion}
                    className={`min-h-9 touch-manipulation rounded-md px-2.5 text-xs font-medium transition active:scale-[0.97] ${
                      granularidad === opcion
                        ? "bg-neutral-700 text-neutral-100"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    {t(`granularidad.${opcion}`)}
                  </button>
                ))}
              </div>
            </div>
            <GraficoConteos granularidad={granularidad} conteos={conteos} />
          </section>

          <section className="mt-5">
            <h2 className="mb-1 text-sm font-semibold text-neutral-200">
              {t(`listadoVentana.${granularidad}`)}
            </h2>
            {resumen.total > resumen.sismos.length && (
              <p className="mb-3 text-xs text-neutral-500">
                {t("listadoAcotado", {
                  mostrados: resumen.sismos.length,
                  total: resumen.total,
                })}
              </p>
            )}
            {resumen.sismos.length === 0 ? (
              <p className="mt-2 text-sm text-neutral-500">
                {t(`sinSismosVentana.${granularidad}`)}
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {resumen.sismos.map((sismo) => {
                  const region =
                    sismo.bandera === "🇨🇱"
                      ? regionChilePorLatitud(sismo.latitud)
                      : null;
                  return (
                    <li key={sismo.externalId} className="tarjeta-sismo">
                      <span
                        className="insignia-magnitud"
                        style={{
                          backgroundColor: colorPorMagnitud(sismo.magnitud),
                          color: colorTextoPorMagnitud(sismo.magnitud),
                        }}
                      >
                        <span className="sr-only">{t("magnitudEtiqueta")} </span>
                        {sismo.magnitud}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-neutral-100">
                          {sismo.bandera ?? "🌎"} {sismo.lugar}
                        </span>
                        {region && (
                          <span className="block text-xs text-neutral-400">
                            {region}
                          </span>
                        )}
                        <span className="mt-1 block text-xs text-neutral-400">
                          {new Date(sismo.fecha).toLocaleString(localeFecha)}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
