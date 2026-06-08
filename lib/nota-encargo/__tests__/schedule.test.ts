import { beforeEach, describe, expect, it, vi } from "vitest";

const publishJSONMock = vi.fn();

vi.mock("@upstash/qstash", () => ({
  Client: class MockQstashClient {
    publishJSON = publishJSONMock;
  },
}));

vi.mock("@/lib/microsite/app-url", () => ({
  getPublicAppUrl: () => "https://example.com",
}));

import { scheduleNotaEncargoInitialSteps } from "../schedule";

describe("scheduleNotaEncargoInitialSteps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    publishJSONMock.mockResolvedValue({ messageId: "msg-test" });
    process.env.QSTASH_TOKEN = "test-token";
  });

  it("programa formulario en visitDateTime al crear la sesión", async () => {
    const visitDateTime = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const result = await scheduleNotaEncargoInitialSteps({
      sessionId: "session-1",
      visitDateTime,
      withMatchingCheck: false,
      matchingDeadlineDays: 7,
    });

    expect(publishJSONMock).toHaveBeenCalledTimes(1);
    expect(publishJSONMock.mock.calls[0][0].url).toContain(
      "/api/nota-encargo/formulario",
    );
    expect(result.formulario.messageId).toBe("msg-test");
  });

  it("programa matching-check cuando no hay propiedad vinculada", async () => {
    const visitDateTime = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await scheduleNotaEncargoInitialSteps({
      sessionId: "session-2",
      visitDateTime,
      withMatchingCheck: true,
      matchingDeadlineDays: 7,
    });

    expect(publishJSONMock).toHaveBeenCalledTimes(2);
    expect(publishJSONMock.mock.calls[1][0].url).toContain(
      "/api/nota-encargo/matching-check",
    );
  });
});
