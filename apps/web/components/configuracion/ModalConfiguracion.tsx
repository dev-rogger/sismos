"use client";

import { useState } from "react";
import { usePushNotifications } from "../../lib/use-push-notifications";

interface ModalConfiguracionProps {
  abierto: boolean;
  onCerrar: () => void;
}

export default function ModalConfiguracion({
  abierto,
  onCerrar,
}: ModalConfiguracionProps) {
  const {
    permission,
    suscrito,
    loading,
    magnitudMinima,
    activar,
    desactivar,
    actualizarUmbral,
  } = usePushNotifications();
  const [umbralLocal, setUmbralLocal] = useState(magnitudMinima);

  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            Notificaciones
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        {permission === "unsupported" && (
          <p className="text-sm text-neutral-400">
            Tu navegador o dispositivo no soporta notificaciones push. En
            iPhone, primero agregá esta app a la pantalla de inicio.
          </p>
        )}

        {permission === "denied" && (
          <p className="text-sm text-neutral-400">
            Bloqueaste las notificaciones para este sitio. Para activarlas,
            cambiá el permiso desde la configuración de notificaciones de tu
            navegador.
          </p>
        )}

        {(permission === "default" || permission === "granted") && (
          <>
            <button
              type="button"
              disabled={loading}
              onClick={() => (suscrito ? desactivar() : activar(umbralLocal))}
              aria-pressed={suscrito}
              className={`flex min-h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-50 ${
                suscrito
                  ? "border-sky-500 bg-sky-500/10 text-sky-400"
                  : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
              }`}
            >
              {loading
                ? "..."
                : suscrito
                  ? "Desactivar notificaciones"
                  : "Activar notificaciones"}
            </button>

            {suscrito && (
              <div className="mt-4">
                <label
                  htmlFor="umbral-push"
                  className="mb-2 block text-xs text-neutral-400"
                >
                  Avisar desde M{umbralLocal}+
                </label>
                <input
                  id="umbral-push"
                  type="range"
                  min={4}
                  max={7}
                  step={1}
                  value={umbralLocal}
                  onChange={(e) => setUmbralLocal(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <button
                  type="button"
                  disabled={loading || umbralLocal === magnitudMinima}
                  onClick={() => actualizarUmbral(umbralLocal)}
                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
