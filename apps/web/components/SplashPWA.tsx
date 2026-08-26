"use client";

import { useEffect, useRef, useState } from "react";

// Piso: la coreografía (traza → impacto → ícono → título) tarda ~1.5s en
// asentarse; si el mapa está listo antes, igual esperamos a que termine el
// remate en vez de cortarlo a mitad de camino.
const DURACION_MINIMA_MS = 2100;
// Techo: si el evento "mapa listo" nunca llega (ruta sin mapa, error, red muy
// lenta), no queremos que el splash se quede pegado para siempre.
const DURACION_MAXIMA_MS = 6000;
const DURACION_SALIDA_MS = 280;

// Fallback para iOS viejo, que no soporta la media query
// `(display-mode: standalone)` que usa el CSS para mostrar el splash
// desde el primer paint sin esperar a que cargue el JS.
function esStandaloneLegacyIOS(): boolean {
  if (typeof window === "undefined") return false;
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

export default function SplashPWA() {
  // El splash se muestra por CSS (media query en globals.css), no por este
  // estado: así aparece en el primer paint en vez de recién tras hidratar.
  // Este componente solo decide CUÁNDO se va y agrega el fallback iOS.
  const [terminado, setTerminado] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [standaloneLegacy, setStandaloneLegacy] = useState(false);
  const yaSalioRef = useRef(false);

  useEffect(() => {
    setStandaloneLegacy(esStandaloneLegacyIOS());

    const inicio = Date.now();

    function salir() {
      if (yaSalioRef.current) return;
      yaSalioRef.current = true;
      setSaliendo(true);
      setTimeout(() => setTerminado(true), DURACION_SALIDA_MS);
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

  if (terminado) return null;

  return (
    <div
      className="splash-pwa"
      data-saliendo={saliendo}
      data-standalone-legacy={standaloneLegacy}
    >
      <div className="flex flex-col items-center">
        <div className="splash-epicentro">
          <span className="splash-resplandor" />
          <svg
            className="splash-sismografo"
            viewBox="0 0 240 64"
            width="220"
            height="59"
            aria-hidden="true"
          >
            <path
              className="splash-trazo"
              d="M0,32 L60,32 L72,26 L84,38 L96,18 L104,52 L112,6 L120,58 L128,28 L136,36 L148,32 L240,32"
              pathLength="1"
              fill="none"
              stroke="#f97316"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="splash-impacto" />
          <span className="splash-onda splash-onda--1" />
          <span className="splash-onda splash-onda--2" />
          <span className="splash-onda splash-onda--3" />
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
