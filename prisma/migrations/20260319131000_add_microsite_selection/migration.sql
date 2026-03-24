-- M6: Microsite de selección (v1) — tabla + enum de estado

-- CreateEnum
CREATE TYPE "MicrositeSelectionStatus" AS ENUM ('PENDING_VALIDATION', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "microsite_selections" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "MicrositeSelectionStatus" NOT NULL DEFAULT 'PENDING_VALIDATION',
    "demandId" TEXT NOT NULL,
    "demandNombre" TEXT NOT NULL DEFAULT '',
    "comercialId" TEXT NOT NULL DEFAULT 'system',
    "statefoxQuery" JSONB NOT NULL,
    "resultFilters" JSONB NOT NULL,
    "properties" JSONB NOT NULL,
    "stockCount" INTEGER NOT NULL DEFAULT 0,
    "sourceEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "microsite_selections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "microsite_selections_token_key" ON "microsite_selections"("token");

-- CreateIndex
CREATE INDEX "microsite_selections_demandId_createdAt_idx" ON "microsite_selections"("demandId", "createdAt");

-- CreateIndex
CREATE INDEX "microsite_selections_token_idx" ON "microsite_selections"("token");

