import { Schema, model, models, type InferSchemaType } from "mongoose";

// TODO: definir el schema real, incluyendo soporte para ajuste manual
// de coordenadas en eventos antiguos mal geolocalizados (ej. Valdivia 1960).
const sismoHistoricoSchema = new Schema({}, { strict: false, timestamps: true });

export type SismoHistorico = InferSchemaType<typeof sismoHistoricoSchema>;

export const SismoHistoricoModel =
  models.SismoHistorico ??
  model("SismoHistorico", sismoHistoricoSchema, "sismos_historicos");
