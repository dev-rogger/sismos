import { NextResponse } from "next/server";
import { guardarSuscripcion, eliminarSuscripcion } from "../../../../lib/push-subscriptions";

interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  magnitudMinima?: number;
}

function esMagnitudValida(valor: unknown): valor is number {
  return typeof valor === "number" && valor >= 4 && valor <= 7;
}

export async function POST(request: Request) {
  const body = (await request.json()) as SubscribeBody;
  const endpoint = body.subscription?.endpoint;
  const keys = body.subscription?.keys;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Missing subscription endpoint or keys" },
      { status: 400 },
    );
  }
  if (!esMagnitudValida(body.magnitudMinima)) {
    return NextResponse.json(
      { error: "magnitudMinima must be a number between 4 and 7" },
      { status: 400 },
    );
  }

  try {
    await guardarSuscripcion({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      magnitudMinima: body.magnitudMinima,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/push/subscribe] POST failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { endpoint?: string };
  if (!body.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  try {
    await eliminarSuscripcion(body.endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/push/subscribe] DELETE failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
