export type SismoFuente = "csn" | "usgs";

export interface SismoNormalizado {
  fuente: SismoFuente;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  ubicacionAproximada: boolean;
}
