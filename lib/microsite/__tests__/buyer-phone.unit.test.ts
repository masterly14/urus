import { describe, expect, it } from "vitest";
import { normalizeWhatsAppDigits } from "../buyer-phone";

describe("normalizeWhatsAppDigits", () => {
  it("extrae dígitos de formato internacional", () => {
    expect(normalizeWhatsAppDigits("+34 612 345 678")).toBe("34612345678");
  });

  it("devuelve cadena vacía si hay pocos dígitos", () => {
    expect(normalizeWhatsAppDigits("123")).toBe("");
  });
});
