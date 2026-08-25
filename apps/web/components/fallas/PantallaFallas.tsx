"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
import type { FallaSeleccionada } from "../../lib/tipos-falla";

interface FallaItem {
  id: number;
  nombre: string;
  lat: number;
  lon: number;
}

interface PantallaFallasProps {
  abierto: boolean;
  onSeleccionar: (falla: FallaSeleccionada) => void;
  onCerrar: () => void;
}

function puntoRepresentativo(coordenadas: [number, number][]): {
  lat: number;
  lon: number;
} {
  const [lon, lat] = coordenadas[Math.floor(coordenadas.length / 2)] ?? [0, 0];
  return { lat, lon };
}

export default function PantallaFallas({
  abierto,
  onSeleccionar,
  onCerrar,
}: PantallaFallasProps) {
  const t = useTranslations("fallas");
  const tc = useTranslations("comun");
  useOverlayAccesible(abierto, onCerrar);

  // Queda montada permanentemente (para animar su cierre), pero el fetch se
  // pospone hasta la primera apertura — mismo patrón que PantallaHistorial.
  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  const [fallas, setFallas] = useState<FallaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reintentos, setReintentos] = useState(0);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!huboApertura) return;
    let cancelado = false;
    setLoading(true);
    setError(false);

    fetch("/data/fallas-chile.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`fallas fetch failed: ${res.status}`);
        return res.json();
      })
      .then(
        (
          geojson: GeoJSON.FeatureCollection<
            GeoJSON.LineString,
            { name: string | null }
          >,
        ) => {
          if (cancelado) return;
          const items = geojson.features
            .map((f, id) => {
              if (!f.properties.name) return null;
              const { lat, lon } = puntoRepresentativo(
                f.geometry.coordinates as [number, number][],
              );
              return { id, nombre: f.properties.name, lat, lon };
            })
            .filter((item): item is FallaItem => item !== null)
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
          setFallas(items);
          setLoading(false);
        },
      )
      .catch((error) => {
        console.error("[PantallaFallas] fetch error:", error);
        if (cancelado) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [huboApertura, reintentos]);

  const fallasFiltradas = fallas.filter((f) =>
    f.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 flex flex-col bg-neutral-900 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        abierto ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-800 px-3 py-3">
        <button
          type="button"
          onClick={onCerrar}
          aria-label={tc("volver")}
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800"
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
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-base font-semibold text-neutral-100">
          {t("titulo")}
        </h1>
      </div>

      <div className="shrink-0 border-b border-neutral-800 px-4 py-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={t("buscarPlaceholder")}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 transition-colors placeholder:text-neutral-500 hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
        />
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          {t("cargando")}
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center text-sm text-neutral-500">
          <p>{t("errorCarga")}</p>
          <button
            type="button"
            onClick={() => setReintentos((n) => n + 1)}
            className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            {t("reintentar")}
          </button>
        </div>
      ) : fallasFiltradas.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-neutral-500">
          {t("sinResultados", { busqueda })}
        </div>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
          {fallasFiltradas.map((falla) => (
            <li key={falla.id}>
              <button
                type="button"
                onClick={() => onSeleccionar(falla)}
                className="w-full touch-manipulation rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-left text-sm text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800/60"
              >
                {falla.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
