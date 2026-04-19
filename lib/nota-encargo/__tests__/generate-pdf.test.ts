import { describe, expect, it } from "vitest";
import { generateNotaEncargoPdf, type NotaEncargoData } from "../generate-pdf";

function makeData(overrides: Partial<NotaEncargoData> = {}): NotaEncargoData {
  return {
    nombre: "Juan García López",
    dni: "12345678A",
    telefono: "666777888",
    domicilioFiscal: "Calle Mayor 1, 14001 Córdoba",
    direccion: "Calle DE LOS FLAMENCOS, 8, La Carlota, Córdoba, 14111",
    tipoOperacion: "VENTA",
    precio: 275000,
    duracionMeses: 6,
    tipoNota: "N2",
    aceptaLopd: true,
    fecha: new Date("2026-04-16T16:00:00Z"),
    hora: "16:00",
    agente: "Miguel Angel Carrillo Ramos",
    ...overrides,
  };
}

describe("generateNotaEncargoPdf", () => {
  it("generates a valid PDF buffer", async () => {
    const buffer = await generateNotaEncargoPdf(makeData());

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("generates PDF for ALQUILER type", async () => {
    const buffer = await generateNotaEncargoPdf(
      makeData({ tipoOperacion: "ALQUILER", precio: 800 }),
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("generates PDF for N1 nota type", async () => {
    const buffer = await generateNotaEncargoPdf(
      makeData({ tipoNota: "N1" }),
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("generates PDF for N3 nota type", async () => {
    const buffer = await generateNotaEncargoPdf(
      makeData({ tipoNota: "N3" }),
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("generates PDF with LOPD not accepted", async () => {
    const buffer = await generateNotaEncargoPdf(
      makeData({ aceptaLopd: false }),
    );

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("produces different sizes for different data", async () => {
    const short = await generateNotaEncargoPdf(
      makeData({ nombre: "A", domicilioFiscal: "B" }),
    );
    const long = await generateNotaEncargoPdf(
      makeData({
        nombre: "Juan García López de Mendoza y Fernández",
        domicilioFiscal:
          "Calle Extraordinariamente Larga del Paseo Marítimo de la Costa del Sol, número 123, piso 4, puerta C, 29640 Fuengirola, Málaga",
      }),
    );

    expect(short.length).not.toBe(long.length);
  });
});
