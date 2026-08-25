"use client";

import { useEffect, useRef, useState } from "react";
import { formatearCoordenadas } from "../../lib/coordenadas";
import { colorPorMagnitud } from "../../lib/magnitud";
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
            aria-label="Tipo de historial"
            className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-8 text-sm text-neutral-100 transition-colors hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
          >
            {OPCIONES_TIPO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
            <IconoChevron className="h-4 w-4" />
          </span>
        </div>

        <button
          type="button"
          onClick={() => setFiltro((f) => ({ ...f, soloChile: !f.soloChile }))}
          aria-pressed={filtro.soloChile}
          className={`mt-2 flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] active:brightness-95 ${
            filtro.soloChile
              ? "border-sky-500 bg-sky-500/10 text-sky-400"
              : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          🇨🇱 Solo Chile
        </button>

        <div className="mt-2">
          <SelectorMagnitudRangos
            seleccionados={filtro.rangos}
            onChange={(rangos) => setFiltro((f) => ({ ...f, rangos }))}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          Cargando sismos…
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>No se pudo cargar el historial de sismos.</p>
          <button
            type="button"
            onClick={reintentar}
            className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            Reintentar
          </button>
        </div>
      ) : eventosFiltrados.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>Sin sismos para estos filtros</p>
          <button
            type="button"
            onClick={() => setFiltro(FILTRO_HISTORIAL_DEFAULT)}
            className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            Quitar filtros
          </button>
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
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
                  style={{ borderLeftColor: colorPorMagnitud(evento.magnitud) }}
                  className={`w-full touch-manipulation rounded-lg border border-l-4 px-3 py-2 text-left text-sm transition active:scale-[0.97] active:brightness-95 ${
                    seleccionado
                      ? "border-neutral-600 bg-neutral-800"
                      : "border-neutral-800 bg-neutral-900 hover:bg-neutral-800/60"
                  }`}
                >
                  <div className="font-semibold text-neutral-100">
                    {evento.bandera ?? "🌎"} {evento.lugar}
                  </div>
                  {region && (
                    <div className="text-xs text-neutral-500">{region}</div>
                  )}
                  <div className="text-xs text-neutral-500">
                    {formatearCoordenadas(evento.latitud, evento.longitud)}
                  </div>
                  <div className="text-neutral-400">
                    M{evento.magnitud} —{" "}
                    {new Date(evento.fecha).toLocaleString("es-CL")}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {Math.round(evento.profundidadKm)} km de profundidad
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
