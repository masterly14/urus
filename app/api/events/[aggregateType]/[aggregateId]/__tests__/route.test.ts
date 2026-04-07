import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/event-store", () => ({
  getEventsByAggregate: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/api/cron-auth", () => ({
  isAuthorized: vi.fn().mockReturnValue(true),
}));

import { GET } from "../route";
import { isAuthorized } from "@/lib/api/cron-auth";

function makeRequest(aggregateType: string, aggregateId: string) {
  return new Request(
    `http://localhost:3000/api/events/${aggregateType}/${aggregateId}`,
  );
}

function makeParams(aggregateType: string, aggregateId: string) {
  return { params: Promise.resolve({ aggregateType, aggregateId }) };
}

describe("GET /api/events/[aggregateType]/[aggregateId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isAuthorized).mockReturnValue(true);
  });

  it("bloquea MENTAL_CONVERSATION con 403", async () => {
    const response = await GET(
      makeRequest("MENTAL_CONVERSATION", "34600111222"),
      makeParams("MENTAL_CONVERSATION", "34600111222"),
    );

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toContain("private");
  });

  it("permite aggregate types no privados", async () => {
    const response = await GET(
      makeRequest("WHATSAPP_CONVERSATION", "34600111222"),
      makeParams("WHATSAPP_CONVERSATION", "34600111222"),
    );

    expect(response.status).toBe(200);
  });

  it("rechaza aggregate types inválidos con 400", async () => {
    const response = await GET(
      makeRequest("INVALID_TYPE", "34600111222"),
      makeParams("INVALID_TYPE", "34600111222"),
    );

    expect(response.status).toBe(400);
  });

  it("rechaza sin autorización con 401", async () => {
    vi.mocked(isAuthorized).mockReturnValue(false);

    const response = await GET(
      makeRequest("WHATSAPP_CONVERSATION", "34600111222"),
      makeParams("WHATSAPP_CONVERSATION", "34600111222"),
    );

    expect(response.status).toBe(401);
  });
});
