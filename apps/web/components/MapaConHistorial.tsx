"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";

interface MapaConHistorialProps {
  sismosIniciales: SismoMapa[];
  sismoInicial: SismoSeleccionado | null;
}

export default function MapaConHistorial({
  sismosIniciales,
  sismoInicial,
}: MapaConHistorialProps) {
  const [sismoSeleccionado, setSismoSeleccionado] =
    useState<SismoSeleccionado | null>(sismoInicial);
  const [soloChile, setSoloChile] = useState(false);
  const [magnitudMinima, setMagnitudMinima] = useState(5);

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          sismosIniciales={sismosIniciales}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={setSismoSeleccionado}
          soloChile={soloChile}
          magnitudMinima={magnitudMinima}
        />
      </div>
      <PanelHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
        soloChile={soloChile}
        onSoloChileChange={setSoloChile}
        magnitudMinima={magnitudMinima}
        onMagnitudMinimaChange={setMagnitudMinima}
      />
    </>
  );
}
