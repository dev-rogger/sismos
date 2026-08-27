import { NextResponse } from "next/server";
import { listUsers } from "@sismos/db";
import { requireAdminApi } from "../../../../lib/require-admin-api";

export async function GET() {
  const denegado = await requireAdminApi();
  if (denegado) return denegado;

  try {
    const usuarios = await listUsers();
    // Mapeamos a mano (no spread) para no filtrar passwordHash por accidente:
    // listUsers() devuelve el registro completo, pensado para uso interno.
    return NextResponse.json({
      usuarios: usuarios.map((usuario) => ({
        id: usuario.id,
        name: usuario.name,
        email: usuario.email,
        role: usuario.role,
        createdAt: usuario.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[api/admin/usuarios] GET failed:", error);
    return NextResponse.json(
      { error: "Database connection failed" },
      { status: 500 },
    );
  }
}
