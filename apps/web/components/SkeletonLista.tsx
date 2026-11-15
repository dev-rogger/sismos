// Placeholder de carga con la misma geometría que las tarjetas reales
// (alto fijo), así no hay salto de layout (CLS) cuando llegan los datos.
// role="status" + texto solo para lectores de pantalla: el aviso de "cargando"
// no depende de lo visual.
export default function SkeletonLista({
  filas = 6,
  alto = "h-[4.5rem]",
  etiqueta,
  className = "px-4 py-3",
}: {
  filas?: number;
  alto?: string;
  etiqueta: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex min-h-0 flex-1 flex-col gap-2 overflow-hidden ${className}`}
    >
      <span className="sr-only">{etiqueta}</span>
      {Array.from({ length: filas }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={`skeleton ${alto} shrink-0`}
          style={{ animationDelay: `${i * 80}ms` }}
        />
      ))}
    </div>
  );
}
