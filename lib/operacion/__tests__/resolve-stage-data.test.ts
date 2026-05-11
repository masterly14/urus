import { describe, it, expect, vi } from "vitest";
import type { Operacion } from "@prisma/client";
import type { Cliente, PropiedadCompleta } from "@/lib/inmovilla/rest/types";
import type {
  ExtractionDeps,
  NeonDemandSource,
  NeonPropertySource,
} from "@/lib/contracts/extraction/shared";
import { resolveStageDataForOperacion } from "../resolve-stage-data";

function makeDeps(overrides: Partial<ExtractionDeps> = {}): ExtractionDeps {
  return {
    getDemandFromNeon: overrides.getDemandFromNeon ?? vi.fn().mockResolvedValue(null),
    getPropertyFromNeon: overrides.getPropertyFromNeon ?? vi.fn().mockResolvedValue(null),
    getInmovillaProperty: overrides.getInmovillaProperty ?? vi.fn().mockResolvedValue(null),
    getInmovillaClient: overrides.getInmovillaClient ?? vi.fn().mockResolvedValue(null),
  };
}

const baseOperacion: Pick<
  Operacion,
  "propertyCode" | "demandId" | "buyerClientId" | "sellerClientId"
> = {
  propertyCode: "P-001",
  demandId: "DEM-001",
  buyerClientId: null,
  sellerClientId: null,
};

const buyerClient: Cliente = {
  cod_cli: 555,
  nombre: "Juan",
  apellidos: "García López",
  nif: "12345678A",
  calle: "Mayor",
  numero: "10",
  planta: "3",
  puerta: "B",
  cp: "28013",
  localidad: "Madrid",
  provincia: "Madrid",
};

const sellerClient: Cliente = {
  cod_cli: 999,
  nombre: "Lucía",
  apellidos: "Martínez Pérez",
  nif: "87654321Z",
  calle: "Goya",
  numero: "5",
  cp: "28001",
  localidad: "Madrid",
  provincia: "Madrid",
};

const inmovillaProperty: PropiedadCompleta = {
  cod_ofer: 1,
  calle: "Calle Falsa",
  numero: 123,
  planta: 2,
  rcatastral: "1234567AB1234N0001XR",
  localidad: "Madrid",
  ciudad: "Madrid",
  keycli: 999,
};

const neonDemand: NeonDemandSource = {
  codigo: "DEM-001",
  nombre: "Juan García",
  agente: "A1",
  raw: { keycli: 555 },
};

const neonProperty: NeonPropertySource = {
  codigo: "P-001",
  ciudad: "Madrid",
  titulo: "Piso en Madrid",
  raw: { propietario: "Lucía Martínez" },
};

