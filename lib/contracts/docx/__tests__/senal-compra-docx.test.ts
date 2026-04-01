import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import type { SenalCompraContractPayload, ContractTemplateInput } from "@/types/contracts";
import { buildSenalCompraDocument } from "../builders/senal-compra";
import { generateContractDocx } from "../index";
import { validateSenalCompraPayload } from "../validators";

function baseSenalPayload(): SenalCompraContractPayload {
  return {
    documentDateIso: "2026-03-24",
    signPlace: "Córdoba",
    agency: {
      representative: {
        fullName: "Miguel Angel Carrillo Ramos",
        nationalId: "46266189-X",
        fiscalAddress: { streetLine: "Calle Test 1", municipality: "Córdoba" },
      },
      companyLegalName: "URUS CAPITAL GROUP S.L.",
      companyTaxId: "B55460976",
      companyMunicipality: "Córdoba",
      depositBankAccount: {
        iban: "ES85 0182 2104 4002 0170 4067",
        bankName: "BBVA",
        holdersLine: "URUS CAPITAL GROUP S.L.",
      },
    },
    purchaser: {
      fullName: "Juan Pérez López",
      nationalId: "12345678A",
      fiscalAddress: { streetLine: "Calle Mayor 10", municipality: "Córdoba" },
    },
    property: {
      addressLine: "Calle Ejemplo 5",
      municipality: "Córdoba",
      cadastralReference: "1234567890ABCDEF",
    },
    senalAmount: { amount: 3000, literalEs: "tres mil euros" },
    offeredPrice: { amount: 180_000, literalEs: "ciento ochenta mil euros" },
    timelines: {
      businessDaysToArrasContract: 15,
      maxNaturalDaysToEscrituraFromSenalSignature: 90,
      convocatoriaNotaryMinNaturalDays: 7,
    },
    fees: {
      model: "fixed_net",
      netAmount: { amount: 3500, literalEs: "tres mil quinientos euros" },
      vatRatePercent: 21,
      devengo: "firma_arras",
    },
    jurisdiction: { courtsMunicipality: "Córdoba" },
    flags: {
      includeFinancingFallbackClause: true,
      keysHandover: "same_day_as_deed",
    },
  };
}

describe("buildSenalCompraDocument", () => {
  it("genera un buffer DOCX válido", async () => {
    const doc = await buildSenalCompraDocument(baseSenalPayload());
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });
});

describe("validateSenalCompraPayload", () => {
  it("pasa con datos completos", () => {
    const issues = validateSenalCompraPayload(baseSenalPayload());
    expect(issues).toHaveLength(0);
  });

  it("detecta importe de señal cero", () => {
    const p = baseSenalPayload();
    p.senalAmount.amount = 0;
    const issues = validateSenalCompraPayload(p);
    expect(issues.some((i) => i.fieldPath === "senalAmount.amount")).toBe(true);
  });
});

describe("generateContractDocx (senal_compra)", () => {
  it("genera DOCX con kind=senal_compra", async () => {
    const input: ContractTemplateInput = {
      kind: "senal_compra",
      payload: baseSenalPayload(),
    };
    const result = await generateContractDocx(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileName).toContain("Senal_Compra");
      expect(result.buffer.byteLength).toBeGreaterThan(100);
    }
  });
});
