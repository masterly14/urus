import { describe, expect, it } from "vitest";
import { normalizePhoneES } from "../phone";

describe("normalizePhoneES", () => {
  it("prefixes 9-digit Spanish number with 34", () => {
    expect(normalizePhoneES("666777888")).toBe("34666777888");
  });

  it("leaves 11+ digit number unchanged (already has country code)", () => {
    expect(normalizePhoneES("34666777888")).toBe("34666777888");
  });

  it("strips spaces", () => {
    expect(normalizePhoneES("666 777 888")).toBe("34666777888");
  });

  it("strips dashes and dots", () => {
    expect(normalizePhoneES("666-777-888")).toBe("34666777888");
    expect(normalizePhoneES("666.777.888")).toBe("34666777888");
  });

  it("strips leading + sign", () => {
    expect(normalizePhoneES("+34666777888")).toBe("34666777888");
  });

  it("strips parentheses", () => {
    expect(normalizePhoneES("(34)666777888")).toBe("34666777888");
  });

  it("handles international numbers without modification", () => {
    expect(normalizePhoneES("447911123456")).toBe("447911123456");
  });
});
