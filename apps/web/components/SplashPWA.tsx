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
          <div className="splash-cinta">
            {/* Cinta de sismógrafo: 900 unidades de ancho (1 unidad = 1px)
                dentro de un contenedor de 260px — la aguja fija está en el
                centro del contenedor. La ráfaga P-S ocupa x=340 a x=430
                (centro en x=385): a 300px/s de scroll, ese centro cruza
                los 130px del contenedor (su punto medio) a los 0.85s. */}
            <svg
              className="splash-cinta-trazo"
              viewBox="0 0 900 64"
              width="900"
              height="64"
              aria-hidden="true"
            >
              <path
                d="M0,32 L40,30 L80,33 L120,31 L160,34 L200,30 L240,33 L280,31 L320,32 L340,32 L352,26 L364,38 L376,18 L384,52 L392,6 L400,58 L408,28 L416,36 L430,32 L440,30 L480,33 L520,31 L560,32 L600,31 L640,32 L680,31 L720,32 L760,31 L800,32 L840,31 L880,32 L900,32"
                fill="none"
                stroke="#f97316"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="splash-aguja" />
          <span className="splash-destello" />
          <span className="splash-onda splash-onda--1" />
          <span className="splash-onda splash-onda--2" />
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
          <span className="sr-only">Sismos</span>
          <span aria-hidden="true">
            {"Sismos".split("").map((letra, indice) => (
              <span key={indice} className="splash-titulo-letra">
                {letra}
              </span>
            ))}
          </span>
        </p>
      </div>
    </div>
  );
}
