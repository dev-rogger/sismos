export const MAX_ENDPOINT_LENGTH = 1024;
export const MAX_KEY_LENGTH = 256;

const HOSTS_PERMITIDOS = [
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
];

export function esEndpointPushPermitido(endpoint: string): boolean {
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return false;
  }
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  // Sin puerto explícito (los servicios de push usan 443) ni credenciales en la
  // URL: ambos sirven para apuntar el POST del servidor a otro destino.
  if (url.port !== "") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return HOSTS_PERMITIDOS.some((s) => host === s || host.endsWith("." + s));
}
