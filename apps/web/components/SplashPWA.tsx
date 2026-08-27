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
      <div className="splash-fondo" aria-hidden="true" />
      <div className="splash-contenido flex flex-col items-center">
        <div className="splash-epicentro">
          <span className="splash-resplandor" />
          <span className="splash-bloom" />
          <div className="splash-cinta">
            {/* Cinta de sismógrafo: el SVG (350% del ancho del
                contenedor, que a su vez es 88vw) se traslada en
                porcentaje de su propio ancho, no en px fijos — así la
                sincronía se mantiene exacta en cualquier dispositivo. La
                aguja fija está en el centro del contenedor. La ráfaga
                P-S ocupa x=340 a x=428 del viewBox (centro ~x=384): ese
                centro cruza el punto medio del contenedor a los 0.85s
                (ver la nota de cálculo junto a splash-cinta-recorrer). */}
            <svg
              className="splash-cinta-trazo"
              viewBox="0 0 900 96"
              aria-hidden="true"
            >
              <path
                d="M0,48 L40,46 L80,50 L120,47 L160,51 L200,46 L240,49 L280,47 L320,48 L340,48 L352,38 L364,58 L376,26 L384,80 L392,6 L400,90 L408,42 L416,54 L428,48 L440,46 L480,50 L520,47 L560,48 L600,47 L640,48 L680,47 L720,48 L760,47 L800,48 L840,47 L880,48 L900,48"
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
            width={112}
            height={112}
            className="splash-icono"
          />
        </div>
        <p className="splash-titulo text-4xl font-semibold tracking-tight">
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
