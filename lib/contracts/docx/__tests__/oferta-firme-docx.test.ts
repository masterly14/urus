import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import type { OfertaFirmeContractPayload, ContractTemplateInput } from "@/types/contracts";
import { buildOfertaFirmeDocument } from "../builders/oferta-firme";
import { generateContractDocx } from "../index";
import { validateOfertaFirmePayload } from "../validators";

function baseOfertaPayload(): OfertaFirmeContractPayload {
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
    offerers: [
      {
        fullName: "Ana García Ruiz",
        nationalId: "87654321B",
        fiscalAddress: { streetLine: "Calle Góngora 3", municipality: "Córdoba" },
      },
    ],
    property: {
      addressLine: "Calle del Olivo 12",
      municipality: "Córdoba",
      cadastralReference: "ABCDEF1234567890",
      fincaNumber: "1234",
      cru: "14900000012345",
      tomo: "1000",
      libro: "500",
      folio: "123",
      inscripcion: "1",
      registryOfficeName: "Registro de la Propiedad",
      registryOfficeNumber: "3",
    },
    listingPrice: { amount: 250_000, literalEs: "doscientos cincuenta mil euros" },
    offeredPrice: { amount: 230_000, literalEs: "doscientos treinta mil euros" },
    offerDeposit: { amount: 5000, literalEs: "cinco mil euros" },
    arrasAmountAfterAcceptance: { amount: 23_000, literalEs: "veintitrés mil euros" },
    timelines: {
      offerValidityNaturalDays: 3,
      arrasSigningMaxNaturalDaysFromAcceptance: 10,
      escrituraMaxNaturalDaysFromArrasSignature: 90,
    },
    fees: {
      model: "percent_of_final_price",
      percentOfFinalPrice: 2,
      vatRatePercent: 21,
      devengo: "firma_arras",
    },
    jurisdiction: { courtsMunicipality: "Córdoba" },
    flags: {
      includePropertyAcceptanceSection: true,
    },
  };
}

describe("buildOfertaFirmeDocument", () => {
  it("genera un buffer DOCX válido", async () => {
    const doc = await buildOfertaFirmeDocument(baseOfertaPayload());
    const buffer = await Packer.toBuffer(doc);
    expect(buffer.byteLength).toBeGreaterThan(100);
  });
});

describe("validateOfertaFirmePayload", () => {
  it("pasa con datos completos", () => {
    const issues = validateOfertaFirmePayload(baseOfertaPayload());
    expect(issues).toHaveLength(0);
  });

  it("detecta precio ofrecido cero", () => {
    const p = baseOfertaPayload();
    p.offeredPrice.amount = 0;
    const issues = validateOfertaFirmePayload(p);
    expect(issues.some((i) => i.fieldPath === "offeredPrice.amount")).toBe(true);
  });

  it("detecta falta de referencia catastral", () => {
    const p = baseOfertaPayload();
    p.property.cadastralReference = "";
    const issues = validateOfertaFirmePayload(p);
    expect(issues.some((i) => i.fieldPath === "property.cadastralReference")).toBe(true);
  });
});

describe("generateContractDocx (oferta_firme)", () => {
  it("genera DOCX con kind=oferta_firme", async () => {
    const input: ContractTemplateInput = {
      kind: "oferta_firme",
      payload: baseOfertaPayload(),
    };
    const result = await generateContractDocx(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileName).toContain("Oferta_Firme");
      expect(result.buffer.byteLength).toBeGreaterThan(100);
    }
  });
});
