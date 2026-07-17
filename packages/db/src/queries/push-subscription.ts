import { eq, lte } from "drizzle-orm";
import { getDb } from "../connection";
import { pushSubscriptions } from "../schema";

export interface PushSubscription {
  id: number;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SuscripcionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  magnitudMinima: number;
}

function toPushSubscription(
  row: typeof pushSubscriptions.$inferSelect,
): PushSubscription {
  return {
    id: row.id,
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    magnitudMinima: row.magnitudMinima,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertPushSubscription(
  input: SuscripcionInput,
): Promise<PushSubscription> {
  const now = new Date();
  const [row] = await getDb()
    .insert(pushSubscriptions)
    .values({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      magnitudMinima: input.magnitudMinima,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        magnitudMinima: input.magnitudMinima,
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

export async function deletePushSubscription(endpoint: string): Promise<void> {
  await getDb()
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
}

export async function findSubscripcionesParaMagnitud(
  magnitud: number,
): Promise<PushSubscription[]> {
  const rows = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(lte(pushSubscriptions.magnitudMinima, magnitud));
  return rows.map(toPushSubscription);
}
