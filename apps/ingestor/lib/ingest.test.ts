import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SismoNormalizado } from "@sismos/shared";

vi.mock("@sismos/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sismos/shared")>();
  // Los fetch devuelven ya eventos normalizados; la normalización real tiene
  // sus propios tests en @sismos/shared.
  return {
    ...actual,
    normalizeCsnSismo: (x: unknown) => x,
    normalizeUsgsFeature: (x: unknown) => x,
    normalizeGaelSismo: (x: unknown) => x,
  };
});

vi.mock("@sismos/db", () => ({
  findRecentByFuentes: vi.fn(),
  findUltimoCsnPreciso: vi.fn(),
  replaceWithCsn: vi.fn(),
  reemplazarConPrecision: vi.fn(),
  actualizarAproximadoExistente: vi.fn(),
  setRefCruzada: vi.fn(),
  upsertSismo: vi.fn(),
  getUltimaAlertaEnviada: vi.fn(),
  marcarAlertaEnviada: vi.fn(),
  marcarNotificado: vi.fn(),
  registrarIngestaOk: vi.fn(),
  registrarIngestaError: vi.fn(),
}));
vi.mock("./fetch-csn", () => ({ fetchCsnRecent: vi.fn() }));
vi.mock("./fetch-gael", () => ({ fetchGaelRecent: vi.fn() }));
vi.mock("./fetch-usgs", () => ({ fetchUsgsRecent: vi.fn() }));
vi.mock("./send-push", () => ({
  enviarPushParaSismo: vi.fn(),
  enviarAlertaAdmin: vi.fn(),
}));

import * as db from "@sismos/db";
import { fetchCsnRecent } from "./fetch-csn";
import { fetchGaelRecent } from "./fetch-gael";
import { fetchUsgsRecent } from "./fetch-usgs";
import { enviarPushParaSismo } from "./send-push";
import { runIngest } from "./ingest";

type Fila = Awaited<ReturnType<typeof db.upsertSismo>>["sismo"];

const hace = (min: number) => new Date(Date.now() - min * 60_000);

function evento(p: Partial<SismoNormalizado> = {}): SismoNormalizado {
  return {
    fuente: "csn",
    externalId: "csn-1",
    fecha: hace(3),
    magnitud: 4.5,
    profundidadKm: 30,
    latitud: -33,
    longitud: -71,
    lugar: "10 km al NE de Valparaíso",
    bandera: "🇨🇱",
    ubicacionAproximada: false,
    ...p,
  };
}

function fila(p: Partial<Fila> = {}): Fila {
  return {
    id: 1,
    ...evento(),
    refCruzada: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    notificadoAt: null,
    magnitudNotificada: null,
    fuenteNotificada: null,
    ...p,
  } as Fila;
}

const m = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  m(fetchCsnRecent).mockResolvedValue([]);
  m(fetchGaelRecent).mockResolvedValue([]);
  m(fetchUsgsRecent).mockResolvedValue([]);
  m(db.findRecentByFuentes).mockResolvedValue([]);
  m(db.findUltimoCsnPreciso).mockResolvedValue(new Date());
  m(db.marcarNotificado).mockResolvedValue(undefined);
  m(enviarPushParaSismo).mockResolvedValue({ enviados: 1, fallidos: 0, eliminados: 0 });
  m(db.upsertSismo).mockImplementation(async (e: SismoNormalizado) => ({
    sismo: fila(e),
    esNuevo: true,
  }));
});

