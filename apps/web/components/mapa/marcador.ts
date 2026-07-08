import { colorPorMagnitud, tamanoPorMagnitud } from "../../lib/magnitud";

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

export function crearElementoSeleccion(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-seleccion";
  return el;
}
