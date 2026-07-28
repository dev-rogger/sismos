const RADIO_TIERRA_KM = 6371;

/**
 * Genera un polígono GeoJSON que aproxima un círculo geográfico: N puntos
 * a `radioKm` de distancia del centro, repartidos en 360°, usando la
 * fórmula estándar de "punto de destino" sobre una esfera.
 */
export function generarCirculoGeografico(
  centro: { lat: number; lon: number },
  radioKm: number,
  puntos = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const latRad = (centro.lat * Math.PI) / 180;
  const lonRad = (centro.lon * Math.PI) / 180;
  const angularDist = radioKm / RADIO_TIERRA_KM;

  const coordenadas: [number, number][] = [];
  for (let i = 0; i <= puntos; i++) {
    const rumbo = (i / puntos) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angularDist) +
        Math.cos(latRad) * Math.sin(angularDist) * Math.cos(rumbo),
    );
    const lon2 =
      lonRad +
      Math.atan2(
        Math.sin(rumbo) * Math.sin(angularDist) * Math.cos(latRad),
        Math.cos(angularDist) - Math.sin(latRad) * Math.sin(lat2),
      );
    coordenadas.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coordenadas] },
  };
}
