// Debe cubrir la duración de `mapa-revelar` en globals.css (0.3 s) con un
// pequeño margen.
export const DURACION_REVELADO_MS = 350;

interface RaizConDataset {
  dataset: Record<string, string | undefined>;
}

/**
 * Marca html[data-intro-fin] para que `<main>` haga el fade de revelado cuando
 * el splash se desmonta, y la quita al terminar el fade. Si se dejara puesta,
 * cada `<main>` nuevo (navegación cliente) repetiría el fade. Devuelve la
 * función que cancela la limpieza.
 */
export function marcarIntroFin(root: RaizConDataset): () => void {
  root.dataset.introFin = "1";
  const timer = setTimeout(() => {
    delete root.dataset.introFin;
  }, DURACION_REVELADO_MS);
  return () => clearTimeout(timer);
}
