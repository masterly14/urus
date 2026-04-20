-- FASE 2: persistir la URL de la foto principal (thumbnail) derivada del
-- payload REST para poder propagarla vía eventos hacia properties_current.

ALTER TABLE "property_snapshots"
  ADD COLUMN "mainPhotoUrl" TEXT;
