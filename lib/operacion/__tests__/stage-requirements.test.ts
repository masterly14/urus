import { describe, it, expect } from "vitest";
import {
  STAGE_REQUIREMENTS,
  validateStageRequirements,
  requirementsForSkippedAndTarget,
} from "../stage-requirements";
import { STAGE_DOCUMENT_KIND } from "../stages";

describe("STAGE_REQUIREMENTS", () => {
  it("defines requirements for every stage that has a document", () => {
    for (const estado of Object.keys(STAGE_DOCUMENT_KIND)) {
      expect(STAGE_REQUIREMENTS[estado as keyof typeof STAGE_REQUIREMENTS]).toBeDefined();
      expect(
        STAGE_REQUIREMENTS[estado as keyof typeof STAGE_REQUIREMENTS]!.length,
      ).toBeGreaterThan(0);
    }
  });

  it("does not define requirements for stages without documents", () => {
    expect(STAGE_REQUIREMENTS.EN_CURSO).toBeUndefined();
    expect(STAGE_REQUIREMENTS.PENDIENTE_FIRMA).toBeUndefined();
    expect(STAGE_REQUIREMENTS.CERRADA_VENTA).toBeUndefined();
  });

  it("OFERTA_FIRME requires buyer data, property data, and pricing", () => {
    const fields = STAGE_REQUIREMENTS.OFERTA_FIRME!.map((r) => r.field);
    expect(fields).toContain("buyer.fullName");
    expect(fields).toContain("buyer.nationalId");
    expect(fields).toContain("property.addressLine");
    expect(fields).toContain("offeredPrice");
  });

  it("ARRAS requires buyers, sellers, pricing, IBAN, and timelines", () => {
    const fields = STAGE_REQUIREMENTS.ARRAS!.map((r) => r.field);
    expect(fields).toContain("buyers[].fullName");
    expect(fields).toContain("sellers[].fullName");
    expect(fields).toContain("totalPurchasePrice");
    expect(fields).toContain("arrasPaymentAccount.iban");
    expect(fields).toContain("timelines.maxDeedDateIso");
  });
});

describe("validateStageRequirements", () => {
  it("returns empty for a stage without requirements", () => {
    const missing = validateStageRequirements("EN_CURSO", {});
    expect(missing).toEqual([]);
  });

  it("returns all fields missing when data is empty", () => {
    const missing = validateStageRequirements("OFERTA_FIRME", {});
    const expectedCount = STAGE_REQUIREMENTS.OFERTA_FIRME!.length;
    expect(missing).toHaveLength(expectedCount);
  });

  it("returns empty when all fields are present (flat)", () => {
    const data = {
      buyer: { fullName: "Juan García", nationalId: "12345678A" },
      property: { addressLine: "Calle Mayor 1", cadastralReference: "1234567AB1234N0001XR" },
      offeredPrice: 250000,
      offerDeposit: 5000,
    };
    const missing = validateStageRequirements("OFERTA_FIRME", data);
    expect(missing).toEqual([]);
  });

  it("detects missing nested field", () => {
    const data = {
      buyer: { fullName: "Juan García" },
      property: { addressLine: "Calle Mayor 1", cadastralReference: "REF" },
      offeredPrice: 250000,
      offerDeposit: 5000,
    };
    const missing = validateStageRequirements("OFERTA_FIRME", data);
    expect(missing).toHaveLength(1);
    expect(missing[0].field).toBe("buyer.nationalId");
  });

  it("handles array paths for ARRAS", () => {
    const data = {
      buyers: [{ fullName: "Comprador", nationalId: "111", fiscalAddress: "Calle A" }],
      sellers: [{ fullName: "Vendedor", nationalId: "222" }],
      totalPurchasePrice: 300000,
      arrasAmount: 30000,
      arrasPaymentAccount: { iban: "ES1234567890123456789012" },
      timelines: { maxDeedDateIso: "2026-12-31" },
    };
    const missing = validateStageRequirements("ARRAS", data);
    expect(missing).toEqual([]);
  });

  it("detects empty array as missing for array paths", () => {
    const data = {
      buyers: [],
      sellers: [{ fullName: "V", nationalId: "X" }],
      totalPurchasePrice: 1,
      arrasAmount: 1,
      arrasPaymentAccount: { iban: "ES00" },
      timelines: { maxDeedDateIso: "2026-12-31" },
    };
    const missing = validateStageRequirements("ARRAS", data);
    const missingFields = missing.map((m) => m.field);
    expect(missingFields).toContain("buyers[].fullName");
    expect(missingFields).toContain("buyers[].nationalId");
    expect(missingFields).toContain("buyers[].fiscalAddress");
  });

  it("treats empty string as missing", () => {
    const data = {
      buyer: { fullName: "", nationalId: "123" },
      property: { addressLine: "C/ Test", cadastralReference: "REF" },
      offeredPrice: 100000,
      offerDeposit: 2000,
    };
    const missing = validateStageRequirements("OFERTA_FIRME", data);
    expect(missing.map((m) => m.field)).toContain("buyer.fullName");
  });

  it("treats 0 as missing for numeric fields", () => {
    const data = {
      buyer: { fullName: "X", nationalId: "Y" },
      property: { addressLine: "C/ Test", cadastralReference: "REF" },
      offeredPrice: 0,
      offerDeposit: 2000,
    };
    const missing = validateStageRequirements("OFERTA_FIRME", data);
    expect(missing.map((m) => m.field)).toContain("offeredPrice");
  });
});

describe("requirementsForSkippedAndTarget", () => {
  it("returns target requirements when no stages skipped", () => {
    const reqs = requirementsForSkippedAndTarget([], "OFERTA_FIRME");
    expect(reqs.length).toBe(STAGE_REQUIREMENTS.OFERTA_FIRME!.length);
  });

  it("merges skipped + target requirements without duplicates", () => {
    const reqs = requirementsForSkippedAndTarget(
      ["OFERTA_FIRME", "RESERVA"],
      "ARRAS",
    );
    const fields = reqs.map((r) => r.field);
    const uniqueFields = new Set(fields);
    expect(fields.length).toBe(uniqueFields.size);
    expect(fields).toContain("offeredPrice");
    expect(fields).toContain("senalAmount");
    expect(fields).toContain("totalPurchasePrice");
  });

  it("returns empty for stages without requirements", () => {
    const reqs = requirementsForSkippedAndTarget([], "EN_CURSO");
    expect(reqs).toEqual([]);
  });
});
