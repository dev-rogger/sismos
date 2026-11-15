import type { SismoNormalizado } from "./types";

const EARTH_RADIUS_KM = 6371;
const TIME_WINDOW_MS = 2 * 60 * 1000;
const MAX_DISTANCE_KM = 100;
const MAX_MAGNITUDE_DIFF = 0.5;

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

/**
 * Devuelve el candidato duplicado más probable: entre los que cumplen
 * ventana de tiempo, distancia y magnitud, el de menor puntaje
 * `distanciaKm / MAX_DISTANCE_KM + dtMs / TIME_WINDOW_MS`.
 */
export function findDuplicate(
  candidate: SismoNormalizado,
  others: SismoNormalizado[],
): SismoNormalizado | null {
  let best: SismoNormalizado | null = null;
  let bestScore = Infinity;

  for (const other of others) {
    const timeDiffMs = Math.abs(
      candidate.fecha.getTime() - other.fecha.getTime(),
    );
    if (timeDiffMs > TIME_WINDOW_MS) continue;

    const distanceKm = haversineDistanceKm(
      candidate.latitud,
      candidate.longitud,
      other.latitud,
      other.longitud,
    );
    if (distanceKm > MAX_DISTANCE_KM) continue;

    const magnitudeDiff = Math.abs(candidate.magnitud - other.magnitud);
    if (magnitudeDiff > MAX_MAGNITUDE_DIFF) continue;

    const score = distanceKm / MAX_DISTANCE_KM + timeDiffMs / TIME_WINDOW_MS;
    if (score < bestScore) {
      bestScore = score;
      best = other;
    }
  }
  return best;
}
