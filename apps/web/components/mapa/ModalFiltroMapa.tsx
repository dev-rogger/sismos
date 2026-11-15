"use client";

import IconoCerrar from "../IconoCerrar";
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
      className="hoja-fondo"
      data-abierto={abierto}
    >
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("titulo")}
        onClick={(e) => e.stopPropagation()}
        className="hoja"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="titulo-pantalla">
            {t("titulo")}
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label={tc("cerrar")}
            className="btn-icono"
          >
            <IconoCerrar />
          </button>
        </div>

        <button
          type="button"
          onClick={() =>
            onFiltroChange({ ...filtro, soloChile: !filtro.soloChile })
          }
          aria-pressed={filtro.soloChile}
          className="chip w-full"
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
              className="campo appearance-none pr-8"
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
