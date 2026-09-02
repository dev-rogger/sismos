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
//
// ⚠️ NO "simplificar" esto a `100dvh` ni a `position:fixed; inset:0`.
// Ya se intentó dos veces y las dos volvieron a traer la franja negra:
//   - e580e23 revirtió el `100dvh` puro (Safari no siempre lo recalcula).
//   - 638b61d cambió esto por `fixed inset:0` creyendo que la suma del
//     safe-area era un doble conteo, y la franja pasó a verse SIEMPRE (no
//     solo en la intro, también sobre el mapa). Revertido.
//
// El error de 638b61d fue medir en el navegador equivocado: en Chromium con
// `Emulation.setSafeAreaInsetsOverride`, `visualViewport.height` SÍ incluye
// el área del home indicator, así que sumarla da 34px de más y parece un
// bug. En WebKit real es al revés — y WebKit es el único que importa acá,
// porque esto solo se manifiesta en la PWA instalada en iPhone.
// Moraleja: la emulación de safe-area de Chromium no sirve para validar
// esto. Cualquier cambio a esta cuenta se valida en un iPhone de verdad.
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

    // Arranque en frío de la PWA: WebKit a veces no ha asentado del todo
    // `visualViewport.height` en el instante exacto de este primer mount, y
    // esa medición síncrona puede salir corta — sin nada que la corrija,
    // queda mal el resto de la sesión (el hueco recién se ve mucho después,
    // cuando el splash se desmonta y expone `<main>`). Un remedido único,
    // dos frames después, corrige eso sin repetir el parpadeo del timer que
    // se sacó más abajo: durante esos 2 frames el elemento sigue con
    // `visibility:hidden` detrás del splash (`.splash-pwa ~ main` en
    // globals.css), así que el reflow no llega a pintarse.
    let raf2: number | undefined;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(medirAhora);
    });

    // iOS dispara varios eventos de resize seguidos mientras asienta la
    // barra/safe-area — sin debounce, cada uno dispara su propio ciclo de
    // resize+redraw del mapa. Colapsamos las ráfagas en una sola medición.
    //
    // A propósito NO hay un timer "por si acaso" re-midiendo unos cientos
    // de ms después del mount (más allá del remedido de 2 frames de arriba,
    // que corre mientras el elemento sigue oculto): la altura base
    // (visualViewport.height) y el alto del safe-area (env(), constante) ya
    // son correctos en esa primera ventana. Un timer más tardío se probó
    // (pensando en que WebKit tardaría en asentar las métricas del
    // WKWebView recién abierto) y causó un salto de alto visible en pleno
    // splash — cada cambio de `alturaPx` reflowea un elemento fixed de
    // pantalla completa con z-index alto, y eso se ve como un parpadeo
    // real, no solo percibido. Si algo cambia de verdad después del mount,
    // ya lo cubren los listeners de resize/orientationchange de abajo.
    let debounceId: ReturnType<typeof setTimeout> | undefined;
    function medirConDebounce() {
      if (debounceId !== undefined) clearTimeout(debounceId);
      debounceId = setTimeout(medirAhora, 120);
    }

    window.visualViewport?.addEventListener("resize", medirConDebounce);
    window.addEventListener("resize", medirConDebounce);
    window.addEventListener("orientationchange", medirConDebounce);
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2 !== undefined) cancelAnimationFrame(raf2);
      if (debounceId !== undefined) clearTimeout(debounceId);
      window.visualViewport?.removeEventListener("resize", medirConDebounce);
      window.removeEventListener("resize", medirConDebounce);
      window.removeEventListener("orientationchange", medirConDebounce);
    };
  }, []);

  return alturaPx;
}
