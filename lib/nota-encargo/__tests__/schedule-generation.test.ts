import { describe, expect, it } from "vitest";
import { isStaleNotaEncargoSchedule } from "../schedule-generation";

describe("isStaleNotaEncargoSchedule", () => {
  it("trata callbacks legacy sin generation como generación 0", () => {
    expect(isStaleNotaEncargoSchedule({ scheduleGeneration: 0 }, undefined)).toBe(
      false,
    );
    expect(isStaleNotaEncargoSchedule({ scheduleGeneration: 1 }, undefined)).toBe(
      true,
    );
  });

  it("invalida callbacks con generation distinta a la sesión", () => {
    expect(isStaleNotaEncargoSchedule({ scheduleGeneration: 2 }, 1)).toBe(true);
    expect(isStaleNotaEncargoSchedule({ scheduleGeneration: 2 }, 2)).toBe(false);
  });
});
