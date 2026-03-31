import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    event: {
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    propertySnapshot: {
      findUnique: vi.fn(),
    },
    comercial: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/event-store/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/job-queue/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendReviewRequest: vi.fn(),
  sendReviewReminder: vi.fn(),
  sendPostSaleMessage: vi.fn(),
  sendReferralRequest: vi.fn(),
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: vi.fn(() => "https://test.urus.com"),
}));

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { enqueueJob } from "@/lib/job-queue/job-queue";
import { sendReviewRequest, sendReviewReminder } from "@/lib/whatsapp/send";
import {
  handleSendReviewRequest,
  handleSendReviewReminder,
} from "@/lib/workers/consumer/post-sale-job-handler";
import type { JobRecord } from "@/lib/job-queue/types";

const mockPrisma = vi.mocked(prisma);
const mockAppendEvent = vi.mocked(appendEvent);
const mockEnqueueJob = vi.mocked(enqueueJob);
const mockSendReviewRequest = vi.mocked(sendReviewRequest);
const mockSendReviewReminder = vi.mocked(sendReviewReminder);

function fakeJob(overrides?: Partial<JobRecord>): JobRecord {
  return {
    id: "job-review-001",
    type: "SEND_REVIEW_REQUEST",
    status: "PROCESSING",
    payload: {
      propertyCode: "PROP-500",
      newEstado: "Vendida",
      phase: "resena",
      stepLabel: "D+12",
      closedAt: "2026-03-01T10:00:00Z",
      sourceEventId: "evt-closed-500",
    },
    priority: 50,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: "evt-closed-500",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function fakeReminderJob(overrides?: Partial<JobRecord>): JobRecord {
  return fakeJob({
    id: "job-reminder-001",
    type: "SEND_REVIEW_REMINDER",
    payload: {
      propertyCode: "PROP-500",
      newEstado: "Vendida",
      phase: "resena",
      stepLabel: "D+17 reminder",
      closedAt: "2026-03-01T10:00:00Z",
      sourceEventId: "evt-resena-500",
    },
    sourceEventId: "evt-resena-500",
    ...overrides,
  });
}

function setupResolveRecipient(phone: string | null, clientName: string | null = "Juan") {
  mockPrisma.event.findFirst.mockResolvedValue(
    phone
      ? {
          id: "evt-closed-500",
          position: 1n,
          type: "OPERACION_CERRADA",
          aggregateType: "OPERACION",
          aggregateId: "PROP-500",
          version: null,
          payload: { buyerPhone: phone, clientName },
          metadata: null,
          correlationId: null,
          causationId: null,
          occurredAt: new Date(),
          createdAt: new Date(),
        }
      : null,
  );

  mockPrisma.propertySnapshot.findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_REVIEW_URL = "https://g.page/r/test-review";
});

describe("handleSendReviewRequest", () => {
  it("incidencia abierta → no envía, no encola reminder", async () => {
    setupResolveRecipient("34600111222");
    mockPrisma.event.count.mockResolvedValueOnce(1); // checkOpenIncidencias → true

    const result = await handleSendReviewRequest(fakeJob());

    expect(result.success).toBe(true);
    expect(mockSendReviewRequest).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("sin incidencia, sin envío previo → envía WA, emite RESENA_SOLICITADA, encola SEND_REVIEW_REMINDER", async () => {
    setupResolveRecipient("34600111222");
    // checkOpenIncidencias → false
    mockPrisma.event.count.mockResolvedValueOnce(0);
    // hasReviewAlreadySent → false
    mockPrisma.event.count.mockResolvedValueOnce(0);

    mockSendReviewRequest.mockResolvedValueOnce({
      messaging_product: "whatsapp",
      contacts: [{ input: "34600111222", wa_id: "34600111222" }],
      messages: [{ id: "wamid.test" }],
    });

    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-resena-001",
      position: 10n,
      type: "RESENA_SOLICITADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-500",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    mockEnqueueJob.mockResolvedValueOnce({
      id: "job-reminder-auto",
      type: "SEND_REVIEW_REMINDER",
      status: "PENDING",
      payload: {},
      priority: 50,
      attempts: 0,
      maxAttempts: 3,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      startedAt: null,
      completedAt: null,
      failedAt: null,
      lastError: null,
      idempotencyKey: "review_reminder:PROP-500",
      sourceEventId: "evt-resena-001",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await handleSendReviewRequest(fakeJob());

    expect(result.success).toBe(true);

    expect(mockSendReviewRequest).toHaveBeenCalledOnce();
    expect(mockSendReviewRequest).toHaveBeenCalledWith(
      "34600111222",
      expect.objectContaining({
        propertyCode: "PROP-500",
        clientName: "Juan",
        googleReviewUrl: "https://g.page/r/test-review",
      }),
    );

    expect(mockAppendEvent).toHaveBeenCalledOnce();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RESENA_SOLICITADA",
        aggregateType: "OPERACION",
        aggregateId: "PROP-500",
      }),
    );

    expect(mockEnqueueJob).toHaveBeenCalledOnce();
    expect(mockEnqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SEND_REVIEW_REMINDER",
        idempotencyKey: "review_reminder:PROP-500",
        sourceEventId: "evt-resena-001",
      }),
    );

    const reminderPayload = mockEnqueueJob.mock.calls[0][0];
    expect(reminderPayload.availableAt).toBeInstanceOf(Date);
    const delayMs = reminderPayload.availableAt!.getTime() - Date.now();
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    expect(delayMs).toBeGreaterThan(fiveDaysMs - 5000);
    expect(delayMs).toBeLessThanOrEqual(fiveDaysMs + 1000);
  });

  it("RESENA_SOLICITADA previa → skip (idempotencia)", async () => {
    setupResolveRecipient("34600111222");
    // checkOpenIncidencias → false
    mockPrisma.event.count.mockResolvedValueOnce(0);
    // hasReviewAlreadySent → true
    mockPrisma.event.count.mockResolvedValueOnce(1);

    const result = await handleSendReviewRequest(fakeJob());

    expect(result.success).toBe(true);
    expect(mockSendReviewRequest).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("sin teléfono → completa sin envío", async () => {
    setupResolveRecipient(null);

    const result = await handleSendReviewRequest(fakeJob());

    expect(result.success).toBe(true);
    expect(mockSendReviewRequest).not.toHaveBeenCalled();
  });

  it("payload inválido → error permanente", async () => {
    const result = await handleSendReviewRequest(
      fakeJob({ payload: null }),
    );

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });
});

describe("handleSendReviewReminder", () => {
  it("sin respuesta previa → envía recordatorio, emite RECORDATORIO_RESENA_ENVIADO", async () => {
    setupResolveRecipient("34600111222");
    // hasReviewResponse → false
    mockPrisma.event.count.mockResolvedValueOnce(0);

    mockSendReviewReminder.mockResolvedValueOnce({
      messaging_product: "whatsapp",
      contacts: [{ input: "34600111222", wa_id: "34600111222" }],
      messages: [{ id: "wamid.reminder" }],
    });

    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-reminder-001",
      position: 20n,
      type: "RECORDATORIO_RESENA_ENVIADO",
      aggregateType: "OPERACION",
      aggregateId: "PROP-500",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const result = await handleSendReviewReminder(fakeReminderJob());

    expect(result.success).toBe(true);

    expect(mockSendReviewReminder).toHaveBeenCalledOnce();
    expect(mockSendReviewReminder).toHaveBeenCalledWith(
      "34600111222",
      expect.objectContaining({
        propertyCode: "PROP-500",
        clientName: "Juan",
        googleReviewUrl: "https://g.page/r/test-review",
      }),
    );

    expect(mockAppendEvent).toHaveBeenCalledOnce();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "RECORDATORIO_RESENA_ENVIADO",
        aggregateType: "OPERACION",
        aggregateId: "PROP-500",
      }),
    );
  });

  it("RESENA_RECIBIDA previa → skip sin enviar", async () => {
    setupResolveRecipient("34600111222");
    // hasReviewResponse → true
    mockPrisma.event.count.mockResolvedValueOnce(1);

    const result = await handleSendReviewReminder(fakeReminderJob());

    expect(result.success).toBe(true);
    expect(mockSendReviewReminder).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("sin teléfono → completa sin envío", async () => {
    setupResolveRecipient(null);

    const result = await handleSendReviewReminder(fakeReminderJob());

    expect(result.success).toBe(true);
    expect(mockSendReviewReminder).not.toHaveBeenCalled();
  });

  it("payload inválido → error permanente", async () => {
    const result = await handleSendReviewReminder(
      fakeReminderJob({ payload: null }),
    );

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });
});
