import type { SismoNormalizado } from "../types.js";

// TODO: definir el tipo de entrada real una vez se confirme la forma
// de la respuesta de sismologia.cl / api-sismologia-chile.
export type CsnSismoRaw = Record<string, unknown>;

// TODO: implementar la normalización real del formato CSN.
export function normalizeCsnSismo(_raw: CsnSismoRaw): SismoNormalizado {
  throw new Error("normalizeCsnSismo: not implemented yet");
}
