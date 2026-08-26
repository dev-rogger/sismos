// Los watchers de toasts "importantes" (actualización disponible,
// invitación a activar notificaciones) se disparan por eventos
// independientes entre sí (un service worker que cambia de controlador vs.
// un fetch de suscripción que termina de hidratar) — sin coordinación,
// pueden mostrarse los dos al mismo tiempo y quedar apilados/compitiendo
// por atención. Esto asegura que solo uno esté visible a la vez: el que
// llega primero se muestra, el que llega después espera su turno.
//
// El orden de esta lista es la prioridad: si dos quedan esperando turno a
// la vez, gana el que aparece antes acá.
const ORDEN_PRIORIDAD = ["actualizacion", "invitacion-notificaciones"] as const;
type PrioridadToast = (typeof ORDEN_PRIORIDAD)[number];

let toastActivo: PrioridadToast | null = null;
const enEspera = new Map<PrioridadToast, () => void>();

export function pedirMostrarToast(
  prioridad: PrioridadToast,
  mostrar: () => void,
): void {
  if (toastActivo === null) {
    toastActivo = prioridad;
    mostrar();
    return;
  }
  if (toastActivo === prioridad) {
    // Ya está mostrándose este mismo toast; no hay nada que encolar.
    return;
  }
  enEspera.set(prioridad, mostrar);
}

export function avisarToastCerrado(prioridad: PrioridadToast): void {
  if (toastActivo !== prioridad) return;
  toastActivo = null;

  for (const siguiente of ORDEN_PRIORIDAD) {
    const mostrar = enEspera.get(siguiente);
    if (mostrar) {
      enEspera.delete(siguiente);
      toastActivo = siguiente;
      mostrar();
      return;
    }
  }
}
