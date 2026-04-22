import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AppendEventInput, EventRecord } from "../types";

const { mockCreate, mockFindMany } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      create: mockCreate,
      findMany: mockFindMany,
    },
  },
}));

vi.mock("@/lib/cache", () => ({
  invalidateCacheForEvent: vi.fn(),
}));

import {
  appendEvent,
  getEventsByAggregate,
  getEventsSince,
} from "../event-store";

function fakeEvent(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "evt-abc",
    position: 1n,
    type: "PROPIEDAD_CREADA",
    aggregateType: "PROPERTY",
    aggregateId: "prop-1",
    version: null,
    payload: {},
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date("2026-03-15T10:00:00Z"),
    createdAt: new Date("2026-03-15T10:00:00Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// appendEvent
// ---------------------------------------------------------------------------
describe("appendEvent", () => {
  it("debe crear evento con todos los campos y retornar el registro", async () => {
    const input: AppendEventInput = {
      type: "PROPIEDAD_CREADA",
      aggregateType: "PROPERTY",
      aggregateId: "prop-1",
      payload: { precio: 300_000 },
      metadata: { actor: "system" },
      correlationId: "corr-1",
      causationId: "cause-1",
      version: 1,
    };
    const expected = fakeEvent({
      payload: { precio: 300_000 },
      metadata: { actor: "system" },
      correlationId: "corr-1",
      causationId: "cause-1",
      version: 1,
    });
    mockCreate.mockResolvedValueOnce(expected);

    const result = await appendEvent(input);

    expect(result).toEqual(expected);
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        type: "PROPIEDAD_CREADA",
        aggregateType: "PROPERTY",
        aggregateId: "prop-1",
        payload: { precio: 300_000 },
        metadata: { actor: "system" },
        correlationId: "corr-1",
        causationId: "cause-1",
        version: 1,
      },
    });
  });

  it("debe usar objeto vacío como payload por defecto cuando es null", async () => {
    const input: AppendEventInput = {
      type: "ESTADO_CAMBIADO",
      aggregateType: "PROPERTY",
      aggregateId: "prop-2",
      payload: null,
    };
    mockCreate.mockResolvedValueOnce(fakeEvent({ payload: {} }));

    await appendEvent(input);

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.payload).toEqual({});
  });

  it("debe usar objeto vacío como payload por defecto cuando es undefined", async () => {
    const input = {
      type: "ESTADO_CAMBIADO" as const,
      aggregateType: "PROPERTY" as const,
      aggregateId: "prop-2b",
      payload: undefined,
    } as unknown as AppendEventInput;
    mockCreate.mockResolvedValueOnce(fakeEvent({ payload: {} }));

    await appendEvent(input);

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.payload).toEqual({});
  });

  it("debe incluir metadata en la creación cuando se proporciona", async () => {
    const input: AppendEventInput = {
      type: "PROPIEDAD_CREADA",
      aggregateType: "PROPERTY",
      aggregateId: "prop-3",
      payload: {},
      metadata: { source: "ingestion-worker" },
    };
    mockCreate.mockResolvedValueOnce(
      fakeEvent({ metadata: { source: "ingestion-worker" } }),
    );

    await appendEvent(input);

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.metadata).toEqual({ source: "ingestion-worker" });
  });

  it("debe omitir metadata del objeto data cuando es undefined", async () => {
    const input: AppendEventInput = {
      type: "PROPIEDAD_CREADA",
      aggregateType: "PROPERTY",
      aggregateId: "prop-4",
      payload: { x: 1 },
    };
    mockCreate.mockResolvedValueOnce(fakeEvent());

    await appendEvent(input);

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData).not.toHaveProperty("metadata");
  });

  it("debe pasar correlationId, causationId y version cuando se proporcionan", async () => {
    const input: AppendEventInput = {
      type: "LEAD_INGESTADO",
      aggregateType: "LEAD",
      aggregateId: "lead-1",
      payload: {},
      correlationId: "corr-99",
      causationId: "cause-99",
      version: 5,
    };
    mockCreate.mockResolvedValueOnce(fakeEvent());

    await appendEvent(input);

    const callData = mockCreate.mock.calls[0][0].data;
    expect(callData.correlationId).toBe("corr-99");
    expect(callData.causationId).toBe("cause-99");
    expect(callData.version).toBe(5);
  });

  it("debe propagar errores de Prisma sin capturarlos", async () => {
    mockCreate.mockRejectedValueOnce(new Error("DB connection failed"));

    await expect(
      appendEvent({
        type: "PROPIEDAD_CREADA",
        aggregateType: "PROPERTY",
        aggregateId: "prop-err",
        payload: {},
      }),
    ).rejects.toThrow("DB connection failed");
  });
});

