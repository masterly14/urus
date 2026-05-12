import { beforeEach, describe, expect, it, vi } from "vitest";
import { startNluInitialContactForDemand } from "../initial-contact";

const mockDemandFindUnique = vi.fn();
const mockSnapshotFindUnique = vi.fn();
const mockSessionFindUnique = vi.fn();
const mockSessionUpsert = vi.fn();
const mockAppendEvent = vi.fn();
const mockSendTemplate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demandCurrent: {
      findUnique: (...args: unknown[]) => mockDemandFindUnique(...args),
    },
    demandSnapshot: {
      findUnique: (...args: unknown[]) => mockSnapshotFindUnique(...args),
    },
    whatsAppBuyerSession: {
      findUnique: (...args: unknown[]) => mockSessionFindUnique(...args),
      upsert: (...args: unknown[]) => mockSessionUpsert(...args),
    },
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: (...args: unknown[]) => mockAppendEvent(...args),
}));

vi.mock("@/lib/whatsapp/send", () => ({
  WHATSAPP_TEMPLATES: {
    NLU_DEMANDA_CONTACTO_INICIAL: "nlu_demanda_contacto_inicial",
  },
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplate(...args),
}));

function demand(overrides: Record<string, unknown> = {}) {
  return {
    codigo: "DEM-001",
    nombre: "Laura",
    telefono: "+34 600 111 222",
    leadStatus: "NUEVO",
    ...overrides,
  };
}

