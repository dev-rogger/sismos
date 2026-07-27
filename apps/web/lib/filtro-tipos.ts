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
  etiqueta: string;
  min: number;
  max: number;
}[] = [
  { valor: "leve", etiqueta: "Leve (M2–4)", min: 2, max: 4 },
  { valor: "moderado", etiqueta: "Moderado (M4–6)", min: 4, max: 6 },
  { valor: "fuerte", etiqueta: "Fuerte (M6+)", min: 6, max: Infinity },
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
  etiqueta: string;
  horas: number | null;
}[] = [
  { valor: "6h", etiqueta: "Últimas 6 horas", horas: 6 },
  { valor: "24h", etiqueta: "Últimas 24 horas", horas: 24 },
  { valor: "3d", etiqueta: "Últimos 3 días", horas: 72 },
  { valor: "5d", etiqueta: "Últimos 5 días", horas: 120 },
  { valor: "10d", etiqueta: "Últimos 10 días", horas: null },
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

export const FILTRO_HISTORIAL_DEFAULT: FiltroHistorial = {
  soloChile: false,
  rangos: TODOS_LOS_RANGOS,
};
