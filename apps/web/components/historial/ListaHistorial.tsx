"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatearCoordenadas } from "../../lib/coordenadas";
import { colorPorMagnitud, colorTextoPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "@sismos/shared";
import {
  useHistorial,
  OPCIONES_TIPO,
  type ItemHistorial,
} from "../../lib/use-historial";
import {
  FILTRO_HISTORIAL_DEFAULT,
  type FiltroHistorial,
} from "../../lib/filtro-tipos";
import SelectorMagnitudRangos from "../filtro/SelectorMagnitudRangos";
import IconoChevron from "../IconoChevron";
import SkeletonLista from "../SkeletonLista";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

function sismoDesdeEvento(evento: ItemHistorial): SismoSeleccionado {
  return {
    externalId: evento.externalId,
    latitud: evento.latitud,
    longitud: evento.longitud,
    magnitud: evento.magnitud,
    lugar: evento.lugar,
    fecha: evento.fecha,
    bandera: evento.bandera,
    profundidadKm: evento.profundidadKm,
    ubicacionAproximada: evento.ubicacionAproximada,
  };
}

interface ListaHistorialProps {
  // Pospone el fetch de useHistorial; ver el comentario en PantallaHistorial.
  activo?: boolean;
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado, seleccionado: boolean) => void;
}

export default function ListaHistorial({
  activo,
  sismoSeleccionado,
  onSeleccionar,
}: ListaHistorialProps) {
  const t = useTranslations("historial");
  const locale = useLocale();
  const localeFecha = locale === "en" ? "en-US" : "es-CL";
  const [filtro, setFiltro] = useState<FiltroHistorial>(
    FILTRO_HISTORIAL_DEFAULT,
  );
  const { tipo, setTipo, eventosFiltrados, loading, error, reintentar } =
    useHistorial({ ...filtro, activo });
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (!sismoSeleccionado) return;
    const el = itemRefs.current.get(sismoSeleccionado.externalId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sismoSeleccionado, eventosFiltrados]);

  return (
    <>
      <div className="shrink-0 border-b border-neutral-800 px-4 py-3">
        <div className="relative">
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value as (typeof OPCIONES_TIPO)[number]["valor"])
            }
            aria-label={t("tipoAria")}
            className="campo appearance-none pr-8"
          >
            {OPCIONES_TIPO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {t(`tipo.${opcion.valor}`)}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
            <IconoChevron className="h-4 w-4" />
          </span>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              setFiltro((f) => ({ ...f, soloChile: !f.soloChile }))
            }
            aria-pressed={filtro.soloChile}
            className="chip"
          >
            {t("soloChile")}
          </button>
          <SelectorMagnitudRangos
            className="contents"
            seleccionados={filtro.rangos}
            onChange={(rangos) => setFiltro((f) => ({ ...f, rangos }))}
          />
        </div>
      </div>

      {loading ? (
        <SkeletonLista etiqueta={t("cargando")} />
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
      ) : eventosFiltrados.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>{t("sinResultados")}</p>
          <button
            type="button"
            onClick={() => setFiltro(FILTRO_HISTORIAL_DEFAULT)}
            className="btn"
          >
            {t("quitarFiltros")}
          </button>
        </div>
      ) : (
        <ul className="lista-cv flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4 py-3">
          {eventosFiltrados.map((evento) => {
            const seleccionado =
              evento.externalId === sismoSeleccionado?.externalId;
            const region =
              evento.bandera === "🇨🇱"
                ? regionChilePorLatitud(evento.latitud)
                : null;
            return (
              <li
                key={evento.externalId}
                ref={(el) => {
                  if (el) itemRefs.current.set(evento.externalId, el);
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    onSeleccionar(sismoDesdeEvento(evento), seleccionado)
                  }
                  aria-current={seleccionado ? "true" : undefined}
                  className="tarjeta-sismo"
                >
                  <span
                    className="insignia-magnitud"
                    style={{
                      backgroundColor: colorPorMagnitud(evento.magnitud),
                      color: colorTextoPorMagnitud(evento.magnitud),
                    }}
                  >
                    <span className="sr-only">{t("magnitudEtiqueta")} </span>
                    {evento.magnitud}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-neutral-100">
                      {evento.bandera ?? "🌎"} {evento.lugar}
                    </span>
                    {region && (
                      <span className="block text-xs text-neutral-400">
                        {region}
                      </span>
                    )}
                    <span className="mt-1 block text-xs text-neutral-400">
                      {new Date(evento.fecha).toLocaleString(localeFecha)}
                      {" · "}
                      {t("profundidad", {
                        n: Math.round(evento.profundidadKm),
                      })}
                    </span>
                    <span className="block text-xs text-neutral-500">
                      {formatearCoordenadas(
                        evento.latitud,
                        evento.longitud,
                        locale,
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
