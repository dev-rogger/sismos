import { NextResponse } from "next/server";
import {
  guardarSuscripcion,
  eliminarSuscripcion,
  obtenerSuscripcion,
} from "../../../../lib/push-subscriptions";
import { esRadioKmValido, esCentroValido } from "../../../../lib/radio-notificacion";

interface SubscribeBody {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  magnitudMinima?: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
  alcanceMundial?: boolean;
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
  if (body.radioKm != null && !esRadioKmValido(body.radioKm)) {
    return NextResponse.json(
      { error: "radioKm must be null or a number between 25 and 1000" },
      { status: 400 },
    );
  }
  if (body.centro != null && !esCentroValido(body.centro)) {
    return NextResponse.json(
      { error: "centro must be null or { lat, lon }" },
      { status: 400 },
    );
  }
  if (body.alcanceMundial != null && typeof body.alcanceMundial !== "boolean") {
    return NextResponse.json(
      { error: "alcanceMundial must be a boolean" },
      { status: 400 },
    );
  }

  try {
    await guardarSuscripcion({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      magnitudMinima: body.magnitudMinima,
      centro: body.centro ?? null,
      radioKm: body.radioKm ?? null,
      alcanceMundial: body.alcanceMundial ?? false,
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  try {
    const suscripcion = await obtenerSuscripcion(endpoint);
    if (!suscripcion) {
      return NextResponse.json({ subscription: null });
    }
    return NextResponse.json({
      subscription: {
        magnitudMinima: suscripcion.magnitudMinima,
        centro: suscripcion.centro,
        radioKm: suscripcion.radioKm,
        alcanceMundial: suscripcion.alcanceMundial,
      },
    });
  } catch (error) {
    console.error("[api/push/subscribe] GET failed:", error);
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
