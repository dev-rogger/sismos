"use client";

import { useAlturaViewportReal } from "../lib/use-altura-viewport-real";

export default function PantallaPrincipal({
  children,
}: {
  children: React.ReactNode;
}) {
  const alturaPx = useAlturaViewportReal();

  return (
    <main
      className="flex w-screen flex-col lg:flex-row"
      // Antes de que el efecto corra (primer paint, incluido el HTML que
      // manda el servidor), 100dvh es el mejor fallback disponible — ya
      // arregla el caso más común, JS solo termina de afinarlo.
      style={{ height: alturaPx !== null ? `${alturaPx}px` : "100dvh" }}
    >
      {children}
    </main>
  );
}
