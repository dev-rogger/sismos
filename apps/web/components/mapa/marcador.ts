import { colorPorMagnitud, tamanoPorMagnitud } from "../../lib/magnitud";

const TAP_TARGET_MIN_PX = 44;

export function crearElementoMarcador(
  magnitud: number,
  opciones: {
    pulsando: boolean;
    lugar: string;
    fecha: string;
    ubicacionAproximada?: boolean;
  },
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
  wrapper.setAttribute("role", "button");
  wrapper.setAttribute(
    "aria-label",
    `Sismo M${magnitud} en ${opciones.lugar}${opciones.ubicacionAproximada ? " (ubicación aproximada)" : ""}, ${new Date(opciones.fecha).toLocaleString("es-CL")}`,
  );

  const dot = document.createElement("div");
  dot.className = opciones.pulsando
    ? "marcador-sismo marcador-sismo--pulso"
    : "marcador-sismo";
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.backgroundColor = color;
  dot.style.borderRadius = "50%";
  dot.style.border = opciones.ubicacionAproximada
    ? "2px dashed rgba(255, 255, 255, 0.8)"
    : "2px solid rgba(255, 255, 255, 0.8)";

  wrapper.appendChild(dot);
  return wrapper;
}

export function crearElementoSeleccion(opciones: {
  magnitud: number;
  lugar: string;
  fecha?: string;
}): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-seleccion";
  const fechaTexto = opciones.fecha
    ? `, ${new Date(opciones.fecha).toLocaleString("es-CL")}`
    : "";
  el.setAttribute(
    "aria-label",
    `Sismo seleccionado: M${opciones.magnitud} en ${opciones.lugar}${fechaTexto}`,
  );
  return el;
}

export function crearElementoUbicacion(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-ubicacion";
  el.setAttribute("aria-label", "Tu ubicación");
  return el;
}
