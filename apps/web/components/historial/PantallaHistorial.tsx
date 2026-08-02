"use client";

import { useState } from "react";
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
  useOverlayAccesible(abierto, onCerrar);

  // Queda montada permanentemente (para poder animar su cierre en vez de
  // desaparecer de golpe), pero el fetch del historial se pospone hasta la
  // primera apertura para no duplicar el trabajo de PanelHistorial en
  // desktop, donde esta pantalla ni siquiera se ve (`lg:hidden`).
  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 flex flex-col bg-neutral-900 transition-transform duration-200 ease-out motion-reduce:transition-none lg:hidden ${
        abierto ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
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
