import { geocodificarAproximado } from "../geocodificacion-aproximada";
import type { SismoNormalizado } from "../types";

export interface GaelSismoRaw {
  Fecha: string;
  Profundidad: string;
  Magnitud: string;
  RefGeografica: string;
  FechaUpdate: string;
}

const ZONA_HORARIA_CHILE = "America/Santiago";

const FORMATEADOR_CHILE = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONA_HORARIA_CHILE,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function desfaseChileMs(instante: Date): number {
  const partes: Record<string, string> = {};
  for (const parte of FORMATEADOR_CHILE.formatToParts(instante)) {
    if (parte.type !== "literal") partes[parte.type] = parte.value;
  }
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    Number(partes.hour) % 24,
    Number(partes.minute),
    Number(partes.second),
  );
  return comoUtc - instante.getTime();
}

// El campo `Fecha` de GAEL es hora local de Chile, no UTC: coincide exactamente
// con el `local_date` de xor.cl para el mismo evento (verificado cruzando ambos
// feeds; ej. "2026-08-16 21:43:05" en GAEL = "2026-08-17 01:43:05" UTC en
// xor.cl). Interpretarla como UTC dejaba los eventos de respaldo 3-4 horas en
// el futuro, lo que rompía el dedupe/reconciliación (ventana de 2 minutos) y el
// tope de antigüedad del push. Se convierte respetando el horario de verano
// chileno (UTC-4 en invierno, UTC-3 en verano) vía Intl.
export function parsearFechaChile(fechaLocal: string): Date {
  const provisional = new Date(`${fechaLocal.trim().replace(" ", "T")}Z`);
  if (Number.isNaN(provisional.getTime())) return provisional;
  // Dos pasadas: la primera aplica el desfase vigente en un instante corrido,
  // la segunda lo recalcula ya en el instante correcto (solo cambia algo en las
  // horas alrededor de un cambio de hora).
  const primera = new Date(provisional.getTime() - desfaseChileMs(provisional));
  return new Date(provisional.getTime() - desfaseChileMs(primera));
}

function idSinteticoGael(raw: GaelSismoRaw): string {
  return `gael-${raw.Fecha}-${raw.Magnitud}-${raw.RefGeografica}`.replace(
    /\s+/g,
    "-",
  );
}

export function normalizeGaelSismo(raw: GaelSismoRaw): SismoNormalizado | null {
  const ubicacion = geocodificarAproximado(raw.RefGeografica);
  if (!ubicacion) return null;

  // GAEL es un feed gratuito de un tercero y entrega todo como string: un
  // campo vacío o malformado daría NaN (que Postgres guardaría corrompiendo la
  // fila) o un Invalid Date (que haría explotar el insert y abortaría la
  // corrida entera). Se descarta el evento igual que cuando no geocodifica.
  const magnitud = Number(raw.Magnitud);
  const profundidadKm = Number(raw.Profundidad);
  const fecha = parsearFechaChile(raw.Fecha ?? "");
  if (
    raw.Magnitud?.trim() === "" ||
    raw.Profundidad?.trim() === "" ||
    !Number.isFinite(magnitud) ||
    !Number.isFinite(profundidadKm) ||
    Number.isNaN(fecha.getTime())
  ) {
    return null;
  }

  return {
    fuente: "csn",
    externalId: idSinteticoGael(raw),
    fecha,
    magnitud,
    profundidadKm,
    latitud: ubicacion.lat,
    longitud: ubicacion.lon,
    lugar: raw.RefGeografica,
    bandera: "🇨🇱",
    ubicacionAproximada: true,
  };
}
