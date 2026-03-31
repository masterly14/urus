import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pricing", () => ({
  runPricingAnalysis: vi.fn(),
  PricingDataIncompleteError: class extends Error {
    missingFields: string[];
    constructor(code: string, fields: string[]) {
      super(`Datos incompletos: ${fields.join(", ")}`);
      this.name = "PricingDataIncompleteError";
      this.missingFields = fields;
    }
  },
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  sendPricingReportToCommercial: vi.fn(),
  sendTextMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
}));

vi.mock("@/lib/routing/resolve-property-agent", () => ({
  resolveAgentPhoneByProperty: vi.fn(),
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: () => "https://app.urus.es",
}));

import { handlePricingAnalysis } from "../pricing-handler";
import { handleNotifyPricingWhatsApp } from "../pricing-notify-handler";
import { runPricingAnalysis, PricingDataIncompleteError } from "@/lib/pricing";
import { enqueueJob } from "@/lib/job-queue";
import { sendPricingReportToCommercial } from "@/lib/whatsapp/send";
import { resolveAgentPhoneByProperty } from "@/lib/routing/resolve-property-agent";
import type { JobRecord } from "@/lib/job-queue/types";

const mockRunPricing = vi.mocked(runPricingAnalysis);
const mockEnqueue = vi.mocked(enqueueJob);
const mockSendPricing = vi.mocked(sendPricingReportToCommercial);
const mockResolveAgent = vi.mocked(resolveAgentPhoneByProperty);

function makeJob(
  type: string,
  payload: Record<string, unknown>,
  overrides: Partial<JobRecord> = {},
): JobRecord {
  return {
    id: `job-${type}-001`,
    type: type as JobRecord["type"],
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
    sourceEventId: "event-001",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── RUN_PRICING_ANALYSIS ──────────────────────────────────────────────────────

describe("handlePricingAnalysis (RUN_PRICING_ANALYSIS)", () => {
  it("ejecuta runPricingAnalysis y encola NOTIFY_PRICING_WHATSAPP en éxito", async () => {
    const mockResult = {
      propertyCode: "PROP-001",
      stats: {
        semaforo: "verde",
        gapPorcentaje: 3.4,
        totalComparables: 8,
        precioMedioM2: 2900,
        precioMedianaM2: 2850,
        precioMinM2: 2600,
        precioMaxM2: 3200,
        desviacionEstandar: 150,
        precioMedioM2Particular: null,
        precioMedioM2Profesional: null,
      },
      analyzedAt: "2026-03-30T10:00:00Z",
      recommendation: { accion: "mantener" },
      input: {},
      comparables: [],
      queryMeta: {},
    };
    mockRunPricing.mockResolvedValue(mockResult as never);
    mockEnqueue.mockResolvedValue({} as never);

    const job = makeJob("RUN_PRICING_ANALYSIS", { propertyCode: "PROP-001" });
    const result = await handlePricingAnalysis(job);

    expect(result.success).toBe(true);
    expect(mockRunPricing).toHaveBeenCalledWith("PROP-001");
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTIFY_PRICING_WHATSAPP",
        payload: expect.objectContaining({
          propertyCode: "PROP-001",
          semaforo: "verde",
          gapPorcentaje: 3.4,
          accion: "mantener",
        }),
        idempotencyKey: "notify-pricing:PROP-001:2026-03-30T10:00:00Z",
      }),
    );
  });

  it("maneja PricingDataIncompleteError como completado sin notificación", async () => {
    mockRunPricing.mockRejectedValue(
      new PricingDataIncompleteError("PROP-002", ["precio", "ciudad"]),
    );

    const job = makeJob("RUN_PRICING_ANALYSIS", { propertyCode: "PROP-002" });
    const result = await handlePricingAnalysis(job);

    expect(result.success).toBe(true);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("devuelve error retriable para fallos genéricos", async () => {
    mockRunPricing.mockRejectedValue(new Error("Statefox timeout"));

    const job = makeJob("RUN_PRICING_ANALYSIS", { propertyCode: "PROP-003" });
    const result = await handlePricingAnalysis(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Statefox timeout");
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("falla si el job no tiene propertyCode", async () => {
    const job = makeJob("RUN_PRICING_ANALYSIS", {});
    const result = await handlePricingAnalysis(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain("propertyCode");
    expect(mockRunPricing).not.toHaveBeenCalled();
  });
});

// ── NOTIFY_PRICING_WHATSAPP ───────────────────────────────────────────────────

describe("handleNotifyPricingWhatsApp (NOTIFY_PRICING_WHATSAPP)", () => {
  it("resuelve teléfono y envía WhatsApp", async () => {
    mockResolveAgent.mockResolvedValue({
      comercialId: "com-001",
      nombre: "Ana García",
      telefono: "34612345678",
    });
    mockSendPricing.mockResolvedValue({ messages: [{ id: "wamid-001" }] } as never);

    const job = makeJob("NOTIFY_PRICING_WHATSAPP", {
      propertyCode: "PROP-001",
      semaforo: "verde",
      gapPorcentaje: 3.4,
    });
    const result = await handleNotifyPricingWhatsApp(job);

    expect(result.success).toBe(true);
    expect(mockResolveAgent).toHaveBeenCalledWith("PROP-001");
    expect(mockSendPricing).toHaveBeenCalledWith(
      "34612345678",
      expect.objectContaining({
        comercialNombre: "Ana García",
        propertyCode: "PROP-001",
        semaforo: "VERDE",
        gapPorcentaje: "+3.4%",
        informeUrl: "https://app.urus.es/pricing/informe/PROP-001",
      }),
    );
  });

  it("completa sin envío si no hay teléfono", async () => {
    mockResolveAgent.mockResolvedValue(null);

    const job = makeJob("NOTIFY_PRICING_WHATSAPP", {
      propertyCode: "PROP-004",
      semaforo: "rojo",
      gapPorcentaje: 15.2,
    });
    const result = await handleNotifyPricingWhatsApp(job);

    expect(result.success).toBe(true);
    expect(mockSendPricing).not.toHaveBeenCalled();
  });

  it("falla si el job no tiene propertyCode", async () => {
    const job = makeJob("NOTIFY_PRICING_WHATSAPP", {});
    const result = await handleNotifyPricingWhatsApp(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain("propertyCode");
  });

  it("devuelve error si falla el envío WhatsApp", async () => {
    mockResolveAgent.mockResolvedValue({
      comercialId: "com-002",
      nombre: "Carlos López",
      telefono: "34698765432",
    });
    mockSendPricing.mockRejectedValue(new Error("Rate limit exceeded"));

    const job = makeJob("NOTIFY_PRICING_WHATSAPP", {
      propertyCode: "PROP-005",
      semaforo: "amarillo",
      gapPorcentaje: 8.1,
    });
    const result = await handleNotifyPricingWhatsApp(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rate limit exceeded");
  });
});
