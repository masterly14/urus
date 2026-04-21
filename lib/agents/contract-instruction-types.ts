/**
 * M8 — Intérprete de instrucciones verbales sobre contratos (Smart Closing).
 * Tipos compartidos entre el grafo LangGraph y el motor de plantillas.
 */

import type {
  ArrasLegalRegime,
  ArrasContractPayload,
  KeysHandoverMode,
  OfertaFirmeContractPayload,
  SenalCompraContractPayload,
} from "@/types/contracts";

// ── Input polimórfico ──────────────────────────────────────────────────────────

export type ContractInstructionGraphInput =
  | {
      transcript: string;
      documentKind: "arras";
      currentPayload: ArrasContractPayload;
    }
  | {
      transcript: string;
      documentKind: "senal_compra";
      currentPayload: SenalCompraContractPayload;
    }
  | {
      transcript: string;
      documentKind: "oferta_firme";
      currentPayload: OfertaFirmeContractPayload;
    };

// ── Parche universal ───────────────────────────────────────────────────────────

/**
 * Delta estructurado devuelto por el LLM.
 * Cada campo opcional: `null` = el gestor no pidió cambiar ese aspecto.
 *
 * El esquema cubre los tres tipos (arras, señal, oferta). Los campos que no
 * aplican a un tipo concreto deben venir en `null`.
 */
export interface ContractVoiceStructuredPatch {
  confidence: number;
  /** true si el mensaje no contiene instrucciones contractuales. */
  noOperationalChanges: boolean;

  // ── Flags / régimen ──────────────────────────────────────────────────────
  arrasRegime: ArrasLegalRegime | null;
  keysHandover: KeysHandoverMode | null;
  validitySubjectToSellerReceipt: boolean | null;
  includeFinancingFallbackClause: boolean | null;

  // ── Plazos genéricos ─────────────────────────────────────────────────────
  maxDeedDateIso: string | null;
  maxKeysHandoverDateIso: string | null;
  convocatoriaNotaryMinNaturalDays: number | null;
  maxDeedNaturalDaysFromDocumentDate: number | null;
  maxKeysHandoverNaturalDaysFromDocumentDate: number | null;

  // ── Plazos señal de compra ───────────────────────────────────────────────
  businessDaysToArrasContract: number | null;
  maxNaturalDaysToEscrituraFromSenalSignature: number | null;

  // ── Plazos oferta en firme ───────────────────────────────────────────────
  offerValidityNaturalDays: number | null;
  arrasSigningMaxNaturalDaysFromAcceptance: number | null;
  escrituraMaxNaturalDaysFromArrasSignature: number | null;

  // ── Importes ─────────────────────────────────────────────────────────────
  totalPurchasePriceEur: number | null;
  arrasAmountEur: number | null;
  offeredPriceEur: number | null;
  offerDepositEur: number | null;
  senalAmountEur: number | null;
  arrasAmountAfterAcceptanceEur: number | null;

  // ── Honorarios (% del precio final) ──────────────────────────────────────
  feesPercentOfFinalPrice: number | null;
  feesFixedNetEur: number | null;
  feesVatRatePercent: number | null;

  // ── Otros ────────────────────────────────────────────────────────────────
  courtsMunicipality: string | null;

  // ── Cláusulas adicionales dictadas por el comercial ────────────────────
  /** Texto libre dictado para incluir como cláusula adicional. null si no dictó ninguna. */
  additionalClauseText: string | null;

  // ── Respuesta conversacional del asistente ─────────────────────────────
  /** Mensaje que el asistente muestra al comercial: confirmación, resumen o pregunta. */
  assistantMessage: string;
  /** Datos que el asistente detecta como faltantes o incompletos en el contrato. */
  missingDataQuestions: string[];

  ambiguousPoints: string[];
  reasoning: string;
}
