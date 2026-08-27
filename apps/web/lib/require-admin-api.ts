import { NextResponse } from "next/server";
import { auth } from "./auth";

// Único punto de verdad de la protección de /admin: a diferencia del viejo
// admin/layout.tsx, acá NO hay bypass de NODE_ENV para desarrollo local —
// estos endpoints devuelven datos reales, así que el chequeo de rol siempre
// corre, en dev y en prod. La conveniencia de dev (ver el ítem "Admin" en el
// menú sin sesión) queda solo en la UI del menú; pedir los datos igual exige
// una sesión de admin real.
export async function requireAdminApi(): Promise<NextResponse | null> {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  return null;
}
