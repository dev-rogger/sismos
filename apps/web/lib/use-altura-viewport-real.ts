"use client";

import { useEffect, useState } from "react";

// `100dvh` en CSS debería resolver el clásico problema de Safari mobile
// (100vh se calcula con la barra de Safari colapsada, dejando contenido
// cortado o un hueco), pero Safari tiene bugs conocidos donde `dvh` no
// siempre se recalcula en el momento exacto en que la barra de
// herramientas termina de mostrarse/ocultarse — a veces "el frame que
// midió" queda un poco corto y aparece una franja del fondo oscuro del
// body abajo. Medir `visualViewport.height` directo con JS y fijarlo como
// alto en píxeles es la forma robusta de evitar depender de esa unidad.
// Usado por cualquier elemento fixed/full-screen que necesite cubrir el
// alto real (PantallaPrincipal, el drawer de MenuLateral).
export function useAlturaViewportReal(): number | null {
  const [alturaPx, setAlturaPx] = useState<number | null>(null);

  useEffect(() => {
    function actualizarAltura() {
      setAlturaPx(window.visualViewport?.height ?? window.innerHeight);
    }
    actualizarAltura();

    window.visualViewport?.addEventListener("resize", actualizarAltura);
    window.addEventListener("resize", actualizarAltura);
    window.addEventListener("orientationchange", actualizarAltura);
    return () => {
      window.visualViewport?.removeEventListener("resize", actualizarAltura);
      window.removeEventListener("resize", actualizarAltura);
      window.removeEventListener("orientationchange", actualizarAltura);
    };
  }, []);

  return alturaPx;
}
