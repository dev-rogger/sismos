export const RADIO_KM_MIN = 25;
export const RADIO_KM_MAX = 1000;
export const RADIO_KM_DEFAULT = 200;

export function esRadioKmValido(valor: unknown): valor is number {
  return (
    typeof valor === "number" && valor >= RADIO_KM_MIN && valor <= RADIO_KM_MAX
  );
}

export function esCentroValido(
  valor: unknown,
): valor is { lat: number; lon: number } {
  if (!valor || typeof valor !== "object") return false;
  const v = valor as Record<string, unknown>;
  return (
    typeof v.lat === "number" &&
    v.lat >= -90 &&
    v.lat <= 90 &&
    typeof v.lon === "number" &&
    v.lon >= -180 &&
    v.lon <= 180
  );
}
