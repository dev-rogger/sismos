import type { UsgsFeatureRaw } from "@sismos/shared";

// Ventana de 1 día (no 1 hora): si el ingest tiene algún hueco (cron caído,
// deploy, etc.), un sismo mundial igual se captura en la próxima corrida en
// vez de perderse para siempre al salir de una ventana más angosta.
const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson";

interface UsgsResponse {
  features: UsgsFeatureRaw[];
}

export async function fetchUsgsRecent(): Promise<UsgsFeatureRaw[]> {
  const res = await fetch(USGS_URL);
  if (!res.ok) {
    throw new Error(`USGS fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as UsgsResponse;
  return data.features;
}
