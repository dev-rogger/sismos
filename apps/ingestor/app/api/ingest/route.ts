import { NextResponse } from "next/server";
import { getMongooseConnection } from "@sismos/db";
import { runIngest } from "../../../lib/ingest";

export async function GET() {
  try {
    await getMongooseConnection();
  } catch (error) {
    console.error("[ingest] Mongo connection failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }

  const summary = await runIngest();
  return NextResponse.json(summary);
}
