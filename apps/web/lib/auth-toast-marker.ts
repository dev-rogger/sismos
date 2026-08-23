// Login con Google y logout hacen un redirect completo de página (no
// navegación cliente), así que todo el árbol de React se remonta al volver.
// sessionStorage sobrevive a ese reload, a diferencia de un estado en
// memoria — por eso lo usamos para avisarle a AuthToastWatcher "esto que
// acaba de pasar fue por una acción del usuario, mostrá el toast".

const CLAVE = "sismos:auth-toast-pendiente";

export function marcarLogin(): void {
  sessionStorage.setItem(CLAVE, "login");
}

export function marcarLogout(): void {
  sessionStorage.setItem(CLAVE, "logout");
}

export function leerYLimpiarMarca(): "login" | "logout" | null {
  const valor = sessionStorage.getItem(CLAVE);
  if (valor === "login" || valor === "logout") {
    sessionStorage.removeItem(CLAVE);
    return valor;
  }
  return null;
}
