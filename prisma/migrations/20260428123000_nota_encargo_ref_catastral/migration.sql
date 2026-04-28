ALTER TABLE "property_snapshots"
  ADD COLUMN IF NOT EXISTS "refCatastral" TEXT;

ALTER TABLE "properties_current"
  ADD COLUMN IF NOT EXISTS "refCatastral" TEXT;

ALTER TABLE "nota_encargo_sessions"
  ALTER COLUMN "propertyRef" DROP NOT NULL;

UPDATE "property_snapshots"
SET "refCatastral" = UPPER(REGEXP_REPLACE("raw"->>'rcatastral', '\s+', '', 'g'))
WHERE "refCatastral" IS NULL
  AND "raw" ? 'rcatastral'
  AND COALESCE(TRIM("raw"->>'rcatastral'), '') <> '';

UPDATE "properties_current" pc
SET "refCatastral" = ps."refCatastral"
FROM "property_snapshots" ps
WHERE pc."codigo" = ps."codigo"
  AND pc."refCatastral" IS NULL
  AND ps."refCatastral" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "properties_current_refCatastral_idx"
  ON "properties_current"("refCatastral");

CREATE INDEX IF NOT EXISTS "nota_encargo_sessions_refCatastral_idx"
  ON "nota_encargo_sessions"("refCatastral");
