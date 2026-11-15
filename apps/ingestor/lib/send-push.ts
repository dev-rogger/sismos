import { createHash } from "node:crypto";
import webpush from "web-push";
import {
  findSubscripcionesParaSismo,
  deletePushSubscription,
} from "@sismos/db";
import {
  esEndpointPushPermitido,
  regionChilePorLatitud,
  TOPE_ANTIGUEDAD_NOTIFICACION_MS,
  type SismoNormalizado,
} from "@sismos/shared";

// M8+ dejaba fuera la mayoría de los sismos realmente peligrosos para la
// vida (varios terremotos con víctimas y daño real en Chile han estado en
// el rango M6.5-7.5, no solo los catastróficos M8+) — se baja el umbral
// para que más eventos con riesgo real reciban urgency:"high" +
// requireInteraction + vibración más intensa.
const UMBRAL_TERREMOTO = 6.5;
// Si el servicio de push no logra entregar en 1 h (mismo tope que la decisión
// de avisar), el aviso ya no sirve: que lo descarte en vez de entregarlo tarde.
const TTL_SEGUNDOS = 60 * 60;
const MAX_ENVIOS_SIMULTANEOS = 50;

export interface ResultadoEnvioPush {
  enviados: number;
  fallidos: number;
  eliminados: number;
}

/**
 * `Topic` de web-push: máx. 32 caracteres, solo base64url. Un hash corto del
 * externalId garantiza ambas cosas sea cual sea el id; permite que el servicio
 * de push reemplace un aviso pendiente del mismo sismo.
 */
export function topicParaSismo(externalId: string): string {
  return createHash("sha256").update(externalId).digest("base64url").slice(0, 32);
}

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

function esErrorConStatusCode(error: unknown): error is { statusCode: number } {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof (error as { statusCode: unknown }).statusCode === "number"
  );
}

