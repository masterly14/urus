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
  sendPostSaleMessage: vi.fn(),
  sendReviewRequest: vi.fn(),
  sendReviewReminder: vi.fn(),
  sendReferralRequest: vi.fn(),
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: vi.fn(() => "https://test.urus.com"),
}));

import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store/event-store";
import { sendReferralRequest } from "@/lib/whatsapp/send";
import { handleSendReferralRequest } from "@/lib/workers/consumer/post-sale-job-handler";
import type { JobRecord } from "@/lib/job-queue/types";

const mockPrisma = vi.mocked(prisma);
const mockAppendEvent = vi.mocked(appendEvent);
const mockSendReferralRequest = vi.mocked(sendReferralRequest);

function fakeJob(overrides?: Partial<JobRecord>): JobRecord {
  return {
    id: "job-referral-001",
    type: "SEND_REFERRAL_REQUEST",
    status: "PROCESSING",
    payload: {
      propertyCode: "PROP-700",
      newEstado: "Vendida",
      phase: "referidos",
      stepLabel: "D+25",
      closedAt: "2026-03-01T10:00:00Z",
      sourceEventId: "evt-closed-700",
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
    sourceEventId: "evt-closed-700",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function setupResolveRecipient(
  phone: string | null,
  clientName: string | null = "María",
  clientType: string | null = "comprador",
) {
  mockPrisma.event.findFirst.mockResolvedValue(
    phone
      ? {
          id: "evt-closed-700",
          position: 1n,
          type: "OPERACION_CERRADA",
          aggregateType: "OPERACION",
          aggregateId: "PROP-700",
          version: null,
          payload: { buyerPhone: phone, clientName, clientType },
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
});

describe("handleSendReferralRequest", () => {
  it("sin envío previo → envía WA + emite REFERIDO_SOLICITUD_ENVIADA", async () => {
    setupResolveRecipient("34600333444");
    // hasReferralAlreadySent → false
    mockPrisma.event.count.mockResolvedValueOnce(0);

    mockSendReferralRequest.mockResolvedValueOnce({
      messaging_product: "whatsapp",
      contacts: [{ input: "34600333444", wa_id: "34600333444" }],
      messages: [{ id: "wamid.referral" }],
    });

    mockAppendEvent.mockResolvedValueOnce({
      id: "evt-ref-sent-001",
      position: 10n,
      type: "REFERIDO_SOLICITUD_ENVIADA",
      aggregateType: "OPERACION",
      aggregateId: "PROP-700",
      version: null,
      payload: {},
      metadata: null,
      correlationId: null,
      causationId: null,
      occurredAt: new Date(),
      createdAt: new Date(),
    });

    const result = await handleSendReferralRequest(fakeJob());

    expect(result.success).toBe(true);

    expect(mockSendReferralRequest).toHaveBeenCalledOnce();
    expect(mockSendReferralRequest).toHaveBeenCalledWith(
      "34600333444",
      expect.objectContaining({
        propertyCode: "PROP-700",
        clientName: "María",
        clientType: "comprador",
        referralFormUrl: "https://test.urus.com/referidos/PROP-700",
      }),
    );

    expect(mockAppendEvent).toHaveBeenCalledOnce();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "REFERIDO_SOLICITUD_ENVIADA",
        aggregateType: "OPERACION",
        aggregateId: "PROP-700",
      }),
    );
  });

  it("con envío previo → skip (idempotencia)", async () => {
    setupResolveRecipient("34600333444");
    // hasReferralAlreadySent → true
    mockPrisma.event.count.mockResolvedValueOnce(1);

    const result = await handleSendReferralRequest(fakeJob());

    expect(result.success).toBe(true);
    expect(mockSendReferralRequest).not.toHaveBeenCalled();
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it("sin teléfono → completa sin envío", async () => {
    setupResolveRecipient(null);

    const result = await handleSendReferralRequest(fakeJob());

    expect(result.success).toBe(true);
    expect(mockSendReferralRequest).not.toHaveBeenCalled();
  });

  it("payload inválido → error permanente", async () => {
    const result = await handleSendReferralRequest(fakeJob({ payload: null }));

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });
});
