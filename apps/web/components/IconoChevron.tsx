interface IconoChevronProps {
  className?: string;
}

// Chevron SVG reutilizado como indicador de dropdown/expand — reemplaza el
// carácter de texto "▾" que se repetía (con distinto tamaño/peso según la
// fuente del dispositivo) en ListaHistorial, ModalFiltroMapa y MenuLateral.
export default function IconoChevron({ className = "h-4 w-4" }: IconoChevronProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}
