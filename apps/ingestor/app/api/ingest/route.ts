import { NextResponse } from "next/server";

// TODO: reemplazar por la consulta real a CSN + USGS, normalización
// (vía @sismos/shared) y guardado con dedupe (vía @sismos/db).
export async function GET() {
  return NextResponse.json({ status: "not implemented yet" });
}
