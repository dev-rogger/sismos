"use client";

import { RANGOS_MAGNITUD, type RangoMagnitud } from "../../lib/filtro-tipos";

interface SelectorMagnitudRangosProps {
  seleccionados: RangoMagnitud[];
  onChange: (rangos: RangoMagnitud[]) => void;
}

export default function SelectorMagnitudRangos({
  seleccionados,
  onChange,
}: SelectorMagnitudRangosProps) {
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
    <div className="flex flex-wrap gap-2">
      {RANGOS_MAGNITUD.map((rango) => {
        const activo = seleccionados.includes(rango.valor);
        return (
          <button
            key={rango.valor}
            type="button"
            onClick={() => alternar(rango.valor)}
            aria-pressed={activo}
            className={`flex min-h-11 touch-manipulation items-center justify-center rounded-lg border px-3 text-sm font-medium transition active:scale-[0.97] active:brightness-95 ${
              activo
                ? "border-sky-500 bg-sky-500/10 text-sky-400"
                : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
            }`}
          >
            {rango.etiqueta}
          </button>
        );
      })}
    </div>
  );
}
