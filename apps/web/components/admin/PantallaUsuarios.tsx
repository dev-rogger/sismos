"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface PantallaUsuariosProps {
  abierto: boolean;
  onCerrar: () => void;
}

interface UsuarioApi {
  id: string;
  name: string | null;
  email: string;
  role: "user" | "admin";
  createdAt: string;
}

type EstadoError = "denegado" | "otro" | null;

// Mismo lenguaje visual (stroke 1.5, viewBox 24) que IconoUsuario en
// MenuLateral, solo que a mayor tamaño y vive acá porque ningún otro
// componente lo necesita.
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

function inicialDe(usuario: Pick<UsuarioApi, "name" | "email">): string {
  const fuente = usuario.name?.trim() || usuario.email;
  return fuente.charAt(0).toUpperCase();
}

export default function PantallaUsuarios({
  abierto,
  onCerrar,
}: PantallaUsuariosProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("comun");
  const locale = useLocale();
  const localeFecha = locale === "en" ? "en-US" : "es-CL";
  useOverlayAccesible(abierto, onCerrar);

  // Queda montada permanentemente (para animar su cierre), pero el fetch se
  // pospone hasta la primera apertura — mismo patrón que PantallaFallas.
  const [huboApertura, setHuboApertura] = useState(abierto);
  if (abierto && !huboApertura) setHuboApertura(true);

  const [usuarios, setUsuarios] = useState<UsuarioApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<EstadoError>(null);
  const [reintentos, setReintentos] = useState(0);

  useEffect(() => {
    if (!huboApertura) return;
    let cancelado = false;
    setLoading(true);
    setError(null);

    fetch("/api/admin/usuarios")
      .then((res) => {
        // El endpoint hace su propio chequeo de sesión/rol — nunca confiamos
        // en que el menú ya haya ocultado esta opción para no-admins.
        if (res.status === 401 || res.status === 403) {
          throw new Error("denegado");
        }
        if (!res.ok) throw new Error("otro");
        return res.json() as Promise<{ usuarios: UsuarioApi[] }>;
      })
      .then((data) => {
        if (cancelado) return;
        setUsuarios(data.usuarios);
        setLoading(false);
      })
      .catch((err) => {
        console.error("[PantallaUsuarios] fetch error:", err);
        if (cancelado) return;
        setError(err instanceof Error && err.message === "denegado" ? "denegado" : "otro");
        setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [huboApertura, reintentos]);

  return (
    <div
      aria-hidden={!abierto}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      className={`fixed inset-0 z-40 overflow-y-auto bg-neutral-950 transition-transform duration-200 ease-out motion-reduce:transition-none ${
        abierto ? "translate-x-0" : "pointer-events-none translate-x-full"
      }`}
    >
      <div className="mx-auto max-w-3xl p-4">
        <div className="mb-5 flex items-center gap-2">
          <button
            type="button"
            onClick={onCerrar}
            aria-label={tc("volver")}
            className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800 hover:text-neutral-100"
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
          </button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-neutral-100">
              {t("usuariosRegistrados")}
            </h1>
            {!loading && !error && usuarios.length > 0 && (
              <p className="text-xs text-neutral-500">
                {t("totalUsuarios", { count: usuarios.length })}
              </p>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-sm text-neutral-500">
            {t("cargando")}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutral-800 px-4 py-12 text-center">
            <p className="text-sm font-medium text-neutral-300">
              {error === "denegado" ? t("accesoDenegado") : t("errorCarga")}
            </p>
            {error !== "denegado" && (
              <button
                type="button"
                onClick={() => setReintentos((n) => n + 1)}
                className="min-h-11 touch-manipulation rounded-lg border border-neutral-700 bg-neutral-800 px-4 text-sm font-medium text-neutral-100 transition active:scale-[0.97] active:brightness-95 hover:border-neutral-600"
              >
                {t("reintentar")}
              </button>
            )}
          </div>
        ) : usuarios.length === 0 ? (
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
                      {new Date(usuario.createdAt).toLocaleDateString(
                        localeFecha,
                      )}
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
    </div>
  );
}
