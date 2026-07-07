import type { SismoNormalizado } from "../types";

// TODO: reemplazar por el tipo real de un Feature del GeoJSON de USGS.
export type UsgsFeatureRaw = Record<string, unknown>;

// TODO: implementar la normalización real del formato USGS GeoJSON.
export function normalizeUsgsFeature(_raw: UsgsFeatureRaw): SismoNormalizado {
  throw new Error("normalizeUsgsFeature: not implemented yet");
}
