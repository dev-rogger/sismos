export interface SismoMapa {
  externalId: string;
  fecha: string;
  updatedAt: string;
  magnitud: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  profundidadKm: number;
  ubicacionAproximada: boolean;
}

export interface SismoSeleccionado {
  externalId: string;
  latitud: number;
  longitud: number;
  magnitud: number;
  lugar: string;
  fecha?: string;
  bandera?: string | null;
  profundidadKm?: number;
  ubicacionAproximada?: boolean;
}
