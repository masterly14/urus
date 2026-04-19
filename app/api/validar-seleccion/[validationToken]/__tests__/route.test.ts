import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  findUniqueMock,
  updateMock,
  appendEventMock,
  enqueueJobMock,
} = vi.hoisted(() => ({
  findUniqueMock: vi.fn(),
  updateMock: vi.fn(),
  appendEventMock: vi.fn(),
  enqueueJobMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    micrositeSelection: {
      findUnique: findUniqueMock,
      update: updateMock,
    },
  },
}));

vi.mock("@/lib/event-store", () => ({
  appendEvent: appendEventMock,
}));

vi.mock("@/lib/job-queue", () => ({
  enqueueJob: enqueueJobMock,
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

import { PATCH } from "../route";

function makeRequest(body: unknown): Request {
  return new Request("https://example.com/api/validar-seleccion/tok-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/validar-seleccion/[validationToken]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("actualiza descriptions y emite evento + PROCESS_EVENT", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "sel-1",
      status: "PENDING_VALIDATION",
      demandId: "DEM-1",
      comercialId: "COM-1",
      properties: [
        {
          propertyId: "p1",
          title: "Piso centro",
          description: "Texto original",
          images: [],
          extras: [],
        },
      ],
    });
    updateMock.mockResolvedValueOnce({ id: "sel-1" });
    appendEventMock.mockResolvedValueOnce({ id: "evt-1" });
    enqueueJobMock.mockResolvedValueOnce({ id: "job-1" });

    const res = await PATCH(makeRequest({
      updates: [{ propertyId: "p1", description: "Texto revisado" }],
    }), {
      params: Promise.resolve({ validationToken: "tok-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.updatedCount).toBe(1);
    expect(updateMock).toHaveBeenCalledOnce();
    expect(appendEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECCION_MICROSITE_DESCRIPCIONES_EDITADAS",
        aggregateId: "DEM-1",
      }),
    );
    expect(enqueueJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "PROCESS_EVENT",
        payload: { eventId: "evt-1" },
      }),
    );
  });

  it("devuelve 404 si no existe la selección", async () => {
    findUniqueMock.mockResolvedValueOnce(null);

    const res = await PATCH(makeRequest({
      updates: [{ propertyId: "p1", description: "Texto revisado" }],
    }), {
      params: Promise.resolve({ validationToken: "missing" }),
    });

    expect(res.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("devuelve 409 si no está pendiente de validación", async () => {
    findUniqueMock.mockResolvedValueOnce({
      id: "sel-1",
      status: "APPROVED",
      demandId: "DEM-1",
      comercialId: "COM-1",
      properties: [],
    });

    const res = await PATCH(makeRequest({
      updates: [{ propertyId: "p1", description: "Texto revisado" }],
    }), {
      params: Promise.resolve({ validationToken: "tok-1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.status).toBe("APPROVED");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("devuelve 400 con updates vacío", async () => {
    const res = await PATCH(makeRequest({ updates: [] }), {
      params: Promise.resolve({ validationToken: "tok-1" }),
    });

    expect(res.status).toBe(400);
    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