describe("runIngest: notificación", () => {
  it("(a) CSN nuevo M4.5 -> 1 push y marcarNotificado", async () => {
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(enviarPushParaSismo).toHaveBeenCalledWith(expect.anything(), {
      motivo: "nuevo",
    });
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 4.5, "csn");
  });

  it("(b) relectura sin cambio de un sismo ya notificado -> 0 push", async () => {
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    m(db.upsertSismo).mockResolvedValue({
      sismo: fila({ notificadoAt: hace(2), magnitudNotificada: 4.5 }),
      esNuevo: false,
    });
    await runIngest();
    expect(enviarPushParaSismo).not.toHaveBeenCalled();
    expect(db.marcarNotificado).not.toHaveBeenCalled();
  });

  it("Review Focus 1: M3.9 -> M4.1 en una relectura (no nuevo, sin notificar) avisa una vez", async () => {
    m(fetchCsnRecent).mockResolvedValue([evento({ magnitud: 4.1 })]);
    m(db.upsertSismo).mockResolvedValue({
      sismo: fila({ magnitud: 4.1 }),
      esNuevo: false,
    });
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 4.1, "csn");
  });

  it("Review Focus 2: M4.2 avisado y revisado a M5.8 -> re-avisa y registra la nueva magnitud", async () => {
    m(fetchCsnRecent).mockResolvedValue([evento({ magnitud: 5.8 })]);
    m(db.upsertSismo).mockResolvedValue({
      sismo: fila({
        magnitud: 5.8,
        notificadoAt: hace(2),
        magnitudNotificada: 4.2,
      }),
      esNuevo: false,
    });
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(enviarPushParaSismo).toHaveBeenCalledWith(expect.anything(), {
      motivo: "revision",
    });
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 5.8, "csn");
  });

  it("(c) Review Focus 4: si el envío falla NO se marca como notificado y la ingesta sigue", async () => {
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    m(enviarPushParaSismo).mockRejectedValue(new Error("push caído"));
    const resumen = await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).not.toHaveBeenCalled();
    expect(resumen.csn.inserted).toBe(1);
  });

  it("(d) Review Focus 3: USGS reemplazado por CSN sin notificadoAt -> 1 push, marcado sobre la fila CSN", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ fuente: "usgs", externalId: "us-1", magnitud: 4.6 }),
    ]);
    m(db.replaceWithCsn).mockResolvedValue(
      fila({ fuente: "csn", externalId: "csn-1", magnitud: 4.5 }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    const resumen = await runIngest();
    expect(db.replaceWithCsn).toHaveBeenCalledWith("us-1", expect.anything());
    expect(resumen.deduped).toBe(1);
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 4.5, "csn");
  });

  it("A1: M7.1 avisado como USGS y luego reemplazado por CSN -> 1 push a Chile sin repetir alcance mundial", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ fuente: "usgs", externalId: "us-1", magnitud: 7.1 }),
    ]);
    m(db.replaceWithCsn).mockResolvedValue(
      fila({
        externalId: "csn-1",
        magnitud: 7.1,
        notificadoAt: hace(1),
        magnitudNotificada: 7.1,
        fuenteNotificada: "usgs",
      }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento({ magnitud: 7.1 })]);
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(enviarPushParaSismo).toHaveBeenCalledWith(expect.anything(), {
      motivo: "nuevo",
      omitirAlcanceMundial: true,
    });
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 7.1, "csn");
  });

  it("A1: USGS M5 sin notificar reemplazado por CSN -> 1 push normal, sin omitirAlcanceMundial", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ fuente: "usgs", externalId: "us-1", magnitud: 5 }),
    ]);
    m(db.replaceWithCsn).mockResolvedValue(
      fila({ externalId: "csn-1", magnitud: 5 }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento({ magnitud: 5 })]);
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(enviarPushParaSismo).toHaveBeenCalledWith(expect.anything(), {
      motivo: "nuevo",
    });
  });

  it("A1: CSN ya avisado como CSN (reemplazo o relectura) -> 0 push", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ fuente: "usgs", externalId: "us-1" }),
    ]);
    m(db.replaceWithCsn).mockResolvedValue(
      fila({
        externalId: "csn-1",
        notificadoAt: hace(1),
        magnitudNotificada: 4.5,
        fuenteNotificada: "csn",
      }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    await runIngest();
    expect(enviarPushParaSismo).not.toHaveBeenCalled();
  });

  it("(e) failover GAEL con match preciso existente -> 0 push y sin escrituras", async () => {
    m(fetchCsnRecent).mockRejectedValue(new Error("xor.cl caído"));
    m(fetchGaelRecent).mockResolvedValue([
      evento({ externalId: "gael-1", ubicacionAproximada: true }),
    ]);
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ externalId: "csn-real", ubicacionAproximada: false }),
    ]);
    await runIngest();
    expect(enviarPushParaSismo).not.toHaveBeenCalled();
    expect(db.upsertSismo).not.toHaveBeenCalled();
    expect(db.actualizarAproximadoExistente).not.toHaveBeenCalled();
  });

  it("(f) CSN y GAEL caen -> no lanza, errors=1", async () => {
    m(fetchCsnRecent).mockRejectedValue(new Error("xor.cl caído"));
    m(fetchGaelRecent).mockRejectedValue(new Error("gael caído"));
    const resumen = await runIngest();
    expect(resumen.csn.errors).toBe(1);
    expect(enviarPushParaSismo).not.toHaveBeenCalled();
  });

  it("reconciliación con aproximado nunca avisado -> avisa una vez", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ externalId: "gael-1", ubicacionAproximada: true }),
    ]);
    m(db.reemplazarConPrecision).mockResolvedValue(
      fila({ externalId: "csn-1", ubicacionAproximada: false }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 4.5, "csn");
  });

  it("reconciliación con aproximado ya avisado y misma magnitud -> 0 push", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ externalId: "gael-1", ubicacionAproximada: true }),
    ]);
    m(db.reemplazarConPrecision).mockResolvedValue(
      fila({
        externalId: "csn-1",
        notificadoAt: hace(1),
        magnitudNotificada: 4.5,
      }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    await runIngest();
    expect(enviarPushParaSismo).not.toHaveBeenCalled();
  });

  it("reconciliación con aproximado ya avisado y magnitud revisada +0.7 -> re-avisa", async () => {
    m(db.findRecentByFuentes).mockResolvedValue([
      fila({ externalId: "gael-1", ubicacionAproximada: true }),
    ]);
    m(db.reemplazarConPrecision).mockResolvedValue(
      fila({
        externalId: "csn-1",
        magnitud: 5.2,
        notificadoAt: hace(1),
        magnitudNotificada: 4.5,
      }),
    );
    m(fetchCsnRecent).mockResolvedValue([evento({ magnitud: 5.2 })]);
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).toHaveBeenCalledWith("csn", "csn-1", 5.2, "csn");
  });

  it("USGS M7 nuevo -> 1 push; USGS M6 -> 0", async () => {
    m(fetchUsgsRecent).mockResolvedValue([
      evento({
        fuente: "usgs",
        externalId: "us-7",
        magnitud: 7.1,
        bandera: null,
        latitud: 10,
        longitud: 100,
      }),
      evento({
        fuente: "usgs",
        externalId: "us-6",
        magnitud: 6.0,
        bandera: null,
        latitud: -10,
        longitud: 150,
      }),
    ]);
    await runIngest();
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).toHaveBeenCalledWith("usgs", "us-7", 7.1, "usgs");
  });
});

