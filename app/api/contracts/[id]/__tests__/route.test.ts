import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    legalDocument: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-store", () => ({
  getEventsByAggregate: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getEventsByAggregate } from "@/lib/event-store";
import { GET as getContract } from "../route";
import { GET as getVersions } from "../versions/route";

const mockFindUnique = vi.mocked(prisma.legalDocument.findUnique);
const mockGetEventsByAggregate = vi.mocked(getEventsByAggregate);

describe("GET /api/contracts/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el detalle real normalizado", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "ld-1",
      operationId: "OP-2026-0004",
      propertyCode: "P-4",
      documentKind: "arras",
      status: "DRAFT",
      templateVersion: "v1",
      cloudinaryUrl: "https://res.cloudinary.com/demo/raw/upload/contracts/doc.docx",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
      updatedAt: new Date("2026-04-01T11:00:00.000Z"),
      contractInput: {
        kind: "arras",
        templateVersion: "v1",
        payload: {
          documentDateIso: "2026-04-01",
          signPlace: "Cordoba",
          buyers: [
            {
              fullName: "Ana",
              nationalId: "12345678A",
              fiscalAddress: { streetLine: "Calle 1", municipality: "Cordoba" },
            },
          ],
          sellers: [
            {
              fullName: "Jose",
              nationalId: "87654321B",
              fiscalAddress: { streetLine: "Calle 2", municipality: "Cordoba" },
            },
          ],
          property: {
            addressLine: "Calle Mayor 3",
            municipality: "Cordoba",
            cadastralReference: "ABC",
          },
          totalPurchasePrice: { amount: 100000, literalEs: "cien mil euros" },
          arrasAmount: { amount: 10000, literalEs: "diez mil euros" },
          remainderAtPublicDeed: { amount: 90000, literalEs: "noventa mil euros" },
          arrasPaymentAccount: {
            iban: "ES000000000000000000",
            bankName: "Banco",
            holdersLine: "Jose",
          },
          timelines: {
            maxDeedDateIso: "2026-06-01",
            maxKeysHandoverDateIso: "2026-06-01",
            convocatoriaNotaryMinNaturalDays: 7,
          },
          jurisdiction: { courtsMunicipality: "Cordoba" },
          flags: {
            arrasRegime: "penitencial",
            keysHandover: "same_day_as_deed",
            validitySubjectToSellerReceipt: true,
          },
        },
      },
      parties: [
        { role: "BUYER", fullName: "Ana", email: "ana@test.com", phone: null },
        { role: "SELLER", fullName: "Jose", email: null, phone: "34600000000" },
      ],
    } as never);

    const res = await getContract(new Request("https://app.test/api/contracts/ld-1"), {
      params: Promise.resolve({ id: "ld-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.id).toBe("ld-1");
    expect(json.contractTemplateInput.kind).toBe("arras");
    expect(json.parties).toHaveLength(2);
  });

  it("devuelve 404 si el contrato no existe", async () => {
    mockFindUnique.mockResolvedValueOnce(null as never);

    const res = await getContract(new Request("https://app.test/api/contracts/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });
});

describe("GET /api/contracts/[id]/versions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normaliza el historial real desde CONTRATO_VERSIONADO", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "ld-1",
      propertyCode: "P-4",
      contractInput: {},
      templateVersion: "v2",
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    } as never);
    mockGetEventsByAggregate.mockResolvedValueOnce([
      {
        id: "evt-1",
        type: "CONTRATO_VERSIONADO",
        occurredAt: new Date("2026-04-01T12:00:00.000Z"),
        payload: {
          nextTemplateVersion: "v2",
          appliedSummaries: ["Fuero actualizado"],
          patch: { confidence: 0.88, ambiguousPoints: [] },
        },
      },
      {
        id: "evt-2",
        type: "CONTRATO_APROBADO",
        occurredAt: new Date("2026-04-01T13:00:00.000Z"),
        payload: {},
      },
    ] as never);

    const res = await getVersions(new Request("https://app.test/api/contracts/ld-1/versions"), {
      params: Promise.resolve({ id: "ld-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.versions).toHaveLength(1);
    expect(json.versions[0].templateVersion).toBe("v2");
    expect(json.versions[0].summary).toContain("Fuero actualizado");
  });
});
