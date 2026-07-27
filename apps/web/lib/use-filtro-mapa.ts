"use client";

import { useEffect, useState } from "react";
import { FILTRO_MAPA_DEFAULT, type FiltroMapa } from "./filtro-tipos";

const CLAVE_STORAGE = "sismos:filtro-mapa";

function esFiltroMapaValido(valor: unknown): valor is FiltroMapa {
  if (!valor || typeof valor !== "object") return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.soloChile === "boolean" &&
    Array.isArray(v.rangos) &&
    typeof v.ventana === "string"
  );
}

function leerFiltroGuardado(): FiltroMapa {
  try {
    const raw = window.localStorage.getItem(CLAVE_STORAGE);
    if (!raw) return FILTRO_MAPA_DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    return esFiltroMapaValido(parsed) ? parsed : FILTRO_MAPA_DEFAULT;
  } catch {
    return FILTRO_MAPA_DEFAULT;
  }
}

export function useFiltroMapa() {
  const [filtro, setFiltro] = useState<FiltroMapa>(FILTRO_MAPA_DEFAULT);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    setFiltro(leerFiltroGuardado());
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(filtro));
    } catch {
      // localStorage puede fallar (Safari privado, cuota excedida); seguimos
      // funcionando en memoria para esta sesión.
    }
  }, [filtro, cargado]);

  return { filtro, setFiltro };
}
