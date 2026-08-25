"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import SelectorMagnitudRangos from "../filtro/SelectorMagnitudRangos";
import IconoChevron from "../IconoChevron";
import { VENTANAS_TIEMPO, type FiltroMapa } from "../../lib/filtro-tipos";
import { useOverlayAccesible } from "../../lib/use-overlay-accesible";

interface ModalFiltroMapaProps {
  abierto: boolean;
  onCerrar: () => void;
  filtro: FiltroMapa;
  onFiltroChange: (filtro: FiltroMapa) => void;
}

export default function ModalFiltroMapa({
  abierto,
  onCerrar,
  filtro,
  onFiltroChange,
}: ModalFiltroMapaProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  useOverlayAccesible(abierto, onCerrar, contenedorRef);
  const t = useTranslations("filtro");
  const tc = useTranslations("comun");

  return (
    <div
      aria-hidden={!abierto}
      onClick={onCerrar}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
        abierto
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
      }`}
    >
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("titulo")}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg transition-transform duration-200 ease-out motion-reduce:transition-none ${
          abierto ? "scale-100" : "scale-95"
        }`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            {t("titulo")}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={tc("cerrar")}
            className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-lg text-neutral-400 transition active:scale-[0.97] active:brightness-95 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            onFiltroChange({ ...filtro, soloChile: !filtro.soloChile })
          }
          aria-pressed={filtro.soloChile}
          className={`flex min-h-11 w-full touch-manipulation items-center justify-center rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] active:brightness-95 ${
            filtro.soloChile
              ? "border-sky-500 bg-sky-500/10 text-sky-400"
              : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          🇨🇱 {t("soloChile")}
        </button>

        <div className="mt-4">
          <p className="mb-2 text-xs text-neutral-400">{t("magnitud")}</p>
          <SelectorMagnitudRangos
            seleccionados={filtro.rangos}
            onChange={(rangos) => onFiltroChange({ ...filtro, rangos })}
          />
        </div>

        <div className="mt-4">
          <label
            htmlFor="ventana-tiempo"
            className="mb-2 block text-xs text-neutral-400"
          >
            {t("ocurridosEn")}
          </label>
          <div className="relative">
            <select
              id="ventana-tiempo"
              value={filtro.ventana}
              onChange={(e) =>
                onFiltroChange({
                  ...filtro,
                  ventana: e.target.value as FiltroMapa["ventana"],
                })
              }
              className="min-h-11 w-full appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 pr-8 text-sm text-neutral-100 transition-colors hover:border-neutral-600 focus:border-sky-500 focus:outline-none"
            >
              {VENTANAS_TIEMPO.map((v) => (
                <option key={v.valor} value={v.valor}>
                  {t(`ventana.${v.valor}`)}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-neutral-400">
              <IconoChevron className="h-4 w-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
