/**
 * M8 — Aplica el delta interpretado por voz sobre un `SenalCompraContractPayload` inmutable.
 */

import type { SenalCompraContractPayload, AgencyFees } from "@/types/contracts";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

function moneyLiteralEs(amount: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} euros`;
}

function clonePayload(p: SenalCompraContractPayload): SenalCompraContractPayload {
  return structuredClone(p);
}

export interface ApplySenalVoicePatchesResult {
  nextPayload: SenalCompraContractPayload;
  appliedSummaries: string[];
}

export function applySenalCompraVoicePatches(
  payload: SenalCompraContractPayload,
  patch: ContractVoiceStructuredPatch,
): ApplySenalVoicePatchesResult {
  const next = clonePayload(payload);
  const summaries: string[] = [];

  if (patch.noOperationalChanges) {
    return { nextPayload: next, appliedSummaries: summaries };
  }

  if (patch.keysHandover !== null) {
    next.flags = { ...next.flags, keysHandover: patch.keysHandover };
    summaries.push(`Entrega de llaves: ${patch.keysHandover}`);
  }

  if (patch.includeFinancingFallbackClause !== null) {
    next.flags = { ...next.flags, includeFinancingFallbackClause: patch.includeFinancingFallbackClause };
    summaries.push(
      patch.includeFinancingFallbackClause
        ? "Cláusula de financiación hipotecaria: incluida"
        : "Cláusula de financiación hipotecaria: eliminada",
    );
  }

  if (patch.senalAmountEur !== null) {
    const amount = Number(patch.senalAmountEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.senalAmount = { amount, literalEs: moneyLiteralEs(amount) };
      summaries.push(`Importe de señal: ${amount} EUR`);
    }
  }

  if (patch.offeredPriceEur !== null) {
    const amount = Number(patch.offeredPriceEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.offeredPrice = { amount, literalEs: moneyLiteralEs(amount) };
      summaries.push(`Precio ofrecido: ${amount} EUR`);
    }
  }

  if (patch.businessDaysToArrasContract !== null) {
    const days = Math.trunc(patch.businessDaysToArrasContract);
    if (days > 0) {
      next.timelines = { ...next.timelines, businessDaysToArrasContract: days };
      summaries.push(`Días hábiles para firma de arras: ${days}`);
    }
  }

  if (patch.maxNaturalDaysToEscrituraFromSenalSignature !== null) {
    const days = Math.trunc(patch.maxNaturalDaysToEscrituraFromSenalSignature);
    if (days > 0) {
      next.timelines = { ...next.timelines, maxNaturalDaysToEscrituraFromSenalSignature: days };
      summaries.push(`Plazo máximo escritura: ${days} días naturales desde firma de señal`);
    }
  }

  if (patch.convocatoriaNotaryMinNaturalDays !== null) {
    const n = Math.trunc(patch.convocatoriaNotaryMinNaturalDays);
    if (n > 0) {
      next.timelines = { ...next.timelines, convocatoriaNotaryMinNaturalDays: n };
      summaries.push(`Antelación mínima convocatoria notarial: ${n} días naturales`);
    }
  }

  if (patch.courtsMunicipality !== null && patch.courtsMunicipality.trim()) {
    next.jurisdiction = { ...next.jurisdiction, courtsMunicipality: patch.courtsMunicipality.trim() };
    summaries.push(`Fuero: ${patch.courtsMunicipality.trim()}`);
  }

  const updatedFees = applyFeesPatch(next.fees, patch, summaries);
  if (updatedFees) next.fees = updatedFees;

  return { nextPayload: next, appliedSummaries: summaries };
}

function applyFeesPatch(
  current: AgencyFees,
  patch: ContractVoiceStructuredPatch,
  summaries: string[],
): AgencyFees | null {
  if (
    patch.feesPercentOfFinalPrice === null &&
    patch.feesFixedNetEur === null &&
    patch.feesVatRatePercent === null
  ) {
    return null;
  }

  const vatRate = patch.feesVatRatePercent ?? current.vatRatePercent;

  if (patch.feesFixedNetEur !== null && Number.isFinite(patch.feesFixedNetEur) && patch.feesFixedNetEur > 0) {
    summaries.push(`Honorarios fijos: ${patch.feesFixedNetEur} EUR + ${vatRate}% IVA`);
    return {
      model: "fixed_net",
      netAmount: { amount: patch.feesFixedNetEur, literalEs: moneyLiteralEs(patch.feesFixedNetEur) },
      vatRatePercent: vatRate,
      devengo: "firma_arras",
    };
  }

  if (patch.feesPercentOfFinalPrice !== null && Number.isFinite(patch.feesPercentOfFinalPrice) && patch.feesPercentOfFinalPrice > 0) {
    summaries.push(`Honorarios: ${patch.feesPercentOfFinalPrice}% + ${vatRate}% IVA`);
    return {
      model: "percent_of_final_price",
      percentOfFinalPrice: patch.feesPercentOfFinalPrice,
      vatRatePercent: vatRate,
      devengo: "firma_arras",
    };
  }

  if (patch.feesVatRatePercent !== null) {
    summaries.push(`IVA de honorarios: ${patch.feesVatRatePercent}%`);
    return { ...current, vatRatePercent: patch.feesVatRatePercent };
  }

  return null;
}
