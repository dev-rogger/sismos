import { describe, it, expect } from "vitest";
import { decidirNotificacion } from "./decision-notificacion";

const ahora = new Date("2026-11-15T12:00:00Z");
const hace = (min: number) => new Date(ahora.getTime() - min * 60_000);
const base = {
  fuente: "csn" as const,
  fecha: hace(5),
  notificadoAt: null,
  magnitudNotificada: null,
  ahora,
};

describe("decidirNotificacion", () => {
  it("M3.9 que sube a M4.1 sin notificar envía 'nuevo'", () => {
    expect(decidirNotificacion({ ...base, magnitud: 3.9 }).enviar).toBe(false);
    expect(decidirNotificacion({ ...base, magnitud: 4.1 })).toEqual({
      enviar: true,
      motivo: "nuevo",
    });
  });

  it("M4.2 ya notificado revisado a M5.8 envía 'revision'", () => {
    expect(
      decidirNotificacion({
        ...base,
        magnitud: 5.8,
        notificadoAt: hace(4),
        magnitudNotificada: 4.2,
      }),
    ).toEqual({ enviar: true, motivo: "revision" });
  });

  it("M4.2 -> M4.4 no re-avisa", () => {
    expect(
      decidirNotificacion({
        ...base,
        magnitud: 4.4,
        notificadoAt: hace(4),
        magnitudNotificada: 4.2,
      }).enviar,
    ).toBe(false);
  });

  it("sismo de 90 min no se avisa", () => {
    expect(
      decidirNotificacion({ ...base, magnitud: 6, fecha: hace(90) }).enviar,
    ).toBe(false);
  });

  it("USGS M6 no, M7 sí", () => {
    expect(
      decidirNotificacion({ ...base, fuente: "usgs", magnitud: 6 }).enviar,
    ).toBe(false);
    expect(
      decidirNotificacion({ ...base, fuente: "usgs", magnitud: 7 }),
    ).toEqual({ enviar: true, motivo: "nuevo" });
  });

  it("ya notificado sin cambio no envía", () => {
    expect(
      decidirNotificacion({
        ...base,
        magnitud: 4.5,
        notificadoAt: hace(4),
        magnitudNotificada: 4.5,
      }).enviar,
    ).toBe(false);
  });

  it("notificado sin magnitud registrada no re-avisa", () => {
    expect(
      decidirNotificacion({
        ...base,
        magnitud: 6,
        notificadoAt: hace(4),
        magnitudNotificada: null,
      }).enviar,
    ).toBe(false);
  });

  it("revisión también respeta el tope de antigüedad", () => {
    expect(
      decidirNotificacion({
        ...base,
        magnitud: 6,
        fecha: hace(90),
        notificadoAt: hace(80),
        magnitudNotificada: 4.2,
      }).enviar,
    ).toBe(false);
  });
});
