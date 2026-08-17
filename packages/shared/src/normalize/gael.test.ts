import { describe, it, expect } from "vitest";
import { normalizeGaelSismo, parsearFechaChile } from "./gael";
import type { GaelSismoRaw } from "./gael";

const RAW_BASE: GaelSismoRaw = {
  Fecha: "2026-08-16 21:43:05",
  Profundidad: "216",
  Magnitud: "2.7",
  RefGeografica: "81 km al SE de Socaire",
  FechaUpdate: "2026-08-16T21:50:00.530Z",
};

describe("parsearFechaChile", () => {
  it("interpreta la fecha como hora local de Chile en invierno (UTC-4)", () => {
    expect(parsearFechaChile("2026-08-16 21:43:05").toISOString()).toBe(
      "2026-08-17T01:43:05.000Z",
    );
  });

  it("respeta el horario de verano chileno (UTC-3)", () => {
    expect(parsearFechaChile("2026-01-15 12:00:00").toISOString()).toBe(
      "2026-01-15T15:00:00.000Z",
    );
  });

  it("devuelve Invalid Date si el texto no es una fecha", () => {
    expect(Number.isNaN(parsearFechaChile("no es fecha").getTime())).toBe(true);
  });
});

describe("normalizeGaelSismo", () => {
  it("normaliza un evento válido como ubicación aproximada", () => {
    const evento = normalizeGaelSismo(RAW_BASE);
    expect(evento).not.toBeNull();
    expect(evento?.fuente).toBe("csn");
    expect(evento?.ubicacionAproximada).toBe(true);
    expect(evento?.magnitud).toBe(2.7);
    expect(evento?.profundidadKm).toBe(216);
    expect(evento?.fecha.toISOString()).toBe("2026-08-17T01:43:05.000Z");
  });

  it("descarta el evento si la localidad no se puede geocodificar", () => {
    expect(
      normalizeGaelSismo({
        ...RAW_BASE,
        RefGeografica: "10 km al N de Narnia",
      }),
    ).toBeNull();
  });

  it("descarta el evento si la magnitud no es numérica", () => {
    expect(normalizeGaelSismo({ ...RAW_BASE, Magnitud: "" })).toBeNull();
    expect(normalizeGaelSismo({ ...RAW_BASE, Magnitud: "n/d" })).toBeNull();
  });

  it("descarta el evento si la profundidad no es numérica", () => {
    expect(normalizeGaelSismo({ ...RAW_BASE, Profundidad: "" })).toBeNull();
  });

  it("descarta el evento si la fecha es inválida", () => {
    expect(normalizeGaelSismo({ ...RAW_BASE, Fecha: "0000-99-99" })).toBeNull();
  });
});
