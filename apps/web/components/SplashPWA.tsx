"use client";

import { useEffect, useRef, useState } from "react";

// Piso: aunque el mapa esté listo al instante (caché, red rápida), el splash
// se ve al menos esto para que se sienta una intro real, no un flash.
const DURACION_MINIMA_MS = 1800;
// Techo: si el evento "mapa listo" nunca llega (ruta sin mapa, error, red muy
// lenta), no queremos que el splash se quede pegado para siempre.
const DURACION_MAXIMA_MS = 6000;
const DURACION_SALIDA_MS = 450;

function esStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const porMediaQuery = window.matchMedia?.(
    "(display-mode: standalone)",
  ).matches;
  const porIosLegacy =
    (window.navigator as { standalone?: boolean }).standalone === true;
  return Boolean(porMediaQuery || porIosLegacy);
}

export default function SplashPWA() {
  const [mostrar, setMostrar] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const yaSalioRef = useRef(false);

  useEffect(() => {
    if (!esStandalone()) return;

    setMostrar(true);
    const inicio = Date.now();

    function salir() {
      if (yaSalioRef.current) return;
      yaSalioRef.current = true;
      setSaliendo(true);
      setTimeout(() => setMostrar(false), DURACION_SALIDA_MS);
    }

    function alMapaListo() {
      const transcurrido = Date.now() - inicio;
      const restante = Math.max(0, DURACION_MINIMA_MS - transcurrido);
      setTimeout(salir, restante);
    }

    window.addEventListener("sismos:mapa-listo", alMapaListo);
    const maxTimer = setTimeout(salir, DURACION_MAXIMA_MS);

    return () => {
      window.removeEventListener("sismos:mapa-listo", alMapaListo);
      clearTimeout(maxTimer);
    };
  }, []);

  if (!mostrar) return null;

  return (
    <div className="splash-pwa" data-saliendo={saliendo}>
      <div className="flex flex-col items-center">
        <div className="splash-epicentro">
          <span className="splash-anillo" />
          <span className="splash-anillo" />
          <span className="splash-anillo" />
          <span className="splash-resplandor" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/icon-192.png"
            alt=""
            width={80}
            height={80}
            className="splash-icono"
          />
        </div>
        <p className="splash-titulo text-2xl font-semibold tracking-tight text-neutral-100">
          Sismos
        </p>
      </div>
    </div>
  );
}
