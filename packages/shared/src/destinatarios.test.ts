import { describe, expect, it } from "vitest";
import {
  PISO_RESCATE_MAG,
  UMBRAL_RESCATE_MMI,
  seleccionarDestinatarios,
  type EventoDestino,
  type SuscriptorDestino,
} from "./destinatarios";
import { distanciaKm } from "./distancia";
import { radioMmiKm } from "./radio-percepcion";

const EPI = { lat: -33, lon: -70 };
// Un grado de latitud ~ 111.19 km: centro del usuario al norte del epicentro.
const centroA = (km: number) => ({ lat: EPI.lat + km / 111.19, lon: EPI.lon });

function sub(
  distKm: number | null,
  extra: Partial<SuscriptorDestino> = {},
): SuscriptorDestino {
  return {
    magnitudMinima: 6,
    centro: distKm === null ? null : centroA(distKm),
    radioKm: distKm === null ? null : 300,
    alcanceMundial: false,
    ...extra,
  };
}

function ev(
  magnitud: number,
  profundidadKm: number | null,
  extra: Partial<EventoDestino> = {},
): EventoDestino {
  return {
    magnitud,
    latitud: EPI.lat,
    longitud: EPI.lon,
    profundidadKm,
    fuente: "csn",
    ...extra,
  };
}

const recibe = (s: SuscriptorDestino, e: EventoDestino) =>
  seleccionarDestinatarios([s], e).length === 1;

describe("modelo (radios de referencia, MMI IV)", () => {
  const ref: Array<[number, number, number]> = [
    [5.0, 35, 56], [5.0, 70, 40], [5.0, 150, 0],
    [5.5, 35, 90], [5.5, 70, 95], [5.5, 150, 109],
    [6, 10, 137], [6, 70, 157], [6, 150, 226],
  ];
  it.each(ref)("M%f h%f ~ %i km", (m, h, esperado) => {
    expect(
      Math.abs(radioMmiKm(m, h, UMBRAL_RESCATE_MMI) - esperado),
    ).toBeLessThanOrEqual(Math.max(2, esperado * 0.03));
  });
  it("constantes", () => {
    expect(PISO_RESCATE_MAG).toBe(5.0);
    expect(UMBRAL_RESCATE_MMI).toBe(4);
  });
});

describe("seleccionarDestinatarios (csn)", () => {
  it("M5.5 h35 a 60 km -> si (rescate)", () => {
    expect(recibe(sub(60), ev(5.5, 35))).toBe(true);
  });
  it("M5.5 h35 a 120 km -> no (fuera del radio IV)", () => {
    expect(recibe(sub(120), ev(5.5, 35))).toBe(false);
  });
  it("M5.0 h10 a 40 km -> si", () => {
    expect(recibe(sub(40), ev(5.0, 10))).toBe(true);
  });
  it("M5.0 h70 a 30 km -> si", () => {
    expect(recibe(sub(30), ev(5.0, 70))).toBe(true);
  });
  it("M5.0 h150 a 10 km -> no (radio IV = 0)", () => {
    expect(recibe(sub(10), ev(5.0, 150))).toBe(false);
  });
  it("M4.8 h20 a 15 km -> no (bajo el piso)", () => {
    expect(recibe(sub(15), ev(4.8, 20))).toBe(false);
  });
  it("M4.0 h100 a 50 km -> no", () => {
    expect(recibe(sub(50), ev(4.0, 100))).toBe(false);
  });
  it("M5.8 h150 a 100 km -> si", () => {
    expect(recibe(sub(100), ev(5.8, 150))).toBe(true);
  });
  it("M6.5 h35 a 250 km -> si (regla A)", () => {
    expect(recibe(sub(250), ev(6.5, 35))).toBe(true);
  });
  it("M6.5 h35 a 400 km -> no (el círculo manda)", () => {
    expect(recibe(sub(400), ev(6.5, 35))).toBe(false);
  });
  it("M7.0 con min 7.5 h35 a 250 km -> si (rescate)", () => {
    expect(recibe(sub(250, { magnitudMinima: 7.5 }), ev(7.0, 35))).toBe(true);
  });
  it("el rescate respeta el círculo propio aunque el radio IV sea mayor", () => {
    expect(
      recibe(sub(150, { magnitudMinima: 7.5, radioKm: 100 }), ev(7.0, 35)),
    ).toBe(false);
  });
  it("sin centro: solo regla A", () => {
    expect(recibe(sub(null), ev(6.0, 35))).toBe(true);
    expect(recibe(sub(null), ev(5.5, 35))).toBe(false);
  });
  it.each([null, 0, Number.NaN, -10])("profundidad %s -> sin rescate", (p) => {
    expect(recibe(sub(10), ev(5.5, p))).toBe(false);
    // la regla A no depende de la profundidad
    expect(recibe(sub(10), ev(6.2, p))).toBe(true);
  });
  it("dist = 0 funciona", () => {
    expect(distanciaKm(EPI.lat, EPI.lon, EPI.lat, EPI.lon)).toBe(0);
    expect(recibe(sub(0), ev(5.0, 10))).toBe(true);
    expect(recibe(sub(0), ev(6.0, 10))).toBe(true);
    expect(recibe(sub(0), ev(5.0, 150))).toBe(false);
  });
  it("conserva el orden y filtra por suscriptor", () => {
    const a = sub(60);
    const b = sub(120);
    const c = sub(null, { magnitudMinima: 3 });
    expect(seleccionarDestinatarios([a, b, c], ev(5.5, 35))).toEqual([a, c]);
  });
});

describe("seleccionarDestinatarios (fuentes no-csn)", () => {
  const usgs = (m: number) => ev(m, 35, { fuente: "usgs" });
  it("M7 usgs: solo alcanceMundial, ignora magnitudMinima y círculo", () => {
    const si = sub(400, { alcanceMundial: true, magnitudMinima: 9 });
    const no = sub(10);
    expect(seleccionarDestinatarios([si, no], usgs(7))).toEqual([si]);
  });
  it("M6.9 usgs: nadie, aunque en csn aplicaría rescate", () => {
    expect(
      seleccionarDestinatarios([sub(10, { alcanceMundial: true })], usgs(6.9)),
    ).toEqual([]);
  });
});
