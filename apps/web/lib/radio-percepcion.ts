/**
 * Estimación ILUSTRATIVA (no sismológica) de a cuántos km podría sentirse
 * un sismo según su magnitud, para dibujar la onda expansiva en el mapa.
 * No reemplaza mapas de intensidad reales (ShakeMap y similares) — es una
 * curva exponencial simple, calibrada a ojo para que se vea razonable en
 * el rango M2–M9, no un modelo de atenuación sísmica.
 */
export function radioPercepcionKm(magnitud: number): number {
  const m = Math.max(2, magnitud);
  return Math.round(1.6 * Math.exp(0.74 * m));
}
