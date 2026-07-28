"use client";

import { useEffect, useState } from "react";
import { usePushNotifications } from "../../lib/use-push-notifications";
import SelectorRadioMapa from "./SelectorRadioMapa";
import {
  RADIO_KM_MIN,
  RADIO_KM_MAX,
  RADIO_KM_DEFAULT,
} from "../../lib/radio-notificacion";
import type { UbicacionUsuario } from "../../lib/use-ubicacion-usuario";

interface ModalConfiguracionProps {
  abierto: boolean;
  onCerrar: () => void;
  ubicacion: UbicacionUsuario;
  onPedirUbicacion: () => Promise<{ lat: number; lon: number } | null>;
  onSetRadioKm: (radioKm: number | null) => void;
}

export default function ModalConfiguracion({
  abierto,
  onCerrar,
  ubicacion,
  onPedirUbicacion,
  onSetRadioKm,
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
  const [mundialLocal, setMundialLocal] = useState(ubicacion.radioKm === null);
  const [radioKmLocal, setRadioKmLocal] = useState(
    ubicacion.radioKm ?? RADIO_KM_DEFAULT,
  );
  const [pidiendoUbicacion, setPidiendoUbicacion] = useState(false);
  const [ubicacionFallo, setUbicacionFallo] = useState(false);

  // ModalConfiguracion siempre está montado (solo oculto vía `abierto`), así
  // que los useState de arriba se inicializan en el primer render de toda la
  // app — antes de que useUbicacionUsuario termine de hidratar desde
  // localStorage. Este efecto resincroniza el borrador local con el valor
  // persistido cada vez que el modal se abre (o si `ubicacion` cambia
  // mientras está abierto), para no pisar el radio guardado con el default.
  useEffect(() => {
    if (!abierto) return;
    setMundialLocal(ubicacion.radioKm === null);
    setRadioKmLocal(ubicacion.radioKm ?? RADIO_KM_DEFAULT);
    setUbicacionFallo(false);
  }, [abierto, ubicacion.radioKm]);

  // Pide geolocalización solo si el modal está abierto y el usuario
  // desactivó "Mundial" — nunca de forma automática al montar la app.
  // `ubicacionFallo` evita reintentar en loop cuando el usuario ya rechazó
  // el permiso o el navegador no soporta geolocalización.
  useEffect(() => {
    if (
      !abierto ||
      mundialLocal ||
      ubicacion.centro ||
      pidiendoUbicacion ||
      ubicacionFallo
    ) {
      return;
    }
    setPidiendoUbicacion(true);
    onPedirUbicacion().then((centro) => {
      setPidiendoUbicacion(false);
      setUbicacionFallo(centro === null);
    });
  }, [
    abierto,
    mundialLocal,
    ubicacion.centro,
    pidiendoUbicacion,
    ubicacionFallo,
    onPedirUbicacion,
  ]);

  if (!abierto) return null;

  const preferenciaRadio = () =>
    mundialLocal || !ubicacion.centro
      ? { centro: null, radioKm: null }
      : { centro: ubicacion.centro, radioKm: radioKmLocal };

  const hayFormaCambios =
    umbralLocal !== magnitudMinima ||
    mundialLocal !== (ubicacion.radioKm === null) ||
    (!mundialLocal && radioKmLocal !== ubicacion.radioKm);

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
              onClick={() => {
                if (suscrito) {
                  desactivar();
                  onSetRadioKm(null);
                  return;
                }
                const preferencia = preferenciaRadio();
                activar(umbralLocal, preferencia).then((exito) => {
                  if (exito) onSetRadioKm(preferencia.radioKm);
                });
              }}
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
                      onClick={() => {
                        setMundialLocal((v) => !v);
                        setUbicacionFallo(false);
                      }}
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
                      {pidiendoUbicacion && (
                        <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-800/50 text-xs text-neutral-400">
                          Buscando tu ubicación…
                        </div>
                      )}

                      {!pidiendoUbicacion && ubicacion.centro && (
                        <>
                          <SelectorRadioMapa
                            centro={ubicacion.centro}
                            radioKm={radioKmLocal}
                          />
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

                      {!pidiendoUbicacion && ubicacionFallo && (
                        <p className="mt-3 text-xs text-neutral-400">
                          No pudimos acceder a tu ubicación, así que las
                          notificaciones quedan sin límite de distancia.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={loading || !hayFormaCambios}
                  onClick={() => {
                    const preferencia = preferenciaRadio();
                    actualizarUmbral(umbralLocal, preferencia).then(() => {
                      onSetRadioKm(preferencia.radioKm);
                    });
                  }}
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
