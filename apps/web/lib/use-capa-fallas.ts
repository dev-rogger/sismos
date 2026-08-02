"use client";

import { useEffect, useState } from "react";

const CLAVE_STORAGE = "sismos:capa-fallas";

export function useCapaFallas() {
  const [fallasVisibles, setFallasVisibles] = useState(false);
  const [cargado, setCargado] = useState(false);

  useEffect(() => {
    setFallasVisibles(window.localStorage.getItem(CLAVE_STORAGE) === "true");
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      window.localStorage.setItem(CLAVE_STORAGE, String(fallasVisibles));
    } catch {
      // localStorage puede fallar (Safari privado, cuota excedida); seguimos
      // funcionando en memoria para esta sesión.
    }
  }, [fallasVisibles, cargado]);

  return { fallasVisibles, setFallasVisibles };
}
