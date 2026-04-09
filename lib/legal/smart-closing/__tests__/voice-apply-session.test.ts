import { describe, expect, it } from "vitest";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import type { ContractTemplateInput } from "@/types/contracts";
import { mergeVoiceApplyIntoSession, type SmartClosingDocState } from "../voice-apply-session";

function emptyPatch(overrides: Partial<ContractVoiceStructuredPatch> = {}): ContractVoiceStructuredPatch {
  return {
    confidence: 0.9,
    noOperationalChanges: false,
    arrasRegime: null,
    keysHandover: null,
    validitySubjectToSellerReceipt: null,
    includeFinancingFallbackClause: null,
    maxDeedDateIso: null,
    maxKeysHandoverDateIso: null,
    convocatoriaNotaryMinNaturalDays: null,
    maxDeedNaturalDaysFromDocumentDate: null,
    maxKeysHandoverNaturalDaysFromDocumentDate: null,
    businessDaysToArrasContract: null,
    maxNaturalDaysToEscrituraFromSenalSignature: null,
    offerValidityNaturalDays: null,
    arrasSigningMaxNaturalDaysFromAcceptance: null,
    escrituraMaxNaturalDaysFromArrasSignature: null,
    totalPurchasePriceEur: null,
    arrasAmountEur: null,
    offeredPriceEur: null,
    offerDepositEur: null,
    senalAmountEur: null,
    arrasAmountAfterAcceptanceEur: null,
    feesPercentOfFinalPrice: null,
    feesFixedNetEur: null,
    feesVatRatePercent: null,
    courtsMunicipality: null,
    ambiguousPoints: [],
    reasoning: "",
    ...overrides,
  };
}

const arrasInput = (version: string): ContractTemplateInput => ({
  kind: "arras",
  templateVersion: version,
  payload: {
    documentDateIso: "2026-05-21",
    signPlace: "Córdoba",
    buyers: [
      {
        fullName: "A",
        nationalId: "1",
        fiscalAddress: { streetLine: "s", municipality: "m" },
      },
    ],
    sellers: [
      {
        fullName: "B",
        nationalId: "2",
        fiscalAddress: { streetLine: "s", municipality: "m" },
      },
    ],
    property: {
      addressLine: "p",
      municipality: "m",
      cadastralReference: "c",
    },
    totalPurchasePrice: { amount: 100_000, literalEs: "cien mil euros" },
    arrasAmount: { amount: 10_000, literalEs: "diez mil euros" },
    remainderAtPublicDeed: { amount: 90_000, literalEs: "noventa mil euros" },
    arrasPaymentAccount: {
      iban: "ES9121000418450200051332",
      bankName: "B",
      holdersLine: "B",
    },
    timelines: {
      maxDeedDateIso: "2026-08-21",
      maxKeysHandoverDateIso: "2026-08-21",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: { courtsMunicipality: "m" },
    flags: {
      arrasRegime: "penitencial",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: true,
    },
  },
});

describe("mergeVoiceApplyIntoSession", () => {
  const prev: SmartClosingDocState = {
    contractTemplateInput: arrasInput("v1"),
    docxBase64: "QUJD",
    docxFileName: "a.docx",
  };

  it("actualiza documento cuando ok es true", () => {
    const nextInput = arrasInput("v2");
    const delta = mergeVoiceApplyIntoSession(prev, {
      ok: true,
      updatedInput: nextInput,
      docxBase64: "WFhY",
      docxFileName: "b.docx",
      appliedSummaries: ["Honorarios ajustados"],
      patch: emptyPatch(),
      nextTemplateVersion: "v2",
    });

    expect(delta.doc.contractTemplateInput).toEqual(nextInput);
    expect(delta.doc.docxBase64).toBe("WFhY");
    expect(delta.doc.docxFileName).toBe("b.docx");
    expect(delta.validationIssues).toHaveLength(0);
    expect(delta.appliedSummaries).toEqual(["Honorarios ajustados"]);
  });

  it("conserva borrador previo cuando ok es false", () => {
    const invalidInput = arrasInput("v2-broken");
    const delta = mergeVoiceApplyIntoSession(prev, {
      ok: false,
      updatedInput: invalidInput,
      validationIssues: [
        {
          event: "DATOS_INCOMPLETOS",
          documentKind: "arras",
          fieldPath: "arrasAmount.amount",
          message: "Importe inválido",
        },
      ],
      appliedSummaries: ["Intento de cambio"],
      patch: emptyPatch({ confidence: 0.5 }),
      nextTemplateVersion: "v2-broken",
    });

    expect(delta.doc.contractTemplateInput).toEqual(prev.contractTemplateInput);
    expect(delta.doc.docxBase64).toBe("QUJD");
    expect(delta.doc.docxFileName).toBe("a.docx");
    expect(delta.validationIssues).toHaveLength(1);
    expect(delta.validationIssues[0].fieldPath).toBe("arrasAmount.amount");
  });

  it("conserva borrador y expone preguntas cuando el backend pide aclaración", () => {
    const delta = mergeVoiceApplyIntoSession(prev, {
      ok: false,
      needsClarification: true,
      updatedInput: arrasInput("v1"),
      validationIssues: [],
      clarificationQuestions: [
        "Aclara si el plazo de escritura debe contarse en días hábiles o naturales.",
      ],
      appliedSummaries: [],
      patch: emptyPatch({ confidence: 0.42, ambiguousPoints: ["plazo ambiguo"] }),
      nextTemplateVersion: "v1",
    });

    expect(delta.doc.contractTemplateInput).toEqual(prev.contractTemplateInput);
    expect(delta.doc.docxBase64).toBe("QUJD");
    expect(delta.validationIssues).toHaveLength(0);
    expect(delta.clarificationQuestions).toEqual([
      "Aclara si el plazo de escritura debe contarse en días hábiles o naturales.",
    ]);
  });
});
