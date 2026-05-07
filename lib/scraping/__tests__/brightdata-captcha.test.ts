import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitForBrightDataCaptcha } from "../brightdata-captcha";

const send = vi.fn();
const newCDPSession = vi.fn();

function makePage() {
  return {
    context: () => ({
      newCDPSession,
    }),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  newCDPSession.mockResolvedValue({ send });
});

describe("waitForBrightDataCaptcha", () => {
  it("devuelve el status de Captcha.waitForSolve", async () => {
    send.mockResolvedValueOnce({ status: "solved", message: "ok" });
    const result = await waitForBrightDataCaptcha(makePage(), 20_000);

    expect(newCDPSession).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith("Captcha.waitForSolve", {
      detectTimeout: 20_000,
    });
    expect(result).toEqual({ status: "solved", message: "ok" });
  });

  it("devuelve not_detected si Bright Data no reporta status", async () => {
    send.mockResolvedValueOnce({});
    const result = await waitForBrightDataCaptcha(makePage(), 5_000);
    expect(result.status).toBe("not_detected");
  });

  it("degrada a failed si CDP no soporta el comando", async () => {
    send.mockRejectedValueOnce(new Error("Unknown method"));
    const result = await waitForBrightDataCaptcha(makePage(), 5_000);
    expect(result.status).toBe("failed");
    expect(result.message).toContain("Unknown method");
  });
});
