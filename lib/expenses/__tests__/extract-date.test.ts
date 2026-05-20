import { describe, expect, it } from "vitest";
import { normalizeExpenseDateForSpain } from "../recognition/extract";

describe("normalizeExpenseDateForSpain", () => {
  it("interpreta 'hoy' con día de Madrid", () => {
    const now = new Date("2026-05-19T06:00:00.000Z");
    const iso = normalizeExpenseDateForSpain("hoy", now);
    expect(iso.startsWith("2026-05-19")).toBe(true);
  });

  it("normaliza formato dd/mm/yyyy sin corrimiento de día", () => {
    const iso = normalizeExpenseDateForSpain("19/05/2026");
    expect(iso).toBe("2026-05-19T12:00:00.000Z");
  });
});
