import { and, desc, eq, gt, gte, asc } from "drizzle-orm";
import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { getDb } from "../connection";
import { sismos } from "../schema";

export interface Sismo {
  id: number;
  fuente: SismoFuente;
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
  bandera: string | null;
  refCruzada: { fuente: SismoFuente; externalId: string } | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSismo(row: typeof sismos.$inferSelect): Sismo {
  return {
    id: row.id,
    fuente: row.fuente as SismoFuente,
    externalId: row.externalId,
    fecha: row.fecha,
    magnitud: row.magnitud,
    profundidadKm: row.profundidadKm,
    latitud: row.latitud,
    longitud: row.longitud,
    lugar: row.lugar,
    bandera: row.bandera,
    refCruzada:
      row.refCruzadaFuente && row.refCruzadaExternalId
        ? {
            fuente: row.refCruzadaFuente as SismoFuente,
            externalId: row.refCruzadaExternalId,
          }
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findRecentByFuente(
  fuente: SismoFuente,
  since: Date,
): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(and(eq(sismos.fuente, fuente), gte(sismos.fecha, since)));
  return rows.map(toSismo);
}

export async function upsertSismo(evento: SismoNormalizado): Promise<Sismo> {
  const now = new Date();
  const [row] = await getDb()
    .insert(sismos)
    .values({
      fuente: evento.fuente,
      externalId: evento.externalId,
      fecha: evento.fecha,
      magnitud: evento.magnitud,
      profundidadKm: evento.profundidadKm,
      latitud: evento.latitud,
      longitud: evento.longitud,
      lugar: evento.lugar,
      bandera: evento.bandera,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [sismos.fuente, sismos.externalId],
      set: {
        fecha: evento.fecha,
        magnitud: evento.magnitud,
        profundidadKm: evento.profundidadKm,
        latitud: evento.latitud,
        longitud: evento.longitud,
        lugar: evento.lugar,
        bandera: evento.bandera,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertSismo: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toSismo(row);
}

export async function setRefCruzada(
  fuente: SismoFuente,
  externalId: string,
  refCruzada: { fuente: SismoFuente; externalId: string },
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      refCruzadaFuente: refCruzada.fuente,
      refCruzadaExternalId: refCruzada.externalId,
      updatedAt: new Date(),
    })
    .where(and(eq(sismos.fuente, fuente), eq(sismos.externalId, externalId)))
    .returning();
  return row ? toSismo(row) : null;
}

export async function replaceWithCsn(
  usgsExternalId: string,
  csnEvento: SismoNormalizado,
): Promise<Sismo | null> {
  const [row] = await getDb()
    .update(sismos)
    .set({
      fuente: csnEvento.fuente,
      externalId: csnEvento.externalId,
      fecha: csnEvento.fecha,
      magnitud: csnEvento.magnitud,
      profundidadKm: csnEvento.profundidadKm,
      latitud: csnEvento.latitud,
      longitud: csnEvento.longitud,
      lugar: csnEvento.lugar,
      bandera: csnEvento.bandera,
      refCruzadaFuente: "usgs",
      refCruzadaExternalId: usgsExternalId,
      updatedAt: new Date(),
    })
    .where(
      and(eq(sismos.fuente, "usgs"), eq(sismos.externalId, usgsExternalId)),
    )
    .returning();
  return row ? toSismo(row) : null;
}

export async function findUltimos10Dias(): Promise<Sismo[]> {
  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gte(sismos.fecha, since))
    .orderBy(desc(sismos.fecha));
  return rows.map(toSismo);
}

export async function findSismosSince(since: Date): Promise<Sismo[]> {
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gt(sismos.fecha, since))
    .orderBy(asc(sismos.fecha));
  return rows.map(toSismo);
}

export async function findTop10UltimosAnios(anios: number): Promise<Sismo[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - anios);
  const rows = await getDb()
    .select()
    .from(sismos)
    .where(gte(sismos.fecha, since))
    .orderBy(desc(sismos.magnitud))
    .limit(10);
  return rows.map(toSismo);
}
