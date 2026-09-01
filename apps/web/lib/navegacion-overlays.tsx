"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

// Un solo dueño del historial para TODOS los overlays de la app.
//
// Antes, cada instancia de useOverlayAccesible decidía por su cuenta —en su
// propio cleanup— si empujar o consumir una entrada de historial, apoyándose
// en una pila global mutable. Como React no garantiza el orden entre los
// efectos de componentes distintos, dos overlays que se relevan podían
// pisarse: el que salía veía la pila vacía y hacía `history.back()`, y ese
// popstate llegaba cuando el que entraba ya había montado, cerrándolo solo.
// (Se veía como "toco Estadísticas y vuelve al mapa".)
//
// Acá la decisión se toma UNA sola vez, en un efecto que ve el estado final
// de la pila después de cada commit. Si un overlay se desregistra y otro se
// registra en el mismo commit, ambos updates se agrupan, la profundidad pasa
// de 1 a 1 y no se toca el historial en absoluto. La carrera desaparece por
// construcción, no por ganarle al timing.

interface EntradaOverlay {
  id: symbol;
  cerrar: () => void;
}

interface ValorContexto {
  registrar: (entrada: EntradaOverlay) => void;
  desregistrar: (id: symbol) => void;
  marcarNavegacionSaliente: () => void;
}

const ContextoOverlays = createContext<ValorContexto | null>(null);

// Marca nuestra entrada sintética dentro de history.state. Antes de
// consumirla verificamos que siga ahí: si un router.push la reemplazó, hacer
// `back()` desharía una navegación real del usuario.
const MARCA = "overlayAccesible";

export function ProveedorOverlays({
  children,
}: {
  children: React.ReactNode;
}) {
  // La pila vive en un ref: registrarse no debe re-renderizar a nadie. El
  // estado `profundidad` es solo el disparador de la reconciliación.
  const pilaRef = useRef<EntradaOverlay[]>([]);
  const [profundidad, setProfundidad] = useState(0);
  // Si hay una entrada sintética nuestra puesta en el historial ahora mismo.
  const entradaPuestaRef = useRef(false);
  // Un cierre que ocurre porque el usuario navega de verdad a otra ruta no
  // debe consumir la entrada con `back()`: competiría con el router.push y
  // Next abortaría esa navegación (era el bug de "Iniciar sesión" que no
  // llevaba a /login).
  const navegacionSalienteRef = useRef(false);

  const registrar = useCallback((entrada: EntradaOverlay) => {
    pilaRef.current = [...pilaRef.current, entrada];
    setProfundidad(pilaRef.current.length);
  }, []);

  const desregistrar = useCallback((id: symbol) => {
    pilaRef.current = pilaRef.current.filter((e) => e.id !== id);
    setProfundidad(pilaRef.current.length);
  }, []);

  const marcarNavegacionSaliente = useCallback(() => {
    navegacionSalienteRef.current = true;
  }, []);

  // Reconciliación: dejar el historial coherente con la profundidad real.
  // Mantenemos como mucho UNA entrada sintética, sin importar cuántos
  // overlays haya apilados — "hay algo abierto" es un solo estado desde el
  // punto de vista del botón atrás.
  useEffect(() => {
    if (profundidad > 0 && !entradaPuestaRef.current) {
      window.history.pushState({ [MARCA]: true }, "");
      entradaPuestaRef.current = true;
      return;
    }
    if (profundidad === 0 && entradaPuestaRef.current) {
      entradaPuestaRef.current = false;
      if (navegacionSalienteRef.current) {
        navegacionSalienteRef.current = false;
        return;
      }
      // Solo consumimos la entrada si sigue siendo la nuestra.
      if (window.history.state?.[MARCA] === true) {
        window.history.back();
      }
    }
  }, [profundidad]);

  useEffect(() => {
    function alVolverAtras() {
      const pila = pilaRef.current;
      if (pila.length === 0) return;
      // El navegador ya consumió nuestra entrada al disparar este popstate.
      entradaPuestaRef.current = false;
      // Cerramos solo el de más arriba; si quedan overlays abiertos por
      // debajo, el efecto de reconciliación repone la entrada para que el
      // próximo "atrás" también los pueda cerrar.
      pila[pila.length - 1]!.cerrar();
    }
    window.addEventListener("popstate", alVolverAtras);
    return () => window.removeEventListener("popstate", alVolverAtras);
  }, []);

  const valorRef = useRef<ValorContexto | null>(null);
  if (valorRef.current === null) {
    valorRef.current = { registrar, desregistrar, marcarNavegacionSaliente };
  }

  return (
    <ContextoOverlays.Provider value={valorRef.current}>
      {children}
    </ContextoOverlays.Provider>
  );
}

// Devuelve null si no hay proveedor montado: los overlays siguen funcionando
// (Escape, scroll lock, focus trap), solo sin integración con el botón atrás.
export function useContextoOverlays(): ValorContexto | null {
  return useContext(ContextoOverlays);
}
