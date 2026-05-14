-- ============================================================================
-- Core de Inteligencia de Mercado (Market*) — Fase 1 (DB + contratos)
-- Ver docs/core-sistema-mercado-plan-implementacion.md (Fase 1)
-- y docs/core-sistema-mercado-decisiones.md (alcance V1).
-- ============================================================================

-- CreateEnum
CREATE TYPE "MarketSource" AS ENUM ('source_a', 'source_b', 'source_c', 'source_d', 'unknown');

-- CreateEnum
CREATE TYPE "MarketOperation" AS ENUM ('sale', 'rent');

-- CreateEnum
CREATE TYPE "MarketHousingType" AS ENUM (
    'flat', 'house', 'countryhouse', 'duplex', 'penthouse', 'studio', 'loft',
    'garage', 'office', 'premises', 'land', 'building', 'storage', 'warehouse', 'room'
);

-- CreateEnum
CREATE TYPE "MarketListingStatus" AS ENUM ('active', 'inactive', 'removed', 'blocked', 'unknown');

-- CreateEnum
CREATE TYPE "CrawlRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RawListingStatus" AS ENUM ('CAPTURED', 'NORMALIZED', 'REJECTED', 'STALE');

-- CreateEnum
CREATE TYPE "MarketEventType" AS ENUM (
    'MARKET_LISTING_CREATED',
    'MARKET_LISTING_UPDATED',
    'MARKET_LISTING_PRICE_CHANGED',
    'MARKET_LISTING_STATUS_CHANGED',
    'MARKET_LISTING_REMOVED',
    'MARKET_LISTING_REAPPEARED',
    'MARKET_PROPERTY_MERGED',
    'MARKET_PROPERTY_SPLIT',
    'MARKET_SNAPSHOT_REFRESHED'
);

-- CreateEnum
CREATE TYPE "MarketCircuitBreakerStatus" AS ENUM ('CLOSED', 'OPEN', 'HALF_OPEN');

-- AlterEnum (JobType)
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_DISCOVER_SEEDS';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_CRAWL_SEED';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_FETCH_DETAIL';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_NORMALIZE_BATCH';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_RESOLVE_IDENTITY';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_DIFF_AND_VERSION';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_REFRESH_SNAPSHOT';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_RUN_RULES';
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_REINDEX_PROPERTY';

