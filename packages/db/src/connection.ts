import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";

let cached: NodePgDatabase | null = null;

export function getDb(): NodePgDatabase {
  if (!cached) {
    const rawConnectionString = process.env.DATABASE_URL;
    if (!rawConnectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    // pg's own sslmode=require now behaves like verify-full and rejects
    // Neon/Supabase's certificate chain. no-verify keeps the connection
    // encrypted but skips chain validation. Passing a separate `ssl` option
    // alongside a connectionString is unreliable in node-postgres (the
    // string's own parsing can win), so rewrite the string instead.
    const connectionString = rawConnectionString.replace(
      "sslmode=require",
      "sslmode=no-verify",
    );
    const pool = new Pool({ connectionString, max: 1 });
    cached = drizzle(pool);
  }
  return cached;
}
