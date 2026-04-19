-- AlterTable: add demandId to CommercialOperationFact for correct join with CommercialLeadFact
ALTER TABLE "commercial_operation_facts" ADD COLUMN IF NOT EXISTS "demandId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "commercial_operation_facts_demandId_idx" ON "commercial_operation_facts"("demandId");
