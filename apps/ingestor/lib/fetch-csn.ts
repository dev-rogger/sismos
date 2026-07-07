import type { CsnSismoRaw } from "@sismos/shared";

const CSN_URL = "https://api.xor.cl/sismo/recent";

interface CsnResponse {
  status_code: number;
  status_description: string;
  events: CsnSismoRaw[];
}

export async function fetchCsnRecent(): Promise<CsnSismoRaw[]> {
  const res = await fetch(CSN_URL);
  if (!res.ok) {
    throw new Error(`CSN fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as CsnResponse;
  return data.events;
}
