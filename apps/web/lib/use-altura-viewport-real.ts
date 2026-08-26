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
    function medirAhora() {
      const base = window.visualViewport?.height ?? window.innerHeight;
      setAlturaPx(base + medirSafeAreaInferiorPx());
    }
    medirAhora();

    // En un cold-launch de la PWA instalada, WebKit tarda en asentar las
    // métricas reales del WKWebView recién abierto (primeros cientos de
    // ms) — la medición de arriba, hecha al montar, puede quedarse con un
    // valor viejo. Antes esto se re-medía en el evento "sismos:mapa-listo"
    // (cuando el mapa termina de cargar), pero eso hace que la remedición
    // coincida justo con el instante en que SplashPWA empieza a
    // desvanecerse y revela el mapa: un cambio de alto justo ahí dispara
    // el ResizeObserver de MapLibre, que limpia y repinta el canvas WebGL
    // — un parpadeo real, no solo percibido. Un timer fijo temprano cae
    // bien adentro de los ~2.1s que el splash tapa igual, sin depender de
    // cuánto tarde la red en cargar el mapa.
    const timerInicial = setTimeout(medirAhora, 400);

    // iOS dispara varios eventos de resize seguidos mientras asienta la
    // barra/safe-area — sin debounce, cada uno dispara su propio ciclo de
    // resize+redraw del mapa. Colapsamos las ráfagas en una sola medición.
    let debounceId: ReturnType<typeof setTimeout> | undefined;
    function medirConDebounce() {
      if (debounceId !== undefined) clearTimeout(debounceId);
      debounceId = setTimeout(medirAhora, 120);
    }

    window.visualViewport?.addEventListener("resize", medirConDebounce);
    window.addEventListener("resize", medirConDebounce);
    window.addEventListener("orientationchange", medirConDebounce);
    return () => {
      clearTimeout(timerInicial);
      if (debounceId !== undefined) clearTimeout(debounceId);
      window.visualViewport?.removeEventListener("resize", medirConDebounce);
      window.removeEventListener("resize", medirConDebounce);
      window.removeEventListener("orientationchange", medirConDebounce);
    };
  }, []);

  return alturaPx;
}