describe("startNluInitialContactForDemand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDemandFindUnique.mockResolvedValue(demand());
    mockSnapshotFindUnique.mockResolvedValue({ raw: {} });
    mockSessionFindUnique.mockResolvedValue(null);
    mockSessionUpsert.mockResolvedValue({});
    mockAppendEvent.mockResolvedValue({ id: "evt-nlu-contact" });
    mockSendTemplate.mockResolvedValue({ messages: [{ id: "wamid.test" }] });
  });

  it("envia plantilla y crea sesion para demanda con telefono valido", async () => {
    const result = await startNluInitialContactForDemand({ demandId: "DEM-001" });

    expect(result).toMatchObject({
      ok: true,
      sent: true,
      waId: "+34600111222",
      messageId: "wamid.test",
    });
    expect(mockSessionUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { waId: "+34600111222" },
      create: expect.objectContaining({
        demandId: "DEM-001",
        conversationPhase: "initial_nlu_discovery",
      }),
    }));
    expect(mockSendTemplate).toHaveBeenCalledWith(
      "+34600111222",
      expect.objectContaining({ name: "nlu_demanda_contacto_inicial" }),
      expect.objectContaining({ trace: expect.objectContaining({ source: "nlu_initial_contact" }) }),
    );
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "NLU_CONTACTO_INICIADO",
      aggregateType: "DEMAND",
      aggregateId: "DEM-001",
      payload: expect.objectContaining({
        sent: true,
        skippedReason: null,
        messageId: "wamid.test",
      }),
    }));
  });

  it("persiste source y triggeredBy en el evento de contacto", async () => {
    await startNluInitialContactForDemand({
      demandId: "DEM-001",
      source: "manual_ui",
      triggeredBy: {
        userId: "user-1",
        nombre: "Comercial",
      },
    });

    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({
        source: "manual_ui",
        triggeredBy: {
          userId: "user-1",
          nombre: "Comercial",
        },
      }),
    }));
  });

  it("dry-run crea sesion y evento sin enviar WhatsApp real", async () => {
    const result = await startNluInitialContactForDemand({ demandId: "DEM-001", dryRun: true });

    expect(result).toMatchObject({ sent: true, dryRun: true });
    expect(mockSessionUpsert).toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      payload: expect.objectContaining({ dryRun: true, messageId: null }),
    }));
  });

  it("omite demanda sin telefono", async () => {
    mockDemandFindUnique.mockResolvedValue(demand({ telefono: "" }));

    const result = await startNluInitialContactForDemand({ demandId: "DEM-001" });

    expect(result).toMatchObject({ sent: false, skippedReason: "missing_phone" });
    expect(mockSessionUpsert).not.toHaveBeenCalled();
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it("omite estados terminales", async () => {
    mockDemandFindUnique.mockResolvedValue(demand({ leadStatus: "PERDIDO" }));

    const result = await startNluInitialContactForDemand({ demandId: "DEM-001" });

    expect(result).toMatchObject({ sent: false, skippedReason: "terminal_status" });
  });

  it("omite opt-out desde snapshot", async () => {
    mockSnapshotFindUnique.mockResolvedValue({ raw: { noContactar: true } });

    const result = await startNluInitialContactForDemand({ demandId: "DEM-001" });

    expect(result).toMatchObject({ sent: false, skippedReason: "opt_out" });
  });

  it("omite sesion reciente para evitar duplicados", async () => {
    mockSessionFindUnique.mockResolvedValue({
      demandId: "DEM-001",
      conversationPhase: "initial_nlu_discovery",
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await startNluInitialContactForDemand({ demandId: "DEM-001" });

    expect(result).toMatchObject({ sent: false, skippedReason: "recent_session" });
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it("permite recontactar si la sesion es antigua", async () => {
    mockSessionFindUnique.mockResolvedValue({
      demandId: "DEM-001",
      conversationPhase: "initial_nlu_discovery",
      lastMessageAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const result = await startNluInitialContactForDemand({ demandId: "DEM-001" });

    expect(result.sent).toBe(true);
    expect(mockSendTemplate).toHaveBeenCalled();
  });

  it("emite skip si la demanda no existe", async () => {
    mockDemandFindUnique.mockResolvedValue(null);

    const result = await startNluInitialContactForDemand({ demandId: "DEM-404" });

    expect(result).toMatchObject({
      ok: false,
      sent: false,
      skippedReason: "demand_not_found",
    });
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      aggregateId: "DEM-404",
      payload: expect.objectContaining({ skippedReason: "demand_not_found" }),
    }));
  });

  it("personaliza el cuerpo con zona y presupuesto reales de la demanda", async () => {
    mockDemandFindUnique.mockResolvedValue(
      demand({
        zonas: "Centro, Macarena",
        presupuestoMax: 220000,
        presupuestoMin: 150000,
        habitacionesMin: 3,
        tipos: "Piso",
      }),
    );

    await startNluInitialContactForDemand({ demandId: "DEM-001" });

    const sendCall = mockSendTemplate.mock.calls[0];
    expect(sendCall).toBeDefined();
    const template = sendCall![1] as { components: Array<{ parameters: Array<{ text: string }> }> };
    const body = template.components[0]?.parameters[1]?.text ?? "";
    expect(body).toContain("Centro");
    expect(body).toContain("220.000€");

    expect(mockSessionUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          buyerDigest: expect.stringContaining("Presupuesto: 150.000–220.000€"),
        }),
      }),
    );
  });

  it("usa solo el primer nombre del comprador en la plantilla", async () => {
    mockDemandFindUnique.mockResolvedValue(
      demand({ nombre: "JUAN PÉREZ FERNÁNDEZ" }),
    );

    await startNluInitialContactForDemand({ demandId: "DEM-001" });

    const sendCall = mockSendTemplate.mock.calls[0];
    const template = sendCall![1] as { components: Array<{ parameters: Array<{ text: string }> }> };
    const nameParam = template.components[0]?.parameters[0]?.text ?? "";
    expect(nameParam).toBe("Juan");
  });

  it("cae a copy neutral cuando la demanda no tiene zona ni presupuesto", async () => {
    mockDemandFindUnique.mockResolvedValue(
      demand({ zonas: "", presupuestoMax: 0, presupuestoMin: 0 }),
    );

    await startNluInitialContactForDemand({ demandId: "DEM-001" });

    const sendCall = mockSendTemplate.mock.calls[0];
    const template = sendCall![1] as { components: Array<{ parameters: Array<{ text: string }> }> };
    const body = template.components[0]?.parameters[1]?.text ?? "";
    expect(body).not.toContain("0€");
    expect(body).toMatch(/zona|presupuesto/i);
  });
});
