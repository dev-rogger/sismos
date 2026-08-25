import { colorPorMagnitud, tamanoPorMagnitud } from "../../lib/magnitud";

const TAP_TARGET_MIN_PX = 44;

export function crearElementoMarcador(
  magnitud: number,
  opciones: {
    pulsando: boolean;
    lugar: string;
    fecha: string;
    ubicacionAproximada?: boolean;
    // Este módulo no es un componente React (arma elementos DOM para los
    // marcadores de MapLibre) y no tiene acceso a hooks — el caller
    // (MapaSismos.tsx, que sí usa useTranslations/useLocale) arma el texto
    // ya traducido del aria-label (incluyendo el sufijo de ubicación
    // aproximada si corresponde) y el locale para formatear la fecha.
    ariaLabelBase: string;
    localeFecha: string;
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
    `${opciones.ariaLabelBase}, ${new Date(opciones.fecha).toLocaleString(opciones.localeFecha)}`,
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
  // Mismo motivo que en crearElementoMarcador: texto y locale ya resueltos
  // por el caller.
  ariaLabelBase: string;
  localeFecha: string;
}): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-seleccion";
  const fechaTexto = opciones.fecha
    ? `, ${new Date(opciones.fecha).toLocaleString(opciones.localeFecha)}`
    : "";
  el.setAttribute("aria-label", `${opciones.ariaLabelBase}${fechaTexto}`);
  return el;
}

export function crearElementoUbicacion(ariaLabel: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "marcador-ubicacion";
  el.setAttribute("aria-label", ariaLabel);
  return el;
}