export async function enviarPushParaSismo(
  evento: SismoNormalizado,
  opts: {
    motivo?: "nuevo" | "revision";
    /**
     * Excluye a los suscriptores con alcanceMundial: ya recibieron el aviso de
     * este sismo cuando lo vio USGS (ver decidirNotificacion).
     */
    omitirAlcanceMundial?: boolean;
  } = {},
): Promise<ResultadoEnvioPush> {
  const resultado: ResultadoEnvioPush = { enviados: 0, fallidos: 0, eliminados: 0 };
  const antiguedadMs = Date.now() - evento.fecha.getTime();
  if (antiguedadMs > TOPE_ANTIGUEDAD_NOTIFICACION_MS) {
    console.log(
      `[send-push] omitiendo push para ${evento.externalId}: antigüedad ${Math.round(antiguedadMs / 60000)}min supera el tope de ${TOPE_ANTIGUEDAD_NOTIFICACION_MS / 60000}min`,
    );
    return resultado;
  }

  configurarVapid();

  const destinatarios = await findSubscripcionesParaSismo({
    magnitud: evento.magnitud,
    latitud: evento.latitud,
    longitud: evento.longitud,
    profundidadKm: evento.profundidadKm,
    fuente: evento.fuente,
  });
  // Suscripciones guardadas antes de la allowlist de endpoints (o insertadas
  // por fuera de la API): no se les envía nada —el servidor haría un POST a un
  // destino arbitrario— y se borran.
  const invalidas = destinatarios.filter(
    (s) => !esEndpointPushPermitido(s.endpoint),
  );
  if (invalidas.length > 0) {
    console.warn(
      `[send-push] descartando ${invalidas.length} suscripción(es) con endpoint no permitido`,
    );
    await Promise.all(invalidas.map((s) => deletePushSubscription(s.endpoint)));
  }
  const validas = destinatarios.filter((s) =>
    esEndpointPushPermitido(s.endpoint),
  );
  const suscripciones = opts.omitirAlcanceMundial
    ? validas.filter((s) => !s.alcanceMundial)
    : validas;
  if (suscripciones.length === 0) return resultado;

  const esRevision = opts.motivo === "revision";
  const url = `/?sismo=${evento.externalId}&lat=${evento.latitud}&lon=${evento.longitud}&mag=${evento.magnitud}&prof=${evento.profundidadKm}&lugar=${encodeURIComponent(evento.lugar)}`;
  const nombreRegion =
    evento.fuente === "csn" ? regionChilePorLatitud(evento.latitud) : null;
  const region = nombreRegion ? formatearRegion(nombreRegion) : evento.lugar;
  const esTerremoto = evento.magnitud >= UMBRAL_TERREMOTO;
  const tipoEvento = esTerremoto ? "Terremoto" : "Sismo";
  const emoji = esTerremoto ? "🚨" : "📍";
  const hora = evento.fecha.toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });
  const titulo = esRevision
    ? `${emoji} ${tipoEvento} actualizado: magnitud ${evento.magnitud} en ${region}`
    : `${emoji} ${tipoEvento} de magnitud ${evento.magnitud} en ${region}`;
  const payload = JSON.stringify({
    title: titulo,
    body: `${evento.lugar} · ${hora} hrs · Aviso informativo posterior al sismo, no es una alerta temprana`,
    url,
    severo: esTerremoto,
    tag: `sismo-${evento.externalId}`,
    timestamp: evento.fecha.getTime(),
    renotify: esRevision,
  });

  // "high" le pide a los servicios de push (FCM/APNs/Mozilla) que entreguen
  // de inmediato en vez de demorar por ahorro de batería del dispositivo —
  // para un terremoto esa demora le hace perder el propósito al aviso. Los
  // sismos regulares usan "normal" para no saturar de avisos urgentes.
  const opciones = {
    urgency: esTerremoto ? "high" : "normal",
    TTL: TTL_SEGUNDOS,
    topic: topicParaSismo(evento.externalId),
  } as const;

  for (let i = 0; i < suscripciones.length; i += MAX_ENVIOS_SIMULTANEOS) {
    const lote = suscripciones.slice(i, i + MAX_ENVIOS_SIMULTANEOS);
    const resultados = await Promise.allSettled(
      lote.map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          opciones,
        ),
      ),
    );
    await Promise.all(
      resultados.map((r, j) => {
        if (r.status === "fulfilled") {
          resultado.enviados++;
          return undefined;
        }
        resultado.fallidos++;
        const sub = lote[j];
        if (
          sub &&
          esErrorConStatusCode(r.reason) &&
          (r.reason.statusCode === 404 || r.reason.statusCode === 410)
        ) {
          resultado.eliminados++;
          return deletePushSubscription(sub.endpoint);
        }
        return undefined;
      }),
    );
  }

  console.log(
    `[send-push] ${evento.externalId} (${opts.motivo ?? "nuevo"}): enviados=${resultado.enviados} fallidos=${resultado.fallidos} eliminados=${resultado.eliminados}`,
  );
  // Si NINGÚN envío llegó y hubo fallos que no son suscripciones muertas
  // (404/410), el problema es del servicio de push o de la red: se lanza para
  // que el ingestor NO marque el sismo como avisado y lo reintente en la
  // siguiente corrida. Con fallo parcial (al menos un envío exitoso) sí se
  // marca como avisado: reintentar duplicaría el aviso a quienes ya lo
  // recibieron, y quienes fallaron quedan sin aviso (límite conocido).
  if (resultado.enviados === 0 && resultado.fallidos - resultado.eliminados > 0) {
    throw new Error(
      `ningún envío de push llegó para ${evento.externalId}: fallidos=${resultado.fallidos} eliminados=${resultado.eliminados}`,
    );
  }
  return resultado;
}

const WEBHOOK_TIMEOUT_MS = 5000;

// Canal alterno (Slack/Discord/ntfy-compatible: POST JSON {text}). Solo si
// ALERTA_WEBHOOK_URL existe. Nunca lanza, y no loguea la URL (lleva token).
async function enviarAlertaWebhook(mensaje: string): Promise<void> {
  const url = process.env.ALERTA_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `Sismos — alerta de ingesta: ${mensaje}` }),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`[send-push] webhook de alerta respondió ${res.status}`);
    }
  } catch (error) {
    console.error(
      "[send-push] error enviando alerta por webhook:",
      error instanceof Error ? error.name : "desconocido",
    );
  }
}

export async function enviarAlertaAdmin(mensaje: string): Promise<void> {
  // Los dos canales son independientes: que uno no esté configurado o falle
  // no impide el otro.
  await Promise.all([enviarAlertaPush(mensaje), enviarAlertaWebhook(mensaje)]);
}

async function enviarAlertaPush(mensaje: string): Promise<void> {
  const endpoint = process.env.ALERTA_PUSH_ENDPOINT;
  const p256dh = process.env.ALERTA_PUSH_P256DH;
  const auth = process.env.ALERTA_PUSH_AUTH;
  if (!endpoint || !p256dh || !auth) {
    console.warn(
      "[send-push] alerta admin no configurada (faltan ALERTA_PUSH_ENDPOINT/P256DH/AUTH)",
    );
    return;
  }

  try {
    configurarVapid();
    const payload = JSON.stringify({
      title: "Sismos — alerta de ingesta",
      body: mensaje,
      url: "/",
    });
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth } },
      payload,
    );
  } catch (error) {
    console.error("[send-push] error enviando alerta admin:", error);
  }
}
