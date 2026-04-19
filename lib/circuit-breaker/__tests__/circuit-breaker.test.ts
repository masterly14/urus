import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CircuitBreakerConfig } from "../types";

const { mockUpsert, mockUpdate, mockFindMany } = vi.hoisted(() => ({
  mockUpsert: vi.fn(),
  mockUpdate: vi.fn(),
  mockFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    circuitBreaker: {
      upsert: mockUpsert,
      update: mockUpdate,
      findMany: mockFindMany,
    },
  },
}));

vi.mock("@/lib/alerts", () => ({
  alertGeneric: vi.fn().mockResolvedValue(undefined),
}));

import { getCircuitState, canExecute, recordSuccess, recordFailure } from "../circuit-breaker";
import { alertGeneric } from "@/lib/alerts";

const NOW = new Date("2026-04-10T12:00:00Z");

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-circuit",
    status: "CLOSED",
    failureCount: 0,
    lastFailedAt: null,
    openedAt: null,
    halfOpenAt: null,
    closedAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

const config: CircuitBreakerConfig = { failureThreshold: 3, cooldownMs: 5 * 60 * 1000 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getCircuitState", () => {
  it("crea registro si no existe (upsert)", async () => {
    const state = makeState();
    mockUpsert.mockResolvedValue(state);

    const result = await getCircuitState("test-circuit");

    expect(mockUpsert).toHaveBeenCalledWith({
      where: { id: "test-circuit" },
      create: { id: "test-circuit" },
      update: {},
    });
    expect(result).toEqual(state);
  });
});

describe("canExecute", () => {
  it("permite ejecución si CLOSED", async () => {
    mockUpsert.mockResolvedValue(makeState());

    const { allowed } = await canExecute("test-circuit", config, NOW);

    expect(allowed).toBe(true);
  });

  it("permite ejecución si HALF_OPEN", async () => {
    mockUpsert.mockResolvedValue(makeState({ status: "HALF_OPEN" }));

    const { allowed } = await canExecute("test-circuit", config, NOW);

    expect(allowed).toBe(true);
  });

  it("bloquea si OPEN y cooldown no ha pasado", async () => {
    const openedAt = new Date(NOW.getTime() - 60_000); // 1 min ago
    mockUpsert.mockResolvedValue(makeState({ status: "OPEN", openedAt }));

    const { allowed } = await canExecute("test-circuit", config, NOW);

    expect(allowed).toBe(false);
  });

  it("transiciona a HALF_OPEN si cooldown ha pasado", async () => {
    const openedAt = new Date(NOW.getTime() - 6 * 60_000); // 6 min ago > 5 min cooldown
    mockUpsert.mockResolvedValue(makeState({ status: "OPEN", openedAt }));
    mockUpdate.mockResolvedValue(makeState({ status: "HALF_OPEN", halfOpenAt: NOW }));

    const { allowed, state } = await canExecute("test-circuit", config, NOW);

    expect(allowed).toBe(true);
    expect(state.status).toBe("HALF_OPEN");
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "test-circuit" },
      data: { status: "HALF_OPEN", halfOpenAt: NOW },
    });
  });
});

describe("recordSuccess", () => {
  it("resetea failureCount y cierra el circuito", async () => {
    mockUpsert.mockResolvedValue(makeState({ status: "CLOSED", failureCount: 0 }));

    await recordSuccess("test-circuit");

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "test-circuit" },
        update: expect.objectContaining({ status: "CLOSED", failureCount: 0 }),
      }),
    );
  });
});

describe("recordFailure", () => {
  it("incrementa failureCount sin abrir si bajo umbral", async () => {
    mockUpsert.mockResolvedValue(makeState({ failureCount: 1 }));
    mockUpdate.mockResolvedValue(makeState({ failureCount: 2 }));

    const result = await recordFailure("test-circuit", "error de red", config);

    expect(result.failureCount).toBe(2);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureCount: 2 }),
      }),
    );
  });

  it("abre el circuito al alcanzar el umbral", async () => {
    mockUpsert.mockResolvedValue(makeState({ failureCount: 2 }));
    mockUpdate.mockResolvedValue(makeState({ status: "OPEN", failureCount: 3 }));

    const result = await recordFailure("test-circuit", "error fatal", config);

    expect(result.status).toBe("OPEN");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "OPEN", failureCount: 3 }),
      }),
    );
  });

  it("emite alerta al abrir el circuito", async () => {
    mockUpsert.mockResolvedValue(makeState({ failureCount: 2 }));
    mockUpdate.mockResolvedValue(makeState({ status: "OPEN", failureCount: 3 }));

    await recordFailure("test-circuit", "error fatal", config);

    // alertGeneric is fire-and-forget, give it a tick
    await new Promise((r) => setTimeout(r, 10));

    expect(alertGeneric).toHaveBeenCalledWith(
      "Circuit breaker OPEN: test-circuit",
      "critical",
      expect.objectContaining({
        circuitId: "test-circuit",
        failureCount: 3,
        threshold: 3,
      }),
    );
  });

  it("no reabre si ya está OPEN", async () => {
    mockUpsert.mockResolvedValue(makeState({ status: "OPEN", failureCount: 5 }));
    mockUpdate.mockResolvedValue(makeState({ status: "OPEN", failureCount: 6 }));

    await recordFailure("test-circuit", "otro error", config);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({ status: "OPEN" }),
      }),
    );
    expect(alertGeneric).not.toHaveBeenCalled();
  });
});
