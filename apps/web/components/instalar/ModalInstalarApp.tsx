"use client";

import { useState } from "react";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface ModalInstalarAppProps {
  visible: boolean;
  plataforma: "android" | "ios" | null;
  // Si el navegador realmente expuso `beforeinstallprompt` y ese prompt
  // sigue sin consumirse — ver comentario en useInstalarApp(). Puede ser
  // false aunque plataforma sea "android" (p. ej. se reabrió el aviso
  // desde el menú después de ya haber intentado instalar una vez).
  promptDisponible: boolean;
  onInstalar: () => void;
  onDescartar: () => void;
}

type Vista = "picker" | "android" | "ios";

function IconoVolver() {
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
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

// Glifo genérico de Android (no es el logo oficial, solo una silueta
// reconocible tipo "cabeza de robot") para distinguir la tarjeta a simple
// vista sin depender solo del texto.
function IconoAndroid() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M17.6 9.48l1.84-3.18a.63.63 0 0 0-.23-.86.62.62 0 0 0-.85.23l-1.86 3.22A9.5 9.5 0 0 0 12 8c-1.4 0-2.72.32-3.9.89L6.24 5.67a.62.62 0 0 0-.85-.23.63.63 0 0 0-.23.86L7 9.48C4.6 10.83 2.9 13.24 2.7 16h18.6c-.2-2.76-1.9-5.17-3.7-6.52ZM7 14.5a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm10 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  );
}

// Idem para iOS: silueta de manzana genérica, no el asset de marca.
function IconoManzana() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
      <path d="M16.5 1.5c.03 1.13-.42 2.24-1.1 3.05-.72.86-1.9 1.53-3 1.46-.06-1.1.44-2.24 1.11-3 .75-.85 2.02-1.48 3-1.51ZM20.9 17c-.42 1.02-.62 1.47-1.16 2.38-.75 1.26-1.81 2.83-3.13 2.85-1.17.02-1.47-.77-3.06-.76-1.58.01-1.92.78-3.09.76-1.32-.02-2.32-1.44-3.07-2.7-2.1-3.55-2.32-7.71-1.03-9.93.92-1.58 2.37-2.5 3.72-2.5 1.38 0 2.25.78 3.39.78 1.11 0 1.78-.78 3.38-.78 1.2 0 2.48.65 3.39 1.79-2.98 1.65-2.5 5.94.66 7.11Z" />
    </svg>
  );
}

export default function ModalInstalarApp({
  visible,
  plataforma,
  promptDisponible,
  onInstalar,
  onDescartar,
}: ModalInstalarAppProps) {
  useOverlayAccesible(visible, onDescartar);

  // Mismo patrón que ModalConfiguracion: el contenido se remonta (vía
  // `key`) cada vez que el modal pasa de cerrado a abierto, para que
  // siempre arranque en el picker "¿Qué estás usando?" en vez de recordar la
  // plataforma elegida en la apertura anterior.
  const [visiblePrevio, setVisiblePrevio] = useState(visible);
  const [aperturaId, setAperturaId] = useState(0);
  if (visible !== visiblePrevio) {
    setVisiblePrevio(visible);
    if (visible) setAperturaId((id) => id + 1);
  }

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
        className={`w-full max-w-sm overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          visible ? "scale-100" : "scale-95"
        }`}
      >
        <ModalInstalarAppContenido
          key={aperturaId}
          plataformaDetectada={plataforma}
          promptDisponible={promptDisponible}
          onInstalar={onInstalar}
          onDescartar={onDescartar}
        />
      </div>
    </div>
  );
}

