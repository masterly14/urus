import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUniqueMock, responsesCreateMock } = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  responsesCreateMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    micrositeSelection: {
      findUnique: findUniqueMock,
    },
  },
}));

vi.mock("openai", () => ({
  default: class OpenAI {
    responses = {
      create: responsesCreateMock,
    };
  },
}));

vi.mock("@/lib/observability", async () => {
  const actual = await vi.importActual<typeof import("@/lib/observability")>(
    "@/lib/observability",
  );
  return {
    ...actual,
    withObservedRoute:
      (
        _config: unknown,
        handler: (request: Request, context: { params: Promise<{ validationToken: string }> }) => Promise<Response>,
      ) =>
      handler,
  };
});

import { POST } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("https://example.com/api/validar-seleccion/tok-1/generate-description", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/validar-seleccion/[validationToken]/generate-description", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";
  });

  it("genera texto IA para una propiedad válida", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: "PENDING_VALIDATION",
      demandId: "DEM-1",
      demandNombre: "Demanda demo",
      properties: [
        {
          propertyId: "p1",
          title: "Piso Centro",
          description: "Texto base",
          city: "Córdoba",
          zone: "Centro",
          metersBuilt: 100,
          rooms: 3,
          baths: 2,
          housing: "Piso",
          price: 250000,
          images: [],
          extras: [],
        },
      ],
    });
    responsesCreateMock.mockResolvedValueOnce({
      output_text: "Descripción optimizada por IA.",
    });

    const res = await POST(makeRequest({ propertyId: "p1" }), {
      params: Promise.resolve({ validationToken: "tok-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.description).toContain("optimizada");
    expect(responsesCreateMock).toHaveBeenCalledOnce();
  });

  it("devuelve 409 si la selección no está pendiente", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: "APPROVED",
      demandId: "DEM-1",
      demandNombre: "Demanda demo",
      properties: [],
    });

    const res = await POST(makeRequest({ propertyId: "p1" }), {
      params: Promise.resolve({ validationToken: "tok-1" }),
    });

    expect(res.status).toBe(409);
    expect(responsesCreateMock).not.toHaveBeenCalled();
  });

  it("devuelve 404 si propertyId no está en la selección", async () => {
    findUniqueMock.mockResolvedValueOnce({
      status: "PENDING_VALIDATION",
      demandId: "DEM-1",
      demandNombre: "Demanda demo",
      properties: [
        {
          propertyId: "p2",
          title: "Piso",
          description: null,
          images: [],
          extras: [],
        },
      ],
    });

    const res = await POST(makeRequest({ propertyId: "p1" }), {
      params: Promise.resolve({ validationToken: "tok-1" }),
    });

    expect(res.status).toBe(404);
  });
});
