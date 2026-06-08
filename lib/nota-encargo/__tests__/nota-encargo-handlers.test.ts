import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";

const {
  sessionUpdateMock,
  sessionUpdateManyMock,
  sessionFindUniqueMock,
  comercialFindUniqueMock,
  comercialFindFirstMock,
} = vi.hoisted(() => ({
  sessionUpdateMock: vi.fn(),
  sessionUpdateManyMock: vi.fn(),
  sessionFindUniqueMock: vi.fn(),
  comercialFindUniqueMock: vi.fn(),
  comercialFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notaEncargoSession: {
      findUnique: sessionFindUniqueMock,
      update: sessionUpdateMock,
      updateMany: sessionUpdateManyMock,
    },
    comercial: {
      findUnique: comercialFindUniqueMock,
      findFirst: comercialFindFirstMock,
    },
  },
}));

const { sendFlowMock } = vi.hoisted(() => ({
  sendFlowMock: vi.fn(),
}));

vi.mock("@/lib/nota-encargo/whatsapp", () => ({
  sendNotaEncargoFlow: sendFlowMock,
}));

vi.mock("@/lib/nota-encargo/send-to-signature", () => ({
  handleNotaEncargoFlowResponse: vi.fn(),
}));

import {
  handleNotaEncargoRecordatorio,
  handleNotaEncargoCheckConfirmacion,
  handleNotaEncargoEnviarFormulario,
  handleNotaEncargoFormularioCompletado,
} from "@/lib/workers/consumer/nota-encargo-handlers";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    propertyCode: "PROP-001",
    propertyRef: "URUS36VMA",
    refCatastral: null,
    comercialId: "comercial-1",
    propietarioPhone: "34666777888",
    visitDateTime: new Date("2026-04-16T16:00:00Z"),
    state: "PENDING",
    direccion: "Calle Flamencos 8",
    tipoOperacion: "VENTA",
    precio: 275000,
    ...overrides,
  };
}

function makeJob(payload: Record<string, unknown>): JobRecord {
  return {
    id: "job-1",
    type: "NOTA_ENCARGO_ENVIAR_FORMULARIO",
    payload,
    status: "PENDING",
    attempts: 0,
    maxAttempts: 3,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    availableAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    dlqAt: null,
    dlqReason: null,
    dlqOriginalStatus: null,
  } as unknown as JobRecord;
}

function makeEvent(type: string, payload: unknown): Event {
  return {
    id: "evt-1",
    position: BigInt(1),
    type: type as Event["type"],
    aggregateType: "PROPERTY",
    aggregateId: "PROP-001",
    version: null,
    payload: payload as Event["payload"],
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  };
}

describe("legacy handlers (deprecated steps)", () => {
  it("recordatorio returns success noop", async () => {
    const result = await handleNotaEncargoRecordatorio(
      makeJob({ sessionId: "session-1" }),
    );
    expect(result.success).toBe(true);
  });

  it("check confirmacion returns success noop", async () => {
    const result = await handleNotaEncargoCheckConfirmacion(
      makeJob({ sessionId: "session-1" }),
    );
    expect(result.success).toBe(true);
  });
});

describe("handleNotaEncargoEnviarFormulario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFlowMock.mockResolvedValue({ messages: [{ id: "wamid" }] });
    sessionUpdateManyMock.mockResolvedValue({ count: 1 });
    comercialFindUniqueMock.mockResolvedValue({
      id: "comercial-1",
      nombre: "Miguel",
      telefono: "34600111222",
      waId: null,
      activo: true,
    });
  });

  it("sends Flow al comercial desde PENDING con claim optimista", async () => {
    sessionFindUniqueMock.mockResolvedValue(makeSession({ state: "PENDING" }));

    const result = await handleNotaEncargoEnviarFormulario(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sessionUpdateManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "session-1", state: "PENDING" },
        data: { state: "FORMULARIO_ENVIADO" },
      }),
    );
    expect(sendFlowMock).toHaveBeenCalledWith(
      "34600111222",
      expect.objectContaining({
        sessionId: "session-1",
        propertyRef: "URUS36VMA",
      }),
      expect.any(Object),
    );
  });

  it("no-op if state is not PENDING ni PENDIENTE_PROPIEDAD", async () => {
    sessionFindUniqueMock.mockResolvedValue(
      makeSession({ state: "RECORDATORIO_ENVIADO" }),
    );

    const result = await handleNotaEncargoEnviarFormulario(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendFlowMock).not.toHaveBeenCalled();
  });
});

describe("handleNotaEncargoFormularioCompletado", () => {
  it("returns permanent error if payload lacks sessionId", async () => {
    const result = await handleNotaEncargoFormularioCompletado(
      makeEvent("NOTA_ENCARGO_FORMULARIO_COMPLETADO", {}),
    );
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });
});
