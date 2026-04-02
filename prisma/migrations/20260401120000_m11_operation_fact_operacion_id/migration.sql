-- AlterTable: add operacionId to commercial_operation_facts
ALTER TABLE "commercial_operation_facts" ADD COLUMN "operacionId" TEXT;

-- CreateIndex
CREATE INDEX "commercial_operation_facts_operacionId_idx" ON "commercial_operation_facts"("operacionId");
