// Boundary de streaming vacío: el splash (montado en el layout, fuera de
// este segmento) ya cubre la pantalla, así que este fallback nunca se ve.
// Su único propósito es que Next.js mande el shell (layout + splash) de
// inmediato en vez de esperar a que resuelva el fetch de sismos en page.tsx.
export default function Loading() {
  return null;
}
