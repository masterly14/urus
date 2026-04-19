/**
 * Tests de seguridad: verifican que los guards de rol funcionan correctamente.
 *
 * Mock de getSessionFromRequest para simular diferentes roles.
 * Verifica: 401 sin sesión, 403 para roles no autorizados, 200 para roles válidos.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppSession } from "@/lib/auth/session";

const mockGetSession = vi.fn<(req: Request) => Promise<AppSession | null>>();

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: [Request]) => mockGetSession(...args),
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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dashboardAlert: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    evalRun: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    colaborador: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    colaboradorTipo: { findMany: vi.fn().mockResolvedValue([]) },
    colaboradorAsignacion: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRaw: vi.fn().mockResolvedValue([]),
  },
}));

const CEO_SESSION: AppSession = {
  userId: "u-ceo",
  role: "ceo",
  comercialId: null,
  nombre: "CEO",
  email: "ceo@test.com",
};

const ADMIN_SESSION: AppSession = {
  userId: "u-admin",
  role: "admin",
  comercialId: null,
  nombre: "Admin",
  email: "admin@test.com",
};

const COMERCIAL_SESSION: AppSession = {
  userId: "u-com",
  role: "comercial",
  comercialId: "com-1",
  nombre: "Comercial",
  email: "com@test.com",
};

function req(url: string): Request {
  return new Request(url);
}

describe("Dashboard alerts — solo CEO/Admin", () => {
  beforeEach(() => mockGetSession.mockReset());

  it("401 sin sesión", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/dashboard/alerts/route");
    const res = await GET(req("http://localhost/api/dashboard/alerts"));
    expect(res.status).toBe(401);
  });

  it("403 para comercial", async () => {
    mockGetSession.mockResolvedValue(COMERCIAL_SESSION);
    const { GET } = await import("@/app/api/dashboard/alerts/route");
    const res = await GET(req("http://localhost/api/dashboard/alerts"));
    expect(res.status).toBe(403);
  });

  it("200 para CEO", async () => {
    mockGetSession.mockResolvedValue(CEO_SESSION);
    const { GET } = await import("@/app/api/dashboard/alerts/route");
    const res = await GET(req("http://localhost/api/dashboard/alerts"));
    expect(res.status).toBe(200);
  });

  it("200 para Admin", async () => {
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
    const { GET } = await import("@/app/api/dashboard/alerts/route");
    const res = await GET(req("http://localhost/api/dashboard/alerts"));
    expect(res.status).toBe(200);
  });
});

describe("Eval runs — solo CEO/Admin", () => {
  beforeEach(() => mockGetSession.mockReset());

  it("401 sin sesión", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/eval/runs/route");
    const res = await GET(req("http://localhost/api/eval/runs"));
    expect(res.status).toBe(401);
  });

  it("403 para comercial", async () => {
    mockGetSession.mockResolvedValue(COMERCIAL_SESSION);
    const { GET } = await import("@/app/api/eval/runs/route");
    const res = await GET(req("http://localhost/api/eval/runs"));
    expect(res.status).toBe(403);
  });

  it("200 para CEO", async () => {
    mockGetSession.mockResolvedValue(CEO_SESSION);
    const { GET } = await import("@/app/api/eval/runs/route");
    const res = await GET(req("http://localhost/api/eval/runs"));
    expect(res.status).toBe(200);
  });
});

describe("Colaboradores — cualquier autenticado", () => {
  beforeEach(() => mockGetSession.mockReset());

  it("401 sin sesión", async () => {
    mockGetSession.mockResolvedValue(null);
    const { GET } = await import("@/app/api/colaboradores/route");
    const res = await GET(req("http://localhost/api/colaboradores"));
    expect(res.status).toBe(401);
  });

  it("200 para comercial", async () => {
    mockGetSession.mockResolvedValue(COMERCIAL_SESSION);
    const { GET } = await import("@/app/api/colaboradores/route");
    const res = await GET(req("http://localhost/api/colaboradores"));
    expect(res.status).toBe(200);
  });

  it("200 para CEO", async () => {
    mockGetSession.mockResolvedValue(CEO_SESSION);
    const { GET } = await import("@/app/api/colaboradores/route");
    const res = await GET(req("http://localhost/api/colaboradores"));
    expect(res.status).toBe(200);
  });
});

describe("isCeoOrAdmin helper (via mock)", () => {
  it("CEO y admin tienen acceso equivalente", async () => {
    const { isCeoOrAdmin } = await import("@/lib/auth/session");
    expect(isCeoOrAdmin("ceo")).toBe(true);
    expect(isCeoOrAdmin("admin")).toBe(true);
    expect(isCeoOrAdmin("comercial")).toBe(false);
  });
});
