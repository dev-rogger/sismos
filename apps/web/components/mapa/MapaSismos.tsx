"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador } from "./marcador";

export interface SismoMapa {
  externalId: string;
  fecha: string;
  magnitud: number;
  latitud: number;
  longitud: number;
  lugar: string;
}

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
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
) {
  if (marcadores.has(sismo.externalId)) return;

  const el = crearElementoMarcador(sismo.magnitud, opciones);
  const marker = new maplibregl.Marker({ element: el })
    .setLngLat([sismo.longitud, sismo.latitud])
    .setPopup(
      new maplibregl.Popup({ offset: 12 }).setHTML(
        `<strong>${sismo.lugar}</strong><br/>M${sismo.magnitud} — ${new Date(
          sismo.fecha,
        ).toLocaleString("es-CL")}`,
      ),
    )
    .addTo(map);

  marcadores.set(sismo.externalId, marker);
}

export default function MapaSismos({ sismosIniciales }: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const ultimaFechaRef = useRef<string>(
    sismosIniciales.reduce(
      (max, s) => (s.fecha > max ? s.fecha : max),
      sismosIniciales[0]?.fecha ?? new Date(0).toISOString(),
    ),
  );

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
      agregarMarcador(map, marcadoresRef.current, sismo, { pulsando: false });
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
            agregarMarcador(map, marcadoresRef.current, sismo, {
              pulsando: true,
            });
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

  return <div ref={mapContainerRef} className="h-full w-full" />;
}
