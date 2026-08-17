import { eq } from "drizzle-orm";
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

function rolParaEmail(email: string): "user" | "admin" {
  return email === process.env.ADMIN_EMAIL ? "admin" : "user";
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const [row] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email));
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
      email: input.email,
      passwordHash: input.passwordHash,
      name: input.name ?? null,
      role: rolParaEmail(input.email),
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
  const existente = await findUserByEmail(input.email);
  const now = new Date();

  if (!existente) {
    const [row] = await getDb()
      .insert(users)
      .values({
        email: input.email,
        name: input.name ?? null,
        image: input.image ?? null,
        role: rolParaEmail(input.email),
        updatedAt: now,
      })
      .returning();
    if (!row) {
      throw new Error(
        "upsertUsuarioGoogle: insert returned no row unexpectedly",
      );
    }
    return toUser(row);
  }

  const [row] = await getDb()
    .update(users)
    .set({
      name: input.name ?? existente.name,
      image: input.image ?? existente.image,
      role: rolParaEmail(input.email),
      updatedAt: now,
    })
    .where(eq(users.email, input.email))
    .returning();
  if (!row) {
    throw new Error(
      "upsertUsuarioGoogle: update returned no row unexpectedly",
    );
  }
  return toUser(row);
}
