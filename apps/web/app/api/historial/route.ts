import { NextResponse } from "next/server";
import {
  getUltimos10Dias,
  getTop10UltimosAnios,
  getTopHistoricos,
} from "../../../lib/fetch-sismos";

type TipoHistorial = "historico" | "top10anios" | "ultimos10dias";

function esTipoValido(valor: string | null): valor is TipoHistorial {
  return (
    valor === "historico" ||
    valor === "top10anios" ||
    valor === "ultimos10dias"
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo");

  if (!esTipoValido(tipo)) {
    return NextResponse.json(
      {
        error:
          "Invalid or missing query param: tipo (expected historico | top10anios | ultimos10dias)",
      },
      { status: 400 },
    );
  }

  try {
    if (tipo === "historico") {
      const eventos = await getTopHistoricos();
      return NextResponse.json({ eventos });
    }
    if (tipo === "top10anios") {
      const eventos = await getTop10UltimosAnios();
      return NextResponse.json({ eventos });
    }
    const eventos = await getUltimos10Dias();
    return NextResponse.json({ eventos });
  } catch (error) {
    console.error("[api/historial] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
