-- ============================================================================
-- Captacion Blueprint: estados prospecto -> propiedad en MarketListing
-- ============================================================================

CREATE TYPE "MarketCaptacionStage" AS ENUM (
  'NEW',
  'PROSPECT_CREATING',
  'PROSPECT_CREATED',
  'ENCARGO_ATTACHED',
  'READY_FOR_PROPERTY',
  'PROPERTY_CREATING',
  'PROPERTY_CREATED',
  'FAILED'
);

ALTER TABLE "market_listings"
  ADD COLUMN "captacionStage" "MarketCaptacionStage" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "inmovillaProspectRef" TEXT,
  ADD COLUMN "inmovillaPropertyCodOfer" INTEGER,
  ADD COLUMN "captacionLastError" TEXT,
  ADD COLUMN "captacionUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "market_listings_captacionStage_lastSeenAt_idx"
  ON "market_listings"("captacionStage", "lastSeenAt");

CREATE INDEX "market_listings_inmovillaProspectRef_idx"
  ON "market_listings"("inmovillaProspectRef");

CREATE INDEX "market_listings_inmovillaPropertyCodOfer_idx"
  ON "market_listings"("inmovillaPropertyCodOfer");
