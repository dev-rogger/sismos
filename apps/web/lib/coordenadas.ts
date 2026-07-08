export function formatearCoordenadas(latitud: number, longitud: number): string {
  const latAbs = Math.abs(latitud).toFixed(2);
  const lonAbs = Math.abs(longitud).toFixed(2);
  const latDir = latitud >= 0 ? "N" : "S";
  const lonDir = longitud >= 0 ? "E" : "O";
  return `${latAbs}° ${latDir}, ${lonAbs}° ${lonDir}`;
}
