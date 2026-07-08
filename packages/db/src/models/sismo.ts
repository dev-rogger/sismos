import mongoose, {
  Schema,
  model,
  type InferSchemaType,
  type Model,
} from "mongoose";

const sismoSchema = new Schema(
  {
    fuente: { type: String, enum: ["csn", "usgs"], required: true },
    externalId: { type: String, required: true },
    fecha: { type: Date, required: true },
    magnitud: { type: Number, required: true },
    profundidadKm: { type: Number, required: true },
    latitud: { type: Number, required: true },
    longitud: { type: Number, required: true },
    lugar: { type: String, required: true },
    bandera: { type: String, default: null },
    refCruzada: {
      fuente: { type: String, enum: ["csn", "usgs"] },
      externalId: String,
    },
  },
  { timestamps: true },
);

sismoSchema.index({ fuente: 1, externalId: 1 }, { unique: true });

export type Sismo = InferSchemaType<typeof sismoSchema>;

export const SismoModel: Model<Sismo> =
  (mongoose.models.Sismo as Model<Sismo>) ??
  model<Sismo>("Sismo", sismoSchema, "sismos");
