export function colorPorMagnitud(magnitud: number): string {
  if (magnitud < 3) return "#facc15";
  if (magnitud < 5) return "#f59e0b";
  if (magnitud < 7) return "#ea580c";
  return "#dc2626";
}

// Contraste AA (>=4.5:1) contra cada color de colorPorMagnitud: los primeros
// tres pasan con texto oscuro, pero #dc2626 solo pasa con texto claro.
export function colorTextoPorMagnitud(magnitud: number): string {
  return magnitud < 7 ? "#171717" : "#ffffff";
}

export function tamanoPorMagnitud(magnitud: number): number {
  if (magnitud < 3) return 14;
  if (magnitud < 5) return 20;
  if (magnitud < 7) return 28;
  return 36;
}
