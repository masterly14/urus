import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  sessionFindFirstMock,
  sessionFindUniqueMock,
  sessionUpdateMock,
  comercialFindUniqueMock,
  comercialFindFirstMock,
} = vi.hoisted(() => ({
  sessionFindFirstMock: vi.fn(),
  sessionFindUniqueMock: vi.fn(),
  sessionUpdateMock: vi.fn(),
  comercialFindUniqueMock: vi.fn(),
  comercialFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notaEncargoSession: {
      findFirst: sessionFindFirstMock,
      findUnique: sessionFindUniqueMock,
      update: sessionUpdateMock,
    },
    comercial: {
      findUnique: comercialFindUniqueMock,
      findFirst: comercialFindFirstMock,
    },
  },
}));

const { appendEventMock, publishFormularioMock } = vi.hoisted(() => ({
  appendEventMock: vi.fn(),
  publishFormularioMock: vi.fn(),
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: appendEventMock,
}));

vi.mock("@/lib/nota-encargo/schedule", () => ({
  publishNotaEncargoFormularioSchedule: publishFormularioMock,
  publishNotaEncargoRecordatorioSchedule: vi.fn(),
  publishNotaEncargoCheckConfirmacionSchedule: vi.fn(),
  publishNotaEncargoMatchingCheckSchedule: vi.fn(),
  scheduleNotaEncargoInitialSteps: vi.fn(),
}));

const { handleFlowResponseMock } = vi.hoisted(() => ({
  handleFlowResponseMock: vi.fn(),
}));

vi.mock("@/lib/nota-encargo/send-to-signature", () => ({
  handleNotaEncargoFlowResponse: handleFlowResponseMock,
}));

import {
  handleNotaEncargoButtonReply,
  handleNotaEncargoNfmReply,
} from "../webhook-handler";

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
    state: "RECORDATORIO_ENVIADO",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleNotaEncargoButtonReply
// ---------------------------------------------------------------------------

describe("handleNotaEncargoButtonReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionUpdateMock.mockResolvedValue({});
    publishFormularioMock.mockResolvedValue({
      messageId: "qstash-1",
      sendAtIso: "2026-04-16T16:00:00.000Z",
    });
    appendEventMock.mockResolvedValue({ id: "evt-1" });
  });

  it("returns false for unrelated button IDs", async () => {
    const result = await handleNotaEncargoButtonReply(
      "34666777888",
      "some_other_button",
    );
    expect(result).toBe(false);
  });

  it("handles 'nota_encargo_confirmo': updates state and schedules formulario in QStash", async () => {
    sessionFindFirstMock.mockResolvedValue(makeSession());

    const result = await handleNotaEncargoButtonReply(
      "34666777888",
      "nota_encargo_confirmo",
    );

    expect(result).toBe(true);
    expect(sessionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { state: "CONFIRMADA" },
      }),
    );
    expect(publishFormularioMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        sendAt: expect.any(Date),
      }),
    );
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTA_ENCARGO_CONFIRMADA",
        aggregateId: "PROP-001",
      }),
    );
  });

  it("handles 'nota_encargo_no_puedo': returns true but does not update state", async () => {
    sessionFindFirstMock.mockResolvedValue(makeSession());

    const result = await handleNotaEncargoButtonReply(
      "34666777888",
      "nota_encargo_no_puedo",
    );

    expect(result).toBe(true);
    expect(sessionUpdateMock).not.toHaveBeenCalled();
    expect(publishFormularioMock).not.toHaveBeenCalled();
  });

  it("returns false when no session matches the phone", async () => {
    sessionFindFirstMock.mockResolvedValue(null);

    const result = await handleNotaEncargoButtonReply(
      "34999999999",
      "nota_encargo_confirmo",
    );

    expect(result).toBe(false);
  });

  it("matches session when wa_id has country prefix but stored phone does not", async () => {
    sessionFindFirstMock.mockResolvedValue(makeSession());

    const result = await handleNotaEncargoButtonReply(
      "34666777888",
      "nota_encargo_confirmo",
    );

    expect(result).toBe(true);
    expect(sessionFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          propietarioPhone: { endsWith: "666777888" },
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// handleNotaEncargoNfmReply
// ---------------------------------------------------------------------------

describe("handleNotaEncargoNfmReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleFlowResponseMock.mockResolvedValue(undefined);
    comercialFindUniqueMock.mockResolvedValue({
      id: "comercial-1",
      nombre: "Miguel",
      telefono: "34600111222",
      waId: null,
      activo: true,
    });
  });

  it("returns false for invalid JSON", async () => {
    const result = await handleNotaEncargoNfmReply(
      "34666777888",
      "not-json",
    );
    expect(result).toBe(false);
  });

  it("returns false when flow_token is missing", async () => {
    const result = await handleNotaEncargoNfmReply(
      "34666777888",
      JSON.stringify({ nombre: "Juan" }),
    );
    expect(result).toBe(false);
  });

  it("returns false when session not found", async () => {
    sessionFindUniqueMock.mockResolvedValue(null);

    const result = await handleNotaEncargoNfmReply(
      "34666777888",
      JSON.stringify({ flow_token: "session-x" }),
    );

    expect(result).toBe(false);
  });

  it("returns false when session is not in FORMULARIO_ENVIADO state", async () => {
    sessionFindUniqueMock.mockResolvedValue(
      makeSession({ id: "session-1", state: "CONFIRMADA" }),
    );

    const result = await handleNotaEncargoNfmReply(
      "34666777888",
      JSON.stringify({ flow_token: "session-1" }),
    );

    expect(result).toBe(false);
  });

  it("calls handleNotaEncargoFlowResponse for valid submission", async () => {
    const session = makeSession({
      id: "session-1",
      state: "FORMULARIO_ENVIADO",
    });
    sessionFindUniqueMock.mockResolvedValue(session);

    const formData = {
      flow_token: "session-1",
      nombre_completo: "Juan García",
      dni: "12345678A",
      telefono: "666777888",
      domicilio_fiscal: "Calle Mayor 1",
      duracion_meses: "6",
      tipo_nota: "N2",
      acepta_lopd: true,
    };

    const result = await handleNotaEncargoNfmReply(
      "34600111222",
      JSON.stringify(formData),
    );

    expect(result).toBe(true);
    expect(handleFlowResponseMock).toHaveBeenCalledWith(session, formData);
  });

  it("returns false when nfm reply comes from non-comercial number", async () => {
    sessionFindUniqueMock.mockResolvedValue(
      makeSession({ id: "session-1", state: "FORMULARIO_ENVIADO" }),
    );

    const result = await handleNotaEncargoNfmReply(
      "34699988877",
      JSON.stringify({ flow_token: "session-1" }),
    );

    expect(result).toBe(false);
    expect(handleFlowResponseMock).not.toHaveBeenCalled();
  });
});
