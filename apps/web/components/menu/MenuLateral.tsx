"use client";

import { useEffect, useState } from "react";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface MenuLateralProps {
  onAbrirHistorial: () => void;
  onAbrirFallas: () => void;
  onAbrirNotificaciones: () => void;
  puedeInstalarApp: boolean;
  onAbrirInstalarApp: () => void;
  onAbiertoChange?: (abierto: boolean) => void;
}

function IconoHistorial() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function IconoFallas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 12l4-7 4 9 4-9 4 9 2-4" />
    </svg>
  );
}

function IconoNotificaciones() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z" />
      <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function IconoInstalar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

export default function MenuLateral({
  onAbrirHistorial,
  onAbrirFallas,
  onAbrirNotificaciones,
  puedeInstalarApp,
  onAbrirInstalarApp,
  onAbiertoChange,
}: MenuLateralProps) {
  const [abierto, setAbierto] = useState(false);

  useOverlayAccesible(abierto, () => setAbierto(false));

  useEffect(() => {
    onAbiertoChange?.(abierto);
  }, [abierto, onAbiertoChange]);

  const elegir = (accion: () => void) => {
    setAbierto(false);
    accion();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="fixed left-3 z-10 flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
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
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div
        aria-hidden={!abierto}
        onClick={() => setAbierto(false)}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
          abierto
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-neutral-800 bg-neutral-900 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-neutral-100">Menú</h2>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar menú"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
          <button
            type="button"
            onClick={() => elegir(onAbrirHistorial)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoHistorial />
            Sismos
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirFallas)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoFallas />
            Fallas
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirNotificaciones)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoNotificaciones />
            Notificaciones
          </button>
          {puedeInstalarApp && (
            <button
              type="button"
              onClick={() => elegir(onAbrirInstalarApp)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoInstalar />
              Instalar app
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
