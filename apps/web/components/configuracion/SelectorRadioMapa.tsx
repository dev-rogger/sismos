"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { generarCirculoGeografico } from "../../lib/circulo-geografico";

const ESTILO_URL = "https://tiles.openfreemap.org/styles/liberty";
const FUENTE_CIRCULO = "circulo-radio";

interface SelectorRadioMapaProps {
  centro: { lat: number; lon: number };
  radioKm: number;
}

export default function SelectorRadioMapa({
  centro,
  radioKm,
}: SelectorRadioMapaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const actualizarCirculo = (radio: number) => {
    const map = mapRef.current;
    if (!map) return;
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
    if (!contenedorRef.current) return;

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
  }, []);

  useEffect(() => {
    actualizarCirculo(radioKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioKm]);

  return (
    <div
      ref={contenedorRef}
      className="h-40 w-full overflow-hidden rounded-xl border border-neutral-800"
    />
  );
}
