import Link from "next/link";
import { listUsers, type User } from "@sismos/db";
import { getTranslations, getLocale } from "next-intl/server";

// Ícono decorativo del estado vacío — mismo lenguaje visual (stroke 2,
// viewBox 24) que IconoUsuario en MenuLateral, solo que a mayor tamaño y
// vive acá porque ningún otro componente lo necesita.
function IconoUsuariosVacio() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      <path d="M16 4.5c1.7.4 3 2 3 3.9 0 1.9-1.3 3.5-3 3.9" />
      <path d="M19 13.5c2 .6 3.5 2.7 3.5 5" />
    </svg>
  );
}

function inicialDe(usuario: Pick<User, "name" | "email">): string {
  const fuente = usuario.name?.trim() || usuario.email;
  return fuente.charAt(0).toUpperCase();
}

export default async function AdminUsuariosPage() {
  const usuarios = await listUsers();
  const t = await getTranslations("admin");
  const tc = await getTranslations("comun");
  const locale = await getLocale();
  const localeFecha = locale === "en" ? "en-US" : "es-CL";

  return (
    <main className="pantalla-entrada min-h-screen bg-neutral-950 p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex items-center gap-2">
          <Link
            href="/"
            aria-label={tc("volver")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-100"
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
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-neutral-100">
              {t("usuariosRegistrados")}
            </h1>
            {usuarios.length > 0 && (
              <p className="text-xs text-neutral-500">
                {t("totalUsuarios", { count: usuarios.length })}
              </p>
            )}
          </div>
        </div>

        {usuarios.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-800 px-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-500">
              <IconoUsuariosVacio />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-300">
                {t("sinUsuarios")}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {t("sinUsuariosDescripcion")}
              </p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {usuarios.map((usuario) => (
              <li key={usuario.id}>
                <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
                  <div
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold text-neutral-300"
                  >
                    {inicialDe(usuario)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      {usuario.name ?? usuario.email}
                    </p>
                    {usuario.name && (
                      <p className="truncate text-xs text-neutral-500">
                        {usuario.email}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-neutral-500">
                      {t("registrado")}:{" "}
                      {usuario.createdAt.toLocaleDateString(localeFecha)}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${
                      usuario.role === "admin"
                        ? "border-orange-500/30 bg-orange-500/10 text-orange-400"
                        : "border-neutral-700 bg-neutral-800 text-neutral-400"
                    }`}
                  >
                    {usuario.role === "admin"
                      ? t("rolAdmin")
                      : t("rolUsuario")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
