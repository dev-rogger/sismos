"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ConteoPeriodo, GranularidadConteo } from "../../lib/use-estadisticas";

interface GraficoConteosProps {
  granularidad: GranularidadConteo;
  conteos: ConteoPeriodo[];
}

const ALTO = 160;
const ANCHO_BARRA = 18;
const GAP = 6;
const RADIO_TOPE = 4;

function formatearPeriodo(
  iso: string,
  granularidad: GranularidadConteo,
  locale: string,
): string {
  const fecha = new Date(iso);
  const localeFecha = locale === "en" ? "en-US" : "es-CL";
  if (granularidad === "dia" || granularidad === "semana") {
    return fecha.toLocaleDateString(localeFecha, { day: "numeric", month: "short" });
  }
  if (granularidad === "mes") {
    return fecha.toLocaleDateString(localeFecha, { month: "short", year: "2-digit" });
  }
  return fecha.toLocaleDateString(localeFecha, { year: "numeric" });
}

// Un solo trazo por barra (single series, sin leyenda): con pocas barras se
// etiquetan todas, con muchas (ej. 30 días) solo un subconjunto parejo para
// no amontonar texto — etiquetado selectivo en vez de una etiqueta por dato.
function indicesAEtiquetar(total: number): Set<number> {
  const maxEtiquetas = 8;
  if (total <= maxEtiquetas) return new Set(Array.from({ length: total }, (_, i) => i));
  const paso = Math.ceil(total / maxEtiquetas);
  const indices = new Set<number>();
  for (let i = 0; i < total; i += paso) indices.add(i);
  indices.add(total - 1);
  return indices;
}

export default function GraficoConteos({
  granularidad,
  conteos,
}: GraficoConteosProps) {
  const t = useTranslations("estadisticas");
  const locale = useLocale();
  const [activo, setActivo] = useState<number | null>(null);

  if (conteos.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        {t("sinDatosGrafico")}
      </p>
    );
  }

  const max = Math.max(...conteos.map((c) => c.total), 1);
  const anchoTotal = conteos.length * (ANCHO_BARRA + GAP) - GAP;
  const etiquetar = indicesAEtiquetar(conteos.length);
  const seleccionado = activo !== null ? conteos[activo] : null;

  return (
    <div>
      <div
        className="flex h-6 items-center text-xs font-medium text-neutral-300"
        aria-hidden={seleccionado === null}
      >
        {seleccionado
          ? `${formatearPeriodo(seleccionado.periodo, granularidad, locale)} · ${t("sismosConteo", { n: seleccionado.total })}`
          : ""}
      </div>
      <div className="overflow-x-auto pb-1">
        <svg
          role="img"
          aria-label={t("graficoAriaLabel")}
          width={anchoTotal}
          height={ALTO + 24}
          className="min-w-full"
        >
          {/* Línea base — recesiva, no compite con las barras. */}
          <line
            x1={0}
            y1={ALTO}
            x2={anchoTotal}
            y2={ALTO}
            stroke="#262626"
            strokeWidth={1}
          />
          {conteos.map((c, i) => {
            const alto = Math.max((c.total / max) * (ALTO - 8), c.total > 0 ? 3 : 0);
            const x = i * (ANCHO_BARRA + GAP);
            const y = ALTO - alto;
            const esActivo = activo === i;
            return (
              <g
                key={c.periodo}
                onClick={() => setActivo(esActivo ? null : i)}
                className="cursor-pointer touch-manipulation"
              >
                {/* Hit target más ancho que la barra visible, toda la
                    columna hasta la base — más fácil de tocar en mobile. */}
                <rect
                  x={x - GAP / 2}
                  y={0}
                  width={ANCHO_BARRA + GAP}
                  height={ALTO}
                  fill="transparent"
                />
                <rect
                  x={x}
                  y={y}
                  width={ANCHO_BARRA}
                  height={alto}
                  rx={RADIO_TOPE}
                  fill={esActivo ? "#fb923c" : "#f97316"}
                  opacity={esActivo ? 1 : 0.85}
                />
                {etiquetar.has(i) && (
                  <text
                    x={x + ANCHO_BARRA / 2}
                    y={ALTO + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#a3a3a3"
                  >
                    {formatearPeriodo(c.periodo, granularidad, locale)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
