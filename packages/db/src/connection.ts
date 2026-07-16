import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

let cached: NodePgDatabase | null = null;

export function getDb(): NodePgDatabase {
  if (!cached) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    const pool = new Pool({ connectionString, max: 1 });
    cached = drizzle(pool);
  }
  return cached;
}
