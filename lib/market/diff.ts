/**
 * Diff engine para detectar cambios relevantes entre dos versiones de un
 * `MarketListing` (canonical) y mapearlos a un `MarketEventType`.
 *
 * Modulo **puro** (sin I/O ni Prisma). Lo usa `MARKET_DIFF_AND_VERSION` y
 * tests unitarios. Ver `lib/market/identity.ts` y `lib/market/normalize.ts`
 * para el resto del pipeline.
 *
 * Reglas de mapping (ver docs/core-sistema-mercado.md, "Reglas de versionado"):
 *   - prev = null → MARKET_LISTING_CREATED.
 *   - status active→removed → MARKET_LISTING_REMOVED.
 *   - status removed/inactive→active → MARKET_LISTING_REAPPEARED.
 *   - status cualquier otro cambio → MARKET_LISTING_STATUS_CHANGED.
 *   - price cambia (y status no) → MARKET_LISTING_PRICE_CHANGED.
 *   - cualquier campo "tracked" cambia → MARKET_LISTING_UPDATED.
 *   - sin cambios → null (no se emite evento ni version).
 *
 * Si hay cambio de status Y de precio simultaneo, se prioriza status (es
 * la senal mas relevante para alertas y dedupe). El price change queda
 * registrado en `changedFields` para que la UI lo muestre, pero el
 * `eventType` reportado es el de status.
 */

import type {
  CanonicalListing,
  MarketEventType,
  MarketListingStatus,
} from "./types";

/** Campos cuyo cambio justifica una nueva `MarketListingVersion`. */
const TRACKED_FIELDS = [
  "status",
  "price",
  "pricePerMeter",
  "builtArea",
  "rooms",
  "bathrooms",
  "floor",
  "city",
  "zone",
  "addressApprox",
  "lat",
  "lng",
  "geohash",
  "advertiserType",
  "advertiserName",
  "phones",
  "mainImageUrl",
  "imageUrls",
  "qualityScore",
] as const satisfies readonly (keyof CanonicalListing)[];

export type TrackedField = (typeof TRACKED_FIELDS)[number];

export interface ListingDiff {
  /** Campos cambiados (subset de `TRACKED_FIELDS`). */
  changedFields: TrackedField[];
  /** Subset del estado previo para los campos cambiados. */
  before: Partial<CanonicalListing>;
  /** Subset del estado nuevo para los campos cambiados. */
  after: Partial<CanonicalListing>;
  /** Tipo de evento a emitir. `null` cuando no hay cambios. */
  eventType: MarketEventType | null;
  /** Diferencia absoluta de precio si aplica (solo en PRICE_CHANGED). */
  priceDelta: { abs: number | null; pct: number | null } | null;
}

/**
 * Compara dos listings canonicos. Si `prev = null`, se reporta como creacion.
 *
 * Tolerancia: para campos numericos que pueden venir con minimas diferencias
 * de redondeo (qualityScore, pricePerMeter), se considera "sin cambio" si la
 * diferencia absoluta es < 0.001. Para precio, area, rooms, bathrooms se
 * exige igualdad exacta (la normalizacion ya redondea consistentemente).
 */
export function diffListing(
  prev: CanonicalListing | null,
  current: CanonicalListing,
): ListingDiff {
  if (!prev) {
    return {
      changedFields: [...TRACKED_FIELDS],
      before: {},
      after: pickTracked(current),
      eventType: "MARKET_LISTING_CREATED",
      priceDelta: null,
    };
  }

  const changed: TrackedField[] = [];
  const before: Partial<CanonicalListing> = {};
  const after: Partial<CanonicalListing> = {};

  for (const field of TRACKED_FIELDS) {
    const prevVal = prev[field];
    const currVal = current[field];
    if (!isEqual(field, prevVal, currVal)) {
      changed.push(field);
      before[field] = prevVal as never;
      after[field] = currVal as never;
    }
  }

  if (changed.length === 0) {
    return {
      changedFields: [],
      before: {},
      after: {},
      eventType: null,
      priceDelta: null,
    };
  }

  // Precedencia: status > price > cualquier otro.
  if (changed.includes("status")) {
    return {
      changedFields: changed,
      before,
      after,
      eventType: classifyStatusChange(prev.status, current.status),
      priceDelta: changed.includes("price")
        ? computePriceDelta(prev.price, current.price)
        : null,
    };
  }

  if (changed.includes("price")) {
    return {
      changedFields: changed,
      before,
      after,
      eventType: "MARKET_LISTING_PRICE_CHANGED",
      priceDelta: computePriceDelta(prev.price, current.price),
    };
  }

  return {
    changedFields: changed,
    before,
    after,
    eventType: "MARKET_LISTING_UPDATED",
    priceDelta: null,
  };
}

/** Identifica casos especiales de status (REMOVED / REAPPEARED). */
function classifyStatusChange(
  prev: MarketListingStatus,
  current: MarketListingStatus,
): MarketEventType {
  if (current === "removed" && prev !== "removed") {
    return "MARKET_LISTING_REMOVED";
  }
  if (
    current === "active" &&
    (prev === "inactive" || prev === "removed" || prev === "blocked")
  ) {
    return "MARKET_LISTING_REAPPEARED";
  }
  return "MARKET_LISTING_STATUS_CHANGED";
}

function computePriceDelta(
  prev: number | null,
  current: number | null,
): { abs: number | null; pct: number | null } {
  if (prev == null || current == null) return { abs: null, pct: null };
  const abs = current - prev;
  const pct = prev !== 0 ? abs / prev : null;
  return {
    abs: round2(abs),
    pct: pct != null ? round4(pct) : null,
  };
}

function pickTracked(listing: CanonicalListing): Partial<CanonicalListing> {
  const out: Partial<CanonicalListing> = {};
  for (const field of TRACKED_FIELDS) {
    out[field] = listing[field] as never;
  }
  return out;
}

function isEqual(field: TrackedField, a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;

  // Tolerancia numerica para campos con redondeo.
  if (
    field === "qualityScore" ||
    field === "pricePerMeter" ||
    field === "lat" ||
    field === "lng"
  ) {
    if (typeof a === "number" && typeof b === "number") {
      return Math.abs(a - b) < 0.001;
    }
  }

  // Arrays: comparacion ordenada por valor (orden insensible).
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort();
    const sb = [...b].sort();
    return sa.every((v, i) => v === sb[i]);
  }

  return false;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
