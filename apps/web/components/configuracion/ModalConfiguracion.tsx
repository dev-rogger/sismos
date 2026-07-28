"use client";

import { useState } from "react";
import { usePushNotifications } from "../../lib/use-push-notifications";
import SelectorRadioMapa from "./SelectorRadioMapa";
import {
  RADIO_KM_MIN,
  RADIO_KM_MAX,
  RADIO_KM_DEFAULT,
} from "../../lib/radio-notificacion";

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
    radioKm,
    centro,
    activar,
    desactivar,
    actualizarUmbral,
  } = usePushNotifications();
  const [umbralLocal, setUmbralLocal] = useState(magnitudMinima);
  const [mundialLocal, setMundialLocal] = useState(radioKm === null);
  const [radioKmLocal, setRadioKmLocal] = useState(
    radioKm ?? RADIO_KM_DEFAULT,
  );
  const [centroLocal, setCentroLocal] = useState(centro);
  const [ubicacionFallo, setUbicacionFallo] = useState(false);

  if (!abierto) return null;

  const preferenciaRadio = () =>
    mundialLocal || ubicacionFallo
      ? { centro: null, radioKm: null }
      : { centro: centroLocal, radioKm: radioKmLocal };

  const hayFormaCambios =
    umbralLocal !== magnitudMinima ||
    mundialLocal !== (radioKm === null) ||
    (!mundialLocal && radioKmLocal !== radioKm);

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
              onClick={() =>
                suscrito ? desactivar() : activar(umbralLocal, preferenciaRadio())
              }
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

                <div className="mt-4 border-t border-neutral-800 pt-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-neutral-400">Alcance</span>
                    <button
                      type="button"
                      onClick={() => setMundialLocal((v) => !v)}
                      aria-pressed={mundialLocal}
                      className={`flex min-h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition-colors ${
                        mundialLocal
                          ? "border-sky-500 bg-sky-500/10 text-sky-400"
                          : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
                      }`}
                    >
                      🌎 Mundial, sin rango
                    </button>
                  </div>

                  {!mundialLocal && (
                    <div className="mt-3">
                      <SelectorRadioMapa
                        radioKm={radioKmLocal}
                        onUbicacionLista={(nuevoCentro) => {
                          setCentroLocal(nuevoCentro);
                          setUbicacionFallo(nuevoCentro === null);
                        }}
                      />

                      {ubicacionFallo ? (
                        <p className="mt-3 text-xs text-neutral-400">
                          No pudimos acceder a tu ubicación, así que las
                          notificaciones quedan sin límite de distancia.
                        </p>
                      ) : (
                        <>
                          <p className="mt-3 text-xs text-neutral-400">
                            Avisar hasta a {radioKmLocal} km de tu ubicación
                          </p>
                          <input
                            type="range"
                            min={RADIO_KM_MIN}
                            max={RADIO_KM_MAX}
                            step={25}
                            value={radioKmLocal}
                            onChange={(e) =>
                              setRadioKmLocal(Number(e.target.value))
                            }
                            className="mt-2 w-full accent-sky-500"
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={loading || !hayFormaCambios}
                  onClick={() =>
                    actualizarUmbral(umbralLocal, preferenciaRadio())
                  }
                  className="mt-4 flex min-h-11 w-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-600 disabled:opacity-50"
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
