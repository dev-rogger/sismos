import { redirect } from "next/navigation";

// Ruta vieja, conservada solo como fallback para links directos/bookmarks:
// el panel de usuarios ahora vive como overlay sobre el mapa persistente
// (ver components/admin/PantallaUsuarios.tsx), no como página propia — así
// evitamos que "atrás" navegue fuera de "/" y desmonte el mapa. AdminLayout
// (padre de esta ruta) sigue filtrando por rol antes de llegar acá; la
// protección real de los datos vive en /api/admin/usuarios.
export default function AdminUsuariosPage() {
  redirect("/?admin=usuarios");
}
