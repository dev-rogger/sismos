"use client";

import { useTranslations } from "next-intl";

interface BotonFallasMapaProps {
  fallasVisibles: boolean;
  onFallasVisiblesChange: (visibles: boolean) => void;
}

export default function BotonFallasMapa({
  fallasVisibles,
  onFallasVisiblesChange,
}: BotonFallasMapaProps) {
  const t = useTranslations("filtro");

  return (
    <button
      type="button"
      onClick={() => onFallasVisiblesChange(!fallasVisibles)}
      aria-pressed={fallasVisibles}
      aria-label={fallasVisibles ? t("ocultarFallas") : t("mostrarFallas")}
      className={`flex min-h-11 touch-manipulation items-center gap-2 rounded-lg border px-3 text-xs font-medium shadow-lg transition active:scale-[0.97] active:brightness-95 ${
        fallasVisibles
          ? "border-sky-500 bg-sky-500/10 text-sky-400"
          : "border-neutral-700 bg-neutral-900/90 text-neutral-100 hover:bg-neutral-800"
      }`}
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
        <path d="M3 12l4-7 4 9 4-9 4 9 2-4" />
      </svg>
      {t("fallas")}
    </button>
  );
}
