-- AlterEnum (idempotent for partially migrated environments)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum enum
        JOIN pg_type type ON enum.enumtypid = type.oid
        WHERE type.typname = 'JobType'
          AND enum.enumlabel = 'EVALUATE_DEMAND_COVERAGE'
    ) THEN
        ALTER TYPE "JobType" ADD VALUE 'EVALUATE_DEMAND_COVERAGE';
    END IF;
END
$$;

-- AlterTable
ALTER TABLE "microsite_selections" ADD COLUMN IF NOT EXISTS "source" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "microsite_selections_demandId_source_createdAt_idx"
ON "microsite_selections"("demandId", "source", "createdAt");
