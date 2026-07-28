"use client";

import { useEffect, useRef, useState } from "react";
import { formatearCoordenadas } from "../../lib/coordenadas";
import { colorPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "@sismos/shared";
import { useHistorial, OPCIONES_TIPO } from "../../lib/use-historial";
import {
  FILTRO_HISTORIAL_DEFAULT,
  type FiltroHistorial,
} from "../../lib/filtro-tipos";
import SelectorMagnitudRangos from "../filtro/SelectorMagnitudRangos";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

interface PantallaHistorialProps {
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado | null) => void;
  onCerrar: () => void;
}

export default function PantallaHistorial({
  sismoSeleccionado,
  onSeleccionar,
  onCerrar,
}: PantallaHistorialProps) {
  const [filtro, setFiltro] = useState<FiltroHistorial>(
    FILTRO_HISTORIAL_DEFAULT,
  );
  const { tipo, setTipo, eventosFiltrados } = useHistorial(filtro);
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());

  useEffect(() => {
    if (!sismoSeleccionado) return;
    const el = itemRefs.current.get(sismoSeleccionado.externalId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sismoSeleccionado, eventosFiltrados]);

  return (
    <div
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className="fixed inset-0 z-40 flex flex-col bg-neutral-900 lg:hidden"
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-300 hover:bg-neutral-800"
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
          Historial de sismos
        </h1>
      </div>

      <div className="shrink-0 border-b border-neutral-800 px-4 py-3">
        <div className="relative">
          <select
            value={tipo}
            onChange={(e) =>
              setTipo(e.target.value as (typeof OPCIONES_TIPO)[number]["valor"])
            }
            className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-8 text-sm text-neutral-100 transition-colors hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
          >
            {OPCIONES_TIPO.map((opcion) => (
              <option key={opcion.valor} value={opcion.valor}>
                {opcion.etiqueta}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
            ▾
          </span>
        </div>

        <button
          type="button"
          onClick={() =>
            setFiltro((f) => ({ ...f, soloChile: !f.soloChile }))
          }
          aria-pressed={filtro.soloChile}
          className={`mt-2 flex min-h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${
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
                onClick={() => {
                  onSeleccionar({
                    externalId: evento.externalId,
                    latitud: evento.latitud,
                    longitud: evento.longitud,
                    magnitud: evento.magnitud,
                    lugar: evento.lugar,
                    fecha: evento.fecha,
                    bandera: evento.bandera,
                    profundidadKm: evento.profundidadKm,
                  });
                  onCerrar();
                }}
                style={{ borderLeftColor: colorPorMagnitud(evento.magnitud) }}
                className={`w-full rounded-lg border border-l-4 px-3 py-2 text-left text-sm transition-colors ${
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
    </div>
  );
}
