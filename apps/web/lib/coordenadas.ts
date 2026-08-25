// `locale` decide únicamente la letra cardinal de longitud oeste ("O" en
// español, "W" en inglés) — "N"/"S"/"E" son iguales en ambos idiomas, así
// que no hace falta pasar por el diccionario de i18n para esto.
export function formatearCoordenadas(
  latitud: number,
  longitud: number,
  locale: string,
): string {
  const latAbs = Math.abs(latitud).toFixed(2);
  const lonAbs = Math.abs(longitud).toFixed(2);
  const latDir = latitud >= 0 ? "N" : "S";
  const lonDir = longitud >= 0 ? "E" : locale === "en" ? "W" : "O";
  return `${latAbs}° ${latDir}, ${lonAbs}° ${lonDir}`;
}
