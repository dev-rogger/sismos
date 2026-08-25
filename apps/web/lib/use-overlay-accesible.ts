"use client";

import { useEffect, useRef, type RefObject } from "react";

const SELECTOR_FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function obtenerFocusables(contenedor: HTMLElement): HTMLElement[] {
  return Array.from(
    contenedor.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE),
  ).filter((el) => el.offsetParent !== null);
}

// Pila compartida por TODAS las instancias del hook en la app: representa
// qué overlays están abiertos ahora mismo, del más antiguo al más
// reciente. Solo empujamos una entrada de historial cuando la pila pasa de
// vacía a tener algo (el primer overlay que se abre), y solo la
// consumimos cuando vuelve a vaciarse del todo. Así, cuando un overlay
// reemplaza a otro en el mismo click (p.ej. el menú lateral se cierra al
// elegir "Sismos", que abre la pantalla de historial en el mismo gesto),
// no hace falta tocar el historial del navegador en absoluto: ambos
// representan igual "hay un overlay abierto". Sin esto, un
// `history.back()` asíncrono (al cerrar el que sale) puede competir con el
// `pushState` síncrono del que entra y terminar cerrando el overlay
// equivocado.
const pilaOverlays: symbol[] = [];

// Comportamiento compartido entre menú, modales y pantallas overlay: cerrar
// con Escape, bloquear el scroll del fondo mientras están abiertos, atrapar
// el foco de teclado dentro del overlay (autofocus al abrir + ciclado con
// Tab) e interceptar el botón/gesto atrás para cerrar el overlay en vez de
// navegar fuera de la app. `contenedorRef` es opcional para no romper la
// firma de los llamadores existentes que todavía no lo pasan: sin él, el
// hook se comporta igual que antes (solo Escape + scroll lock), sin focus
// trap.
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

    // Nos anotamos en la pila compartida; solo el primer overlay de la
    // pila empuja una entrada real de historial (ver comentario arriba).
    const miToken = Symbol("overlay");
    pilaOverlays.push(miToken);
    if (pilaOverlays.length === 1) {
      window.history.pushState({ overlayAccesible: true }, "");
    }

    let cerradoPorNavegacion = false;
    const manejarPopState = () => {
      // Solo reaccionamos si somos el overlay más reciente: si ya no lo
      // somos, otro overlay tomó nuestro lugar (reemplazo en el mismo
      // click) y es su responsabilidad reaccionar al próximo "atrás".
      if (pilaOverlays[pilaOverlays.length - 1] !== miToken) return;
      cerradoPorNavegacion = true;
      pilaOverlays.pop();
      onCerrarRef.current();
      if (pilaOverlays.length > 0) {
        // Todavía queda un overlay "padre" abierto (p.ej. el menú, con un
        // submenú propio recién cerrado): reponemos la entrada para que
        // el próximo "atrás" también pueda cerrarlo a él.
        window.history.pushState({ overlayAccesible: true }, "");
      }
    };
    window.addEventListener("popstate", manejarPopState);

    return () => {
      document.body.style.overflow = original;
      document.removeEventListener("keydown", manejarTecla);
      window.removeEventListener("popstate", manejarPopState);
      if (cerradoPorNavegacion) return;

      // Diferimos la decisión de consumir la entrada de historial a un
      // microtask: si este cierre es en realidad un reemplazo (otro
      // overlay abriéndose en el mismo commit de React, p.ej. el menú
      // cerrándose al elegir un ítem), el efecto de ese overlay ya habrá
      // corrido para cuando el microtask se ejecute, y encontraremos que
      // ya no somos parte de la pila — ahí no tocamos el historial, la
      // entrada pasa a ser responsabilidad del reemplazo.
      queueMicrotask(() => {
        const idx = pilaOverlays.lastIndexOf(miToken);
        if (idx === -1) return;
        pilaOverlays.splice(idx, 1);
        if (pilaOverlays.length === 0) {
          window.history.back();
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
}
