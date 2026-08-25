interface IconoSpinnerProps {
  className?: string;
  label?: string;
}

// Spinner reutilizable para estados de carga de botones (login,
// ModalConfiguracion) — reemplaza el texto "..." plano. `pathLength={100}`
// deja el trazo parcial expresado como porcentaje en vez de tener que
// calcular la circunferencia real del círculo. La rotación vive en
// `.spinner-girando` (app/globals.css), que respeta prefers-reduced-motion
// igual que el resto de las animaciones del proyecto.
//
// `label` es el texto accesible del `aria-label` (por defecto "Cargando"
// por compatibilidad); este componente no tiene hooks así que no puede leer
// el locale actual — cada caller le pasa su propio texto ya traducido vía
// useTranslations().
export default function IconoSpinner({
  className = "h-4 w-4",
  label = "Cargando",
}: IconoSpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={`spinner-girando ${className}`}
      role="status"
      aria-label={label}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeOpacity={0.25}
        pathLength={100}
      />
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="25 100"
      />
    </svg>
  );
}
