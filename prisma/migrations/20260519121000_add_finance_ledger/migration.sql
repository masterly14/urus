-- CreateEnum
CREATE TYPE "ExpenseCostType" AS ENUM ('FIJO', 'VARIABLE');

-- AlterTable
ALTER TABLE "expenses"
ADD COLUMN "costType" "ExpenseCostType" NOT NULL DEFAULT 'VARIABLE';

-- CreateTable
CREATE TABLE "income_entries" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "source" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "income_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_balances" (
  "id" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "openingBalanceEur" DECIMAL(12,2) NOT NULL,
  "notes" TEXT,
  "updatedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "treasury_balances_pkey" PRIMARY KEY ("id")
);

-- Backfill costType by expense category
UPDATE "expenses"
SET "costType" = CASE
  WHEN "category" IN ('alquiler', 'suministros', 'software', 'servicios_profesionales') THEN 'FIJO'::"ExpenseCostType"
  ELSE 'VARIABLE'::"ExpenseCostType"
END;

-- CreateIndex
CREATE INDEX "income_entries_period_occurredAt_idx" ON "income_entries"("period", "occurredAt");

-- CreateIndex
CREATE INDEX "income_entries_createdByUserId_idx" ON "income_entries"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_balances_period_key" ON "treasury_balances"("period");

-- CreateIndex
CREATE INDEX "treasury_balances_updatedByUserId_idx" ON "treasury_balances"("updatedByUserId");

-- AddForeignKey
ALTER TABLE "income_entries"
ADD CONSTRAINT "income_entries_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treasury_balances"
ADD CONSTRAINT "treasury_balances_updatedByUserId_fkey"
FOREIGN KEY ("updatedByUserId") REFERENCES "user"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