// ---------------------------------------------------------------------------
// getEventsByAggregate
// ---------------------------------------------------------------------------
describe("getEventsByAggregate", () => {
  it("debe consultar con aggregateType, aggregateId y orden ascendente", async () => {
    const events = [fakeEvent({ position: 1n }), fakeEvent({ position: 2n })];
    mockFindMany.mockResolvedValueOnce(events);

    const result = await getEventsByAggregate("PROPERTY", "prop-1");

    expect(result).toEqual(events);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { aggregateType: "PROPERTY", aggregateId: "prop-1" },
      orderBy: { position: "asc" },
      take: undefined,
      skip: undefined,
    });
  });

  it("debe aplicar limit cuando se proporciona", async () => {
    mockFindMany.mockResolvedValueOnce([fakeEvent()]);

    await getEventsByAggregate("PROPERTY", "prop-1", { limit: 5 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
  });

  it("debe aplicar offset cuando se proporciona", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getEventsByAggregate("PROPERTY", "prop-1", { offset: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10 }),
    );
  });

  it("debe aplicar limit y offset combinados", async () => {
    mockFindMany.mockResolvedValueOnce([fakeEvent()]);

    await getEventsByAggregate("DEMAND", "dem-1", { limit: 2, offset: 5 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { aggregateType: "DEMAND", aggregateId: "dem-1" },
      orderBy: { position: "asc" },
      take: 2,
      skip: 5,
    });
  });

  it("debe retornar array vacío cuando no hay resultados", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await getEventsByAggregate("PROPERTY", "no-existe");

    expect(result).toEqual([]);
  });

  it("debe aceptar distintos AggregateType", async () => {
    mockFindMany.mockResolvedValueOnce([
      fakeEvent({ aggregateType: "LEAD", type: "LEAD_INGESTADO" }),
    ]);

    const result = await getEventsByAggregate("LEAD", "lead-1");

    expect(result).toHaveLength(1);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { aggregateType: "LEAD", aggregateId: "lead-1" },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getEventsSince
// ---------------------------------------------------------------------------
describe("getEventsSince", () => {
  it("debe consultar eventos con position mayor que la dada", async () => {
    const events = [fakeEvent({ position: 11n })];
    mockFindMany.mockResolvedValueOnce(events);

    const result = await getEventsSince(10n);

    expect(result).toEqual(events);
    expect(mockFindMany).toHaveBeenCalledWith({
      where: { position: { gt: 10n } },
      orderBy: { position: "asc" },
      take: undefined,
      skip: undefined,
    });
  });

  it("debe incluir filtro de type cuando se proporciona en options", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getEventsSince(0n, { type: "LEAD_INGESTADO" });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { position: { gt: 0n }, type: "LEAD_INGESTADO" },
      orderBy: { position: "asc" },
      take: undefined,
      skip: undefined,
    });
  });

  it("debe omitir filtro de type cuando no se proporciona", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getEventsSince(0n, { limit: 10 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { position: { gt: 0n } },
      orderBy: { position: "asc" },
      take: 10,
      skip: undefined,
    });
  });

  it("debe aplicar limit y offset", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getEventsSince(5n, { limit: 3, offset: 2 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { position: { gt: 5n } },
      orderBy: { position: "asc" },
      take: 3,
      skip: 2,
    });
  });

  it("debe combinar filtro de type con limit", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getEventsSince(0n, { type: "MATCH_GENERADO", limit: 1 });

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { position: { gt: 0n }, type: "MATCH_GENERADO" },
      orderBy: { position: "asc" },
      take: 1,
      skip: undefined,
    });
  });

  it("debe retornar array vacío cuando no hay resultados", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await getEventsSince(BigInt(Number.MAX_SAFE_INTEGER));

    expect(result).toEqual([]);
  });

  it("debe funcionar con position 0n para obtener todos los eventos", async () => {
    const events = [fakeEvent({ position: 1n }), fakeEvent({ position: 2n })];
    mockFindMany.mockResolvedValueOnce(events);

    const result = await getEventsSince(0n);

    expect(result).toHaveLength(2);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { position: { gt: 0n } },
      }),
    );
  });
});
