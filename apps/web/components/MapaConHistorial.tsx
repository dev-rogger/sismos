"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import PantallaHistorial from "./historial/PantallaHistorial";
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import { useFiltroMapa } from "../lib/use-filtro-mapa";
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
  const { filtro, setFiltro } = useFiltroMapa();
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false);

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          sismosIniciales={sismosIniciales}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={setSismoSeleccionado}
          filtro={filtro}
          onFiltroChange={setFiltro}
        />
      </div>
      <PanelHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
      />
      {historialAbierto && (
        <PantallaHistorial
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionar={setSismoSeleccionado}
          onCerrar={() => setHistorialAbierto(false)}
        />
      )}
      <MenuLateral
        onAbrirHistorial={() => setHistorialAbierto(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
      />
      <ModalConfiguracion
        abierto={notificacionesAbiertas}
        onCerrar={() => setNotificacionesAbiertas(false)}
      />
    </>
  );
}
