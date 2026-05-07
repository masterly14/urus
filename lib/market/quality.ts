/**
 * Cálculo de calidad de un listing canónico.
 *
 * Produce un `qualityScore` en [0, 1] y un set de `qualityFlags` que explican
 * los huecos detectados. El Core usa este score para:
 *
 *   - Decidir si un listing entra en el snapshot público (umbral mínimo).
 *   - Priorizar listings completos en búsquedas y reglas.
 *   - Detectar regresiones de cobertura (caída del score medio = problema
 *     en el extractor o en el portal).
 *
 * Reglas (ver docs/core-sistema-mercado.md, sección "Reglas de calidad"):
 *  - Penalización por cada flag, con pesos distintos según criticidad.
 *  - Las flags "_invalid_" pesan más que "_missing_" porque indican datos
 *    corruptos, no solo ausentes.
 *  - El score nunca baja de 0.
 *
 * Módulo **puro**.
 */

import type { CanonicalListing, QualityFlag, QualityResult } from "./types";

interface FlagWeight {
  flag: QualityFlag;
  weight: number;
}

// Pesos suman > 1 para penalizar fuerte cuando hay múltiples problemas.
// Score se clampea a 0 al final.
const FLAG_WEIGHTS: FlagWeight[] = [
  { flag: "missing_price", weight: 0.35 },
  { flag: "invalid_price", weight: 0.45 },
  { flag: "missing_area", weight: 0.2 },
  { flag: "invalid_area", weight: 0.3 },
  { flag: "missing_location", weight: 0.4 },
  { flag: "missing_rooms", weight: 0.1 },
  { flag: "missing_images", weight: 0.15 },
  { flag: "blocked_source", weight: 0.5 },
  { flag: "stale_data", weight: 0.25 },
];

const WEIGHT_BY_FLAG: Record<QualityFlag, number> = Object.fromEntries(
  FLAG_WEIGHTS.map((entry) => [entry.flag, entry.weight]),
) as Record<QualityFlag, number>;

export interface QualityComputeOptions {
  /** Umbral de "datos viejos". Si lastSeenAt > maxAgeMs → flag stale_data. */
  staleAfterMs?: number;
  /** Permite añadir flags desde el caller (ej. blocked_source detectado en captura). */
  extraFlags?: QualityFlag[];
  /** Permite forzar `now` en tests. */
  now?: Date;
}

const DEFAULT_STALE_MS = 1000 * 60 * 60 * 24 * 3; // 3 días

/**
 * Calcula calidad de un listing canónico. No muta el listing.
 */
export function computeQuality(
  listing: Pick<
    CanonicalListing,
    | "price"
    | "builtArea"
    | "city"
    | "zone"
    | "rooms"
    | "imageUrls"
    | "lastSeenAt"
  >,
  options: QualityComputeOptions = {},
): QualityResult {
  const flags = new Set<QualityFlag>();

  // --- Precio ---
  if (listing.price == null) {
    flags.add("missing_price");
  } else if (!Number.isFinite(listing.price) || listing.price <= 0) {
    flags.add("invalid_price");
  } else if (listing.price < 1000) {
    // Heurística: precio sospechosamente bajo para venta inmobiliaria.
    flags.add("invalid_price");
  }

  // --- Área ---
  if (listing.builtArea == null) {
    flags.add("missing_area");
  } else if (!Number.isFinite(listing.builtArea) || listing.builtArea <= 0) {
    flags.add("invalid_area");
  } else if (listing.builtArea < 10 || listing.builtArea > 10_000) {
    flags.add("invalid_area");
  }

  // --- Localización mínima ---
  if (!listing.city || listing.city.trim() === "") {
    flags.add("missing_location");
  }

  // --- Habitaciones (no aplica a garaje/local) ---
  if (listing.rooms == null) {
    flags.add("missing_rooms");
  }

  // --- Imágenes ---
  if (!listing.imageUrls || listing.imageUrls.length === 0) {
    flags.add("missing_images");
  }

  // --- Frescura ---
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_MS;
  const now = options.now ?? new Date();
  const lastSeen = new Date(listing.lastSeenAt);
  if (Number.isFinite(lastSeen.getTime())) {
    const age = now.getTime() - lastSeen.getTime();
    if (age > staleAfterMs) {
      flags.add("stale_data");
    }
  }

  // --- Flags extra del caller (ej. blocked_source desde captura) ---
  for (const f of options.extraFlags ?? []) {
    flags.add(f);
  }

  const totalPenalty = [...flags].reduce(
    (acc, f) => acc + (WEIGHT_BY_FLAG[f] ?? 0),
    0,
  );
  const score = clamp01(1 - totalPenalty);

  return {
    score: round3(score),
    flags: [...flags].sort(),
  };
}

/**
 * Aplica el resultado de calidad a un listing canónico.
 * Devuelve una copia (no muta el original).
 */
export function applyQuality(
  listing: CanonicalListing,
  options?: QualityComputeOptions,
): CanonicalListing {
  const q = computeQuality(listing, options);
  return { ...listing, qualityScore: q.score, qualityFlags: q.flags };
}

/**
 * Umbral mínimo recomendado para que un listing entre en el snapshot público.
 * Configurable vía env (`MARKET_MIN_QUALITY_SCORE`, sin valores por defecto
 * cuando no esté definido).
 */
export const DEFAULT_MIN_QUALITY_SCORE = 0.4;

export function isPublishable(score: number, minScore = DEFAULT_MIN_QUALITY_SCORE): boolean {
  return Number.isFinite(score) && score >= minScore;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
