import { describe, expect, it } from "vitest";
import type { FurnitureAnnexPayload } from "@/types/contracts";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import { applyFurnitureAnnexVoicePatches } from "../apply-anexo-instructions";

function makePayload(): FurnitureAnnexPayload {
  return {
    documentDateIso: "2026-05-20",
    signPlace: "Cordoba",
    operationRef: "OP-1",
    propertyAddressLine: "Calle Demo 1",
    partiesLine: "Comprador y vendedor",
    items: [],
    flags: { hasFurniture: false },
  };
}

function makePatch(overrides: Partial<ContractVoiceStructuredPatch> = {}): ContractVoiceStructuredPatch {
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

describe("applyFurnitureAnnexVoicePatches", () => {
  it("actualiza campos base y añade items dictados", () => {
    const payload = makePayload();
    const patch = makePatch({
      furnitureHasFurniture: true,
      furnitureOperationRef: "OP-2",
      furniturePropertyAddressLine: "Avenida Nueva 10",
      furniturePartiesLine: "Compradora Ana / Vendedor Luis",
      furnitureItemsToAdd: [
        {
          description: "Mesa comedor",
          quantity: 1,
          includedInPurchasePrice: true,
          estimatedValueEur: 350,
        },
      ],
    });

    const result = applyFurnitureAnnexVoicePatches(payload, patch);

    expect(result.nextPayload.flags.hasFurniture).toBe(true);
    expect(result.nextPayload.operationRef).toBe("OP-2");
    expect(result.nextPayload.propertyAddressLine).toBe("Avenida Nueva 10");
    expect(result.nextPayload.items).toHaveLength(1);
    expect(result.nextPayload.items[0]?.description).toBe("Mesa comedor");
    expect(result.nextPayload.items[0]?.estimatedValueEur?.amount).toBe(350);
    expect(result.appliedSummaries.length).toBeGreaterThan(0);
  });
});
