-- AlterTable (idempotent: columns may exist from a previous failed deploy)
ALTER TABLE "draft_properties" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "draft_properties" ADD COLUMN IF NOT EXISTS "price" DOUBLE PRECISION;
