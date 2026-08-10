"use client";

import { useEffect, useRef, useState } from "react";
import { usePushNotifications } from "../../lib/use-push-notifications";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
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
  useOverlayAccesible(abierto, onCerrar);

  // El contenido se remonta (vía `key`) cada vez que el modal pasa de
  // cerrado a abierto, para que sus useState nazcan ya con el valor
  // correcto de `ubicacion` en vez de arrastrar el estado de la vez
  // anterior (o el default, si la primera apertura ocurrió antes de que
  // useUbicacionUsuario terminara de hidratar desde localStorage).
  const [abiertoPrevio, setAbiertoPrevio] = useState(abierto);
  const [aperturaId, setAperturaId] = useState(0);
  if (abierto !== abiertoPrevio) {
    setAbiertoPrevio(abierto);
    if (abierto) setAperturaId((id) => id + 1);
  }

  return (
    <div
      aria-hidden={!abierto}
      onClick={onCerrar}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 transition-opacity duration-200 motion-reduce:transition-none ${
        abierto
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notificaciones"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          abierto ? "scale-100" : "scale-95"
        }`}
      >
        <ModalConfiguracionContenido
          key={aperturaId}
          abierto={abierto}
          onCerrar={onCerrar}
          ubicacion={ubicacion}
          onPedirUbicacion={onPedirUbicacion}
          onSetRadioKm={onSetRadioKm}
        />
      </div>
    </div>
  );
}

function ModalConfiguracionContenido({
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
    alcanceMundial,
    activar,
    desactivar,
    actualizarUmbral,
  } = usePushNotifications();
  const [umbralLocal, setUmbralLocal] = useState(magnitudMinima);
  const [mundialLocal, setMundialLocal] = useState(ubicacion.radioKm === null);
  const [radioKmLocal, setRadioKmLocal] = useState(
    ubicacion.radioKm ?? RADIO_KM_DEFAULT,
  );
  const [alcanceMundialLocal, setAlcanceMundialLocal] = useState(alcanceMundial);
  const [pidiendoUbicacion, setPidiendoUbicacion] = useState(false);
  const [ubicacionFallo, setUbicacionFallo] = useState(false);

  // usePushNotifications() hidrata magnitudMinima/alcanceMundial desde la
  // suscripción guardada en la base de forma asíncrona (fetch a
  // /api/push/subscribe), pero umbralLocal/alcanceMundialLocal ya se
  // inicializaron con useState() al primer render, cuando esos valores
  // todavía eran el default — useState() solo lee su argumento inicial una
  // vez, no se re-sincroniza solo. Sin este efecto, reabrir el modal
  // siempre mostraba el umbral/alcance por default en vez del guardado.
  // Se resincroniza recién cuando `loading` pasa a false (hidratación ya
  // aplicada) para no pisar una edición del usuario en curso — después de
  // eso solo vuelve a correr si el propio guardado actualiza el hook.
  useEffect(() => {
    if (loading) return;
    setUmbralLocal(magnitudMinima);
    setAlcanceMundialLocal(alcanceMundial);
  }, [loading, magnitudMinima, alcanceMundial]);

  // Pide una ubicación fresca una vez cada vez que el modal se abre en modo
  // no "Mundial" — no solo la primera vez que existió, para que un
  // dispositivo que se movió refleje su posición actual y no una guardada
  // de otra sesión. `yaPidioRef` evita que un fetch exitoso (que hace pasar
  // `pidiendoUbicacion` de true a false) dispare este efecto de nuevo y
  // genere un loop de pedidos mientras el modal siga abierto — el ref vive
  // por montaje, y cada apertura real remonta este componente (ver `key`
  // en `ModalConfiguracion`), así que sigue pidiendo una vez por apertura.
  // `ubicacionFallo` evita reintentar en loop cuando el usuario ya rechazó
  // el permiso o el navegador no soporta geolocalización en esta apertura.
  const yaPidioRef = useRef(false);
  useEffect(() => {
    if (
      !abierto ||
      mundialLocal ||
      pidiendoUbicacion ||
      ubicacionFallo ||
      yaPidioRef.current
    ) {
      return;
    }
    yaPidioRef.current = true;
    setPidiendoUbicacion(true);
    onPedirUbicacion().then((centro) => {
      setPidiendoUbicacion(false);
      setUbicacionFallo(centro === null);
    });
  }, [abierto, mundialLocal, pidiendoUbicacion, ubicacionFallo, onPedirUbicacion]);

  const preferenciaRadio = () =>
    mundialLocal || !ubicacion.centro
      ? { centro: null, radioKm: null }
      : { centro: ubicacion.centro, radioKm: radioKmLocal };

  const hayFormaCambios =
    umbralLocal !== magnitudMinima ||
    mundialLocal !== (ubicacion.radioKm === null) ||
    (!mundialLocal && radioKmLocal !== ubicacion.radioKm) ||
    alcanceMundialLocal !== alcanceMundial;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-neutral-100">
          Notificaciones
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
        >
          ✕
        </button>
      </div>

      {permission === "unsupported" && (
        <p className="text-sm text-neutral-400">
          Tu navegador o dispositivo no soporta notificaciones push. En iPhone,
          primero agregá esta app a la pantalla de inicio.
        </p>
      )}

      {permission === "denied" && (
        <p className="text-sm text-neutral-400">
          Bloqueaste las notificaciones para este sitio. Para activarlas, cambiá
          el permiso desde la configuración de notificaciones de tu navegador.
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
              activar(umbralLocal, preferencia, alcanceMundialLocal).then((exito) => {
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
                      // Permite reintentar si el primer intento de esta
                      // apertura falló: sin este reset, una vez que
                      // yaPidioRef queda en true no vuelve a fetchear hasta
                      // que el modal se cierre y reabra (nuevo montaje).
                      yaPidioRef.current = false;
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
                    {pidiendoUbicacion && !ubicacion.centro && (
                      <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-800/50 text-xs text-neutral-400">
                        Buscando tu ubicación…
                      </div>
                    )}

                    {ubicacion.centro && (
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

                    {!pidiendoUbicacion && !ubicacion.centro && ubicacionFallo && (
                      <p className="mt-3 text-xs text-neutral-400">
                        No pudimos acceder a tu ubicación, así que las
                        notificaciones quedan sin límite de distancia.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-4 border-t border-neutral-800 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">
                    Terremotos en el mundo
                  </span>
                  <button
                    type="button"
                    onClick={() => setAlcanceMundialLocal((v) => !v)}
                    role="switch"
                    aria-checked={alcanceMundialLocal}
                    aria-label="Avisarme de terremotos en el mundo"
                    className={`relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                      alcanceMundialLocal ? "bg-sky-500" : "bg-neutral-700"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        alcanceMundialLocal ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
                <p className="text-xs text-neutral-400">
                  Terremotos grandes (M7.0+) en cualquier país, sin importar
                  la distancia.
                </p>
              </div>

              <button
                type="button"
                disabled={loading || !hayFormaCambios}
                onClick={() => {
                  const preferencia = preferenciaRadio();
                  actualizarUmbral(umbralLocal, preferencia, alcanceMundialLocal).then(() => {
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
    </>
  );
}
