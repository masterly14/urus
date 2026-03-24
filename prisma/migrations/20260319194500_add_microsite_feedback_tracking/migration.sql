-- M6 Día 11: tracking de microsite y feedback del comprador

-- AlterEnum
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SELECCION_COMPRADOR';

-- CreateEnum
CREATE TYPE "MicrositeSelectionDecision" AS ENUM ('ME_INTERESA', 'NO_ME_ENCAJA');

-- AlterTable
ALTER TABLE "microsite_selections"
  ADD COLUMN IF NOT EXISTS "firstViewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastViewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "viewCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "microsite_selection_feedback" (
  "id" TEXT NOT NULL,
  "selectionId" TEXT NOT NULL,
  "propertyId" TEXT NOT NULL,
  "decision" "MicrositeSelectionDecision" NOT NULL,
  "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "microsite_selection_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "microsite_selection_feedback_selectionId_propertyId_key"
  ON "microsite_selection_feedback"("selectionId", "propertyId");

-- CreateIndex
CREATE INDEX "microsite_selection_feedback_selectionId_createdAt_idx"
  ON "microsite_selection_feedback"("selectionId", "createdAt");

-- AddForeignKey
ALTER TABLE "microsite_selection_feedback"
  ADD CONSTRAINT "microsite_selection_feedback_selectionId_fkey"
  FOREIGN KEY ("selectionId") REFERENCES "microsite_selections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
