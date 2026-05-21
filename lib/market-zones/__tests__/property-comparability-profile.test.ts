import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketZoneProfile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    marketZoneAlias: {
      findFirst: vi.fn(),
    },
    marketZoneRelation: {
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import type { PricingPropertyInput } from "@/lib/pricing/types";
import { buildPropertyComparabilityProfile } from "@/lib/market-zones/property-comparability-profile";

const mockProfileFindFirst = prisma.marketZoneProfile.findFirst as ReturnType<typeof vi.fn>;
const mockProfileFindMany = prisma.marketZoneProfile.findMany as ReturnType<typeof vi.fn>;
const mockAliasFindFirst = prisma.marketZoneAlias.findFirst as ReturnType<typeof vi.fn>;
const mockRelationFindMany = prisma.marketZoneRelation.findMany as ReturnType<typeof vi.fn>;

const ACTIVE_PROFILE = {
  suggestedZoneCode: "COR-IMV-1901999",
  catalogVersion: "v1.1",
  keyLoca: 224499,
  keyZona: 1901999,
  zoneNameCanonical: "Centro",
  macroArea: "Centro",
  marketSegment: "medio_alto",
  qualityProfile: "medio",
  pricingProfileStatus: "ready",
  coverageStatus: "validated",
  comparableRadiusMode: "zone_plus_mirrors",
  comparableWithZoneCodes: ["COR-IMV-1902199"],
  notComparableWithZoneCodes: ["COR-IMV-1904399"],
  priceBandM2Min: 2000,
  priceBandM2Max: 2600,
  sourceQuality: "baja",
  validationPriority: "P1_active_inventory",
  isActive: true,
  redirectToZoneCode: null,
};

const INPUT: PricingPropertyInput = {
  propertyCode: "P-1",
  precio: 200000,
  precioM2: 2500,
  metrosConstruidos: 80,
  habitaciones: 3,
  banyos: 2,
  ciudad: "Córdoba",
  zona: "Centro",
  zonaRaw: "Centro",
  keyLoca: 224499,
  keyZona: 1901999,
  tipologiaNombre: "Piso",
  keyTipo: 3,
  tipoOperacion: "sale",
  estado: "Disponible",
  fechaAlta: "2026-01-01",
  fechaActualizacion: "2026-01-10",
  latitud: null,
  longitud: null,
  extras: {
    terraza: false,
    garaje: false,
    ascensor: true,
    trastero: false,
    piscina: false,
    aireAcondicionado: false,
    calefaccion: null,
    anoConstruccion: null,
    certificadoEnergetico: null,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockProfileFindMany.mockResolvedValue([
    { suggestedZoneCode: "COR-IMV-1901999" },
    { suggestedZoneCode: "COR-IMV-1902199" },
    { suggestedZoneCode: "COR-IMV-1904399" },
  ]);
  mockRelationFindMany.mockResolvedValue([
    {
      toZoneCode: "COR-IMV-1902199",
      relationType: "comparable",
      strength: "medium",
      reason: "similar",
    },
    {
      toZoneCode: "COR-IMV-1904399",
      relationType: "not_comparable",
      strength: "strong",
      reason: "incompatible",
    },
  ]);
});

describe("buildPropertyComparabilityProfile", () => {
  it("resuelve por key_zona y devuelve perfil ready", async () => {
    mockProfileFindFirst.mockResolvedValueOnce(ACTIVE_PROFILE);

    const profile = await buildPropertyComparabilityProfile(INPUT);
    expect(profile.zoneCode).toBe("COR-IMV-1901999");
    expect(profile.resolutionMethod).toBe("key_zona");
    expect(profile.pricingProfileStatus).toBe("ready");
    expect(profile.allowedZoneCodes).toContain("COR-IMV-1902199");
    expect(profile.excludedZoneCodes).toContain("COR-IMV-1904399");
  });

  it("resuelve por alias cuando no hay key_zona", async () => {
    mockProfileFindFirst.mockImplementation(async (args: { where?: { suggestedZoneCode?: string } }) => {
      if (args?.where?.suggestedZoneCode === "COR-IMV-1901999") return ACTIVE_PROFILE;
      return null;
    });
    mockAliasFindFirst.mockResolvedValueOnce({ zoneCode: "COR-IMV-1901999" });

    const profile = await buildPropertyComparabilityProfile({
      ...INPUT,
      keyZona: null,
    });
    expect(profile.zoneCode).toBe("COR-IMV-1901999");
    expect(profile.resolutionMethod).toBe("alias");
  });

  it("aplica redirect a zona activa", async () => {
    mockProfileFindFirst.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      suggestedZoneCode: "COR-IMV-4141699",
      keyZona: 4141699,
      isActive: false,
      coverageStatus: "deprecated",
      pricingProfileStatus: "deprecated",
      redirectToZoneCode: "COR-IMV-1901999",
    });
    mockProfileFindFirst.mockResolvedValueOnce(ACTIVE_PROFILE);

    const profile = await buildPropertyComparabilityProfile({
      ...INPUT,
      keyZona: 4141699,
    });
    expect(profile.zoneCode).toBe("COR-IMV-1901999");
    expect(profile.confidenceFlags).toContain("REDIRECT_APPLIED");
  });

  it("retorna UNKNOWN_ZONE cuando no encuentra mapeo", async () => {
    mockProfileFindFirst.mockResolvedValueOnce(null);
    mockAliasFindFirst.mockResolvedValueOnce(null);
    mockProfileFindFirst.mockResolvedValueOnce(null);

    const profile = await buildPropertyComparabilityProfile({
      ...INPUT,
      keyZona: null,
      zona: "Zona inventada",
      zonaRaw: "Zona inventada",
    });
    expect(profile.zoneCode).toBeNull();
    expect(profile.pricingProfileStatus).toBe("unknown");
    expect(profile.confidenceLevel).toBe("low");
    expect(profile.allowedZoneCodes).toHaveLength(0);
  });

  it("marca heurística con confianza baja", async () => {
    mockProfileFindFirst.mockResolvedValueOnce({
      ...ACTIVE_PROFILE,
      pricingProfileStatus: "heuristic",
      coverageStatus: "known_unprofiled",
      validationPriority: "P3_no_stock",
    });

    const profile = await buildPropertyComparabilityProfile(INPUT);
    expect(profile.pricingProfileStatus).toBe("heuristic");
    expect(profile.confidenceLevel).toBe("low");
    expect(profile.confidenceFlags).toContain("HEURISTIC_PROFILE");
  });
});
