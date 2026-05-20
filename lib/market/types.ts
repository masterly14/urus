/**
 * Tipos del dominio Core de Inteligencia de Mercado.
 *
 * Este módulo es el **contrato canónico** entre las distintas fases del
 * pipeline (adquisición, normalización, identidad, diff, snapshot, reglas)
 * y entre el Worker externo y la app principal.
 *
 * - Re-exporta los enums de Prisma como tipos de dominio para tener un
 *   único punto de verdad (la DB) sin acoplar consumidores al cliente
 *   Prisma directamente.
 * - Define DTOs internos (`Raw*`, `Canonical*`, `*DTO`, `*Request`,
 *   `*Response`) usados por el Worker externo y los handlers.
 *
 * Ver:
 *   - docs/core-sistema-mercado.md
 *   - docs/core-sistema-mercado-plan-implementacion.md
 *   - docs/core-sistema-mercado-decisiones.md
 */

import type {
  CrawlRunStatus as PrismaCrawlRunStatus,
  MarketCaptacionStage as PrismaMarketCaptacionStage,
  MarketCircuitBreakerStatus as PrismaMarketCircuitBreakerStatus,
  MarketEventType as PrismaMarketEventType,
  MarketHousingType as PrismaMarketHousingType,
  MarketListingStatus as PrismaMarketListingStatus,
  MarketOperation as PrismaMarketOperation,
  MarketSource as PrismaMarketSource,
  RawListingStatus as PrismaRawListingStatus,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// Enums del dominio (re-export de Prisma para evitar duplicación)
// ---------------------------------------------------------------------------

export type MarketSource = PrismaMarketSource;
export type MarketOperation = PrismaMarketOperation;
export type MarketCaptacionStage = PrismaMarketCaptacionStage;
export type MarketHousingType = PrismaMarketHousingType;
export type MarketListingStatus = PrismaMarketListingStatus;
export type CrawlRunStatus = PrismaCrawlRunStatus;
export type RawListingStatus = PrismaRawListingStatus;
export type MarketEventType = PrismaMarketEventType;
export type MarketCircuitBreakerStatus = PrismaMarketCircuitBreakerStatus;

// Conjuntos de literales útiles para validación en handlers/routes.
// Mantenidos manualmente; un test los compara contra Prisma para evitar drift.
export const MARKET_SOURCES = [
  "source_a",
  "source_b",
  "source_c",
  "source_d",
  "unknown",
] as const satisfies readonly MarketSource[];

export const MARKET_OPERATIONS = ["sale", "rent"] as const satisfies readonly MarketOperation[];

export const MARKET_HOUSING_TYPES = [
  "flat",
  "house",
  "countryhouse",
  "duplex",
  "penthouse",
  "studio",
  "loft",
  "garage",
  "office",
  "premises",
  "land",
  "building",
  "storage",
  "warehouse",
  "room",
] as const satisfies readonly MarketHousingType[];

export const MARKET_LISTING_STATUSES = [
  "active",
  "inactive",
  "removed",
  "blocked",
  "unknown",
] as const satisfies readonly MarketListingStatus[];

// ---------------------------------------------------------------------------
// Capa RAW: lo que el Worker captura del portal (sin normalizar)
// ---------------------------------------------------------------------------

/**
 * Captura bruta de un anuncio. El Worker la persiste tal cual la obtiene del
 * portal. Es la fuente de verdad técnica para reproceso.
 */
export interface RawListing {
  /** Portal de origen detectado por el Worker. */
  source: MarketSource;
  /** ID externo del anuncio en el portal (ej. 110283328). Puede faltar. */
  externalId: string | null;
  /** URL canonicalizada (sin tracking, sin hash, sin params volátiles). */
  canonicalUrl: string;
  /** HTTP status de la última captura. Útil para diagnosticar bloqueos. */
  httpStatus: number | null;
  /** Hash determinístico del contenido raw para dedupe sin reproceso. */
  contentHash: string;
  /** Payload bruto: campos extraídos por el extractor del portal. */
  payload: RawListingPayload;
  /** Marca temporal de captura. */
  capturedAt: string;
}

/**
 * Estructura genérica del payload bruto. Cada portal puede aportar campos
 * adicionales en `extras`, pero el set base es común.
 */
export interface RawListingPayload {
  title?: string;
  url?: string;
  rawText?: string;
  priceRaw?: string;
  surfaceRaw?: string;
  roomsRaw?: string;
  bathroomsRaw?: string;
  floorRaw?: string;
  addressRaw?: string;
  cityRaw?: string;
  zoneRaw?: string;
  housingRaw?: string;
  operationRaw?: string;
  advertiserName?: string;
  advertiserType?: string;
  phones?: string[];
  imageUrls?: string[];
  mainImageUrl?: string;
  lat?: number;
  lng?: number;
  extras?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Capa CANONICAL: forma normalizada para snapshot, búsqueda y reglas
// ---------------------------------------------------------------------------

/**
 * Listing canónico (post-normalización). Espejo del modelo Prisma
 * `MarketListing` con timestamps en string ISO para serialización HTTP.
 *
 * Campos opcionales con `null` (no `undefined`) para reflejar fielmente la
 * forma de la DB y evitar perder información en JSON.
 */
export interface CanonicalListing {
  source: MarketSource;
  externalId: string;
  canonicalUrl: string;

  operation: MarketOperation;
  housingType: MarketHousingType;
  status: MarketListingStatus;

  price: number | null;
  currency: string;
  pricePerMeter: number | null;

  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;

  city: string;
  zone: string | null;
  addressApprox: string | null;
  lat: number | null;
  lng: number | null;
  geohash: string | null;

  advertiserType: string | null;
  advertiserName: string | null;
  phones: string[];

  mainImageUrl: string | null;
  imageUrls: string[];

  qualityScore: number;
  qualityFlags: QualityFlag[];

  propertyId: string | null;

  firstSeenAt: string;
  lastSeenAt: string;
  lastChangeAt: string | null;
}

// ---------------------------------------------------------------------------
// Identidad cross-portal
// ---------------------------------------------------------------------------

/**
 * Insumos mínimos para calcular el fingerprint de identidad probable.
 * No incluye precio (puede variar entre portales/momentos).
 */
export interface PropertyFingerprintInput {
  city: string;
  zone: string | null;
  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;
  geohash: string | null;
  housingType: MarketHousingType;
  operation: MarketOperation;
  addressApprox: string | null;
}

export interface PropertySimilarityResult {
  /** Score [0, 1]; >= 0.90 → auto-merge, [0.70, 0.90) → revisión manual. */
  score: number;
  /** Desglose por dimensión, útil para debugging y UI de revisión. */
  components: {
    geo: number;
    area: number;
    rooms: number;
    bathrooms: number;
    floor: number;
    address: number;
    housingType: number;
  };
  /** Decisión sugerida según los umbrales del Core. */
  decision: "auto-merge" | "manual-review" | "no-merge";
}

// ---------------------------------------------------------------------------
// Calidad
// ---------------------------------------------------------------------------

export type QualityFlag =
  | "missing_price"
  | "invalid_price"
  | "missing_area"
  | "invalid_area"
  | "missing_location"
  | "missing_rooms"
  | "missing_images"
  | "blocked_source"
  | "stale_data";

export interface QualityResult {
  /** Score normalizado [0, 1]. */
  score: number;
  /** Flags activadas. Vacío si la calidad es perfecta. */
  flags: QualityFlag[];
}

// ---------------------------------------------------------------------------
// DTOs públicos para la API interna `/api/market/*`
// ---------------------------------------------------------------------------

export interface MarketListingDTO {
  id: string;
  source: MarketSource;
  externalId: string;
  canonicalUrl: string;

  operation: MarketOperation;
  housingType: MarketHousingType;
  status: MarketListingStatus;

  price: number | null;
  currency: string;
  pricePerMeter: number | null;

  builtArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string | null;

  city: string;
  zone: string | null;
  addressApprox: string | null;
  lat: number | null;
  lng: number | null;

  advertiserType: string | null;
  advertiserName: string | null;

  mainImageUrl: string | null;
  imageUrls: string[];

  qualityScore: number;
  qualityFlags: QualityFlag[];

  propertyId: string | null;

  firstSeenAt: string;
  lastSeenAt: string;
  lastChangeAt: string | null;
}

export interface MarketSnapshotEntryDTO {
  city: string;
  housingType: MarketHousingType;
  operation: MarketOperation;
  freshAt: string;
  totalActive: number;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  ppmMedian: number | null;
}

// ---------------------------------------------------------------------------
// Contratos del Worker externo (HTTP)
// ---------------------------------------------------------------------------

export interface CrawlSeedRequest {
  runId: string;
  source: MarketSource;
  operation: MarketOperation;
  url: string;
  cursor?: string;
  budgetMs: number;
  budgetRequests: number;
  traceId: string;
}

export type CrawlSeedResponse =
  | {
      status: "completed";
      itemsCaptured: number;
      pagesScanned: number;
      cursorOut?: string | null;
    }
  | {
      status: "accepted";
      reason: "BUDGET_EXCEEDED" | "BACKGROUND";
    }
  | {
      status: "blocked";
      reason: string;
    }
  | {
      status: "failed";
      errorCode: string;
      errorReason: string;
    };

export interface FetchDetailRequest {
  runId: string;
  source: MarketSource;
  canonicalUrl: string;
  externalId: string | null;
  budgetMs: number;
  traceId: string;
}

export type FetchDetailResponse =
  | { status: "completed"; raw: RawListing }
  | { status: "blocked"; reason: string }
  | { status: "failed"; errorCode: string; errorReason: string };

export interface WorkerHealthResponse {
  ok: boolean;
  uptimeSeconds: number;
  activeBrowsers: number;
  pendingJobs: number;
  version?: string;
}

// ---------------------------------------------------------------------------
// Eventos del Core (payloads tipados)
// ---------------------------------------------------------------------------

export interface MarketListingCreatedPayload {
  listing: CanonicalListing;
  detectedAt: string;
}

export interface MarketListingUpdatedPayload {
  before: Partial<CanonicalListing>;
  after: Partial<CanonicalListing>;
  changedFields: string[];
  detectedAt: string;
}

export interface MarketListingPriceChangedPayload {
  source: MarketSource;
  externalId: string;
  before: { price: number | null; pricePerMeter: number | null };
  after: { price: number | null; pricePerMeter: number | null };
  deltaAbs: number | null;
  deltaPct: number | null;
  detectedAt: string;
}

export interface MarketListingStatusChangedPayload {
  source: MarketSource;
  externalId: string;
  previousStatus: MarketListingStatus;
  newStatus: MarketListingStatus;
  detectedAt: string;
}

export interface MarketSnapshotRefreshedPayload {
  city: string;
  housingType: MarketHousingType;
  operation: MarketOperation;
  totalActive: number;
  freshAt: string;
}

// ---------------------------------------------------------------------------
// Reglas y alertas
// ---------------------------------------------------------------------------

export type MarketRuleKind =
  | "new_listing_in_zone"
  | "price_drop_relevant"
  | "listing_reappeared"
  | "private_advertiser_in_coverage";

export interface MarketRuleMatch {
  kind: MarketRuleKind;
  listingId: string;
  source: MarketSource;
  city: string;
  zone: string | null;
  details: Record<string, unknown>;
  matchedAt: string;
}
