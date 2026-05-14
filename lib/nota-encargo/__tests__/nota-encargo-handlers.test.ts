import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";
import type { Event } from "@/types/domain";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  sessionFindUniqueOrThrowMock,
  sessionUpdateMock,
  sessionFindUniqueMock,
  sessionFindFirstMock,
  legalDocCreateMock,
  partyCreateMock,
  sigReqCreateMock,
  comercialFindUniqueMock,
  comercialFindFirstMock,
} = vi.hoisted(() => ({
  sessionFindUniqueOrThrowMock: vi.fn(),
  sessionUpdateMock: vi.fn(),
  sessionFindUniqueMock: vi.fn(),
  sessionFindFirstMock: vi.fn(),
  legalDocCreateMock: vi.fn(),
  partyCreateMock: vi.fn(),
  sigReqCreateMock: vi.fn(),
  comercialFindUniqueMock: vi.fn(),
  comercialFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notaEncargoSession: {
      findUniqueOrThrow: sessionFindUniqueOrThrowMock,
      findUnique: sessionFindUniqueMock,
      findFirst: sessionFindFirstMock,
      update: sessionUpdateMock,
    },
    legalDocument: { create: legalDocCreateMock },
    legalDocumentParty: { create: partyCreateMock },
    signatureRequest: { create: sigReqCreateMock },
    comercial: {
      findUnique: comercialFindUniqueMock,
      findFirst: comercialFindFirstMock,
    },
  },
}));

const { appendEventMock, enqueueJobMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(),
  enqueueJobMock: vi.fn(),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: appendEventMock,
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: enqueueJobMock,
}));

const { sendRecordatorioMock, sendNoConfirmadaMock, sendFlowMock } =
  vi.hoisted(() => ({
    sendRecordatorioMock: vi.fn(),
    sendNoConfirmadaMock: vi.fn(),
    sendFlowMock: vi.fn(),
  }));

vi.mock("@/lib/nota-encargo/whatsapp", () => ({
  sendNotaEncargoRecordatorio: sendRecordatorioMock,
  sendNotaEncargoNoConfirmada: sendNoConfirmadaMock,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    propertyCode: "PROP-001",
    propertyRef: "URUS36VMA",
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
    type: "NOTA_ENCARGO_RECORDATORIO",
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

function makeEvent(
  type: string,
  payload: unknown,
): Event {
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("handleNotaEncargoRecordatorio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendRecordatorioMock.mockResolvedValue({ messages: [{ id: "wamid" }] });
    sessionUpdateMock.mockResolvedValue({});
    enqueueJobMock.mockResolvedValue({ id: "job-2" });
  });

  it("sends reminder and transitions to RECORDATORIO_ENVIADO", async () => {
    const futureVisit = new Date(Date.now() + 3 * 60 * 60 * 1000);
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ visitDateTime: futureVisit }),
    );

    const result = await handleNotaEncargoRecordatorio(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendRecordatorioMock).toHaveBeenCalledWith(
      "34666777888",
      expect.objectContaining({
        propertyRef: "URUS36VMA",
        direccion: "Calle Flamencos 8",
      }),
      expect.objectContaining({
        trace: expect.objectContaining({
          source: "nota_encargo_recordatorio_job",
          kind: "nota_encargo_recordatorio",
          aggregateId: "34666777888",
        }),
      }),
    );
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "RECORDATORIO_ENVIADO" },
      }),
    );
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTA_ENCARGO_CHECK_CONFIRMACION",
      }),
    );
  });

  it("skips CHECK_CONFIRMACION when visit is < 45 min away", async () => {
    const nearVisit = new Date(Date.now() + 20 * 60 * 1000);
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ visitDateTime: nearVisit }),
    );

    const result = await handleNotaEncargoRecordatorio(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendRecordatorioMock).toHaveBeenCalled();
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "RECORDATORIO_ENVIADO" },
      }),
    );
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("enqueues CHECK_CONFIRMACION when visit is >= 45 min away", async () => {
    const futureVisit = new Date(Date.now() + 3 * 60 * 60 * 1000);
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ visitDateTime: futureVisit }),
    );

    const result = await handleNotaEncargoRecordatorio(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTA_ENCARGO_CHECK_CONFIRMACION",
      }),
    );
  });

  it("is idempotent: no-op if state is not PENDING", async () => {
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ state: "RECORDATORIO_ENVIADO" }),
    );

    const result = await handleNotaEncargoRecordatorio(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendRecordatorioMock).not.toHaveBeenCalled();
    expect(sessionUpdateMock).not.toHaveBeenCalled();
  });
});

describe("handleNotaEncargoCheckConfirmacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendNoConfirmadaMock.mockResolvedValue({ messages: [{ id: "wamid" }] });
    sessionUpdateMock.mockResolvedValue({});
    appendEventMock.mockResolvedValue({ id: "evt" });
  });

  it("notifies comercial when owner did not confirm", async () => {
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ state: "RECORDATORIO_ENVIADO" }),
    );
    comercialFindUniqueMock.mockResolvedValue({
      id: "comercial-1",
      nombre: "Miguel",
      telefono: "34600111222",
      activo: true,
    });

    const result = await handleNotaEncargoCheckConfirmacion(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendNoConfirmadaMock).toHaveBeenCalledWith(
      "34600111222",
      expect.objectContaining({ propertyRef: "URUS36VMA" }),
      expect.objectContaining({
        trace: expect.objectContaining({
          source: "nota_encargo_check_confirmacion_job",
          kind: "nota_encargo_no_confirmada",
          aggregateId: "34600111222",
        }),
      }),
    );
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "NO_CONFIRMADA" },
      }),
    );
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTA_ENCARGO_NO_CONFIRMADA",
      }),
    );
  });

  it("no-op if already confirmed", async () => {
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ state: "CONFIRMADA" }),
    );

    const result = await handleNotaEncargoCheckConfirmacion(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendNoConfirmadaMock).not.toHaveBeenCalled();
  });

  it("no-op if formulario already sent", async () => {
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ state: "FORMULARIO_ENVIADO" }),
    );

    const result = await handleNotaEncargoCheckConfirmacion(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendNoConfirmadaMock).not.toHaveBeenCalled();
  });
});

describe("handleNotaEncargoEnviarFormulario", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendFlowMock.mockResolvedValue({ messages: [{ id: "wamid" }] });
    sessionUpdateMock.mockResolvedValue({});
  });

  it("sends Flow and transitions to FORMULARIO_ENVIADO", async () => {
    sessionFindUniqueOrThrowMock.mockResolvedValue(
      makeSession({ state: "CONFIRMADA" }),
    );

    const result = await handleNotaEncargoEnviarFormulario(
      makeJob({ sessionId: "session-1" }),
    );

    expect(result.success).toBe(true);
    expect(sendFlowMock).toHaveBeenCalledWith(
      "34666777888",
      expect.objectContaining({
        sessionId: "session-1",
        propertyRef: "URUS36VMA",
        direccion: "Calle Flamencos 8",
        tipoOperacion: "VENTA",
        precio: 275000,
      }),
      expect.objectContaining({
        trace: expect.objectContaining({
          source: "nota_encargo_enviar_formulario_job",
          kind: "nota_encargo_formulario",
          aggregateId: "34666777888",
        }),
      }),
    );
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "FORMULARIO_ENVIADO" },
      }),
    );
  });

  it("no-op if state is not CONFIRMADA", async () => {
    sessionFindUniqueOrThrowMock.mockResolvedValue(
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
    const event = makeEvent("NOTA_ENCARGO_FORMULARIO_COMPLETADO", {});

    const result = await handleNotaEncargoFormularioCompletado(event);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("no-op if session not found", async () => {
    sessionFindUniqueMock.mockResolvedValue(null);

    const event = makeEvent("NOTA_ENCARGO_FORMULARIO_COMPLETADO", {
      sessionId: "session-x",
      formData: {},
    });

    const result = await handleNotaEncargoFormularioCompletado(event);

    expect(result.success).toBe(true);
  });
});
