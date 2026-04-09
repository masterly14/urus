import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const { persistExecutionMetricMock, persistObservabilityLogMock } = vi.hoisted(
  () => ({
    persistExecutionMetricMock: vi.fn(),
    persistObservabilityLogMock: vi.fn(),
  }),
);

vi.mock("@/lib/observability/persistence", () => ({
  persistExecutionMetric: persistExecutionMetricMock,
  persistObservabilityLog: persistObservabilityLogMock,
}));

import { withObservedRoute } from "../api";

describe("withObservedRoute", () => {
  beforeEach(() => {
    persistExecutionMetricMock.mockReset();
    persistObservabilityLogMock.mockReset();
  });

  it("añade requestId y persiste métrica al completar la request", async () => {
    const handler = withObservedRoute(
      { method: "GET", route: "/api/test-observability" },
      async () => NextResponse.json({ ok: true }, { status: 201 }),
    );

    const response = await handler(
      new Request("https://example.com/api/test-observability"),
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(persistExecutionMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "api",
        operation: "GET /api/test-observability",
        success: true,
        statusCode: 201,
      }),
    );
  });

  it("devuelve 500, preserva correlación y persiste métrica de error", async () => {
    const handler = withObservedRoute(
      { method: "POST", route: "/api/test-observability" },
      async () => {
        throw new Error("boom");
      },
    );

    const response = await handler(
      new Request("https://example.com/api/test-observability", {
        method: "POST",
        headers: {
          "x-correlation-id": "corr-123",
        },
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("x-correlation-id")).toBe("corr-123");
    expect(persistExecutionMetricMock).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "api",
        operation: "POST /api/test-observability",
        success: false,
        statusCode: 500,
        correlationId: "corr-123",
        errorMessage: "boom",
      }),
    );
  });
});
