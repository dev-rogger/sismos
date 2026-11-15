/* global process, console, URL */
// Aplica las migraciones pendientes de packages/db/drizzle con la DATABASE_URL
// del entorno. Se ejecuta en el build del ingestor (apps/ingestor/vercel.ts)
// para que el schema de la base viva siempre esté al día ANTES de que el
// código nuevo empiece a servir. Es idempotente: Drizzle registra lo aplicado
// en drizzle.__drizzle_migrations y no repite nada.
//
// Si falla (migración rota, base inalcanzable), el build falla y Vercel sigue
// sirviendo el deploy anterior: es un fallo seguro.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("[migrate] DATABASE_URL no está definida");
  process.exit(1);
}

// Misma regla que src/connection.ts: pg trata sslmode=require como
// verify-full y rechaza la cadena de certificados de Neon.
const connectionString = raw.replace("sslmode=require", "sslmode=no-verify");
const pool = new Pool({ connectionString, max: 1 });

try {
  await migrate(drizzle(pool), {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("[migrate] migraciones al día");
} catch (error) {
  console.error("[migrate] falló:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
