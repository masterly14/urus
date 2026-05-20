import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    parteVisitaSession: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const mockSendForSession = vi.fn();
vi.mock("../send", () => ({
  sendParteVisitaForSession: (...args: unknown[]) => mockSendForSession(...args),
}));

import { rescueOrphanParteVisitas } from "../rescue";

const NOW = new Date("2026-05-20T18:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("rescueOrphanParteVisitas", () => {
  it("aplica grace y lookback al WHERE de findMany", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await rescueOrphanParteVisitas({
      now: NOW,
      graceMinutes: 5,
      lookbackMinutes: 60,
      maxBatch: 10,
    });

    expect(mockFindMany).toHaveBeenCalledOnce();
    const args = mockFindMany.mock.calls[0][0];
    expect(args.where.state).toBe("PENDING");
    expect(args.where.visitDateTime.lte).toEqual(
      new Date("2026-05-20T17:55:00Z"),
    );
    expect(args.where.visitDateTime.gte).toEqual(
      new Date("2026-05-20T17:00:00Z"),
    );
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual({ visitDateTime: "asc" });
  });

  it("cuenta rescued cuando sendParteVisitaForSession devuelve sent", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "p1",
        visitDateTime: new Date("2026-05-20T17:00:00Z"),
        qstashMessageId: null,
      },
      {
        id: "p2",
        visitDateTime: new Date("2026-05-20T17:30:00Z"),
        qstashMessageId: "msg_abc",
      },
    ]);
    mockSendForSession
      .mockResolvedValueOnce({ ok: true, status: "sent" })
      .mockResolvedValueOnce({ ok: true, status: "sent" });

    const result = await rescueOrphanParteVisitas({ now: NOW });

    expect(result.scanned).toBe(2);
    expect(result.rescued).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.outcomes[0].hadQstashMessageId).toBe(false);
    expect(result.outcomes[1].hadQstashMessageId).toBe(true);
  });

  it("cuenta skipped cuando ya estaba enviado (race con QStash)", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "p1",
        visitDateTime: new Date("2026-05-20T17:00:00Z"),
        qstashMessageId: "msg_x",
      },
    ]);
    mockSendForSession.mockResolvedValueOnce({
      ok: true,
      status: "already_sent",
      sessionState: "FORMULARIO_ENVIADO",
    });

    const result = await rescueOrphanParteVisitas({ now: NOW });

    expect(result.rescued).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("cuenta failed cuando sendParteVisitaForSession falla", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "p1",
        visitDateTime: new Date("2026-05-20T17:00:00Z"),
        qstashMessageId: null,
      },
    ]);
    mockSendForSession.mockResolvedValueOnce({
      ok: false,
      permanent: false,
      error: "Meta unavailable",
    });

    const result = await rescueOrphanParteVisitas({ now: NOW });

    expect(result.failed).toBe(1);
    expect(result.rescued).toBe(0);
    expect(result.outcomes[0].error).toBe("Meta unavailable");
    expect(result.outcomes[0].result).toBe("transient_error");
  });

  it("respeta defaults: grace=5min, lookback=7d, maxBatch=50", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await rescueOrphanParteVisitas({ now: NOW });

    const args = mockFindMany.mock.calls[0][0];
    expect(args.where.visitDateTime.lte).toEqual(
      new Date(NOW.getTime() - 5 * 60_000),
    );
    expect(args.where.visitDateTime.gte).toEqual(
      new Date(NOW.getTime() - 7 * 24 * 60 * 60_000),
    );
    expect(args.take).toBe(50);
  });

  it("devuelve scanned=0 si no hay candidatos", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await rescueOrphanParteVisitas({ now: NOW });

    expect(result).toEqual({
      scanned: 0,
      rescued: 0,
      failed: 0,
      skipped: 0,
      outcomes: [],
    });
    expect(mockSendForSession).not.toHaveBeenCalled();
  });
});