describe("resolveStageDataForOperacion — OFERTA_FIRME", () => {
  it("populates buyer and property when everything is found in Inmovilla / Neon", async () => {
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(neonDemand),
      getPropertyFromNeon: vi.fn().mockResolvedValue(neonProperty),
      getInmovillaProperty: vi.fn().mockResolvedValue(inmovillaProperty),
      getInmovillaClient: vi.fn().mockResolvedValue(buyerClient),
    });

    const result = await resolveStageDataForOperacion({
      operacion: baseOperacion,
      targetEstado: "OFERTA_FIRME",
      deps,
    });

    expect(result.buyer?.fullName).toBe("Juan García López");
    expect(result.buyer?.nationalId).toBe("12345678A");
    expect(result.buyer?.fiscalAddress).toContain("Mayor");
    expect(result.buyers).toHaveLength(1);
    expect(result.property?.addressLine).toContain("Calle Falsa");
    expect(result.property?.cadastralReference).toBe("1234567AB1234N0001XR");
    expect(result.sellers).toBeUndefined();
  });

  it("does not include `buyer` when the Inmovilla client cannot be resolved and there is no fallback name", async () => {
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(null),
      getPropertyFromNeon: vi.fn().mockResolvedValue(null),
      getInmovillaProperty: vi.fn().mockResolvedValue(null),
      getInmovillaClient: vi.fn().mockResolvedValue(null),
    });
    const result = await resolveStageDataForOperacion({
      operacion: { ...baseOperacion, demandId: null },
      targetEstado: "OFERTA_FIRME",
      deps,
    });
    expect(result.buyer).toBeUndefined();
    expect(result.buyers).toBeUndefined();
    expect(result.property).toBeUndefined();
  });

  it("prefers `operacion.buyerClientId` over the demand snapshot when available", async () => {
    const getInmovillaClient = vi.fn().mockResolvedValue(buyerClient);
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(neonDemand),
      getPropertyFromNeon: vi.fn().mockResolvedValue(neonProperty),
      getInmovillaProperty: vi.fn().mockResolvedValue(inmovillaProperty),
      getInmovillaClient,
    });

    await resolveStageDataForOperacion({
      operacion: { ...baseOperacion, buyerClientId: "777" },
      targetEstado: "OFERTA_FIRME",
      deps,
    });

    expect(getInmovillaClient).toHaveBeenCalledWith(777);
  });

  it("ignores non-numeric buyerClientId (cuid-like) and falls back to demand raw", async () => {
    const getInmovillaClient = vi.fn().mockResolvedValue(buyerClient);
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(neonDemand),
      getPropertyFromNeon: vi.fn().mockResolvedValue(neonProperty),
      getInmovillaProperty: vi.fn().mockResolvedValue(inmovillaProperty),
      getInmovillaClient,
    });

    await resolveStageDataForOperacion({
      operacion: { ...baseOperacion, buyerClientId: "clxyz_not_numeric" },
      targetEstado: "OFERTA_FIRME",
      deps,
    });

    expect(getInmovillaClient).toHaveBeenCalledWith(555);
  });

  it("does NOT resolve a seller for OFERTA_FIRME (sellers not needed)", async () => {
    const getInmovillaClient = vi.fn().mockResolvedValue(buyerClient);
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(neonDemand),
      getPropertyFromNeon: vi.fn().mockResolvedValue(neonProperty),
      getInmovillaProperty: vi.fn().mockResolvedValue(inmovillaProperty),
      getInmovillaClient,
    });

    await resolveStageDataForOperacion({
      operacion: { ...baseOperacion, sellerClientId: "999" },
      targetEstado: "OFERTA_FIRME",
      deps,
    });

    // Only the buyer call (cod_cli=555) should fire; seller resolution is skipped.
    expect(getInmovillaClient).toHaveBeenCalledTimes(1);
    expect(getInmovillaClient).toHaveBeenCalledWith(555);
  });
});

describe("resolveStageDataForOperacion — ARRAS", () => {
  it("populates buyers AND sellers when both are found in Inmovilla", async () => {
    const getInmovillaClient = vi.fn((cod: number) => {
      if (cod === 555) return Promise.resolve(buyerClient);
      if (cod === 999) return Promise.resolve(sellerClient);
      return Promise.resolve(null);
    });
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(neonDemand),
      getPropertyFromNeon: vi.fn().mockResolvedValue(neonProperty),
      getInmovillaProperty: vi.fn().mockResolvedValue(inmovillaProperty),
      getInmovillaClient,
    });

    const result = await resolveStageDataForOperacion({
      operacion: baseOperacion,
      targetEstado: "ARRAS",
      deps,
    });

    expect(result.buyers).toHaveLength(1);
    expect(result.buyers?.[0].fullName).toBe("Juan García López");
    expect(result.sellers).toHaveLength(1);
    expect(result.sellers?.[0].fullName).toBe("Lucía Martínez Pérez");
    expect(result.sellers?.[0].nationalId).toBe("87654321Z");
  });

  it("uses operacion.sellerClientId when set, instead of the property's keycli", async () => {
    const getInmovillaClient = vi.fn((cod: number) => {
      if (cod === 555) return Promise.resolve(buyerClient);
      if (cod === 12345) return Promise.resolve(sellerClient);
      return Promise.resolve(null);
    });
    const deps = makeDeps({
      getDemandFromNeon: vi.fn().mockResolvedValue(neonDemand),
      getPropertyFromNeon: vi.fn().mockResolvedValue(neonProperty),
      getInmovillaProperty: vi.fn().mockResolvedValue(inmovillaProperty),
      getInmovillaClient,
    });

    await resolveStageDataForOperacion({
      operacion: { ...baseOperacion, sellerClientId: "12345" },
      targetEstado: "ARRAS",
      deps,
    });

    expect(getInmovillaClient).toHaveBeenCalledWith(555);
    expect(getInmovillaClient).toHaveBeenCalledWith(12345);
  });
});
