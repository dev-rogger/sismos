import { desc } from "drizzle-orm";
import { getDb } from "../connection";
import { sismosHistoricos } from "../schema";

export interface SismoHistorico {
  id: number;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SismoHistoricoInput {
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera?: string | null;
}

function toSismoHistorico(
  row: typeof sismosHistoricos.$inferSelect,
): SismoHistorico {
  return {
    id: row.id,
    externalId: row.externalId,
    fecha: row.fecha,
    magnitud: row.magnitud,
    profundidadKm: row.profundidadKm,
    latitud: row.latitud,
    longitud: row.longitud,
    lugar: row.lugar,
    bandera: row.bandera,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function upsertSismoHistorico(
  evento: SismoHistoricoInput,
): Promise<SismoHistorico> {
  const now = new Date();
  const [row] = await getDb()
    .insert(sismosHistoricos)
    .values({
      externalId: evento.externalId,
      fecha: evento.fecha,
      magnitud: evento.magnitud,
      profundidadKm: evento.profundidadKm,
      latitud: evento.latitud,
      longitud: evento.longitud,
      lugar: evento.lugar,
      bandera: evento.bandera ?? null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: sismosHistoricos.externalId,
      set: {
        fecha: evento.fecha,
        magnitud: evento.magnitud,
        profundidadKm: evento.profundidadKm,
        latitud: evento.latitud,
        longitud: evento.longitud,
        lugar: evento.lugar,
        bandera: evento.bandera ?? null,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertSismoHistorico: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toSismoHistorico(row);
}

export async function findTopHistoricos(): Promise<SismoHistorico[]> {
  const rows = await getDb()
    .select()
    .from(sismosHistoricos)
    .orderBy(desc(sismosHistoricos.magnitud));
  return rows.map(toSismoHistorico);
}
