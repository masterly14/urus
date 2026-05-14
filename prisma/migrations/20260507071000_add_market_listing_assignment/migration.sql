-- ============================================================================
-- Captacion oportunidades: asignacion manual de listing a comercial.
-- ============================================================================

ALTER TABLE "market_listings"
  ADD COLUMN "assignedComercialId" TEXT,
  ADD COLUMN "assignedAt" TIMESTAMP(3),
  ADD COLUMN "assignedByUserId" TEXT;

CREATE INDEX "market_listings_assignedComercialId_lastSeenAt_idx"
  ON "market_listings"("assignedComercialId", "lastSeenAt");

CREATE INDEX "market_listings_assignedByUserId_idx"
  ON "market_listings"("assignedByUserId");

ALTER TABLE "market_listings"
  ADD CONSTRAINT "market_listings_assignedComercialId_fkey"
  FOREIGN KEY ("assignedComercialId") REFERENCES "comerciales"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "market_listings"
  ADD CONSTRAINT "market_listings_assignedByUserId_fkey"
  FOREIGN KEY ("assignedByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
