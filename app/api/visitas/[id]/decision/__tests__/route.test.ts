import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockGetVisitWorkItem = vi.fn();
const mockDecideVisitWorkItem = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSessionFromRequest: (...args: unknown[]) => mockGetSession(...args),
  isCeoOrAdmin: (role: string) => role === "ceo" || role === "admin",
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/visitas/work-items", () => ({
  getVisitWorkItem: (...args: unknown[]) => mockGetVisitWorkItem(...args),
}));

vi.mock("@/lib/visitas/decisions", () => ({
  decideVisitWorkItem: (...args: unknown[]) => mockDecideVisitWorkItem(...args),
}));

function request(body: unknown) {
  return new Request("http://localhost/api/visitas/vwi-1/decision", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/visitas/[id]/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue({
      role: "comercial",
      comercialId: "com-1",
      nombre: "Comercial",
      email: "c@example.com",
      userId: "user-1",
    });
    mockGetVisitWorkItem.mockResolvedValue({ id: "vwi-1", comercialId: "com-1" });
    mockDecideVisitWorkItem.mockResolvedValue({
      workItem: { id: "vwi-1" },
      decisionEventId: "evt-decision",
    });
  });

  it("permite al comercial decidir su propia visita", async () => {
    const { POST } = await import("../route");
    const res = await POST(request({ decision: "yellow", notes: "Otra zona" }), {
      params: Promise.resolve({ id: "vwi-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockDecideVisitWorkItem).toHaveBeenCalledWith(expect.objectContaining({
      visitWorkItemId: "vwi-1",
      decision: "yellow",
      decidedBy: "Comercial",
    }));
  });

  it("bloquea visitas de otro comercial", async () => {
    mockGetVisitWorkItem.mockResolvedValue({ id: "vwi-1", comercialId: "com-2" });
    const { POST } = await import("../route");
    const res = await POST(request({ decision: "green" }), {
      params: Promise.resolve({ id: "vwi-1" }),
    });

    expect(res.status).toBe(403);
    expect(mockDecideVisitWorkItem).not.toHaveBeenCalled();
  });
});
