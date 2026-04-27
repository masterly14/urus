import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AppSession } from "@/lib/auth/session";

const mockGetSession = vi.fn<(req: Request) => Promise<AppSession | null>>();
const mockCreateTemplate = vi.fn();
const mockFindTemplates = vi.fn();
const mockFindTemplate = vi.fn();
const mockUpdateTemplate = vi.fn();

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

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contractTemplate: {
      create: mockCreateTemplate,
      findMany: mockFindTemplates,
      findUnique: mockFindTemplate,
      update: mockUpdateTemplate,
    },
  },
}));

const CEO_SESSION: AppSession = {
  userId: "u-ceo",
  role: "ceo",
  comercialId: null,
  nombre: "CEO",
  email: "ceo@test.com",
};

const COMERCIAL_SESSION: AppSession = {
  userId: "u-comercial",
  role: "comercial",
  comercialId: "com-1",
  nombre: "Comercial",
  email: "comercial@test.com",
};

function request(url: string, init?: RequestInit): NextRequest {
  return Object.assign(new Request(url, init), { nextUrl: new URL(url) }) as NextRequest;
}

describe("templates API auth", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockCreateTemplate.mockReset();
    mockFindTemplates.mockReset();
    mockFindTemplate.mockReset();
    mockUpdateTemplate.mockReset();
  });

  it("requires a session to list templates", async () => {
    mockGetSession.mockResolvedValue(null);

    const { GET } = await import("@/app/api/templates/route");
    const res = await GET(request("http://localhost/api/templates"));

    expect(res.status).toBe(401);
    expect(mockFindTemplates).not.toHaveBeenCalled();
  });

  it("allows authenticated users to list templates", async () => {
    mockGetSession.mockResolvedValue(COMERCIAL_SESSION);
    mockFindTemplates.mockResolvedValue([]);

    const { GET } = await import("@/app/api/templates/route");
    const res = await GET(request("http://localhost/api/templates"));

    expect(res.status).toBe(200);
    expect(mockFindTemplates).toHaveBeenCalledOnce();
  });

  it("blocks comerciales from creating templates", async () => {
    mockGetSession.mockResolvedValue(COMERCIAL_SESSION);

    const { POST } = await import("@/app/api/templates/route");
    const res = await POST(
      request("http://localhost/api/templates", {
        method: "POST",
        body: JSON.stringify({
          documentKind: "arras",
          name: "Arras editable",
        }),
      }),
    );

    expect(res.status).toBe(403);
    expect(mockCreateTemplate).not.toHaveBeenCalled();
  });

  it("allows CEO/Admin users to create templates", async () => {
    mockGetSession.mockResolvedValue(CEO_SESSION);
    mockCreateTemplate.mockResolvedValue({ id: "tpl-1" });

    const { POST } = await import("@/app/api/templates/route");
    const res = await POST(
      request("http://localhost/api/templates", {
        method: "POST",
        body: JSON.stringify({
          documentKind: "arras",
          name: "Arras editable",
        }),
      }),
    );

    expect(res.status).toBe(201);
    expect(mockCreateTemplate).toHaveBeenCalledOnce();
  });

  it("blocks comerciales from patching templates", async () => {
    mockGetSession.mockResolvedValue(COMERCIAL_SESSION);

    const { PATCH } = await import("@/app/api/templates/[id]/route");
    const res = await PATCH(
      request("http://localhost/api/templates/tpl-1", {
        method: "PATCH",
        body: JSON.stringify({ name: "Nueva version" }),
      }),
      { params: Promise.resolve({ id: "tpl-1" }) },
    );

    expect(res.status).toBe(403);
    expect(mockUpdateTemplate).not.toHaveBeenCalled();
  });
});
