"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
import {
  useEstadisticas,
  OPCIONES_GRANULARIDAD,
} from "../../lib/use-estadisticas";
import { colorPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "@sismos/shared";
import GraficoConteos from "./GraficoConteos";

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
    ultimos7Dias,
    conteos,
    loading,
    error,
    reintentar,
  } = useEstadisticas(soloChile, huboApertura);

  const porBanda = useMemo(() => {
    return BANDAS_MAGNITUD.map((banda) => ({
      ...banda,
      total: ultimos7Dias.filter(
        (s) => s.magnitud >= banda.desde && s.magnitud < banda.hasta,
      ).length,
    }));
  }, [ultimos7Dias]);

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 flex flex-col bg-neutral-900 transition-transform duration-200 ease-out motion-reduce:transition-none ${
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
          {t("titulo")}
        </h1>
      </div>

      <button
        type="button"
        onClick={() => setSoloChile((v) => !v)}
        aria-pressed={soloChile}
        className={`mx-4 mt-3 flex min-h-11 touch-manipulation items-center justify-center rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] active:brightness-95 ${
          soloChile
            ? "border-sky-500 bg-sky-500/10 text-sky-400"
            : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
        }`}
      >
        {t("soloChile")}
      </button>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          {t("cargando")}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>{t("errorCarga")}</p>
          <button
            type="button"
            onClick={reintentar}
            className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            {t("reintentar")}
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <section className="rounded-xl border border-neutral-800 bg-neutral-800/40 p-4">
            <p className="text-3xl font-semibold text-neutral-100">
              {ultimos7Dias.length}
            </p>
            <p className="text-sm text-neutral-400">
              {t("sismosUltimos7Dias")}
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
            <h2 className="mb-3 text-sm font-semibold text-neutral-200">
              {t("listadoUltimos7Dias")}
            </h2>
            {ultimos7Dias.length === 0 ? (
              <p className="text-sm text-neutral-500">{t("sinSismos")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {ultimos7Dias.map((sismo) => {
                  const region =
                    sismo.bandera === "🇨🇱"
                      ? regionChilePorLatitud(sismo.latitud)
                      : null;
                  return (
                    <li
                      key={sismo.externalId}
                      style={{
                        borderLeftColor: colorPorMagnitud(sismo.magnitud),
                      }}
                      className="rounded-lg border border-l-4 border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
                    >
                      <div className="font-semibold text-neutral-100">
                        {sismo.bandera ?? "🌎"} {sismo.lugar}
                      </div>
                      {region && (
                        <div className="text-xs text-neutral-500">
                          {region}
                        </div>
                      )}
                      <div className="text-neutral-400">
                        M{sismo.magnitud} ·{" "}
                        {new Date(sismo.fecha).toLocaleString(localeFecha)}
                      </div>
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
