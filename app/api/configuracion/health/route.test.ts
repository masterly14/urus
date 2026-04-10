import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionFromRequestMock, getWorkersStatusFullMock } = vi.hoisted(() => ({
  getSessionFromRequestMock: vi.fn(),
  getWorkersStatusFullMock: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: getSessionFromRequestMock,
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
  unauthorized: () =>
    new Response(JSON.stringify({ ok: false, error: "No autenticado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    }),
  forbidden: () =>
    new Response(JSON.stringify({ ok: false, error: "Sin permisos" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
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
    getSessionFromRequestMock.mockReset();
    getWorkersStatusFullMock.mockReset();
  });

  it("devuelve 401 si no hay sesión", async () => {
    getSessionFromRequestMock.mockResolvedValue(null);

    const response = await GET(
      new Request("https://example.com/api/configuracion/health"),
    );

    expect(response.status).toBe(401);
  });

  it("devuelve 403 si el usuario no es CEO ni admin", async () => {
    getSessionFromRequestMock.mockResolvedValue({
      userId: "u1",
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "test@test.com",
    });

    const response = await GET(
      new Request("https://example.com/api/configuracion/health"),
    );

    expect(response.status).toBe(403);
  });

  it("devuelve el payload del panel si el usuario es CEO", async () => {
    getSessionFromRequestMock.mockResolvedValue({
      userId: "u-ceo",
      role: "ceo",
      comercialId: null,
      nombre: "CEO",
      email: "ceo@test.com",
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

  it("permite acceso a admin", async () => {
    getSessionFromRequestMock.mockResolvedValue({
      userId: "u-admin",
      role: "admin",
      comercialId: null,
      nombre: "Admin",
      email: "admin@test.com",
    });
    getWorkersStatusFullMock.mockResolvedValue({
      status: "ok",
      db: "ok",
      timestamp: "2026-04-09T10:00:00.000Z",
      workers: [],
      jobQueue: { pending: 0, inProgress: 0, completed: 0, failed: 0, deadLetter: 0 },
      pendingJobs: [],
      pendingByType: [],
      recentErrors: [],
    });

    const response = await GET(
      new Request("https://example.com/api/configuracion/health"),
    );

    expect(response.status).toBe(200);
  });
});
