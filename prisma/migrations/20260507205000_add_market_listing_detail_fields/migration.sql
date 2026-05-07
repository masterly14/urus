-- ============================================================================
-- Captacion: campos de detalle (descripcion, fotos, referencias) en listings.
--
-- A partir de mayo 2026 el worker hace un fetch interactivo del detalle
-- (click "Ver telefono") y persiste descripcion completa, todas las fotos
-- (URLs originales del portal), referencia del anuncio (codigo del
-- anunciante en el portal) y referencia catastral oficial cuando exista.
--
-- detailFetchedAt + detailFetchAttempts permiten saber si la ficha ya se
-- intento enriquecer (para skip en backfills) y limitar reintentos.
-- ============================================================================

ALTER TABLE "market_listings"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "listingReference" TEXT,
  ADD COLUMN "cadastralRef" TEXT,
  ADD COLUMN "detailFetchedAt" TIMESTAMP(3),
  ADD COLUMN "detailFetchAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "market_listings_listingReference_idx"
  ON "market_listings"("listingReference");

CREATE INDEX "market_listings_cadastralRef_idx"
  ON "market_listings"("cadastralRef");
