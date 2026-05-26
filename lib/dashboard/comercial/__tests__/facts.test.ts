import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/types/domain";

const {
  mockPropertySnapshotFindUnique,
  mockPropertyCurrentFindUnique,
  mockOperacionFindUnique,
  mockComercialFindUnique,
  mockCommercialOperationFactUpsert,
  mockResolveComercialFromAgente,
} = vi.hoisted(() => ({
  mockPropertySnapshotFindUnique: vi.fn(),
  mockPropertyCurrentFindUnique: vi.fn(),
  mockOperacionFindUnique: vi.fn(),
  mockComercialFindUnique: vi.fn(),
  mockCommercialOperationFactUpsert: vi.fn(),
  mockResolveComercialFromAgente: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    propertySnapshot: { findUnique: mockPropertySnapshotFindUnique },
    propertyCurrent: { findUnique: mockPropertyCurrentFindUnique },
    operacion: { findUnique: mockOperacionFindUnique },
    comercial: { findUnique: mockComercialFindUnique },
    commercialOperationFact: { upsert: mockCommercialOperationFactUpsert },
  },
}));

vi.mock("@/lib/routing/resolve-comercial", () => ({
  resolveComercialFromAgente: (...args: unknown[]) =>
    mockResolveComercialFromAgente(...args),
}));

const { upsertCommercialOperationFactFromOperacionCerradaEvent } = await import(
  "../facts"
);

function makeEvent(payload: Record<string, unknown>): Event {
  return {
    id: "evt-fact-001",
    position: BigInt(1),
    type: "OPERACION_CERRADA",
    aggregateType: "OPERACION",
    aggregateId: "PROP-FACT",
    version: null,
    payload,
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-05-26T10:00:00.000Z"),
    createdAt: new Date("2026-05-26T10:00:00.000Z"),
  } as Event;
}

describe("upsertCommercialOperationFactFromOperacionCerradaEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCommercialOperationFactUpsert.mockResolvedValue(undefined);
    mockResolveComercialFromAgente.mockResolvedValue(null);
  });

  it("prioriza comercialId del evento y usa PropertyCurrent cuando el snapshot tiene precio vacío", async () => {
    mockPropertySnapshotFindUnique.mockResolvedValue({
      ref: "REF-SNAPSHOT",
      ciudad: "",
      zona: "",
      precio: 0,
      agente: "",
      firstSeenAt: new Date("2026-05-01T10:00:00.000Z"),
    });
    mockPropertyCurrentFindUnique.mockResolvedValue({
      ref: "REF-CURRENT",
      ciudad: "Córdoba",
      zona: "Centro",
      precio: 250_000,
      agente: "Agente Current",
      comercialId: "com-current",
      createdAt: new Date("2026-05-02T10:00:00.000Z"),
    });
    mockOperacionFindUnique.mockResolvedValue({ comercialId: "com-operacion" });
    mockComercialFindUnique.mockResolvedValue({
      id: "com-payload",
      nombre: "Comercial Payload",
    });

    await upsertCommercialOperationFactFromOperacionCerradaEvent(
      makeEvent({
        propertyCode: "PROP-FACT",
        operacionId: "op-001",
        newEstado: "CERRADA_VENTA",
        closedAt: "2026-05-26T10:00:00.000Z",
        comercialId: "com-payload",
      }),
    );

    expect(mockComercialFindUnique).toHaveBeenCalledWith({
      where: { id: "com-payload" },
      select: { id: true, nombre: true },
    });
    expect(mockResolveComercialFromAgente).not.toHaveBeenCalled();
    expect(mockCommercialOperationFactUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          grossAmountEur: 250_000,
          comercialId: "com-payload",
          comercialNombre: "Comercial Payload",
          ciudad: "Córdoba",
          zona: "Centro",
        }),
        update: expect.objectContaining({
          grossAmountEur: 250_000,
          comercialId: "com-payload",
          comercialNombre: "Comercial Payload",
          ciudad: "Córdoba",
          zona: "Centro",
        }),
      }),
    );
  });
});
