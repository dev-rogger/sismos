"use client";

import { useEffect, useState } from "react";
import { magnitudPasaRangos, type RangoMagnitud } from "./filtro-tipos";

export type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

export interface ItemHistorial {
  externalId: string;
  fecha: string;
  magnitud: number;
  lugar: string;
  latitud: number;
  longitud: number;
  bandera: string | null;
  profundidadKm: number;
}

export const OPCIONES_TIPO: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Los más poderosos de la historia" },
];

interface UseHistorialParams {
  soloChile: boolean;
  rangos: RangoMagnitud[];
}

export function useHistorial({ soloChile, rangos }: UseHistorialParams) {
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<ItemHistorial[]>([]);

  useEffect(() => {
    let cancelado = false;
    const params = new URLSearchParams({ tipo });
    // Solo importa para tipo=historico (el servidor trae un top 10 propio
    // por alcance, en vez de que el cliente filtre un top 10 ya chico).
    // Para los otros tipos el servidor lo ignora — igual se filtra abajo.
    params.set("soloChile", String(soloChile));
    fetch(`/api/historial?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error(`historial fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data: { eventos: ItemHistorial[] }) => {
        if (!cancelado) setEventos(data.eventos ?? []);
      })
      .catch((error) => {
        console.error("[useHistorial] fetch failed:", error);
      });
    return () => {
      cancelado = true;
    };
  }, [tipo, soloChile]);

  const eventosFiltrados = eventos.filter((evento) => {
    if (soloChile && evento.bandera !== "🇨🇱") return false;
    if (!magnitudPasaRangos(evento.magnitud, rangos)) return false;
    return true;
  });

  return { tipo, setTipo, eventosFiltrados };
}
