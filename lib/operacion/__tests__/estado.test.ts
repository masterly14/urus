import { describe, it, expect } from "vitest";
import { mapEstadoFichaToOperacionEstado, isEstadoCerrado } from "../estado";

describe("mapEstadoFichaToOperacionEstado", () => {
  it("maps 'Ofertada' (valor 18) to OFERTA_FIRME", () => {
    expect(mapEstadoFichaToOperacionEstado("Ofertada")).toBe("OFERTA_FIRME");
  });

  it("maps 'Ofertada MLS' (valor 41) to OFERTA_FIRME", () => {
    expect(mapEstadoFichaToOperacionEstado("Ofertada MLS")).toBe("OFERTA_FIRME");
  });

  it("maps 'Señalizada' to RESERVA", () => {
    expect(mapEstadoFichaToOperacionEstado("Señalizada")).toBe("RESERVA");
  });

  it("maps 'Reservado' to RESERVA", () => {
    expect(mapEstadoFichaToOperacionEstado("Reservado")).toBe("RESERVA");
  });

  it("maps 'Reservada MLS' to RESERVA", () => {
    expect(mapEstadoFichaToOperacionEstado("Reservada MLS")).toBe("RESERVA");
  });

  it("maps 'Contrato Arras' to ARRAS", () => {
    expect(mapEstadoFichaToOperacionEstado("Contrato Arras")).toBe("ARRAS");
  });

  it("maps 'Pendiente de Firma' to PENDIENTE_FIRMA", () => {
    expect(mapEstadoFichaToOperacionEstado("Pendiente de Firma")).toBe("PENDIENTE_FIRMA");
  });

  it("maps 'Vendida' to CERRADA_VENTA", () => {
    expect(mapEstadoFichaToOperacionEstado("Vendida")).toBe("CERRADA_VENTA");
  });

  it("maps 'Vendida por Otros' to CERRADA_VENTA", () => {
    expect(mapEstadoFichaToOperacionEstado("Vendida por Otros")).toBe("CERRADA_VENTA");
  });

  it("maps 'Vendida MLS' to CERRADA_VENTA", () => {
    expect(mapEstadoFichaToOperacionEstado("Vendida MLS")).toBe("CERRADA_VENTA");
  });

  it("maps 'Alquilada' to CERRADA_ALQUILER", () => {
    expect(mapEstadoFichaToOperacionEstado("Alquilada")).toBe("CERRADA_ALQUILER");
  });

  it("maps 'Alquilada por Otros' to CERRADA_ALQUILER", () => {
    expect(mapEstadoFichaToOperacionEstado("Alquilada por Otros")).toBe("CERRADA_ALQUILER");
  });

  it("maps 'Traspaso' to CERRADA_TRASPASO", () => {
    expect(mapEstadoFichaToOperacionEstado("Traspaso")).toBe("CERRADA_TRASPASO");
  });

  it("returns null for non-mappable states", () => {
    expect(mapEstadoFichaToOperacionEstado("Libre")).toBeNull();
    expect(mapEstadoFichaToOperacionEstado("No Libre")).toBeNull();
    expect(mapEstadoFichaToOperacionEstado("En Trámites")).toBeNull();
    expect(mapEstadoFichaToOperacionEstado("Fin de Encargo")).toBeNull();
    expect(mapEstadoFichaToOperacionEstado("Descartada")).toBeNull();
  });

  it("is case insensitive", () => {
    expect(mapEstadoFichaToOperacionEstado("OFERTADA")).toBe("OFERTA_FIRME");
    expect(mapEstadoFichaToOperacionEstado("vendida")).toBe("CERRADA_VENTA");
    expect(mapEstadoFichaToOperacionEstado("CONTRATO ARRAS")).toBe("ARRAS");
  });

  it("'Ofertada' matches before 'Reservado' (order matters)", () => {
    expect(mapEstadoFichaToOperacionEstado("Ofertada")).toBe("OFERTA_FIRME");
  });
});

describe("isEstadoCerrado (deprecated, delegates to isTerminal)", () => {
  it("returns true for closed states including CANCELADA", () => {
    expect(isEstadoCerrado("CERRADA_VENTA")).toBe(true);
    expect(isEstadoCerrado("CERRADA_ALQUILER")).toBe(true);
    expect(isEstadoCerrado("CERRADA_TRASPASO")).toBe(true);
    expect(isEstadoCerrado("CANCELADA")).toBe(true);
  });

  it("returns false for active states", () => {
    expect(isEstadoCerrado("EN_CURSO")).toBe(false);
    expect(isEstadoCerrado("OFERTA_FIRME")).toBe(false);
    expect(isEstadoCerrado("ARRAS")).toBe(false);
  });
});
