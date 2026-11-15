import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("../../../lib/ingest", () => ({ runIngest: vi.fn() }));

import { runIngest } from "../../../lib/ingest";
import { GET } from "./route";

const run = vi.mocked(runIngest);
const SUMMARY = {
  csn: { fetched: 1, inserted: 0, errors: 0 },
  usgs: { fetched: 0, inserted: 0, errors: 0 },
  deduped: 0,
};

const req = (headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost/api/ingest", { headers });

beforeEach(() => {
  vi.resetAllMocks();
  run.mockResolvedValue(SUMMARY);
  vi.stubEnv("CRON_SECRET", "s3cret-largo");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("GET /api/ingest", () => {
  it("acepta x-cron-secret correcto", async () => {
    const res = await GET(req({ "x-cron-secret": "s3cret-largo" }));
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("acepta Authorization Bearer correcto (Vercel Cron)", async () => {
    const res = await GET(req({ authorization: "Bearer s3cret-largo" }));
    expect(res.status).toBe(200);
  });

  it("401 con secreto incorrecto de la misma longitud", async () => {
    const res = await GET(req({ "x-cron-secret": "s3cret-larga" }));
    expect(res.status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("401 con secreto de longitud distinta (sin lanzar)", async () => {
    expect((await GET(req({ "x-cron-secret": "corto" }))).status).toBe(401);
    expect((await GET(req({ authorization: "Bearer x" }))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("401 sin cabeceras", async () => {
    expect((await GET(req())).status).toBe(401);
  });

  it("401 si CRON_SECRET no está definido, aunque la cabecera venga vacía o 'undefined'", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req({ "x-cron-secret": "" }))).status).toBe(401);
    expect(
      (await GET(req({ authorization: "Bearer undefined" }))).status,
    ).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("500 si runIngest lanza", async () => {
    run.mockRejectedValue(new Error("boom"));
    const res = await GET(req({ "x-cron-secret": "s3cret-largo" }));
    expect(res.status).toBe(500);
  });
});
