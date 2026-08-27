import { NextResponse } from "next/server";
import { getUltimosDias, getConteoPorPeriodo } from "../../../lib/fetch-sismos";
import type { GranularidadConteo } from "@sismos/db";

const DIAS_LISTADO = 7;

// Ventana de cada granularidad: suficientemente larga para leerse como
// tendencia, sin pasarse de barras legibles en un gráfico mobile (ej. "año"
// con más de ~6 barras ya es difícil de leer en una pantalla angosta).
const VENTANA_DIAS: Record<GranularidadConteo, number> = {
  dia: 30,
  semana: 12 * 7,
  mes: 12 * 30,
  anio: 5 * 365,
};

function esGranularidadValida(
  valor: string | null,
): valor is GranularidadConteo {
  return valor === "dia" || valor === "semana" || valor === "mes" || valor === "anio";
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const granularidad = searchParams.get("granularidad");
  const soloChile = searchParams.get("soloChile") === "true";

  if (!esGranularidadValida(granularidad)) {
    return NextResponse.json(
      {
        error:
          "Invalid or missing query param: granularidad (expected dia | semana | mes | anio)",
      },
      { status: 400 },
    );
  }

  try {
    const desde = new Date(
      Date.now() - VENTANA_DIAS[granularidad] * 24 * 60 * 60 * 1000,
    );
    const [ultimos7Dias, conteos] = await Promise.all([
      getUltimosDias(DIAS_LISTADO, soloChile),
      getConteoPorPeriodo(granularidad, desde, soloChile),
    ]);
    return NextResponse.json({ ultimos7Dias, conteos });
  } catch (error) {
    console.error("[api/estadisticas] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
