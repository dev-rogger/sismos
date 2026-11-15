import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sismos/db", () => ({ getEstadoIngesta: vi.fn() }));

import * as db from "@sismos/db";
import { GET } from "./route";

const estado = vi.mocked(db.getEstadoIngesta);
const hace = (seg: number) => new Date(Date.now() - seg * 1000);
const fila = (fuente: string, ultimoOk: Date | null, extra = {}) => ({
  fuente,
  ultimoOk,
  ultimoError: null,
  ultimoErrorMsg: null,
  ...extra,
});

beforeEach(() => vi.resetAllMocks());

describe("GET /api/health", () => {
  it("200 si csn tuvo ok hace menos de 15 min", async () => {
    estado.mockResolvedValue([fila("csn", hace(60)), fila("usgs", hace(120))]);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.fuentes.csn.edadSegundos).toBeGreaterThanOrEqual(60);
    expect(body.fuentes.csn.edadSegundos).toBeLessThan(65);
  });

  it("503 si csn tiene ultimo_ok mayor a 15 min", async () => {
    estado.mockResolvedValue([fila("csn", hace(16 * 60))]);
    const res = await GET();
    expect(res.status).toBe(503);
    expect((await res.json()).ok).toBe(false);
  });

  it("503 si no hay filas", async () => {
    estado.mockResolvedValue([]);
    expect((await GET()).status).toBe(503);
  });

  it("503 si csn no tiene ultimo_ok (solo error)", async () => {
    estado.mockResolvedValue([fila("csn", null, { ultimoError: hace(5) })]);
    expect((await GET()).status).toBe(503);
  });

  it("503 si la BD no responde, sin filtrar el mensaje de error", async () => {
    estado.mockRejectedValue(new Error("password authentication failed"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("password");
  });

  it("no expone mensajes de error ni timestamps crudos", async () => {
    estado.mockResolvedValue([
      fila("csn", hace(10), {
        ultimoError: hace(5),
        ultimoErrorMsg: "secreto interno postgres://u:p@h",
      }),
    ]);
    const texto = JSON.stringify(await (await GET()).json());
    expect(texto).not.toContain("secreto");
    expect(texto).not.toContain("postgres");
    expect(texto).not.toContain("T"); // sin ISO timestamps
  });
});
