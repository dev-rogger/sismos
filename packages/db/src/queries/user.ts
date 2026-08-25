import { desc, eq } from "drizzle-orm";
import { getDb } from "../connection";
import { users } from "../schema";

export interface User {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  passwordHash: string | null;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
}

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    passwordHash: row.passwordHash,
    role: row.role as "user" | "admin",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

function esEmailAdmin(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return normalizarEmail(email) === normalizarEmail(adminEmail);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, normalizarEmail(email)));
  return row ? toUser(row) : null;
}

export async function createUserConPassword(input: {
  email: string;
  passwordHash: string;
  name?: string | null;
}): Promise<User> {
  const [row] = await getDb()
    .insert(users)
    .values({
      email: normalizarEmail(input.email),
      passwordHash: input.passwordHash,
      name: input.name ?? null,
      role: "user",
    })
    .returning();
  if (!row) {
    throw new Error(
      "createUserConPassword: insert returned no row unexpectedly",
    );
  }
  return toUser(row);
}

export async function upsertUsuarioGoogle(input: {
  email: string;
  name?: string | null;
  image?: string | null;
}): Promise<User> {
  const email = normalizarEmail(input.email);
  const now = new Date();
  const role = esEmailAdmin(email) ? "admin" : "user";

  const [row] = await getDb()
    .insert(users)
    .values({
      email,
      name: input.name ?? null,
      image: input.image ?? null,
      role,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.email,
      // El rol NO se pisa acá — solo se define al crear el usuario la
      // primera vez (arriba, en `values`). Si se recalculara en cada
      // login, un admin promovido manualmente en la base (o cuyo email
      // ya no matchea ADMIN_EMAIL por el motivo que sea) perdería el rol
      // en su siguiente inicio de sesión con Google.
      set: {
        name: input.name ?? undefined,
        image: input.image ?? undefined,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    throw new Error(
      "upsertUsuarioGoogle: insert...onConflictDoUpdate returned no row unexpectedly",
    );
  }
  return toUser(row);
}

export async function listUsers(): Promise<User[]> {
  const rows = await getDb()
    .select()
    .from(users)
    .orderBy(desc(users.createdAt));
  return rows.map(toUser);
}
