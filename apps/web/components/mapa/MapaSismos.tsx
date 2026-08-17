"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  crearElementoMarcador,
  crearElementoSeleccion,
  crearElementoUbicacion,
} from "./marcador";
import BotonFiltroMapa from "./BotonFiltroMapa";
import BotonFallasMapa from "./BotonFallasMapa";
import { magnitudPasaRangos, fechaPasaVentana } from "../../lib/filtro-tipos";
import type { FiltroMapa } from "../../lib/filtro-tipos";
import { colorPorMagnitud, colorTextoPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud, distanciaKm } from "@sismos/shared";
import { generarCirculoGeografico } from "../../lib/circulo-geografico";
import { radioPercepcionKm } from "../../lib/radio-percepcion";
import type { SismoMapa, SismoSeleccionado } from "../../lib/tipos-sismo";
import type { UbicacionUsuario } from "../../lib/use-ubicacion-usuario";
import type { FallaSeleccionada } from "../../lib/tipos-falla";

export type { SismoMapa, SismoSeleccionado };

interface MapaSismosProps {
  sismosIniciales: SismoMapa[];
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionarDesdeMapa: (sismo: SismoSeleccionado | null) => void;
  onActualizarSismoSeleccionado: (sismo: SismoSeleccionado) => void;
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
  ubicacion: UbicacionUsuario;
  onPedirUbicacion: () => Promise<{ lat: number; lon: number } | null>;
  fallasVisibles: boolean;
  onFallasVisiblesChange: (visibles: boolean) => void;
  fallaSeleccionada: FallaSeleccionada | null;
  onSeleccionarFalla: (falla: FallaSeleccionada | null) => void;
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
const FUENTE_ONDA = "onda-percepcion";
const DURACION_ONDA_MS = 1800;
const FUENTE_FALLAS = "fallas-chile";

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
    ? new Date(sismo.fecha).toLocaleString("es-CL", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return `
    <div class="popup-sismo-fila">
      <div class="popup-sismo-badge" style="background: ${colorPorMagnitud(sismo.magnitud)}; color: ${colorTextoPorMagnitud(sismo.magnitud)}">
        M${sismo.magnitud}
      </div>
      <div class="popup-sismo-info">
        <div class="popup-sismo-titulo">
          <span>${sismo.bandera ?? "🌎"}</span> ${sismo.lugar}
        </div>
        ${region ? `<div class="popup-sismo-region">${region}</div>` : ""}
        ${
          fechaTexto || sismo.profundidadKm != null
            ? `<div class="popup-sismo-fecha">${[
                fechaTexto,
                sismo.profundidadKm != null
                  ? `${Math.round(sismo.profundidadKm)} km de profundidad`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}</div>`
            : ""
        }
        ${
          sismo.ubicacionAproximada
            ? `<div class="popup-sismo-region">📍 Ubicación aproximada</div>`
            : ""
        }
      </div>
    </div>
  `;
}

export default function MapaSismos({
  sismosIniciales,
  sismoSeleccionado,
  onSeleccionarDesdeMapa,
  onActualizarSismoSeleccionado,
  filtro,
  onFiltroChange,
  ubicacion,
  onPedirUbicacion,
  fallasVisibles,
  onFallasVisiblesChange,
  fallaSeleccionada,
  onSeleccionarFalla,
}: MapaSismosProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const todosSismosRef = useRef<Map<string, SismoMapa>>(new Map());
  const marcadoresRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const nuevosRef = useRef<Set<string>>(new Set());
  const ultimaActualizacionRef = useRef<string>(
    sismosIniciales.reduce(
      (max, s) => (s.updatedAt > max ? s.updatedAt : max),
      sismosIniciales[0]?.updatedAt ?? new Date(0).toISOString(),
    ),
  );
  const onSeleccionarDesdeMapaRef = useRef(onSeleccionarDesdeMapa);
  onSeleccionarDesdeMapaRef.current = onSeleccionarDesdeMapa;
  const onActualizarSismoSeleccionadoRef = useRef(
    onActualizarSismoSeleccionado,
  );
  onActualizarSismoSeleccionadoRef.current = onActualizarSismoSeleccionado;
  const sismoSeleccionadoRef = useRef(sismoSeleccionado);
  sismoSeleccionadoRef.current = sismoSeleccionado;
  const filtroRef = useRef(filtro);
  filtroRef.current = filtro;
  const ubicacionRef = useRef(ubicacion);
  ubicacionRef.current = ubicacion;
  const marcadorUbicacionRef = useRef<maplibregl.Marker | null>(null);
  const fallasCargadasRef = useRef(false);
  const onSeleccionarFallaRef = useRef(onSeleccionarFalla);
  onSeleccionarFallaRef.current = onSeleccionarFalla;
  const [errorConexion, setErrorConexion] = useState(false);

  function crearMarcador(
    map: maplibregl.Map,
    sismo: SismoMapa,
    pulsando: boolean,
  ): maplibregl.Marker {
    const el = crearElementoMarcador(sismo.magnitud, {
      pulsando,
      lugar: sismo.lugar,
      fecha: sismo.fecha,
      ubicacionAproximada: sismo.ubicacionAproximada,
    });
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
        profundidadKm: sismo.profundidadKm,
        ubicacionAproximada: sismo.ubicacionAproximada,
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
      const desde = ultimaActualizacionRef.current;
      fetch(`/api/sismos?since=${encodeURIComponent(desde)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`poll failed: ${res.status}`);
          return res.json();
        })
        .then((data: { sismos: SismoMapa[] }) => {
          setErrorConexion(false);
          // El endpoint trae tanto sismos nuevos como sismos ya vistos cuya
          // magnitud/profundidad fue revisada por CSN/USGS (filtra por
          // updatedAt, no por fecha). Hay que distinguir ambos casos antes
          // de tocar el Map, porque reciben tratamiento distinto: un nuevo
          // sismo pulsa y puede robar el foco; una revisión solo debe
          // refrescar los datos que ya está mostrando.
          const nuevos: SismoMapa[] = [];
          for (const sismo of data.sismos) {
            const esNuevo = !todosSismosRef.current.has(sismo.externalId);
            todosSismosRef.current.set(sismo.externalId, sismo);
            if (sismo.updatedAt > ultimaActualizacionRef.current) {
              ultimaActualizacionRef.current = sismo.updatedAt;
            }

            if (esNuevo) {
              nuevos.push(sismo);
              nuevosRef.current.add(sismo.externalId);
              continue;
            }

            // Revisión de un sismo ya visto: el pin existente quedó creado
            // con la magnitud vieja (color y tamaño no se recalculan solos),
            // así que lo sacamos para que sincronizarMarcadores lo recree.
            const marcadorViejo = marcadoresRef.current.get(sismo.externalId);
            if (marcadorViejo) {
              marcadorViejo.remove();
              marcadoresRef.current.delete(sismo.externalId);
            }

            // Si es el sismo actualmente seleccionado, refrescamos en
            // silencio (sin robar foco ni cerrar el historial) para que el
            // radio de percepción y el popup usen la magnitud/profundidad
            // recién revisadas.
            if (sismoSeleccionadoRef.current?.externalId === sismo.externalId) {
              onActualizarSismoSeleccionadoRef.current({
                externalId: sismo.externalId,
                latitud: sismo.latitud,
                longitud: sismo.longitud,
                magnitud: sismo.magnitud,
                lugar: sismo.lugar,
                fecha: sismo.fecha,
                bandera: sismo.bandera,
                profundidadKm: sismo.profundidadKm,
                ubicacionAproximada: sismo.ubicacionAproximada,
              });
            }
          }
          sincronizarMarcadores(map);

          // Foco automático: si algo genuinamente nuevo pasa el filtro
          // actual, lo seleccionamos solos (mismo flujo que un clic manual:
          // vuela el mapa, abre el popup, ya trae la animación de pulso).
          // Las revisiones de sismos ya vistos no deben volver a robar el
          // foco. Con varios nuevos a la vez, priorizamos el de mayor
          // magnitud.
          const nuevosQuePasanFiltro = nuevos.filter((s) => {
            if (!pasaFiltro(s, filtroRef.current)) return false;
            const { centro, radioKm } = ubicacionRef.current;
            if (radioKm === null || centro === null) return true; // mundial
            return (
              distanciaKm(centro.lat, centro.lon, s.latitud, s.longitud) <=
              radioKm
            );
          });
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
              ubicacionAproximada: masSignificativo.ubicacionAproximada,
            });
          }
        })
        .catch((error) => {
          console.error("[MapaSismos] poll error:", error);
          setErrorConexion(true);
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
    if (!map || !ubicacion.centro) return;

    if (marcadorUbicacionRef.current) {
      marcadorUbicacionRef.current.setLngLat([
        ubicacion.centro.lon,
        ubicacion.centro.lat,
      ]);
      return;
    }

    marcadorUbicacionRef.current = new maplibregl.Marker({
      element: crearElementoUbicacion(),
    })
      .setLngLat([ubicacion.centro.lon, ubicacion.centro.lat])
      .addTo(map);
  }, [ubicacion.centro]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !sismoSeleccionado) return;

    map.flyTo({
      center: [sismoSeleccionado.longitud, sismoSeleccionado.latitud],
      zoom: Math.max(map.getZoom(), 6),
      speed: 1.2,
    });

    const el = crearElementoSeleccion({
      magnitud: sismoSeleccionado.magnitud,
      lugar: sismoSeleccionado.lugar,
      fecha: sismoSeleccionado.fecha,
    });
    const popup = new maplibregl.Popup({
      offset: 12,
      className: "popup-sismo",
      closeOnClick: false,
    }).setHTML(construirHtmlPopup(sismoSeleccionado));
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([sismoSeleccionado.longitud, sismoSeleccionado.latitud])
      .setPopup(popup)
      .addTo(map);
    marker.togglePopup();

    // Si el usuario cierra el popup con el botón × (no nuestro propio
    // cleanup, que saca este listener antes de remover el marker),
    // limpiamos la selección para que el puntito azul no quede huérfano.
    const manejarCierre = () => {
      onSeleccionarDesdeMapaRef.current(null);
    };
    popup.on("close", manejarCierre);

    // Onda expansiva geográfica: crece desde el epicentro hasta el radio
    // estimado de percepción (aprox., no un modelo sismológico real), y
    // queda un círculo tenue marcando esa área mientras siga seleccionado.
    const centro = {
      lat: sismoSeleccionado.latitud,
      lon: sismoSeleccionado.longitud,
    };
    const radioFinalKm = radioPercepcionKm(sismoSeleccionado.magnitud);
    const color = colorPorMagnitud(sismoSeleccionado.magnitud);
    map.addSource(FUENTE_ONDA, {
      type: "geojson",
      data: generarCirculoGeografico(centro, 0.01),
    });
    map.addLayer({
      id: `${FUENTE_ONDA}-relleno`,
      type: "fill",
      source: FUENTE_ONDA,
      paint: { "fill-color": color, "fill-opacity": 0.1 },
    });
    map.addLayer({
      id: `${FUENTE_ONDA}-borde`,
      type: "line",
      source: FUENTE_ONDA,
      paint: { "line-color": color, "line-width": 2, "line-opacity": 0.55 },
    });

    let animacionId: number | undefined;
    const prefiereMenosMovimiento = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (prefiereMenosMovimiento) {
      // Sin animación: el círculo geográfico marca el área de percepción
      // directamente en su radio final, sin la onda expansiva de 1.8s.
      const fuente = map.getSource(FUENTE_ONDA) as
        maplibregl.GeoJSONSource | undefined;
      fuente?.setData(generarCirculoGeografico(centro, radioFinalKm));
    } else {
      const inicioMs = performance.now();
      const animar = (ahoraMs: number) => {
        const t = Math.min(1, (ahoraMs - inicioMs) / DURACION_ONDA_MS);
        const facilitado = 1 - (1 - t) ** 3; // ease-out cúbico
        const radioActual = Math.max(0.01, radioFinalKm * facilitado);
        const fuente = map.getSource(FUENTE_ONDA) as
          maplibregl.GeoJSONSource | undefined;
        fuente?.setData(generarCirculoGeografico(centro, radioActual));
        if (t < 1) animacionId = requestAnimationFrame(animar);
      };
      animacionId = requestAnimationFrame(animar);
    }

    return () => {
      if (animacionId !== undefined) cancelAnimationFrame(animacionId);
      popup.off("close", manejarCierre);
      marker.remove();
      if (map.getLayer(`${FUENTE_ONDA}-borde`)) {
        map.removeLayer(`${FUENTE_ONDA}-borde`);
      }
      if (map.getLayer(`${FUENTE_ONDA}-relleno`)) {
        map.removeLayer(`${FUENTE_ONDA}-relleno`);
      }
      if (map.getSource(FUENTE_ONDA)) map.removeSource(FUENTE_ONDA);
    };
  }, [sismoSeleccionado]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!fallasVisibles) {
      if (map.getLayer(`${FUENTE_FALLAS}-linea`)) {
        map.setLayoutProperty(`${FUENTE_FALLAS}-linea`, "visibility", "none");
        map.setLayoutProperty(
          `${FUENTE_FALLAS}-linea-hitbox`,
          "visibility",
          "none",
        );
      }
      return;
    }

    if (fallasCargadasRef.current) {
      map.setLayoutProperty(`${FUENTE_FALLAS}-linea`, "visibility", "visible");
      map.setLayoutProperty(
        `${FUENTE_FALLAS}-linea-hitbox`,
        "visibility",
        "visible",
      );
      return;
    }

    fetch("/data/fallas-chile.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`fallas fetch failed: ${res.status}`);
        return res.json();
      })
      .then((geojson: GeoJSON.FeatureCollection) => {
        map.addSource(FUENTE_FALLAS, {
          type: "geojson",
          data: geojson,
          attribution:
            '<a href="https://github.com/GEMScienceTools/gem-global-active-faults" target="_blank" rel="noreferrer">GEM Global Active Faults</a>',
        });
        map.addLayer({
          id: `${FUENTE_FALLAS}-linea`,
          type: "line",
          source: FUENTE_FALLAS,
          paint: {
            "line-color": "#b45309",
            "line-width": 1.5,
            "line-dasharray": [2, 1.5],
            "line-opacity": 0.7,
          },
        });
        // Capa invisible más ancha bajo la línea visible: el área real
        // clickeable de una línea de 1.5px punteada es casi imposible de
        // acertar, así que el click se detecta acá en vez de en la línea
        // visible.
        map.addLayer({
          id: `${FUENTE_FALLAS}-linea-hitbox`,
          type: "line",
          source: FUENTE_FALLAS,
          paint: {
            "line-width": 16,
            "line-opacity": 0,
          },
        });
        map.on("click", `${FUENTE_FALLAS}-linea-hitbox`, (e) => {
          const propiedadesFalla = e.features?.[0]?.properties as
            { name: string | null } | undefined;
          onSeleccionarFallaRef.current({
            lat: e.lngLat.lat,
            lon: e.lngLat.lng,
            nombre: propiedadesFalla?.name ?? "Falla sin nombre registrado",
          });
        });
        fallasCargadasRef.current = true;
      })
      .catch((error) => {
        console.error("[MapaSismos] fallas fetch error:", error);
        onFallasVisiblesChange(false);
      });
  }, [fallasVisibles, onFallasVisiblesChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !fallaSeleccionada) return;

    map.flyTo({
      center: [fallaSeleccionada.lon, fallaSeleccionada.lat],
      zoom: Math.max(map.getZoom(), 12),
      speed: 1.2,
    });

    const popup = new maplibregl.Popup({ className: "popup-sismo" })
      .setLngLat([fallaSeleccionada.lon, fallaSeleccionada.lat])
      .setHTML(
        `<div class="popup-sismo-titulo">${fallaSeleccionada.nombre}</div>`,
      )
      .addTo(map);

    // Igual que con los sismos: si el usuario cierra el popup con el botón
    // ×, limpiamos la selección en vez de dejarla desincronizada.
    const manejarCierre = () => {
      onSeleccionarFallaRef.current(null);
    };
    popup.on("close", manejarCierre);

    return () => {
      popup.off("close", manejarCierre);
      popup.remove();
    };
  }, [fallaSeleccionada]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapContainerRef} className="h-full w-full" />
      {errorConexion && (
        <div
          style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          className="absolute left-1/2 z-10 -translate-x-1/2 rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 py-2 text-xs font-medium text-neutral-300 shadow-lg"
        >
          Sin conexión, reintentando…
        </div>
      )}
      <div
        style={{
          top: "calc(0.75rem + env(safe-area-inset-top))",
          maxWidth: "calc(100vw - 1.5rem)",
        }}
        className="absolute right-3 z-10 flex flex-wrap items-center justify-end gap-2"
      >
        <BotonFiltroMapa filtro={filtro} onFiltroChange={onFiltroChange} />
        <BotonFallasMapa
          fallasVisibles={fallasVisibles}
          onFallasVisiblesChange={onFallasVisiblesChange}
        />
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
      <div
        style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        className="absolute right-3 z-10 flex items-center gap-2"
      >
        <button
          type="button"
          onClick={async () => {
            const map = mapRef.current;
            if (!map) return;
            const centro = await onPedirUbicacion();
            const destino = centro ?? ubicacion.centro;
            if (destino) {
              map.flyTo({
                center: [destino.lon, destino.lat],
                zoom: Math.max(map.getZoom(), 10),
                speed: 1.2,
              });
            }
          }}
          aria-label="Mi ubicación"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 px-3 text-xs font-medium text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 3v3" />
            <path d="M12 18v3" />
            <path d="M21 12h-3" />
            <path d="M6 12H3" />
          </svg>
        </button>
      </div>
    </div>
  );
}
