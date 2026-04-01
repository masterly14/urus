/**
 * M8 — Aplica el delta interpretado por voz sobre un `OfertaFirmeContractPayload` inmutable.
 */

import type { OfertaFirmeContractPayload, AgencyFees } from "@/types/contracts";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

function moneyLiteralEs(amount: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} euros`;
}

function clonePayload(p: OfertaFirmeContractPayload): OfertaFirmeContractPayload {
  return structuredClone(p);
}

export interface ApplyOfertaVoicePatchesResult {
  nextPayload: OfertaFirmeContractPayload;
  appliedSummaries: string[];
}

export function applyOfertaFirmeVoicePatches(
  payload: OfertaFirmeContractPayload,
  patch: ContractVoiceStructuredPatch,
): ApplyOfertaVoicePatchesResult {
  const next = clonePayload(payload);
  const summaries: string[] = [];

  if (patch.noOperationalChanges) {
    return { nextPayload: next, appliedSummaries: summaries };
  }

  if (patch.offeredPriceEur !== null) {
    const amount = Number(patch.offeredPriceEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.offeredPrice = { amount, literalEs: moneyLiteralEs(amount) };
      summaries.push(`Precio ofrecido: ${amount} EUR`);
    }
  }

  if (patch.offerDepositEur !== null) {
    const amount = Number(patch.offerDepositEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.offerDeposit = { amount, literalEs: moneyLiteralEs(amount) };
      summaries.push(`Depósito de oferta: ${amount} EUR`);
    }
  }

  if (patch.arrasAmountAfterAcceptanceEur !== null) {
    const amount = Number(patch.arrasAmountAfterAcceptanceEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.arrasAmountAfterAcceptance = { amount, literalEs: moneyLiteralEs(amount) };
      summaries.push(`Importe de arras previsto: ${amount} EUR`);
    }
  }

  if (patch.offerValidityNaturalDays !== null) {
    const days = Math.trunc(patch.offerValidityNaturalDays);
    if (days > 0) {
      next.timelines = { ...next.timelines, offerValidityNaturalDays: days };
      summaries.push(`Validez de la oferta: ${days} días naturales`);
    }
  }

  if (patch.arrasSigningMaxNaturalDaysFromAcceptance !== null) {
    const days = Math.trunc(patch.arrasSigningMaxNaturalDaysFromAcceptance);
    if (days > 0) {
      next.timelines = { ...next.timelines, arrasSigningMaxNaturalDaysFromAcceptance: days };
      summaries.push(`Plazo para firmar arras: ${days} días naturales desde aceptación`);
    }
  }

  if (patch.escrituraMaxNaturalDaysFromArrasSignature !== null) {
    const days = Math.trunc(patch.escrituraMaxNaturalDaysFromArrasSignature);
    if (days > 0) {
      next.timelines = { ...next.timelines, escrituraMaxNaturalDaysFromArrasSignature: days };
      summaries.push(`Plazo para escritura: ${days} días naturales desde firma arras`);
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
