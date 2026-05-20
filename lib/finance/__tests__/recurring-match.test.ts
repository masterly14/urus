import { describe, expect, it } from "vitest";
import {
  findBestRecurringExpectedExpense,
  vendorSimilarity,
} from "@/lib/finance/recurring/match";

describe("recurring vendor matching", () => {
  it("calcula similitud alta con typos y acentos", () => {
    expect(vendorSimilarity("Gestion Redes", "GESTIÓN REDES")).toBeGreaterThan(0.9);
    expect(vendorSimilarity("Idealsta", "IDEALISTA")).toBeGreaterThan(0.85);
  });

  it("elige el mejor candidato esperado por proveedor", () => {
    const match = findBestRecurringExpectedExpense("Idealsta", [
      { id: "exp-1", vendor: "STATEFOX" },
      { id: "exp-2", vendor: "IDEALISTA" },
      { id: "exp-3", vendor: "NOMINA" },
    ]);

    expect(match).not.toBeNull();
    expect(match?.expenseId).toBe("exp-2");
    expect(match?.score).toBeGreaterThan(0.85);
  });
});
