import { describe, expect, it } from "vitest";
import { resolveVariablesInText } from "../variable-resolver";

describe("resolveVariablesInText", () => {
  it("resuelve placeholders especiales de partes en arras", () => {
    const text =
      "PARTE COMPRADORA: {{_resolved_buyers}}. PARTE VENDEDORA: {{_resolved_sellers}}.";
    const payload = {
      buyers: [
        {
          fullName: "Maria Garcia Lopez",
          nationalId: "12345678Z",
          fiscalAddress: {
            streetLine: "Calle Gran Via 15, 3o B",
            municipality: "Cordoba",
          },
        },
      ],
      sellers: [
        {
          fullName: "Antonio Ruiz Martinez",
          nationalId: "87654321X",
          fiscalAddress: {
            streetLine: "Avenida de la Libertad 42",
            municipality: "Cordoba",
          },
        },
      ],
    };

    const resolved = resolveVariablesInText(text, payload);
    expect(resolved).toContain("Maria Garcia Lopez");
    expect(resolved).toContain("Antonio Ruiz Martinez");
    expect(resolved).not.toContain("{{_resolved_buyers}}");
    expect(resolved).not.toContain("{{_resolved_sellers}}");
  });
});
