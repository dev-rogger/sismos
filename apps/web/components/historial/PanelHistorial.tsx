"use client";

import ListaHistorial from "./ListaHistorial";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

interface PanelHistorialProps {
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado | null) => void;
}

export default function PanelHistorial({
  sismoSeleccionado,
  onSeleccionar,
}: PanelHistorialProps) {
  return (
    <div className="hidden h-full w-[360px] flex-col border-l border-neutral-800 bg-neutral-900 lg:flex">
      <div className="shrink-0 px-4 pt-4 pb-2">
        <h2 className="text-base font-semibold text-neutral-100">
          Historial de sismos
        </h2>
      </div>
      <ListaHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={(sismo, seleccionado) =>
          onSeleccionar(seleccionado ? null : sismo)
        }
      />
    </div>
  );
}
