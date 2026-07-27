"use client";

import SelectorMagnitudRangos from "../filtro/SelectorMagnitudRangos";
import { VENTANAS_TIEMPO, type FiltroMapa } from "../../lib/filtro-tipos";

interface ModalFiltroMapaProps {
  abierto: boolean;
  onCerrar: () => void;
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
}

export default function ModalFiltroMapa({
  abierto,
  onCerrar,
  filtro,
  onFiltroChange,
}: ModalFiltroMapaProps) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            Filtrar mapa
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            onFiltroChange({ ...filtro, soloChile: !filtro.soloChile })
          }
          aria-pressed={filtro.soloChile}
          className={`flex min-h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${
            filtro.soloChile
              ? "border-sky-500 bg-sky-500/10 text-sky-400"
              : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          🇨🇱 Solo Chile
        </button>

        <div className="mt-4">
          <p className="mb-2 text-xs text-neutral-400">Magnitud</p>
          <SelectorMagnitudRangos
            seleccionados={filtro.rangos}
            onChange={(rangos) => onFiltroChange({ ...filtro, rangos })}
          />
        </div>

        <div className="mt-4">
          <label
            htmlFor="ventana-tiempo"
            className="mb-2 block text-xs text-neutral-400"
          >
            Ocurridos en
          </label>
          <div className="relative">
            <select
              id="ventana-tiempo"
              value={filtro.ventana}
              onChange={(e) =>
                onFiltroChange({
                  ...filtro,
                  ventana: e.target.value as FiltroMapa["ventana"],
                })
              }
              className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-8 text-sm text-neutral-100 transition-colors hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
            >
              {VENTANAS_TIEMPO.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {v.etiqueta}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
              ▾
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
