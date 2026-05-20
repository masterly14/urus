import { describe, expect, it } from "vitest";
import { validateExpenseDraft } from "../recognition/validate";

describe("validateExpenseDraft", () => {
  it("acepta un gasto válido", () => {
    const result = validateExpenseDraft({
      amount: 35.5,
      currency: "eur",
      category: "transporte",
      description: "Taxi reunión cliente",
      vendor: "Cabify",
      expenseDate: "2026-05-19T12:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.normalized.currency).toBe("EUR");
      expect(result.normalized.category).toBe("transporte");
    }
  });

  it("rechaza importe no positivo y categoría no permitida", () => {
    const result = validateExpenseDraft({
      amount: 0,
      currency: "EUR",
      category: "viajes_lujo",
      description: "x",
      vendor: null,
      expenseDate: "fecha-rara",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("importe");
      expect(result.errors.join(" ")).toContain("Categoría");
      expect(result.errors.join(" ")).toContain("fecha");
    }
  });
});
