import { eq } from "drizzle-orm";
import {
  seleccionarDestinatarios,
  UMBRAL_MAGNITUD_MUNDIAL,
  type SismoFuente,
} from "@sismos/shared";
import { getDb } from "../connection";
import { pushSubscriptions } from "../schema";

export interface PushSubscription {
  id: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro: { lat: number; lon: number } | null;
  radioKm: number | null;
  alcanceMundial: boolean;
  userId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  centro?: { lat: number; lon: number } | null;
  radioKm?: number | null;
  alcanceMundial?: boolean;
  userId?: string | null;
}

function toPushSubscription(
  row: typeof pushSubscriptions.$inferSelect,
): PushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    magnitudMinima: row.magnitudMinima,
    centro:
      row.centroLat !== null && row.centroLon !== null
        ? { lat: row.centroLat, lon: row.centroLon }
        : null,
    radioKm: row.radioKm,
    alcanceMundial: row.alcanceMundial,
    userId: row.userId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertPushSubscription(
  input: SuscripcionInput,
): Promise<PushSubscription> {
  const now = new Date();
  const centro = input.centro ?? null;
  const radioKm = input.radioKm ?? null;
  const alcanceMundial = input.alcanceMundial ?? false;
  const [row] = await getDb()
    .insert(pushSubscriptions)
    .values({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      magnitudMinima: input.magnitudMinima,
      centroLat: centro?.lat ?? null,
      centroLon: centro?.lon ?? null,
      radioKm,
      alcanceMundial,
      userId: input.userId ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        magnitudMinima: input.magnitudMinima,
        centroLat: centro?.lat ?? null,
        centroLon: centro?.lon ?? null,
        radioKm,
        alcanceMundial,
        userId: input.userId ?? null,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertPushSubscription: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toPushSubscription(row);
}

export async function getPushSubscriptionByEndpoint(
  endpoint: string,
): Promise<PushSubscription | null> {
  const [row] = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  return row ? toPushSubscription(row) : null;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function findSubscripcionesParaSismo(evento: {
  magnitud: number;
  latitud: number;
  longitud: number;
  profundidadKm: number | null;
  fuente: SismoFuente;
}): Promise<PushSubscription[]> {
  if (evento.fuente !== "csn") {
    if (evento.magnitud < UMBRAL_MAGNITUD_MUNDIAL) return [];
    const rows = await getDb()
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.alcanceMundial, true));
    return rows.map(toPushSubscription);
  }

  // CSN: se leen todas las filas (tabla chica) porque la regla de rescate por
  // radio de percepción no se puede expresar solo con magnitudMinima en SQL.
  const rows = await getDb().select().from(pushSubscriptions);
  return seleccionarDestinatarios(rows.map(toPushSubscription), evento);
}
