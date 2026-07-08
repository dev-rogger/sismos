import {
  SismoHistoricoModel,
  type SismoHistorico,
} from "../models/sismo-historico";

export interface SismoHistoricoInput {
  externalId: string;
  fecha: Date;
  magnitud: number;
  profundidadKm: number;
  latitud: number;
  longitud: number;
  lugar: string;
}

export async function upsertSismoHistorico(
  evento: SismoHistoricoInput,
): Promise<SismoHistorico> {
  const result = await SismoHistoricoModel.findOneAndUpdate(
    { externalId: evento.externalId },
    { $set: evento },
    { upsert: true, new: true },
  ).lean();
  if (!result) {
    throw new Error(
      "upsertSismoHistorico: findOneAndUpdate returned null unexpectedly",
    );
  }
  return result;
}

export async function findTopHistoricos(): Promise<SismoHistorico[]> {
  return SismoHistoricoModel.find({}).sort({ magnitud: -1 }).lean();
}
