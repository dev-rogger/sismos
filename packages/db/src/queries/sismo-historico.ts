import { desc, eq } from "drizzle-orm";
import { getDb } from "../connection";
import { sismosHistoricos } from "../schema";

export type AlcanceHistorico = "mundial" | "chile";

export interface SismoHistorico {
  id: number;
  externalId: string;
  alcance: AlcanceHistorico;
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
  alcance: AlcanceHistorico;
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
    alcance: row.alcance as AlcanceHistorico,
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
      alcance: evento.alcance,
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
      target: [sismosHistoricos.externalId, sismosHistoricos.alcance],
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

export async function findTopHistoricos(
  alcance: AlcanceHistorico = "mundial",
): Promise<SismoHistorico[]> {
  const rows = await getDb()
    .select()
    .from(sismosHistoricos)
    .where(eq(sismosHistoricos.alcance, alcance))
    .orderBy(desc(sismosHistoricos.magnitud))
    .limit(10);
  return rows.map(toSismoHistorico);
}
