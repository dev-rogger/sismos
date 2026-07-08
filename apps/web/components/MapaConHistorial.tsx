"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";

interface MapaConHistorialProps {
  sismosIniciales: SismoMapa[];
}

export default function MapaConHistorial({
  sismosIniciales,
}: MapaConHistorialProps) {
  const [sismoSeleccionado, setSismoSeleccionado] =
    useState<SismoSeleccionado | null>(null);

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          sismosIniciales={sismosIniciales}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={setSismoSeleccionado}
        />
      </div>
      <PanelHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
      />
    </>
  );
}
