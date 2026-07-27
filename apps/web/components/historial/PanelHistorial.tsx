"use client";

import { useEffect, useRef, useState } from "react";
import { formatearCoordenadas } from "../../lib/coordenadas";
import { colorPorMagnitud } from "../../lib/magnitud";
import { regionChilePorLatitud } from "@sismos/shared";
import type { SismoSeleccionado } from "../../lib/tipos-sismo";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
  latitud: number;
  longitud: number;
  bandera: string | null;
}

interface PanelHistorialProps {
  sismoSeleccionado: SismoSeleccionado | null;
  onSeleccionar: (sismo: SismoSeleccionado | null) => void;
  soloChile: boolean;
  onSoloChileChange: (soloChile: boolean) => void;
  magnitudMinima: number;
  onMagnitudMinimaChange: (magnitudMinima: number) => void;
}

const OPCIONES: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Histórico" },
];

const ALTURA_COLAPSADA_PX = 56; // 3.5rem, la franja del handle que queda visible cuando está cerrado
const ARRASTRE_UMBRAL_PX = 40; // distancia mínima para que el arrastre decida abrir/cerrar

interface InfoArrastre {
  startY: number;
  baseY: number;
  openY: number;
  closedY: number;
}

export default function PanelHistorial({
  sismoSeleccionado,
  onSeleccionar,
  soloChile,
  onSoloChileChange,
  magnitudMinima,
  onMagnitudMinimaChange,
}: PanelHistorialProps) {
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<ItemHistorial[]>([]);
  const [expandido, setExpandido] = useState(false);
  const [arrastreTranslateY, setArrastreTranslateY] = useState<number | null>(
    null,
  );
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);
  const infoArrastreRef = useRef<InfoArrastre | null>(null);
  const suprimirClickRef = useRef(false);

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/historial?tipo=${tipo}`)
      .then((res) => {
        if (!res.ok) throw new Error(`historial fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { eventos: ItemHistorial[] }) => {
        if (!cancelado) setEventos(data.eventos ?? []);
      })
      .catch((error) => {
        console.error("[PanelHistorial] fetch failed:", error);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo]);

  useEffect(() => {
    if (!sismoSeleccionado) return;
    const el = itemRefs.current.get(sismoSeleccionado.externalId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [sismoSeleccionado, eventos]);

  const eventosFiltrados = eventos.filter((evento) => {
    if (soloChile && evento.bandera !== "🇨🇱") return false;
    if (evento.magnitud < magnitudMinima) return false;
    return true;
  });

  const manejarPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const panel = panelRef.current;
    if (!panel) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const areaSeguraInferior =
      parseFloat(getComputedStyle(panel).paddingBottom) || 0;
    const closedY = Math.max(
      panel.offsetHeight - (ALTURA_COLAPSADA_PX + areaSeguraInferior),
      0,
    );
    // Medimos la posición real en pantalla (en vez de asumir 0 o closedY)
    // para que el arrastre continúe exactamente donde el CSS lo está
    // pintando, sin saltos por redondeos o por el viewport dinámico de iOS.
    const topEnPantalla = panel.getBoundingClientRect().top;
    const topCuandoAbierto = window.innerHeight - panel.offsetHeight;
    const baseY = topEnPantalla - topCuandoAbierto;
    infoArrastreRef.current = {
      startY: e.clientY,
      baseY,
      openY: 0,
      closedY,
    };
  };

  const manejarPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const info = infoArrastreRef.current;
    if (!info) return;
    const delta = e.clientY - info.startY;
    const nuevo = Math.min(
      info.closedY,
      Math.max(info.openY, info.baseY + delta),
    );
    setArrastreTranslateY(nuevo);
  };

  const finalizarArrastre = (e: React.PointerEvent<HTMLButtonElement>) => {
    const info = infoArrastreRef.current;
    infoArrastreRef.current = null;
    setArrastreTranslateY(null);
    if (!info) return;
    const delta = e.clientY - info.startY;
    if (Math.abs(delta) >= ARRASTRE_UMBRAL_PX) {
      setExpandido(delta < 0);
      suprimirClickRef.current = true;
    }
  };

  const manejarClickHandle = () => {
    if (suprimirClickRef.current) {
      suprimirClickRef.current = false;
      return;
    }
    setExpandido((v) => !v);
  };

  return (
    <div
      ref={panelRef}
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        ...(arrastreTranslateY !== null
          ? { translate: `0px ${arrastreTranslateY}px`, transition: "none" }
          : {}),
      }}
      className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[80vh] flex-col rounded-t-2xl bg-neutral-900 shadow-lg transition-transform duration-300 lg:static lg:h-full lg:max-h-none lg:w-[360px] lg:translate-y-0 lg:rounded-none lg:border-l lg:border-neutral-800 lg:shadow-none lg:transition-none ${
        expandido
          ? "translate-y-0"
          : "translate-y-[calc(100%_-_3.5rem_-_env(safe-area-inset-bottom))]"
      }`}
    >
      <button
        type="button"
        onClick={manejarClickHandle}
        onPointerDown={manejarPointerDown}
        onPointerMove={manejarPointerMove}
        onPointerUp={finalizarArrastre}
        onPointerCancel={finalizarArrastre}
        className="flex w-full shrink-0 touch-none cursor-grab items-center justify-center pt-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] active:cursor-grabbing lg:hidden"
        aria-expanded={expandido}
      >
        <span className="h-1.5 w-10 rounded-full bg-neutral-600" />
      </button>

      <div className="shrink-0 border-b border-neutral-800 px-4 pb-3">
        <h2 className="mb-2 text-base font-semibold text-neutral-100">
          Historial de sismos
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoHistorial)}
              className="w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-8 text-sm text-neutral-100 transition-colors hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
            >
              {OPCIONES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
              ▾
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSoloChileChange(!soloChile)}
            aria-pressed={soloChile}
            className={`flex min-h-11 shrink-0 items-center justify-center rounded-lg border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
              soloChile
                ? "border-sky-500 bg-sky-500/10 text-sky-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            🇨🇱 Solo Chile
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <label
            htmlFor="magnitud-minima"
            className="shrink-0 text-xs text-neutral-400"
          >
            M{magnitudMinima}+
          </label>
          <input
            id="magnitud-minima"
            type="range"
            min={2}
            max={7}
            step={1}
            value={magnitudMinima}
            onChange={(e) => onMagnitudMinimaChange(Number(e.target.value))}
            className="flex-1 accent-sky-500"
          />
        </div>
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 py-3">
        {eventosFiltrados.map((evento) => {
          const seleccionado =
            evento.externalId === sismoSeleccionado?.externalId;
          const region =
            evento.bandera === "🇨🇱"
              ? regionChilePorLatitud(evento.latitud)
              : null;
          return (
            <li
              key={evento.externalId}
              ref={(el) => {
                if (el) itemRefs.current.set(evento.externalId, el);
              }}
            >
              <button
                type="button"
                onClick={() =>
                  onSeleccionar(
                    seleccionado
                      ? null
                      : {
                          externalId: evento.externalId,
                          latitud: evento.latitud,
                          longitud: evento.longitud,
                          magnitud: evento.magnitud,
                          lugar: evento.lugar,
                        },
                  )
                }
                style={{ borderLeftColor: colorPorMagnitud(evento.magnitud) }}
                className={`w-full rounded-lg border border-l-4 px-3 py-2 text-left text-sm transition-colors ${
                  seleccionado
                    ? "border-neutral-600 bg-neutral-800"
                    : "border-neutral-800 bg-neutral-900 hover:bg-neutral-800/60"
                }`}
              >
                <div className="font-semibold text-neutral-100">
                  {evento.bandera ?? "🌎"} {evento.lugar}
                </div>
                {region && (
                  <div className="text-xs text-neutral-500">{region}</div>
                )}
                <div className="text-xs text-neutral-500">
                  {formatearCoordenadas(evento.latitud, evento.longitud)}
                </div>
                <div className="text-neutral-400">
                  M{evento.magnitud} —{" "}
                  {new Date(evento.fecha).toLocaleString("es-CL")}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
