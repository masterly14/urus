import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();
const mockCreateProspectoFromListing = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getSession: (...args: unknown[]) => mockGetSession(...args),
  unauthorized: () => new Response("unauthorized", { status: 401 }),
}));

vi.mock("@/lib/observability", () => ({
  withObservedRoute: (_meta: unknown, handler: unknown) => handler,
}));

vi.mock("@/lib/market/captacion-services", () => ({
  createProspectoFromListing: (...args: unknown[]) =>
    mockCreateProspectoFromListing(...args),
  CaptacionServiceError: class CaptacionServiceError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status = 400) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
}));

function request(body: unknown = {}) {
  return new Request(
    "http://localhost/api/market/listings/lst-1/inmovilla-prospect",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}

describe("POST /api/market/listings/[id]/inmovilla-prospect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MARKET_CAPTACION_SYNC_ENABLED = "true";
    mockGetSession.mockResolvedValue({
      userId: "user-1",
      role: "comercial",
      nombre: "Comercial",
      email: "comercial@example.com",
      comercialId: "com-1",
    });
    mockCreateProspectoFromListing.mockResolvedValue({
      ok: true,
      status: "CREATED",
      stage: "PROSPECT_CREATED",
      ref: "MK-REF-1",
      codOfer: 998877,
    });
  });

  it("devuelve 401 cuando no hay sesión", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const { POST } = await import("../route");
    const response = await POST(request({}), {
      params: Promise.resolve({ id: "lst-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("devuelve 503 con feature flag desactivado", async () => {
    process.env.MARKET_CAPTACION_SYNC_ENABLED = "false";
    const { POST } = await import("../route");
    const response = await POST(request({}), {
      params: Promise.resolve({ id: "lst-1" }),
    });
    expect(response.status).toBe(503);
  });

  it("ejecuta creación sincrónica y devuelve resultado", async () => {
    const { POST } = await import("../route");
    const response = await POST(
      request({ keyLoca: 10, keyTipo: 20, precioInmo: 150000 }),
      {
        params: Promise.resolve({ id: "lst-1" }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mockCreateProspectoFromListing).toHaveBeenCalledWith(
      expect.objectContaining({
        listingId: "lst-1",
        actorUserId: "user-1",
        keyLoca: 10,
        keyTipo: 20,
      }),
    );
    expect(body.ok).toBe(true);
    expect(body.result.stage).toBe("PROSPECT_CREATED");
  });
});
