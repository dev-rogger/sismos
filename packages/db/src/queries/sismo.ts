import type { SismoFuente, SismoNormalizado } from "@sismos/shared";
import { SismoModel, type Sismo } from "../models/sismo.js";

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
    { upsert: true, new: true },
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
    { new: true },
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
    { new: true },
  ).lean();
}
