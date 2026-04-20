-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'EVALUATE_DEMAND_COVERAGE';

-- AlterTable
ALTER TABLE "microsite_selections" ADD COLUMN     "source" TEXT;

-- CreateIndex
CREATE INDEX "microsite_selections_demandId_source_createdAt_idx" ON "microsite_selections"("demandId", "source", "createdAt");
