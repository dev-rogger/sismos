import { colorPorMagnitud, tamanoPorMagnitud } from "../../lib/magnitud";

const TAP_TARGET_MIN_PX = 28;

export function crearElementoMarcador(
  magnitud: number,
  opciones: { pulsando: boolean },
): HTMLDivElement {
  const size = tamanoPorMagnitud(magnitud);
  const color = colorPorMagnitud(magnitud);
  const tapSize = Math.max(size, TAP_TARGET_MIN_PX);

  const wrapper = document.createElement("div");
  wrapper.style.width = `${tapSize}px`;
  wrapper.style.height = `${tapSize}px`;
  wrapper.style.display = "flex";
  wrapper.style.alignItems = "center";
  wrapper.style.justifyContent = "center";

  const dot = document.createElement("div");
  dot.className = opciones.pulsando
    ? "marcador-sismo marcador-sismo--pulso"
    : "marcador-sismo";
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.backgroundColor = color;
  dot.style.borderRadius = "50%";
  dot.style.border = "2px solid rgba(255, 255, 255, 0.8)";

  wrapper.appendChild(dot);
  return wrapper;
}

export function crearElementoSeleccion(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-seleccion";
  return el;
}
