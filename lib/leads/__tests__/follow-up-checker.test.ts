import { describe, it, expect } from "vitest";
import { checkLeadNeedsFollowUp } from "../follow-up-checker";

describe("checkLeadNeedsFollowUp", () => {
  it("retorna shouldFollowUp=true cuando no hay eventos LEAD_CONTACTADO", async () => {
    const mockFetcher = async () => ({ count: 0 });
    const result = await checkLeadNeedsFollowUp("lead-001", mockFetcher);

    expect(result.shouldFollowUp).toBe(true);
    expect(result.reason).toContain("sin respuesta");
  });

  it("retorna shouldFollowUp=false cuando hay eventos LEAD_CONTACTADO", async () => {
    const mockFetcher = async () => ({ count: 1 });
    const result = await checkLeadNeedsFollowUp("lead-002", mockFetcher);

    expect(result.shouldFollowUp).toBe(false);
    expect(result.reason).toContain("ya contactado");
  });

  it("retorna shouldFollowUp=false con múltiples eventos de contacto", async () => {
    const mockFetcher = async () => ({ count: 3 });
    const result = await checkLeadNeedsFollowUp("lead-003", mockFetcher);

    expect(result.shouldFollowUp).toBe(false);
    expect(result.reason).toContain("3 evento(s)");
  });
});
