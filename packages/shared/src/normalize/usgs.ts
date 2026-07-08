import { emojiFlag } from "@rapideditor/country-coder";
import type { SismoNormalizado } from "../types";

export interface UsgsFeatureRaw {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
  };
  geometry: {
    coordinates: [number, number, number];
  };
}

export function normalizeUsgsFeature(raw: UsgsFeatureRaw): SismoNormalizado {
  const [longitud, latitud, profundidadKm] = raw.geometry.coordinates;
  return {
    fuente: "usgs",
    externalId: raw.id,
    fecha: new Date(raw.properties.time),
    magnitud: raw.properties.mag,
    profundidadKm,
    latitud,
    longitud,
    lugar: raw.properties.place,
    bandera: emojiFlag([longitud, latitud]) ?? null,
  };
}
