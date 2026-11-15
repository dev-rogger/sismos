import { distanciaKm } from "./distancia";
import { UMBRAL_MAGNITUD_MUNDIAL } from "./umbral-mundial";
import { radioMmiKm } from "./radio-percepcion";
import type { SismoFuente } from "./types";

/** Magnitud mínima del evento para que opere la regla de rescate. */
export const PISO_RESCATE_MAG = 5.0;
/** MMI que debe alcanzarse en el suscriptor para el rescate (IV: "ampliamente sentido"). */
export const UMBRAL_RESCATE_MMI = 4;

export interface SuscriptorDestino {
  magnitudMinima: number;
  centro: { lat: number; lon: number } | null;
  radioKm: number | null;
  alcanceMundial: boolean;
}

export interface EventoDestino {
  magnitud: number;
  latitud: number;
  longitud: number;
  profundidadKm: number | null;
  fuente: SismoFuente;
}

/**
 * Decide a quién avisar de un sismo.
 *
 * - Fuentes no-CSN: solo suscriptores con alcanceMundial y magnitud >= umbral mundial.
 * - CSN, regla A: magnitudMinima <= magnitud y, si hay centro y radio, dentro del círculo.
 * - CSN, regla B (rescate): sismo bajo su magnitudMinima, pero M >= piso, con
 *   profundidad válida, dentro de su círculo y dentro del radio donde se estima
 *   MMI >= IV. Evita no avisar de un sismo moderado que sí se sintió fuerte
 *   cerca del usuario.
 */
export function seleccionarDestinatarios<T extends SuscriptorDestino>(
  subs: readonly T[],
  evento: EventoDestino,
): T[] {
  if (evento.fuente !== "csn") {
    if (evento.magnitud < UMBRAL_MAGNITUD_MUNDIAL) return [];
    return subs.filter((s) => s.alcanceMundial);
  }

  const h = evento.profundidadKm;
  const puedeRescatar =
    evento.magnitud >= PISO_RESCATE_MAG &&
    h !== null &&
    Number.isFinite(h) &&
    h > 0;
  // Se calcula una sola vez por evento, y solo si algún suscriptor lo necesita.
  let radioIvKm: number | null = null;

  return subs.filter((s) => {
    const dist =
      s.centro !== null && s.radioKm !== null
        ? distanciaKm(s.centro.lat, s.centro.lon, evento.latitud, evento.longitud)
        : null;

    // Regla A
    if (s.magnitudMinima <= evento.magnitud) {
      return dist === null || dist <= (s.radioKm as number);
    }

    // Regla B
    if (!puedeRescatar || dist === null || dist > (s.radioKm as number)) {
      return false;
    }
    radioIvKm ??= radioMmiKm(evento.magnitud, h as number, UMBRAL_RESCATE_MMI);
    // 0 = ni en el epicentro se llega a IV: no hay rescate (ni con dist = 0).
    return radioIvKm > 0 && dist <= radioIvKm;
  });
}
