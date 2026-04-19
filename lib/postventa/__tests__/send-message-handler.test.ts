import { describe, it, expect, vi, beforeEach } from "vitest";

const mockLegalDocPartyFindFirst = vi.fn();
const mockEventFindFirst = vi.fn();
const mockDemandCurrentFindUnique = vi.fn();
const mockPropertyCurrentFindUnique = vi.fn();
const mockComercialFindFirst = vi.fn();
const mockOperacionFindUnique = vi.fn();
const mockPostventaSessionFindUnique = vi.fn();
const mockEnqueueJob = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    legalDocumentParty: {
      findFirst: (...args: unknown[]) => mockLegalDocPartyFindFirst(...args),
    },
    event: {
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
    },
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockDemandCurrentFindUnique(...args),
    },
    propertyCurrent: {
      findUnique: (...args: unknown[]) => mockPropertyCurrentFindUnique(...args),
    },
    comercial: {
      findFirst: (...args: unknown[]) => mockComercialFindFirst(...args),
    },
    operacion: {
      findUnique: (...args: unknown[]) => mockOperacionFindUnique(...args),
    },
    postventaSurveySession: {
      findUnique: (...args: unknown[]) => mockPostventaSessionFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => mockEnqueueJob(...args),
}));

const mockSendAgradecimiento = vi.fn();
const mockSendSoporte = vi.fn();
const mockSendResena = vi.fn();
const mockSendReferidos = vi.fn();
const mockSendRecaptacion = vi.fn();
const mockSendCumpleanos = vi.fn();
const mockSendNavidad = vi.fn();

vi.mock("@/lib/whatsapp/send", () => ({
  sendPostventaAgradecimiento: (...args: unknown[]) => mockSendAgradecimiento(...args),
  sendPostventaSoporte: (...args: unknown[]) => mockSendSoporte(...args),
  sendPostventaResena: (...args: unknown[]) => mockSendResena(...args),
  sendPostventaReferidos: (...args: unknown[]) => mockSendReferidos(...args),
  sendPostventaRecaptacion: (...args: unknown[]) => mockSendRecaptacion(...args),
  sendPostventaCumpleanos: (...args: unknown[]) => mockSendCumpleanos(...args),
  sendPostventaNavidad: (...args: unknown[]) => mockSendNavidad(...args),
}));

const mockSendFormulario = vi.fn();
vi.mock("@/lib/postventa/whatsapp", () => ({
  sendPostventaFormulario: (...args: unknown[]) => mockSendFormulario(...args),
}));

const mockResolveComercialByProperty = vi.fn();
vi.mock("@/lib/routing/resolve-comercial", () => ({
  resolveComercialByProperty: (...args: unknown[]) => mockResolveComercialByProperty(...args),
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: () => "https://app.test",
}));

import { handleSendPostventaMessage } from "../send-message-handler";
import type { JobRecord } from "@/lib/job-queue/types";

