import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "../../../lib/ingest";

// Comparación en tiempo constante. timingSafeEqual lanza si las longitudes
// difieren, así que se descartan antes (la longitud no es secreta aquí).
function secretoValido(recibido: string | null, esperado: string): boolean {
  if (recibido === null) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : null;
  const isAuthorized =
    secretoValido(bearer, cronSecret) ||
    secretoValido(request.headers.get("x-cron-secret"), cronSecret);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runIngest();
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[ingest] Ingest failed:", error);
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}
