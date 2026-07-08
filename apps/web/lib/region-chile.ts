interface RegionChile {
  hasta: number;
  nombre: string;
}

const REGIONES_CHILE: RegionChile[] = [
  { hasta: -19.2, nombre: "Arica y Parinacota" },
  { hasta: -21.0, nombre: "Tarapacá" },
  { hasta: -25.8, nombre: "Antofagasta" },
  { hasta: -29.0, nombre: "Atacama" },
  { hasta: -32.0, nombre: "Coquimbo" },
  { hasta: -33.1, nombre: "Valparaíso" },
  { hasta: -34.0, nombre: "Metropolitana de Santiago" },
  { hasta: -35.0, nombre: "Libertador General Bernardo O'Higgins" },
  { hasta: -36.2, nombre: "Maule" },
  { hasta: -37.1, nombre: "Ñuble" },
  { hasta: -38.0, nombre: "Biobío" },
  { hasta: -39.3, nombre: "La Araucanía" },
  { hasta: -40.1, nombre: "Los Ríos" },
  { hasta: -43.4, nombre: "Los Lagos" },
  { hasta: -49.0, nombre: "Aysén del General Carlos Ibáñez del Campo" },
  { hasta: -Infinity, nombre: "Magallanes y de la Antártica Chilena" },
];

export function regionChilePorLatitud(latitud: number): string | null {
  if (latitud > -17.0 || latitud < -56.0) return null;
  for (const region of REGIONES_CHILE) {
    if (latitud > region.hasta) return region.nombre;
  }
  return null;
}
