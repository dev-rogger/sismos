import { getDb } from "../connection";
import { ingestaEstado } from "../schema";

export type FuenteIngesta = "csn" | "usgs" | "gael" | "push";

export interface EstadoFuente {
  fuente: string;
  ultimoOk: Date | null;
  ultimoError: Date | null;
  ultimoErrorMsg: string | null;
}

const MAX_MSG = 500;

export async function registrarIngestaOk(fuente: FuenteIngesta): Promise<void> {
  const ahora = new Date();
  await getDb()
    .insert(ingestaEstado)
    .values({ fuente, ultimoOk: ahora })
    .onConflictDoUpdate({
      target: ingestaEstado.fuente,
      set: { ultimoOk: ahora },
    });
}

export async function registrarIngestaError(
  fuente: FuenteIngesta,
  msg: string,
): Promise<void> {
  const ahora = new Date();
  const recortado = msg.slice(0, MAX_MSG);
  await getDb()
    .insert(ingestaEstado)
    .values({ fuente, ultimoError: ahora, ultimoErrorMsg: recortado })
    .onConflictDoUpdate({
      target: ingestaEstado.fuente,
      set: { ultimoError: ahora, ultimoErrorMsg: recortado },
    });
}

export async function getEstadoIngesta(): Promise<EstadoFuente[]> {
  return getDb().select().from(ingestaEstado);
}
