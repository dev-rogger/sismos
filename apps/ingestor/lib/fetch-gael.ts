import type { GaelSismoRaw } from "@sismos/shared";

const GAEL_URL = "https://api.gael.cloud/general/public/sismos";
// Mismo tope que fetch-csn: el respaldo corre justo después de que la fuente
// primaria ya gastó su presupuesto de reintentos, y todavía falta USGS.
const TIMEOUT_MS = 8000;

export async function fetchGaelRecent(): Promise<GaelSismoRaw[]> {
  const res = await fetch(GAEL_URL, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`GAEL fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GaelSismoRaw[];
}
