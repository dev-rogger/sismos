import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import {
  guardarSuscripcion,
  eliminarSuscripcion,
  obtenerSuscripcion,
} from "../../../../lib/push-subscriptions";
import { esRadioKmValido, esCentroValido } from "../../../../lib/radio-notificacion";
import {
  esEndpointPushPermitido,
  MAX_ENDPOINT_LENGTH,
  MAX_KEY_LENGTH,
} from "@sismos/shared";

// Rate limit en memoria del proceso: best-effort. En serverless cada instancia
// tiene su propio contador, así que frena abusos simples pero no es una garantía.
const LIMITE_POR_MINUTO = 20;
const VENTANA_MS = 60_000;
const peticionesPorIp = new Map<string, { inicio: number; cuenta: number }>();

function superaRateLimit(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "desconocida";
  const ahora = Date.now();
  if (peticionesPorIp.size > 1000) {
    for (const [clave, v] of peticionesPorIp) {
      if (ahora - v.inicio >= VENTANA_MS) peticionesPorIp.delete(clave);
    }
  }
  const actual = peticionesPorIp.get(ip);
  if (!actual || ahora - actual.inicio >= VENTANA_MS) {
    peticionesPorIp.set(ip, { inicio: ahora, cuenta: 1 });
    return false;
  }
  actual.cuenta += 1;
  return actual.cuenta > LIMITE_POR_MINUTO;
}

function tooManyRequests() {
  return NextResponse.json({ error: "Too many requests" }, { status: 429 });
}

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
  if (superaRateLimit(request)) return tooManyRequests();
  let body: SubscribeBody;
  try {
    body = (await request.json()) as SubscribeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const endpoint = body.subscription?.endpoint;
  const keys = body.subscription?.keys;

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json(
      { error: "Missing subscription endpoint or keys" },
      { status: 400 },
    );
  }
  if (
    typeof endpoint !== "string" ||
    typeof keys.p256dh !== "string" ||
    typeof keys.auth !== "string" ||
    keys.p256dh.length > MAX_KEY_LENGTH ||
    keys.auth.length > MAX_KEY_LENGTH ||
    endpoint.length > MAX_ENDPOINT_LENGTH ||
    !esEndpointPushPermitido(endpoint)
  ) {
    return NextResponse.json(
      { error: "Invalid subscription endpoint or keys" },
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
    const session = await auth();
    await guardarSuscripcion({
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      magnitudMinima: body.magnitudMinima,
      centro: body.centro ?? null,
      radioKm: body.radioKm ?? null,
      alcanceMundial: body.alcanceMundial ?? false,
      userId: session?.user?.id ?? null,
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
  if (superaRateLimit(request)) return tooManyRequests();
  let body: { endpoint?: string };
  try {
    body = (await request.json()) as { endpoint?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
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
