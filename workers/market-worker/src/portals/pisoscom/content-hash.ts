/**
 * Hash determinístico para deduplicar capturas de Pisos.com.
 * Mismo enfoque que Fotocasa: solo campos estables (sin imageUrls,
 * sin posiciones DOM).
 */

import { createHash } from "node:crypto";

export interface HashablePisoscomCard {
  externalId: string | null;
  canonicalUrl: string;
  priceRaw?: string | null;
  title?: string | null;
  surfaceRaw?: string | null;
  roomsRaw?: string | null;
  zoneRaw?: string | null;
}

export function computePisoscomContentHash(card: HashablePisoscomCard): string {
  const parts = [
    card.externalId ?? "",
    card.canonicalUrl,
    (card.priceRaw ?? "").trim(),
    (card.title ?? "").trim().toLowerCase(),
    (card.surfaceRaw ?? "").trim(),
    (card.roomsRaw ?? "").trim(),
    (card.zoneRaw ?? "").trim().toLowerCase(),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}
