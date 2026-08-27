import { NextResponse } from "next/server";
import { getResumenPeriodo, getConteoPorPeriodo } from "../../../lib/fetch-sismos";
import type { GranularidadConteo } from "@sismos/db";

// Ventana del resumen/listado de arriba de la pantalla: sigue la
// granularidad elegida en el gráfico de abajo (pedido explícito del
// usuario) — con "Día" ve los últimos 7 días, con "Semana" las últimas 8
// semanas, etc. Números redondos, no calculados desde la ventana del
// gráfico (VENTANA_DIAS más abajo), que persigue un objetivo distinto
// (cantidad de barras legible).
const VENTANA_RESUMEN_DIAS: Record<GranularidadConteo, number> = {
  dia: 7,
  semana: 8 * 7,
  mes: 365,
  anio: 5 * 365,
};

// Tope de filas que trae el listado individual: la ventana de "año" puede
// tener miles de sismos "leves" — mostrarlos todos sería impracticable en
// mobile (y pesado de traer). El conteo de arriba de la pantalla sigue
// mostrando el total real (ver ResumenPeriodo en @sismos/db), solo la
// lista de abajo se acota.
const LIMITE_LISTADO = 200;

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
    const [resumen, conteos] = await Promise.all([
      getResumenPeriodo(
        VENTANA_RESUMEN_DIAS[granularidad],
        soloChile,
        LIMITE_LISTADO,
      ),
      getConteoPorPeriodo(granularidad, desde, soloChile),
    ]);
    return NextResponse.json({ resumen, conteos });
  } catch (error) {
    console.error("[api/estadisticas] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
