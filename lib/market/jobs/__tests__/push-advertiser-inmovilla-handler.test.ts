import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@/lib/job-queue/types";

const {
  findUniqueAdvertiserMock,
  updateAdvertiserMock,
  canExecuteMock,
  recordSuccessMock,
  recordFailureMock,
  searchClientMock,
  createClientMock,
  createInmovillaRestClientMock,
} = vi.hoisted(() => ({
  findUniqueAdvertiserMock: vi.fn(),
  updateAdvertiserMock: vi.fn(),
  canExecuteMock: vi.fn(),
  recordSuccessMock: vi.fn(),
  recordFailureMock: vi.fn(),
  searchClientMock: vi.fn(),
  createClientMock: vi.fn(),
  createInmovillaRestClientMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    marketAdvertiser: {
      findUnique: findUniqueAdvertiserMock,
      update: updateAdvertiserMock,
    },
  },
}));

vi.mock("@/lib/circuit-breaker", () => ({
  canExecute: canExecuteMock,
  recordSuccess: recordSuccessMock,
  recordFailure: recordFailureMock,
}));

vi.mock("@/lib/inmovilla/rest", async () => {
  const actual = await vi.importActual<typeof import("@/lib/inmovilla/rest")>(
    "@/lib/inmovilla/rest",
  );
  return {
    ...actual,
    createInmovillaRestClient: createInmovillaRestClientMock,
  };
});

vi.mock("@/lib/inmovilla/rest/clients", () => ({
  searchClient: searchClientMock,
  createClient: createClientMock,
}));

import { handleMarketPushAdvertiserToInmovilla } from "../push-advertiser-inmovilla-handler";

function makeJob(payload: Record<string, unknown> = {}): JobRecord {
  return {
    id: "job-push-1",
    type: "MARKET_PUSH_ADVERTISER_TO_INMOVILLA",
    status: "IN_PROGRESS",
    payload: payload as JobRecord["payload"],
    priority: 100,
    attempts: 1,
    maxAttempts: 3,
    availableAt: new Date(),
    lockedAt: new Date(),
    lockedBy: "test",
    startedAt: new Date(),
    completedAt: null,
    failedAt: null,
    lastError: null,
    idempotencyKey: null,
    sourceEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeAdvertiser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "adv-1",
    phoneCanonical: "+34600111222",
    displayName: "Maria",
    advertiserType: "particular",
    inmovillaContactId: null,
    listings: [
      {
        id: "list-1",
        canonicalUrl: "https://www.idealista.com/inmueble/1/",
        lastSeenAt: new Date("2026-05-06T12:00:00Z"),
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUniqueAdvertiserMock.mockResolvedValue(makeAdvertiser());
  updateAdvertiserMock.mockResolvedValue({});
  canExecuteMock.mockResolvedValue({ allowed: true, state: { failureCount: 0 } });
  searchClientMock.mockResolvedValue([]);
  createClientMock.mockResolvedValue({
    cod_cli: 12345,
    codigo: 200,
    mensaje: "ok",
  });
  createInmovillaRestClientMock.mockReturnValue({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  });
});

describe("handleMarketPushAdvertiserToInmovilla", () => {
  it("falla permanente sin advertiserId", async () => {
    const result = await handleMarketPushAdvertiserToInmovilla(makeJob({}));
    expect(result.success).toBe(false);
    expect(result.permanent).toBe(true);
  });

  it("skipped cuando el advertiser ya esta vinculado", async () => {
    findUniqueAdvertiserMock.mockResolvedValue(
      makeAdvertiser({ inmovillaContactId: "9876" }),
    );
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(true);
    expect(result.scoredPayload).toMatchObject({
      outcome: "already_linked",
      inmovillaContactId: "9876",
    });
    expect(searchClientMock).not.toHaveBeenCalled();
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("skipped cuando no hay phoneCanonical", async () => {
    findUniqueAdvertiserMock.mockResolvedValue(
      makeAdvertiser({ phoneCanonical: null }),
    );
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(true);
    expect(result.scoredPayload).toMatchObject({ outcome: "skipped_no_phone" });
    expect(searchClientMock).not.toHaveBeenCalled();
  });

  it("retriable cuando el circuit breaker esta abierto", async () => {
    canExecuteMock.mockResolvedValue({
      allowed: false,
      state: { failureCount: 5 },
    });
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(false);
    expect(result.permanent).not.toBe(true);
    expect(searchClientMock).not.toHaveBeenCalled();
  });

  it("reutiliza cod_cli cuando searchClient encuentra match", async () => {
    searchClientMock.mockResolvedValue([{ cod_cli: 7777, nombre: "Maria" }]);
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(true);
    expect(result.scoredPayload).toMatchObject({
      outcome: "linked_existing",
      inmovillaContactId: "7777",
    });
    expect(createClientMock).not.toHaveBeenCalled();
    expect(updateAdvertiserMock).toHaveBeenCalledWith({
      where: { id: "adv-1" },
      data: { inmovillaContactId: "7777" },
    });
    expect(recordSuccessMock).toHaveBeenCalledWith("egestion-inmovilla");
  });

  it("crea cliente en Inmovilla cuando no existe match y persiste cod_cli", async () => {
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(true);
    expect(result.scoredPayload).toMatchObject({
      outcome: "created",
      inmovillaContactId: "12345",
    });
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const payload = createClientMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).toMatchObject({
      nombre: "Maria",
      telefono1: 600111222,
      prefijotel1: 34,
    });
    expect(updateAdvertiserMock).toHaveBeenCalledWith({
      where: { id: "adv-1" },
      data: { inmovillaContactId: "12345" },
    });
  });

  it("usa nombre por defecto cuando displayName es null", async () => {
    findUniqueAdvertiserMock.mockResolvedValue(
      makeAdvertiser({ displayName: null }),
    );
    await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    const payload = createClientMock.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload.nombre).toBe("Contacto Mercado");
  });

  it("retriable cuando Inmovilla falla; registra fallo en el breaker", async () => {
    createClientMock.mockRejectedValue(new Error("500 Internal"));
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(false);
    expect(result.permanent).not.toBe(true);
    expect(recordFailureMock).toHaveBeenCalled();
  });

  it("skipped cuando el telefono no tiene formato local +34 esperado", async () => {
    findUniqueAdvertiserMock.mockResolvedValue(
      makeAdvertiser({ phoneCanonical: "+9112345678" }),
    );
    const result = await handleMarketPushAdvertiserToInmovilla(
      makeJob({ advertiserId: "adv-1" }),
    );
    expect(result.success).toBe(true);
    expect(result.scoredPayload).toMatchObject({
      outcome: "skipped_invalid_phone",
    });
    expect(searchClientMock).not.toHaveBeenCalled();
  });
});
