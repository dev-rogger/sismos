"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador, crearElementoSeleccion } from "./marcador";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";

export type { SismoMapa, SismoSeleccionado };

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void;
}

const CHILE_CENTER: [number, number] = [-71.5, -35.5];
const CHILE_ZOOM = 4;
const POLL_INTERVAL_MS = 30 * 1000;
const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";

function agregarMarcador(
  map: maplibregl.Map,
  marcadores: Map<string, maplibregl.Marker>,
  sismo: SismoMapa,
  opciones: { pulsando: boolean },
  sismoSeleccionadoRef: { current: SismoSeleccionado | null },
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void,
) {
  if (marcadores.has(sismo.externalId)) return;

  const el = crearElementoMarcador(sismo.magnitud, opciones);
  el.addEventListener("click", () => {
    if (sismoSeleccionadoRef.current?.externalId === sismo.externalId) {
      onSeleccionarDesdeMapa(null);
      return;
    }
    onSeleccionarDesdeMapa({
      externalId: sismo.externalId,
      latitud: sismo.latitud,
      longitud: sismo.longitud,
      magnitud: sismo.magnitud,
      lugar: sismo.lugar,
    });
  });

  const marker = new maplibregl.Marker({ element: el })
    .setLngLat([sismo.longitud, sismo.latitud])
    .setPopup(
      new maplibregl.Popup({ offset: 12, className: "popup-sismo" }).setHTML(
        `<strong>${sismo.lugar}</strong><br/>M${sismo.magnitud} — ${new Date(
          sismo.fecha,
        ).toLocaleString("es-CL")}`,
      ),
    )
    .addTo(map);

  marcadores.set(sismo.externalId, marker);
}

export default function MapaSismos({
  sismosIniciales,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
}: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ultimaFechaRef = useRef<string>(
    sismosIniciales.reduce(
      (max, s) => (s.fecha > max ? s.fecha : max),
      sismosIniciales[0]?.fecha ?? new Date(0).toISOString(),
    ),
  );
  const onSeleccionarDesdeMapaRef = useRef(onSeleccionarDesdeMapa);
  onSeleccionarDesdeMapaRef.current = onSeleccionarDesdeMapa;
  const sismoSeleccionadoRef = useRef(sismoSeleccionado);
  sismoSeleccionadoRef.current = sismoSeleccionado;

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: ESTILO_URL,
      center: CHILE_CENTER,
      zoom: CHILE_ZOOM,
    });
    mapRef.current = map;

    for (const sismo of sismosIniciales) {
      agregarMarcador(
        map,
        marcadoresRef.current,
        sismo,
        { pulsando: false },
        sismoSeleccionadoRef,
        (s) => onSeleccionarDesdeMapaRef.current(s),
      );
    }

    const intervalId = setInterval(() => {
      const desde = ultimaFechaRef.current;
      fetch(`/api/sismos?since=${encodeURIComponent(desde)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`poll failed: ${res.status}`);
          return res.json();
        })
        .then((data: { sismos: SismoMapa[] }) => {
          for (const sismo of data.sismos) {
            agregarMarcador(
              map,
              marcadoresRef.current,
              sismo,
              { pulsando: true },
              sismoSeleccionadoRef,
              (s) => onSeleccionarDesdeMapaRef.current(s),
            );
            if (sismo.fecha > ultimaFechaRef.current) {
              ultimaFechaRef.current = sismo.fecha;
            }
          }
        })
        .catch((error) => {
          console.error("[MapaSismos] poll error:", error);
        });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      map.remove();
      mapRef.current = null;
    };
  }, [sismosIniciales]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sismoSeleccionado) return;

    map.flyTo({
      center: [sismoSeleccionado.longitud, sismoSeleccionado.latitud],
      zoom: Math.max(map.getZoom(), 6),
      speed: 1.2,
    });

    const el = crearElementoSeleccion();
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([sismoSeleccionado.longitud, sismoSeleccionado.latitud])
      .addTo(map);

    return () => {
      marker.remove();
    };
  }, [sismoSeleccionado]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      <button
        type="button"
        onClick={() =>
          mapRef.current?.flyTo({
            center: CHILE_CENTER,
            zoom: CHILE_ZOOM,
            speed: 1.2,
          })
        }
        className="absolute top-3 right-3 z-10 rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 py-1.5 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
      >
        Ver todo Chile
      </button>
    </div>
  );
}
