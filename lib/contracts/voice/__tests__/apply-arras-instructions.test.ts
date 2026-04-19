/**
 * Tests de: `applyArrasVoicePatches` (lib/contracts/voice/apply-arras-instructions.ts)
 *
 * Qué se testea: la capa determinista que traduce un `ContractVoiceStructuredPatch`
 * (salida del intérprete LangGraph) en un nuevo `ArrasContractPayload` inmutable,
 * sin llamar al LLM ni generar DOCX.
 */
import { describe, expect, it } from "vitest";
import type { ArrasContractPayload } from "@/types/contracts";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";
import { applyArrasVoicePatches } from "../apply-arras-instructions";

function basePayload(): ArrasContractPayload {
  return {
    documentDateIso: "2026-03-01",
    signPlace: "Valencia",
    buyers: [
      {
        fullName: "Comprador Uno",
        nationalId: "11111111A",
        fiscalAddress: { streetLine: "Calle 1", municipality: "Valencia" },
      },
    ],
    sellers: [
      {
        fullName: "Vendedor Uno",
        nationalId: "22222222B",
        fiscalAddress: { streetLine: "Calle 2", municipality: "Valencia" },
      },
    ],
    property: {
      addressLine: "Calle Falsa 1",
      municipality: "Valencia",
      cadastralReference: "123456789",
    },
    totalPurchasePrice: { amount: 100_000, literalEs: "cien mil euros" },
    arrasAmount: { amount: 10_000, literalEs: "diez mil euros" },
    remainderAtPublicDeed: { amount: 90_000, literalEs: "noventa mil euros" },
    arrasPaymentAccount: {
      iban: "ES0000000000000000000000",
      bankName: "Banco",
      holdersLine: "Vendedor Uno",
    },
    timelines: {
      maxDeedDateIso: "2026-06-01",
      maxKeysHandoverDateIso: "2026-06-01",
      convocatoriaNotaryMinNaturalDays: 7,
    },
    jurisdiction: { courtsMunicipality: "Valencia" },
    flags: {
      arrasRegime: "confirmatoria",
      keysHandover: "same_day_as_deed",
      validitySubjectToSellerReceipt: false,
    },
  };
}

function emptyPatch(overrides: Partial<ContractVoiceStructuredPatch>): ContractVoiceStructuredPatch {
  return {
    confidence: 1,
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
    reasoning: "test",
    ...overrides,
  };
}

describe("applyArrasVoicePatches — fusión parche → payload arras (motor de plantillas, sin IA)", () => {
  describe("flag noOperationalChanges del intérprete", () => {
    it("no muta el payload ni añade líneas al resumen si el gestor no pidió cambios contractuales", () => {
      const p = basePayload();
      const { nextPayload, appliedSummaries } = applyArrasVoicePatches(
        p,
        emptyPatch({ noOperationalChanges: true }),
      );
      expect(nextPayload).toEqual(p);
      expect(appliedSummaries).toHaveLength(0);
    });
  });

  describe("flags de plantilla arras (variables / bloques condicionales en el modelo)", () => {
    it("actualiza flags.arrasRegime y flags.keysHandover cuando el parche los trae rellenos", () => {
      const { nextPayload } = applyArrasVoicePatches(
        basePayload(),
        emptyPatch({
          arrasRegime: "penitencial",
          keysHandover: "separate_agreed_date",
        }),
      );
      expect(nextPayload.flags.arrasRegime).toBe("penitencial");
      expect(nextPayload.flags.keysHandover).toBe("separate_agreed_date");
    });
  });

  describe("timelines.maxDeedDateIso derivado de plazo en días naturales", () => {
    it("asigna la fecha ISO sumando N días naturales a payload.documentDateIso (UTC mediodía)", () => {
      const { nextPayload } = applyArrasVoicePatches(
        basePayload(),
        emptyPatch({ maxDeedNaturalDaysFromDocumentDate: 45 }),
      );
      expect(nextPayload.timelines.maxDeedDateIso).toBe("2026-04-15");
    });
  });

  describe("importes y coherencia remainderAtPublicDeed", () => {
    it("al cambiar solo arrasAmountEur, recalcula remainder como precio total − arras y actualiza literalEs", () => {
      const { nextPayload } = applyArrasVoicePatches(
        basePayload(),
        emptyPatch({ arrasAmountEur: 20_000 }),
      );
      expect(nextPayload.arrasAmount.amount).toBe(20_000);
      expect(nextPayload.totalPurchasePrice.amount).toBe(100_000);
      expect(nextPayload.remainderAtPublicDeed.amount).toBe(80_000);
    });
  });
});
