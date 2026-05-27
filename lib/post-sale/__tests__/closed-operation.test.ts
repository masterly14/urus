import { describe, it, expect } from "vitest";
import {
  isClosedOperation,
  CLOSED_OPERATION_KEYWORDS,
} from "../closed-operation";

describe("CLOSED_OPERATION_KEYWORDS", () => {
  it("contiene los keywords esperados", () => {
    expect(CLOSED_OPERATION_KEYWORDS).toContain("vendid");
    expect(CLOSED_OPERATION_KEYWORDS).toContain("alquilad");
    expect(CLOSED_OPERATION_KEYWORDS).toContain("traspaso");
    expect(CLOSED_OPERATION_KEYWORDS).toContain("cerrada_venta");
    expect(CLOSED_OPERATION_KEYWORDS).toContain("cerrada_alquiler");
    expect(CLOSED_OPERATION_KEYWORDS).toHaveLength(5);
  });
});

describe("isClosedOperation — estados reales de Inmovilla (estadoficha)", () => {
  it.each([
    ["Vendida", 3],
    ["Alquilada", 2],
    ["Traspaso", 6],
    ["Vendida por Otros", 11],
    ["Alquilada por Otros", 10],
    ["Vendida MLS", 14],
    ["Alquilada MLS", 13],
    ["Vendida Particular", 21],
    ["Alquilada Particular", 22],
  ])("detecta '%s' (estadoficha=%i) como operación cerrada", (estado) => {
    expect(isClosedOperation(estado)).toBe(true);
  });

  it.each([
    ["Libre", 1],
    ["Señalizada", 4],
    ["No Libre", 5],
    ["Reservado", 7],
    ["En Trámites", 8],
    ["Sólo Seguimiento", 9],
    ["Solo Publicar", 12],
    ["Okupada", 15],
    ["Alquiler Social", 16],
    ["Tapiada", 17],
    ["Ofertada", 18],
    ["Contrato Arras", 19],
    ["Fin de Encargo", 20],
    ["Descartada", 23],
    ["Es inmobiliaria", 32],
    ["Sin Revisar", 34],
    ["Fuera de Mercado", 35],
    ["Descartado", 36],
    ["Ya No Venden", 37],
    ["Ya No Alquilan", 38],
    ["Reservada MLS", 40],
    ["Ofertada MLS", 41],
    ["Pendiente de Firma", 42],
    ["Fuera de Mercado", 43],
  ])("NO detecta '%s' (estadoficha=%i) como operación cerrada", (estado) => {
    expect(isClosedOperation(estado)).toBe(false);
  });

  it("es case-insensitive", () => {
    expect(isClosedOperation("vEnDiDa")).toBe(true);
    expect(isClosedOperation("ALQUILADA")).toBe(true);
    expect(isClosedOperation("TRASPASO")).toBe(true);
  });

  it("detecta variantes con sufijos o prefijos", () => {
    expect(isClosedOperation("Vendida por particular")).toBe(true);
    expect(isClosedOperation("Alquilada temporalmente")).toBe(true);
  });

  it("string vacío no es cierre", () => {
    expect(isClosedOperation("")).toBe(false);
  });
});

describe("isClosedOperation — estados internos de Operaciones v2", () => {
  it.each([
    "CERRADA_VENTA",
    "CERRADA_ALQUILER",
    "CERRADA_TRASPASO",
  ])("detecta '%s' como operación cerrada", (estado) => {
    expect(isClosedOperation(estado)).toBe(true);
  });

  it("no detecta cancelaciones manuales como cierre con facturación", () => {
    expect(isClosedOperation("CANCELADA")).toBe(false);
  });
});
