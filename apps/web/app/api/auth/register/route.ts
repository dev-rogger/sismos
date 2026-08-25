import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { findUserByEmail, createUserConPassword } from "@sismos/db";

interface RegisterBody {
  email?: string;
  password?: string;
  name?: string;
}

export async function POST(request: Request) {
  const body = (await request.json()) as RegisterBody;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email_invalido" }, { status: 400 });
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { error: "password_corta" },
      { status: 400 },
    );
  }

  try {
    const existente = await findUserByEmail(email);
    if (existente) {
      return NextResponse.json(
        { error: "email_existente" },
        { status: 409 },
      );
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await createUserConPassword({
      email,
      passwordHash,
      name: body.name ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[api/auth/register] failed:", error);
    return NextResponse.json(
      { error: "error_servidor" },
      { status: 500 },
    );
  }
}
