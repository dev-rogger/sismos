import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DURACION_REVELADO_MS, marcarIntroFin } from "./intro-fin";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const raiz = () => ({ dataset: {} as Record<string, string | undefined> });

describe("marcarIntroFin", () => {
  it("pone data-intro-fin y lo quita al terminar el fade, para que no se repita al navegar", () => {
    const root = raiz();
    marcarIntroFin(root);
    expect(root.dataset.introFin).toBe("1");
    vi.advanceTimersByTime(DURACION_REVELADO_MS - 1);
    expect(root.dataset.introFin).toBe("1");
    vi.advanceTimersByTime(1);
    expect(root.dataset.introFin).toBeUndefined();
  });

  it("la función devuelta cancela el temporizador", () => {
    const root = raiz();
    const cancelar = marcarIntroFin(root);
    cancelar();
    vi.advanceTimersByTime(DURACION_REVELADO_MS * 2);
    expect(root.dataset.introFin).toBe("1");
  });
});
