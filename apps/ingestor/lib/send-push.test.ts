import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("web-push", () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: vi.fn() },
}));
vi.mock("@sismos/db", () => ({
  findSubscripcionesParaSismo: vi.fn(),
  deletePushSubscription: vi.fn(),
}));

import webpush from "web-push";
import * as db from "@sismos/db";
import type { SismoNormalizado } from "@sismos/shared";
import { enviarAlertaAdmin, enviarPushParaSismo, topicParaSismo } from "./send-push";

const send = vi.mocked(webpush.sendNotification);
const subs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${i}`,
    keys: { p256dh: "p", auth: "a" },
  }));

const evento = (o: Partial<SismoNormalizado> = {}): SismoNormalizado =>
  ({
    fuente: "csn",
    externalId: "csn-1",
    magnitud: 5.2,
    latitud: -33.4,
    longitud: -70.6,
    profundidadKm: 30,
    lugar: "10 km al NE de Santiago",
    fecha: new Date(Date.now() - 5 * 60_000),
    ...o,
  }) as SismoNormalizado;

function payloadEnviado(i = 0) {
  return JSON.parse(send.mock.calls[i]![1] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  process.env.VAPID_SUBJECT = "mailto:a@b.cl";
  send.mockReset();
  send.mockResolvedValue({} as never);
  vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(subs(1) as never);
});

describe("enviarPushParaSismo", () => {
  it("(a) 404 y 410 borran la suscripción, 500 no", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(
      subs(4) as never,
    );
    send
      .mockRejectedValueOnce({ statusCode: 404 })
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce({} as never);
    const r = await enviarPushParaSismo(evento());
    expect(db.deletePushSubscription).toHaveBeenCalledTimes(2);
    expect(db.deletePushSubscription).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/0",
    );
    expect(db.deletePushSubscription).toHaveBeenCalledWith(
      "https://fcm.googleapis.com/fcm/send/1",
    );
    expect(r).toEqual({ enviados: 1, fallidos: 3, eliminados: 2 });
  });

  it("pasa la profundidad del sismo a la búsqueda de destinatarios", async () => {
    await enviarPushParaSismo(evento());
    expect(db.findSubscripcionesParaSismo).toHaveBeenCalledWith({
      magnitud: 5.2,
      latitud: -33.4,
      longitud: -70.6,
      profundidadKm: 30,
      fuente: "csn",
    });
  });

  it("(b) envía TTL 3600 y topic válido", async () => {
    await enviarPushParaSismo(evento());
    const opts = send.mock.calls[0]![2] as { TTL: number; topic: string };
    expect(opts.TTL).toBe(3600);
    expect(opts.topic).toBe(topicParaSismo("csn-1"));
  });

  it("(b2) el topic es siempre base64url de <=32 chars, incluso con ids raros o larguísimos", () => {
    const ids = [
      "csn-1",
      "us/7000?x=1&y=2 ñ",
      "emoji-🌋-id",
      "a".repeat(5000),
      "",
      "gael-2026-11-15 10:00:00_-33.4_-70.6",
    ];
    for (const id of ids) {
      expect(topicParaSismo(id)).toMatch(/^[A-Za-z0-9_-]{1,32}$/);
    }
    expect(topicParaSismo("a")).not.toBe(topicParaSismo("b"));
    expect(topicParaSismo("csn-1")).toBe(topicParaSismo("csn-1"));
  });

  it("(c) nunca más de 50 envíos en vuelo con 250 suscripciones", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(
      subs(250) as never,
    );
    let enVuelo = 0;
    let max = 0;
    send.mockImplementation(async () => {
      enVuelo++;
      max = Math.max(max, enVuelo);
      await new Promise((r) => setTimeout(r, 1));
      enVuelo--;
      return {} as never;
    });
    const r = await enviarPushParaSismo(evento());
    expect(max).toBeLessThanOrEqual(50);
    expect(max).toBeGreaterThan(1);
    expect(send).toHaveBeenCalledTimes(250);
    expect(r.enviados).toBe(250);
  });

  it("(d) el título de una revisión indica 'actualizado' y pide renotify; uno nuevo no", async () => {
    await enviarPushParaSismo(evento(), { motivo: "revision" });
    const rev = payloadEnviado(0);
    expect(rev.title.toLowerCase()).toContain("actualizado");
    expect(rev.renotify).toBe(true);
    send.mockClear();
    await enviarPushParaSismo(evento(), { motivo: "nuevo" });
    const nuevo = payloadEnviado(0);
    expect(nuevo.title.toLowerCase()).not.toContain("actualizado");
    expect(nuevo.renotify).toBe(false);
  });

  it("(e) la hora usa America/Santiago", async () => {
    const spy = vi.spyOn(Date.prototype, "toLocaleTimeString");
    await enviarPushParaSismo(evento());
    expect(spy).toHaveBeenCalledWith(
      "es-CL",
      expect.objectContaining({ timeZone: "America/Santiago" }),
    );
    spy.mockRestore();
  });

  it("(f) contadores correctos y tag/timestamp en el payload", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(
      subs(4) as never,
    );
    send
      .mockResolvedValueOnce({} as never)
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce(new Error("red"));
    const e = evento();
    const r = await enviarPushParaSismo(e);
    expect(r).toEqual({ enviados: 2, fallidos: 2, eliminados: 1 });
    const p = payloadEnviado(0);
    expect(p.tag).toBe("sismo-csn-1");
    expect(p.timestamp).toBe(e.fecha.getTime());
  });

  it("el cuerpo aclara que es un aviso informativo posterior al sismo", async () => {
    await enviarPushParaSismo(evento());
    const body: string = payloadEnviado(0).body;
    expect(body).toContain("Aviso informativo");
    expect(body.toLowerCase()).toContain("no es una alerta temprana");
  });

  it("sismo más viejo que el tope compartido no envía nada", async () => {
    const r = await enviarPushParaSismo(
      evento({ fecha: new Date(Date.now() - 61 * 60_000) }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(r).toEqual({ enviados: 0, fallidos: 0, eliminados: 0 });
  });
});

describe("enviarPushParaSismo: fallos de envío (A2)", () => {
  it("lanza si TODOS los envíos fallan con 5xx/red, para que el sismo no se marque como avisado", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(
      subs(3) as never,
    );
    send
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockRejectedValueOnce(new Error("red"));
    await expect(enviarPushParaSismo(evento())).rejects.toThrow(/ningún envío/);
  });

  it("fallo parcial: no lanza (algunos recibieron el aviso) y devuelve contadores", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(
      subs(3) as never,
    );
    send
      .mockRejectedValueOnce({ statusCode: 500 })
      .mockResolvedValueOnce({} as never)
      .mockRejectedValueOnce({ statusCode: 500 });
    await expect(enviarPushParaSismo(evento())).resolves.toEqual({
      enviados: 1,
      fallidos: 2,
      eliminados: 0,
    });
  });

  it("solo 404/410 (suscripciones muertas) no cuenta como fallo: no lanza", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(
      subs(2) as never,
    );
    send
      .mockRejectedValueOnce({ statusCode: 410 })
      .mockRejectedValueOnce({ statusCode: 404 });
    await expect(enviarPushParaSismo(evento())).resolves.toEqual({
      enviados: 0,
      fallidos: 2,
      eliminados: 2,
    });
  });

  it("sin suscripciones no lanza", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue([] as never);
    await expect(enviarPushParaSismo(evento())).resolves.toEqual({
      enviados: 0,
      fallidos: 0,
      eliminados: 0,
    });
  });
});

describe("enviarPushParaSismo: omitirAlcanceMundial (A1)", () => {
  const mixtas = () =>
    [
      { ...subs(1)[0]!, alcanceMundial: true },
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/solo-chile",
        keys: { p256dh: "p", auth: "a" },
        alcanceMundial: false,
      },
    ] as never;

  it("con la opción, no envía a quienes tienen alcanceMundial", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(mixtas());
    const r = await enviarPushParaSismo(evento(), {
      motivo: "nuevo",
      omitirAlcanceMundial: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/solo-chile",
    });
    expect(r.enviados).toBe(1);
  });

  it("sin la opción, envía a todos los destinatarios", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue(mixtas());
    await enviarPushParaSismo(evento());
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("si al omitir no queda nadie, no envía ni lanza", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue([
      { ...subs(1)[0]!, alcanceMundial: true },
    ] as never);
    await expect(
      enviarPushParaSismo(evento(), { omitirAlcanceMundial: true }),
    ).resolves.toEqual({ enviados: 0, fallidos: 0, eliminados: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("enviarPushParaSismo: endpoints no permitidos (B4)", () => {
  it("descarta sin enviar y borra de la BD las suscripciones con endpoint inválido", async () => {
    const malas = [
      "http://fcm.googleapis.com/x",
      "https://evil.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://user:pass@fcm.googleapis.com/x",
    ].map((endpoint) => ({ endpoint, keys: { p256dh: "p", auth: "a" } }));
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue([
      ...subs(1),
      ...malas,
    ] as never);
    const r = await enviarPushParaSismo(evento());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/0",
    });
    expect(db.deletePushSubscription).toHaveBeenCalledTimes(4);
    for (const { endpoint } of malas) {
      expect(db.deletePushSubscription).toHaveBeenCalledWith(endpoint);
    }
    expect(r.enviados).toBe(1);
  });

  it("si todas son inválidas no envía ni lanza", async () => {
    vi.mocked(db.findSubscripcionesParaSismo).mockResolvedValue([
      { endpoint: "https://evil.com/x", keys: { p256dh: "p", auth: "a" } },
    ] as never);
    await expect(enviarPushParaSismo(evento())).resolves.toEqual({
      enviados: 0,
      fallidos: 0,
      eliminados: 0,
    });
    expect(send).not.toHaveBeenCalled();
    expect(db.deletePushSubscription).toHaveBeenCalledWith("https://evil.com/x");
  });
});

describe("enviarAlertaAdmin: canal webhook", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.ALERTA_WEBHOOK_URL;
    delete process.env.ALERTA_PUSH_ENDPOINT;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ALERTA_WEBHOOK_URL;
  });

  it("sin ALERTA_WEBHOOK_URL no hace fetch ni falla", async () => {
    await expect(enviarAlertaAdmin("hola")).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con la env hace POST JSON {text} con timeout de 5 s, aunque el push no esté configurado", async () => {
    process.env.ALERTA_WEBHOOK_URL = "https://hooks.example.com/abc";
    await enviarAlertaAdmin("CSN caído");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://hooks.example.com/abc");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body).text).toContain("CSN caído");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("no lanza si el webhook falla o responde error, y no loguea la URL", async () => {
    process.env.ALERTA_WEBHOOK_URL = "https://hooks.example.com/token-secreto";
    fetchMock.mockRejectedValueOnce(new Error("timeout token-secreto"));
    await expect(enviarAlertaAdmin("x")).resolves.toBeUndefined();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(enviarAlertaAdmin("x")).resolves.toBeUndefined();
    const logs = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logs).not.toContain("token-secreto");
  });

  it("un fallo del push no impide el webhook", async () => {
    process.env.ALERTA_WEBHOOK_URL = "https://hooks.example.com/abc";
    process.env.ALERTA_PUSH_ENDPOINT = "https://fcm.googleapis.com/x";
    process.env.ALERTA_PUSH_P256DH = "p";
    process.env.ALERTA_PUSH_AUTH = "a";
    send.mockRejectedValueOnce(new Error("push caído"));
    await enviarAlertaAdmin("x");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    delete process.env.ALERTA_PUSH_ENDPOINT;
    delete process.env.ALERTA_PUSH_P256DH;
    delete process.env.ALERTA_PUSH_AUTH;
  });
});
