"use client";

import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface ModalInstalarAppProps {
  visible: boolean;
  plataforma: "android" | "ios" | null;
  onInstalar: () => void;
  onDescartar: () => void;
}

export default function ModalInstalarApp({
  visible,
  plataforma,
  onInstalar,
  onDescartar,
}: ModalInstalarAppProps) {
  useOverlayAccesible(visible, onDescartar);

  return (
    <div
      aria-hidden={!visible}
      onClick={onDescartar}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-200 motion-reduce:transition-none ${
        visible
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Instalar app"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          visible ? "scale-100" : "scale-95"
        }`}
      >
        <h2 className="mb-3 text-base font-semibold text-neutral-100">
          Instalá la app
        </h2>

        {plataforma === "ios" ? (
          <>
            <p className="text-sm text-neutral-400">
              Tocá el ícono Compartir (⬆️) en la barra del navegador y elegí
              &quot;Agregar a inicio&quot;. En iPhone las notificaciones de
              sismos solo funcionan así — y en general se siente como una app
              real, a pantalla completa.
            </p>
            <button
              type="button"
              onClick={onDescartar}
              className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600"
            >
              Entendido
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-400">
              Agregá Sismos a tu pantalla de inicio: se abre a pantalla
              completa, con su propio ícono, y se siente como una app real.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={onDescartar}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600"
              >
                Ahora no
              </button>
              <button
                type="button"
                onClick={onInstalar}
                className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-sky-500 bg-sky-500/10 px-3 text-sm font-medium text-sky-400 transition-colors hover:bg-sky-500/20"
              >
                Instalar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
