"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import PantallaHistorial from "./historial/PantallaHistorial";
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import { useFiltroMapa } from "../lib/use-filtro-mapa";
import { useUbicacionUsuario } from "../lib/use-ubicacion-usuario";
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
  const { ubicacion, pedirUbicacion, setRadioKm } = useUbicacionUsuario();
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false);

  // Una selección que viene del mapa (clic manual o foco automático por un
  // sismo nuevo) solo puede ocurrir cuando el historial fullscreen no está
  // tapando el mapa, o es justamente el caso en que queremos interrumpirlo
  // para mostrarlo — en ambos casos, cerrarlo es lo correcto.
  const seleccionarDesdeMapa = (sismo: SismoSeleccionado | null) => {
    setSismoSeleccionado(sismo);
    setHistorialAbierto(false);
  };

  return (
    <>
      <div className="relative flex-1">
        <MapaSismos
          sismosIniciales={sismosIniciales}
          sismoSeleccionado={sismoSeleccionado}
          onSeleccionarDesdeMapa={seleccionarDesdeMapa}
          onActualizarSismoSeleccionado={setSismoSeleccionado}
          filtro={filtro}
          onFiltroChange={setFiltro}
          ubicacion={ubicacion}
          onPedirUbicacion={pedirUbicacion}
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
        ubicacion={ubicacion}
        onPedirUbicacion={pedirUbicacion}
        onSetRadioKm={setRadioKm}
      />
    </>
  );
}
