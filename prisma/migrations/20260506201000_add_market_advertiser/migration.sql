-- ============================================================================
-- Fase 1 Captacion: cluster por publicante (MarketAdvertiser)
-- ============================================================================

-- AlterEnum (JobType)
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'MARKET_RESOLVE_ADVERTISER';

-- CreateTable
CREATE TABLE "market_advertisers" (
    "id" TEXT NOT NULL,
    "phoneCanonical" TEXT,
    "displayName" TEXT,
    "advertiserType" TEXT,
    "inmovillaContactId" TEXT,
    "listingsCount" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_advertisers_pkey" PRIMARY KEY ("id")
);

-- Unique parcial: permite multiples NULL y garantiza dedup por telefono canonico.
CREATE UNIQUE INDEX "MarketAdvertiser_phoneCanonical_key_unique"
    ON "market_advertisers"("phoneCanonical")
    WHERE "phoneCanonical" IS NOT NULL;

-- CreateIndex
CREATE INDEX "market_advertisers_advertiserType_lastSeenAt_idx"
    ON "market_advertisers"("advertiserType", "lastSeenAt");
CREATE INDEX "market_advertisers_displayName_idx"
    ON "market_advertisers"("displayName");

-- AlterTable
ALTER TABLE "market_listings"
    ADD COLUMN "advertiserId" TEXT;

-- CreateIndex
CREATE INDEX "market_listings_advertiserId_idx"
    ON "market_listings"("advertiserId");

-- AddForeignKey
ALTER TABLE "market_listings"
    ADD CONSTRAINT "market_listings_advertiserId_fkey"
    FOREIGN KEY ("advertiserId") REFERENCES "market_advertisers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
