import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockPublishJson = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parteVisitaSession: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON(...args: unknown[]) {
      return mockPublishJson(...args);
    }
  },
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: () => "https://test.example.com",
}));

import {
  scheduleParteVisitaFromDetails,
  republishExistingSession,
} from "../schedule";

const DETAILS = {
  visitSessionId: "visit-1",
  propertyCode: "P1",
  propertyRef: "REF-1",
  draftDemandId: null,
  comercialId: "com-1",
  buyerPhone: "34600000000",
  visitDateTime: new Date("2026-06-01T10:00:00Z"),
  direccion: "Calle Falsa 123",
  tipoOperacion: "VENTA",
  precio: 100_000,
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QSTASH_TOKEN = "test-token";
});

describe("scheduleParteVisitaFromDetails", () => {
  it("crea la sesión y publica en QStash cuando no existe (camino feliz)", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "parte-1" });
    mockPublishJson.mockResolvedValueOnce({ messageId: "msg_123" });
    mockUpdate.mockResolvedValueOnce({});

    const out = await scheduleParteVisitaFromDetails(DETAILS);

    expect(out).toEqual({
      status: "scheduled",
      parteVisitaSessionId: "parte-1",
      qstashMessageId: "msg_123",
      sendAtIso: "2026-06-01T10:00:00.000Z",
      created: true,
      republished: false,
    });
    expect(mockCreate).toHaveBeenCalledOnce();
    expect(mockPublishJson).toHaveBeenCalledOnce();
    const persistArgs = mockUpdate.mock.calls[0][0];
    expect(persistArgs.where).toEqual({ id: "parte-1" });
    expect(persistArgs.data.qstashMessageId).toBe("msg_123");
    expect(persistArgs.data.schedulePublishError).toBeNull();
  });

  it("si ya existe con qstashMessageId, no republica", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "parte-existing",
      state: "PENDING",
      qstashMessageId: "msg_existing",
    });

    const out = await scheduleParteVisitaFromDetails(DETAILS);

    expect(out).toEqual({
      status: "already_scheduled",
      parteVisitaSessionId: "parte-existing",
      qstashMessageId: "msg_existing",
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPublishJson).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("si ya existe SIN qstashMessageId (huérfana), republica — fix bug histórico", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "parte-orphan",
      state: "PENDING",
      qstashMessageId: null,
    });
    mockPublishJson.mockResolvedValueOnce({ messageId: "msg_rescue" });
    mockUpdate.mockResolvedValueOnce({});

    const out = await scheduleParteVisitaFromDetails(DETAILS);

    expect(out).toEqual({
      status: "scheduled",
      parteVisitaSessionId: "parte-orphan",
      qstashMessageId: "msg_rescue",
      sendAtIso: "2026-06-01T10:00:00.000Z",
      created: false,
      republished: true,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockPublishJson).toHaveBeenCalledOnce();
  });

  it("si el state ya no es PENDING, salta sin tocar nada", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "parte-done",
      state: "FORMULARIO_ENVIADO",
      qstashMessageId: null,
    });

    const out = await scheduleParteVisitaFromDetails(DETAILS);

    expect(out).toEqual({
      status: "skipped_terminal",
      parteVisitaSessionId: "parte-done",
      state: "FORMULARIO_ENVIADO",
    });
    expect(mockPublishJson).not.toHaveBeenCalled();
  });

  it("si QStash falla, NO lanza: persiste el error y devuelve publish_failed", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "parte-2" });
    mockPublishJson.mockRejectedValueOnce(new Error("QStash 503 Service Unavailable"));
    mockUpdate.mockResolvedValueOnce({});

    const out = await scheduleParteVisitaFromDetails(DETAILS);

    expect(out.status).toBe("publish_failed");
    if (out.status === "publish_failed") {
      expect(out.parteVisitaSessionId).toBe("parte-2");
      expect(out.error).toContain("QStash 503");
    }
    expect(mockCreate).toHaveBeenCalledOnce();
    const persistArgs = mockUpdate.mock.calls[0][0];
    expect(persistArgs.data.schedulePublishError).toContain("QStash 503");
  });

  it("si QSTASH_TOKEN falta, devuelve publish_failed (no lanza)", async () => {
    delete process.env.QSTASH_TOKEN;
    mockFindUnique.mockResolvedValueOnce(null);
    mockCreate.mockResolvedValueOnce({ id: "parte-3" });
    mockUpdate.mockResolvedValueOnce({});

    const out = await scheduleParteVisitaFromDetails(DETAILS);

    expect(out.status).toBe("publish_failed");
    if (out.status === "publish_failed") {
      expect(out.error).toContain("QSTASH_TOKEN");
    }
  });
});

describe("republishExistingSession", () => {
  it("publica y persiste para sesión huérfana (usado por el cron de rescate)", async () => {
    mockPublishJson.mockResolvedValueOnce({ messageId: "msg_late" });
    mockUpdate.mockResolvedValueOnce({});

    const out = await republishExistingSession({
      parteVisitaSessionId: "parte-late",
      visitDateTime: new Date("2026-06-01T10:00:00Z"),
    });

    expect(out).toEqual({
      status: "scheduled",
      parteVisitaSessionId: "parte-late",
      qstashMessageId: "msg_late",
      sendAtIso: "2026-06-01T10:00:00.000Z",
      created: false,
      republished: true,
    });
  });
});
