"use client";

import { useEffect, useState } from "react";
import MapaSismos from "./mapa/MapaSismos";
import PanelHistorial from "./historial/PanelHistorial";
import PantallaHistorial from "./historial/PantallaHistorial";
import PantallaFallas from "./fallas/PantallaFallas";
import PantallaUsuarios from "./admin/PantallaUsuarios";
import PantallaReportes from "./admin/PantallaReportes";
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
  // Deep link de fallback desde las viejas rutas /admin/usuarios y
  // /admin/reportes (ver app/admin/*/page.tsx): abre el overlay
  // correspondiente apenas monta, en vez de navegar a una página aparte.
  adminInicial: "usuarios" | "reportes" | null;
  // Si el fetch inicial de sismos falló en el servidor (ver app/page.tsx),
  // el mapa arranca con sismosIniciales vacío sin que eso signifique
  // realmente "no hay sismos" — se le pasa a MapaSismos para que muestre el
  // mismo banner de "Sin conexión" desde el primer render en vez de recién
  // tras el primer fallo del polling.
  errorCargaInicial?: boolean;
}

export default function MapaConHistorial({
  sismosIniciales,
  sismoInicial,
  adminInicial,
  errorCargaInicial,
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
  const [usuariosAbierto, setUsuariosAbierto] = useState(
    adminInicial === "usuarios",
  );
  const [reportesAbierto, setReportesAbierto] = useState(
    adminInicial === "reportes",
  );
  const [menuAbierto, setMenuAbierto] = useState(false);

  // El toast de invitación a notificaciones vive más arriba en el árbol
  // (junto a SessionProviderWrapper), fuera de este componente — este evento
  // es el puente para que su botón "Activar" pueda abrir este panel, igual
  // que "sismos:mapa-listo" conecta MapaSismos con SplashPWA.
  useEffect(() => {
    function alPedirAbrirNotificaciones() {
      setNotificacionesAbiertas(true);
    }
    window.addEventListener(
      "sismos:abrir-notificaciones",
      alPedirAbrirNotificaciones,
    );
    return () => {
      window.removeEventListener(
        "sismos:abrir-notificaciones",
        alPedirAbrirNotificaciones,
      );
    };
  }, []);

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
      usuariosAbierto ||
      reportesAbierto ||
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
          errorCargaInicial={errorCargaInicial}
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
      <PantallaUsuarios
        abierto={usuariosAbierto}
        onCerrar={() => setUsuariosAbierto(false)}
      />
      <PantallaReportes
        abierto={reportesAbierto}
        onCerrar={() => setReportesAbierto(false)}
      />
      <MenuLateral
        onAbrirHistorial={() => setHistorialAbierto(true)}
        onAbrirFallas={() => setPantallaFallasAbierta(true)}
        onAbrirNotificaciones={() => setNotificacionesAbiertas(true)}
        onAbrirUsuarios={() => setUsuariosAbierto(true)}
        onAbrirReportes={() => setReportesAbierto(true)}
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
