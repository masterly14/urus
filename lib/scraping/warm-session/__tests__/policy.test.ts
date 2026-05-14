import { describe, expect, it } from "vitest";
import { expiresAtForWarmSession, isWarmSessionUsable, resolveWarmSessionStatus } from "../policy";
import type { WarmSession } from "../types";

function session(overrides: Partial<WarmSession> = {}): WarmSession {
  return {
    id: "warm_1",
    source: "idealista",
    cookieHeader: "datadome=abc",
    userAgent: "UA",
    status: "ACTIVE",
    requestCount: 0,
    maxRequests: 40,
    expiresAt: new Date("2026-05-06T15:00:00.000Z"),
    warmedAt: new Date("2026-05-06T10:00:00.000Z"),
    ...overrides,
  };
}

describe("warm-session policy", () => {
  it("considera usable una sesión activa no expirada ni agotada", () => {
    expect(isWarmSessionUsable(session(), new Date("2026-05-06T14:00:00.000Z"))).toBe(true);
  });

  it("clasifica sesiones expiradas y agotadas", () => {
    expect(
      resolveWarmSessionStatus(session(), new Date("2026-05-06T15:00:00.000Z")),
    ).toBe("EXPIRED");
    expect(
      resolveWarmSessionStatus(
        session({ requestCount: 40 }),
        new Date("2026-05-06T14:00:00.000Z"),
      ),
    ).toBe("EXHAUSTED");
  });

  it("calcula expiresAt desde TTL", () => {
    expect(
      expiresAtForWarmSession(
        { ttlMs: 1_000 },
        new Date("2026-05-06T10:00:00.000Z"),
      ).toISOString(),
    ).toBe("2026-05-06T10:00:01.000Z");
  });
});
