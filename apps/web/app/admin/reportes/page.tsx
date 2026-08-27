import { redirect } from "next/navigation";

// Ruta vieja, conservada solo como fallback para links directos/bookmarks —
// ver el comentario equivalente en app/admin/usuarios/page.tsx.
export default function AdminReportesPage() {
  redirect("/?admin=reportes");
}
