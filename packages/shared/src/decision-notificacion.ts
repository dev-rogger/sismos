import type { SismoFuente } from "./types";
import { UMBRAL_MAGNITUD_MUNDIAL } from "./umbral-mundial";

/** Magnitud mínima para avisar un sismo de Chile (fuente CSN). */
export const UMBRAL_MAGNITUD_CHILE = 4;
/** Un sismo más viejo que esto ya no se avisa (el aviso llegaría tarde). */
export const TOPE_ANTIGUEDAD_NOTIFICACION_MS = 60 * 60 * 1000;
/** Subida de magnitud mínima para re-avisar un sismo ya notificado. */
export const SALTO_REVISION_MAGNITUD = 0.5;

export interface EntradaDecisionNotificacion {
  magnitud: number;
  fecha: Date;
  fuente: SismoFuente;
  notificadoAt: Date | null;
  magnitudNotificada: number | null;
  ahora: Date;
}

export interface DecisionNotificacion {
  enviar: boolean;
  motivo: "nuevo" | "revision" | null;
}

const NO_ENVIAR: DecisionNotificacion = { enviar: false, motivo: null };

/**
 * Decide si hay que avisar de un sismo a partir de su estado persistido, sin
 * depender de si la fila fue insertada o actualizada en esta corrida.
 */
export function decidirNotificacion(
  entrada: EntradaDecisionNotificacion,
): DecisionNotificacion {
  const { magnitud, fecha, fuente, notificadoAt, magnitudNotificada, ahora } =
    entrada;

  if (ahora.getTime() - fecha.getTime() > TOPE_ANTIGUEDAD_NOTIFICACION_MS) {
    return NO_ENVIAR;
  }

  const umbral =
    fuente === "csn" ? UMBRAL_MAGNITUD_CHILE : UMBRAL_MAGNITUD_MUNDIAL;

  if (notificadoAt === null) {
    return magnitud >= umbral ? { enviar: true, motivo: "nuevo" } : NO_ENVIAR;
  }

  // Ya notificado. Sin magnitud registrada no se puede medir la revisión: no
  // se re-avisa (lo conservador frente a duplicar).
  if (
    magnitudNotificada !== null &&
    magnitud - magnitudNotificada >= SALTO_REVISION_MAGNITUD
  ) {
    return { enviar: true, motivo: "revision" };
  }
  return NO_ENVIAR;
}
