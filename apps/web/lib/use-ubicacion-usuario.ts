"use client";

import { useCallback, useEffect, useState } from "react";
import { esCentroValido, esRadioKmValido } from "./radio-notificacion";

const CLAVE_STORAGE = "sismos:ubicacion";

export interface UbicacionUsuario {
  centro: { lat: number; lon: number } | null;
  radioKm: number | null;
}

const UBICACION_DEFAULT: UbicacionUsuario = { centro: null, radioKm: null };

function esUbicacionValida(valor: unknown): valor is UbicacionUsuario {
  if (!valor || typeof valor !== "object") return false;
  const v = valor as Record<string, unknown>;
  const centroOk = v.centro === null || esCentroValido(v.centro);
  const radioOk = v.radioKm === null || esRadioKmValido(v.radioKm);
  return centroOk && radioOk;
}

function leerUbicacionGuardada(): UbicacionUsuario {
  try {
    const raw = window.localStorage.getItem(CLAVE_STORAGE);
    if (!raw) return UBICACION_DEFAULT;
    const parsed: unknown = JSON.parse(raw);
    return esUbicacionValida(parsed) ? parsed : UBICACION_DEFAULT;
  } catch {
    return UBICACION_DEFAULT;
  }
}

export function useUbicacionUsuario() {
  const [ubicacion, setUbicacion] = useState<UbicacionUsuario>(UBICACION_DEFAULT);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    setUbicacion(leerUbicacionGuardada());
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(CLAVE_STORAGE, JSON.stringify(ubicacion));
    } catch {
      // localStorage puede fallar (Safari privado, cuota excedida); seguimos
      // funcionando en memoria para esta sesión.
    }
  }, [ubicacion, cargado]);

  const pedirUbicacion = useCallback((): Promise<
    { lat: number; lon: number } | null
  > => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (posicion) => {
          const centro = {
            lat: posicion.coords.latitude,
            lon: posicion.coords.longitude,
          };
          setUbicacion((actual) => ({ ...actual, centro }));
          resolve(centro);
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 },
      );
    });
  }, []);

  const setRadioKm = useCallback((radioKm: number | null) => {
    setUbicacion((actual) => ({ ...actual, radioKm }));
  }, []);

  return { ubicacion, pedirUbicacion, setRadioKm };
}
