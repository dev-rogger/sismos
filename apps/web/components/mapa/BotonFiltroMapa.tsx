"use client";

import { useState } from "react";
import ModalFiltroMapa from "./ModalFiltroMapa";
import { filtroMapaEsDefault, type FiltroMapa } from "../../lib/filtro-tipos";

interface BotonFiltroMapaProps {
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
}

export default function BotonFiltroMapa({
  filtro,
  onFiltroChange,
}: BotonFiltroMapaProps) {
  const [abierto, setAbierto] = useState(false);
  const filtroActivo = !filtroMapaEsDefault(filtro);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={
          filtroActivo ? "Filtrar mapa (filtro activo)" : "Filtrar mapa"
        }
        className={`relative flex min-h-11 items-center gap-2 rounded-lg border px-3 text-xs font-medium shadow-lg transition-colors ${
          filtroActivo
            ? "border-sky-500 bg-sky-500/10 text-sky-400"
            : "border-neutral-700 bg-neutral-900/90 text-neutral-100 hover:bg-neutral-800"
        }`}
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
          <path d="M4 5h16" />
          <path d="M7 12h10" />
          <path d="M10 19h4" />
        </svg>
        Filtro
        <span
          aria-hidden="true"
          className={`absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-sky-500 transition-[scale,opacity] duration-150 motion-reduce:transition-none ${
            filtroActivo ? "scale-100 opacity-100" : "scale-75 opacity-0"
          }`}
        />
      </button>
      <ModalFiltroMapa
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        filtro={filtro}
        onFiltroChange={onFiltroChange}
      />
    </>
  );
}
