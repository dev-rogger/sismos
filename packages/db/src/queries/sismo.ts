import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { SismoModel, type Sismo } from "../models/sismo";

export async function findRecentByFuente(
  fuente: SismoFuente,
  since: Date,
): Promise<Sismo[]> {
  return SismoModel.find({ fuente, fecha: { $gte: since } }).lean();
}

export async function upsertSismo(evento: SismoNormalizado): Promise<Sismo> {
  const result = await SismoModel.findOneAndUpdate(
    { fuente: evento.fuente, externalId: evento.externalId },
    { $set: evento },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!result) {
    throw new Error("upsertSismo: findOneAndUpdate returned null unexpectedly");
  }
  return result;
}

export async function setRefCruzada(
  fuente: SismoFuente,
  externalId: string,
  refCruzada: { fuente: SismoFuente; externalId: string },
): Promise<Sismo | null> {
  return SismoModel.findOneAndUpdate(
    { fuente, externalId },
    { $set: { refCruzada } },
    { returnDocument: "after" },
  ).lean();
}

export async function replaceWithCsn(
  usgsExternalId: string,
  csnEvento: SismoNormalizado,
): Promise<Sismo | null> {
  return SismoModel.findOneAndUpdate(
    { fuente: "usgs", externalId: usgsExternalId },
    {
      $set: {
        ...csnEvento,
        refCruzada: { fuente: "usgs", externalId: usgsExternalId },
      },
    },
    { returnDocument: "after" },
  ).lean();
}

export async function findUltimos10Dias(): Promise<Sismo[]> {
  const since = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
  return SismoModel.find({ fecha: { $gte: since } })
    .sort({ fecha: -1 })
    .lean();
}

export async function findSismosSince(since: Date): Promise<Sismo[]> {
  return SismoModel.find({ fecha: { $gt: since } })
    .sort({ fecha: 1 })
    .lean();
}

export async function findTop10UltimosAnios(anios: number): Promise<Sismo[]> {
  const since = new Date();
  since.setFullYear(since.getFullYear() - anios);
  return SismoModel.find({ fecha: { $gte: since } })
    .sort({ magnitud: -1 })
    .limit(10)
    .lean();
}
