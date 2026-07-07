import {
  Schema,
  model,
  models,
  type InferSchemaType,
  type Model,
} from "mongoose";

const sismoHistoricoSchema = new Schema(
  {
    externalId: { type: String, required: true, unique: true },
    fecha: { type: Date, required: true },
    magnitud: { type: Number, required: true },
    profundidadKm: { type: Number, required: true },
    latitud: { type: Number, required: true },
    longitud: { type: Number, required: true },
    lugar: { type: String, required: true },
  },
  { timestamps: true },
);

export type SismoHistorico = InferSchemaType<typeof sismoHistoricoSchema>;

export const SismoHistoricoModel: Model<SismoHistorico> =
  (models.SismoHistorico as Model<SismoHistorico>) ??
  model<SismoHistorico>(
    "SismoHistorico",
    sismoHistoricoSchema,
    "sismos_historicos",
  );
