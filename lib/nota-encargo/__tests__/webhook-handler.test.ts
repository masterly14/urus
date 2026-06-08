import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  sessionFindUniqueMock,
  comercialFindUniqueMock,
  comercialFindFirstMock,
} = vi.hoisted(() => ({
  sessionFindUniqueMock: vi.fn(),
  comercialFindUniqueMock: vi.fn(),
  comercialFindFirstMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notaEncargoSession: {
      findUnique: sessionFindUniqueMock,
    },
    comercial: {
      findUnique: comercialFindUniqueMock,
      findFirst: comercialFindFirstMock,
    },
  },
}));

const { handleFlowResponseMock } = vi.hoisted(() => ({
  handleFlowResponseMock: vi.fn(),
}));

vi.mock("@/lib/nota-encargo/send-to-signature", () => ({
  handleNotaEncargoFlowResponse: handleFlowResponseMock,
}));

import { handleNotaEncargoNfmReply } from "../webhook-handler";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    propertyCode: "PROP-001",
    propertyRef: "URUS36VMA",
    comercialId: "comercial-1",
    propietarioPhone: "34666777888",
    visitDateTime: new Date("2026-04-16T16:00:00Z"),
    state: "FORMULARIO_ENVIADO",
    ...overrides,
  };
}

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
    expect(await handleNotaEncargoNfmReply("34600111222", "not-json")).toBe(
      false,
    );
  });

  it("returns false when flow_token is missing", async () => {
    expect(
      await handleNotaEncargoNfmReply(
        "34600111222",
        JSON.stringify({ nombre: "Juan" }),
      ),
    ).toBe(false);
  });

  it("returns false when session not found", async () => {
    sessionFindUniqueMock.mockResolvedValue(null);
    expect(
      await handleNotaEncargoNfmReply(
        "34600111222",
        JSON.stringify({ flow_token: "session-x" }),
      ),
    ).toBe(false);
  });

  it("returns false when session is not in FORMULARIO_ENVIADO state", async () => {
    sessionFindUniqueMock.mockResolvedValue(
      makeSession({ state: "PENDING" }),
    );
    expect(
      await handleNotaEncargoNfmReply(
        "34600111222",
        JSON.stringify({ flow_token: "session-1" }),
      ),
    ).toBe(false);
  });

  it("calls handleNotaEncargoFlowResponse for valid submission from comercial", async () => {
    const session = makeSession();
    sessionFindUniqueMock.mockResolvedValue(session);

    const formData = {
      flow_token: "session-1",
      nombre_completo: "Juan García",
      dni: "12345678A",
    };

    const result = await handleNotaEncargoNfmReply(
      "34600111222",
      JSON.stringify(formData),
    );

    expect(result).toBe(true);
    expect(handleFlowResponseMock).toHaveBeenCalledWith(session, formData);
  });

  it("returns false when nfm reply comes from non-comercial number", async () => {
    sessionFindUniqueMock.mockResolvedValue(makeSession());
    expect(
      await handleNotaEncargoNfmReply(
        "34699988877",
        JSON.stringify({ flow_token: "session-1" }),
      ),
    ).toBe(false);
  });
});
