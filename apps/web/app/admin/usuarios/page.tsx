import Link from "next/link";
import { listUsers } from "@sismos/db";

export default async function AdminUsuariosPage() {
  const usuarios = await listUsers();

  return (
    <main className="pantalla-entrada min-h-screen bg-neutral-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/"
            aria-label="Volver"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-neutral-100">
            Usuarios registrados
          </h1>
        </div>

        {usuarios.length === 0 ? (
          <p className="text-sm text-neutral-500">Sin usuarios registrados</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900 text-neutral-400">
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Registrado</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="border-b border-neutral-800 bg-neutral-950 last:border-b-0"
                  >
                    <td className="px-3 py-2 text-neutral-100">
                      {usuario.email}
                    </td>
                    <td className="px-3 py-2 text-neutral-300">
                      {usuario.name ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-neutral-300">
                      {usuario.role}
                    </td>
                    <td className="px-3 py-2 text-neutral-400">
                      {usuario.createdAt.toLocaleDateString("es-CL")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
