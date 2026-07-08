import { NextResponse } from "next/server";
import { getSismosDesde } from "../../../lib/fetch-sismos";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sinceParam = searchParams.get("since");

  if (!sinceParam) {
    return NextResponse.json(
      { error: "Missing required query param: since" },
      { status: 400 },
    );
  }

  const since = new Date(sinceParam);
  if (Number.isNaN(since.getTime())) {
    return NextResponse.json(
      { error: "Invalid date in query param: since" },
      { status: 400 },
    );
  }

  try {
    const sismos = await getSismosDesde(since);
    return NextResponse.json({ sismos });
  } catch (error) {
    console.error("[api/sismos] failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
