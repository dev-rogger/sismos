"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { generarCirculoGeografico } from "../../lib/circulo-geografico";

const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";
const FUENTE_CIRCULO = "circulo-radio";

interface SelectorRadioMapaProps {
  radioKm: number;
  onUbicacionLista: (centro: { lat: number; lon: number } | null) => void;
}

export default function SelectorRadioMapa({
  radioKm,
  onUbicacionLista,
}: SelectorRadioMapaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const centroRef = useRef<{ lat: number; lon: number } | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">(
    "cargando",
  );

  const actualizarCirculo = (radio: number) => {
    const map = mapRef.current;
    const centro = centroRef.current;
    if (!map || !centro) return;
    const circulo = generarCirculoGeografico(centro, radio);
    const fuente = map.getSource(FUENTE_CIRCULO) as
      | maplibregl.GeoJSONSource
      | undefined;
    fuente?.setData(circulo);

    const lngs = circulo.geometry.coordinates[0]!.map((c) => c[0]!);
    const lats = circulo.geometry.coordinates[0]!.map((c) => c[1]!);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 24, duration: 300 },
    );
  };

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setEstado("error");
      onUbicacionLista(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const centro = {
          lat: posicion.coords.latitude,
          lon: posicion.coords.longitude,
        };
        centroRef.current = centro;
        setEstado("listo");
        onUbicacionLista(centro);
      },
      () => {
        setEstado("error");
        onUbicacionLista(null);
      },
      { enableHighAccuracy: false, timeout: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estado !== "listo" || !contenedorRef.current || !centroRef.current) {
      return;
    }
    const centro = centroRef.current;

    const map = new maplibregl.Map({
      container: contenedorRef.current,
      style: ESTILO_URL,
      center: [centro.lon, centro.lat],
      zoom: 6,
      interactive: false,
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(FUENTE_CIRCULO, {
        type: "geojson",
        data: generarCirculoGeografico(centro, radioKm),
      });
      map.addLayer({
        id: `${FUENTE_CIRCULO}-relleno`,
        type: "fill",
        source: FUENTE_CIRCULO,
        paint: { "fill-color": "#0ea5e9", "fill-opacity": 0.18 },
      });
      map.addLayer({
        id: `${FUENTE_CIRCULO}-borde`,
        type: "line",
        source: FUENTE_CIRCULO,
        paint: { "line-color": "#38bdf8", "line-width": 2 },
      });
      map.addLayer({
        id: `${FUENTE_CIRCULO}-centro`,
        type: "circle",
        source: FUENTE_CIRCULO,
        filter: ["==", "$type", "Point"],
        paint: { "circle-color": "#38bdf8", "circle-radius": 5 },
      });
      actualizarCirculo(radioKm);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  useEffect(() => {
    actualizarCirculo(radioKm);
  }, [radioKm]);

  if (estado === "cargando") {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-800/50 text-xs text-neutral-400">
        Buscando tu ubicación…
      </div>
    );
  }

  if (estado === "error") {
    return null;
  }

  return (
    <div
      ref={contenedorRef}
      className="h-40 w-full overflow-hidden rounded-xl border border-neutral-800"
    />
  );
}
