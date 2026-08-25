interface IconoCheckProps {
  className?: string;
}

// Check SVG reutilizado como indicador de selección — ver IconoChevron para
// el criterio de estilo (mismo viewBox/stroke) que se sigue en este archivo.
export default function IconoCheck({ className = "h-4 w-4" }: IconoCheckProps) {
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
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
