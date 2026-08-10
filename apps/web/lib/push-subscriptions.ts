import {
  upsertPushSubscription,
  deletePushSubscription,
  getPushSubscriptionByEndpoint,
  type PushSubscription,
} from "@sismos/db";

interface GuardarSuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
  alcanceMundial?: boolean;
}

export async function guardarSuscripcion(
  input: GuardarSuscripcionInput,
): Promise<PushSubscription> {
  return upsertPushSubscription(input);
}

export async function eliminarSuscripcion(endpoint: string): Promise<void> {
  return deletePushSubscription(endpoint);
}

export async function obtenerSuscripcion(
  endpoint: string,
): Promise<PushSubscription | null> {
  return getPushSubscriptionByEndpoint(endpoint);
}
