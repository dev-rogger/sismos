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
//
// `visualViewport.height` en iOS no incluye el área del home indicator
// (el gesto inferior en iPhones sin botón físico) aunque `viewport-fit:
// cover` deje dibujar contenido ahí — por eso el hueco es constante (no
// cambia al hacer scroll ni al esconderse la barra de Safari) y aparece
// igual en la PWA instalada (sin barra de navegador) que en Safari normal:
// confirmado con el usuario, que descartó la barra como causa. Medimos ese
// alto con un elemento de prueba y lo sumamos.
function medirSafeAreaInferiorPx(): number {
  if (typeof document === "undefined") return 0;
  const sonda = document.createElement("div");
  sonda.style.cssText =
    "position:fixed;bottom:0;left:0;height:0;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom, 0px);";
  document.body.appendChild(sonda);
  const valor = parseFloat(getComputedStyle(sonda).paddingBottom) || 0;
  document.body.removeChild(sonda);
  return valor;
}

export function useAlturaViewportReal(): number | null {
  const [alturaPx, setAlturaPx] = useState<number | null>(null);

  useEffect(() => {
    function actualizarAltura() {
      const base = window.visualViewport?.height ?? window.innerHeight;
      setAlturaPx(base + medirSafeAreaInferiorPx());
    }
    actualizarAltura();

    window.visualViewport?.addEventListener("resize", actualizarAltura);
    window.addEventListener("resize", actualizarAltura);
    window.addEventListener("orientationchange", actualizarAltura);
    // En un cold-launch de la PWA instalada, SplashPWA tapa la pantalla ~2s
    // mientras WebKit termina de asentar las métricas reales del WKWebView
    // recién abierto — la medición de arriba, hecha al montar, puede
    // quedarse con un valor viejo/corto de ese instante inicial, y como no
    // es un "resize" real desde la perspectiva del navegador, ningún
    // listener de los de arriba la corrige después. Remedimos también
    // cuando el splash se va (mismo evento que usa SplashPWA para salir),
    // que es cuando esas métricas ya están asentadas.
    window.addEventListener("sismos:mapa-listo", actualizarAltura);
    return () => {
      window.visualViewport?.removeEventListener("resize", actualizarAltura);
      window.removeEventListener("resize", actualizarAltura);
      window.removeEventListener("orientationchange", actualizarAltura);
      window.removeEventListener("sismos:mapa-listo", actualizarAltura);
    };
  }, []);

  return alturaPx;
}