function ModalInstalarAppContenido({
  plataformaDetectada,
  promptDisponible,
  onInstalar,
  onDescartar,
}: {
  plataformaDetectada: "android" | "ios" | null;
  promptDisponible: boolean;
  onInstalar: () => void;
  onDescartar: () => void;
}) {
  const [vista, setVista] = useState<Vista>("picker");
  const [mostrarInfoPwa, setMostrarInfoPwa] = useState(false);

  if (vista === "picker") {
    return (
      <div key="picker" className="pantalla-entrada">
        <div className="mb-1 flex items-center justify-between">
          <div className="relative flex items-center gap-1">
            <h2 className="text-base font-semibold text-neutral-100">
              Instala la app
            </h2>
            <button
              type="button"
              onClick={() => setMostrarInfoPwa((v) => !v)}
              aria-label="¿Qué es una PWA?"
              aria-expanded={mostrarInfoPwa}
              className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-500 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800 hover:text-neutral-300"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
            {mostrarInfoPwa && (
              <div
                role="tooltip"
                className="absolute top-full left-0 z-10 mt-1 w-52 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 shadow-lg"
              >
                Una PWA es una app web que se instala como una app normal:
                ícono propio, pantalla completa y notificaciones.
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onDescartar}
            aria-label="Cerrar"
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>
        <p className="mb-4 text-center text-sm text-neutral-400">
          ¿Qué estás usando? Te mostramos los pasos para tu dispositivo.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setVista("android")}
            className="flex min-h-11 flex-col items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800/60 px-3 py-5 text-center touch-manipulation transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600 hover:bg-neutral-800"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-emerald-400">
              <IconoAndroid />
            </span>
            <span className="text-sm font-semibold text-neutral-100">
              Android
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVista("ios")}
            className="flex min-h-11 flex-col items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800/60 px-3 py-5 text-center touch-manipulation transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600 hover:bg-neutral-800"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-100">
              <IconoManzana />
            </span>
            <span className="text-sm font-semibold text-neutral-100">
              iPhone
            </span>
          </button>
        </div>
      </div>
    );
  }

  // El picker deja elegir la plataforma manualmente, así que puede no
  // coincidir con `plataformaDetectada` (p. ej. alguien mira las
  // instrucciones de iOS desde un Android, o al revés). El botón "Instalar"
  // real solo tiene sentido si la elección coincide con la plataforma
  // detectada Y el prompt nativo sigue disponible — cualquier otro caso
  // (otra plataforma, o Android sin deferredPrompt) usa instrucciones
  // manuales genéricas.
  const puedeInstalarNativo =
    vista === "android" && plataformaDetectada === "android" && promptDisponible;

  return (
    <div key={vista} className="pantalla-entrada">
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setVista("picker")}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800"
        >
          <IconoVolver />
        </button>
        <h2 className="text-base font-semibold text-neutral-100">
          Instala la app
        </h2>
      </div>

      {vista === "ios" ? (
        <>
          <p className="text-center text-sm text-neutral-400">
            Toca el ícono Compartir (⬆️) en la barra del navegador y elige
            &quot;Agregar a inicio&quot;. En iPhone las notificaciones de
            sismos solo funcionan así — y en general se siente como una app
            real, a pantalla completa.
          </p>
          <button
            type="button"
            onClick={onDescartar}
            className="mt-4 flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            Entendido
          </button>
        </>
      ) : puedeInstalarNativo ? (
        <>
          <p className="text-center text-sm text-neutral-400">
            Agrega Sismos a tu pantalla de inicio: se abre a pantalla
            completa, con su propio ícono, y se siente como una app real.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onDescartar}
              className="flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
            >
              Ahora no
            </button>
            <button
              type="button"
              onClick={onInstalar}
              className="flex min-h-11 flex-1 touch-manipulation items-center justify-center rounded-lg border border-sky-500 bg-sky-500/10 px-3 text-sm font-medium text-sky-400 transition active:scale-[0.97] active:brightness-95 hover:bg-sky-500/20"
            >
              Instalar
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-center text-sm text-neutral-400">
            Abre el menú ⋮ del navegador y elige &quot;Instalar app&quot; o
            &quot;Agregar a pantalla de inicio&quot;.
          </p>
          <button
            type="button"
            onClick={onDescartar}
            className="mt-4 flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-300 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
          >
            Entendido
          </button>
        </>
      )}
    </div>
  );
}
