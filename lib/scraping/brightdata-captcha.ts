import type { Page } from "playwright";

export type BrightDataCaptchaStatus =
  | "not_detected"
  | "detected"
  | "solved"
  | "solve_failed"
  | "failed";

export type BrightDataCaptchaResult = {
  status: BrightDataCaptchaStatus;
  message?: string;
};

type CaptchaCdpResponse = {
  status?: BrightDataCaptchaStatus;
  message?: string;
};

export async function waitForBrightDataCaptcha(
  page: Page,
  detectTimeoutMs: number,
): Promise<BrightDataCaptchaResult> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const send = cdp.send as (method: string, params: Record<string, unknown>) => Promise<unknown>;
    const result = (await send("Captcha.waitForSolve", {
      detectTimeout: detectTimeoutMs,
    })) as CaptchaCdpResponse | null;
    return {
      status: result?.status ?? "not_detected",
      message: result?.message,
    };
  } catch (err) {
    return {
      status: "failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
