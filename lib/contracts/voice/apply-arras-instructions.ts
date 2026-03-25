/**
 * M8 — Aplica el delta interpretado por voz sobre un `ArrasContractPayload` inmutable.
 * Recalcula importes derivados (resto a escritura, literales EUR) de forma determinista.
 */

import type { ArrasContractPayload } from "@/types/contracts";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function moneyLiteralEs(amount: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} euros`;
}

function addNaturalDaysFromIsoDate(isoDate: string, days: number): string | null {
  if (!ISO_DATE.test(isoDate)) return null;
  const base = new Date(`${isoDate}T12:00:00.000Z`);
  if (Number.isNaN(base.getTime())) return null;
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function clonePayload(payload: ArrasContractPayload): ArrasContractPayload {
  return structuredClone(payload);
}

export interface ApplyArrasVoicePatchesResult {
  nextPayload: ArrasContractPayload;
  /** Frases cortas para UI / auditoría (qué se aplicó). */
  appliedSummaries: string[];
}

/**
 * Fusiona únicamente los campos no nulos del parche. No modifica el objeto de entrada.
 */
export function applyArrasVoicePatches(
  payload: ArrasContractPayload,
  patch: ContractVoiceStructuredPatch,
): ApplyArrasVoicePatchesResult {
  const next = clonePayload(payload);
  const appliedSummaries: string[] = [];

  if (patch.noOperationalChanges) {
    return { nextPayload: next, appliedSummaries };
  }

  if (patch.arrasRegime !== null) {
    next.flags = { ...next.flags, arrasRegime: patch.arrasRegime };
    appliedSummaries.push(`Régimen de arras: ${patch.arrasRegime}`);
  }

  if (patch.keysHandover !== null) {
    next.flags = { ...next.flags, keysHandover: patch.keysHandover };
    appliedSummaries.push(`Entrega de llaves: ${patch.keysHandover}`);
  }

  if (patch.validitySubjectToSellerReceipt !== null) {
    next.flags = { ...next.flags, validitySubjectToSellerReceipt: patch.validitySubjectToSellerReceipt };
    appliedSummaries.push(
      patch.validitySubjectToSellerReceipt
        ? "Validez supeditada al cobro efectivo por el vendedor: sí"
        : "Validez supeditada al cobro efectivo por el vendedor: no",
    );
  }

  if (patch.convocatoriaNotaryMinNaturalDays !== null) {
    const n = Math.trunc(patch.convocatoriaNotaryMinNaturalDays);
    if (n > 0) {
      next.timelines = { ...next.timelines, convocatoriaNotaryMinNaturalDays: n };
      appliedSummaries.push(`Antelación mínima convocatoria notarial: ${n} días naturales`);
    }
  }

  let maxDeedIso = patch.maxDeedDateIso;
  if (patch.maxDeedNaturalDaysFromDocumentDate !== null && maxDeedIso === null) {
    const days = Math.trunc(patch.maxDeedNaturalDaysFromDocumentDate);
    if (days > 0) {
      const computed = addNaturalDaysFromIsoDate(next.documentDateIso, days);
      if (computed) {
        maxDeedIso = computed;
        appliedSummaries.push(`Fecha máxima escritura: +${days} días naturales desde fecha del documento (${computed})`);
      }
    }
  }
  if (maxDeedIso !== null && ISO_DATE.test(maxDeedIso)) {
    next.timelines = { ...next.timelines, maxDeedDateIso: maxDeedIso };
    if (!appliedSummaries.some((s) => s.startsWith("Fecha máxima escritura:"))) {
      appliedSummaries.push(`Fecha máxima escritura: ${maxDeedIso}`);
    }
  }

  let maxKeysIso = patch.maxKeysHandoverDateIso;
  if (patch.maxKeysHandoverNaturalDaysFromDocumentDate !== null && maxKeysIso === null) {
    const days = Math.trunc(patch.maxKeysHandoverNaturalDaysFromDocumentDate);
    if (days > 0) {
      const computed = addNaturalDaysFromIsoDate(next.documentDateIso, days);
      if (computed) {
        maxKeysIso = computed;
        appliedSummaries.push(
          `Fecha máxima entrega de llaves: +${days} días naturales desde fecha del documento (${computed})`,
        );
      }
    }
  }
  if (maxKeysIso !== null && ISO_DATE.test(maxKeysIso)) {
    next.timelines = { ...next.timelines, maxKeysHandoverDateIso: maxKeysIso };
    if (!appliedSummaries.some((s) => s.startsWith("Fecha máxima entrega de llaves:"))) {
      appliedSummaries.push(`Fecha máxima entrega de llaves: ${maxKeysIso}`);
    }
  }

  if (patch.courtsMunicipality !== null && patch.courtsMunicipality.trim()) {
    next.jurisdiction = {
      ...next.jurisdiction,
      courtsMunicipality: patch.courtsMunicipality.trim(),
    };
    appliedSummaries.push(`Fuero / municipio de jurisdicción: ${patch.courtsMunicipality.trim()}`);
  }

  let totalChanged = false;
  if (patch.totalPurchasePriceEur !== null) {
    const amount = Number(patch.totalPurchasePriceEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.totalPurchasePrice = {
        amount,
        literalEs: moneyLiteralEs(amount),
      };
      totalChanged = true;
      appliedSummaries.push(`Precio total de compraventa: ${amount} EUR`);
    }
  }

  if (patch.arrasAmountEur !== null) {
    const amount = Number(patch.arrasAmountEur);
    if (Number.isFinite(amount) && amount > 0) {
      next.arrasAmount = {
        amount,
        literalEs: moneyLiteralEs(amount),
      };
      appliedSummaries.push(`Importe de arras: ${amount} EUR`);
    }
  }

  if (totalChanged || patch.arrasAmountEur !== null) {
    const remainder = next.totalPurchasePrice.amount - next.arrasAmount.amount;
    next.remainderAtPublicDeed = {
      amount: remainder,
      literalEs: moneyLiteralEs(remainder),
    };
    appliedSummaries.push(
      `Resto en escritura pública recalculado: ${remainder} EUR (precio total − arras)`,
    );
  }

  return { nextPayload: next, appliedSummaries };
}
