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
      className="btn-mapa"
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
