import type { GaelSismoRaw } from "@sismos/shared";

const GAEL_URL = "https://api.gael.cloud/general/public/sismos";

export async function fetchGaelRecent(): Promise<GaelSismoRaw[]> {
  const res = await fetch(GAEL_URL);
  if (!res.ok) {
    throw new Error(`GAEL fetch failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as GaelSismoRaw[];
}
