"use client";

import { useEffect, useState } from "react";
import type { ItemHistorial } from "./use-historial";

export type GranularidadConteo = "dia" | "semana" | "mes" | "anio";

export const OPCIONES_GRANULARIDAD: GranularidadConteo[] = [
  "dia",
  "semana",
  "mes",
  "anio",
];

export interface ConteoPeriodo {
  periodo: string;
  total: number;
}

export interface ConteoBandaMagnitud {
  desde: number;
  total: number;
}

export interface ResumenPeriodo {
  total: number;
  porBanda: ConteoBandaMagnitud[];
  sismos: ItemHistorial[];
}

interface RespuestaEstadisticas {
  resumen: ResumenPeriodo;
  conteos: ConteoPeriodo[];
}

export function useEstadisticas(soloChile: boolean, activo: boolean) {
  const [granularidad, setGranularidad] = useState<GranularidadConteo>("dia");
  const [datos, setDatos] = useState<RespuestaEstadisticas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reintentos, setReintentos] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setLoading(true);
    setError(false);

    const params = new URLSearchParams({
      granularidad,
      soloChile: String(soloChile),
    });

    fetch(`/api/estadisticas?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`estadisticas fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: RespuestaEstadisticas) => {
        if (cancelado) return;
        setDatos(data);
        setLoading(false);
      })
      .catch((error) => {
        console.error("[useEstadisticas] fetch failed:", error);
        if (cancelado) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [granularidad, soloChile, activo, reintentos]);

  return {
    granularidad,
    setGranularidad,
    resumen: datos?.resumen ?? { total: 0, porBanda: [], sismos: [] },
    conteos: datos?.conteos ?? [],
    loading,
    error,
    reintentar: () => setReintentos((n) => n + 1),
  };
}
