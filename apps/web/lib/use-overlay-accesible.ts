"use client";

import { useEffect, useRef } from "react";

// Comportamiento compartido entre menú, modales y pantallas overlay: cerrar
// con Escape y bloquear el scroll del fondo mientras están abiertos.
export function useOverlayAccesible(abierto: boolean, onCerrar: () => void) {
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!abierto) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const manejarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrarRef.current();
    };
    document.addEventListener("keydown", manejarTecla);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", manejarTecla);
    };
  }, [abierto]);
}
