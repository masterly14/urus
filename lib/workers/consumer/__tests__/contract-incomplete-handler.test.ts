import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/whatsapp/send", () => ({
  sendLeadAssignedToCommercial: vi.fn(),
  sendFollowUpToCommercial: vi.fn(),
  sendTextMessage: vi.fn(),
  sendTemplateMessage: vi.fn(),
  sendMicrositePendingValidationToCommercial: vi.fn(),
  sendMicrositeLinkToBuyer: vi.fn(),
  sendContractDataIncompleteToCommercial: vi.fn(),
}));

vi.mock("@/lib/leads/follow-up-checker", () => ({
  checkLeadNeedsFollowUp: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    comercial: { findUnique: vi.fn() },
  },
}));

import { getJobHandler } from "../job-handlers";
import { sendContractDataIncompleteToCommercial } from "@/lib/whatsapp/send";
import { prisma } from "@/lib/prisma";
import type { JobRecord } from "@/lib/job-queue/types";

const mockSendIncomplete = vi.mocked(sendContractDataIncompleteToCommercial);
const mockComercialFindUnique = vi.mocked(prisma.comercial.findUnique);

function makeContractIncompleteJob(
  payload: Record<string, unknown>,
  overrides: Partial<JobRecord> = {},
): JobRecord {
  return {
    id: "job-ci-001",
    type: "NOTIFY_CONTRACT_DATA_INCOMPLETE",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 20,
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
});

describe("NOTIFY_CONTRACT_DATA_INCOMPLETE job handler", () => {
  const handler = getJobHandler("NOTIFY_CONTRACT_DATA_INCOMPLETE")!;

  it("handler está registrado", () => {
    expect(handler).toBeDefined();
    expect(typeof handler).toBe("function");
  });

  it("envía WhatsApp cuando comercial tiene teléfono", async () => {
    mockComercialFindUnique.mockResolvedValue({
      id: "com-1",
      nombre: "Pedro",
      telefono: "+34600111222",
      email: "",
      ciudad: "Cordoba",
      especialidad: "general",
      activo: true,
      cargaActual: 0,
      cargaMaxima: 20,
      leadsAsignados: 0,
      leadsCerrados: 0,
      tasaConversion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSendIncomplete.mockResolvedValue({
      messaging_product: "whatsapp",
      contacts: [{ input: "+34600111222", wa_id: "34600111222" }],
      messages: [{ id: "wamid.ci1" }],
    });

    const job = makeContractIncompleteJob({
      operationId: "OP-2026-001",
      demandId: "DEM-100",
      assignedCommercialId: "com-1",
      description: "Faltan datos obligatorios: dni, domicilio.",
      missingRequiredCategories: ["dni", "domicilio"],
    });

    const result = await handler(job);

    expect(result.success).toBe(true);
    expect(mockSendIncomplete).toHaveBeenCalledTimes(1);
    expect(mockSendIncomplete).toHaveBeenCalledWith(
      "+34600111222",
      expect.objectContaining({
        operationId: "OP-2026-001",
        demandId: "DEM-100",
        missingCategories: ["dni", "domicilio"],
      }),
    );
  });

  it("completa sin envío cuando comercial es 'system'", async () => {
    const job = makeContractIncompleteJob({
      operationId: "OP-2026-002",
      demandId: "DEM-200",
      assignedCommercialId: "system",
      description: "Faltan datos.",
      missingRequiredCategories: ["precio"],
    });

    const result = await handler(job);

    expect(result.success).toBe(true);
    expect(mockSendIncomplete).not.toHaveBeenCalled();
  });

  it("completa sin envío cuando comercial no tiene teléfono", async () => {
    mockComercialFindUnique.mockResolvedValue({
      id: "com-no-phone",
      nombre: "Sin Tel",
      telefono: "",
      email: "",
      ciudad: "Malaga",
      especialidad: "general",
      activo: true,
      cargaActual: 0,
      cargaMaxima: 20,
      leadsAsignados: 0,
      leadsCerrados: 0,
      tasaConversion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const job = makeContractIncompleteJob({
      operationId: "OP-2026-003",
      demandId: "DEM-300",
      assignedCommercialId: "com-no-phone",
      description: "Faltan datos.",
      missingRequiredCategories: ["plazos"],
    });

    const result = await handler(job);

    expect(result.success).toBe(true);
    expect(mockSendIncomplete).not.toHaveBeenCalled();
  });

  it("falla permanentemente sin operationId", async () => {
    const job = makeContractIncompleteJob({
      demandId: "DEM-400",
      assignedCommercialId: "com-1",
    });

    const result = await handler(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("propaga error de WhatsApp API", async () => {
    mockComercialFindUnique.mockResolvedValue({
      id: "com-err",
      nombre: "Error",
      telefono: "+34600999888",
      email: "",
      ciudad: "Sevilla",
      especialidad: "general",
      activo: true,
      cargaActual: 0,
      cargaMaxima: 20,
      leadsAsignados: 0,
      leadsCerrados: 0,
      tasaConversion: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSendIncomplete.mockRejectedValue(new Error("Meta API 429"));

    const job = makeContractIncompleteJob({
      operationId: "OP-ERR",
      demandId: "DEM-ERR",
      assignedCommercialId: "com-err",
      description: "Test error.",
      missingRequiredCategories: [],
    });

    const result = await handler(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Meta API 429");
  });
});
