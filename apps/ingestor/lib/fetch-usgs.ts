import type { UsgsFeatureRaw } from "@sismos/shared";

const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_hour.geojson";

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
