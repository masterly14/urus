import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/whatsapp/send", () => ({
  sendLeadAssignedToCommercial: vi.fn(),
  sendFollowUpToCommercial: vi.fn(),
  sendTextMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
  sendNoStockAvailableToBuyer: vi.fn(),
  sendContractDataIncompleteToCommercial: vi.fn(),
}));

vi.mock("@/lib/leads/follow-up-checker", () => ({
  checkLeadNeedsFollowUp: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    comercial: { findUnique: vi.fn() },
    demandCurrent: { findUnique: vi.fn() },
    event: { findFirst: vi.fn() },
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: vi.fn(),
}));

vi.mock("@/lib/microsite/selection", () => ({
  generateMicrositeSelection: vi.fn(),
}));

vi.mock("@/lib/microsite/approve-by-ai", () => ({
  approveMicrositeByAI: vi.fn(),
}));

vi.mock("@/lib/microsite/buyer-phone", () => ({
  normalizeWhatsAppDigits: vi.fn((value: string | null | undefined) =>
    typeof value === "string" ? value.replace(/\D/g, "") : null,
  ),
  resolveBuyerPhoneForDemand: vi.fn(),
}));

vi.mock("@/lib/alerts/alert-service", () => ({
  alertGeneric: vi.fn(),
}));

import { getJobHandler, handleFollowUpLead } from "../job-handlers";
import {
  sendLeadAssignedToCommercial,
  sendFollowUpToCommercial,
  sendTextMessage,
  sendNoStockAvailableToBuyer,
} from "@/lib/whatsapp/send";
import type { JobRecord } from "@/lib/job-queue/types";
import type { FollowUpCheckResult } from "@/lib/leads/follow-up-checker";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/event-store";
import { generateMicrositeSelection } from "@/lib/microsite/selection";
import { approveMicrositeByAI } from "@/lib/microsite/approve-by-ai";
import { resolveBuyerPhoneForDemand } from "@/lib/microsite/buyer-phone";
import { alertGeneric } from "@/lib/alerts/alert-service";

const mockSend = vi.mocked(sendLeadAssignedToCommercial);
const mockSendFollowUp = vi.mocked(sendFollowUpToCommercial);
const mockSendText = vi.mocked(sendTextMessage);
const mockSendNoStock = vi.mocked(sendNoStockAvailableToBuyer);
const mockAppendEvent = vi.mocked(appendEvent);
const mockGenerateMicrositeSelection = vi.mocked(generateMicrositeSelection);
const mockApproveMicrositeByAI = vi.mocked(approveMicrositeByAI);
const mockResolveBuyerPhone = vi.mocked(resolveBuyerPhoneForDemand);
const mockAlertGeneric = vi.mocked(alertGeneric);

function makeJob(payload: Record<string, unknown>, overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "job-notify-001",
    type: "NOTIFY_LEAD_WHATSAPP",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 10,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.event.findFirst).mockResolvedValue(null);
  mockAppendEvent.mockResolvedValue({
    id: "evt-mock",
    position: BigInt(1),
    type: "MICROSITE_GENERACION_RESULTADO",
    aggregateType: "DEMAND",
    aggregateId: "DEM-MS-001",
    version: null,
    payload: {},
    metadata: null,
    correlationId: null,
    causationId: null,
    occurredAt: new Date(),
    createdAt: new Date(),
  });
});