describe("runIngest: candidatos (M6)", () => {
  it("carga los candidatos una sola vez por ciclo", async () => {
    m(fetchCsnRecent).mockResolvedValue([
      evento({ externalId: "a", latitud: -20, longitud: -70 }),
      evento({ externalId: "b", latitud: -40, longitud: -72 }),
      evento({ externalId: "c", latitud: -50, longitud: -73 }),
    ]);
    await runIngest();
    expect(db.findRecentByFuentes).toHaveBeenCalledTimes(1);
  });

  it("dos lecturas del mismo evento en un ciclo reutilizan la fila insertada (no duplican)", async () => {
    const a = evento({ externalId: "a", ubicacionAproximada: true });
    const b = evento({ externalId: "b", ubicacionAproximada: false });
    m(fetchCsnRecent).mockResolvedValue([a, b]);
    m(db.reemplazarConPrecision).mockImplementation(
      async (_id: string, e: SismoNormalizado) =>
        fila({
          ...e,
          ubicacionAproximada: false,
          notificadoAt: hace(0),
          magnitudNotificada: 4.5,
        }),
    );
    await runIngest();
    expect(db.upsertSismo).toHaveBeenCalledTimes(1);
    expect(db.reemplazarConPrecision).toHaveBeenCalledWith("a", b);
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
  });
});

describe("runIngest: estado de salud (A1)", () => {
  beforeEach(() => {
    m(db.registrarIngestaOk).mockResolvedValue(undefined);
    m(db.registrarIngestaError).mockResolvedValue(undefined);
  });

  it("corrida normal registra ok de csn, usgs", async () => {
    await runIngest();
    expect(db.registrarIngestaOk).toHaveBeenCalledWith("csn");
    expect(db.registrarIngestaOk).toHaveBeenCalledWith("usgs");
    expect(db.registrarIngestaError).not.toHaveBeenCalled();
  });

  it("CSN cae y GAEL responde: error csn, ok gael y ok csn (ingesta completó)", async () => {
    m(fetchCsnRecent).mockRejectedValue(new Error("xor caído"));
    await runIngest();
    expect(db.registrarIngestaError).toHaveBeenCalledWith("csn", "xor caído");
    expect(db.registrarIngestaOk).toHaveBeenCalledWith("gael");
    expect(db.registrarIngestaOk).toHaveBeenCalledWith("csn");
  });

  it("falla de USGS registra error usgs", async () => {
    m(fetchUsgsRecent).mockRejectedValue(new Error("usgs 500"));
    await runIngest();
    expect(db.registrarIngestaError).toHaveBeenCalledWith("usgs", "usgs 500");
  });

  it("falla de push registra error push; éxito registra ok push", async () => {
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    m(enviarPushParaSismo).mockRejectedValueOnce(new Error("vapid"));
    await runIngest();
    expect(db.registrarIngestaError).toHaveBeenCalledWith("push", "vapid");
    vi.mocked(db.registrarIngestaOk).mockClear();
    m(enviarPushParaSismo).mockResolvedValue({ enviados: 1, fallidos: 0, eliminados: 0 });
    await runIngest();
    expect(db.registrarIngestaOk).toHaveBeenCalledWith("push");
  });

  it("si registrar el estado lanza, la ingesta igual termina y notifica", async () => {
    m(db.registrarIngestaOk).mockRejectedValue(new Error("bd caída"));
    m(db.registrarIngestaError).mockRejectedValue(new Error("bd caída"));
    m(fetchUsgsRecent).mockRejectedValue(new Error("usgs 500"));
    m(fetchCsnRecent).mockResolvedValue([evento()]);
    const resumen = await runIngest();
    expect(resumen.csn.inserted).toBe(1);
    expect(enviarPushParaSismo).toHaveBeenCalledTimes(1);
    expect(db.marcarNotificado).toHaveBeenCalled();
  });
});
