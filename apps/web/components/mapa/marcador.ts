export function colorPorMagnitud(magnitud: number): string {
  if (magnitud < 3) return "#facc15";
  if (magnitud < 5) return "#fb923c";
  if (magnitud < 7) return "#f97316";
  return "#dc2626";
}

export function tamanoPorMagnitud(magnitud: number): number {
  if (magnitud < 3) return 14;
  if (magnitud < 5) return 20;
  if (magnitud < 7) return 28;
  return 36;
}

export function crearElementoMarcador(
  magnitud: number,
  opciones: { pulsando: boolean },
): HTMLDivElement {
  const size = tamanoPorMagnitud(magnitud);
  const color = colorPorMagnitud(magnitud);

  const el = document.createElement("div");
  el.className = opciones.pulsando
    ? "marcador-sismo marcador-sismo--pulso"
    : "marcador-sismo";
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.backgroundColor = color;
  el.style.borderRadius = "50%";
  el.style.border = "2px solid rgba(255, 255, 255, 0.8)";

  return el;
}
