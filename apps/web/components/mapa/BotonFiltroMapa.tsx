"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("filtro");

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={filtroActivo ? t("abrirActivo") : t("abrir")}
        data-activo={filtroActivo}
        className="btn-mapa"
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
        {t("boton")}
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
