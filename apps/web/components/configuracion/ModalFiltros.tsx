"use client";

interface ModalFiltrosProps {
  abierto: boolean;
  onCerrar: () => void;
  soloChile: boolean;
  onSoloChileChange: (soloChile: boolean) => void;
  magnitudMinima: number;
  onMagnitudMinimaChange: (magnitudMinima: number) => void;
}

export default function ModalFiltros({
  abierto,
  onCerrar,
  soloChile,
  onSoloChileChange,
  magnitudMinima,
  onMagnitudMinimaChange,
}: ModalFiltrosProps) {
  if (!abierto) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-100">
            Configuración
          </h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          >
            ✕
          </button>
        </div>

        <button
          type="button"
          onClick={() => onSoloChileChange(!soloChile)}
          aria-pressed={soloChile}
          className={`flex min-h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors ${
            soloChile
              ? "border-sky-500 bg-sky-500/10 text-sky-400"
              : "border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600"
          }`}
        >
          🇨🇱 Solo Chile
        </button>

        <div className="mt-4">
          <label
            htmlFor="magnitud-minima-filtros"
            className="mb-2 block text-xs text-neutral-400"
          >
            Mostrar desde M{magnitudMinima}+
          </label>
          <input
            id="magnitud-minima-filtros"
            type="range"
            min={2}
            max={7}
            step={1}
            value={magnitudMinima}
            onChange={(e) => onMagnitudMinimaChange(Number(e.target.value))}
            className="w-full accent-sky-500"
          />
        </div>
      </div>
    </div>
  );
}
