"use client";

import { useState } from "react";
import ModalFiltroMapa from "./ModalFiltroMapa";
import type { FiltroMapa } from "../../lib/filtro-tipos";

interface BotonFiltroMapaProps {
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
}

export default function BotonFiltroMapa({
  filtro,
  onFiltroChange,
}: BotonFiltroMapaProps) {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Filtrar mapa"
        className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
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
