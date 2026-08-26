"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { usePushNotifications } from "../lib/use-push-notifications";

const CLAVE_STORAGE = "sismos:notificaciones-invitacion-vista";
const TRES_DIAS_MS = 3 * 24 * 60 * 60 * 1000;

function yaSeMostroRecientemente(): boolean {
  try {
    const raw = window.localStorage.getItem(CLAVE_STORAGE);
    if (!raw) return false;
    const vista = new Date(raw).getTime();
    if (Number.isNaN(vista)) return false;
    return Date.now() - vista < TRES_DIAS_MS;
  } catch {
    return false;
  }
}

function marcarComoVista(): void {
  try {
    window.localStorage.setItem(CLAVE_STORAGE, new Date().toISOString());
  } catch {
    // localStorage puede fallar (Safari privado, cuota excedida); si no
    // persiste, en la próxima carga se vuelve a evaluar — no rompe nada.
  }
}

// No se puede mandar una notificación push real para invitar a activar
// notificaciones (requiere el permiso que justamente todavía no se dio), así
// que la invitación vive como un toast dentro de la propia app.
export default function InvitacionNotificacionesToastWatcher() {
  const t = useTranslations("invitacionNotificaciones");
  const tc = useTranslations("comun");
  const { permission, suscrito, loading } = usePushNotifications();
  const yaEvaluadoRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    // El hook termina de hidratar una sola vez por carga de página; evita
    // reevaluar (y volver a marcar como vista) si permission/suscrito
    // cambian después por otro motivo durante la misma sesión.
    if (yaEvaluadoRef.current) return;
    yaEvaluadoRef.current = true;

    if (suscrito) return;
    if (permission === "denied" || permission === "unsupported") return;
    if (yaSeMostroRecientemente()) return;

    // Mostrarse ya cuenta como "visto", se marque o no una interacción.
    marcarComoVista();

    toast.custom(
      (id) => (
        <div className="flex w-full flex-col gap-3 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-lg shadow-black/40">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-800">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-sky-400"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z" />
                <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
              </svg>
            </span>
            <p className="flex-1 text-sm font-medium text-neutral-100">
              {t("titulo")}
            </p>
            <button
              type="button"
              onClick={() => toast.dismiss(id)}
              aria-label={tc("cerrar")}
              className="flex h-8 w-8 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-800 hover:text-neutral-300"
            >
              ✕
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              toast.dismiss(id);
              window.dispatchEvent(new Event("sismos:abrir-notificaciones"));
            }}
            className="min-h-11 w-full touch-manipulation rounded-lg bg-sky-500 text-sm font-semibold text-neutral-950 transition active:scale-[0.97] active:brightness-95 hover:bg-sky-400"
          >
            {t("activar")}
          </button>
        </div>
      ),
      { duration: Infinity },
    );
  }, [loading, suscrito, permission, t, tc]);

  return null;
}
