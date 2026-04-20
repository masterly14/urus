import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PricingDataIncompleteError,
  PricingNotEligibleError,
} from "@/lib/pricing/types";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertyCurrent: {
      findUnique: vi.fn(),
    },
    propertySnapshot: {
      findUnique: vi.fn(),
    },
    inmovillaEnumTipo: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { extractPropertyForPricing } from "@/lib/pricing/extract-property";

const mockPropertyCurrent = prisma.propertyCurrent.findUnique as ReturnType<typeof vi.fn>;
const mockPropertySnapshot = prisma.propertySnapshot.findUnique as ReturnType<typeof vi.fn>;
const mockEnumTipo = (prisma as unknown as { inmovillaEnumTipo: { findFirst: ReturnType<typeof vi.fn> } }).inmovillaEnumTipo.findFirst;

beforeEach(() => {
  vi.clearAllMocks();
});

const BASE_PROPERTY = {
  codigo: "12345",
  ref: "REF-001",
  titulo: "Piso en centro",
  tipoOfer: "3",
  precio: 150000,
  metrosConstruidos: 85,
  habitaciones: 3,
  banyos: 1,
  ciudad: "Córdoba",
  zona: "Centro",
  estado: "Disponible",
  fechaAlta: "2026-01-01",
  fechaActualizacion: "2026-03-01",
  numFotos: 10,
  agente: "agent1",
  lastEventId: "ev-1",
  lastEventPosition: BigInt(1),
  lastEventAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("extractPropertyForPricing", () => {
  it("extrae variables correctamente de un inmueble completo", async () => {
    mockPropertyCurrent.mockResolvedValue(BASE_PROPERTY);
    mockPropertySnapshot.mockResolvedValue({
      raw: { keyacci: 1, terraza: true, ascensor: true, piscina: false },
    });
    mockEnumTipo.mockResolvedValue({ nombre: "Piso" });

    const result = await extractPropertyForPricing("12345");

    expect(result.propertyCode).toBe("12345");
    expect(result.precio).toBe(150000);
    expect(result.precioM2).toBe(Math.round(150000 / 85));
    expect(result.metrosConstruidos).toBe(85);
    expect(result.ciudad).toBe("Córdoba");
    expect(result.tipologiaNombre).toBe("Piso");
    expect(result.keyTipo).toBe(3);
    expect(result.tipoOperacion).toBe("sale");
    expect(result.extras.terraza).toBe(true);
    expect(result.extras.ascensor).toBe(true);
    expect(result.extras.piscina).toBe(false);
  });

  it("lanza PricingDataIncompleteError si no se encuentra la propiedad", async () => {
    mockPropertyCurrent.mockResolvedValue(null);

    await expect(extractPropertyForPricing("999")).rejects.toThrow(PricingDataIncompleteError);
  });

  it("lanza PricingDataIncompleteError si faltan datos críticos (precio = 0)", async () => {
    mockPropertyCurrent.mockResolvedValue({ ...BASE_PROPERTY, precio: 0 });

    await expect(extractPropertyForPricing("12345")).rejects.toThrow(PricingDataIncompleteError);
    try {
      await extractPropertyForPricing("12345");
    } catch (err) {
      expect((err as PricingDataIncompleteError).missingFields).toContain("precio");
    }
  });

  it("lanza PricingDataIncompleteError si faltan metros", async () => {
    mockPropertyCurrent.mockResolvedValue({ ...BASE_PROPERTY, metrosConstruidos: 0 });

    await expect(extractPropertyForPricing("12345")).rejects.toThrow(PricingDataIncompleteError);
  });

  it("lanza PricingDataIncompleteError si falta ciudad", async () => {
    mockPropertyCurrent.mockResolvedValue({ ...BASE_PROPERTY, ciudad: "" });

    await expect(extractPropertyForPricing("12345")).rejects.toThrow(PricingDataIncompleteError);
  });

  it("lanza PricingDataIncompleteError si falta zona", async () => {
    mockPropertyCurrent.mockResolvedValue({ ...BASE_PROPERTY, zona: "" });

    await expect(extractPropertyForPricing("12345")).rejects.toThrow(PricingDataIncompleteError);
    try {
      await extractPropertyForPricing("12345");
    } catch (err) {
      expect((err as PricingDataIncompleteError).missingFields).toContain("zona");
    }
  });

  it("lanza PricingNotEligibleError si la ciudad no es Córdoba", async () => {
    mockPropertyCurrent.mockResolvedValue({ ...BASE_PROPERTY, ciudad: "Sevilla" });

    await expect(extractPropertyForPricing("12345")).rejects.toThrow(PricingNotEligibleError);
  });

  it("resuelve tipoOperacion rent si keyacci = 2", async () => {
    mockPropertyCurrent.mockResolvedValue(BASE_PROPERTY);
    mockPropertySnapshot.mockResolvedValue({ raw: { keyacci: 2 } });
    mockEnumTipo.mockResolvedValue({ nombre: "Piso" });

    const result = await extractPropertyForPricing("12345");
    expect(result.tipoOperacion).toBe("rent");
  });

  it("funciona sin snapshot raw (extras vacíos)", async () => {
    mockPropertyCurrent.mockResolvedValue(BASE_PROPERTY);
    mockPropertySnapshot.mockResolvedValue(null);
    mockEnumTipo.mockResolvedValue({ nombre: "Piso" });

    const result = await extractPropertyForPricing("12345");
    expect(result.extras.terraza).toBe(false);
    expect(result.extras.garaje).toBe(false);
  });

  it("usa nombre desde raw.tipo si catálogo no resuelve", async () => {
    mockPropertyCurrent.mockResolvedValue({ ...BASE_PROPERTY, tipoOfer: "999" });
    mockPropertySnapshot.mockResolvedValue({ raw: { tipo: "Loft" } });
    mockEnumTipo.mockResolvedValue(null);

    const result = await extractPropertyForPricing("12345");
    expect(result.tipologiaNombre).toBe("Loft");
  });
});
