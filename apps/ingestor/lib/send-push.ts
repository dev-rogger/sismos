import webpush from "web-push";
import {
  findSubscripcionesParaSismo,
  deletePushSubscription,
} from "@sismos/db";
import { regionChilePorLatitud, type SismoNormalizado } from "@sismos/shared";

const UMBRAL_TERREMOTO = 8;
const TOPE_ANTIGUEDAD_PUSH_MS = 60 * 60 * 1000;

const REGIONES_CON_DEL = new Set([
  "Biobío",
  "Maule",
  "Libertador General Bernardo O'Higgins",
]);

function formatearRegion(nombreRegion: string): string {
  if (nombreRegion.startsWith("Metropolitana")) return `Región ${nombreRegion}`;
  if (REGIONES_CON_DEL.has(nombreRegion)) return `Región del ${nombreRegion}`;
  return `Región de ${nombreRegion}`;
}

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
  const antiguedadMs = Date.now() - evento.fecha.getTime();
  if (antiguedadMs > TOPE_ANTIGUEDAD_PUSH_MS) {
    console.log(
      `[send-push] omitiendo push para ${evento.externalId}: antigüedad ${Math.round(antiguedadMs / 60000)}min supera el tope de 60min`,
    );
    return;
  }

  configurarVapid();

  const suscripciones = await findSubscripcionesParaSismo({
    magnitud: evento.magnitud,
    latitud: evento.latitud,
    longitud: evento.longitud,
    fuente: evento.fuente,
  });
  if (suscripciones.length === 0) return;

  const url = `/?sismo=${evento.externalId}&lat=${evento.latitud}&lon=${evento.longitud}&mag=${evento.magnitud}&lugar=${encodeURIComponent(evento.lugar)}`;
  const nombreRegion =
    evento.fuente === "csn" ? regionChilePorLatitud(evento.latitud) : null;
  const region = nombreRegion ? formatearRegion(nombreRegion) : evento.lugar;
  const tipoEvento = evento.magnitud >= UMBRAL_TERREMOTO ? "terremoto" : "sismo";
  const payload = JSON.stringify({
    title: `Nuevo ${tipoEvento} de ${evento.magnitud} en ${region}`,
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

export async function enviarAlertaAdmin(mensaje: string): Promise<void> {
  const endpoint = process.env.ALERTA_PUSH_ENDPOINT;
  const p256dh = process.env.ALERTA_PUSH_P256DH;
  const auth = process.env.ALERTA_PUSH_AUTH;
  if (!endpoint || !p256dh || !auth) {
    console.warn(
      "[send-push] alerta admin no configurada (faltan ALERTA_PUSH_ENDPOINT/P256DH/AUTH)",
    );
    return;
  }

  configurarVapid();
  const payload = JSON.stringify({
    title: "Sismos — alerta de ingesta",
    body: mensaje,
    url: "/",
  });

  try {
    await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload);
  } catch (error) {
    console.error("[send-push] error enviando alerta admin:", error);
  }
}
