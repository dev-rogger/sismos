"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePushNotifications } from "../../lib/use-push-notifications";
import IconoSpinner from "../IconoSpinner";
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
  const contenedorRef = useRef<HTMLDivElement>(null);
  useOverlayAccesible(abierto, onCerrar, contenedorRef);
  const t = useTranslations("configuracion");

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
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
        abierto
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
    >
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("titulo")}
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

// Switch estilo iOS reutilizado por los dos controles booleanos de
// "Alcance": mundialLocal (alcance mundial vs. radio local) y
// alcanceMundialLocal (excepción de M7+ en cualquier país). Antes uno era
// un chip con aria-pressed y el otro un switch con role="switch"; se
// unifica el lenguaje visual usando el switch para los dos.
function SwitchToggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`relative flex h-7 w-12 shrink-0 touch-manipulation items-center rounded-full transition active:scale-[0.97] active:brightness-95 disabled:opacity-50 ${
        checked ? "bg-sky-500" : "bg-neutral-700"
      }`}
    >
      <span
        className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function ModalConfiguracionContenido({
  abierto,
  onCerrar,
  ubicacion,
  onPedirUbicacion,
  onSetRadioKm,
}: ModalConfiguracionProps) {
  const t = useTranslations("configuracion");
  const tc = useTranslations("comun");
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
  // Mismo patrón de estado explícito que "Guardar" (más abajo): si
  // activar() resuelve false (p. ej. el usuario rechazó el permiso del
  // navegador) o la promesa rechaza, mostramos un aviso en vez de dejar el
  // botón volver a su estado normal sin ninguna señal de que algo falló.
  const [errorActivar, setErrorActivar] = useState(false);
  // Estados explícitos del botón "Guardar": idle -> guardando (promesa en
  // curso) -> guardado (transitorio, ~1.8s) | error (si la promesa
  // rechaza). `guardando` es un flag local propio (no el `loading` del
  // hook, que también se pone en true durante activar/desactivar) para que
  // el texto "Guardando…" solo aparezca cuando este botón es la causa.
  const [guardando, setGuardando] = useState(false);
  const [estadoGuardado, setEstadoGuardado] = useState<"idle" | "guardado" | "error">(
    "idle",
  );
  const guardadoTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    return () => {
      if (guardadoTimeoutRef.current) clearTimeout(guardadoTimeoutRef.current);
    };
  }, []);

  // usePushNotifications() hidrata magnitudMinima/alcanceMundial desde la
  // suscripción guardada en la base de forma asíncrona (fetch a
  // /api/push/subscribe), pero umbralLocal/alcanceMundialLocal ya se
  // inicializaron con useState() al primer render, cuando esos valores
  // todavía eran el default — useState() solo lee su argumento inicial una
  // vez, no se re-sincroniza solo. Sin este efecto, reabrir el modal
  // siempre mostraba el umbral/alcance por default en vez del guardado.
  // `hidratadoRef` limita el resync a la primera vez que `loading` pasa a
  // false (la hidratación inicial) y nunca más — si en cambio corriera en
  // cada transición de `loading`, un guardado (activar/actualizarUmbral)
  // que termina mientras el usuario ya movió el slider de nuevo pisaría
  // esa edición en curso con el valor recién guardado (ahora desactualizado).
  // Después de la hidratación inicial, el estado local ya es la única
  // fuente de verdad para el slider/toggle.
  const hidratadoRef = useRef(false);
  useEffect(() => {
    if (loading || hidratadoRef.current) return;
    hidratadoRef.current = true;
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
          {t("titulo")}
        </h2>
        <button
          type="button"
          onClick={onCerrar}
          aria-label={tc("cerrar")}
          className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800 hover:text-neutral-100"
        >
          ✕
        </button>
      </div>

      {permission === "unsupported" && (
        <p className="text-sm text-neutral-400">{t("noSoportado")}</p>
      )}

      {permission === "denied" && (
        <p className="text-sm text-neutral-400">{t("bloqueado")}</p>
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
              setErrorActivar(false);
              const preferencia = preferenciaRadio();
              activar(umbralLocal, preferencia, alcanceMundialLocal)
                .then((exito) => {
                  if (exito) {
                    onSetRadioKm(preferencia.radioKm);
                  } else {
                    setErrorActivar(true);
                  }
                })
                .catch((error) => {
                  console.error(
                    "[ModalConfiguracion] activar failed:",
                    error,
                  );
                  setErrorActivar(true);
                });
            }}
            aria-pressed={suscrito}
            className={`flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] active:brightness-95 disabled:opacity-50 ${
              suscrito
                ? "border-sky-500 bg-sky-500/10 text-sky-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            {loading ? (
              <IconoSpinner className="h-4 w-4" label={tc("cargando")} />
            ) : suscrito ? (
              t("desactivar")
            ) : (
              t("activar")
            )}
          </button>
          {errorActivar && (
            <p className="mt-2 text-xs text-red-400">{t("errorActivar")}</p>
          )}

          {/* El panel de umbral/radio/alcance se muestra siempre, esté
              suscrito o no: antes vivía detrás de `{suscrito && ...}`, así
              que el usuario activaba notificaciones con los valores por
              defecto y recién después veía los controles para ajustarlos
              (teniendo que volver a guardar). Ahora puede ajustar todo acá
              antes de tocar "Activar con esta configuración", que ya usa
              estos mismos valores locales. */}
          <div className="mt-4">
            <label
              htmlFor="umbral-push"
              className="mb-2 block text-xs text-neutral-400"
            >
              {t("avisarDesde", { umbral: umbralLocal })}
            </label>
            <input
              id="umbral-push"
              type="range"
              min={4}
              max={7}
              step={1}
              value={umbralLocal}
              onChange={(e) => setUmbralLocal(Number(e.target.value))}
              disabled={loading}
              className="w-full accent-sky-500 disabled:opacity-50"
            />

            {/* "Alcance" agrupa visualmente dos controles independientes
                (no uno anidado dentro del otro): el radio dentro de Chile
                solo afecta sismos con fuente CSN; el switch de M7+ es la
                ÚNICA forma de recibir avisos de sismos fuera de Chile (vía
                USGS), sin importar cómo esté configurado el radio — ver
                findSubscripcionesParaSismo() en
                packages/db/src/queries/push-subscription.ts, que para
                fuentes != "csn" filtra exclusivamente por la columna
                alcanceMundial. Por eso el switch de M7+ tiene que estar
                siempre visible y togglable, nunca condicionado a
                mundialLocal. */}
            <div className="mt-4 border-t border-neutral-800 pt-4">
              <span className="mb-2 block text-xs text-neutral-400">
                {t("alcance")}
              </span>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-neutral-400">
                  {t("limitarPorDistancia")}
                </span>
                <SwitchToggle
                  checked={!mundialLocal}
                  onChange={() => {
                    setMundialLocal((v) => !v);
                    setUbicacionFallo(false);
                    // Permite reintentar si el primer intento de esta
                    // apertura falló: sin este reset, una vez que
                    // yaPidioRef queda en true no vuelve a fetchear hasta
                    // que el modal se cierre y reabra (nuevo montaje).
                    yaPidioRef.current = false;
                  }}
                  label={
                    !mundialLocal
                      ? t("limitarPorDistanciaActivado")
                      : t("limitarPorDistanciaDesactivado")
                  }
                  disabled={loading}
                />
              </div>

              {!mundialLocal && (
                <div className="mt-3">
                  {pidiendoUbicacion && !ubicacion.centro && (
                    <div className="flex h-40 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-800/50 text-xs text-neutral-400">
                      {t("buscandoUbicacion")}
                    </div>
                  )}

                  {ubicacion.centro && (
                    <div>
                      <SelectorRadioMapa
                        centro={ubicacion.centro}
                        radioKm={radioKmLocal}
                      />
                      <label
                        htmlFor="radio-push"
                        className="mt-3 block text-xs text-neutral-400"
                      >
                        {t("avisarHastaKm", { km: radioKmLocal })}
                      </label>
                      <input
                        id="radio-push"
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
                    </div>
                  )}

                  {!pidiendoUbicacion && !ubicacion.centro && ubicacionFallo && (
                    <p className="text-xs text-neutral-400">
                      {t("errorUbicacion")}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-800 pt-3">
                <span className="text-xs text-neutral-400">
                  {t("avisarM7Global")}
                </span>
                <SwitchToggle
                  checked={alcanceMundialLocal}
                  onChange={() => setAlcanceMundialLocal((v) => !v)}
                  label={t("avisarM7GlobalLabel")}
                  disabled={loading}
                />
              </div>
            </div>

            {suscrito && (
              <>
                <button
                  type="button"
                  disabled={loading || guardando || !hayFormaCambios}
                  onClick={() => {
                    setGuardando(true);
                    setEstadoGuardado("idle");
                    const preferencia = preferenciaRadio();
                    actualizarUmbral(umbralLocal, preferencia, alcanceMundialLocal)
                      .then(() => {
                        onSetRadioKm(preferencia.radioKm);
                        setEstadoGuardado("guardado");
                        if (guardadoTimeoutRef.current) {
                          clearTimeout(guardadoTimeoutRef.current);
                        }
                        guardadoTimeoutRef.current = setTimeout(
                          () => setEstadoGuardado("idle"),
                          1800,
                        );
                      })
                      .catch((error) => {
                        console.error(
                          "[ModalConfiguracion] guardar failed:",
                          error,
                        );
                        setEstadoGuardado("error");
                      })
                      .finally(() => setGuardando(false));
                  }}
                  className={`mt-4 flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg border px-3 text-sm font-medium transition duration-200 ease-out active:scale-[0.97] active:brightness-95 disabled:opacity-50 ${
                    estadoGuardado === "guardado"
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                      : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
                  }`}
                >
                  {guardando
                    ? t("guardando")
                    : estadoGuardado === "guardado"
                      ? t("guardado")
                      : tc("guardar")}
                </button>
                {estadoGuardado === "error" && (
                  <p className="mt-2 text-xs text-red-400">
                    {t("errorGuardar")}
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}
