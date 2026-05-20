-- ============================================================================
-- Captacion oportunidades: trazabilidad de actor que envio prospecto.
-- ============================================================================

ALTER TABLE "market_listings"
  ADD COLUMN "captacionProspectSentByUserId" TEXT,
  ADD COLUMN "captacionProspectSentAt" TIMESTAMP(3);

CREATE INDEX "market_listings_captacionProspectSentByUserId_captacionProspectSentAt_idx"
  ON "market_listings"("captacionProspectSentByUserId", "captacionProspectSentAt");

ALTER TABLE "market_listings"
  ADD CONSTRAINT "market_listings_captacionProspectSentByUserId_fkey"
  FOREIGN KEY ("captacionProspectSentByUserId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
