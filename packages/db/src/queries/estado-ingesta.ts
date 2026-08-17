import { eq } from "drizzle-orm";
import { getDb } from "../connection";
import { estadoIngesta } from "../schema";

export async function getUltimaAlertaEnviada(
  fuente: string,
): Promise<Date | null> {
  const [row] = await getDb()
    .select()
    .from(estadoIngesta)
    .where(eq(estadoIngesta.fuente, fuente));
  return row?.ultimaAlertaEnviada ?? null;
}

export async function marcarAlertaEnviada(fuente: string): Promise<void> {
  await getDb()
    .insert(estadoIngesta)
    .values({ fuente, ultimaAlertaEnviada: new Date() })
    .onConflictDoUpdate({
      target: estadoIngesta.fuente,
      set: { ultimaAlertaEnviada: new Date() },
    });
}
