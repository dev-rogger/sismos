export type RangoMagnitud = "leve" | "moderado" | "fuerte";
export type VentanaTiempo = "6h" | "24h" | "3d" | "5d" | "10d";

export interface FiltroMapa {
  soloChile: boolean;
  rangos: RangoMagnitud[];
  ventana: VentanaTiempo;
}

export interface FiltroHistorial {
  soloChile: boolean;
  rangos: RangoMagnitud[];
}

export const RANGOS_MAGNITUD: {
  valor: RangoMagnitud;
  min: number;
  max: number;
}[] = [
  { valor: "leve", min: 2, max: 4 },
  { valor: "moderado", min: 4, max: 6 },
  { valor: "fuerte", min: 6, max: Infinity },
];

export const TODOS_LOS_RANGOS: RangoMagnitud[] = RANGOS_MAGNITUD.map(
  (r) => r.valor,
);

export function magnitudPasaRangos(
  magnitud: number,
  rangos: RangoMagnitud[],
): boolean {
  return RANGOS_MAGNITUD.some(
    (r) => rangos.includes(r.valor) && magnitud >= r.min && magnitud < r.max,
  );
}

export const VENTANAS_TIEMPO: {
  valor: VentanaTiempo;
  horas: number | null;
}[] = [
  { valor: "6h", horas: 6 },
  { valor: "24h", horas: 24 },
  { valor: "3d", horas: 72 },
  { valor: "5d", horas: 120 },
  { valor: "10d", horas: null },
];

export function fechaPasaVentana(
  fechaIso: string,
  ventana: VentanaTiempo,
): boolean {
  const config = VENTANAS_TIEMPO.find((v) => v.valor === ventana);
  if (!config || config.horas === null) return true;
  const limite = Date.now() - config.horas * 60 * 60 * 1000;
  return new Date(fechaIso).getTime() >= limite;
}

export const FILTRO_MAPA_DEFAULT: FiltroMapa = {
  soloChile: false,
  rangos: ["moderado", "fuerte"],
  ventana: "10d",
};

export function filtroMapaEsDefault(filtro: FiltroMapa): boolean {
  return (
    filtro.soloChile === FILTRO_MAPA_DEFAULT.soloChile &&
    filtro.ventana === FILTRO_MAPA_DEFAULT.ventana &&
    filtro.rangos.length === FILTRO_MAPA_DEFAULT.rangos.length &&
    FILTRO_MAPA_DEFAULT.rangos.every((r) => filtro.rangos.includes(r))
  );
}

export const FILTRO_HISTORIAL_DEFAULT: FiltroHistorial = {
  soloChile: false,
  rangos: TODOS_LOS_RANGOS,
};
