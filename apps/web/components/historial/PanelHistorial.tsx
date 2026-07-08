"use client";

import { useEffect, useState } from "react";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
}

const OPCIONES: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Histórico" },
];

export default function PanelHistorial() {
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<ItemHistorial[]>([]);
  const [expandido, setExpandido] = useState(false);

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

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-10 flex max-h-[80vh] flex-col rounded-t-2xl bg-neutral-900 shadow-lg transition-transform duration-300 lg:static lg:h-full lg:max-h-none lg:w-[360px] lg:translate-y-0 lg:rounded-none lg:shadow-none lg:transition-none ${
        expandido ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
      }`}
    >
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full shrink-0 items-center justify-center py-3 lg:hidden"
        aria-expanded={expandido}
      >
        <span className="h-1.5 w-10 rounded-full bg-neutral-600" />
      </button>

      <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-6 lg:h-full lg:pt-4">
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoHistorial)}
          className="rounded border border-neutral-700 bg-transparent px-2 py-1 text-sm"
        >
          {OPCIONES.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>

        <ul className="flex flex-col gap-2">
          {eventos.map((evento) => (
            <li
              key={evento.externalId}
              className="rounded border border-neutral-800 px-3 py-2 text-sm"
            >
              <div className="font-semibold">{evento.lugar}</div>
              <div className="text-neutral-400">
                M{evento.magnitud} —{" "}
                {new Date(evento.fecha).toLocaleString("es-CL")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