describe("NOTIFY_LEAD_WHATSAPP job handler", () => {
  const handler = getJobHandler("NOTIFY_LEAD_WHATSAPP")!;

  it("handler está registrado", () => {
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("envía WhatsApp cuando hay teléfono del agente", async () => {
    mockSend.mockResolvedValue({
      messaging_product: "whatsapp",
      contacts: [{ input: "+34600000001", wa_id: "34600000001" }],
      messages: [{ id: "wamid.xyz" }],
    });

    const job = makeJob({
      leadAggregateId: "lead-abc",
      score: 85,
      slaLevel: "CRITICAL",
      maxResponseMs: 300_000,
      assignedAgentTelefono: "+34600000001",
      assignedAgentId: "ag-1",
      assignedAgentNombre: "Pedro",
      reasons: ["preaprobación hipotecaria", "presupuesto definido"],
    });

    const result = await handler(job);

    expect(result.success).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      "+34600000001",
      expect.objectContaining({
        leadId: "lead-abc",
        score: 85,
        slaLevel: "CRITICAL",
      }),
    );
  });

  it("completa sin envío cuando no hay teléfono", async () => {
    const job = makeJob({
      leadAggregateId: "lead-xyz",
      score: 50,
      slaLevel: "MEDIUM",
      assignedAgentTelefono: null,
    });

    const result = await handler(job);

    expect(result.success).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("completa sin envío cuando teléfono es vacío", async () => {
    const job = makeJob({
      leadAggregateId: "lead-xyz",
      score: 50,
      slaLevel: "MEDIUM",
      assignedAgentTelefono: "",
    });

    const result = await handler(job);

    expect(result.success).toBe(true);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("propaga error de WhatsApp API", async () => {
    mockSend.mockRejectedValue(new Error("Meta API error 429: Rate limited"));

    const job = makeJob({
      leadAggregateId: "lead-err",
      score: 90,
      slaLevel: "CRITICAL",
      assignedAgentTelefono: "+34600000002",
    });

    await expect(handler(job)).rejects.toThrow("Meta API error 429");
  });

  it("parsea correctamente los reasons como array", async () => {
    mockSend.mockResolvedValue({
      messaging_product: "whatsapp",
      contacts: [{ input: "+34600000003", wa_id: "34600000003" }],
      messages: [{ id: "wamid.abc" }],
    });

    const job = makeJob({
      leadAggregateId: "lead-reasons",
      score: 70,
      slaLevel: "HIGH",
      assignedAgentTelefono: "+34600000003",
      reasons: ["referido", "plazo corto"],
    });

    await handler(job);

    expect(mockSend).toHaveBeenCalledWith(
      "+34600000003",
      expect.objectContaining({
        reasons: ["referido", "plazo corto"],
      }),
    );
  });
});

function makeFollowUpJob(
  payload: Record<string, unknown>,
  overrides: Partial<JobRecord> = {},
): JobRecord {
  return {
    id: "job-followup-001",
    type: "FOLLOW_UP_LEAD",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 200,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const needsFollowUp: FollowUpCheckResult = {
  shouldFollowUp: true,
  reason: "Sin eventos LEAD_CONTACTADO",
};

const alreadyContacted: FollowUpCheckResult = {
  shouldFollowUp: false,
  reason: "Lead ya contactado (1 evento(s) LEAD_CONTACTADO)",
};

describe("FOLLOW_UP_LEAD job handler", () => {
  it("handler está registrado", () => {
    const handler = getJobHandler("FOLLOW_UP_LEAD");
    expect(handler).toBeDefined();
  });

  it("envía follow-up cuando lead no ha sido contactado", async () => {
    mockSendFollowUp.mockResolvedValue({
      messaging_product: "whatsapp",
      contacts: [{ input: "+34600000010", wa_id: "34600000010" }],
      messages: [{ id: "wamid.fu1" }],
    });

    const job = makeFollowUpJob({
      leadAggregateId: "lead-fu-001",
      step: "D+1",
      score: 25,
      assignedAgentId: "ag-fu-1",
    });

    const result = await handleFollowUpLead(job, {
      checker: async () => needsFollowUp,
      phoneLookup: async () => "+34600000010",
    });

    expect(result.success).toBe(true);
    expect(mockSendFollowUp).toHaveBeenCalledTimes(1);
    expect(mockSendFollowUp).toHaveBeenCalledWith(
      "+34600000010",
      expect.objectContaining({
        leadId: "lead-fu-001",
        step: "D+1",
        score: 25,
      }),
    );
  });

  it("no envía follow-up si el lead ya fue contactado", async () => {
    const job = makeFollowUpJob({
      leadAggregateId: "lead-fu-002",
      step: "D+3",
      score: 30,
      assignedAgentId: "ag-fu-2",
    });

    const result = await handleFollowUpLead(job, {
      checker: async () => alreadyContacted,
      phoneLookup: async () => "+34600000011",
    });

    expect(result.success).toBe(true);
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });

  it("completa sin envío si no hay agente asignado", async () => {
    const job = makeFollowUpJob({
      leadAggregateId: "lead-fu-003",
      step: "D+1",
      score: 20,
      assignedAgentId: null,
    });

    const result = await handleFollowUpLead(job, {
      checker: async () => needsFollowUp,
      phoneLookup: async () => null,
    });

    expect(result.success).toBe(true);
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });

  it("completa sin envío si el agente no tiene teléfono", async () => {
    const job = makeFollowUpJob({
      leadAggregateId: "lead-fu-004",
      step: "D+7",
      score: 15,
      assignedAgentId: "ag-fu-no-phone",
    });

    const result = await handleFollowUpLead(job, {
      checker: async () => needsFollowUp,
      phoneLookup: async () => null,
    });

    expect(result.success).toBe(true);
    expect(mockSendFollowUp).not.toHaveBeenCalled();
  });

  it("falla si no hay leadAggregateId en el payload", async () => {
    const job = makeFollowUpJob({
      step: "D+1",
      score: 20,
    });

    const result = await handleFollowUpLead(job, {
      checker: async () => needsFollowUp,
      phoneLookup: async () => "+34600000012",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("sin leadAggregateId");
  });

  it("propaga error de WhatsApp API al enviar follow-up", async () => {
    mockSendFollowUp.mockRejectedValue(new Error("Meta API timeout"));

    const job = makeFollowUpJob({
      leadAggregateId: "lead-fu-err",
      step: "D+3",
      score: 10,
      assignedAgentId: "ag-fu-err",
    });

    await expect(
      handleFollowUpLead(job, {
        checker: async () => needsFollowUp,
        phoneLookup: async () => "+34600000099",
      }),
    ).rejects.toThrow("Meta API timeout");
  });

  it("envía D+7 correctamente con step label de última alerta", async () => {
    mockSendFollowUp.mockResolvedValue({
      messaging_product: "whatsapp",
      contacts: [{ input: "+34600000020", wa_id: "34600000020" }],
      messages: [{ id: "wamid.d7" }],
    });

    const job = makeFollowUpJob({
      leadAggregateId: "lead-fu-d7",
      step: "D+7",
      score: 10,
      assignedAgentId: "ag-d7",
    });

    const result = await handleFollowUpLead(job, {
      checker: async () => needsFollowUp,
      phoneLookup: async () => "+34600000020",
    });

    expect(result.success).toBe(true);
    expect(mockSendFollowUp).toHaveBeenCalledWith(
      "+34600000020",
      expect.objectContaining({ step: "D+7" }),
    );
  });
});

function makeMicrositeJob(
  payload: Record<string, unknown>,
  overrides: Partial<JobRecord> = {},
): JobRecord {
  return {
    id: "job-ms-001",
    type: "GENERATE_MICROSITE",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 100,
    attempts: 1,
    maxAttempts: 5,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test-worker",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: "evt-source-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockDemandCurrent(): void {
  vi.mocked(prisma.demandCurrent.findUnique).mockResolvedValue({
    nombre: "Luis",
    tipos: "Piso",
    zonas: "Fuensanta",
    presupuestoMin: 105000,
    presupuestoMax: 140000,
    habitacionesMin: 2,
  });
}

describe("GENERATE_MICROSITE job handler", () => {
  const handler = getJobHandler("GENERATE_MICROSITE")!;

  it("registra evento, alerta y avisa al comprador si la búsqueda externa está desactivada en flujo conversacional", async () => {
    mockDemandCurrent();
    mockGenerateMicrositeSelection.mockResolvedValue({
      ok: false,
      reason: "EXTERNAL_SEARCH_DISABLED",
    });
    mockResolveBuyerPhone.mockResolvedValue("34677277324");
    mockSendText.mockResolvedValue({
      messaging_product: "whatsapp",
      contacts: [{ input: "34677277324", wa_id: "34677277324" }],
      messages: [{ id: "wamid.delay" }],
    });

    const result = await handler(
      makeMicrositeJob({
        demandId: "40116955",
        comercialId: "system",
        source: "conversational_agent",
        sourceEventId: "evt-source-001",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockAlertGeneric).toHaveBeenCalledWith(
      "Generación de microsite omitida",
      "warning",
      expect.objectContaining({
        demandId: "40116955",
        reason: "EXTERNAL_SEARCH_DISABLED",
      }),
    );
    expect(mockSendText).toHaveBeenCalledWith(
      "34677277324",
      expect.stringContaining("no he podido generar una selección fiable"),
      expect.objectContaining({
        trace: expect.objectContaining({
          kind: "microsite_generation_delayed",
        }),
      }),
    );
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MICROSITE_GENERACION_RESULTADO",
        aggregateType: "DEMAND",
        aggregateId: "40116955",
        payload: expect.objectContaining({
          status: "skipped",
          reason: "EXTERNAL_SEARCH_DISABLED",
          jobId: "job-ms-001",
        }),
      }),
    );
  });

  it("respeta notifyOnEmpty=false y no avisa al comprador cuando no hay propiedades en coverage", async () => {
    mockDemandCurrent();
    mockGenerateMicrositeSelection.mockResolvedValue({
      ok: false,
      reason: "NO_MATCHING_PROPERTIES",
    });

    const result = await handler(
      makeMicrositeJob({
        demandId: "40116955",
        comercialId: "system",
        source: "coverage_scan",
        notifyOnEmpty: false,
      }),
    );

    expect(result.success).toBe(true);
    expect(mockSendNoStock).not.toHaveBeenCalled();
    expect(mockSendText).not.toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MICROSITE_GENERACION_RESULTADO",
        payload: expect.objectContaining({
          status: "skipped",
          reason: "NO_MATCHING_PROPERTIES",
          notifyOnEmpty: false,
        }),
      }),
    );
  });

  it("mantiene el camino ok y registra resultado created tras auto-aprobación", async () => {
    mockDemandCurrent();
    mockGenerateMicrositeSelection.mockResolvedValue({
      ok: true,
      token: "token-123",
      selectionId: "sel-123",
      propertiesCount: 4,
      stockCount: 12,
    });
    mockApproveMicrositeByAI.mockResolvedValue({ ok: true });

    const result = await handler(
      makeMicrositeJob({
        demandId: "40116955",
        comercialId: "system",
        source: "conversational_agent",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockApproveMicrositeByAI).toHaveBeenCalledWith("sel-123");
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "MICROSITE_GENERACION_RESULTADO",
        payload: expect.objectContaining({
          status: "created",
          selectionId: "sel-123",
          selectionToken: "token-123",
          propertiesCount: 4,
          stockCount: 12,
        }),
      }),
    );
  });
});
