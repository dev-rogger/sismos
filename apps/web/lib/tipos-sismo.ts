export interface SismoMapa {
  externalId: string;
  fecha: string;
  magnitud: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  profundidadKm: number;
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
}
