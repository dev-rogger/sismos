import { NextResponse } from "next/server";
import { getEstadoIngesta } from "@sismos/db";

export const dynamic = "force-dynamic";

const UMBRAL_CSN_MS = 15 * 60 * 1000;

// Sin secreto: solo expone `ok`, nombres de fuente y edad (segundos) del último
// ok. Nunca mensajes de error ni timestamps. "csn ok" = la ingesta completa
// corrió sin lanzar (ver runIngest); lo que detecta es que el cron dejó de
// correr o que la BD no responde, no que CSN esté caído (eso lo cubre la
// alerta de 2h).
export async function GET() {
  const headers = { "Cache-Control": "no-store" };
  try {
    const filas = await getEstadoIngesta();
    const ahora = Date.now();
    const fuentes: Record<string, { edadSegundos: number | null }> = {};
    for (const f of filas) {
      fuentes[f.fuente] = {
        edadSegundos: f.ultimoOk
          ? Math.max(0, Math.floor((ahora - f.ultimoOk.getTime()) / 1000))
          : null,
      };
    }
    const csn = filas.find((f) => f.fuente === "csn");
    const ok =
      !!csn?.ultimoOk && ahora - csn.ultimoOk.getTime() < UMBRAL_CSN_MS;
    return NextResponse.json({ ok, fuentes }, { status: ok ? 200 : 503, headers });
  } catch (error) {
    console.error("[health] no se pudo leer el estado:", error);
    return NextResponse.json(
      { ok: false, fuentes: {} },
      { status: 503, headers },
    );
  }
}
