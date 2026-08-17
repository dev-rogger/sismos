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
  ubicacionAproximada?: boolean;
}

export const OPCIONES_TIPO: { valor: TipoHistorial; etiqueta: string }[] = [
  { valor: "ultimos10dias", etiqueta: "Últimos 10 días" },
  { valor: "top10anios", etiqueta: "Top 10 últimos 10 años" },
  { valor: "historico", etiqueta: "Los más poderosos de la historia" },
];

interface UseHistorialParams {
  soloChile: boolean;
  rangos: RangoMagnitud[];
  // Pospone el fetch mientras es false. Lo usa PantallaHistorial (mobile),
  // que ahora queda montada permanentemente para poder animar su cierre,
  // así no dispara su propio fetch antes de que el usuario la abra la
  // primera vez.
  activo?: boolean;
}

// Más espaciado que el polling del mapa (15s): acá no hay una animación de
// "sismo nuevo" que proteger, solo evitar que la lista quede con magnitud/
// profundidad viejas si CSN/USGS revisan un evento mientras el panel sigue
// montado (que en desktop es casi siempre, por el `lg:flex` de PanelHistorial).
const POLL_INTERVAL_MS = 60 * 1000;

export function useHistorial({
  soloChile,
  rangos,
  activo = true,
}: UseHistorialParams) {
  const [tipo, setTipo] = useState<TipoHistorial>("ultimos10dias");
  const [eventos, setEventos] = useState<ItemHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reintentos, setReintentos] = useState(0);

  useEffect(() => {
    if (!activo) return;
    let cancelado = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({ tipo });
    // Solo importa para tipo=historico (el servidor trae un top 10 propio
    // por alcance, en vez de que el cliente filtre un top 10 ya chico).
    // Para los otros tipos el servidor lo ignora — igual se filtra abajo.
    params.set("soloChile", String(soloChile));

    function cargar(): Promise<void> {
      return fetch(`/api/historial?${params}`)
        .then((res) => {
          if (!res.ok) throw new Error(`historial fetch failed: ${res.status}`);
          return res.json();
        })
        .then((data: { eventos: ItemHistorial[] }) => {
          if (cancelado) return;
          setEventos(data.eventos ?? []);
        });
    }

    cargar()
      .then(() => {
        if (!cancelado) setLoading(false);
      })
      .catch((error) => {
        console.error("[useHistorial] fetch failed:", error);
        if (cancelado) return;
        setError(true);
        setLoading(false);
      });

    // Refresco en segundo plano: no toca loading/error para no hacer
    // parpadear la lista ya cargada. Si un refresco puntual falla, se
    // ignora y se reintenta solo en el próximo ciclo.
    const intervalId = setInterval(() => {
      cargar().catch((error) => {
        console.error("[useHistorial] background refresh failed:", error);
      });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelado = true;
      clearInterval(intervalId);
    };
  }, [tipo, soloChile, reintentos, activo]);

  const eventosFiltrados = eventos.filter((evento) => {
    if (soloChile && evento.bandera !== "🇨🇱") return false;
    if (!magnitudPasaRangos(evento.magnitud, rangos)) return false;
    return true;
  });

  return {
    tipo,
    setTipo,
    eventosFiltrados,
    loading,
    error,
    reintentar: () => setReintentos((n) => n + 1),
  };
}
