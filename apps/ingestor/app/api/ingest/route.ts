import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "../../../lib/ingest";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-cron-secret");
  const isAuthorized =
    authHeader === `Bearer ${cronSecret}` || cronHeader === cronSecret;

  if (!cronSecret || !isAuthorized) {
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