-- CreateTable: market_seeds
CREATE TABLE "market_seeds" (
    "id" TEXT NOT NULL,
    "source" "MarketSource" NOT NULL,
    "operation" "MarketOperation" NOT NULL,
    "city" TEXT NOT NULL,
    "zone" TEXT,
    "url" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "cadenceMinutes" INTEGER NOT NULL DEFAULT 120,
    "lastRunAt" TIMESTAMP(3),
    "lastCursor" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_seeds_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_seeds_source_operation_city_zone_url_key"
    ON "market_seeds"("source", "operation", "city", "zone", "url");
CREATE INDEX "market_seeds_active_lastRunAt_idx" ON "market_seeds"("active", "lastRunAt");
CREATE INDEX "market_seeds_source_active_idx" ON "market_seeds"("source", "active");

-- CreateTable: market_crawl_runs
CREATE TABLE "market_crawl_runs" (
    "id" TEXT NOT NULL,
    "seedId" TEXT NOT NULL,
    "source" "MarketSource" NOT NULL,
    "status" "CrawlRunStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "pagesScanned" INTEGER NOT NULL DEFAULT 0,
    "itemsCaptured" INTEGER NOT NULL DEFAULT 0,
    "itemsRejected" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "budgetMs" INTEGER NOT NULL DEFAULT 60000,
    "budgetRequests" INTEGER NOT NULL DEFAULT 50,
    "cursorIn" TEXT,
    "cursorOut" TEXT,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "market_crawl_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_crawl_runs_seedId_startedAt_idx" ON "market_crawl_runs"("seedId", "startedAt");
CREATE INDEX "market_crawl_runs_status_startedAt_idx" ON "market_crawl_runs"("status", "startedAt");
CREATE INDEX "market_crawl_runs_correlationId_idx" ON "market_crawl_runs"("correlationId");

ALTER TABLE "market_crawl_runs"
    ADD CONSTRAINT "market_crawl_runs_seedId_fkey"
    FOREIGN KEY ("seedId") REFERENCES "market_seeds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: market_raw_listings
CREATE TABLE "market_raw_listings" (
    "id" TEXT NOT NULL,
    "source" "MarketSource" NOT NULL,
    "externalId" TEXT,
    "canonicalUrl" TEXT NOT NULL,
    "crawlRunId" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "contentHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "RawListingStatus" NOT NULL DEFAULT 'CAPTURED',
    "rejectionReason" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_raw_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_raw_listings_source_contentHash_key"
    ON "market_raw_listings"("source", "contentHash");
CREATE INDEX "market_raw_listings_crawlRunId_idx" ON "market_raw_listings"("crawlRunId");
CREATE INDEX "market_raw_listings_source_externalId_idx" ON "market_raw_listings"("source", "externalId");
CREATE INDEX "market_raw_listings_status_capturedAt_idx" ON "market_raw_listings"("status", "capturedAt");

ALTER TABLE "market_raw_listings"
    ADD CONSTRAINT "market_raw_listings_crawlRunId_fkey"
    FOREIGN KEY ("crawlRunId") REFERENCES "market_crawl_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: market_properties (creada antes que market_listings por FK)
CREATE TABLE "market_properties" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zone" TEXT,
    "geohash" TEXT,
    "fingerprint" TEXT NOT NULL,
    "representativeListingId" TEXT,
    "listingsCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_properties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_properties_fingerprint_key" ON "market_properties"("fingerprint");
CREATE INDEX "market_properties_city_zone_idx" ON "market_properties"("city", "zone");
CREATE INDEX "market_properties_geohash_idx" ON "market_properties"("geohash");

-- CreateTable: market_listings
CREATE TABLE "market_listings" (
    "id" TEXT NOT NULL,
    "source" "MarketSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "operation" "MarketOperation" NOT NULL,
    "housingType" "MarketHousingType" NOT NULL,
    "status" "MarketListingStatus" NOT NULL DEFAULT 'active',
    "price" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "pricePerMeter" DOUBLE PRECISION,
    "builtArea" DOUBLE PRECISION,
    "rooms" INTEGER,
    "bathrooms" INTEGER,
    "floor" TEXT,
    "city" TEXT NOT NULL,
    "zone" TEXT,
    "addressApprox" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geohash" TEXT,
    "advertiserType" TEXT,
    "advertiserName" TEXT,
    "phones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mainImageUrl" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "qualityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "propertyId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_listings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_listings_source_externalId_key" ON "market_listings"("source", "externalId");
CREATE INDEX "market_listings_city_zone_idx" ON "market_listings"("city", "zone");
CREATE INDEX "market_listings_operation_housingType_idx" ON "market_listings"("operation", "housingType");
CREATE INDEX "market_listings_status_lastSeenAt_idx" ON "market_listings"("status", "lastSeenAt");
CREATE INDEX "market_listings_price_idx" ON "market_listings"("price");
CREATE INDEX "market_listings_propertyId_idx" ON "market_listings"("propertyId");
CREATE INDEX "market_listings_geohash_idx" ON "market_listings"("geohash");

ALTER TABLE "market_listings"
    ADD CONSTRAINT "market_listings_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "market_properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: market_listing_versions
CREATE TABLE "market_listing_versions" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "changedFields" TEXT[],
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_listing_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "market_listing_versions_listingId_capturedAt_idx"
    ON "market_listing_versions"("listingId", "capturedAt");

ALTER TABLE "market_listing_versions"
    ADD CONSTRAINT "market_listing_versions_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "market_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: market_events
CREATE TABLE "market_events" (
    "id" TEXT NOT NULL,
    "type" "MarketEventType" NOT NULL,
    "listingId" TEXT,
    "propertyId" TEXT,
    "source" "MarketSource",
    "payload" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "market_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_events_type_fingerprint_key" ON "market_events"("type", "fingerprint");
CREATE INDEX "market_events_type_occurredAt_idx" ON "market_events"("type", "occurredAt");
CREATE INDEX "market_events_listingId_occurredAt_idx" ON "market_events"("listingId", "occurredAt");
CREATE INDEX "market_events_propertyId_occurredAt_idx" ON "market_events"("propertyId", "occurredAt");
CREATE INDEX "market_events_correlationId_idx" ON "market_events"("correlationId");

-- CreateTable: market_snapshot_index
CREATE TABLE "market_snapshot_index" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "housingType" "MarketHousingType" NOT NULL,
    "operation" "MarketOperation" NOT NULL,
    "freshAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalActive" INTEGER NOT NULL DEFAULT 0,
    "priceMin" DOUBLE PRECISION,
    "priceMax" DOUBLE PRECISION,
    "priceMedian" DOUBLE PRECISION,
    "ppmMedian" DOUBLE PRECISION,

    CONSTRAINT "market_snapshot_index_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_snapshot_index_city_housingType_operation_key"
    ON "market_snapshot_index"("city", "housingType", "operation");
CREATE INDEX "market_snapshot_index_freshAt_idx" ON "market_snapshot_index"("freshAt");

-- CreateTable: market_circuit_breakers
CREATE TABLE "market_circuit_breakers" (
    "source" "MarketSource" NOT NULL,
    "status" "MarketCircuitBreakerStatus" NOT NULL DEFAULT 'CLOSED',
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "halfOpenAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_circuit_breakers_pkey" PRIMARY KEY ("source")
);
