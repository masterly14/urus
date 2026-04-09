import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionMock, getWorkersStatusFullMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  getWorkersStatusFullMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/workers/status", () => ({
  getWorkersStatusFull: getWorkersStatusFullMock,
}));

vi.mock("@/lib/observability", async () => {
  const actual = await vi.importActual<typeof import("@/lib/observability")>(
    "@/lib/observability",
  );
  return {
    ...actual,
    withObservedRoute:
      (_config: unknown, handler: (request: Request) => Promise<Response>) =>
      handler,
  };
});

import { GET } from "./route";

describe("GET /api/configuracion/health", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    getWorkersStatusFullMock.mockReset();
  });

  it("devuelve 403 si el usuario no es CEO", async () => {
    getSessionMock.mockReturnValue({
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
    });

    const response = await GET(
      new Request("https://example.com/api/configuracion/health"),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({ error: "Acceso restringido al CEO" });
  });

  it("devuelve el payload del panel si el usuario es CEO", async () => {
    getSessionMock.mockReturnValue({
      role: "ceo",
      comercialId: null,
      nombre: "CEO",
    });
    getWorkersStatusFullMock.mockResolvedValue({
      status: "degraded",
      db: "ok",
      timestamp: "2026-04-09T10:00:00.000Z",
      workers: [
        {
          id: "consumer",
          label: "Consumer",
          lastSuccessAt: "2026-04-09T09:55:00.000Z",
          status: "ok",
          lastSuccessSource: "execution_metrics",
          ageMinutes: 5,
        },
      ],
      jobQueue: {
        pending: 2,
        inProgress: 1,
        completed: 10,
        failed: 1,
        deadLetter: 0,
      },
      pendingJobs: [],
      pendingByType: [{ type: "PROCESS_EVENT", count: 2 }],
      recentErrors: [],
    });

    const response = await GET(
      new Request("https://example.com/api/configuracion/health"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.status).toBe("degraded");
    expect(body.pendingByType).toEqual([{ type: "PROCESS_EVENT", count: 2 }]);
    expect(getWorkersStatusFullMock).toHaveBeenCalledOnce();
  });
});
