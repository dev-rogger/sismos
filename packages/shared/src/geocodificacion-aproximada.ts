export type DireccionCardinal =
  "N" | "NE" | "E" | "SE" | "S" | "SO" | "O" | "NO";

const RUMBOS: Record<DireccionCardinal, number> = {
  N: 0,
  NE: 45,
  E: 90,
  SE: 135,
  S: 180,
  SO: 225,
  O: 270,
  NO: 315,
};

const EARTH_RADIUS_KM = 6371;

const PATRON_REFERENCIA =
  /^(\d+(?:\.\d+)?)\s*km\s+al\s+(N|NE|E|SE|S|SO|O|NO)\s+de\s+(.+)$/i;

export interface ReferenciaGeografica {
  distanciaKm: number;
  direccion: DireccionCardinal;
  localidad: string;
}

export function parsearReferenciaGeografica(
  texto: string,
): ReferenciaGeografica | null {
  const match = PATRON_REFERENCIA.exec(texto.trim());
  if (!match) return null;
  const distanciaStr = match[1]!;
  const direccionStr = match[2]!;
  const localidad = match[3]!;
  return {
    distanciaKm: Number(distanciaStr),
    direccion: direccionStr.toUpperCase() as DireccionCardinal,
    localidad: localidad.trim(),
  };
}

// Coordenadas aproximadas (centro urbano) de las localidades que CSN usa
// como referencia. Se amplía a mano cuando aparezca una localidad nueva no
// reconocida en el feed de GAEL Cloud.
export const DICCIONARIO_LOCALIDADES: Record<
  string,
  { lat: number; lon: number }
> = {
  Arica: { lat: -18.478, lon: -70.323 },
  Iquique: { lat: -20.213, lon: -70.152 },
  Pica: { lat: -20.489, lon: -69.325 },
  "Mina Collahuasi": { lat: -20.983, lon: -68.683 },
  Calama: { lat: -22.456, lon: -68.929 },
  Antofagasta: { lat: -23.65, lon: -70.4 },
  Socaire: { lat: -23.593, lon: -67.884 },
  "Mina La Escondida": { lat: -24.267, lon: -69.067 },
  Ollagüe: { lat: -21.225, lon: -68.257 },
  Copiapó: { lat: -27.367, lon: -70.332 },
  "La Serena": { lat: -29.907, lon: -71.252 },
  Coquimbo: { lat: -29.953, lon: -71.339 },
  Pichidangui: { lat: -32.117, lon: -71.533 },
  Valparaíso: { lat: -33.047, lon: -71.612 },
  Quintero: { lat: -32.777, lon: -71.531 },
  Quillota: { lat: -32.883, lon: -71.249 },
  "Viña del Mar": { lat: -33.024, lon: -71.552 },
  Santiago: { lat: -33.447, lon: -70.673 },
  Rancagua: { lat: -34.17, lon: -70.744 },
  Talca: { lat: -35.426, lon: -71.666 },
  Linares: { lat: -35.847, lon: -71.594 },
  Chillán: { lat: -36.606, lon: -72.103 },
  Concepción: { lat: -36.827, lon: -73.05 },
  Temuco: { lat: -38.735, lon: -72.59 },
  Valdivia: { lat: -39.814, lon: -73.246 },
  "Puerto Montt": { lat: -41.469, lon: -72.942 },
  Coyhaique: { lat: -45.571, lon: -72.068 },
  "Punta Arenas": { lat: -53.163, lon: -70.917 },
};

export function calcularDestino(
  origen: { lat: number; lon: number },
  direccion: DireccionCardinal,
  distanciaKm: number,
): { lat: number; lon: number } {
  const rumboRad = (RUMBOS[direccion] * Math.PI) / 180;
  const distanciaAngular = distanciaKm / EARTH_RADIUS_KM;
  const lat1 = (origen.lat * Math.PI) / 180;
  const lon1 = (origen.lon * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanciaAngular) +
      Math.cos(lat1) * Math.sin(distanciaAngular) * Math.cos(rumboRad),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(rumboRad) * Math.sin(distanciaAngular) * Math.cos(lat1),
      Math.cos(distanciaAngular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

export function geocodificarAproximado(
  refGeografica: string,
): { lat: number; lon: number } | null {
  const referencia = parsearReferenciaGeografica(refGeografica);
  if (!referencia) return null;
  const origen = DICCIONARIO_LOCALIDADES[referencia.localidad];
  if (!origen) return null;
  return calcularDestino(origen, referencia.direccion, referencia.distanciaKm);
}
