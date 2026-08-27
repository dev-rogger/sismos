import { NextResponse } from "next/server";
import { requireAdminApi } from "../../../../lib/require-admin-api";

// Todavía no hay datos de reportes (la pantalla muestra "Próximamente"), pero
// igual exponemos el mismo chequeo de admin que /api/admin/usuarios: el
// overlay del cliente pega acá antes de mostrar contenido, en vez de confiar
// en que el menú ya ocultó la opción para no-admins.
export async function GET() {
  const denegado = await requireAdminApi();
  if (denegado) return denegado;

  return NextResponse.json({ ok: true });
}
