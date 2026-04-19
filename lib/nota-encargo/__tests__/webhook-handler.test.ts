import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  sessionFindFirstMock,
  sessionFindUniqueMock,
  sessionUpdateMock,
} = vi.hoisted(() => ({
  sessionFindFirstMock: vi.fn(),
  sessionFindUniqueMock: vi.fn(),
  sessionUpdateMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notaEncargoSession: {
      findFirst: sessionFindFirstMock,
      findUnique: sessionFindUniqueMock,
      update: sessionUpdateMock,
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
    enqueueJobMock.mockResolvedValue({ id: "job-1" });
    appendEventMock.mockResolvedValue({ id: "evt-1" });
  });

  it("returns false for unrelated button IDs", async () => {
    const result = await handleNotaEncargoButtonReply(
      "34666777888",
      "some_other_button",
    );
    expect(result).toBe(false);
  });

  it("handles 'nota_encargo_confirmo': updates state and enqueues formulario job", async () => {
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
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "NOTA_ENCARGO_ENVIAR_FORMULARIO",
        payload: { sessionId: "session-1" },
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
    expect(enqueueJobMock).not.toHaveBeenCalled();
  });

  it("returns false when no session matches the phone", async () => {
    sessionFindFirstMock.mockResolvedValue(null);

    const result = await handleNotaEncargoButtonReply(
      "34999999999",
      "nota_encargo_confirmo",
    );

    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// handleNotaEncargoNfmReply
// ---------------------------------------------------------------------------

describe("handleNotaEncargoNfmReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleFlowResponseMock.mockResolvedValue(undefined);
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
      "34666777888",
      JSON.stringify(formData),
    );

    expect(result).toBe(true);
    expect(handleFlowResponseMock).toHaveBeenCalledWith(session, formData);
  });
});
