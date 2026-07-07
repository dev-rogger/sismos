import { Schema, model, models, type InferSchemaType } from "mongoose";

// TODO: definir el schema real (fuente, externalId, fecha, magnitud,
// profundidad, coordenadas, lugar, etc.) alineado con SismoNormalizado
// de @sismos/shared. Usado para el top 10 de los últimos 10 años y los
// últimos 10 días.
const sismoSchema = new Schema({}, { strict: false, timestamps: true });

export type Sismo = InferSchemaType<typeof sismoSchema>;

export const SismoModel =
  models.Sismo ?? model("Sismo", sismoSchema, "sismos");
