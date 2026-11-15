import { describe, it, expect } from "vitest";
import { findDuplicate } from "./dedupe";
import type { SismoNormalizado } from "./types";

const BASE = new Date("2026-11-15T12:00:00Z");

function sismo(over: Partial<SismoNormalizado>): SismoNormalizado {
  return {
    fuente: "csn",
    externalId: "x",
    fecha: BASE,
    magnitud: 5,
    profundidadKm: 30,
    latitud: -33,
    longitud: -71,
    lugar: "test",
    bandera: null,
    ubicacionAproximada: false,
    ...over,
  };
}

describe("findDuplicate", () => {
  it("elige el candidato más cercano aunque venga segundo", () => {
    const lejano = sismo({
      externalId: "lejano",
      latitud: -33.5,
      fecha: new Date(BASE.getTime() + 60_000),
    });
    const cercano = sismo({
      externalId: "cercano",
      latitud: -33.01,
      fecha: new Date(BASE.getTime() + 1_000),
    });
    expect(findDuplicate(sismo({ fuente: "usgs" }), [lejano, cercano])).toBe(
      cercano,
    );
  });

  it("devuelve null fuera de la ventana de 2 minutos", () => {
    const o = sismo({ fecha: new Date(BASE.getTime() + 121_000) });
    expect(findDuplicate(sismo({}), [o])).toBeNull();
  });

  it("devuelve null a más de 100 km", () => {
    const o = sismo({ latitud: -34 }); // ~111 km
    expect(findDuplicate(sismo({}), [o])).toBeNull();
  });

  it("devuelve null si la magnitud difiere más de 0.5", () => {
    const o = sismo({ magnitud: 5.6 });
    expect(findDuplicate(sismo({}), [o])).toBeNull();
  });

  it("devuelve null con lista vacía", () => {
    expect(findDuplicate(sismo({}), [])).toBeNull();
  });
});
