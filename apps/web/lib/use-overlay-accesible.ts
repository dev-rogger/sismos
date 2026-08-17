"use client";

import { useEffect, useRef, type RefObject } from "react";

const SELECTOR_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function obtenerFocusables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(
    contenedor.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE),
  ).filter((el) => el.offsetParent !== null);
}

// Comportamiento compartido entre menú, modales y pantallas overlay: cerrar
// con Escape, bloquear el scroll del fondo mientras están abiertos y atrapar
// el foco de teclado dentro del overlay (autofocus al abrir + ciclado con
// Tab). `contenedorRef` es opcional para no romper la firma de los llamadores
// existentes que todavía no lo pasan: sin él, el hook se comporta igual que
// antes (solo Escape + scroll lock), sin focus trap.
export function useOverlayAccesible(
  abierto: boolean,
  onCerrar: () => void,
  contenedorRef?: RefObject<HTMLElement | null>,
) {
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;

  useEffect(() => {
    if (!abierto) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const contenedor = contenedorRef?.current ?? null;
    if (contenedor) {
      const focusables = obtenerFocusables(contenedor);
      focusables[0]?.focus();
    }

    const manejarTecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCerrarRef.current();
        return;
      }
      if (e.key !== "Tab" || !contenedor) return;

      const focusables = obtenerFocusables(contenedor);
      if (focusables.length === 0) return;
      const primero = focusables[0]!;
      const ultimo = focusables[focusables.length - 1]!;

      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener("keydown", manejarTecla);
    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", manejarTecla);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
}
