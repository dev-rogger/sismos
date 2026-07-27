"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import ModalFiltros from "./configuracion/ModalFiltros";
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
  const [historialExpandido, setHistorialExpandido] = useState(false);
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false);
  const [configuracionAbierta, setConfiguracionAbierta] = useState(false);

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
        magnitudMinima={magnitudMinima}
        expandido={historialExpandido}
        onExpandidoChange={setHistorialExpandido}
      />
      <MenuLateral
        onAbrirHistorial={() => setHistorialExpandido(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
        onAbrirConfiguracion={() => setConfiguracionAbierta(true)}
      />
      <ModalConfiguracion
        abierto={notificacionesAbiertas}
        onCerrar={() => setNotificacionesAbiertas(false)}
      />
      <ModalFiltros
        abierto={configuracionAbierta}
        onCerrar={() => setConfiguracionAbierta(false)}
        soloChile={soloChile}
        onSoloChileChange={setSoloChile}
        magnitudMinima={magnitudMinima}
        onMagnitudMinimaChange={setMagnitudMinima}
      />
    </>
  );
}
