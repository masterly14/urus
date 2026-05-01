-- CreateEnum
CREATE TYPE "VisitWorkItemStatus" AS ENUM ('INCOMPLETE', 'PENDING_SCHEDULE', 'SCHEDULED', 'COMPLETED', 'DECIDED_GREEN', 'DECIDED_YELLOW', 'DECIDED_RED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE 'VISITA_PRECREADA';

-- CreateTable
CREATE TABLE "visit_work_items" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "selectionId" TEXT NOT NULL DEFAULT '',
    "propertyId" TEXT NOT NULL,
    "propertySource" TEXT NOT NULL,
    "comercialId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL DEFAULT '',
    "buyerPhone" TEXT NOT NULL DEFAULT '',
    "propertySnapshot" JSONB NOT NULL,
    "contactSnapshot" JSONB NOT NULL,
    "nluSummary" TEXT NOT NULL DEFAULT '',
    "status" "VisitWorkItemStatus" NOT NULL DEFAULT 'PENDING_SCHEDULE',
    "scheduledSessionId" TEXT,
    "missingContactPhone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visit_work_items_demandId_selectionId_propertyId_key" ON "visit_work_items"("demandId", "selectionId", "propertyId");

-- CreateIndex
CREATE INDEX "visit_work_items_comercialId_status_idx" ON "visit_work_items"("comercialId", "status");

-- CreateIndex
CREATE INDEX "visit_work_items_demandId_idx" ON "visit_work_items"("demandId");

-- CreateIndex
CREATE INDEX "visit_work_items_selectionId_idx" ON "visit_work_items"("selectionId");

-- CreateIndex
CREATE INDEX "visit_work_items_propertyId_idx" ON "visit_work_items"("propertyId");
