-- Add main photo + portal link columns to properties_current.
-- These fields support the Smart Pricing list UI (visual identification +
-- direct link to the listing in the portal where it is published).
-- - mainPhotoUrl: se llena vía projection a partir de numagencia+cod_ofer+fotoletra
--   en el ciclo normal de ingestión de propiedades.
-- - portalUrl/portalName/portalSyncedAt: se llenan vía worker dedicado que consume
--   GET /propiedades/?extrainfo&cod_ofer= y prioriza Idealista.

ALTER TABLE "properties_current"
  ADD COLUMN "mainPhotoUrl" TEXT,
  ADD COLUMN "portalUrl" TEXT,
  ADD COLUMN "portalName" TEXT,
  ADD COLUMN "portalSyncedAt" TIMESTAMP(3);

CREATE INDEX "properties_current_portalSyncedAt_idx"
  ON "properties_current" ("portalSyncedAt");
