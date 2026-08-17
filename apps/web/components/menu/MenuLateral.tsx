"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface MenuLateralProps {
  onAbrirHistorial: () => void;
  onAbrirFallas: () => void;
  onAbrirNotificaciones: () => void;
  puedeInstalarApp: boolean;
  onAbrirInstalarApp: () => void;
  onAbiertoChange?: (abierto: boolean) => void;
}

function IconoHistorial() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function IconoFallas() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M3 12l4-7 4 9 4-9 4 9 2-4" />
    </svg>
  );
}

function IconoNotificaciones() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 12.5 6 8Z" />
      <path d="M10.5 19a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function IconoInstalar() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 19h16" />
    </svg>
  );
}

function IconoCompartir() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98" />
      <path d="M15.41 6.51l-6.82 3.98" />
    </svg>
  );
}

function IconoUsuario() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}

function IconoAdmin() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3Z" />
    </svg>
  );
}

const MENSAJE_COMPARTIR =
  "🌎📍 Sismos de Chile y el mundo en tiempo real. Míralo acá:";

export default function MenuLateral({
  onAbrirHistorial,
  onAbrirFallas,
  onAbrirNotificaciones,
  puedeInstalarApp,
  onAbrirInstalarApp,
  onAbiertoChange,
}: MenuLateralProps) {
  const [abierto, setAbierto] = useState(false);
  const [enlaceCopiado, setEnlaceCopiado] = useState(false);
  const [adminAbierto, setAdminAbierto] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  useOverlayAccesible(abierto, () => setAbierto(false));

  useEffect(() => {
    onAbiertoChange?.(abierto);
  }, [abierto, onAbiertoChange]);

  const elegir = (accion: () => void) => {
    setAbierto(false);
    accion();
  };

  const compartir = async () => {
    const url = window.location.origin;

    if (navigator.share) {
      try {
        await navigator.share({ title: "Sismos", text: MENSAJE_COMPARTIR, url });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          console.error("[MenuLateral] compartir error:", error);
        }
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${MENSAJE_COMPARTIR} ${url}`);
      setEnlaceCopiado(true);
      setTimeout(() => setEnlaceCopiado(false), 2000);
    } catch (error) {
      console.error("[MenuLateral] clipboard error:", error);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Abrir menú"
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="fixed left-3 z-10 flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg transition-colors hover:bg-neutral-800"
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
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div
        aria-hidden={!abierto}
        onClick={() => setAbierto(false)}
        className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
          abierto
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menú"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-neutral-800 bg-neutral-900 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-neutral-100">Menú</h2>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar menú"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
          <button
            type="button"
            onClick={() => elegir(onAbrirHistorial)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoHistorial />
            Sismos
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirFallas)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoFallas />
            Fallas
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirNotificaciones)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoNotificaciones />
            Notificaciones
          </button>
          <button
            type="button"
            onClick={compartir}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
          >
            <IconoCompartir />
            {enlaceCopiado ? "Enlace copiado" : "Compartir"}
          </button>
          {session ? (
            <button
              type="button"
              onClick={() => elegir(() => signOut({ callbackUrl: "/" }))}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoUsuario />
              Cerrar sesión ({session.user?.name ?? session.user?.email})
            </button>
          ) : (
            <button
              type="button"
              onClick={() => elegir(() => router.push("/login"))}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoUsuario />
              Iniciar sesión
            </button>
          )}
          {session?.user?.role === "admin" && (
            <div>
              <button
                type="button"
                onClick={() => setAdminAbierto((v) => !v)}
                aria-expanded={adminAbierto}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
              >
                <IconoAdmin />
                Admin
                <span
                  className={`ml-auto text-neutral-500 transition-transform duration-150 ${
                    adminAbierto ? "rotate-180" : ""
                  }`}
                >
                  ▾
                </span>
              </button>
              {adminAbierto && (
                <div className="flex flex-col gap-1 pl-9">
                  <button
                    type="button"
                    onClick={() => elegir(() => router.push("/admin/usuarios"))}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-neutral-400 transition-colors duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:bg-neutral-800"
                  >
                    Usuarios
                  </button>
                  <button
                    type="button"
                    onClick={() => elegir(() => router.push("/admin/reportes"))}
                    className="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-neutral-400 transition-colors duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:bg-neutral-800"
                  >
                    Reportes
                  </button>
                </div>
              )}
            </div>
          )}
          {puedeInstalarApp && (
            <button
              type="button"
              onClick={() => elegir(onAbrirInstalarApp)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-neutral-200 transition-colors duration-150 hover:bg-neutral-800 active:bg-neutral-800"
            >
              <IconoInstalar />
              Instalar app
            </button>
          )}
        </nav>
      </div>
    </>
  );
}
