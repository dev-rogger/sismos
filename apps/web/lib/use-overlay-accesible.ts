"use client";

import { useEffect, useRef, type RefObject } from "react";
import { useContextoOverlays } from "./navegacion-overlays";

const SELECTOR_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function obtenerFocusables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(
    contenedor.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE),
  ).filter((el) => el.offsetParent !== null);
}

// Comportamiento compartido entre menú, modales y pantallas overlay: cerrar
// con Escape, bloquear el scroll del fondo mientras están abiertos, atrapar
// el foco de teclado dentro del overlay (autofocus al abrir + ciclado con
// Tab) e interceptar el botón/gesto atrás para cerrar el overlay en vez de
// navegar fuera de la app.
//
// El manejo del historial NO vive acá: se delega al ProveedorOverlays, que es
// el único dueño (ver lib/navegacion-overlays.tsx). Este hook solo se anota y
// se desanota. `contenedorRef` es opcional: sin él, no hay focus trap.
export function useOverlayAccesible(
  abierto: boolean,
  onCerrar: () => void,
  contenedorRef?: RefObject<HTMLElement | null>,
) {
  const onCerrarRef = useRef(onCerrar);
  onCerrarRef.current = onCerrar;
  const contexto = useContextoOverlays();

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

    const id = Symbol("overlay");
    contexto?.registrar({ id, cerrar: () => onCerrarRef.current() });

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", manejarTecla);
      contexto?.desregistrar(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, contexto]);
}
