import mongoose from "mongoose";

let cached: Promise<typeof mongoose> | null = null;

// TODO: agregar manejo de reintentos/estado de conexión una vez que
// se implemente la lógica real de lectura/escritura.
export function getMongooseConnection(): Promise<typeof mongoose> {
  if (!cached) {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error("MONGODB_URI is not set");
    }
    cached = mongoose.connect(uri);
  }
  return cached;
}
