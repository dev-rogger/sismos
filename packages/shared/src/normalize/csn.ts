import type { SismoNormalizado } from "../types";

export interface CsnSismoRaw {
  id: string;
  url: string;
  map_url: string;
  local_date: string;
  utc_date: string;
  latitude: number;
  longitude: number;
  depth: number;
  magnitude: { value: number; measure_unit: string };
  geo_reference: string;
}

export function normalizeCsnSismo(raw: CsnSismoRaw): SismoNormalizado {
  return {
    fuente: "csn",
    externalId: raw.id,
    fecha: new Date(`${raw.utc_date.replace(" ", "T")}Z`),
    magnitud: raw.magnitude.value,
    profundidadKm: raw.depth,
    latitud: raw.latitude,
    longitud: raw.longitude,
    lugar: raw.geo_reference,
  };
}
