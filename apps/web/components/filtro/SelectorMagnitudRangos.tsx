"use client";

import { useTranslations } from "next-intl";
import { RANGOS_MAGNITUD, type RangoMagnitud } from "../../lib/filtro-tipos";

interface SelectorMagnitudRangosProps {
  seleccionados: RangoMagnitud[];
  onChange: (rangos: RangoMagnitud[]) => void;
  className?: string;
}

export default function SelectorMagnitudRangos({
  seleccionados,
  onChange,
  className = "flex flex-wrap gap-2",
}: SelectorMagnitudRangosProps) {
  const t = useTranslations("filtro");

  const alternar = (valor: RangoMagnitud) => {
    if (seleccionados.includes(valor)) {
      // Nunca deseleccionar el último chip activo: si quedara
      // `seleccionados: []`, magnitudPasaRangos() rechazaría todos los
      // sismos y el mapa quedaría vacío sin ningún aviso al usuario.
      if (seleccionados.length === 1 && seleccionados[0] === valor) return;
      onChange(seleccionados.filter((r) => r !== valor));
    } else {
      onChange([...seleccionados, valor]);
    }
  };

  return (
    <div className={className}>
      {RANGOS_MAGNITUD.map((rango) => {
        const activo = seleccionados.includes(rango.valor);
        // Mismo caso que el `return` temprano de `alternar`: si este es el
        // último chip activo, el clic no hace nada — se atenúa visualmente
        // para que se entienda que está bloqueado, no roto.
        const bloqueado = activo && seleccionados.length === 1;
        return (
          <button
            key={rango.valor}
            type="button"
            onClick={() => alternar(rango.valor)}
            aria-pressed={activo}
            aria-disabled={bloqueado || undefined}
            title={bloqueado ? t("rangoBloqueado") : undefined}
            className={bloqueado ? "chip cursor-not-allowed opacity-50" : "chip"}
          >
            {t(rango.valor)}
          </button>
        );
      })}
    </div>
  );
}
