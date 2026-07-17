"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador, crearElementoSeleccion } from "./marcador";
import BotonConfiguracion from "../configuracion/BotonConfiguracion";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";

export type { SismoMapa, SismoSeleccionado };

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void;
  soloChile: boolean;
  magnitudMinima: number;
}

const CHILE_CENTER: [number, number] = [-71.5, -35.5];
const CHILE_ZOOM = 4;
const POLL_INTERVAL_MS = 30 * 1000;
const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";

function pasaFiltro(
  sismo: SismoMapa,
  soloChile: boolean,
  magnitudMinima: number,
): boolean {
  if (soloChile && sismo.bandera !== "🇨🇱") return false;
  if (sismo.magnitud < magnitudMinima) return false;
  return true;
}

export default function MapaSismos({
  sismosIniciales,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
  soloChile,
  magnitudMinima,
}: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const todosSismosRef = useRef<Map<string, SismoMapa>>(new Map());
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const nuevosRef = useRef<Set<string>>(new Set());
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
  const soloChileRef = useRef(soloChile);
  soloChileRef.current = soloChile;
  const magnitudMinimaRef = useRef(magnitudMinima);
  magnitudMinimaRef.current = magnitudMinima;

  function crearMarcador(
    map: maplibregl.Map,
    sismo: SismoMapa,
    pulsando: boolean,
  ): maplibregl.Marker {
    const el = crearElementoMarcador(sismo.magnitud, { pulsando });
    el.addEventListener("click", () => {
      if (sismoSeleccionadoRef.current?.externalId === sismo.externalId) {
        onSeleccionarDesdeMapaRef.current(null);
        return;
      }
      onSeleccionarDesdeMapaRef.current({
        externalId: sismo.externalId,
        latitud: sismo.latitud,
        longitud: sismo.longitud,
        magnitud: sismo.magnitud,
        lugar: sismo.lugar,
      });
    });

    return new maplibregl.Marker({ element: el })
      .setLngLat([sismo.longitud, sismo.latitud])
      .setPopup(
        new maplibregl.Popup({ offset: 12, className: "popup-sismo" }).setHTML(
          `<strong>${sismo.lugar}</strong><br/>M${sismo.magnitud} — ${new Date(
            sismo.fecha,
          ).toLocaleString("es-CL")}`,
        ),
      )
      .addTo(map);
  }

  function sincronizarMarcadores(map: maplibregl.Map) {
    const soloChileActual = soloChileRef.current;
    const magnitudMinimaActual = magnitudMinimaRef.current;

    for (const sismo of todosSismosRef.current.values()) {
      const debeMostrarse = pasaFiltro(
        sismo,
        soloChileActual,
        magnitudMinimaActual,
      );
      const yaExiste = marcadoresRef.current.has(sismo.externalId);

      if (debeMostrarse && !yaExiste) {
        const pulsando = nuevosRef.current.has(sismo.externalId);
        const marker = crearMarcador(map, sismo, pulsando);
        marcadoresRef.current.set(sismo.externalId, marker);
        nuevosRef.current.delete(sismo.externalId);
      } else if (!debeMostrarse && yaExiste) {
        marcadoresRef.current.get(sismo.externalId)?.remove();
        marcadoresRef.current.delete(sismo.externalId);
      }
    }
  }

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
      todosSismosRef.current.set(sismo.externalId, sismo);
    }
    sincronizarMarcadores(map);

    const intervalId = setInterval(() => {
      const desde = ultimaFechaRef.current;
      fetch(`/api/sismos?since=${encodeURIComponent(desde)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`poll failed: ${res.status}`);
          return res.json();
        })
        .then((data: { sismos: SismoMapa[] }) => {
          for (const sismo of data.sismos) {
            todosSismosRef.current.set(sismo.externalId, sismo);
            nuevosRef.current.add(sismo.externalId);
            if (sismo.fecha > ultimaFechaRef.current) {
              ultimaFechaRef.current = sismo.fecha;
            }
          }
          sincronizarMarcadores(map);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sismosIniciales]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    sincronizarMarcadores(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloChile, magnitudMinima]);

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
      <div
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="absolute right-3 z-10 flex items-center gap-2"
      >
        <BotonConfiguracion />
        <button
          type="button"
          onClick={() =>
            mapRef.current?.flyTo({
              center: CHILE_CENTER,
              zoom: CHILE_ZOOM,
              speed: 1.2,
            })
          }
          className="flex min-h-11 items-center rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
        >
          Ver todo Chile
        </button>
      </div>
    </div>
  );
}
