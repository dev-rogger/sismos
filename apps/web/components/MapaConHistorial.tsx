"use client";

import { useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import PantallaHistorial from "./historial/PantallaHistorial";
import PantallaFallas from "./fallas/PantallaFallas";
import MenuLateral from "./menu/MenuLateral";
import ModalConfiguracion from "./configuracion/ModalConfiguracion";
import ModalInstalarApp from "./instalar/ModalInstalarApp";
import { useFiltroMapa } from "../lib/use-filtro-mapa";
import { useUbicacionUsuario } from "../lib/use-ubicacion-usuario";
import { useInstalarApp } from "../lib/use-instalar-app";
import { useCapaFallas } from "../lib/use-capa-fallas";
import type { SismoMapa, SismoSeleccionado } from "../lib/tipos-sismo";
import type { FallaSeleccionada } from "../lib/tipos-falla";

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
  // Si la selección actual vino de la pantalla de historial fullscreen
  // (mobile), cerrar su popup en el mapa debería devolver al usuario a esa
  // lista en vez de dejarlo mirando el mapa pelado — ahí es donde estaba
  // antes de tocar el sismo.
  const [seleccionDesdeHistorial, setSeleccionDesdeHistorial] =
    useState(false);
  const { filtro, setFiltro } = useFiltroMapa();
  const { ubicacion, pedirUbicacion, setRadioKm } = useUbicacionUsuario();
  const { fallasVisibles, setFallasVisibles } = useCapaFallas();
  const [fallaSeleccionada, setFallaSeleccionada] =
    useState<FallaSeleccionada | null>(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [pantallaFallasAbierta, setPantallaFallasAbierta] = useState(false);
  const [notificacionesAbiertas, setNotificacionesAbiertas] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const {
    puedeInstalar,
    plataforma,
    promptDisponible,
    visible: instalarVisible,
    instalar,
    descartar,
    abrirManual,
  } = useInstalarApp(
    historialAbierto ||
      pantallaFallasAbierta ||
      notificacionesAbiertas ||
      menuAbierto,
  );

  const seleccionarFallaDesdeLista = (falla: FallaSeleccionada) => {
    setFallaSeleccionada(falla);
    setFallasVisibles(true);
    setPantallaFallasAbierta(false);
  };

  // Una selección que viene del mapa (clic manual o foco automático por un
  // sismo nuevo) solo puede ocurrir cuando el historial fullscreen no está
  // tapando el mapa, o es justamente el caso en que queremos interrumpirlo
  // para mostrarlo — en ambos casos, cerrarlo es lo correcto.
  const seleccionarDesdeMapa = (sismo: SismoSeleccionado | null) => {
    if (sismo === null && seleccionDesdeHistorial) {
      setSeleccionDesdeHistorial(false);
      setHistorialAbierto(true);
      return;
    }
    setSismoSeleccionado(sismo);
    setSeleccionDesdeHistorial(false);
    setHistorialAbierto(false);
  };

  const seleccionarDesdeHistorial = (sismo: SismoSeleccionado | null) => {
    setSismoSeleccionado(sismo);
    setSeleccionDesdeHistorial(sismo !== null);
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
          fallasVisibles={fallasVisibles}
          onFallasVisiblesChange={setFallasVisibles}
          fallaSeleccionada={fallaSeleccionada}
          onSeleccionarFalla={setFallaSeleccionada}
        />
      </div>
      <PanelHistorial
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={setSismoSeleccionado}
      />
      <PantallaHistorial
        abierto={historialAbierto}
        sismoSeleccionado={sismoSeleccionado}
        onSeleccionar={seleccionarDesdeHistorial}
        onCerrar={() => setHistorialAbierto(false)}
      />
      <PantallaFallas
        abierto={pantallaFallasAbierta}
        onSeleccionar={seleccionarFallaDesdeLista}
        onCerrar={() => setPantallaFallasAbierta(false)}
      />
      <MenuLateral
        onAbrirHistorial={() => setHistorialAbierto(true)}
        onAbrirFallas={() => setPantallaFallasAbierta(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
        puedeInstalarApp={puedeInstalar}
        onAbrirInstalarApp={abrirManual}
        onAbiertoChange={setMenuAbierto}
      />
      <ModalConfiguracion
        abierto={notificacionesAbiertas}
        onCerrar={() => setNotificacionesAbiertas(false)}
        ubicacion={ubicacion}
        onPedirUbicacion={pedirUbicacion}
        onSetRadioKm={setRadioKm}
      />
      <ModalInstalarApp
        visible={instalarVisible}
        plataforma={plataforma}
        promptDisponible={promptDisponible}
        onInstalar={instalar}
        onDescartar={descartar}
      />
    </>
  );
}