function makeJob(payload: unknown): JobRecord {
  return {
    id: "job-1",
    type: "SEND_POSTVENTA_MESSAGE",
    status: "IN_PROGRESS",
    payload,
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
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function setupBuyerFromLegalDoc(phone: string, name: string) {
  mockLegalDocPartyFindFirst.mockResolvedValue({ phone, fullName: name });
}

function setupNoBuyer() {
  mockLegalDocPartyFindFirst.mockResolvedValue(null);
  mockEventFindFirst.mockResolvedValue(null);
}

function setupComercial(name: string) {
  mockResolveComercialByProperty.mockResolvedValue({ nombre: name });
}

describe("handleSendPostventaMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AGENCY_NAME = "Test Agency";
    process.env.GOOGLE_REVIEW_URL = "https://g.page/r/test";
    mockPostventaSessionFindUnique.mockResolvedValue(null);
    mockOperacionFindUnique.mockResolvedValue(null);
  });

  it("envía agradecimiento D0 con datos del comprador", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");
    setupComercial("María López");

    const job = makeJob({
      propertyCode: "P-1",
      step: "D0_AGRADECIMIENTO",
      template: "agradecimiento",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(true);
    expect(mockSendAgradecimiento).toHaveBeenCalledWith(
      "34600111222",
      expect.objectContaining({
        buyerName: "Juan García",
        agencyName: "Test Agency",
        comercialName: "María López",
      }),
      expect.objectContaining({ useTemplate: true }),
    );
  });

  it("envía soporte D3 con URL de guía", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");
    setupComercial("María López");

    const job = makeJob({
      propertyCode: "P-1",
      step: "D3_SOPORTE",
      template: "soporte",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(true);
    expect(mockSendSoporte).toHaveBeenCalledWith(
      "34600111222",
      expect.objectContaining({
        buyerName: "Juan García",
        guideUrl: "https://app.test/postventa/guia",
        propertyCode: "P-1",
      }),
      expect.objectContaining({ useTemplate: true }),
    );
  });

  it("omite envío D10 si hay incidencia abierta", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");

    const closedAt = new Date("2026-01-01").toISOString();
    mockEventFindFirst
      .mockResolvedValueOnce({ id: "inc-1", occurredAt: new Date("2026-01-05") })
      .mockResolvedValueOnce(null);

    const job = makeJob({
      propertyCode: "P-1",
      step: "D10_RESENA",
      template: "resena",
      closedAt,
      requiresNoIncidencia: true,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(true);
    expect(mockSendResena).not.toHaveBeenCalled();
  });

  it("envía D10 si la incidencia fue resuelta", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");
    setupComercial("María López");

    const closedAt = new Date("2026-01-01").toISOString();
    mockEventFindFirst
      .mockResolvedValueOnce({ id: "inc-1", occurredAt: new Date("2026-01-05") })
      .mockResolvedValueOnce({ id: "res-1", occurredAt: new Date("2026-01-06") });

    const job = makeJob({
      propertyCode: "P-1",
      step: "D10_RESENA",
      template: "resena",
      closedAt,
      requiresNoIncidencia: true,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(true);
    expect(mockSendResena).toHaveBeenCalled();
  });

  it("completa sin envío si no hay datos de comprador", async () => {
    setupNoBuyer();

    const job = makeJob({
      propertyCode: "P-1",
      step: "D0_AGRADECIMIENTO",
      template: "agradecimiento",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(true);
    expect(mockSendAgradecimiento).not.toHaveBeenCalled();
  });

  it("retorna error permanente si payload es incompleto", async () => {
    const job = makeJob({ propertyCode: "P-1" });
    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("retorna error permanente si el template es desconocido", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");
    setupComercial("María López");

    const job = makeJob({
      propertyCode: "P-1",
      step: "UNKNOWN",
      template: "inexistente",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("D0 y D3 no verifican incidencias (requiresNoIncidencia=false)", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");
    setupComercial("María López");

    const job = makeJob({
      propertyCode: "P-1",
      step: "D0_AGRADECIMIENTO",
      template: "agradecimiento",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
    });

    await handleSendPostventaMessage(job);

    expect(mockSendAgradecimiento).toHaveBeenCalled();
    const incidenciaCalls = mockEventFindFirst.mock.calls.filter(
      (c: unknown[]) => {
        const arg = c[0] as { where?: { type?: string } } | undefined;
        return arg?.where?.type === "INCIDENCIA_POSTVENTA_ABIERTA";
      },
    );
    expect(incidenciaCalls.length).toBe(0);
  });

  it("retorna error transitorio si el envío WhatsApp falla", async () => {
    setupBuyerFromLegalDoc("34600111222", "Juan García");
    setupComercial("María López");
    mockSendAgradecimiento.mockRejectedValue(new Error("WA timeout"));

    const job = makeJob({
      propertyCode: "P-1",
      step: "D0_AGRADECIMIENTO",
      template: "agradecimiento",
      closedAt: new Date().toISOString(),
      requiresNoIncidencia: false,
    });

    const result = await handleSendPostventaMessage(job);

    expect(result.success).toBe(false);
    expect(result.error).toContain("WA timeout");
    expect(result.permanent).toBeUndefined();
  });
});
