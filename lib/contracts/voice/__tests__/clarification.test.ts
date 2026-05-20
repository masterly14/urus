import { describe, expect, it } from "vitest";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import {
  getVoiceClarificationDecision,
  VOICE_APPLY_CLARIFICATION_THRESHOLD,
} from "../clarification";

function makePatch(
  overrides: Partial<ContractVoiceStructuredPatch> = {},
): ContractVoiceStructuredPatch {
  return {
    confidence: 0.95,
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
    additionalClauseText: null,
    sectionAddendumInstructions: [],
    furnitureHasFurniture: null,
    furnitureOperationRef: null,
    furniturePropertyAddressLine: null,
    furniturePartiesLine: null,
    furnitureItemsToAdd: [],
    assistantMessage: "",
    missingDataQuestions: [],
    ambiguousPoints: [],
    reasoning: "",
    ...overrides,
  };
}

describe("getVoiceClarificationDecision", () => {
  it("bloquea cuando el intérprete devuelve ambigüedades", () => {
    const result = getVoiceClarificationDecision(
      makePatch({ ambiguousPoints: ["No queda claro si los días son hábiles o naturales"] }),
    );

    expect(result.needsClarification).toBe(true);
    expect(result.questions).toEqual(["No queda claro si los días son hábiles o naturales"]);
  });

  it("bloquea cuando la confianza cae por debajo del umbral", () => {
    const result = getVoiceClarificationDecision(
      makePatch({ confidence: VOICE_APPLY_CLARIFICATION_THRESHOLD - 0.01 }),
    );

    expect(result.needsClarification).toBe(true);
    expect(result.questions[0]).toContain("baja confianza");
  });

  it("no bloquea mensajes sin cambios operativos", () => {
    const result = getVoiceClarificationDecision(
      makePatch({
        noOperationalChanges: true,
        confidence: 0.2,
        ambiguousPoints: ["saludo"],
      }),
    );

    expect(result.needsClarification).toBe(false);
    expect(result.questions).toHaveLength(0);
  });
});
