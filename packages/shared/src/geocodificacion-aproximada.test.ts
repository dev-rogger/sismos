import { describe, it, expect } from "vitest";
import {
  parsearReferenciaGeografica,
  calcularDestino,
  geocodificarAproximado,
} from "./geocodificacion-aproximada";
import { haversineDistanceKm } from "./dedupe";

describe("parsearReferenciaGeografica", () => {
  it("parsea distancia, dirección y localidad", () => {
    expect(parsearReferenciaGeografica("38 km al O de Valparaíso")).toEqual({
      distanciaKm: 38,
      direccion: "O",
      localidad: "Valparaíso",
    });
  });

  it("parsea localidades de dos palabras", () => {
    expect(
      parsearReferenciaGeografica("54 km al SO de Mina Collahuasi"),
    ).toEqual({
      distanciaKm: 54,
      direccion: "SO",
      localidad: "Mina Collahuasi",
    });
  });

  it("devuelve null si el texto no matchea el patrón", () => {
    expect(parsearReferenciaGeografica("South Atlantic Ocean")).toBeNull();
  });
});

describe("calcularDestino", () => {
  it("el punto calculado queda a la distancia esperada del origen", () => {
    const origen = { lat: -33.047, lon: -71.612 }; // Valparaíso
    const destino = calcularDestino(origen, "O", 38);
    const distancia = haversineDistanceKm(
      origen.lat,
      origen.lon,
      destino.lat,
      destino.lon,
    );
    expect(distancia).toBeCloseTo(38, 0);
    expect(destino.lon).toBeLessThan(origen.lon);
  });

  it("una distancia al norte aumenta la latitud", () => {
    const origen = { lat: -33.047, lon: -71.612 };
    const destino = calcularDestino(origen, "N", 20);
    expect(destino.lat).toBeGreaterThan(origen.lat);
  });
});

describe("geocodificarAproximado", () => {
  it("geocodifica una referencia conocida", () => {
    expect(geocodificarAproximado("38 km al O de Valparaíso")).not.toBeNull();
  });

  it("devuelve null si la localidad no está en el diccionario", () => {
    expect(geocodificarAproximado("100 km al N de Narnia")).toBeNull();
  });

  it("devuelve null si el texto no matchea el patrón", () => {
    expect(geocodificarAproximado("South Atlantic Ocean")).toBeNull();
  });
});
