import { geocodificarAproximado } from "../geocodificacion-aproximada";
import type { SismoNormalizado } from "../types";

export interface GaelSismoRaw {
  Fecha: string;
  Profundidad: string;
  Magnitud: string;
  RefGeografica: string;
  FechaUpdate: string;
}

function idSinteticoGael(raw: GaelSismoRaw): string {
  return `gael-${raw.Fecha}-${raw.Magnitud}-${raw.RefGeografica}`.replace(
    /\s+/g,
    "-",
  );
}

export function normalizeGaelSismo(raw: GaelSismoRaw): SismoNormalizado | null {
  const ubicacion = geocodificarAproximado(raw.RefGeografica);
  if (!ubicacion) return null;

  return {
    fuente: "csn",
    externalId: idSinteticoGael(raw),
    fecha: new Date(`${raw.Fecha.replace(" ", "T")}Z`),
    magnitud: Number(raw.Magnitud),
    profundidadKm: Number(raw.Profundidad),
    latitud: ubicacion.lat,
    longitud: ubicacion.lon,
    lugar: raw.RefGeografica,
    bandera: "🇨🇱",
    ubicacionAproximada: true,
  };
}
