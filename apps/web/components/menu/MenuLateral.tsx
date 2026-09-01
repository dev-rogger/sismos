"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useSession, signOut } from "next-auth/react";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";
import { useContextoOverlays } from "../../lib/navegacion-overlays";
import { marcarLogout } from "../../lib/auth-toast-marker";
import { useCompartir } from "../../lib/use-compartir";
import { cambiarIdioma } from "../../lib/actions/cambiar-idioma";
import IconoCompartir from "../IconoCompartir";
import IconoChevron from "../IconoChevron";
import IconoCheck from "../IconoCheck";

interface MenuLateralProps {
  onAbrirHistorial: () => void;
  onAbrirFallas: () => void;
  onAbrirNotificaciones: () => void;
  onAbrirEstadisticas: () => void;
  onAbrirUsuarios: () => void;
  onAbrirReportes: () => void;
  puedeInstalarApp: boolean;
  onAbrirInstalarApp: () => void;
  onAbiertoChange?: (abierto: boolean) => void;
}

function IconoEstadisticas() {
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
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-6" />
    </svg>
  );
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

function IconoIdioma() {
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
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
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

export default function MenuLateral({
  onAbrirHistorial,
  onAbrirFallas,
  onAbrirNotificaciones,
  onAbrirEstadisticas,
  onAbrirUsuarios,
  onAbrirReportes,
  puedeInstalarApp,
  onAbrirInstalarApp,
  onAbiertoChange,
}: MenuLateralProps) {
  const t = useTranslations("menu");
  const tCompartir = useTranslations("compartir");
  const locale = useLocale();
  const [, iniciarCambioIdioma] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const { compartir, enlaceCopiado } = useCompartir();
  const [adminAbierto, setAdminAbierto] = useState(false);
  const [idiomaAbierto, setIdiomaAbierto] = useState(false);
  const [cuentaAbierta, setCuentaAbierta] = useState(false);
  const cuentaMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: session } = useSession();
  const contextoOverlays = useContextoOverlays();
  // NODE_ENV solo es "production" en builds/deploys reales; en `next dev`
  // local queda "development", así que esto no aplica en prod — solo evita
  // necesitar sesión de admin para trabajar en el panel localmente.
  const esDevLocal = process.env.NODE_ENV !== "production";

  useOverlayAccesible(abierto, () => setAbierto(false));
  useOverlayAccesible(
    cuentaAbierta,
    () => setCuentaAbierta(false),
    cuentaMenuRef,
  );

  useEffect(() => {
    onAbiertoChange?.(abierto);
  }, [abierto, onAbiertoChange]);

  // La acción corre en el MISMO commit que cierra el menú, a propósito: con
  // un `setTimeout(accion, 0)` de por medio, cerrar y abrir caían en dos
  // commits separados de React, y en el hueco el cleanup del menú veía la
  // pila de overlays vacía y disparaba un `history.back()`. Ese popstate
  // llegaba tarde, cuando la pantalla nueva ya había montado, y la cerraba
  // sola — se veía como "toco Estadísticas y vuelve al mapa". Intermitente
  // porque dependía de quién ganara entre el frame del navegador y el flush
  // de efectos de React (reproducido 4 de 6 veces con el CPU frenado).
  const elegir = (accion: () => void) => {
    setAbierto(false);
    accion();
  };

  // Como elegir(), pero para ítems que navegan de verdad con el router en vez
  // de abrir otro overlay: avisa al proveedor que no deshaga su pushState
  // sintético con history.back(), porque eso compite con el router.push y
  // Next aborta esa navegación (ver lib/navegacion-overlays.tsx).
  const navegarA = (ruta: string) => {
    contextoOverlays?.marcarNavegacionSaliente();
    setAbierto(false);
    router.push(ruta);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={t("abrirMenu")}
        style={{ top: "calc(0.75rem + env(safe-area-inset-top))" }}
        className="fixed left-3 z-10 flex min-h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/90 text-neutral-100 shadow-lg transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800"
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
        aria-label={t("titulo")}
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
        // `inset-y-0` en vez de un alto medido con JS: ese hook sumaba
        // `env(safe-area-inset-bottom)` a un alto que con `viewport-fit=cover`
        // ya lo incluía, dejando el drawer ~34px más alto que la pantalla
        // (mismo bug que PantallaPrincipal). El padding-bottom de arriba sí
        // corresponde: separa el contenido del home indicator, dentro de una
        // caja que ahora sí mide lo que mide la pantalla.
        className={`fixed inset-y-0 left-0 z-50 flex w-72 max-w-[80vw] flex-col border-r border-neutral-800 bg-neutral-900 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          abierto ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h2 className="text-base font-semibold text-neutral-100">
            {t("titulo")}
          </h2>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label={t("cerrarMenu")}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3 pt-2">
          <button
            type="button"
            onClick={() => elegir(onAbrirHistorial)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95 lg:hidden"
          >
            <IconoHistorial />
            {t("sismos")}
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirFallas)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
          >
            <IconoFallas />
            {t("fallas")}
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirNotificaciones)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
          >
            <IconoNotificaciones />
            {t("notificaciones")}
          </button>
          <button
            type="button"
            onClick={() => elegir(onAbrirEstadisticas)}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
          >
            <IconoEstadisticas />
            {t("estadisticas")}
          </button>
          <button
            type="button"
            onClick={compartir}
            className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
          >
            <IconoCompartir />
            {enlaceCopiado ? tCompartir("enlaceCopiado") : tCompartir("boton")}
          </button>
          {(esDevLocal || session?.user?.role === "admin") && (
            <div>
              <button
                type="button"
                onClick={() => setAdminAbierto((v) => !v)}
                aria-expanded={adminAbierto}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
              >
                <IconoAdmin />
                {t("admin")}
                <IconoChevron
                  className={`ml-auto h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-150 ${
                    adminAbierto ? "rotate-180" : ""
                  }`}
                />
              </button>
              {adminAbierto && (
                <div className="flex flex-col gap-1 pl-9">
                  <button
                    type="button"
                    onClick={() => elegir(onAbrirUsuarios)}
                    className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-medium text-neutral-400 touch-manipulation transition duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
                  >
                    {t("usuarios")}
                  </button>
                  <button
                    type="button"
                    onClick={() => elegir(onAbrirReportes)}
                    className="flex min-h-11 items-center rounded-lg px-3 text-left text-sm font-medium text-neutral-400 touch-manipulation transition duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
                  >
                    {t("reportes")}
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>

        <div className="mt-auto border-t border-neutral-800 px-3 py-2">
          {puedeInstalarApp && (
            <button
              type="button"
              onClick={() => elegir(onAbrirInstalarApp)}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
            >
              <IconoInstalar />
              {t("instalarApp")}
            </button>
          )}
          <div>
            <button
              type="button"
              onClick={() => setIdiomaAbierto((v) => !v)}
              aria-expanded={idiomaAbierto}
              aria-label={t("idioma")}
              className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
            >
              <IconoIdioma />
              <span className="min-w-0 flex-1 truncate">{t("idioma")}</span>
              <IconoChevron
                className={`ml-auto h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-150 ${
                  idiomaAbierto ? "rotate-180" : ""
                }`}
              />
            </button>
            {idiomaAbierto && (
              <div className="flex flex-col gap-1 pl-9">
                <button
                  type="button"
                  onClick={() => {
                    if (locale === "es") {
                      setIdiomaAbierto(false);
                      return;
                    }
                    elegir(() =>
                      iniciarCambioIdioma(async () => {
                        await cambiarIdioma("es");
                        router.refresh();
                      }),
                    );
                  }}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-400 touch-manipulation transition duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
                >
                  <span className="min-w-0 flex-1 truncate">Español</span>
                  {locale === "es" && (
                    <IconoCheck className="h-4 w-4 shrink-0 text-sky-400" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (locale === "en") {
                      setIdiomaAbierto(false);
                      return;
                    }
                    elegir(() =>
                      iniciarCambioIdioma(async () => {
                        await cambiarIdioma("en");
                        router.refresh();
                      }),
                    );
                  }}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-400 touch-manipulation transition duration-150 hover:bg-neutral-800 hover:text-neutral-200 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
                >
                  <span className="min-w-0 flex-1 truncate">English</span>
                  {locale === "en" && (
                    <IconoCheck className="h-4 w-4 shrink-0 text-sky-400" />
                  )}
                </button>
              </div>
            )}
          </div>
          {session ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setCuentaAbierta((v) => !v)}
                aria-expanded={cuentaAbierta}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
              >
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={20}
                    height={20}
                    unoptimized
                    className="h-5 w-5 shrink-0 rounded-full"
                  />
                ) : (
                  <IconoUsuario />
                )}
                <span className="min-w-0 flex-1 truncate">
                  {session.user?.name ?? session.user?.email}
                </span>
                <IconoChevron
                  className={`ml-auto h-4 w-4 shrink-0 text-neutral-500 transition-transform duration-150 ${
                    cuentaAbierta ? "rotate-180" : ""
                  }`}
                />
              </button>
              {cuentaAbierta && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setCuentaAbierta(false)}
                  />
                  <div
                    ref={cuentaMenuRef}
                    className="absolute bottom-full left-0 z-20 mb-2 w-full min-w-56 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-xl"
                  >
                    <p className="truncate border-b border-neutral-700 px-3 py-2 text-xs text-neutral-500">
                      {session.user?.email}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        elegir(() => {
                          marcarLogout();
                          signOut({ callbackUrl: "/" });
                        })
                      }
                      className="flex min-h-11 w-full touch-manipulation items-center px-3 text-left text-sm font-medium text-neutral-200 transition duration-150 hover:bg-neutral-700 active:scale-[0.97] active:bg-neutral-700 active:brightness-95"
                    >
                      {t("cerrarSesion")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => navegarA("/login")}
              className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-neutral-200 touch-manipulation transition duration-150 hover:bg-neutral-800 active:scale-[0.97] active:bg-neutral-800 active:brightness-95"
            >
              <IconoUsuario />
              {t("iniciarSesion")}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
