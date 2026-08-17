import type { CsnSismoRaw } from "@sismos/shared";

const CSN_URL = "https://api.xor.cl/sismo/recent";
const REINTENTOS = 3;
const ESPERA_MS = [1000, 3000];

interface CsnResponse {
  status_code: number;
  status_description: string;
  events: CsnSismoRaw[];
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchCsnRecent(): Promise<CsnSismoRaw[]> {
  let ultimoError: unknown;
  for (let intento = 0; intento < REINTENTOS; intento++) {
    try {
      const res = await fetch(CSN_URL);
      if (!res.ok) {
        throw new Error(`CSN fetch failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as CsnResponse;
      return data.events;
    } catch (error) {
      ultimoError = error;
      if (intento < REINTENTOS - 1) {
        await esperar(ESPERA_MS[intento]!);
      }
    }
  }
  throw ultimoError;
}
