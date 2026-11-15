"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ListaHistorial from "./ListaHistorial";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

interface PantallaHistorialProps {
  abierto: boolean;
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado | null) => void;
  onCerrar: () => void;
}

export default function PantallaHistorial({
  abierto,
  sismoSeleccionado,
  onSeleccionar,
  onCerrar,
}: PantallaHistorialProps) {
  const t = useTranslations("historial");
  const tc = useTranslations("comun");
  useOverlayAccesible(abierto, onCerrar);

  // Queda montada permanentemente (para poder animar su cierre en vez de
  // desaparecer de golpe), pero el fetch del historial se pospone hasta la
  // primera apertura para no duplicar el trabajo de PanelHistorial en
  // desktop, donde esta pantalla ni siquiera se ve (`lg:hidden`).
  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  return (
    <div
      inert={!abierto}
      data-abierto={abierto}
      className="pantalla-overlay lg:hidden"
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

      <ListaHistorial
        activo={huboApertura}
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={(sismo) => {
          onSeleccionar(sismo);
          onCerrar();
        }}
      />
    </div>
  );
}
