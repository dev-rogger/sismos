"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { crearElementoMarcador, crearElementoSeleccion } from "./marcador";
import BotonFiltroMapa from "./BotonFiltroMapa";
import { magnitudPasaRangos, fechaPasaVentana } from "../../lib/filtro-tipos";
import type { FiltroMapa } from "../../lib/filtro-tipos";
import { colorPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "@sismos/shared";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";

export type { SismoMapa, SismoSeleccionado };

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void;
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
}

// Chile es muy largo y angosto (~4300 km de norte a sur): un center+zoom
// fijo no lo encuadra bien en pantallas de distinto aspecto. Con un
// bounding box, MapLibre calcula el zoom óptimo según el viewport actual.
const CHILE_BOUNDS: [[number, number], [number, number]] = [
  [-76, -56],
  [-66, -17.3],
];
const CHILE_BOUNDS_PADDING = 24;
const POLL_INTERVAL_MS = 15 * 1000;
const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";

function pasaFiltro(sismo: SismoMapa, filtro: FiltroMapa): boolean {
  if (filtro.soloChile && sismo.bandera !== "🇨🇱") return false;
  if (!magnitudPasaRangos(sismo.magnitud, filtro.rangos)) return false;
  if (!fechaPasaVentana(sismo.fecha, filtro.ventana)) return false;
  return true;
}

function construirHtmlPopup(sismo: SismoSeleccionado): string {
  const region =
    sismo.bandera === "🇨🇱" ? regionChilePorLatitud(sismo.latitud) : null;
  const fechaTexto = sismo.fecha
    ? new Date(sismo.fecha).toLocaleString("es-CL")
    : null;

  return `
    <div class="popup-sismo-cabecera">
      <span>${sismo.bandera ?? "🌎"}</span>
      <span class="popup-sismo-lugar">${sismo.lugar}</span>
    </div>
    ${region ? `<div class="popup-sismo-region">${region}</div>` : ""}
    <div class="popup-sismo-magnitud" style="color: ${colorPorMagnitud(sismo.magnitud)}">
      M${sismo.magnitud}
    </div>
    ${fechaTexto ? `<div class="popup-sismo-fecha">${fechaTexto}</div>` : ""}
  `;
}

export default function MapaSismos({
  sismosIniciales,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
  filtro,
  onFiltroChange,
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
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;

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
        fecha: sismo.fecha,
        bandera: sismo.bandera,
      });
    });

    return new maplibregl.Marker({ element: el })
      .setLngLat([sismo.longitud, sismo.latitud])
      .addTo(map);
  }

  function sincronizarMarcadores(map: maplibregl.Map) {
    const filtroActual = filtroRef.current;

    for (const sismo of todosSismosRef.current.values()) {
      const debeMostrarse = pasaFiltro(sismo, filtroActual);
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
      bounds: CHILE_BOUNDS,
      fitBoundsOptions: { padding: CHILE_BOUNDS_PADDING },
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

          // Foco automático: si algo de lo nuevo pasa el filtro actual,
          // lo seleccionamos solos (mismo flujo que un clic manual: vuela
          // el mapa, abre el popup, ya trae la animación de pulso). Con
          // varios a la vez, priorizamos el de mayor magnitud.
          const nuevosQuePasanFiltro = data.sismos.filter((s) =>
            pasaFiltro(s, filtroRef.current),
          );
          if (nuevosQuePasanFiltro.length > 0) {
            const masSignificativo = nuevosQuePasanFiltro.reduce((a, b) =>
              b.magnitud > a.magnitud ? b : a,
            );
            onSeleccionarDesdeMapaRef.current({
              externalId: masSignificativo.externalId,
              latitud: masSignificativo.latitud,
              longitud: masSignificativo.longitud,
              magnitud: masSignificativo.magnitud,
              lugar: masSignificativo.lugar,
              fecha: masSignificativo.fecha,
              bandera: masSignificativo.bandera,
            });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sismosIniciales]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    sincronizarMarcadores(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtro]);

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
      .setPopup(
        new maplibregl.Popup({
          offset: 12,
          className: "popup-sismo",
          closeOnClick: false,
        }).setHTML(construirHtmlPopup(sismoSeleccionado)),
      )
      .addTo(map);
    marker.togglePopup();

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
        <BotonFiltroMapa filtro={filtro} onFiltroChange={onFiltroChange} />
        <button
          type="button"
          onClick={() =>
            mapRef.current?.fitBounds(CHILE_BOUNDS, {
              padding: CHILE_BOUNDS_PADDING,
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
