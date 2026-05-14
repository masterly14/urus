-- ============================================================================
-- Image cache propio para MarketListing (paralelo a StatefoxComparableImage).
--
-- Statefox image cache (`lib/statefox/image-cache/`) ya hace lo equivalente
-- para Statefox: extrae imagenes vigentes del portal con Bright Data y las
-- sube a Cloudinary. Este modelo permite portar la misma capacidad a los
-- listings de Market sin acoplar el legacy de Statefox.
--
-- Patron de uso:
--   - Pricing/microsites que leen MarketListing detectan que un listing tiene
--     imageUrls del portal pero no contraparte Cloudinary.
--   - Encolan job MARKET_IMAGE_IMPORT (no incluido en esta migracion; se
--     define cuando el consumidor real exista).
--   - El job persiste rows aqui con cloudinarySecureUrl. Pricing las usa.
--
-- @see docs/statefox-deprecation.md
-- ============================================================================

CREATE TABLE "market_listing_images" (
  "id"                    TEXT NOT NULL,
  "listingId"             TEXT NOT NULL,
  "imageIndex"            INTEGER NOT NULL,
  "originalImageUrl"      TEXT NOT NULL,
  "originalImageSha256"   TEXT,
  "cloudinaryPublicId"    TEXT,
  "cloudinarySecureUrl"   TEXT,
  "width"                 INTEGER,
  "height"                INTEGER,
  "bytes"                 INTEGER,
  "format"                TEXT,
  "status"                TEXT NOT NULL DEFAULT 'PENDING',
  "errorReason"           TEXT,
  "attempts"              INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt"         TIMESTAMP(3),
  "importedAt"            TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,

  CONSTRAINT "market_listing_images_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_listing_images_listingId_imageIndex_key"
  ON "market_listing_images"("listingId", "imageIndex");

CREATE INDEX "market_listing_images_listingId_status_idx"
  ON "market_listing_images"("listingId", "status");

CREATE INDEX "market_listing_images_status_updatedAt_idx"
  ON "market_listing_images"("status", "updatedAt");

CREATE INDEX "market_listing_images_originalImageSha256_idx"
  ON "market_listing_images"("originalImageSha256");

ALTER TABLE "market_listing_images"
  ADD CONSTRAINT "market_listing_images_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "market_listings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
