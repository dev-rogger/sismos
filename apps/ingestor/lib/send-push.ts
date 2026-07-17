import webpush from "web-push";
import {
  findSubscripcionesParaMagnitud,
  deletePushSubscription,
} from "@sismos/db";
import type { SismoNormalizado } from "@sismos/shared";

let vapidConfigurado = false;

function configurarVapid(): void {
  if (vapidConfigurado) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error(
      "VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT must be set",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigurado = true;
}

function esErrorConStatusCode(
  error: unknown,
): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  );
}

export async function enviarPushParaSismo(
  evento: SismoNormalizado,
): Promise<void> {
  configurarVapid();

  const suscripciones = await findSubscripcionesParaMagnitud(evento.magnitud);
  if (suscripciones.length === 0) return;

  const url = `/?sismo=${evento.externalId}&lat=${evento.latitud}&lon=${evento.longitud}&mag=${evento.magnitud}&lugar=${encodeURIComponent(evento.lugar)}`;
  const payload = JSON.stringify({
    title: `Sismo M${evento.magnitud} en ${evento.lugar}`,
    body: evento.fecha.toLocaleString("es-CL"),
    url,
  });

  const resultados = await Promise.allSettled(
    suscripciones.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload,
      ),
    ),
  );

  await Promise.all(
    resultados.map((resultado, i) => {
      const suscripcion = suscripciones[i];
      if (
        suscripcion &&
        resultado.status === "rejected" &&
        esErrorConStatusCode(resultado.reason) &&
        resultado.reason.statusCode === 410
      ) {
        return deletePushSubscription(suscripcion.endpoint);
      }
      return undefined;
    }),
  );
}
