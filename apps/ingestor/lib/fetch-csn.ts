import type { CsnSismoRaw } from "@sismos/shared";

const CSN_URL = "https://api.xor.cl/sismo/recent";
const REINTENTOS = 3;
const ESPERA_MS = [1000, 3000];
// Tope por intento: xor.cl falla colgándose (Cloudflare 522/timeout) y esta
// ingesta corre secuencialmente antes de USGS dentro de una sola función de
// Vercel, así que una conexión colgada no puede quedarse esperando indefinido.
const TIMEOUT_MS = 8000;

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
      const res = await fetch(CSN_URL, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
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
