import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";

const { mockStartInitialContact, mockEventFindFirst } = vi.hoisted(() => ({
  mockStartInitialContact: vi.fn(),
  mockEventFindFirst: vi.fn(),
}));

vi.mock("@/lib/nlu/initial-contact", () => ({
  startNluInitialContactForDemand: (...args: unknown[]) =>
    mockStartInitialContact(...args),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
    },
  },
}));

function makeJob(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-1",
    type: "START_NLU_INITIAL_CONTACT",
    status: "IN_PROGRESS",
    payload: {
      demandId: "DEM-001",
      source: "auto_demand_creada",
      causationId: "evt-cause-1",
      correlationId: "corr-1",
    },
    priority: 100,
    attempts: 0,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "worker-1",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: "nlu_initial_contact:evt-cause-1",
    sourceEventId: "evt-cause-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("handleStartNluInitialContact", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventFindFirst.mockResolvedValue(null);
    mockStartInitialContact.mockResolvedValue({
      ok: true,
      demandId: "DEM-001",
      waId: "34600111222",
      sent: true,
      eventId: "evt-nlu-contact",
    });
  });

  it("rechaza permanentemente jobs sin demandId", async () => {
    const { handleStartNluInitialContact } = await import(
      "../nlu-initial-contact-job-handler"
    );
    const result = await handleStartNluInitialContact(
      makeJob({ payload: {} }),
    );

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
    expect(mockStartInitialContact).not.toHaveBeenCalled();
  });

  it("invoca startNluInitialContactForDemand cuando no hay envío previo", async () => {
    const { handleStartNluInitialContact } = await import(
      "../nlu-initial-contact-job-handler"
    );
    const result = await handleStartNluInitialContact(makeJob());

    expect(result.success).toBe(true);
    expect(mockEventFindFirst).toHaveBeenCalledWith({
      where: {
        type: "NLU_CONTACTO_INICIADO",
        aggregateId: "DEM-001",
        payload: { path: ["sent"], equals: true },
      },
      select: { id: true },
    });
    expect(mockStartInitialContact).toHaveBeenCalledWith({
      demandId: "DEM-001",
      source: "auto_demand_creada",
      causationId: "evt-cause-1",
      correlationId: "corr-1",
    });
  });

  it("hace no-op si ya existe NLU_CONTACTO_INICIADO sent=true previo", async () => {
    mockEventFindFirst.mockResolvedValue({ id: "evt-prev-sent" });

    const { handleStartNluInitialContact } = await import(
      "../nlu-initial-contact-job-handler"
    );
    const result = await handleStartNluInitialContact(makeJob());

    expect(result.success).toBe(true);
    expect(mockStartInitialContact).not.toHaveBeenCalled();
  });

  it("acepta source `auto_demand_modificada_phone`", async () => {
    const { handleStartNluInitialContact } = await import(
      "../nlu-initial-contact-job-handler"
    );
    await handleStartNluInitialContact(
      makeJob({
        payload: {
          demandId: "DEM-001",
          source: "auto_demand_modificada_phone",
          causationId: "evt-mod-1",
          correlationId: null,
        },
      }),
    );

    expect(mockStartInitialContact).toHaveBeenCalledWith({
      demandId: "DEM-001",
      source: "auto_demand_modificada_phone",
      causationId: "evt-mod-1",
      correlationId: null,
    });
  });

  it("normaliza un source desconocido a auto_demand_creada", async () => {
    const { handleStartNluInitialContact } = await import(
      "../nlu-initial-contact-job-handler"
    );
    await handleStartNluInitialContact(
      makeJob({
        payload: {
          demandId: "DEM-001",
          source: "fuente-rara",
        },
      }),
    );

    expect(mockStartInitialContact).toHaveBeenCalledWith(
      expect.objectContaining({ source: "auto_demand_creada" }),
    );
  });

  it("usa sourceEventId del job como causationId fallback", async () => {
    const { handleStartNluInitialContact } = await import(
      "../nlu-initial-contact-job-handler"
    );
    await handleStartNluInitialContact(
      makeJob({
        payload: { demandId: "DEM-001", source: "auto_demand_creada" },
        sourceEventId: "evt-source-fallback",
      }),
    );

    expect(mockStartInitialContact).toHaveBeenCalledWith(
      expect.objectContaining({ causationId: "evt-source-fallback" }),
    );
  });
});
