import type { FurnitureAnnexPayload, MoneyEUR } from "@/types/contracts";
import type { ContractVoiceStructuredPatch } from "@/lib/agents/contract-instruction-types";

function moneyLiteralEs(amount: number): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} euros`;
}

function clonePayload(payload: FurnitureAnnexPayload): FurnitureAnnexPayload {
  return structuredClone(payload);
}

function toMoneyEUR(amount: number): MoneyEUR {
  return {
    amount,
    literalEs: moneyLiteralEs(amount),
  };
}

export interface ApplyAnexoVoicePatchesResult {
  nextPayload: FurnitureAnnexPayload;
  appliedSummaries: string[];
}

export function applyFurnitureAnnexVoicePatches(
  payload: FurnitureAnnexPayload,
  patch: ContractVoiceStructuredPatch,
): ApplyAnexoVoicePatchesResult {
  const next = clonePayload(payload);
  const summaries: string[] = [];

  if (patch.noOperationalChanges) {
    return { nextPayload: next, appliedSummaries: summaries };
  }

  if (patch.furnitureHasFurniture !== null) {
    next.flags = { ...next.flags, hasFurniture: patch.furnitureHasFurniture };
    summaries.push(
      patch.furnitureHasFurniture
        ? "Anexo actualizado: existe mobiliario negociado"
        : "Anexo actualizado: no existe mobiliario negociado",
    );
  }

  if (patch.furnitureOperationRef !== null && patch.furnitureOperationRef.trim()) {
    next.operationRef = patch.furnitureOperationRef.trim();
    summaries.push("Referencia de operación actualizada");
  }

  if (
    patch.furniturePropertyAddressLine !== null &&
    patch.furniturePropertyAddressLine.trim()
  ) {
    next.propertyAddressLine = patch.furniturePropertyAddressLine.trim();
    summaries.push("Dirección del inmueble actualizada");
  }

  if (patch.furniturePartiesLine !== null && patch.furniturePartiesLine.trim()) {
    next.partiesLine = patch.furniturePartiesLine.trim();
    summaries.push("Partes del anexo actualizadas");
  }

  if (patch.furnitureItemsToAdd.length > 0) {
    const normalized = patch.furnitureItemsToAdd
      .map((item) => {
        const description = item.description.trim();
        const quantity = Math.trunc(item.quantity);
        const estimatedValue = item.estimatedValueEur ?? null;
        if (!description || !Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }
        if (estimatedValue !== null && (!Number.isFinite(estimatedValue) || estimatedValue <= 0)) {
          return {
            description,
            quantity,
            includedInPurchasePrice: item.includedInPurchasePrice,
            estimatedValueEur: undefined,
          };
        }
        return {
          description,
          quantity,
          includedInPurchasePrice: item.includedInPurchasePrice,
          estimatedValueEur: estimatedValue,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (normalized.length > 0) {
      next.items = [
        ...next.items,
        ...normalized.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          includedInPurchasePrice: item.includedInPurchasePrice,
          ...(typeof item.estimatedValueEur === "number"
            ? { estimatedValueEur: toMoneyEUR(item.estimatedValueEur) }
            : {}),
        })),
      ];
      summaries.push(
        normalized.length === 1
          ? `Anadido 1 item de mobiliario: ${normalized[0]?.description}`
          : `Anadidos ${normalized.length} items de mobiliario`,
      );
    }
  }

  return { nextPayload: next, appliedSummaries: summaries };
}
