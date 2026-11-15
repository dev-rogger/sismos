import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../lib/auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../../lib/push-subscriptions", () => ({
  guardarSuscripcion: vi.fn(),
  eliminarSuscripcion: vi.fn(),
  obtenerSuscripcion: vi.fn(),
}));

import { guardarSuscripcion } from "../../../../lib/push-subscriptions";
import { POST } from "./route";

function peticion(endpoint: string): Request {
  return new Request("http://localhost/api/push/subscribe", {
    method: "POST",
    headers: { "x-forwarded-for": "10.0.0.1" },
    body: JSON.stringify({
      subscription: { endpoint, keys: { p256dh: "p", auth: "a" } },
      magnitudMinima: 5,
    }),
  });
}

beforeEach(() => {
  vi.mocked(guardarSuscripcion).mockReset();
});

describe("POST /api/push/subscribe: endpoint", () => {
  it.each([
    "https://evil.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com@evil.com/x",
  ])("rechaza %s con 400 y no guarda", async (endpoint) => {
    const res = await POST(peticion(endpoint));
    expect(res.status).toBe(400);
    expect(guardarSuscripcion).not.toHaveBeenCalled();
  });

  it("un endpoint permitido se guarda", async () => {
    const res = await POST(peticion("https://fcm.googleapis.com/fcm/send/abc"));
    expect(res.status).toBe(200);
    expect(guardarSuscripcion).toHaveBeenCalledTimes(1);
  });
});
